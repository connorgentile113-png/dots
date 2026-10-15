import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHmac } from 'node:crypto';
import { Engine } from '../server/engine.mjs';
import { MemoryStore } from '../server/store.mjs';
import { DeferredError,scheduleSpec,firstOccurrence,nextOccurrence,chooseModel,retrieveMemories,compactContext,encryptSnapshot,decryptSnapshot,retryAt } from '../server/core.mjs';
import { safeURL,Providers } from '../server/providers.mjs';
import { makeServer } from '../server/index.mjs';

const done=content=>({message:{role:'assistant',content},usage:{},truncated:false});
const tool=(name,args,id='tool1')=>({message:{role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]},truncated:false});
async function fixture(responses=[]){
  const store=new MemoryStore(),calls=[];
  const providers={models:[{id:'model-a',tools:true}],model:async(messages,model,options)=>{calls.push({messages,model,options});const response=responses.shift();if(response instanceof Error)throw response;return response||done('Verified result');},browser:async()=>({title:'Public source',text:'Evidence',url:'https://example.com'}),dispatchCommand:async()=>({status:'dispatched'}),backup:async()=>{}};
  const engine=new Engine(store,providers,{MAX_RUN_STEPS:'5'});
  await store.set('users/alice',{enabled:true});
  await store.set('users/alice/dots/default',{name:'Everyday',instructions:'Verify results',model:'auto',allowBrowser:true,allowSchedules:true,allowTerminal:true});
  return {store,providers,engine,calls};
}
async function run(f,id='run1',extra={}){await f.engine.newRun('alice',id,'Research a useful fact','default',extra);return f.store.get(`users/alice/runs/${id}`);}
async function queuedCommand(f,id,kind,payload={},uid='alice'){const c={id,kind,payload,uid,status:'pending'};await f.store.set(`commands/${id}`,c);await f.engine.command(c);return f.store.get(`commands/${id}`);}

test('an authenticated command creates a durable run and completes through the model',async()=>{
  const f=await fixture([done('Result with source')]);assert.equal((await queuedCommand(f,'c1','start',{prompt:'Research this'})).status,'done');
  await f.engine.runStep(await f.store.get('users/alice/runs/c1'));
  assert.equal((await f.store.get('users/alice/runs/c1')).status,'completed');
  assert.equal((await f.store.list('users/alice/messages')).filter(m=>m.role==='assistant')[0].content,'Result with source');
});
test('unapproved users cannot spend provider quota',async()=>{const f=await fixture();const c=await queuedCommand(f,'c1','start',{prompt:'task'},'mallory');assert.equal(c.status,'error');assert.equal(f.calls.length,0);});
test('replayed start commands create one run',async()=>{const f=await fixture();await queuedCommand(f,'c1','start',{prompt:'task'});await queuedCommand(f,'c1','start',{prompt:'task'});assert.equal((await f.store.list('users/alice/runs')).length,1);});
test('path traversal identifiers are rejected',async()=>{const f=await fixture();const c=await queuedCommand(f,'c1','cancel',{id:'../../bob'});assert.equal(c.status,'error');});
test('missed intervals coalesce and require a recovery decision',async()=>{
  const f=await fixture();const now=Date.now();await f.engine.createSchedule('alice','s1',{prompt:'Check updates',minutes:30});await f.store.set('users/alice/schedules/s1',{nextRunAt:now-3*3600000});
  await f.engine.dispatchSchedules(now);await f.engine.dispatchSchedules(now);
  const runs=await f.store.list('users/alice/runs');assert.equal(runs.length,1);assert.equal(runs[0].needsRecovery,true);assert.ok((await f.store.get('users/alice/schedules/s1')).nextRunAt>now);
});
test('schedule occurrence creation survives dispatcher retry before cursor update',async()=>{
  const f=await fixture();const now=Date.now();await f.engine.createSchedule('alice','s1',{prompt:'Check updates',minutes:30});const due=now-1000;await f.store.set('users/alice/schedules/s1',{nextRunAt:due});
  await f.engine.dispatchSchedules(now);await f.store.set('users/alice/schedules/s1',{nextRunAt:due});await f.engine.dispatchSchedules(now);assert.equal((await f.store.list('users/alice/runs')).length,1);
});
test('one-time schedules disable after dispatch',async()=>{const f=await fixture();const now=Date.now();await f.engine.createSchedule('alice','s1',{prompt:'One task',kind:'once',at:now+2000});await f.engine.dispatchSchedules(now+3000);assert.equal((await f.store.get('users/alice/schedules/s1')).enabled,false);});
test('cron enforces minimum interval and respects timezone',()=>{
  assert.throws(()=>scheduleSpec({kind:'cron',cron:'* * * * *'}),/30 minutes/);
  assert.throws(()=>scheduleSpec({minutes:1}),/30/);
  const spec=scheduleSpec({kind:'cron',cron:'0 9 * * *',timezone:'America/New_York'},Date.parse('2026-01-01T12:00:00Z'));
  assert.equal(new Date(firstOccurrence(spec,Date.parse('2026-01-01T12:00:00Z'))).toISOString(),'2026-01-01T14:00:00.000Z');
  assert.equal(nextOccurrence({kind:'once'},Date.now()),null);
});
test('NVIDIA rate limiting releases the lease and checkpoints a future recovery',async()=>{
  const until=Date.now()+100000;const f=await fixture([new DeferredError('Rate limited',until)]);await f.engine.runStep(await run(f));const r=await f.store.get('users/alice/runs/run1');assert.equal(r.status,'waiting');assert.equal(r.nextRunAt,until);assert.equal(r.leaseUntil,0);assert.equal(r.needsRecovery,true);
});
test('a recovery can stop expired work without executing tools',async()=>{
  const f=await fixture([done('{"decision":"stop","reason":"Expired reminder"}')]);await f.engine.runStep(await run(f,'run1',{needsRecovery:true}));assert.equal((await f.store.get('users/alice/runs/run1')).status,'failed');assert.equal(f.calls[0].options.recovery,true);
});
test('recovery continues once without resetting task step or failure budgets',async()=>{
  const f=await fixture([done('{"decision":"continue","reason":"New approach"}')]);await f.engine.runStep(await run(f,'run1',{needsRecovery:true,steps:3,failures:{old:2}}));const r=await f.store.get('users/alice/runs/run1');assert.equal(r.status,'queued');assert.equal(r.steps,3);assert.equal(r.failures.old,2);assert.equal(r.recoveries,1);
});
test('a truncated response never executes its tool calls',async()=>{
  const r=tool('browse',{url:'https://example.com'});r.truncated=true;const f=await fixture([r]);let calls=0;f.providers.browser=async()=>{calls++;};await f.engine.runStep(await run(f));const saved=await f.store.get('users/alice/runs/run1');assert.equal(calls,0);assert.equal(saved.status,'queued');assert.equal(saved.truncations,1);
});
test('repeated identical failing actions stop instead of looping forever',async()=>{
  const f=await fixture([tool('browse',{url:'https://example.com'}),tool('browse',{url:'https://example.com'}),tool('browse',{url:'https://example.com'})]);let calls=0;f.providers.browser=async()=>{calls++;throw new Error('Selector not found');};await run(f);
  for(let i=0;i<3;i++){await f.store.set('users/alice/runs/run1',{nextRunAt:0});await f.engine.runStep(await f.store.get('users/alice/runs/run1'));}
  const saved=await f.store.get('users/alice/runs/run1');assert.equal(calls,2);assert.equal(saved.status,'failed');assert.match(saved.lastError,/Repeated identical/);
});
test('tool permissions are enforced independently of model instructions',async()=>{
  const f=await fixture([tool('browse',{url:'https://example.com'})]);await f.store.set('users/alice/dots/default',{allowBrowser:false});let calls=0;f.providers.browser=async()=>{calls++;};await f.engine.runStep(await run(f));assert.equal(calls,0);assert.match((await f.store.get('users/alice/runs/run1')).context.at(-1).content,/disabled/);
});
test('terminal commands require approval, dispatch once, and accept one result',async()=>{
  const f=await fixture([tool('terminal',{command:'echo hello',reason:'Test output'})]);let dispatches=0;f.providers.dispatchCommand=async()=>{dispatches++;};await f.engine.runStep(await run(f));let r=await f.store.get('users/alice/runs/run1');assert.equal(r.status,'waiting_approval');assert.equal(dispatches,0);
  const op=r.operationId;await queuedCommand(f,'approval1','approve',{id:op,allow:true});await queuedCommand(f,'approval2','approve',{id:op,allow:true});assert.equal(dispatches,1);
  const body={uid:'alice',run_id:'run1',operation_id:op,exit_code:0,output:'hello'};assert.equal(await f.engine.commandResult(body),true);assert.equal(await f.engine.commandResult(body),false);r=await f.store.get('users/alice/runs/run1');assert.equal(r.status,'queued');assert.match(r.context.at(-1).content,/hello/);
});
test('uncertain terminal dispatch is never automatically retried',async()=>{
  const f=await fixture([tool('terminal',{command:'echo hello',reason:'test'})]);f.providers.dispatchCommand=async()=>{throw new Error('Network interrupted');};await f.engine.runStep(await run(f));const r=await f.store.get('users/alice/runs/run1');await queuedCommand(f,'approve','approve',{id:r.operationId,allow:true});assert.equal((await f.store.get('users/alice/runs/run1')).status,'failed');assert.equal((await queuedCommand(f,'resume','resume',{id:'run1'})).status,'error');
});
test('only one worker can hold a run lease',async()=>{
  let release;const f=await fixture();f.providers.model=()=>new Promise(resolve=>{release=()=>resolve(done('done'));});const r=await run(f);const first=f.engine.runStep(r);while(!release)await new Promise(resolve=>setImmediate(resolve));const other=new Engine(f.store,f.providers,{});await other.runStep(r);release();await first;assert.equal((await f.store.get('users/alice/runs/run1')).steps,1);
});
test('cancel during an in-flight model request prevents tool execution',async()=>{
  let release;const f=await fixture();f.providers.model=()=>new Promise(resolve=>{release=()=>resolve(tool('browse',{url:'https://example.com'}));});let toolCalls=0;f.providers.browser=async()=>{toolCalls++;};const first=f.engine.runStep(await run(f));while(!release)await new Promise(resolve=>setImmediate(resolve));await queuedCommand(f,'cancel','cancel',{id:'run1'});release();await first;assert.equal(toolCalls,0);assert.equal((await f.store.get('users/alice/runs/run1')).status,'cancelled');
});
test('interrupted tools get an unknown-outcome record before recovery',async()=>{
  const f=await fixture([done('{"decision":"stop","reason":"Cannot verify external effect"}')]);const pending=tool('browse',{url:'https://example.com'}).message;await f.engine.runStep(await run(f,'run1',{status:'running',leaseUntil:0,context:[pending]}));const r=await f.store.get('users/alice/runs/run1');assert.equal(r.status,'failed');assert.match(r.context.at(-1).content,/outcome is unknown/);
});
test('memory retrieval isolates relevance and expiry; context preserves tool groups',()=>{
  const results=retrieveMemories([{text:'User prefers Python',source:'user',createdAt:1},{text:'Old Python preference',expiresAt:1},{text:'Favourite food',createdAt:2}], 'Write Python code');assert.equal(results.length,1);
  const h=[{role:'user',content:'x'.repeat(1000)},{role:'assistant',tool_calls:[{id:'a'}]},{role:'tool',tool_call_id:'a',content:'result'}];const c=compactContext(h,300);assert.equal(c.length,2);assert.equal(c[0].role,'assistant');
});
test('routing respects pinned models and rejects unknown selections',()=>{const models=[{id:'fast',tools:true,fast:true},{id:'coder',tools:true,coding:true}];assert.equal(chooseModel(models,'auto','debug code').id,'coder');assert.equal(chooseModel(models,'fast','debug code').id,'fast');assert.throws(()=>chooseModel(models,'unknown','task'));});
test('encrypted backups authenticate content and do not reveal user data',()=>{const key=randomBytes(32).toString('base64'),snapshot={secret:'private preference'};const encrypted=encryptSnapshot(snapshot,key);assert.ok(!JSON.stringify(encrypted).includes('private preference'));assert.deepEqual(decryptSnapshot(encrypted,key),snapshot);encrypted.tag=randomBytes(16).toString('base64');assert.throws(()=>decryptSnapshot(encrypted,key));});
test('browser destinations reject local addresses, credentials and mixed DNS results',async()=>{
  for(const url of ['http://example.com','https://localhost','https://127.0.0.1','https://169.254.169.254','https://[::1]','https://user:pass@example.com'])await assert.rejects(()=>safeURL(url));
  await assert.rejects(()=>safeURL('https://example.com',async()=>[{address:'93.184.216.34'},{address:'10.0.0.1'}]));assert.equal(await safeURL('https://example.com',async()=>[{address:'93.184.216.34'}]),'https://example.com/');
});
test('provider 429 respects retry-after and shares cooldown across model calls',async()=>{
  const store=new MemoryStore();let requests=0;const providers=new Providers(store,{NVIDIA_API_KEY:'test-only',DAILY_MODEL_CALLS:'10'},async()=>{requests++;return new Response('{}',{status:429,headers:{'Retry-After':'120'}});});
  await assert.rejects(()=>providers.model([],'model'),DeferredError);await assert.rejects(()=>providers.model([],'other-model'),DeferredError);assert.equal(requests,1);assert.ok((await store.get('system/nvidia')).until>Date.now()+110000);
});
test('retry dates are parsed without inventing a reset time',()=>{const now=Date.now();assert.equal(retryAt(new Headers({'Retry-After':'60'}),0,now),now+60000);assert.ok(retryAt(new Headers(),2,now,()=>0)>now+60000);});
test('GitHub backups refuse public repositories',async()=>{const p=new Providers(new MemoryStore(),{GITHUB_TOKEN:'test',GITHUB_REPOSITORY:'owner/repo',BACKUP_KEY_BASE64:randomBytes(32).toString('base64'),GITHUB_BACKUP_ENABLED:'true'},async()=>new Response(JSON.stringify({private:false,default_branch:'main'})));await assert.rejects(()=>p.backup({test:true}),/private/);});
test('HTTP wake rejects unauthenticated requests and accepts signed fresh requests',async t=>{
  let count=0;const server=makeServer({tick:async()=>{count++;}}, {GITHUB_WAKE_SECRET:'test-secret'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const url=`http://127.0.0.1:${server.address().port}/wake`;
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
  const stamp=String(Date.now()),signature=createHmac('sha256','test-secret').update(stamp).digest('hex');assert.equal((await fetch(url,{method:'POST',body:'{}',headers:{'X-Dots-Time':stamp,'X-Dots-Signature':signature}})).status,202);assert.equal(count,1);
});
