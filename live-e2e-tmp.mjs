import { initializeApp,cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFile } from 'node:fs/promises';
import config from './firebase-config.json' with {type:'json'};
const account=JSON.parse(await readFile(process.env.HOME+'/.dots-secrets/service-account.json','utf8'));
initializeApp({credential:cert(account),projectId:'dots-300de'});
const uid='fT0u9SDsXkgIEnoeX3ssIQilnfo1';
const DB='projects/dots-300de/databases/(default)';
const base=`https://firestore.googleapis.com/v1/${DB}/documents`;

// 1. Sign in as the owner through the real client path (custom token -> ID token).
const custom=await getAuth().createCustomToken(uid);
const signIn=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${config.apiKey}`,{method:'POST',body:JSON.stringify({token:custom,returnSecureToken:true})});
const {idToken}=await signIn.json();
console.log('client sign-in:',idToken?'ok':'failed');
const clientAuth={Authorization:'Bearer '+idToken};

const toValue=v=>typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(toValue)}}:typeof v==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,toValue(x)]))}}:{stringValue:String(v)};
const commit=async(writes)=>{const r=await fetch(`https://firestore.googleapis.com/v1/${DB}/documents:commit`,{method:'POST',headers:{...clientAuth,'Content-Type':'application/json'},body:JSON.stringify({writes})});const body=await r.json();if(!r.ok)throw new Error('commit failed '+r.status+' '+JSON.stringify(body).slice(0,300));return body;};
const start=async(id,prompt,threadId)=>{await commit([{update:{name:`${DB}/documents/commands/${id}`,fields:{uid:toValue(uid),kind:toValue('start'),status:toValue('pending'),payload:toValue({prompt,dotId:'default',threadId,source:'chat'})}},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}]);};
const readDoc=async path=>{const r=await fetch(`${base}/${path}`,{headers:clientAuth});if(!r.ok)return {error:r.status};return (await r.json());};
const fromValue=v=>v?.integerValue!==undefined?Number(v.integerValue):v?.stringValue??v?.booleanValue??(v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,fromValue(x)])):undefined)??(v?.arrayValue?.values||[]).map(fromValue);
const flat=doc=>Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,fromValue(v)]));

// 2. A chat message must be accepted by the live rules and then run for real.
const id=`live_${Date.now()}`;
await start(id,'In one short sentence, say hello and tell me which day it is today.','live-thread-a');
console.log('command accepted by live rules:',id);
let run=null;
for(let i=0;i<40;i++){
  await new Promise(r=>setTimeout(r,4000));
  const doc=await readDoc(`users/${uid}/runs/${id}`);
  if(doc.error){console.log('run read error',doc.error);continue;}
  run=flat(doc);
  if(['completed','failed','cancelled'].includes(run.status))break;
}
console.log('run status:',run?.status,'| model:',run?.model,'| reason:',run?.modelReason,'| steps:',run?.steps);
if(run?.lastError)console.log('run error:',run.lastError);
console.log('answer:',String(run?.result||'').slice(0,400).replace(/\n/g,' / '));

// 3. A follow-up in the same thread must carry the earlier answer as context.
const id2=`live_${Date.now()}_b`;
await start(id2,'Now say that again in French.','live-thread-a');
let run2=null;
for(let i=0;i<40;i++){
  await new Promise(r=>setTimeout(r,4000));
  const doc=await readDoc(`users/${uid}/runs/${id2}`);
  if(doc.error)continue;
  run2=flat(doc);
  if(['completed','failed','cancelled'].includes(run2.status))break;
}
console.log('thread follow-up:',run2?.status,'| threadId:',run2?.threadId,'| context messages:',run2?.context?.length);
console.log('context carries the first question:',JSON.stringify(run2?.context||[]).includes('which day it is today'));
console.log('follow-up answer:',String(run2?.result||'').slice(0,300).replace(/\n/g,' / '));
