// Actual staged resource failures/recovery. Each case owns a fresh browser;
// bypassed service workers and local interceptions are explicit test conditions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {resolvePreviewFile,validatePreviewBasePath} from './staged_preview_server.mjs';
import {closeOwnedBrowser} from './worker_coverage.mjs';
import {closeCatalogueCase,catalogueCasePassed} from './catalogue_case.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const stage=path.resolve(argument('web-root',path.join(repo,'build/site')));
const out=path.resolve(argument('out',path.join(repo,'coverage/catalogue-recovery')));
const fault=argument('fault','none');
assert.ok(['none','late-pageerror','context-close'].includes(fault),'Unknown local fault injection');
const validation=spawnSync(process.env.PYTHON||'python',[path.join(repo,'tools/validate_release_manifest.py'),path.join(stage,'web-release-manifest.json')],{encoding:'utf8'});
assert.equal(validation.status,0,validation.stderr||validation.stdout||'Invalid staged release');
const manifest=JSON.parse(fs.readFileSync(path.join(stage,'web-release-manifest.json'),'utf8'));
const allScenarios=[
  {name:'stars-retry-visibility',target:'stars',mode:'reject',width:1440,visibility:true},
  {name:'stars-reject-phone',target:'stars',mode:'reject',width:320},
  {name:'moons-reject-focus-moved',target:'moons',mode:'reject',width:390,moveFocus:true},
  {name:'stars-timeout',target:'stars',mode:'hold',width:1440},
  {name:'moons-timeout',target:'moons',mode:'hold',width:1440},
  {name:'stars-failed-moons-pending',target:'stars',mode:'reject',width:390,holdOther:true},
  {name:'stars-fail-again-during-moon-retry',target:'stars',mode:'reject',width:390,mixedRetry:true},
  {name:'moons-retry-navigation',target:'moons',mode:'reject',width:1440,navigate:true},
];
const selectedCase=argument('case','all');
assert.ok(selectedCase==='all'||allScenarios.some(c=>c.name===selectedCase),'Unknown diagnostic case');
const scenarios=selectedCase==='all'?allScenarios:allScenarios.filter(c=>c.name===selectedCase);
const evidence={scope:'Local actual-browser catalogue rejection, logical deadline, trusted retry, focus/navigation and position preservation. Service workers bypassed; no physical-transfer cancellation claim.',
  full_suite:selectedCase==='all',selected_cases:scenarios.map(c=>c.name),fault,
  service_worker_policy:'Registration rejected by owned fixture; page fetch bypass enabled. Catalogue requests therefore exclude offline-install precache.',
  release_id:manifest.release_id,manifest_sha256:createHash('sha256').update(fs.readFileSync(path.join(stage,'web-release-manifest.json'))).digest('hex'),cases:[],errors:[]};
fs.mkdirSync(out,{recursive:true});
const save=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
validatePreviewBasePath(manifest.base_path);
let requestPolicy=null,activeItem=null;
const server=http.createServer((req,res)=>{
 const owner=activeItem,row={url:req.url,at_ms:Date.now(),finished:false};owner?.server_requests.push(row);
 res.on('finish',()=>{row.finished=true;row.end_ms=Date.now();});
 try {
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname===manifest.base_path+'sw.js'){
   row.fixture_action='disable_service_worker_registration';res.writeHead(503,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end('// Offline installation excluded from this functional fixture.\n');return;
  }
  const file=resolvePreviewFile(stage,manifest.base_path,decodeURIComponent(url.pathname));
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const serve=()=>{
   if(res.destroyed||res.writableEnded)return;
   res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');
   fs.createReadStream(file).on('error',error=>{owner?.page_errors.push('Local fixture read failed: '+error.message);res.destroy();}).pipe(res);
  };
  if(!requestPolicy?.({url,res,serve}))serve();
 }catch(error){owner?.page_errors.push('Local fixture request failed: '+String(error));if(!res.headersSent)res.writeHead(400);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,moduleBase=origin+manifest.base_path+manifest.namespace;
const filenames={stars:'starcatalog.js',moons:'moonelements.js'};
let browser;

async function read(page){
  return page.evaluate(async url=>{
    const s=(await import(url)).store.orrery;
    const byId=id=>document.getElementById(id);
    const button=byId('orreryCatalogueRetry'),panel=byId('orreryCataloguePanel');
    const r=button.getBoundingClientRect();
    return {phase:{...s.catalogueStatus},active:s.active,engine_error:s.engineError,
      scene:{unix:s.renderUnix,metadata:s.metadataUnix,offset:s.offsetYears,anchor:s.anchor,selected:s.selected,az:s.az,el:s.el,radius:s.radius,
        bodies:s.bodies.map(b=>[b.name,b.x_au,b.y_au,b.z_au])},
      status:byId('orreryCatalogueStatus').textContent,panel_visible:panel.checkVisibility(),
      retry_visible:button.checkVisibility(),retry_disabled:button.disabled,retry_fits_width:r.left>=0&&r.right<=innerWidth&&r.width>0,retry_pointer_events:getComputedStyle(button).pointerEvents,
      count:byId('orreryObjectCount').textContent,accuracy:byId('orreryAccuracy').textContent,moon_reason:s.moonsHiddenReason,
      active_element:document.activeElement?.id,overflow:document.documentElement.scrollWidth>innerWidth+1,
      inspector_open:byId('panelToggle').getAttribute('aria-expanded'),trusted_retries:window.__catalogueRetries||[],interactions:window.__catalogueInteractions||[],
      retry_rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit_test:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id};
  },moduleBase+'js/store.js?v='+manifest.release_id);
}

async function phase(page,key,status,timeout=45000){
  await page.waitForFunction(async({url,key,status})=>(await import(url)).store.orrery?.catalogueStatus[key]===status,{timeout,polling:100},
    {url:moduleBase+'js/store.js?v='+manifest.release_id,key,status});
}

try {
 for(const scenario of scenarios){
  const item={...scenario,status:'running',requests:[],server_requests:[],console:[],page_errors:[],cleanup:false};evidence.cases.push(item);activeItem=item;save();
  let context,page;
  const held=[];let retryStarted=false;
  try {
   browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
   item.browser=await browser.version();context=await browser.createBrowserContext();page=await context.newPage();await page.bringToFront();
   await page.setViewport({width:scenario.width,height:900});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
   await page.setBypassServiceWorker(true);await page.setCacheEnabled(false);
   const cdp=await page.createCDPSession();await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['https://*','http://localhost/*',origin+manifest.base_path+'sw.js*']});
   await page.evaluateOnNewDocument(()=>{
    window.__catalogueRetries=[];window.__catalogueInteractions=[];
    for(const type of ['pointerdown','pointerup','click','focusin'])document.addEventListener(type,event=>{
      window.__catalogueInteractions.push({type,target:event.target?.id||event.target?.tagName,trusted:event.isTrusted,x:event.clientX,y:event.clientY,at:performance.now()});
      if(window.__catalogueInteractions.length>64)window.__catalogueInteractions.shift();
      if(type==='click'&&event.target?.id==='orreryCatalogueRetry')window.__catalogueRetries.push({trusted:event.isTrusted,at:performance.now()});
    },true);
   });
   page.on('request',request=>{
    const url=new URL(request.url());
    if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))item.page_errors.push('Unexpected external request '+url.origin);
   });
   // Faults are served by the owned HTTP fixture, leaving worker/engine traffic
   // untouched by page-wide request interception.
   requestPolicy=({url,res,serve})=>{
    const key=Object.keys(filenames).find(key=>url.pathname.endsWith('/'+filenames[key]));
    if(key){
      const row={key,url:origin+url.pathname+url.search,at_ms:Date.now(),action:'continue'};item.requests.push(row);
      const reject=()=>{row.action='reject';res.writeHead(503,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end('// Controlled local catalogue failure.\n');return true;};
      const hold=()=>{row.action='hold';held.push({key,release:serve,row});return true;};
      if(key===scenario.target){
        if(!retryStarted&&scenario.mode==='reject')return reject();
        if(scenario.mixedRetry&&item.requests.filter(r=>r.key===key).length===2)return reject();
        return hold();
      }
      if(scenario.mixedRetry){
        if(!retryStarted)return reject();
        return hold();
      }
      if(scenario.holdOther)return hold();
    }
    return false;
   };
   page.on('console',message=>{if(['warn','error'].includes(message.type()))item.console.push({type:message.type(),message:message.text()});});
   page.on('pageerror',error=>item.page_errors.push(error.message));
   await page.goto(origin+manifest.base_path,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>document.getElementById('schemaVersion')?.textContent?.startsWith('solar-state-snapshot.v'),{timeout:20000});
   await page.click('[data-mode="orrery"]');
   // A target request is mandatory evidence: core-engine failure before import
   // must fail the scenario rather than masquerade as catalogue rejection.
   await page.waitForFunction(async({url,key})=>{const s=(await import(url)).store.orrery;return s.engineError||s.catalogueStatus[key]==='failed';},{timeout:90000,polling:100},
     {url:moduleBase+'js/store.js?v='+manifest.release_id,key:scenario.target});
   const entry=await read(page);assert.equal(entry.engine_error,'','Core initialization failed before target catalogue qualification');
   if(scenario.mixedRetry)await phase(page,'moons','failed');
   assert.ok(item.requests.some(r=>r.key===scenario.target),'Target module was actually requested');
   item.failure_at_ms=Date.now();item.failed=await read(page);save();
   assert.equal(item.failed.engine_error,'');assert.match(item.failed.status,/unavailable/);
   assert.equal(item.failed.inspector_open,'false');assert.equal(item.failed.panel_visible,true);assert.equal(item.failed.retry_visible,true);assert.equal(item.failed.retry_disabled,false);
   assert.equal(item.failed.retry_fits_width,true);assert.equal(item.failed.retry_pointer_events,'auto');assert.equal(item.failed.overflow,false);
   if(scenario.target==='stars')assert.match(item.failed.count,/catalogue unavailable/);
   else assert.match(item.failed.moon_reason,/elements failed to load/);
   if(scenario.mode==='hold'){
    item.deadline_elapsed_ms=item.failure_at_ms-item.requests.find(r=>r.key===scenario.target).at_ms;
    assert.ok(item.deadline_elapsed_ms>=29000&&item.deadline_elapsed_ms<45000,'Recorded logical deadline with polling/host tolerance');
   }
   if(scenario.holdOther)assert.equal(item.failed.phase.moons,'loading');
   await page.screenshot({path:path.join(out,scenario.name+'-failed.png')});
   item.before_retry=await read(page);retryStarted=true;await page.click('#orreryCatalogueRetry');
   item.after_retry_click=await read(page);save();
   assert.equal(item.after_retry_click.trusted_retries.length,1,'Trusted click must actually reach the Retry control');
   if(scenario.mixedRetry){
    await phase(page,'stars','failed');await phase(page,'moons','loading');item.mixed_retry=await read(page);
    assert.equal(item.mixed_retry.retry_disabled,false,'A repeated failure remains retryable while the other retry is pending');
    assert.equal(item.requests.filter(r=>r.key==='moons').length,2);
    await page.click('#orreryCatalogueRetry');
   }
   await phase(page,scenario.target,'loading');
   item.retrying=await read(page);assert.equal(item.retrying.retry_visible,true);assert.equal(item.retrying.retry_disabled,true);
   assert.deepEqual(item.retrying.scene,item.before_retry.scene);
   if(scenario.moveFocus)await page.focus('#orreryCanvas');
   if(scenario.visibility){
    const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
    await page.waitForFunction(()=>document.hidden,{timeout:10000});item.hidden=await read(page);
    await page.bringToFront();await page.waitForFunction(()=>!document.hidden,{timeout:10000});await other.close();
    item.visible_before_release=await read(page);
   }
   if(scenario.navigate){
    await page.click('[data-mode="today"]');item.after_navigation=await read(page);assert.equal(item.after_navigation.active,false);assert.equal(item.after_navigation.panel_visible,false);
   }
   for(const pending of held.filter(h=>h.key===scenario.target)){pending.row.released_at_ms=Date.now();pending.release();}
   if(scenario.navigate){
    await new Promise(resolve=>setTimeout(resolve,300));item.after_late=await read(page);
    assert.equal(item.after_late.active,false);assert.equal(item.after_late.panel_visible,false);assert.equal(item.after_late.active_element,item.after_navigation.active_element);
    await page.click('[data-mode="orrery"]');
   }
   await phase(page,scenario.target,'ready');item.recovered=await read(page);
   assert.deepEqual(item.recovered.scene,item.before_retry.scene);assert.equal(item.recovered.phase[scenario.target],'ready');
   if(scenario.holdOther||scenario.mixedRetry){
    assert.equal(item.recovered.phase.moons,'loading','unrelated pending work must not block failed-resource recovery');
    assert.equal(item.requests.filter(r=>r.key==='moons').length,scenario.mixedRetry?2:1);
    for(const pending of held.filter(h=>h.key!==scenario.target)){pending.row.released_at_ms=Date.now();pending.release();}
   }
   await phase(page,'stars','ready');await phase(page,'moons','ready');
   item.final=await read(page);assert.equal(item.final.retry_visible,false);assert.equal(item.final.overflow,false);
   assert.equal(item.final.trusted_retries.length,scenario.mixedRetry?2:1);assert.ok(item.final.trusted_retries.every(e=>e.trusted));
   if(scenario.visibility)assert.equal(item.final.active_element,item.visible_before_release.active_element,'tab return must not revive stale retry focus intent');
   else if(scenario.moveFocus)assert.equal(item.final.active_element,'orreryCanvas');
   else if(!scenario.navigate)assert.equal(item.final.active_element,'orreryCatalogueStatus');
   for(const key of Object.keys(filenames))assert.ok(item.requests.filter(r=>r.key===key).every(r=>r.url===moduleBase+'js/'+filenames[key]+'?v='+manifest.release_id),'All attempts retain the exact canonical release URL');
   if(scenario.mode==='reject')assert.equal(item.requests.filter(r=>r.key===scenario.target&&r.action==='reject').length,scenario.mixedRetry?2:1);
   assert.deepEqual(item.page_errors,[]);await page.screenshot({path:path.join(out,scenario.name+'-recovered.png')});
   item.status='passed';
  }catch(error){
   item.status='failed';item.error={message:String(error),stack:error.stack};
   if(page)try{item.failure_snapshot=await read(page);await page.screenshot({path:path.join(out,scenario.name+'-failure.png'),fullPage:true});}catch(captureError){item.capture_error=String(captureError);}
   throw error;
  }
  finally {
   await closeCatalogueCase(item,[['context',async()=>{
    if(context){
      if(fault==='late-pageerror'&&page&&!page.isClosed()){
        let onError,timer;
        const observed=new Promise((resolve,reject)=>{onError=resolve;page.once('pageerror',onError);timer=setTimeout(()=>reject(Error('Controlled late-error observation timed out')),5000);});
        try {await page.evaluate(()=>{setTimeout(()=>{throw Error('Controlled late catalogue runtime failure');},0);});await observed;}
        finally {clearTimeout(timer);page.off('pageerror',onError);}
      }
      await context.close();
      if(fault==='context-close')throw Error('Controlled catalogue context cleanup failure');
    }
   }],['browser',async()=>{
    if(browser)await closeOwnedBrowser(browser,{diagnostic:message=>{(item.cleanup_errors??=[]).push({owner:'browser',message});}});
    browser=null;
   }]]);save();
  }
  if(!catalogueCasePassed(item))throw Error('Catalogue case failed runtime/cleanup acceptance: '+scenario.name);
  console.log(JSON.stringify({name:scenario.name,status:item.status,target_requests:item.requests.filter(r=>r.key===scenario.target).length,deadline_ms:item.deadline_elapsed_ms||null}));
 }
}catch(error){evidence.errors.push({message:String(error),stack:error.stack});}
finally {
 if(browser)try{await closeOwnedBrowser(browser);}catch(error){evidence.errors.push({owner:'browser',message:String(error)});}
 try{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){evidence.errors.push({owner:'server',message:String(error)});}
 for(const item of evidence.cases)if(!catalogueCasePassed(item))item.status='failed';
 evidence.status=evidence.errors.length===0&&evidence.cases.length===scenarios.length&&evidence.cases.every(catalogueCasePassed)?'passed':'failed';save();
 console.log(JSON.stringify({status:evidence.status,out,errors:evidence.errors}));process.exitCode=evidence.status==='passed'?0:1;
}
