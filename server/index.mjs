import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { FirestoreStore } from './store.mjs';
import { Providers } from './providers.mjs';
import { Engine } from './engine.mjs';
import { identifier } from './core.mjs';

export function equalToken(a,b) { return typeof a==='string' && typeof b==='string' && a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b)); }
export function makeServer(engine, env = process.env) {
  return http.createServer(async (req,res)=> {
    res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
    const reply=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
    if(req.url==='/health' && req.method==='GET') return reply(200,{ok:true,service:'dots-worker'});
    if(req.method!=='POST' || !['/wake','/command-result','/command-output'].includes(req.url)) return reply(404,{error:'Not found'});
    let raw='';
    try {
      for await(const chunk of req) { raw+=chunk; if(Buffer.byteLength(raw)>64000) return reply(413,{error:'Payload too large'}); }
      if(!env.GITHUB_WAKE_SECRET) return reply(503,{error:'Worker authentication is not configured'});
      if(req.url==='/wake') {
        const timestamp=req.headers['x-dots-time'], signature=req.headers['x-dots-signature'];
        if(!timestamp || Math.abs(Date.now()-Number(timestamp))>300000) return reply(401,{error:'Expired request'});
        const expected=createHmac('sha256',env.GITHUB_WAKE_SECRET).update(timestamp).digest('hex');
        if(!equalToken(signature,expected)) return reply(401,{error:'Unauthorized'});
        engine.tick().catch(e=>console.error('Worker tick failed:',e.code || e.name));
        return reply(202,{accepted:true});
      }
      const body=JSON.parse(raw), uid=identifier(body.uid), runId=identifier(body.run_id), op=identifier(body.operation_id);
      const expected=createHmac('sha256',env.GITHUB_WAKE_SECRET).update(`${uid}:${runId}:${op}`).digest('hex');
      if(!equalToken(req.headers['x-dots-token'],expected)) return reply(401,{error:'Unauthorized'});
      if(req.url==='/command-output') {
        const run=await engine.store.get(`users/${uid}/runs/${runId}`);
        if(!run || run.status!=='waiting_external' || run.operationId!==op) return reply(409,{error:'Run is not accepting output'});
        await engine.store.atomic(`users/${uid}/streams/${runId}`,s=>(s?.sequence||0)>=Number(body.sequence)?{result:false}:{value:{kind:'terminal',sequence:Number(body.sequence),output:String(body.output||'').slice(-18000),active:true,updatedAt:Date.now()},result:true});
        return reply(200,{accepted:true});
      }
      const accepted=await engine.commandResult(body); reply(200,{accepted});
      if(accepted) engine.tick().catch(e=>console.error('Continuation failed:',e.code || e.name));
    } catch { reply(400,{error:'Invalid request or unavailable storage'}); }
  });
}

export function start(env=process.env) {
  if(!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON to the service account JSON in Koyeb secrets');
  const account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if(account.project_id!==env.FIREBASE_PROJECT_ID) throw new Error('Service account and Firebase project do not match');
  initializeApp({credential:cert(account),projectId:env.FIREBASE_PROJECT_ID});
  const db=getFirestore(); db.settings({ignoreUndefinedProperties:true});
  const store=new FirestoreStore(db), providers=new Providers(store,env), engine=new Engine(store,providers,env);
  engine.ensureOwner=async()=>{
    if(!env.OWNER_EMAIL) return;
    try {
      const user=await getAuth().getUserByEmail(env.OWNER_EMAIL);
      if(user.emailVerified && !user.disabled) await store.set(`users/${user.uid}`,{enabled:true});
    } catch(e) { if(e.code!=='auth/user-not-found') throw e; }
  };
  const server=makeServer(engine,env);
  server.listen(Number(env.PORT||8000),'0.0.0.0',()=>console.log('Dots worker listening'));
  const timer=setInterval(()=>engine.tick().catch(e=>console.error('Worker scan failed:',e.code || e.name)),30000);
  engine.tick().catch(e=>console.error('Initial scan failed:',e.code || e.name));
  process.on('SIGTERM',()=>{clearInterval(timer);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
  return {server,engine};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) start();
