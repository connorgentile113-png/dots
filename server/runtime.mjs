import { initializeApp,cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { FirestoreStore } from './store.mjs';
import { Providers } from './providers.mjs';
import { Engine } from './engine.mjs';
export function runtime(env=process.env) {
  if(env.DOTS_PROVIDER_CONFIG) Object.assign(env,JSON.parse(env.DOTS_PROVIDER_CONFIG));
  const account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  if(account.project_id!==env.FIREBASE_PROJECT_ID) throw new Error('Firebase project/credential mismatch');
  initializeApp({credential:cert(account),projectId:env.FIREBASE_PROJECT_ID});
  const db=getFirestore();db.settings({ignoreUndefinedProperties:true,preferRest:env.FIRESTORE_PREFER_REST==='true'});
  const store=new FirestoreStore(db),providers=new Providers(store,env),engine=new Engine(store,providers,env);
  engine.ensureOwner=async()=>{
    if(!env.OWNER_EMAIL)return;
    try {const user=await getAuth().getUserByEmail(env.OWNER_EMAIL);if(user.emailVerified&&!user.disabled)await store.set(`users/${user.uid}`,{enabled:true});}
    catch(e){if(e.code!=='auth/user-not-found')throw e;}
  };
  return {db,store,providers,engine};
}
