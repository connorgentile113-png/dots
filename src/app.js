import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { getFirestore, collection, doc, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { renderMarkdown, escapeHtml as escape } from './markdown.js';
import config from '../firebase-config.json';

const $=s=>document.querySelector(s);
const icons={
  home:'<path d="m3 9 9-6 9 6v11H3Z"/><path d="M9 20v-7h6v7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', arrow:'<path d="M12 19V5m-6 6 6-6 6 6"/>',
  right:'<path d="m9 5 7 7-7 7"/>', diagonal:'<path d="M6 18 18 6M7 6h11v11"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',memory:'<path d="M9 4a4 4 0 0 0-6 4 4 4 0 0 0 0 7 4 4 0 0 0 6 5m6-16a4 4 0 0 1 6 4 4 4 0 0 1 0 7 4 4 0 0 1-6 5M9 3v18m6-18v18M5 9h4m6 6h4"/>',
  link:'<path d="m9 15 6-6m-6 8-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-2 2" transform="translate(1 0) scale(.9)"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  check:'<path d="m5 12 4 4L19 6"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--sidebar)"/><circle cx="15" cy="17" r="3" fill="var(--sidebar)"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 4 12 8-12 8Z"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  terminal:'<path d="m5 7 5 5-5 5m8 0h6"/>',dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  cursor:'<path d="M3 2 19 12l-8 1-4 8Z"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  wand:'<path d="m4 20 10-10m-4-5 1 3 3 1-3 1-1 3-1-3-3-1 3-1ZM17 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
  branch:'<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 7.5v9M8.5 5h4a2 2 0 0 1 2 2v3m0 4v-2"/>',
  send:'<path d="M4 12 20 4l-6 16-3-6Z"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.sparkle}</svg>`;
const app=$('#app'), dialog=$('#dialog');
const fallbackCatalog=[
  {id:'nvidia/nemotron-3.5-lightning-30b-a3b',label:'Nemotron 3.5 Lightning',note:'Fast all-rounder. The safe default for everyday chats and tools.',tags:['tool calls','fast']},
  {id:'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',label:'Nemotron 3 Nano Omni',note:'Small reasoning model for planning and careful analysis.',tags:['tool calls','reasoning']},
  {id:'nvidia/nemotron-3-super-120b-a12b',label:'Nemotron 3 Super 120B',note:'Stronger judgement on multi-step work.',tags:['tool calls','reasoning']},
  {id:'nvidia/nemotron-3-ultra-550b-a55b',label:'Nemotron 3 Ultra 550B',note:'Deepest reasoning for hard planning. The slowest option.',tags:['tool calls','reasoning','slow']},
  {id:'z-ai/glm-5.3',label:'GLM 5.3',note:'Capable general model with dependable tool calls.',tags:['tool calls','balanced']},
  {id:'z-ai/glm-5.3-flash',label:'GLM 5.3 Flash',note:'Lighter general model. Cold starts can be slow.',tags:['tool calls','slow']},
  {id:'openai/gpt-oss-20b',label:'GPT-OSS 20B',note:'Compact open-weight model for short, simple tasks.',tags:['tool calls','fast']},
  {id:'meta/muse-glimmer-30b',label:'Muse Glimmer 30B',note:'Comfortable with writing, summaries and wording.',tags:['tool calls','writing']},
  {id:'stepfun-ai/step-5-preview',label:'Step 5 Preview',note:'Preview model. Behaviour may change without notice.',tags:['tool calls','preview']}
];
const freshBuilder=()=>({step:1,name:'',purpose:'',template:'',browser:true,terminal:false,autoApprove:false,schedules:true,spawn:true,model:'auto',minutes:30,startup:true});
const templates=[{id:'research',name:'Research companion',instructions:'Research the user’s topic using public sources. Compare the evidence, cite source URLs, and distinguish facts from uncertainty.',description:'Find the signal. Bring back a clearer picture.',purpose:'Track a topic across public sources, weigh the evidence and report what changed, with links.',icon:'search',allowBrowser:true,minutes:1440},{id:'planner',name:'Thoughtful planner',instructions:'Turn a goal into a useful, realistic plan. Use memory for user preferences, and ask only for details that truly block progress.',description:'Turn a big idea into a few good next steps.',purpose:'Turn goals into a short, realistic plan and keep it up to date as the week moves.',icon:'sparkle',allowBrowser:true,minutes:1440},{id:'builder',name:'Code companion',instructions:'Explain and test small programs. Verify command results. Never claim tests passed unless a tool confirms it.',description:'A fresh pair of eyes for your next build.',purpose:'Review small programs, run safe checks in the sandbox and report what actually passed.',icon:'code',allowTerminal:true,minutes:0},{id:'watcher',name:'Watcher',instructions:'Watch the thing the user cares about and report only meaningful changes.',description:'Notice changes so you do not have to.',purpose:'Check a page or price every half hour and report only meaningful changes.',icon:'activity',allowBrowser:true,minutes:30}];
const state={demo:new URLSearchParams(location.search).has('demo'),user:null,profile:{},page:'home',dots:[],runs:[],schedules:[],memories:[],messages:[],approvals:[],usage:[],connections:{},selected:null,stream:null,draft:'',dotId:'default',model:'auto',menu:false,builder:freshBuilder(),threadIds:{},lastPrompt:{}};
let auth,db,unsubscribers=[],streamUnsubscribe,heartbeatTimer,toastTimer;
const titleMap={home:'Overview',activity:'Activity',schedules:'Schedules',memory:'Memory',builder:'Dot builder',connections:'Connections',settings:'Settings',run:'Workspace'};
function ago(time){const ms=Date.now()-(typeof time==='number'?time:time?.toMillis?.()||Date.now());return ms<60000?'just now':ms<3600000?`${Math.floor(ms/60000)}m ago`:ms<86400000?`${Math.floor(ms/3600000)}h ago`:new Date(Date.now()-ms).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function date(time){return time?new Date(time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function empty(title,description,symbol='sparkle'){return `<div class="empty">${icon(symbol)}<strong>${escape(title)}</strong>${escape(description)}</div>`;}
function status(value){return `<span class="status ${escape(value)}">${escape(String(value).replaceAll('_',' '))}</span>`;}
function stored(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
// The cloud worker checks in on every scan; the interface should say what that means, not spin forever.
function workerState(){
  const seen=state.profile.workerSeenAt;
  if(state.demo||!state.user)return {label:'Worker online',tone:'online',note:''};
  if(!seen)return {label:'Worker starting',tone:'waiting',note:'Your cloud worker has not checked in yet. Anything you queue stays saved and starts on its first wake-up.'};
  const minutes=(Date.now()-seen)/60000;
  if(minutes<3)return {label:'Worker online',tone:'online',note:''};
  if(minutes<45)return {label:`Worker asleep · ${Math.round(minutes)}m`,tone:'waiting',note:'Dots wake on a rhythm. Queued work starts at the next wake-up; nothing is lost.'};
  return {label:'Worker offline',tone:'offline',note:'The cloud worker has not checked in for a while. Saved work waits safely until it returns.'};
}
function catalog(){return state.profile.modelCatalog?.length?state.profile.modelCatalog:fallbackCatalog;}
function modelLabel(id){return id==='auto'?'Automatic':(catalog().find(m=>m.id===id)?.label||String(id||'').split('/').at(-1)||'Automatic');}
function navItem(page,label,symbol,count){return `<button class="nav-item ${state.page===page?'active':''}" data-nav="${page}">${icon(symbol)}${label}${count?`<span class="count">${count}</span>`:''}</button>`;}
function currentRun(){return state.runs.find(r=>r.id===state.selected);}
function dotFor(id){return state.dots.find(d=>d.id===id)||{id,name:id==='default'?'Everyday':id,allowSchedules:false};}
function threadFor(dotId){return state.threadIds[dotId]||(state.profile.activeDotId===dotId?state.profile.activeThreadId:null);}
function threadRuns(dotId){const threadId=threadFor(dotId);return threadId?state.runs.filter(r=>(r.threadId||r.id)===threadId).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)):[];}
function threadMessages(dotId){const ids=new Set(threadRuns(dotId).map(r=>r.id));return state.messages.filter(m=>ids.has(m.runId)).sort((a,b)=>a.createdAt-b.createdAt);}
function scheduleTitle(s){return s.label||String(s.prompt||'').split('\n')[0].slice(0,80);}
function shell(){
  const used=state.usage.find(u=>u.id==='cloudflare')?.used||0;
  const name=state.user?.email?.split('@')[0] || (state.demo?'Alex Morgan':'Your workspace');
  const worker=workerState();
  return `<div class="shell ${state.menu?'menu-open':''}">
    <aside class="sidebar"><button class="brand" data-nav="home" aria-label="Dots home"><span class="brand-mark">${'<i></i>'.repeat(9)}</span>dots<em>CLOUD</em></button>
    <button class="new-task" data-action="new-task">${icon('plus')}New task<kbd>⌘ K</kbd></button>
    <nav aria-label="Main navigation">${navItem('home','Overview','home')}${navItem('activity','Activity','activity',state.runs.filter(r=>!['completed','failed','cancelled'].includes(r.status)).length)}${navItem('schedules','Schedules','clock')}${navItem('builder','Dot builder','wand')}${navItem('memory','Memory','memory')}${navItem('connections','Connections','link')}</nav>
    <div class="nav-label">YOUR DOTS<button data-nav="builder" aria-label="Build a new dot">+</button></div>
    <div class="dot-list">${state.dots.length?state.dots.slice(0,12).map((d,i)=>`<button class="dot-nav" data-dot="${escape(d.id)}"><i class="mini-dot ${d.parentId?'purple':i%3===1?'purple':i%3===2?'orange':''}"></i>${escape(d.name)}</button>`).join(''):'<div class="small muted" style="padding:5px 14px">A little team, made by you.</div>'}</div>
    <div class="sidebar-bottom"><div class="quota-card"><div class="row"><strong>Browser time</strong><span>${Math.round(used)} / 540s</span></div><div class="meter"><i style="width:${Math.min(100,used/540*100)}%"></i></div><small>Daily budget · 60s held in reserve</small></div>
    ${navItem('settings','Workspace settings','settings')}
    <div class="account"><div class="avatar">${escape(name.slice(0,2).toUpperCase())}</div><div class="identity"><strong>${escape(name)}</strong><small>${state.demo?'Preview workspace':'Firebase Spark'}</small></div><button data-action="account" aria-label="Account">${icon('dots')}</button></div></div></aside>
    <main class="main"><header class="topbar"><div class="breadcrumb"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Toggle navigation">${icon('menu')}</button>Workspace ${icon('right')} <b>${titleMap[state.page]}</b></div><div class="top-actions">${state.demo?'<span class="pill preview">Preview · sample data</span>':`<span class="pill ${worker.tone}" title="${escape(worker.note)}"><i></i>${escape(worker.label)}</span>`}<button class="icon-btn" data-action="theme" aria-label="Toggle color theme">${icon('sun')}</button>${!state.user&&!state.demo?'<button class="btn secondary" data-action="signin">Sign in</button>':''}</div></header>
    <div class="content ${state.page==='run'?'run-content':''}">${page()}</div></main></div>`;
}
function composer(){
  const dotId=state.dots.some(d=>d.id===state.dotId)?state.dotId:(state.dots[0]?.id||'default');
  return `<form id="task-form" class="composer"><textarea id="task-prompt" name="prompt" aria-label="What would you like to get done?" placeholder="What would you like to get done?" maxlength="6000" rows="2" required>${escape(state.draft)}</textarea><div class="composer-bottom"><span class="chip">${icon('sparkle')}Cloud tasks</span><select id="task-dot" aria-label="Choose a dot">${state.dots.length?state.dots.map(d=>`<option value="${escape(d.id)}" ${dotId===d.id?'selected':''}>${escape(d.name)}</option>`).join(''):'<option value="default">Everyday dot</option>'}</select><button class="send" type="submit" aria-label="Send task">${icon('arrow')}</button></div></form><div class="composer-foot"><span>Small steps. Persistent memory. Room to think.</span><span>⌘ / Ctrl + Enter to send</span></div>`;
}
function messageCard(m){
  return `<article class="message ${escape(m.role)}"><div class="message-label">${icon(m.role==='user'?'home':m.role==='tool'?'globe':m.role==='system'?'shield':'sparkle')}${m.role==='user'?'You':m.role==='assistant'?'Your dot':m.role==='tool'?'Tool activity':'Task update'}</div><div class="message-body md">${renderMarkdown(m.content)}</div></article>`;
}
function wakeLine(){
  const minutes=state.profile.pulseMinutes||30, at=state.profile.pulseAt;
  return `<div class="wake-line">${icon('sun')}<span>Every dot wakes itself <strong>every ${escape(String(minutes))} minutes</strong>${at?` · next ${escape(date(at))}`:''} · and can schedule more on its own</span></div>`;
}
function workerNotice(){const worker=workerState();return worker.note?`<div class="notice">${escape(worker.note)}</div>`:'';}
function chatPanel(){
  const dot=dotFor(state.dots.some(d=>d.id===state.dotId)?state.dotId:(state.dots[0]?.id||'default'));
  const runs=threadRuns(dot.id), messages=threadMessages(dot.id), last=runs.at(-1);
  const live=runs.find(r=>!['completed','failed','cancelled'].includes(r.status));
  const model=modelLabel(live?.model||last?.model||dot.model||'auto');
  const subtitle=live?`Working on it · ${String(live.status).replaceAll('_',' ')}`:(runs.length?`${runs.length} task${runs.length===1?'':'s'} in this chat · ${ago(last?.updatedAt||last?.createdAt)}`:'A fresh chat');
  const taskLine=last?`Task ${String(last.id).slice(0,8)} · ${String(last.status).replaceAll('_',' ')}${last.modelReason?' · '+last.modelReason:''}`:'';
  return `<section class="chat-panel" aria-label="Active chat">
    <div class="chat-head"><span class="chat-avatar">${icon(dot.parentId?'branch':'dots')}</span>
      <div class="chat-who"><strong>${escape(dot.name)}</strong><small>${escape(subtitle)} · ${escape(model)}</small></div>
      ${live?`<button class="btn secondary" data-cancel="${escape(live.id)}">${icon('pause')}Stop</button>`:''}
      <button class="btn secondary" data-action="new-chat">${icon('plus')}New chat</button></div>
    ${taskLine?`<div class="chat-task">${escape(taskLine)}</div>`:''}
    <div class="chat-stream">${messages.length?messages.map(messageCard).join(''):empty('Say hello','This chat stays here, and the dot can schedule its own follow-ups from it.','sparkle')}</div>
    ${composer()}
    <div class="chat-controls">
      <button class="toggle-row" data-toggle-schedules="${escape(dot.id)}" aria-pressed="${dot.allowSchedules?'true':'false'}"><span class="toggle ${dot.allowSchedules?'on':''}"><i></i></span>Let ${escape(dot.name)} schedule follow-ups</button>
      <button class="subtle-link" data-action="new-schedule">${icon('clock')}Schedule something</button>
      ${last?`<button class="subtle-link" data-run="${escape(last.id)}">Open full view ${icon('right')}</button>`:''}
    </div>
    ${wakeLine()}
  </section>`;
}
function overview(){
  const cards=state.dots.length?state.dots:templates;
  const activeDotId=state.dots.some(d=>d.id===state.dotId)?state.dotId:(state.dots[0]?.id||'default');
  const hasChat=state.dots.length>0&&threadRuns(activeDotId).length>0;
  const worker=workerState();
  return `<div class="welcome-meta">${icon('sun')}${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}<span>·</span>YOUR SPACE TO MAKE PROGRESS</div>
    <section class="hero ${hasChat?'compact':''}"><div><h1>A little help.<br><em>A lot more done.</em></h1><p>Give your ideas a little momentum.<br>Your dots take care of the steps, so you can see the bigger picture.</p></div><div class="orbit" aria-hidden="true"><div class="orbit-ring"></div><div class="orbit-ring"></div><div class="orbit-core">${icon('sparkle')}</div><i class="planet one"></i><i class="planet two"></i><i class="planet three"></i></div></section>
    ${state.user&&!state.profile.enabled?'<div class="notice">Your account is signed in. Verify your email using the message in your inbox. The cloud worker enables the configured owner account on its next check.</div>':''}
    ${worker.note&&(state.runs.some(r=>!['completed','failed','cancelled'].includes(r.status))||state.page==='home')?workerNotice():''}
    ${state.dots.length?chatPanel():composer()}
    <div class="section-head"><h2>${state.dots.length?'Your little team':'Start with a little inspiration'}</h2><button data-nav="builder">Build a dot ${icon('wand')}</button></div>
    <div class="cards">${cards.slice(0,3).map((d,i)=>`<button class="dot-card" ${state.dots.length?`data-dot="${escape(d.id)}"`:`data-template="${d.id}"`}><span class="card-top"><span class="card-icon">${icon(d.icon||['search','sparkle','code'][i%3])}</span>${icon('diagonal')}</span><h3>${escape(d.name)}</h3><p>${escape(d.description||d.purpose||d.instructions)}</p><span class="card-tag"><i></i>${state.dots.length?dotTag(d):'Make it yours'}</span></button>`).join('')}</div>
    <div class="section-head"><h2>Recent activity</h2><button data-nav="activity">View all ${icon('right')}</button></div>${activityList(state.runs.slice(0,3))}
    <div class="bottom-note">${icon('shield')}Your workspace stays yours. You decide what each dot can do.</div>`;
}
function dotTag(dot){
  const schedule=state.schedules.find(s=>s.dotId===dot.id&&s.enabled);
  if(dot.parentId)return `Branched off ${escape(dotFor(dot.parentId).name)}`;
  if(schedule)return `Wakes every ${escape(String(schedule.spec.minutes||''))} min`;
  return dot.allowSchedules?'Can schedule itself':'Ready when you are';
}
function activityList(runs){return runs.length?`<div class="activity-list">${runs.map(r=>`<button class="activity-row" data-run="${escape(r.id)}"><span class="activity-icon">${icon(r.status==='completed'?'check':r.status==='failed'?'pause':r.source==='schedule'?'sun':'activity')}</span><span class="activity-copy"><strong>${escape(r.title)}</strong><small>${escape(dotFor(r.dotId).name)} · ${escape(modelLabel(r.model||'auto'))}${r.source==='schedule'?' · automatic wake-up':''}</small></span>${status(r.status)}<span class="activity-time">${ago(r.updatedAt||r.createdAt)}</span></button>`).join('')}</div>`:empty('A fresh start','Your tasks and their progress will appear here.','activity');}
function pageTitle(title,description,action=''){return `<div class="page-title"><div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;}
// ---- dot builder -------------------------------------------------------------------------------
function builderInstructions(b){
  const name=b.name.trim()||'a new dot';
  const abilities=[];
  if(b.browser)abilities.push('You may open public web pages with browse, and you cite what you actually read.');
  if(b.terminal)abilities.push(b.autoApprove?'Sandboxed terminal commands can run automatically: they have no network and no provider credentials. Use them only when they clearly verify something.':'Terminal commands need the user’s approval before they run. Ask only when a command is the only way to verify something.');
  if(b.schedules)abilities.push('You may create schedules for yourself when work should repeat. The shortest interval is 30 minutes.');
  if(b.spawn)abilities.push('You may create another dot with spawn_dot when a job deserves its own rhythm.');
  return [`You are “${name}”, a small, focused assistant in this workspace.`,b.purpose.trim()?`Your job: ${b.purpose.trim()}`:'Your job: help with the tasks you are given, and say plainly when something is outside your remit.','Work in small, verifiable steps and never claim something you did not check.',...abilities,'Save progress with checkpoint and durable facts with remember; keep credentials out of memory.','Finish with a short answer, name your sources and any limits, and say exactly what blocks you if you are blocked.'].join('\n');
}
function builderPurpose(b){
  return `<h2 class="builder-h">What is this dot for?</h2><p class="builder-p">Name it and describe the job in your own words. Everything else can stay at the default.</p>
    <label class="field">Name<input data-field="name" value="${escape(b.name)}" placeholder="e.g. Weekend researcher" maxlength="60"></label>
    <label class="field">What should it do?<textarea data-field="purpose" maxlength="1000" placeholder="Check the local farmers market page every morning and tell me what looks good.">${escape(b.purpose)}</textarea></label>
    <div class="builder-templates">${templates.map(t=>`<button class="template-chip" data-template-fill="${escape(t.id)}">${icon(t.icon)}${escape(t.name)}</button>`).join('')}</div>`;
}
function builderAbilities(b){
  return `<h2 class="builder-h">What may it do on its own?</h2><p class="builder-p">Permissions are enforced by the worker, not by the model's goodwill.</p>
    <label class="check"><input type="checkbox" data-field="browser" ${b.browser?'checked':''}>Browse public websites</label>
    <label class="check"><input type="checkbox" data-field="terminal" ${b.terminal?'checked':''}>Request sandboxed terminal commands</label>
    <label class="check"><input type="checkbox" data-field="autoApprove" ${b.autoApprove?'checked':''} ${b.terminal?'':'disabled'}>Run those commands without asking</label>
    <label class="check"><input type="checkbox" data-field="schedules" ${b.schedules?'checked':''}>Give itself new schedules</label>
    <label class="check"><input type="checkbox" data-field="spawn" ${b.spawn?'checked':''}>Branch out and create more dots</label>`;
}
function modelOption(markup){return markup;}
function builderModel(b){
  return `<h2 class="builder-h">Which free NVIDIA model should it think with?</h2><p class="builder-p">Every model below is on NVIDIA's free inference tier and answered a real tool-calling request with this workspace's key.</p>
    <div class="model-grid"><label class="model-card ${b.model==='auto'?'active':''}"><input type="radio" name="builder-model" value="auto" data-field="model" ${b.model==='auto'?'checked':''}><span class="model-name">Automatic</span><span class="model-id">chosen per task</span><p>Pick the best free model for each task automatically, and switch if one is busy.</p><span class="model-tags"><i>recommended</i></span></label>
    ${catalog().map(m=>`<label class="model-card ${b.model===m.id?'active':''}"><input type="radio" name="builder-model" value="${escape(m.id)}" data-field="model" ${b.model===m.id?'checked':''}><span class="model-name">${escape(m.label||m.id)}</span><span class="model-id">${escape(m.id)}</span><p>${escape(m.note||'')}</p><span class="model-tags">${(m.tags||[]).map(t=>`<i>${escape(t)}</i>`).join('')}</span></label>`).join('')}</div>`;
}
function builderRhythm(b){
  const options=[[0,'Only when I ask'],[30,'Every 30 minutes'],[60,'Every hour'],[360,'Every 6 hours'],[1440,'Once a day']];
  return `<h2 class="builder-h">Give it a rhythm.</h2><p class="builder-p">A waking dot checks its own work, acts if something is due and schedules anything else itself. 30 minutes is the shortest allowed interval.</p>
    <div class="rhythm-grid">${options.map(([minutes,label])=>`<label class="rhythm-card ${b.minutes===minutes?'active':''}"><input type="radio" name="builder-rhythm" value="${minutes}" data-field="minutes" ${b.minutes===minutes?'checked':''}>${escape(label)}</label>`).join('')}</div>
    <label class="check"><input type="checkbox" data-field="startup" ${b.startup?'checked':''}>Let it introduce itself in the chat the first time it wakes</label>`;
}
function builderReview(b){
  return `<h2 class="builder-h">Ready to create it.</h2><p class="builder-p">This is the dot and the instructions it starts with. You can edit everything later.</p>
    <div class="detail-card"><div class="row"><h3>${escape(b.name.trim()||'Untitled dot')}</h3><span class="card-tag"><i></i>${b.minutes?`Wakes every ${escape(String(b.minutes))} min`:'Runs when you ask'}</span></div><p>${escape(b.purpose.trim()||builderInstructions(b).split('\n')[0])}</p>
    <p class="small">Model: <strong>${escape(modelLabel(b.model))}</strong><br>Abilities: ${escape([b.browser?'web':null,b.terminal?(b.autoApprove?'commands (auto)':'commands (approved)'):null,b.schedules?'own schedules':null,b.spawn?'creates dots':null].filter(Boolean).join(', ')||'chat only')}</p></div>`;
}
function builderPage(){
  const b=state.builder, steps=['Purpose','Abilities','Model','Rhythm','Review'];
  return `${pageTitle('Build a dot.','Describe the job. The builder writes the instructions, chooses the model and sets the rhythm.','<button class="btn secondary" data-action="new-dot">'+icon('sparkle')+'Quick edit form</button>')}
    <div class="builder">
      <div class="builder-steps">${steps.map((s,i)=>`<button class="builder-step ${b.step===i+1?'active':''} ${b.step>i+1?'done':''}" data-builder-step="${i+1}"><i>${b.step>i+1?icon('check'):i+1}</i>${s}</button>`).join('')}</div>
      <div class="builder-body">
        <div class="builder-form">${[builderPurpose,builderAbilities,builderModel,builderRhythm,builderReview][b.step-1](b)}
          <p class="form-error" id="builder-error"></p>
          <div class="row builder-nav">${b.step>1?`<button class="btn secondary" data-builder-step="${b.step-1}">Back</button>`:''}${b.step<5?`<button class="btn" data-builder-next="1">Continue ${icon('right')}</button>`:`<button class="btn" data-builder-create="1">${icon('plus')}Create dot</button>`}</div>
        </div>
        <aside class="builder-preview">
          <div class="dot-card preview-card"><span class="card-top"><span class="card-icon">${icon(b.spawn?'branch':b.browser?'search':'sparkle')}</span></span><h3>${escape(b.name.trim()||'Untitled dot')}</h3><p>${escape(b.purpose.trim()||'Describe what it should do.')}</p><span class="card-tag"><i></i>${b.minutes?`Wakes every ${escape(String(b.minutes))} min`:'Runs when you ask'}</span></div>
          <div class="instruction-preview"><strong>Starting instructions</strong><pre>${escape(builderInstructions(b))}</pre></div>
        </aside>
      </div>
    </div>`;
}
function schedulesPage(){return `${pageTitle('A rhythm that works.','Your dots can return to a task while you’re away.','<button class="btn" data-action="new-schedule">'+icon('plus')+'Schedule</button>')}<div class="notice">Schedules run in the cloud, even when this tab is closed. Free hosting and GitHub scheduling can delay execution. Missed repetitions are combined into one recovery decision.</div><div class="stack">${state.schedules.length?state.schedules.map(s=>`<div class="detail-card"><div class="row" style="margin:0"><h3>${escape(scheduleTitle(s))}</h3><button data-schedule="${escape(s.id)}" aria-label="${s.enabled?'Pause':'Enable'} schedule" class="toggle ${s.enabled?'on':''}"><i></i></button></div><p>${s.spec.kind==='interval'?`Every ${s.spec.minutes} minutes`:s.spec.kind==='cron'?escape(s.spec.cron):'One-time task'} · ${escape(s.spec.timezone)} · ${escape(dotFor(s.dotId).name)}${s.system?' · automatic wake-up':''}</p><div class="row"><span class="small muted">Next: ${date(s.nextRunAt)}</span>${status(s.enabled?'queued':'cancelled')}</div></div>`).join(''):empty('Make time for the recurring things','Add a scheduled research check, planning task, or reminder.','clock')}</div>`;}
function memoryPage(){return `${pageTitle('A little less repeating.','Useful context, remembered with a source. Always yours to remove.')}<div class="stack">${state.memories.length?state.memories.map(m=>`<article class="detail-card"><p class="memory-text">${escape(m.text)}</p><div class="row"><span class="small muted">Source: ${escape(m.source)} · ${ago(m.createdAt)}</span><button class="icon-btn" data-delete-memory="${escape(m.id)}" aria-label="Delete memory">${icon('trash')}</button></div></article>`).join(''):empty('Memory with intention','Dots save relevant facts as they work. Credentials never belong here.','memory')}</div>`;}
function connectionsPage(){const worker=workerState();const items=[['nvidia','NVIDIA','Adaptive model routing across the free tier','N'],['cloudflare','Cloudflare','Short browser tasks · daily budget','C'],['browserless','Browserless','Additional browser sessions · monthly budget','B'],['github','GitHub Actions','Approved sandbox commands and scheduled wake-ups','G'],['koyeb','Koyeb','Always-on worker · wake-ups, streaming and callbacks','K']];return `${pageTitle('Connected, thoughtfully.','Credentials live on the worker. This page communicates only with Firebase.')}<div class="notice">Worker: <strong>${escape(worker.label)}</strong>${state.profile.workerSeenAt?` · last check-in ${escape(ago(state.profile.workerSeenAt))}`:''}${state.profile.workerVersion?` · version ${escape(state.profile.workerVersion)}`:''}</div><div class="integration-grid">${items.map(([id,name,description,letter])=>`<div class="detail-card"><div class="integration-logo">${letter}</div><h3>${name}</h3><p>${description}</p><div class="row"><span class="small muted">Server-side connection</span>${state.connections[id]?'<span class="status">Configured</span>':'<span class="status waiting">Not configured</span>'}</div></div>`).join('')}</div><div class="notice" style="margin-top:22px">“Configured” means a credential is present, not that its live API access has been verified. Set provider keys in the worker's secrets. Never paste them into a dot or task.</div>`;}
function settingsPage(){return `${pageTitle('Make yourself at home.','A few deliberate limits keep the workspace predictable.')}<div class="detail-card settings-list"><div class="setting"><div><strong>Appearance</strong><p>A quieter workspace, day or night.</p></div><button class="btn secondary" data-action="theme">Toggle theme</button></div><div class="setting"><div><strong>Wake-ups</strong><p>Every dot wakes itself every ${escape(String(state.profile.pulseMinutes||30))} minutes and may schedule more work on its own.</p></div><span class="status">Active</span></div><div class="setting"><div><strong>Export workspace data</strong><p>Download the records currently loaded in this browser. This is a partial export.</p></div><button class="btn secondary" data-action="export">${icon('download')}Export</button></div><div class="setting"><div><strong>GitHub backup</strong><p>Encrypted dot settings, schedules, and memory. The repository must be private.</p></div><span class="status ${state.connections.backup?'':'waiting'}">${state.connections.backup?'Enabled':'Not enabled'}</span></div><div class="setting"><div><strong>Firebase Spark</strong><p>No Cloud Functions, Cloud Scheduler, or Firebase Storage required. Quota exhaustion pauses work.</p></div><span class="pill">Spark</span></div><div class="setting"><div><strong>Task budgets</strong><p>16 model steps, two identical tool failures, one recovery review by default. Quota waits do not keep a process busy.</p></div>${icon('shield')}</div></div><div class="privacy-note">Email/password authentication only. Gmail is not connected. Browser screenshots are temporary, compressed, and published only while you watch a task.</div><div class="row" style="margin-top:25px">${state.user?'<button class="btn secondary" data-action="signout">Sign out</button>':state.demo?'<button class="btn secondary" data-action="leave-demo">Leave preview</button>':'<button class="btn" data-action="signin">Sign in</button>'}${!state.demo?'<button class="subtle-link" data-action="demo">Explore the interface preview</button>':''}</div>`;}
function inspector(){const s=state.stream,run=currentRun();return `<aside class="inspector"><div class="inspector-head"><strong>${s?.kind==='terminal'?'Terminal':'Browser activity'}</strong><span class="muted">${s?.active?'Active session':'On demand'}</span></div>${s?.kind==='terminal'?`<div class="terminal">${escape(s.output)}${s.active?'<span class="terminal-caret"></span>':''}</div>`:`<div class="browser-bar"><i></i><i></i><i></i><span>${escape(s?.url||'A window into the work')}</span></div><div class="browser-view">${s?.frame?`<img alt="Latest agent browser screenshot" src="data:image/jpeg;base64,${escape(s.frame)}">${s.cursor?`<span class="agent-cursor" style="left:${Math.min(100,Math.max(0,s.cursor.x/s.width*100))}%;top:${Math.min(100,Math.max(0,s.cursor.y/s.height*100))}%">${icon('cursor')}</span>`:''}`:`<div class="browser-empty">${icon('globe')}<br>Your dot’s browser appears here<br>when it opens a page.</div>`}</div>`}<div class="inspector-meta"><strong>${escape(s?.label||'Small steps, visible progress.')}</strong><br>${s?.updatedAt?`Last update ${ago(s.updatedAt)}`:'Screenshots follow meaningful actions, not continuous video.'}<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><strong>Model</strong><br>${escape(modelLabel(run?.model||'auto'))}<br><span class="small">${escape(run?.modelReason||'')}</span>${run?.checkpoint?.summary?`<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><strong>Checkpoint</strong><br>${escape(run.checkpoint.summary)}`:''}</div></aside>`;}
function runPage(){const r=currentRun();if(!r)return empty('Task queued','Waiting for the worker to create the task record.','clock');const messages=state.messages.filter(m=>m.runId===r.id).sort((a,b)=>a.createdAt-b.createdAt);const approvals=state.approvals.filter(a=>a.runId===r.id&&a.status==='pending');const worker=workerState();return `${pageTitle(escape(r.title),`Task ${escape(r.id.slice(0,8))} · ${escape(r.status.replaceAll('_',' '))}`,!['completed','failed','cancelled'].includes(r.status)?`<button class="btn secondary" data-cancel="${escape(r.id)}">${icon('pause')}Stop</button>`:r.status==='failed'?`<button class="btn secondary" data-resume="${escape(r.id)}">Review recovery</button>`:'')}<div class="run-layout"><div>${r.lastError?`<div class="notice">${escape(r.lastError)}</div>`:''}${r.status==='queued'&&worker.tone!=='online'?`<div class="notice">${escape(worker.note||'This task is queued. The worker starts it at its next wake-up; it stays saved until then.')}</div>`:''}${r.waitReason&&r.status==='waiting'?`<div class="notice">${escape(r.waitReason)}. Next check: ${date(r.nextRunAt)}</div>`:''}${approvals.map(a=>`<div class="approval"><h3>Approve a sandbox command</h3><p>${escape(a.reason)}</p><pre>${escape(a.command)}</pre><p>Runs on GitHub Actions with no network and no provider credentials. Uses your Actions allowance.</p><div class="row"><button class="btn" data-approve="${escape(a.id)}">Approve once</button><button class="btn secondary" data-deny="${escape(a.id)}">Decline</button></div></div>`).join('')}<div class="chat">${messages.length?messages.map(messageCard).join(''):empty('Picking up the thread','The worker will publish progress here.','clock')}</div>${composer()}</div>${inspector()}</div>`;}
function page(){switch(state.page){case'home':return overview();case'activity':return `${pageTitle('Progress, in one place.','What your dots have been working on.')}${activityList(state.runs)}`;case'schedules':return schedulesPage();case'builder':return builderPage();case'memory':return memoryPage();case'connections':return connectionsPage();case'settings':return settingsPage();case'run':return runPage();default:return overview();}}
function render(){
  const active=document.activeElement, id=active?.id, field=active?.dataset?.field, selection=id==='task-prompt'?active.selectionStart:null;
  app.innerHTML=shell();
  const target=id&&$('#'+id)?$('#'+id):field?$(`[data-field="${field}"]`):null;
  if(target){target.focus();if(selection!==null&&target.setSelectionRange)target.setSelectionRange(selection,selection);}
}
function modal(title,subtitle,content){dialog.innerHTML=`<div class="dialog-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Close dialog">${icon('close')}</button></div><p class="dialog-sub">${subtitle}</p>${content}`;if(!dialog.open)dialog.showModal();}
function authModal(signup=false){modal(signup?'A space of your own.':'Welcome back.','Sign in with your Firebase email and password.',`<form id="auth-form" data-signup="${signup}"><label class="field">Email<input type="email" name="email" autocomplete="email" required></label><label class="field">Password<input name="password" type="password" minlength="6" autocomplete="${signup?'new-password':'current-password'}" required></label><p class="form-error" role="alert"></p><div class="dialog-actions"><button class="btn" type="submit">${signup?'Create account':'Sign in'} ${icon('right')}</button></div></form><div class="auth-switch">${signup?'Already have an account?':'New here?'} <button data-auth-switch="${!signup}">${signup?'Sign in':'Create account'}</button></div>${!signup?'<div class="auth-switch"><button data-reset-password>Reset password</button></div>':''}<div class="auth-switch"><button data-preview>Explore a preview first</button></div>`);}
function modelSelect(selected){return `<option value="auto">Automatic · best free model for each task</option>${catalog().map(m=>`<option value="${escape(m.id)}" ${selected===m.id?'selected':''}>${escape(m.label||m.id)} — ${escape(String(m.note||'').slice(0,44))}</option>`).join('')}`;}
function dotModal(id,template){const d=state.dots.find(d=>d.id===id)||template||{};modal(d.id&&!template?'Your dot, your way.':'Meet your next dot.','Give it a role, choose its free model and decide what it may do.',`<form id="dot-form"><input type="hidden" name="id" value="${escape(template?'':d.id||'')}"><label class="field">Name<input name="name" value="${escape(d.name||'')}" placeholder="e.g. Weekend researcher" maxlength="60" required></label><label class="field">Instructions<textarea name="instructions" maxlength="4000" required>${escape(d.instructions||'')}</textarea></label><label class="field">Model<select name="model">${modelSelect(d.model||'auto')}</select></label>${d.parentId?`<p class="small muted">Branched off ${escape(dotFor(d.parentId).name)}.</p>`:''}<label class="check"><input type="checkbox" name="browser" ${d.allowBrowser!==false?'checked':''}>Browse public websites</label><label class="check"><input type="checkbox" name="terminal" ${d.allowTerminal?'checked':''}>Request terminal commands</label><label class="check"><input type="checkbox" name="autoApproveTerminal" ${d.autoApproveTerminal?'checked':''}>Auto-approve terminal commands on GitHub Actions</label><label class="check"><input type="checkbox" name="schedules" ${d.allowSchedules?'checked':''}>Create its own schedules</label><label class="check"><input type="checkbox" name="spawn" ${d.allowSpawn!==false?'checked':''}>Branch out and create more dots</label>${!id?'<label class="field" style="margin-top:18px">Optional first task<input name="startup" maxlength="6000" placeholder="Runs once when this dot is created"></label>':''}<p class="form-error"></p><div class="dialog-actions"><button type="button" class="btn secondary" data-close>Cancel</button><button type="submit" class="btn">Save dot</button></div></form>`);}
function scheduleModal(prefill={}){const dotId=state.dots.some(d=>d.id===state.dotId)?state.dotId:(state.dots[0]?.id||'default');modal('Set a gentle rhythm.','Recurring work has a minimum interval of 30 minutes.',`<form id="schedule-form"><label class="field">What should your dot do?<textarea name="prompt" maxlength="6000" required>${escape(prefill.prompt||'')}</textarea></label><label class="field">Dot<select name="dotId">${state.dots.length?state.dots.map(d=>`<option value="${escape(d.id)}" ${ (prefill.dotId||dotId)===d.id?'selected':''}>${escape(d.name)}</option>`).join(''):'<option value="default">Everyday dot</option>'}</select></label><label class="field">Schedule type<select name="kind" id="schedule-kind"><option value="interval">Repeat at an interval</option><option value="once">Once at a specific time</option><option value="cron">Cron expression</option></select></label><label class="field" id="interval-field">Every (minutes)<input name="minutes" type="number" min="30" max="525600" value="${escape(String(prefill.minutes||30))}"></label><label class="field" id="once-field" hidden>Run at<input name="at" type="datetime-local"></label><label class="field" id="cron-field" hidden>Cron expression<input name="cron" placeholder="0 9 * * 1-5"></label><label class="field">Timezone<input name="timezone" value="${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}" required></label><p class="form-error"></p><div class="dialog-actions"><button type="button" class="btn secondary" data-close>Cancel</button><button type="submit" class="btn">Create schedule</button></div></form>`);}
async function sendCommand(kind,payload){
  if(state.demo){demoCommand(kind,payload);toast('Preview only — no cloud operation was performed.');return 'preview';}
  if(!state.user){authModal();throw new Error('Sign in to send a task');}
  if(!state.profile.enabled)throw new Error('The operator must enable your account in Firestore first');
  const ref=await addDoc(collection(db,'commands'),{uid:state.user.uid,kind,payload,status:'pending',createdAt:serverTimestamp()});
  if(kind!=='heartbeat')toast('Queued securely. Your dot picks this up on its next wake-up.');
  return ref.id;
}
function navigate(page){state.page=page;state.menu=false;if(page!=='run'){streamUnsubscribe?.();streamUnsubscribe=null;clearInterval(heartbeatTimer);}render();window.scrollTo({top:0,behavior:'instant'});}
function openRun(id){state.selected=id;state.page='run';state.stream=null;const run=state.runs.find(r=>r.id===id);if(run?.dotId)state.dotId=run.dotId;render();streamUnsubscribe?.();clearInterval(heartbeatTimer);if(!state.demo&&state.user){streamUnsubscribe=onSnapshot(doc(db,`users/${state.user.uid}/streams/${id}`),s=>{state.stream=s.exists()?s.data():null;render();},e=>toast(`Activity view: ${e.code}`));const beat=()=>{if(document.visibilityState==='visible')sendCommand('heartbeat',{runId:id}).catch(()=>{});};beat();heartbeatTimer=setInterval(beat,60000);}}
async function toggleSchedules(dotId){
  const dot=dotFor(dotId),record={id:dot.id,name:dot.name||'Everyday',instructions:dot.instructions||'Be clear and verify what you can.',model:dot.model||'auto',allowBrowser:dot.allowBrowser===true,allowTerminal:dot.allowTerminal===true,autoApproveTerminal:dot.autoApproveTerminal===true,allowSchedules:!(dot.allowSchedules===true),allowSpawn:dot.allowSpawn!==false};
  await sendCommand('save_dot',record);
  toast(dot.allowSchedules?`${record.name} will follow your rhythm instead of scheduling its own work.`:`${record.name} can now give itself new schedules.`);
}
document.addEventListener('input',event=>{
  const target=event.target;
  if(target.id==='task-prompt')state.draft=target.value;
  if(target.dataset?.field&&state.page==='builder'){
    const key=target.dataset.field, value=target.type==='checkbox'?target.checked:target.type==='radio'?(key==='minutes'?Number(target.value):target.value):target.value;
    state.builder={...state.builder,[key]:value};
    if(key==='terminal'&&!value)state.builder.autoApprove=false;
    render();
  }
});
app.addEventListener('change',event=>{if(event.target.id==='task-dot')state.dotId=event.target.value;});
app.addEventListener('submit',async event=>{
  if(event.target.id!=='task-form')return;event.preventDefault();
  const prompt=state.draft.trim();if(!prompt)return;
  const button=event.target.querySelector('button[type=submit]');button.disabled=true;
  try{
    state.dotId=$('#task-dot').value;
    const dotId=state.dotId, threadId=threadFor(dotId)||crypto.randomUUID();
    state.threadIds[dotId]=threadId;save('dots-threads',state.threadIds);
    await sendCommand('start',{prompt,dotId,threadId,source:'chat'});
    state.draft='';state.lastPrompt[dotId]=prompt;
    if(!state.demo&&state.user){state.selected=null;state.page='home';}
    render();
  }catch(e){toast(e.message);button.disabled=false;}
});
app.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  try{
    if(b.dataset.nav)return navigate(b.dataset.nav);
    if(b.dataset.run)return openRun(b.dataset.run);
    if(b.dataset.dot)return dotModal(b.dataset.dot);
    if(b.dataset.template)return dotModal(null,templates.find(t=>t.id===b.dataset.template));
    if(b.dataset.toggleSchedules)return toggleSchedules(b.dataset.toggleSchedules);
    if(b.dataset.cancel){await sendCommand('cancel',{id:b.dataset.cancel});return;}
    if(b.dataset.resume){await sendCommand('resume',{id:b.dataset.resume});return;}
    if(b.dataset.approve||b.dataset.deny){await sendCommand('approve',{id:b.dataset.approve||b.dataset.deny,allow:!!b.dataset.approve});return;}
    if(b.dataset.schedule){const s=state.schedules.find(s=>s.id===b.dataset.schedule);await sendCommand('pause_schedule',{id:s.id,enabled:!s.enabled});return;}
    if(b.dataset.deleteMemory){await sendCommand('delete_memory',{id:b.dataset.deleteMemory});return;}
    if(b.dataset.builderStep){state.builder={...state.builder,step:Number(b.dataset.builderStep)};return render();}
    if(b.dataset.builderNext){
      const error=$('#builder-error'), b2=state.builder;
      if(b2.step===1&&(!b2.name.trim()||!b2.purpose.trim())){error.textContent='Give the dot a name and a job first.';return;}
      error.textContent='';state.builder={...b2,step:Math.min(5,b2.step+1)};return render();
    }
    if(b.dataset.builderCreate){await createFromBuilder();return;}
    if(b.dataset.templateFill){
      const t=templates.find(t=>t.id===b.dataset.templateFill);
      state.builder={...state.builder,name:t.name,purpose:t.purpose,template:t.id,minutes:t.minutes??state.builder.minutes,terminal:t.allowTerminal===true,browser:t.allowBrowser!==false};
      return render();
    }
    switch(b.dataset.action){
      case'menu':state.menu=!state.menu;render();break;
      case'new-task':navigate('home');$('#task-prompt')?.focus();break;
      case'new-dot':dotModal();break;
      case'new-chat':{const dotId=state.dotId;delete state.threadIds[dotId];save('dots-threads',state.threadIds);state.draft='';render();toast('A new chat. The previous one stays in Activity.');break;}
      case'new-schedule':scheduleModal({prompt:state.lastPrompt[state.dotId]||'',dotId:state.dotId});break;
      case'signin':case'account':state.user?navigate('settings'):state.demo?navigate('settings'):authModal();break;
      case'signout':await signOut(auth);break;
      case'theme':{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('dots-theme',theme);break;}
      case'demo':location.search='?demo=1';break;
      case'leave-demo':location.search='';break;
      case'export':{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({partial:true,exportedAt:new Date().toISOString(),dots:state.dots,schedules:state.schedules,memories:state.memories,runs:state.runs},null,2)],{type:'application/json'}));a.download='dots-workspace.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Exported the loaded workspace records.');break;}
    }
  }catch(e){toast(e.message);}
});
async function createFromBuilder(){
  const b=state.builder, error=$('#builder-error');
  if(!b.name.trim()||!b.purpose.trim()){if(error)error.textContent='Give the dot a name and a job first.';return;}
  const record={name:b.name.trim(),description:b.purpose.trim().slice(0,300),instructions:builderInstructions(b),model:b.model,allowBrowser:b.browser,allowTerminal:b.terminal,autoApproveTerminal:b.terminal&&b.autoApprove,allowSchedules:b.schedules||b.minutes>0,allowSpawn:b.spawn,
    ...(b.minutes>0?{schedule:{prompt:`${b.purpose.trim()}\n\nAutomatic wake-up. Review what is genuinely waiting, take one small step or schedule the next one, and answer in one short line if nothing needs doing.`,kind:'interval',minutes:b.minutes}}:{}),
    ...(b.startup?{startupPrompt:'Introduce yourself in two short sentences: what you will do, and when you will next check in.'}:{})};
  await sendCommand('save_dot',record);
  const name=record.name;state.builder=freshBuilder();state.page='home';render();toast(`${name} is created and will start on its own schedule.`);
}
dialog.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-close'))dialog.close();if(b.dataset.authSwitch)authModal(b.dataset.authSwitch==='true');if(b.hasAttribute('data-preview'))location.search='?demo=1';if(b.hasAttribute('data-reset-password')){const email=dialog.querySelector('[name=email]').value;if(!email)return toast('Enter your email address first.');try{await sendPasswordResetEmail(auth,email);toast('If an account exists, a reset email will be sent.');}catch(e){toast(e.code||'Reset failed');}}});
dialog.addEventListener('change',event=>{if(event.target.id==='schedule-kind'){for(const type of ['interval','once','cron'])$('#'+type+'-field').hidden=event.target.value!==type;}});
dialog.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,formId=form.getAttribute('id'),data=new FormData(form),error=form.querySelector('.form-error'),button=form.querySelector('[type=submit]');button.disabled=true;error.textContent='';
  try{
    if(formId==='auth-form'){const credential=await(form.dataset.signup==='true'?createUserWithEmailAndPassword:signInWithEmailAndPassword)(auth,data.get('email'),data.get('password'));if(!credential.user.emailVerified){await sendEmailVerification(credential.user);toast('Check your inbox to verify your email.');}}
    if(formId==='dot-form')await sendCommand('save_dot',{...(data.get('id')?{id:data.get('id')}:{}),name:data.get('name'),instructions:data.get('instructions'),model:data.get('model'),allowBrowser:data.has('browser'),allowTerminal:data.has('terminal'),autoApproveTerminal:data.has('autoApproveTerminal'),allowSchedules:data.has('schedules'),allowSpawn:data.has('spawn'),...(data.get('startup')?{startupPrompt:data.get('startup')}:{})});
    if(formId==='schedule-form'){const kind=data.get('kind');if(kind==='once'&&!data.get('at'))throw new Error('Choose a future date and time');await sendCommand('schedule',{prompt:data.get('prompt'),dotId:data.get('dotId'),kind,timezone:data.get('timezone'),...(kind==='interval'?{minutes:Number(data.get('minutes'))}:kind==='once'?{at:new Date(data.get('at')).getTime()}:{cron:data.get('cron')})});}
    dialog.close();
  }catch(e){error.textContent=e.code?`Unable to complete: ${e.code.replace('auth/','').replaceAll('-',' ')}.`:e.message;}finally{button.disabled=false;}
});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();navigate('home');$('#task-prompt')?.focus();}if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&document.activeElement?.id==='task-prompt')$('#task-form').requestSubmit();});

function demoCommand(kind,p){
  const now=Date.now(),id=crypto.randomUUID();
  if(kind==='start'){
    state.runs.unshift({id,dotId:p.dotId,threadId:p.threadId,title:p.prompt,prompt:p.prompt,status:'queued',createdAt:now,updatedAt:now,source:'chat'});
    state.threadIds[p.dotId]=p.threadId;
    state.messages.push({id,runId:id,role:'user',content:p.prompt,createdAt:now},{id:id+'note',runId:id,role:'system',content:'This is an interface preview. No AI request has been sent. Connect the backend to execute real tasks.',createdAt:now+1});
  }
  else if(kind==='save_dot'){const record={...p,id:p.id||id,createdAt:now};state.dots=state.dots.filter(d=>d.id!==record.id).concat(record);if(p.schedule)state.schedules.push({...p.schedule,id:'sched_'+record.id,dotId:record.id,enabled:true,spec:p.schedule,nextRunAt:now+p.schedule.minutes*60000});if(p.startupPrompt)state.runs.unshift({id:'startup_'+record.id,dotId:record.id,threadId:'startup_'+record.id,title:p.startupPrompt,prompt:p.startupPrompt,status:'queued',createdAt:now,updatedAt:now});}
  else if(kind==='schedule')state.schedules.push({...p,id,enabled:true,spec:p,nextRunAt:p.at||now+(p.minutes||30)*60000});
  else if(kind==='pause_schedule')state.schedules.find(s=>s.id===p.id).enabled=p.enabled;
  else if(kind==='delete_memory')state.memories=state.memories.filter(m=>m.id!==p.id);
  else if(kind==='cancel')state.runs.find(r=>r.id===p.id).status='cancelled';
  render();
}
function seedDemo(){
  const now=Date.now();
  state.profile={enabled:true,models:fallbackCatalog.map(m=>m.id),modelCatalog:fallbackCatalog,workerSeenAt:now,workerVersion:'1.1.0',pulseMinutes:30,pulseAt:now+20*60000,activeDotId:'research',activeThreadId:'thread-home'};
  state.dots=templates.map(t=>({...t,model:'auto',allowSchedules:true,allowSpawn:true,allowBrowser:t.allowBrowser!==false}));
  state.dots.push({id:'dot_spawned',name:'Market watcher',description:'Born from the research dot to check one page every 30 minutes.',instructions:'Check the page and report only meaningful changes.',model:'z-ai/glm-5.3',allowBrowser:true,allowSchedules:true,allowSpawn:true,parentId:'research',depth:1});
  state.dotId='research';state.threadIds={research:'thread-home'};state.lastPrompt={research:'Compare three ways to build a calmer morning'};
  state.runs=[
    {id:'demo1',dotId:'research',threadId:'thread-home',title:'Compare three ways to build a calmer morning',prompt:'Compare three ways to build a calmer morning',result:'…',status:'completed',createdAt:now-3600000,updatedAt:now-720000,model:'nvidia/nemotron-3.5-lightning-30b-a3b',source:'chat'},
    {id:'demo2',dotId:'planner',threadId:'schedule-demo',title:'Make a realistic plan for the week ahead',status:'waiting',waitReason:'Example scheduled task',nextRunAt:now+1800000,createdAt:now-7200000,updatedAt:now-2700000,model:'z-ai/glm-5.3',source:'schedule'},
    {id:'demo3',dotId:'builder',threadId:'thread-code',title:'Review the structure of my side project',status:'completed',createdAt:now-86400000,updatedAt:now-86400000,model:'openai/gpt-oss-20b'}
  ];
  state.messages=[
    {id:'m1',runId:'demo1',role:'user',content:'Compare three ways to build a calmer morning',createdAt:now-3600000},
    {id:'m2',runId:'demo1',role:'assistant',content:'Three options, **simplest first**.\n\n1. Prepare one thing the night before\n2. Leave the first ten minutes screen-free\n3. Choose a single priority\n\n> The first option is the one that usually survives a bad night.\n\nSources: `example.com`, [NVIDIA](https://example.com/models)',createdAt:now-720000},
    {id:'m3',runId:'demo1',role:'system',content:'Checkpoint saved: kept the three-option summary for later reuse.',createdAt:now-719000}
  ];
  state.schedules=[
    {id:'pulse',dotId:'default',prompt:'Automatic 30-minute wake-up.\n\nReview what is genuinely waiting…',label:'Wake up every 30 minutes',spec:{kind:'interval',minutes:30,timezone:'UTC'},enabled:true,system:true,nextRunAt:now+20*60000},
    {id:'s1',dotId:'planner',prompt:'Reflect on the day and suggest one priority for tomorrow',spec:{kind:'cron',cron:'0 18 * * 1-5',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone},enabled:true,nextRunAt:now+3600000}
  ];
  state.memories=[{id:'mem1',text:'Example preference: keep plans simple, with no more than three priorities.',source:'Preview conversation',createdAt:now-86400000}];
  state.usage=[{id:'cloudflare',used:124,max:540}];
  state.connections={nvidia:true,cloudflare:true,github:true,koyeb:true};
}
function watchUser(user){
  unsubscribers.forEach(fn=>fn());unsubscribers=[];streamUnsubscribe?.();clearInterval(heartbeatTimer);
  state.user=user;state.profile={};
  for(const k of ['dots','runs','schedules','memories','messages','approvals','usage'])state[k]=[];
  state.connections={};state.stream=null;state.page='home';render();if(!user)return;
  unsubscribers.push(onSnapshot(doc(db,`users/${user.uid}`),snap=>{state.profile=snap.exists()?snap.data():{};const active=state.profile.activeDotId;if(active){state.dotId=active;if(state.profile.activeThreadId&&!state.threadIds[active]){state.threadIds[active]=state.profile.activeThreadId;save('dots-threads',state.threadIds);}}render();},e=>toast(`Profile: ${e.code}`)));
  for(const name of ['dots','runs','schedules','memories','messages','approvals','usage']){
    const base=collection(db,`users/${user.uid}/${name}`),q=name==='usage'?query(base,limit(10)):query(base,orderBy(name==='runs'?'updatedAt':'createdAt','desc'),limit(name==='messages'?100:30));
    unsubscribers.push(onSnapshot(q,snap=>{state[name]=snap.docs.map(d=>({...d.data(),id:d.id}));if(name==='dots'&&state.dots.length&&!state.dots.some(d=>d.id===state.dotId))state.dotId=state.dots[0].id;if(name==='runs'&&state.page==='run'&&state.selected&&!streamUnsubscribe&&state.runs.some(r=>r.id===state.selected))openRun(state.selected);else render();},e=>toast(`${name}: ${e.code}`)));
  }
  unsubscribers.push(onSnapshot(doc(db,`users/${user.uid}/connections/providers`),snap=>{state.connections=snap.data()||{};render();}));
  let initial=true;unsubscribers.push(onSnapshot(query(collection(db,'commands'),where('uid','==',user.uid),limit(20)),snap=>{for(const change of snap.docChanges()){const c=change.doc.data();if(!initial&&change.type!=='removed'&&c.status==='error')toast(c.error||'The command could not be processed.');}initial=false;},e=>toast(`Commands: ${e.code}`)));
}
document.documentElement.dataset.theme=localStorage.getItem('dots-theme')||'light';
state.threadIds=stored('dots-threads',{});
if(state.demo){seedDemo();render();}else{const firebase=initializeApp(config);auth=initializeAuth(firebase,{persistence:browserLocalPersistence});db=getFirestore(firebase);render();onAuthStateChanged(auth,watchUser);}
