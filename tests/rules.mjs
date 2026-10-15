import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc,setDoc,getDoc,updateDoc,collection,query,where,getDocs,serverTimestamp } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
const env=await initializeTestEnvironment({projectId:'demo-dots',firestore:{host:'127.0.0.1',port:8088,rules:await readFile('firestore.rules','utf8')}});
let checks=0;
async function allowed(p){await assertSucceeds(p);checks++;}
async function denied(p){await assertFails(p);checks++;}
try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'users/alice'),{enabled:true});await setDoc(doc(db,'users/bob'),{enabled:true});
    await setDoc(doc(db,'users/alice/memories/one'),{text:'Private memory'});
    await setDoc(doc(db,'users/alice/connections/providers'),{nvidia:true});
    await setDoc(doc(db,'serverPrivate/credentials'),{secret:'test-only'});
    await setDoc(doc(db,'users/alice/private/credentials'),{secret:'test-only'});
  });
  const alice=env.authenticatedContext('alice').firestore(),bob=env.authenticatedContext('bob').firestore(),pending=env.authenticatedContext('pending').firestore(),anon=env.unauthenticatedContext().firestore();
  await allowed(getDoc(doc(alice,'users/alice/memories/one')));
  await allowed(getDoc(doc(alice,'users/alice/connections/providers')));
  await denied(getDoc(doc(bob,'users/alice/memories/one')));
  await denied(getDoc(doc(anon,'users/alice/memories/one')));
  await denied(getDoc(doc(alice,'serverPrivate/credentials')));
  await denied(getDoc(doc(alice,'users/alice/private/credentials')));
  await denied(setDoc(doc(alice,'users/alice'),{enabled:true,admin:true}));
  await denied(setDoc(doc(alice,'users/alice/runs/injected'),{status:'completed'}));
  const command={uid:'alice',kind:'start',payload:{prompt:'A task'},status:'pending',createdAt:serverTimestamp()};
  await allowed(setDoc(doc(alice,'commands/valid'),command));
  await denied(setDoc(doc(bob,'commands/spoof'),command));
  await denied(setDoc(doc(pending,'commands/unapproved'),{...command,uid:'pending'}));
  await denied(setDoc(doc(anon,'commands/anonymous'),command));
  await denied(setDoc(doc(alice,'commands/injected'),{...command,status:'done'}));
  await denied(setDoc(doc(alice,'commands/extra'),{...command,admin:true}));
  await denied(setDoc(doc(alice,'commands/old'),{...command,createdAt:1}));
  await denied(updateDoc(doc(alice,'commands/valid'),{payload:{prompt:'Changed'}}));
  await allowed(getDocs(query(collection(alice,'commands'),where('uid','==','alice'))));
  await denied(getDocs(collection(alice,'commands')));
  await denied(getDoc(doc(bob,'commands/valid')));
  console.log(`PASS: ${checks} Firestore emulator authorization checks, including tenant isolation, immutable commands, private data, timestamps and account enablement.`);
}finally{await env.cleanup();}
