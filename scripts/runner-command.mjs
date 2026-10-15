import { spawn,execFileSync } from 'node:child_process';
import { mkdtemp,writeFile,chmod,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { runtime } from '../server/runtime.mjs';
import { identifier } from '../server/core.mjs';
import { equalToken } from '../server/index.mjs';
const {db,store,engine}=runtime();
const uid=identifier(process.env.TASK_UID),runId=identifier(process.env.TASK_RUN_ID),op=identifier(process.env.TASK_OPERATION_ID);
const signature=createHmac('sha256',process.env.GITHUB_WAKE_SECRET).update(`${uid}:${runId}:${op}`).digest('hex');
if(!equalToken(signature,process.env.TASK_CALLBACK_TOKEN))throw new Error('Invalid task signature');
const run=await store.get(`users/${uid}/runs/${runId}`);
if(!run||run.operationId!==op||run.status!=='waiting_external')throw new Error('Task not awaiting this command');
const approval=await store.get(`users/${uid}/approvals/${op}`);
const script=Buffer.from(process.env.TASK_SCRIPT,'base64').toString();
if(!approval||approval.command!==script||!['dispatching','dispatched'].includes(approval.status))throw new Error('Command does not match approval');
const dir=await mkdtemp(join(tmpdir(),'dots-command-'));let output='',sequence=0,exitCode=1,timer,kill;
const publish=()=>store.set(`users/${uid}/streams/${runId}`,{kind:'terminal',output:output.slice(-18000),sequence:++sequence,active:true,updatedAt:Date.now()});
try {
  execFileSync('docker',['pull','python:3.12-slim'],{stdio:'ignore',timeout:75000});
  await chmod(dir,0o755);await writeFile(join(dir,'task.sh'),script,{mode:0o444});
  const child=spawn('docker',['run','--rm','--name',`dots-${op}`,'--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--cpus','1','--pids-limit','64','--user','65534:65534','--read-only','--tmpfs','/tmp:rw,nosuid,size=64m','-v',`${join(dir,'task.sh')}:/task.sh:ro`,'-w','/tmp','python:3.12-slim','sh','/task.sh'],{stdio:['ignore','pipe','pipe']});
  const record=chunk=>{output=(output+chunk.toString()).slice(-18000);};child.stdout.on('data',record);child.stderr.on('data',record);
  timer=setInterval(()=>publish().catch(()=>{}),10000);
  kill=setTimeout(()=>{try{execFileSync('docker',['kill',`dots-${op}`],{stdio:'ignore',timeout:10000});}catch{}child.kill();output+='\n[Execution time limit]';},120000);
  exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code ?? 1));});
}catch(e){output+=`\nRunner error: ${e.name}`;}
finally{
  clearInterval(timer);clearTimeout(kill);await rm(dir,{recursive:true,force:true});
  await engine.commandResult({uid,run_id:runId,operation_id:op,output,exit_code:exitCode});
  await db.terminate();
}
