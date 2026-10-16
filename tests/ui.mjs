import { chromium } from 'playwright';
import http from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const html=await readFile('index.html');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const executablePath=[process.env.CHROMIUM_PATH,'/usr/bin/chromium','/usr/bin/google-chrome-stable','/usr/bin/google-chrome'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('data:'))external.push(r.url());});
const origin=`http://127.0.0.1:${server.address().port}`;
try{
  await page.goto(origin+'/?demo=1');await page.getByText('A little help.').waitFor();
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  // The home page keeps an active chat, and its answers render as real markdown.
  const chat=page.locator('.chat-panel');
  await chat.getByText('Compare three ways to build a calmer morning').first().waitFor();
  assert.ok(await chat.locator('.message-body.md strong').count()>=1,'Markdown bold renders as <strong>');
  assert.equal(await chat.locator('.message-body.md ol li').count()>=3,true,'Markdown lists render as <li>');
  assert.equal(await chat.locator('.message-body.md code').count()>=1,true,'Inline code renders as <code>');
  assert.equal(await chat.locator('.message-body.md blockquote').count(),1,'Blockquotes render');
  assert.equal(await chat.locator('.message-body.md img').count(),0,'Text never becomes an image tag');
  await page.getByText(/Every dot wakes itself/).waitFor();
  // The chat can schedule its own follow-up work.
  await chat.getByRole('button',{name:'Schedule something'}).click();
  await page.getByLabel('What should your dot do?').fill('Wake me about the market each morning');
  await page.getByRole('button',{name:'Create schedule'}).click();
  await page.getByRole('button',{name:'Schedules',exact:true}).click();
  await page.getByRole('heading',{name:'Wake me about the market each morning'}).waitFor();
  await page.getByRole('heading',{name:'Wake up every 30 minutes'}).waitFor();
  await page.getByRole('button',{name:'Pause schedule'}).last().click();
  // The dot builder walks through purpose, abilities, free model and rhythm.
  await page.getByRole('button',{name:'Dot builder',exact:true}).click();
  await page.getByRole('heading',{name:'What is this dot for?'}).waitFor();
  await page.getByLabel('Name').fill('Tide watcher');
  await page.getByLabel('What should it do?').fill('Check the tide table every morning and warn me about early high tides.');
  await page.getByRole('button',{name:'Continue'}).click();
  await page.getByRole('heading',{name:'What may it do on its own?'}).waitFor();
  await page.getByLabel('Branch out and create more dots').uncheck();
  await page.getByRole('button',{name:'Continue'}).click();
  await page.getByRole('heading',{name:/Which free NVIDIA model/}).waitFor();
  assert.equal(await page.locator('.model-card').count()>=8,true,'Every free model is offered');
  await page.getByText('GLM 5.3',{exact:true}).click();
  await page.getByRole('button',{name:'Continue'}).click();
  await page.getByText('Every 30 minutes',{exact:true}).click();
  await page.getByRole('button',{name:'Continue'}).click();
  await page.getByRole('heading',{name:'Ready to create it.'}).waitFor();
  await page.getByRole('button',{name:'Create dot'}).click();
  await page.getByText('Tide watcher',{exact:true}).first().waitFor();
  // The quick edit form still saves a dot with a pinned model.
  await page.getByRole('button',{name:'Dot builder',exact:true}).click();
  await page.getByRole('button',{name:'Quick edit form'}).click();
  const dotDialog=page.getByRole('dialog');
  await dotDialog.getByLabel('Name',{exact:true}).fill('Personal researcher');
  await dotDialog.getByLabel('Instructions',{exact:true}).fill('Research facts and cite sources.');
  await dotDialog.locator('select[name="model"]').selectOption('nvidia/nemotron-3-super-120b-a12b');
  await dotDialog.getByRole('button',{name:'Save dot'}).click();await page.getByText('Personal researcher',{exact:true}).first().waitFor();
  // The free-model choice is stored with the dot and comes back when it is reopened.
  await page.locator('.sidebar').getByRole('button',{name:'Personal researcher'}).click();
  assert.equal(await page.locator('dialog select[name="model"]').inputValue(),'nvidia/nemotron-3-super-120b-a12b','The pinned free model is saved with the dot');
  await page.getByRole('dialog').getByRole('button',{name:'Close dialog'}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Tide watcher'}).click();
  assert.equal(await page.locator('dialog select[name="model"]').inputValue(),'z-ai/glm-5.3','The builder stores the model chosen from the free-model cards');
  await page.getByRole('dialog').getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Memory',exact:true}).click();
  await page.getByRole('button',{name:'Delete memory'}).click();await page.getByText('Memory with intention',{exact:true}).waitFor();
  // Sending from the home chat keeps the thread and escapes hostile markup.
  await page.getByRole('button',{name:'New task'}).click();
  await page.getByLabel('What would you like to get done?').fill('<img src=x onerror=alert(1)> Research **design systems**');
  await page.getByRole('button',{name:'Send task'}).click();await page.getByText('This is an interface preview.',{exact:false}).waitFor();
  assert.equal(await page.locator('.message-body img').count(),0,'Task text must not execute HTML');
  assert.ok(await page.locator('.message.user .message-body strong').count()>=1,'User markdown renders');
  await page.locator('.chat-stream').getByText('<img src=x onerror=alert(1)>',{exact:false}).first().waitFor();
  const scheduleToggle=page.getByRole('button',{name:/schedule follow-ups/});
  assert.equal(await scheduleToggle.getAttribute('aria-pressed'),'true','Dots start able to schedule their own work');
  await scheduleToggle.click();
  await page.getByText(/follow your rhythm/).waitFor();
  assert.equal(await scheduleToggle.getAttribute('aria-pressed'),'false','The chat can be made schedule-free again');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.getByText(/Task .*cancelled/).waitFor();
  await page.getByRole('button',{name:'Toggle color theme'}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.getByRole('button',{name:'Overview',exact:true}).click();await page.screenshot({path:'test-results/dark.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile layout must not overflow');
  await page.getByRole('button',{name:'Toggle navigation'}).click();await page.getByRole('button',{name:'Connections',exact:true}).click();await page.getByRole('heading',{name:'Connected, thoughtfully.'}).waitFor();
  assert.deepEqual(external,[],'The preview must make zero external requests');assert.deepEqual(errors,[],'No browser runtime errors');
  // Production page: Firebase-only outbound destinations, auth dialog and CSP.
  await page.setViewportSize({width:1440,height:1000});await page.route('https://**/*',route=>route.abort());
  await page.goto(origin);await page.getByRole('button',{name:'Sign in',exact:true}).first().click();await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  await page.getByRole('button',{name:'Close dialog'}).click();
  assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(),1);
  assert.equal(await page.locator('.pill').first().innerText().then(t=>/Worker starting|Worker online|Worker asleep/.test(t)),true,'Worker status is explained, not stuck waiting');
  assert.ok(external.every(url=>['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com'].includes(new URL(url).hostname)));
  assert.deepEqual(errors,[]);console.log('PASS: active home chat, markdown rendering, dot builder with free-model picker, self-scheduled work, quick dot form, memory deletion, task submission/cancel, XSS safety, theme, mobile, auth UI, CSP, Firebase-only networking.');
}catch(e){await page.screenshot({path:'test-results/failure.png',fullPage:true});console.error('Browser errors:',errors);console.error('Visible form error:',await page.locator('.form-error').allTextContents());throw e;}finally{await browser.close();server.close();}
