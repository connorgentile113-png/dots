import { runtime } from '../server/runtime.mjs';
const {db,store,engine}=runtime();
const deadline=Date.now()+90000;
const hardStop=setTimeout(()=>process.exit(0),110000);
try {
  await engine.tick();
  while(Date.now()<deadline) {
    const due=await store.query('runs',[['status','in',['queued','waiting']],['nextRunAt','<=',Date.now()]],1,true);
    if(!due.length)break;
    await engine.tick();
  }
  console.log('Scheduled worker finished; unfinished work remains checkpointed.');
}catch(e){console.error('Worker failed:',e.code || e.name);process.exitCode=1;}
finally{clearTimeout(hardStop);await db.terminate();}
