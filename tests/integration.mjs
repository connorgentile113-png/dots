import assert from 'node:assert/strict';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreStore } from '../server/store.mjs';
import { Engine } from '../server/engine.mjs';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8088';
const app=initializeApp({projectId:'demo-dots'},'integration'),db=getFirestore(app),store=new FirestoreStore(db);
let modelCalls=0;
const provider={models:[{id:'test-model',tools:true}],catalog:()=>[{id:'test-model',label:'test-model',note:'',tags:[],tools:true}],model:async()=>{modelCalls++;return {message:{role:'assistant',content:'Integration result: scheduled task processed from a durable Firestore record.'},usage:{},truncated:false};}};
const engine=new Engine(store,provider,{});
try{
  await db.recursiveDelete(db.collection('commands'));
  await db.recursiveDelete(db.collection('users'));
  await db.recursiveDelete(db.collection('system'));
  await store.set('users/integration',{enabled:true});
  await store.set('users/integration/dots/default',{name:'Test',instructions:'Test',model:'auto',allowBrowser:false,createdAt:Date.now()});
  const id=`test${Date.now()}`;
  await store.set(`commands/${id}`,{uid:'integration',kind:'start',payload:{prompt:'Run integration check'},status:'pending',createdAt:Date.now()});
  await engine.tick();
  assert.equal((await store.get(`commands/${id}`)).status,'done');
  const result=await store.get(`users/integration/runs/${id}`);
  assert.equal(result.status,'completed');assert.match(result.result,/Integration result/);assert.equal(modelCalls,1);
  const other=new Engine(store,provider,{});await other.tick();assert.equal(modelCalls,1,'Restarted worker must not replay a completed task');
  console.log('PASS: real Firestore emulator command ingestion, transactions, collection-group dispatch, completion, and restart deduplication. External model response is a test double.');
}finally{await db.terminate();await deleteApp(app);}
