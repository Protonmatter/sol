// Local staged-artifact acceptance. Never import application code into Node;
// browser diagnostics use the artifact's canonical exported module identities.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {createStagedPreviewServer,validatePreviewBasePath} from './staged_preview_server.mjs';
import {releaseModulePath} from './release_module_urls.mjs';
import {assertSystemLabelLayout,readSystemLabelLayout} from './system_label_layout.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=(name,fallback)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const viewports=[{width:320,height:844},{width:390,height:844},{width:1440,height:900}];

// Serialized into Chromium. A text node must have real rendered geometry and
// pass browser visibility checks. Closed disclosures, hidden/inert panels and
// screen-reader-only clipped text are intentionally absent from the visual audit.
export function readStructuralLayout({canvasId=null}={}){
  const visible=node=>{
    if(!node||node.closest('[hidden],[inert]'))return false;
    if(!node.checkVisibility({opacityProperty:true,visibilityProperty:true}))return false;
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    if(style.clipPath==='inset(50%)'||(style.clip&&style.clip!=='auto')||rect.width<=1||rect.height<=1)return false;
    return true;
  };
  const identify=node=>node.id?`#${node.id}`:node.tagName.toLowerCase()+'.'+[...node.classList].join('.');
  const smallText=[],textSamples=[],seen=new Set();
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const text=walker.currentNode,node=text.parentElement;
    if(!text.textContent.trim()||!visible(node)||node.closest('script,style,option'))continue;
    const range=document.createRange();range.selectNodeContents(text);
    if(![...range.getClientRects()].some(rect=>rect.width>1&&rect.height>1))continue;
    const fontSize=parseFloat(getComputedStyle(node).fontSize),key=identify(node)+':'+text.textContent.trim();
    if(seen.has(key))continue;seen.add(key);
    const row={selector:identify(node),text:text.textContent.trim().slice(0,120),fontSize};
    textSamples.push(row);if(!Number.isFinite(fontSize)||fontSize<11.99)smallText.push(row);
  }
  for(const node of document.querySelectorAll('input,select,textarea'))if(visible(node)){
    const fontSize=parseFloat(getComputedStyle(node).fontSize);
    if(!Number.isFinite(fontSize)||fontSize<11.99)smallText.push({selector:identify(node),text:'form control',fontSize});
  }
  const targets=[...document.querySelectorAll('.mode-button,.workspace-actions button,#systemJumps button,#destinationOverview button,#inspectorClose,#orreryFocusSelected,#orreryFocusSystem')]
    .filter(visible).map(node=>{const r=node.getBoundingClientRect();return {selector:identify(node),text:node.textContent.trim(),width:r.width,height:r.height,left:r.left,right:r.right};});
  const undersizedTargets=targets.filter(row=>row.width<43.99||row.height<43.99);
  const clippedTargets=targets.filter(row=>row.left<-.5||row.right>innerWidth+.5);
  const node=canvasId?document.getElementById(canvasId):null,r=node?.getBoundingClientRect();
  const canvas=r?{x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:node.clientWidth,clientHeight:node.clientHeight,
    visibleHeight:Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0)),backingWidth:node.width,backingHeight:node.height}:null;
  return {viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth+1,
    smallText,textCount:textSamples.length,minFontSize:Math.min(...textSamples.map(row=>row.fontSize)),undersizedTargets,clippedTargets,targets,canvas};
}

export function assertStructuralLayout(layout,{usefulCanvas=false}={}){
  assert.equal(layout.overflow,false,'document has no horizontal overflow');
  assert.ok(layout.textCount>0,'visual typography audit must inspect rendered text');
  assert.deepEqual(layout.smallText,[],'every rendered text/control uses at least 12 CSS pixels');
  assert.deepEqual(layout.undersizedTargets,[],'primary navigation/actions meet 44×44 CSS-pixel targets');
  assert.deepEqual(layout.clippedTargets,[],'primary actions remain within the horizontal viewport');
  if(usefulCanvas){
    assert.ok(layout.canvas?.height>=320,'scene retains at least 320 CSS pixels of canvas height');
    assert.ok(layout.canvas.width>=Math.min(600,layout.viewport.width*.75),'scene retains a useful canvas width');
    assert.ok(layout.canvas.visibleHeight>=Math.min(240,layout.viewport.height*.28),'scene has useful canvas area in the initial viewport');
  }
}

// Measures actual worker request/result wall time, not pure engine execution.
// Initialization and compute are separate records; payload/response data are
// neither retained nor modified. Native postMessage and event semantics remain.
export function installWorkerTiming(){
  const NativeWorker=window.Worker,trace=[];window.__structuralWorkerTiming=trace;let serial=0;
  window.Worker=class extends NativeWorker{
    constructor(url,options){
      super(url,options);const worker=++serial,pending=new Map(),post=this.postMessage,terminate=this.terminate;
      this.postMessage=function(message,...rest){
        if(message?.protocol==='sol-worker.v1'&&['initialize','compute'].includes(message.type)){
          const row={worker,url:String(url),engine:message.engine,generation:message.generation,phase:message.type,start:performance.now(),status:'pending'};
          pending.set(message.generation,row);trace.push(row);if(trace.length>128)trace.shift();
        }
        return post.call(this,message,...rest);
      };
      this.addEventListener('message',event=>{
        const row=pending.get(event.data?.generation);if(!row)return;
        row.end=performance.now();row.durationMs=row.end-row.start;row.status=event.data.type;
        pending.delete(event.data.generation);
      });
      this.terminate=function(){for(const row of pending.values()){row.status='cancelled';row.end=performance.now();row.durationMs=row.end-row.start;}pending.clear();return terminate.call(this);};
    }
  };
}

async function main(){
  if(process.argv.includes('--help')){
    console.log('node tools/structural_acceptance.mjs --web-root=build/site-structural-final1 --out=build/structural-acceptance-final1 [--chrome=/usr/bin/chromium]');return;
  }
  const root=path.resolve(argument('web-root',path.join(repo,'build/site-structural-final1')));
  const out=path.resolve(argument('out',path.join(repo,'build/structural-acceptance-final1')));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'web-release-manifest.json'),'utf8'));
  const base=validatePreviewBasePath(manifest.base_path),namespace=base+manifest.namespace;
  const modules=Object.fromEntries(['store','orrery','bodyData'].map(name=>[name,namespace+releaseModulePath(manifest,`js/${name}.js`)]));
  const server=createStagedPreviewServer(root,base);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const evidence={status:'running',release:manifest.release_id,root,base,browser:null,rendering:'Chromium software GL / SwiftShader',
    qualification:'Functional/reflow evidence only; not physical-device GPU qualification or compositor-visible paint timing.',
    layouts:[],layoutFailures:[],frames:[],inspector:[],focus:[],workerTimings:[],pageErrors:[],externalRequests:[]};
  fs.mkdirSync(out,{recursive:true});let browser,page;
  try{
    browser=await puppeteer.launch({executablePath:argument('chrome',process.env.CHROME_BIN||'/usr/bin/chromium'),headless:true,
      args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
    evidence.browser=await browser.version();page=await browser.newPage();page.setDefaultTimeout(30000);
    page.on('pageerror',error=>evidence.pageErrors.push(error.stack||error.message));
    await page.setBypassServiceWorker(true);await page.evaluateOnNewDocument(installWorkerTiming);
    // Page-level interception stalls module-worker imports in this pinned Chromium/driver.
    // The resolver blocks external hosts; observe attempts without pausing worker traffic.
    page.on('request',request=>{
      const url=new URL(request.url());
      if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol))evidence.externalRequests.push(url.origin+url.pathname);
    });
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.setViewport(viewports[2]);await page.goto(origin+namespace+'index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body.dataset.appReady==='true',{timeout:60000});
    const settleFrame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const audit=async(label,canvasId=null)=>{
      await page.evaluate(()=>window.scrollTo(0,0));await settleFrame();
      if(canvasId==='skyCanvas')await page.waitForFunction(()=>{
        const canvas=document.getElementById('skyCanvas'),rect=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,2);
        const geometry=window.__skyDebug?.().geom;
        return canvas.width===Math.round(rect.width*scale)&&canvas.height===Math.round(rect.height*scale)
          &&geometry?.cx===canvas.width/2&&geometry?.cy===canvas.height/2;
      },{timeout:5000});
      const layout=await page.evaluate(readStructuralLayout,{canvasId});evidence.layouts.push({label,...layout});
      await page.screenshot({path:path.join(out,`${label}.png`),fullPage:true});
      try{assertStructuralLayout(layout,{usefulCanvas:!!canvasId});}catch(error){evidence.layoutFailures.push({label,message:error.message});}
      return layout;
    };
    for(const viewport of viewports){await page.setViewport(viewport);await audit(`sun-${viewport.width}`);}
    await page.setViewport(viewports[2]);await page.click('[data-mode="orrery"]');
    await page.waitForFunction(async url=>{
      const s=(await import(url)).store.orrery;return s?.active&&s.bodies.length===9&&document.querySelector('#orreryLabels [data-object-id]');
    },{timeout:60000},modules.store);
    await page.evaluate(async urls=>{
      window.__structuralStore=(await import(urls.store)).store;
      window.__structuralOrrery=await import(urls.orrery);
      window.__structuralBody=await import(urls.bodyData);
      const play=document.getElementById('orreryAnimate');play.checked=false;play.dispatchEvent(new Event('change'));
    },modules);await settleFrame();
    const sceneState=()=>page.evaluate(()=>{
      const s=window.__structuralStore.orrery,c=document.getElementById('orreryCanvas'),b=window.__structuralBody.BODY[s.anchor];
      const extent=b?Math.max(b.radiusKm,b.rings?.outerKm||0)/window.__structuralBody.AU_KM:0;
      const fill=extent/(Math.sqrt(s.radius*s.radius-extent*extent)*Math.tan(21*Math.PI/180)*Math.min(1,c.clientWidth/c.clientHeight));
      return {anchor:s.anchor,selected:s.selected,focusMode:s.focusMode,radius:s.radius,extent,shortAxisFill:fill,
        physical:s.bodies.map(b=>[b.name,b.x_au,b.y_au,b.z_au]),quality:s.renderQuality,catalogues:s.catalogueStatus};
    });
    for(const viewport of viewports){
      await page.setViewport(viewport);
      for(const body of ['Earth','Saturn']){
        await page.click(`[data-camera-body="${body}"]`);await settleFrame();
        const bodyState=await sceneState();assert.equal(bodyState.focusMode,'inspect-body');assert.equal(bodyState.anchor,body);
        assert.ok(bodyState.shortAxisFill>.65&&bodyState.shortAxisFill<.9,`${body} body inspection fills the limiting axis`);
        const labelLayout=await page.evaluate(readSystemLabelLayout),labels=assertSystemLabelLayout(labelLayout);
        await audit(`${body.toLowerCase()}-body-${viewport.width}`,'orreryCanvas');
        // A native click runs the real inspector handler; these are DOM/RAF
        // timings and intentionally separate from renderer input and worker time.
        const inspector=await page.evaluate(async()=>{
          const start=performance.now();document.getElementById('panelToggle').click();
          const domVisibleMs=performance.now()-start,visible=!document.getElementById('viewInspector').hidden;
          await new Promise(requestAnimationFrame);return {domVisibleMs,nextRafMs:performance.now()-start,visible,method:'native button.click + handler completion / next RAF; not visible-paint completion'};
        });assert.equal(inspector.visible,true);evidence.inspector.push({width:viewport.width,body,...inspector});
        await page.$eval('#orreryQuality',node=>{const details=node.closest('details');if(!details.open)details.querySelector('summary').click();});
        const inspectorLayout=await page.evaluate(readStructuralLayout,{});evidence.layouts.push({label:`${body}-inspector-${viewport.width}`,...inspectorLayout});assertStructuralLayout(inspectorLayout);
        await page.$eval('#orreryFocusSystem',button=>{const details=button.closest('details');if(details&&!details.open)details.querySelector('summary').click();});
        await page.click('#orreryFocusSystem');
        if(body==='Saturn')await page.waitForFunction(()=>window.__structuralStore.orrery.catalogueStatus.moons==='ready',{timeout:60000});
        await page.click('#inspectorClose');await settleFrame();
        const systemState=await sceneState();assert.equal(systemState.focusMode,'inspect-system');
        assert.ok(systemState.radius/bodyState.radius>(body==='Earth'?40:20),`${body} explicit system action fits its satellites`);
        assert.deepEqual(systemState.physical,bodyState.physical,'framing never changes scientific coordinates');
        const systemLabels=assertSystemLabelLayout(await page.evaluate(readSystemLabelLayout));
        await audit(`${body.toLowerCase()}-system-${viewport.width}`,'orreryCanvas');
        evidence.focus.push({width:viewport.width,body,bodyState,systemState,labels,systemLabels});
        await page.click(`[data-camera-body="${body}"]`);await settleFrame();
        const burst=await page.evaluate(async()=>{
          const canvas=document.getElementById('orreryCanvas'),prior=window.__structuralOrrery.orreryFrameTimings().at(-1)?.timestamp??-Infinity;
          for(let i=0;i<8;i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:2,bubbles:true,cancelable:true}));
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const samples=window.__structuralOrrery.orreryFrameTimings().filter(sample=>sample.timestamp>prior&&sample.inputToFrameMs!==null);
          return {samples,method:'8 synchronous wheel events; CPU scheduler input→RAF start / submission completion, not GPU/compositor paint'};
        });assert.ok(burst.samples.length>=1,'input burst emits measured scheduler samples');
        assert.equal(burst.samples.filter(sample=>sample.completed&&sample.rendered).length,1,'synchronous wheel burst coalesces into one submitted scene frame');
        evidence.frames.push({width:viewport.width,body,...burst});
      }
    }
    await page.click('[data-mode="sky"]');
    await page.waitForFunction(()=>document.body.dataset.viewCode==='ready'&&document.body.dataset.viewCodeName==='sky'&&!!window.__skyDebug?.().snap,{timeout:60000});
    for(const viewport of viewports){await page.setViewport(viewport);await audit(`sky-${viewport.width}`,'skyCanvas');}
    // Use a real local daytime calculation, not a synthetic visibility fixture.
    await page.click('#timelineToggle');await page.select('#skyTimeMode','utc');
    await page.$eval('#skyTime',node=>{node.value='2026-06-21T16:00';node.dispatchEvent(new Event('change'));});
    const dayJd=Date.parse('2026-06-21T16:00:00Z')/86400000+2440587.5;
    await page.waitForFunction(jd=>Math.abs((window.__skyDebug?.().snap?.time.jd_utc??0)-jd)<1e-9,{timeout:60000},dayJd);
    evidence.daylight=await page.evaluate(()=>{
      const debug=window.__skyDebug(),stars=new Set(debug.snap.bodies.filter(body=>body.kind==='star'&&body.name!=='Sun').map(body=>body.name));
      return {sunAltitude:debug.snap.bodies.find(body=>body.name==='Sun').alt_deg,
        plottedStars:debug.plotted.filter(body=>stars.has(body.name)).length,
        accessibleStars:[...document.querySelectorAll('#skyList [data-object-id]')].filter(node=>stars.has(node.dataset.objectId)).length};
    });
    assert.ok(evidence.daylight.sunAltitude>20,'actual daytime Sun is above the geometric horizon');
    assert.equal(evidence.daylight.plottedStars,0,'daylight suppresses star markers and hit targets');
    assert.ok(evidence.daylight.accessibleStars>0,'daylight retains accessible catalogue selection');
    await page.click('#inspectorClose');await page.setViewport(viewports[1]);await audit('sky-day-390','skyCanvas');
    evidence.workerTimings=await page.evaluate(()=>window.__structuralWorkerTiming);
    evidence.workerTimingDefinition='initialize = worker initialization wall time; compute = request/result wall time including engine, queue/transfer and main-thread delivery. Not isolated WASM compute or renderer latency.';
    assert.ok(evidence.workerTimings.some(row=>row.engine==='system'&&row.phase==='compute'&&row.status==='result'),'actual System snapshot result timing recorded separately');
    assert.ok(evidence.workerTimings.some(row=>row.engine==='ephemeris'&&row.phase==='compute'&&row.status==='result'),'actual Sky snapshot result precedes responsive captures');
    assert.deepEqual(evidence.externalRequests,[],'staged scenario requests only its local artifact');
    assert.deepEqual(evidence.pageErrors,[],'staged scenario has no uncaught page errors');
    assert.deepEqual(evidence.layoutFailures,[],'all viewport layout checks pass');evidence.status='passed';
  }catch(error){
    evidence.status='failed';evidence.failure=error.stack||String(error);
    if(page&&!page.isClosed()){
      try{evidence.workerTimings=await page.evaluate(()=>window.__structuralWorkerTiming||[]);await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});}catch(diagnostic){evidence.captureError=String(diagnostic);}
    }
    process.exitCode=1;
  }finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify({status:evidence.status,report:path.join(out,'report.json'),layouts:evidence.layouts.length,focus:evidence.focus.length,frames:evidence.frames.length,pageErrors:evidence.pageErrors,failure:evidence.failure}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
