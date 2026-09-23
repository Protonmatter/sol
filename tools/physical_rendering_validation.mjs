#!/usr/bin/env node
// Full application qualification of a pinned, locally served web release. No
// fixture replaces the ephemeris, Worker, source assets, or rendering pipeline.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {PNG} from 'pngjs';
import {closeOwnedBrowser} from './worker_coverage.mjs';
import {createStagedPreviewServer} from './staged_preview_server.mjs';
import {requestContextRestoration} from './context_restore.mjs';
import {assertReplacementContextDraw,assertRestoredFrame} from './restored_frame_admission.mjs';
import {installPhysicalTextureEvidence} from './physical_texture_probe.mjs';
import {installScatteringProducerEvidence} from './scattering_producer_probe.mjs';
import {installProgramSourceEvidence,preparePhysicalSpinEvidence} from './physical_spin_probe.mjs';
import {collectSubmittedEarthSpin} from './earth_spin_probe.mjs';
import {prepareMarsTerrainEvidence} from './mars_terrain_probe.mjs';
import {assertMarsOpticalTerrainSpin} from './mars_spin_assertions.mjs';
import {browserBackendFromArgs,browserBackendArgs,assertBrowserBackend,captureBrowserCapabilities} from './browser_backend.mjs';
import {memoryRequested,runFullFeatureMemoryCheckpoints} from './full_feature_memory.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const webRoot=path.resolve(option('web-root',path.join(repo,'build/physical-preview-01')));
const out=path.resolve(option('out',path.join(repo,'coverage/physical-rendering')));
const chrome=option('browser',process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'));
const marsOpticalAnimation=process.argv.includes('--mars-optical-animation');
const backend=browserBackendFromArgs(process.argv.slice(2)),memory=memoryRequested(process.argv.slice(2));
assert.ok(!memory||marsOpticalAnimation,'--memory requires --mars-optical-animation so the original physical terrain gate runs first');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestBytes=fs.readFileSync(path.join(webRoot,'web-release-manifest.json'));
const manifest=JSON.parse(manifestBytes);
const evidence={schema_version:'physical-rendering-validation.v1',web_root:webRoot,release_namespace:manifest.namespace,
  release_manifest_sha256:digest(manifestBytes),started_at:new Date().toISOString(),
  manifest_base_revision:manifest.source_sha,component_hashes:manifest.components,
  source_binding:'The manifest and per-file hashes identify the tested snapshot. The base revision alone does not establish that working-tree changes were committed.',
  requested_backend:backend,memory_requested:memory,
  validation_source_sha256:Object.fromEntries(['physical_rendering_validation.mjs','browser_backend.mjs','full_feature_memory.mjs',
    'texture_device_telemetry.mjs','texture_device_memory.ps1','context_restore.mjs','earth_spin_probe.mjs','physical_spin_probe.mjs',
    'physical_texture_probe.mjs','scattering_producer_probe.mjs','mars_terrain_probe.mjs','mars_spin_assertions.mjs']
    .map(name=>[name,digest(fs.readFileSync(path.join(repo,'tools',name)))])),
  scope:'Full staged application, real terrain Worker and source assets. Backend identity is observed from the actual application context. Reference rendering does not establish astronomical calibration.',
  source_differences:[],checks:[],captures:[],worker_urls:[],responses:[],request_failures:[],errors:[],console_errors:[]};
for(const asset of manifest.assets){
  const file=path.resolve(webRoot,asset.path);
  assert.ok(file.startsWith(webRoot+path.sep),'Release path escapes staged root');
  const bytes=fs.readFileSync(file);
  assert.equal(bytes.length,asset.size,`Staged byte count ${asset.path}`);
  assert.equal(digest(bytes),asset.sha256,`Staged hash ${asset.path}`);
  if(asset.source_path&&asset.source_sha256){
    const current=path.join(repo,asset.source_path);
    if(fs.existsSync(current)){
      const actual=digest(fs.readFileSync(current));
      if(actual!==asset.source_sha256)evidence.source_differences.push({path:asset.source_path,staged_source_sha256:asset.source_sha256,current_sha256:actual});
    }
  }
}
fs.mkdirSync(out,{recursive:true});
let browser,server,page,timer,expired=false,invariant;
const controller=new AbortController();
const save=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const check=(name,detail={})=>{evidence.checks.push({name,passed:true,...detail});save();console.log(JSON.stringify({check:name,...detail}));};

async function state(){
  return page.evaluate(async()=>{
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import('./js/store.js'+q),s=store.orrery;
    const gl=document.getElementById('orreryCanvas').getContext('webgl2');
    return {contextRestoration:window.__physicalRestoreEvidence,anchor:s.anchor,selected:s.selected,radius:s.radius,az:s.az,el:s.el,engineError:s.engineError,animate:s.animate,solarInspection:s.solarInspection,
      epoch:s.renderUnix,invariant:JSON.stringify([s.renderUnix,s.bodies]),terrainStatus:{...s.terrainStatus},
      terrainRendered:s.terrainRendered?{...s.terrainRendered}:null,opticsEnabled:s.opticsEnabled,opticsStatus:{...s.opticsStatus},
      programStatus:{...s.programStatus},programDiagnostics:{...s.programDiagnostics},
      solarStatus:s.solarStatus,solarMode:s.solarMode,solarPlayback:{...s.solarPlayback},appearanceStatus:{...s.appearanceStatus},
      physicalStatus:document.getElementById('orreryPhysicalStatus')?.textContent,
      appearance:document.getElementById('destinationAppearanceText')?.textContent,
      overflow:document.documentElement.scrollWidth>innerWidth,glError:gl?.getError(),glLost:gl?.isContextLost(),
      shaderErrors:window.__physicalShaderErrors||[],observedGlErrors:window.__physicalGlErrors||[],expectedContextLossErrors:window.__physicalExpectedLossErrors||[]};
  });
}
async function paintAction(action,value){
  await page.evaluate(async(action,value)=>{
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import('./js/store.js'+q),s=store.orrery;
    if(action==='opposite'){s.az+=Math.PI;s.el=-s.el;}
    if(action==='checkbox'){const e=document.getElementById(value.id);e.checked=value.checked;e.dispatchEvent(new Event('change'));return;}
    if(action==='scrub'){const e=document.getElementById('orrerySolarTime');e.value=String(value);e.dispatchEvent(new Event('input'));return;}
    if(action==='close-terrain'){
      window.__physicalTerrainMeshes=[];window.__physicalTerrainDraws=[];
      s.radius*=.35;
    }
    if(action==='restore-radius')s.radius=value;
    document.getElementById('orrerySize').dispatchEvent(new Event('input'));
  },action,value);
}
async function waitReady(body,{terrain=false,solar=false,timeoutMs=40000}={}){
  await page.waitForFunction(async(body,terrain,solar)=>{
    if(window.__physicalShaderErrors?.length)return true;
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const [{store},{appearanceReference,earthCloudRole}]=await Promise.all([import('./js/store.js'+q),import('./js/planetAppearance.js'+q)]);
    const s=store.orrery,roles=['surface'];
    // Native restoration returns from its event before async base compilation.
    // Loss-unavailable source statuses remain stale until its ready continuation.
    if(s.programStatus?.base!=='ready')return s.programStatus?.base==='unavailable'||Boolean(s.engineError);
    await Promise.resolve(); // let the base-ready continuation restart source loads
    if(body==='Earth'){if(s.earthNight!==false)roles.push('night-lights');if(s.earthWeather!==false)roles.push(earthCloudRole(s));}
    const statuses=roles.map(role=>appearanceReference(body,role)).filter(Boolean).map(a=>s.appearanceStatus[a.id]);
    if(terrain){statuses.push(s.terrainStatus[body]);if(s.terrainRendered)statuses.push(s.terrainRendered[body]?'ready':'pending');}if(solar)statuses.push(s.solarStatus);
    // Earth/Mars admissions in this harness are close views. The enabled optical
    // path must include the actual uploaded incident field, not its loading fallback.
    if(s.opticsEnabled&&['Earth','Mars'].includes(body))statuses.push(s.opticsStatus[body]);
    return statuses.includes('unavailable')||statuses.every(x=>x==='ready');
  },{timeout:timeoutMs,polling:100},body,terrain,solar);
  const s=await state();
  assert.deepEqual(s.shaderErrors,[],'Application shader compile/link failure');
  assert.equal(s.engineError,'',`Application graphics resources unavailable: ${s.engineError}`);
  assert.equal(s.programStatus?.base,'ready','Application base programs unavailable');
  if(terrain)assert.equal(s.terrainStatus[body],'ready',`${body} actual terrain unavailable`);
  if(terrain&&s.terrainRendered)assert.equal(s.terrainRendered[body],true,`${body} height mesh is loaded but not rendered`);
  if(solar)assert.equal(s.solarStatus,'ready','Solar source atlas unavailable');
  if(s.opticsEnabled&&['Earth','Mars'].includes(body))assert.equal(s.opticsStatus[body],'ready',`${body} incident refraction field unavailable or not admitted`);
  assert.ok(!Object.values(s.appearanceStatus).includes('unavailable'),`Source unavailable: ${JSON.stringify(s.appearanceStatus)}`);
  return s;
}
async function capture(name){
  let s=await state();
  // Re-admit after toggles, viewport changes, and context recovery as well as
  // initial selection; an A/B capture must never silently use the straight fallback.
  if(s.opticsEnabled&&['Earth','Mars'].includes(s.anchor))s=await waitReady(s.anchor);
  assert.equal(s.invariant,invariant,`${name} changed engine time or positions`);delete s.invariant;
  assert.equal(s.engineError,'',`${name} engine error`);assert.equal(s.overflow,false,`${name} horizontal overflow`);
  assert.equal(s.glError,0,`${name} WebGL error`);assert.equal(s.glLost,false,`${name} context lost`);
  assert.deepEqual(s.shaderErrors,[],`${name} shader compilation`);assert.deepEqual(s.observedGlErrors,[],`${name} prior WebGL errors`);
  const full=path.join(out,`${name}.png`),canvas=path.join(out,`${name}-canvas.png`);
  await page.screenshot({path:full,fullPage:true});await (await page.$('#orreryCanvas')).screenshot({path:canvas});
  evidence.captures.push({name,...s,full,canvas,full_sha256:digest(fs.readFileSync(full)),canvas_sha256:digest(fs.readFileSync(canvas))});
  save();console.log(JSON.stringify({capture:name,anchor:s.anchor,solar:s.solarStatus,terrain:s.terrainStatus,path:full}));
}
function different(a,b){
  const x=PNG.sync.read(fs.readFileSync(path.join(out,`${a}-canvas.png`))),y=PNG.sync.read(fs.readFileSync(path.join(out,`${b}-canvas.png`)));
  assert.equal(x.width,y.width);assert.equal(x.height,y.height);
  let changed=0,sum=0;
  for(let i=0;i<x.data.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(x.data[i+c]-y.data[i+c]);if(d>3)changed++;sum+=d;}
  assert.ok(changed>10,`${a}/${b} has no visible rendering change`);
  check(`${a} versus ${b} changes rendered pixels`,{changed_pixels:changed,mean_channel_delta:sum/(x.width*x.height*3)});
}
async function run(){
  server=createStagedPreviewServer(webRoot,manifest.base_path);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  evidence.browser_launch_args=['--no-sandbox','--disable-dev-shm-usage',...browserBackendArgs(backend),'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'];save();
  browser=await puppeteer.launch({executablePath:chrome,headless:true,timeout:20000,protocolTimeout:45000,signal:controller.signal,args:evidence.browser_launch_args});
  if(expired){await closeOwnedBrowser(browser,{timeoutMs:8000});throw new Error('Browser launch exceeded validation deadline');}
  evidence.browser_version=await browser.version();save();
  page=await browser.newPage();
  page.on('pageerror',e=>evidence.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')evidence.console_errors.push({text:m.text(),location:m.location()});});
  page.on('requestfailed',r=>evidence.request_failures.push({url:r.url(),resource_type:r.resourceType(),error:r.failure()?.errorText}));
  page.on('workercreated',w=>evidence.worker_urls.push(w.url()));
  page.on('response',r=>{if(/terrain|solar|radial-height|\/optics\//.test(r.url()))evidence.responses.push({url:r.url(),status:r.status()});});
  await page.setViewport({width:1440,height:1000});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  if(marsOpticalAnimation){
    await page.evaluateOnNewDocument(installPhysicalTextureEvidence);
    await page.evaluateOnNewDocument(installProgramSourceEvidence);
    await page.evaluateOnNewDocument(installScatteringProducerEvidence);
  }
  await page.evaluateOnNewDocument(()=>{
    const Native=Date,t=Native.parse('2026-09-12T15:00:00Z');
    globalThis.Date=class extends Native{constructor(...args){super(...(args.length?args:[t]));}static now(){return t;}};
    window.__physicalShaderErrors=[];window.__physicalGlErrors=[];window.__physicalExpectedLossErrors=[];
    window.__physicalTerrainMeshes=[];window.__physicalTerrainDraws=[];
    window.__physicalBodyDraws=[];window.__physicalBodyDrawWindow=false;
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      constructor(url,options){super(url,options);this.addEventListener('message',event=>{
        const data=event.data,mesh=data?.mesh;
        if(mesh?.sourceId&&window.__physicalTerrainMeshes.length<64)window.__physicalTerrainMeshes.push({body:data.body,level:data.level,
          sourceId:mesh.sourceId,sourceSha256:mesh.sourceSha256,width:mesh.width,height:mesh.height,
          vertexCount:mesh.pos.length/6,indexCount:mesh.idx.length});
      });}
    };
    const p=WebGL2RenderingContext.prototype,read=p.getShaderParameter,link=p.getProgramParameter,error=p.getError;
    const drawElements=p.drawElements;
    p.drawElements=function(mode,count,type,offset){
      const result=drawElements.call(this,mode,count,type,offset);
      if(count>500000&&window.__physicalTerrainDraws.length<256){
        const program=this.getParameter(this.CURRENT_PROGRAM),location=this.getUniformLocation(program,'u_terrainShadowEnabled');
        if(location&&this.getUniform(program,location)===1)window.__physicalTerrainDraws.push({mode,count,type,
          indexBufferBytes:this.getBufferParameter(this.ELEMENT_ARRAY_BUFFER,this.BUFFER_SIZE)});
      }
      // Restoration evidence only: open between observed loss and the restored capture,
      // so ordinary frames pay no extra synchronous GL queries.
      if(window.__physicalBodyDrawWindow&&window.__physicalBodyDraws.length<512){
        const program=this.getParameter(this.CURRENT_PROGRAM),location=program&&this.getUniformLocation(program,'u_terrainShadowEnabled');
        if(location)window.__physicalBodyDraws.push({count,terrainShadow:this.getUniform(program,location),contextLost:this.isContextLost()});
      }
      return result;
    };
    p.getShaderParameter=function(shader,param){const result=read.call(this,shader,param);if(param===this.COMPILE_STATUS&&!result)window.__physicalShaderErrors.push(this.getShaderInfoLog(shader));return result;};
    p.getProgramParameter=function(program,param){const result=link.call(this,program,param);if(param===this.LINK_STATUS&&!result)window.__physicalShaderErrors.push(this.getProgramInfoLog(program));return result;};
    p.getError=function(){const result=error.call(this);if(result!==this.NO_ERROR){if(result===this.CONTEXT_LOST_WEBGL&&window.__physicalExpectedContextLoss)window.__physicalExpectedLossErrors.push(result);else window.__physicalGlErrors.push(result);}return result;};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}${manifest.base_path}`,{waitUntil:'networkidle0',timeout:45000});
  await page.click('[data-mode="orrery"]');
  await page.waitForFunction(async()=>{
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import('./js/store.js'+q),s=store.orrery;
    // Entry publishes rounded Worker bodies before async GL startup, then
    // rebuilds raw-f64 positions. Freeze the exact invariant after that owner
    // finishes, within this existing wait and the original total deadline.
    return s?.active===true&&s.entering===false&&s.bodies?.length===9&&s.engineError==='';
  },{timeout:40000});
  await paintAction('checkbox',{id:'orreryAnimate',checked:false});
  evidence.capabilities=await page.evaluate(captureBrowserCapabilities);
  evidence.observed_backend=assertBrowserBackend(backend,evidence.capabilities);save();
  invariant=(await state()).invariant;
  check('Pinned staged bytes match release manifest',{assets:manifest.assets.length});
  // Inspect now opens the illustrative dynamic model; these captures are of the
  // observed AIA source, so select it explicitly before waiting for its atlas.
  await page.click('#orreryInspectSun');await page.select('#orrerySolarMode','reconstructed-euv');await waitReady('Sun',{solar:true});
  assert.equal((await state()).anchor,'Sun');await capture('sun-source-front');
  await paintAction('opposite');await capture('sun-unobserved-back');different('sun-source-front','sun-unobserved-back');
  await page.click('#orreryInspectSun');await page.select('#orrerySolarMode','visible');await capture('sun-visible-approximation');
  await page.select('#orrerySolarMode','reconstructed-euv');await waitReady('Sun',{solar:true});
  await paintAction('scrub',10);await capture('sun-source-midpoint');different('sun-source-front','sun-source-midpoint');
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  // Respect the native range step: 19.99 is rounded to 20 by the browser and
  // would legitimately exercise restart-from-end instead of the ending frame.
  await paintAction('scrub',19.95);await page.click('#orrerySolarPlay');
  await page.waitForFunction(async()=>{const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;const {store}=await import('./js/store.js'+q);return store.orrery.solarPlayback.seconds===20&&!store.orrery.solarPlayback.playing;},{timeout:10000,polling:100});
  const ended=await state();assert.equal(ended.invariant,invariant);assert.equal(ended.animate,false);
  check('Reference playback reaches 20 seconds, stops without looping, and preserves paused engine time and positions',{playback:ended.solarPlayback});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  if(typeof ended.solarInspection==='boolean'){
    assert.equal(ended.solarInspection,true,'The Sun button did not enter inspection');
    await page.click('[data-camera-body="Sun"]');assert.equal((await state()).solarInspection,false,'Our system did not restore other bodies');
    await capture('solar-system-overview');
    await page.click('#orreryInspectSun');assert.equal((await state()).solarInspection,true);
    check('The Sun inspection and Our system restoration preserve the physical model');
  }
  await page.select('#orreryAnchor','Earth');await waitReady('Earth');
  assert.equal((await state()).opticsStatus.Earth,'ready','Close Earth did not admit physical optics');
  await capture('earth-optics-on');
  await paintAction('checkbox',{id:'orreryOptics',checked:false});await capture('earth-optics-off');different('earth-optics-on','earth-optics-off');
  await paintAction('checkbox',{id:'orreryOptics',checked:true});
  await paintAction('opposite');await capture('earth-night-lights-on');
  await paintAction('checkbox',{id:'orreryEarthNight',checked:false});await capture('earth-night-lights-off');
  different('earth-night-lights-on','earth-night-lights-off');
  await paintAction('checkbox',{id:'orreryEarthNight',checked:true});
  for(const body of ['Moon','Mars']){
    await page.select('#orreryAnchor',body);await waitReady(body,{terrain:true});
    if(body==='Mars')assert.equal((await state()).opticsStatus.Mars,'ready','Close Mars did not admit physical optics');
    await capture(`${body.toLowerCase()}-terrain-on`);
    await paintAction('checkbox',{id:'orreryTerrain',checked:false});await capture(`${body.toLowerCase()}-terrain-off`);
    different(`${body.toLowerCase()}-terrain-on`,`${body.toLowerCase()}-terrain-off`);
    await paintAction('checkbox',{id:'orreryTerrain',checked:true});
    if(process.argv.includes('--terrain-close-detail')){
      const radius=(await state()).radius;
      await paintAction('close-terrain');
      await page.waitForFunction(body=>window.__physicalTerrainMeshes.some(x=>x.body===body&&x.level===4)
        &&window.__physicalTerrainDraws.some(x=>x.count===783360),{timeout:40000,polling:100},body);
      await waitReady(body,{terrain:true});
      const actual=await page.evaluate(()=>({meshes:window.__physicalTerrainMeshes,draws:window.__physicalTerrainDraws}));
      const prepared=actual.meshes.find(x=>x.body===body&&x.level===4);
      assert.equal(prepared.vertexCount,131841);assert.equal(prepared.indexCount,783360);
      assert.equal(prepared.width,2880);assert.equal(prepared.height,1440);
      assert.ok(actual.draws.some(x=>x.count===prepared.indexCount&&x.indexBufferBytes===prepared.indexCount*4));
      await capture(`${body.toLowerCase()}-terrain-close-level4`);
      check(`${body} level 4 submits actual 256 by 512 geometry with complete terrain shadows`,actual);
      await paintAction('restore-radius',radius);await waitReady(body,{terrain:true});
    }
  }
  assert.ok(evidence.worker_urls.some(x=>x.includes('terrain.worker.js')),'Real terrain Worker never created');
  for(const body of ['moon','mars'])assert.ok(evidence.responses.some(x=>x.url.includes(`${body}-radial-height`)&&x.status===200),`${body} height asset was not loaded`);
  check('Real terrain Worker and both pinned height assets loaded');
  for(const body of ['earth','mars'])assert.ok(evidence.responses.some(x=>x.url.includes(`/optics/${body}-incident-`)&&x.status===200),`${body} incident field asset was not loaded`);
  check('Both incident refraction fields loaded and were admitted for close captures');
  if(process.argv.includes('--context-loss')){
    const workersBefore=evidence.worker_urls.filter(x=>x.includes('terrain.worker.js')).length;
    await page.evaluate(()=>{const c=document.getElementById('orreryCanvas'),gl=c.getContext('webgl2'),ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw new Error('WEBGL_lose_context unavailable');window.__physicalExpectedContextLoss=true;window.__physicalLoss={canvas:c,context:gl,extension:ext,observed:false,lossMs:null};c.addEventListener('webglcontextlost',()=>{window.__physicalLoss.observed=true;window.__physicalLoss.lossMs=performance.now();},{once:true});ext.loseContext();});
    await page.waitForFunction(()=>window.__physicalLoss.observed,{timeout:5000,polling:100});
    await page.evaluate(()=>{window.__physicalBodyDraws=[];window.__physicalBodyDrawWindow=true;});
    // Observe the native event before the app callback rebuilds resources. CDP
    // polling can miss its deadline while the already-restored context is busy.
    // Both the native 10s limit and total 40s ready limit use request time.
    const restoreStarted=performance.now();
    evidence.context_restore=await page.evaluate(requestContextRestoration,{timeoutMs:10000});save();
    const remaining=40000-(performance.now()-restoreStarted);
    assert.ok(remaining>0,'Restored resources exceeded 40000ms from request');
    await waitReady('Mars',{terrain:true,timeoutMs:Math.max(1,Math.floor(remaining))});
    evidence.context_restore=await page.evaluate(()=>{const e=window.__physicalRestoreEvidence;e.ready_ms=performance.now();e.context_lost=document.getElementById('orreryCanvas').getContext('webgl2').isContextLost();window.__physicalExpectedContextLoss=false;return e;});
    assert.equal(evidence.context_restore.context_lost,false,'Ready context remained lost');
    assert.ok(Number.isFinite(evidence.context_restore.callback_completed_ms),'Application restoration callback did not return');
    assert.ok(evidence.context_restore.event_ms-evidence.context_restore.request_ms<=10000,'Native restoration exceeded 10000ms');
    assert.ok(evidence.context_restore.ready_ms-evidence.context_restore.request_ms<=40000,'Actual terrain/optics readiness exceeded 40000ms from request');
    await capture('mars-context-restored');
    // Readiness statuses alone admitted a blank restored frame. Require a body draw the
    // replacement context actually submitted, and decode the restored capture itself.
    const replacementDraws=await page.evaluate(()=>{window.__physicalBodyDrawWindow=false;return window.__physicalBodyDraws;});
    evidence.context_restore.replacement_draws=assertReplacementContextDraw(replacementDraws);
    evidence.context_restore.restored_frame=assertRestoredFrame(fs.readFileSync(path.join(out,'mars-context-restored-canvas.png')));save();
    assert.ok(evidence.worker_urls.filter(x=>x.includes('terrain.worker.js')).length>workersBefore,'Terrain Worker was not recreated after context restoration');
    check('Context restoration recreates actual terrain resources and preserves engine state');
  }
  const phenomenonManifest=path.join(webRoot,manifest.namespace,'planet-phenomena.v1.json');
  if(fs.existsSync(phenomenonManifest)){
    for(const item of JSON.parse(fs.readFileSync(phenomenonManifest)).observations){
      if((await state()).anchor!==item.body){await page.select('#orreryAnchor',item.body);await waitReady(item.body);}
      await page.select('.planet-phenomena__select',item.id);
      await page.waitForFunction(()=>{const image=document.querySelector('.planet-phenomena__image'),status=document.querySelector('.planet-phenomena__status');return status?.textContent.includes('unavailable')||image&&!image.hidden&&image.complete&&image.naturalWidth>0;},{timeout:15000});
      const shown=await page.evaluate(()=>{const image=document.querySelector('.planet-phenomena__image');return {dimensions:[image.naturalWidth,image.naturalHeight],source:document.querySelector('.planet-phenomena__source').href,status:document.querySelector('.planet-phenomena__status').textContent,title:document.querySelector('.planet-phenomena__heading').textContent};});
      assert.deepEqual(shown.dimensions,item.asset.dimensions,`${item.id} source dimensions`);
      assert.equal(shown.source,item.source_page);assert.equal(shown.title,item.title);assert.ok(shown.status.includes('verified'));
      await capture(`mission-${item.id}`);check(`Actual app gallery loads ${item.id}`,shown);
    }
  }
  await page.setViewport({width:390,height:844});await page.select('#orreryAnchor','Earth');await waitReady('Earth');await capture('earth-mobile-390');
  check('390 pixel viewport has no horizontal overflow and preserves engine state');
  assert.deepEqual(evidence.errors,[],'Page errors');assert.deepEqual(evidence.console_errors,[],'Console errors');
  check('No page, console, shader compilation, or WebGL errors');
  if(marsOpticalAnimation){
    // All existing paused-engine/gallery/mobile predicates above remain intact.
    // This separate final pass intentionally advances the real engine via its UI.
    await page.setViewport({width:1440,height:1000});await page.select('#orreryAnchor','Mars');
    await paintAction('checkbox',{id:'orreryTerrain',checked:true});
    await paintAction('checkbox',{id:'orreryOptics',checked:true});
    await waitReady('Mars',{terrain:true});await paintAction('close-terrain');
    // A cached level-4 mesh need not emit another Worker message. The actual
    // indexed draw is only readiness; full source/buffer proof follows below.
    await page.waitForFunction(()=>window.__physicalTerrainDraws.some(x=>x.count===783360),{timeout:40000,polling:100});
    await page.evaluate(async()=>{
      const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
      const {store}=await import('./js/store.js'+q);store.orrery.hdrEnabled=true;
      document.getElementById('orrerySize').dispatchEvent(new Event('input'));
    });
    await page.waitForFunction(async()=>{
      const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
      const {store}=await import('./js/store.js'+q);return store.orrery.hdrStatus?.state==='ready'&&store.orrery.hdrStatus.presented;
    },{timeout:20000,polling:100});
    const beforePreparation=await state();assert.equal(beforePreparation.invariant,invariant);
    evidence.mars_physical_preparation=await page.evaluate(preparePhysicalSpinEvidence,{body:'Mars',terrain:true});
    evidence.mars_terrain_preparation=await page.evaluate(prepareMarsTerrainEvidence);save();
    assert.equal((await state()).invariant,invariant,'Terrain evidence preparation advanced the engine');
    await page.$eval('#orrerySpeedPresets button[data-dps="7"]',button=>button.click());
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    await paintAction('checkbox',{id:'orreryAnimate',checked:true});
    let probe;
    try {
      probe=await page.evaluate(collectSubmittedEarthSpin,{body:'Mars',physicalEvidence:true,requireTerrainEvidence:true});
      probe.validation_source_sha256=Object.fromEntries(['earth_spin_probe.mjs','physical_spin_probe.mjs',
        'physical_texture_probe.mjs','scattering_producer_probe.mjs','mars_terrain_probe.mjs','mars_spin_assertions.mjs'].map(name=>[name,digest(fs.readFileSync(path.join(repo,'tools',name)))]));
      evidence.mars_optical_animation=probe;save();
      const rotation=assertMarsOpticalTerrainSpin(probe);
      probe.capabilities=await page.evaluate(captureBrowserCapabilities);
      probe.observed_backend=assertBrowserBackend(backend,probe.capabilities);save();
      assert.throws(()=>assertMarsOpticalTerrainSpin({...probe,samples:probe.samples.map(sample=>({...sample,
        model:probe.samples[0].model,normal:probe.samples[0].normal}))}),/frozen|cap/);
      await page.screenshot({path:path.join(out,'mars-level4-physical-animation.png'),fullPage:true});
      const final=await state();assert.equal(final.glError,0);assert.equal(final.glLost,false);
      assert.deepEqual(final.shaderErrors,[]);assert.deepEqual(final.observedGlErrors,[]);
      assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.console_errors,[]);
      check('Mars level-4 source geometry, physical optical fields, animation and matching HDR final draws',{...rotation,
        sourceId:probe.terrain.sourceId,sourceSha256:probe.terrain.sourceSha256,finalEpoch:final.epoch});
    } finally {
      await paintAction('checkbox',{id:'orreryAnimate',checked:false});
      await page.evaluate(()=>globalThis.__solMarsTerrainEvidence?.dispose());
    }
  }
}
try{
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();reject(new Error('Full application validation exceeded 240 seconds'));},240000);});
  await Promise.race([run(),deadline]);
  clearTimeout(timer);timer=null;
  evidence.original_gates={passed:true,deadline_ms:240000,completed_at:new Date().toISOString()};save();
  if(memory)await runFullFeatureMemoryCheckpoints({browser,page,body:'Mars',backend,originalReceipt:evidence.original_gates,
    save:observation=>{evidence.memory=observation;save();}});
  // Optional restoration/sampling must not hide errors after original acceptance.
  assert.deepEqual(evidence.errors,[],'Page errors after original acceptance');
  assert.deepEqual(evidence.console_errors,[],'Console errors after original acceptance');
  evidence.passed=true;
}catch(error){
  evidence.passed=false;evidence.failure=String(error?.stack||error);
  if(page&&!page.isClosed())try{evidence.failure_state=await state();}catch(diagnostic){evidence.diagnostic_error=String(diagnostic);}
  console.error(evidence.failure);process.exitCode=1;
}finally{
  clearTimeout(timer);controller.abort();if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});
  server?.closeAllConnections();server?.close();evidence.finished_at=new Date().toISOString();save();
}
