// Owned local Chromium profile. All network bodies share one calibrated budget.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {createPacedResponder} from './paced_http.mjs';
import {resolvePreviewFile} from './staged_preview_server.mjs';
import {maximumSessionShift,nearestRank,assessStartupProfile} from './startup_acceptance.mjs';
import {installWorkerActivity,waitForWorkerActivityIdle} from './worker_activity.mjs';
import {installFeedbackProbe} from './startup_feedback.mjs';
import {classifyCompleteReadCancellations} from './completed_fetch_reports.mjs';
import {assessedFeedbackLatency} from './native_feedback.mjs';
import {collectContextFailures,readbackProfileArtifact} from './profile_completion.mjs';
import {browserBackendFromArgs,browserBackendArgs,assertBrowserBackend,captureBrowserCapabilities,readBrowserFeatureStatus} from './browser_backend.mjs';
import {createWorkerExceptionObserver} from './worker_exception_observer.mjs';
import {closeOwnedBrowserVerified} from './worker_coverage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=(name,fallback)=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
if(process.argv.includes('--help')){
  console.log('node tools/startup_profile.mjs --web-root=STAGE --out=NEW_DIRECTORY --expected-browser=Chrome/VERSION [--pairs=10] [--backend=swiftshader|swiftshader-fallback|native --expected-renderer=EXACT] [--inject-late-error] [--inject-late-worker-error] [--inject-cleanup-error]');
  process.exit(0);
}
const webRoot=path.resolve(argument('web-root','build/site'));
const out=path.resolve(argument('out','coverage/startup-profile'));
const expectedBrowser=argument('expected-browser',null),pairs=Number(argument('pairs','10'));
const backend=browserBackendFromArgs(process.argv.slice(2),{allowSoftwareFallback:true}),expectedRenderer=argument('expected-renderer',null);
assert.ok(expectedBrowser,'an exact --expected-browser pin is required');assert.ok(Number.isSafeInteger(pairs)&&pairs>=1&&pairs<=10,'pairs must be 1–10');
assert.ok(backend!=='native'||expectedRenderer,'native comparison requires an exact --expected-renderer pin');
assert.ok(!fs.existsSync(out),'choose a new output directory; prior evidence is retained');
assert.ok(!out.startsWith(webRoot+path.sep)&&out!==webRoot,'profile outputs must be outside the immutable stage');
fs.mkdirSync(out,{recursive:true});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const manifestFile=path.join(webRoot,'web-release-manifest.json'),manifest=readJSON(manifestFile);
const validation=spawnSync(process.env.PYTHON||'python',[path.join(root,'tools/validate_release_manifest.py'),manifestFile],{cwd:root,encoding:'utf8'});
fs.writeFileSync(path.join(out,'artifact-validation.log'),(validation.stdout||'')+(validation.stderr||''));
assert.equal(validation.status,0,'immutable artifact admission failed');
const visual=readJSON(path.join(webRoot,manifest.namespace,'visual-assets.v1.json'));
const image=visual.observed_images[0],imageAsset=manifest.assets.find(item=>item.path===manifest.namespace+image.path);
assert.equal(imageAsset.sha256,image.sha256);assert.equal(imageAsset.size,image.bytes);assert.equal(imageAsset.role,'critical');
const tasks=[
  {task:'research',selector:'#exploreResearch',condition:'research'},
  {task:'inspector',selector:'#panelToggle',condition:'inspector'},
  {task:'timeline',selector:'#timelineToggle',condition:'timeline'},
  {task:'sky',selector:'.mode-button[data-mode="sky"]',condition:'sky'},
  {task:'system',selector:'.mode-button[data-mode="orrery"]',condition:'system'},
  {task:'focus',selector:'#focusToggle',condition:'focus'},
];
const artifactPins=Object.fromEntries([...manifest.assets.map(item=>item.path),'web-release-manifest.json',manifest.namespace+'web-release-manifest.json']
  .map(name=>[name,hash(fs.readFileSync(path.join(webRoot,name)))]));
function sourcePins(){
  const result=spawnSync('git',['ls-files','-c','-o','--exclude-standard','-z'],{cwd:root,encoding:'utf8'});
  if(result.status!==0)throw new Error('source inventory requires the selected Git worktree');
  return Object.fromEntries([...new Set(result.stdout.split('\0').filter(Boolean))].sort().filter(name=>fs.existsSync(path.join(root,name))&&fs.statSync(path.join(root,name)).isFile())
    .map(name=>[name,hash(fs.readFileSync(path.join(root,name)))]));
}
const sourceBefore=sourcePins();
for(const asset of manifest.assets)if(asset.source_path)assert.equal(sourceBefore[asset.source_path],asset.source_sha256,'stage source owner drift: '+asset.source_path);
fs.writeFileSync(path.join(out,'source-inputs.json'),JSON.stringify(sourceBefore,null,2)+'\n');
fs.writeFileSync(path.join(out,'artifact-inputs.json'),JSON.stringify(artifactPins,null,2)+'\n');
const expected={imagePath:manifest.base_path+manifest.namespace+image.path,imageSha256:image.sha256,width:1024,height:1024,tasks:tasks.map(task=>task.task)};
const bundleManifest=readJSON(path.join(webRoot,manifest.data_bundle.manifest_path));
const expectedBundleIdentity={bundle_id:manifest.data_bundle_id,source_bundle_id:bundleManifest.source_bundle_id,manifest_sha256:manifest.data_bundle.manifest_sha256};
const validatedJSONPaths=[manifest.namespace+'web-release-manifest.json',manifest.data_bundle.manifest_path,
  ...bundleManifest.components.map(component=>path.posix.join(path.posix.dirname(manifest.data_bundle.manifest_path),component.path))];
const report={schema_version:'sol-startup-profile.v1',mode:pairs===10?'controlled-profile':'diagnostic-sample',qualificationGranted:false,
  protocol:{expectedBrowser,expectedRenderer,pairs,viewport:{width:1440,height:900},pageCpuSlowdown:4,workerCpu:'native',backend,rateBytesPerSecond:200000,latencyMs:150,
    burstBytes:4096,tickMs:10,compression:'none',httpCache:'disabled; verified SW Cache API retained for warm return',
    networkModel:'One response-body token budget across page and worker requests; headers share minimum latency but their bytes and upstream traffic are not paced.',
    warmDefinition:'Fresh document in the same isolated context after verified core installation; prior page leaves on Sun Observe.',
    taskTiming:'Trusted click timestamp to visible DOM feedback; retain the frame probe and native next-render timing(+4ms rounding bound), assess their maximum. Native timing requires synchronous dispatch feedback. Eventual accepted model readiness checked separately.',
    tasks,percentiles:'nearest rank, cold and warm separately',cls:'largest unexpected-shift session; <1s gap and <5s duration; recorded view/tasks only',
    references:['https://web.dev/articles/cls','https://github.com/GoogleChrome/web-vitals/blob/main/src/lib/LayoutShiftManager.ts'],
    boundaries:['Native cohort supplements the recorded SwiftShader cohort and does not clear its failures','No accepted P00 baseline identity supplied','No physical-device frame qualification','No field INP claim','No astronomical accuracy or hosted/deployment qualification']},
  manifestSha256:artifactPins['web-release-manifest.json'],releaseId:manifest.release_id,expected,runs:[],errors:[],cleanupErrors:[],targets:[]};
let browser,ownedBrowserProcess,activeContext,server,workerObservation,currentGroup='calibration',completed=false,origin;
const contexts=new Map(),responder=createPacedResponder(),assets=new Map(manifest.assets.map(item=>[item.path,item]));
report.network=responder.records;
const calibrationPayload=Buffer.alloc(400000,0x5a),calibrationHash=hash(calibrationPayload);
const calibrationScript=`self.onmessage=async event=>{try{const r=await fetch(event.data.url);const b=await r.arrayBuffer();const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');event.ports[0].postMessage({bytes:b.byteLength,sha256:h});}catch(error){event.ports[0].postMessage({error:String(error)});}};`;
const persist=()=>fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');
async function waitNetworkIdle(timeoutMs=10000){
  const end=performance.now()+timeoutMs;
  let idleSince=null;
  for(;;){
    const now=performance.now();
    if(responder.activeCount)idleSince=null;else if(idleSince===null)idleSince=now;
    if(idleSince!==null&&now-idleSince>=500)return;
    if(now>=end)throw new Error('paced HTTP owners did not settle');await new Promise(resolve=>setTimeout(resolve,25));
  }
}
function installMetrics({trace=false}={}){
  const state={lcp:[],shifts:[],feedback:[],wasm:[],fetches:[],nativeEntries:[],nativeObserver:null,nativeSupported:PerformanceObserver.supportedEntryTypes.includes('event'),timeOrigin:performance.timeOrigin,clsSupported:PerformanceObserver.supportedEntryTypes.includes('layout-shift')};
  window.__solStartupProfile=state;
  if(state.nativeSupported){
    state.nativeObserver=new PerformanceObserver(list=>state.nativeEntries.push(...list.getEntries()));
    state.nativeObserver.observe({type:'event',durationThreshold:16,buffered:true});
  }
  new PerformanceObserver(list=>{for(const entry of list.getEntries())state.lcp.push({id:entry.element?.id,tag:entry.element?.tagName,url:entry.url,startTime:entry.startTime,size:entry.size});})
    .observe({type:'largest-contentful-paint',buffered:true});
  if(state.clsSupported)new PerformanceObserver(list=>{for(const entry of list.getEntries()){
    const box=rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
    state.shifts.push({startTime:entry.startTime,value:entry.value,hadRecentInput:entry.hadRecentInput,
      sources:entry.sources.map(item=>({id:item.node?.id,tag:item.node?.nodeName,className:String(item.node?.className??''),previous:box(item.previousRect),current:box(item.currentRect)}))});
  }})
    .observe({type:'layout-shift',buffered:true});
  for(const method of ['instantiate','instantiateStreaming','compile','compileStreaming']){
    const native=WebAssembly[method];
    WebAssembly[method]=function(...args){state.wasm.push({method,bytes:args[0]?.byteLength??null,stack:new Error().stack});return Reflect.apply(native,this,args);};
  }
  {
    const native=window.fetch;
    window.fetch=function(...args){
      const row={url:String(args[0]?.url??args[0]),start:performance.now(),signalAborted:false,bytesRead:0,eof:false,cancelled:false,stack:trace?new Error().stack:undefined};state.fetches.push(row);
      args[1]?.signal?.addEventListener('abort',()=>{row.signalAborted=true;row.abortAt=performance.now();row.abortReason=String(args[1].signal.reason);},{once:true});
      return Reflect.apply(native,this,args).then(response=>{
        row.responseAt=performance.now();row.status=response.status;
        const stream=response.body;if(!stream)return response;
        const getReader=stream.getReader;
        stream.getReader=function(...readerArgs){
          const reader=Reflect.apply(getReader,this,readerArgs),read=reader.read,cancel=reader.cancel;
          reader.read=function(...readArgs){return Reflect.apply(read,this,readArgs).then(value=>{if(value.done){row.eof=true;row.eofAt=performance.now();}else row.bytesRead+=value.value.byteLength;return value;});};
          reader.cancel=function(...cancelArgs){row.cancelled=true;row.cancelAt=performance.now();return Reflect.apply(cancel,this,cancelArgs);};return reader;
        };return response;
      },error=>{row.error=String(error);throw error;});
    };
  }
}
async function observeFeedback(page,task){
  await page.evaluate(installFeedbackProbe,task);
  await page.click(task.selector);
  await page.waitForFunction(name=>window.__solStartupProfile.feedback.some(item=>item.task===name),{timeout:10000},task.task);
}
async function coreInstalled(page){
  await page.waitForFunction(async({cache,marker,release})=>{
    const reg=await navigator.serviceWorker.getRegistration();if(reg?.active?.state!=='activated')return false;
    const response=await(await caches.open(cache)).match(marker);if(!response)return false;
    return (await response.json()).release_id===release;
  },{timeout:180000,polling:200},{cache:'sol-release-'+manifest.release_id,marker:origin+manifest.base_path+'__complete_release__',release:manifest.release_id});
}
async function makePage(context,run){
  const page=await context.newPage();page.on('pageerror',error=>run.errors.push(error.stack||String(error)));
  page.on('requestfailed',request=>run.networkFailures.push({url:request.url(),errorText:request.failure()?.errorText,status:request.response()?.status()??null}));
  await page.setViewport(report.protocol.viewport);await page.setCacheEnabled(false);await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  const session=await page.createCDPSession();await session.send('Emulation.setCPUThrottlingRate',{rate:4});
  {
    const rows=new Map();run.cdpNetwork=[];
    await session.send('Network.enable');
    session.on('Network.requestWillBeSent',event=>{const row={id:event.requestId,url:event.request.url,start:event.timestamp,wallTime:event.wallTime,receivedBytes:0};rows.set(event.requestId,row);run.cdpNetwork.push(row);});
    session.on('Network.responseReceived',event=>{const row=rows.get(event.requestId);if(row)Object.assign(row,{status:event.response.status,fromServiceWorker:event.response.fromServiceWorker,responseTime:event.timestamp});});
    session.on('Network.dataReceived',event=>{const row=rows.get(event.requestId);if(row)row.receivedBytes+=event.dataLength;});
    session.on('Network.loadingFinished',event=>{const row=rows.get(event.requestId);if(row)Object.assign(row,{finished:event.timestamp,encodedDataLength:event.encodedDataLength});});
    session.on('Network.loadingFailed',event=>{const row=rows.get(event.requestId);if(row)Object.assign(row,{failed:event.timestamp,error:event.errorText,cancelled:event.canceled});});
  }
  await page.evaluateOnNewDocument(installMetrics,{trace:process.argv.includes('--trace-inspector')});await page.evaluateOnNewDocument(installWorkerActivity);
  return page;
}
try{
  server=http.createServer((req,res)=>{
    try{
      const url=new URL(req.url,'http://fixture.invalid');let bytes,status=200,type='application/octet-stream';
      if(url.pathname==='/__cal/'){bytes=Buffer.from('<!doctype html><title>Local shared-rate calibration</title>');type='text/html';}
      else if(url.pathname==='/__cal/sw.js'){bytes=Buffer.from(calibrationScript);type='text/javascript';}
      else if(url.pathname.startsWith('/__cal/payload-'))bytes=calibrationPayload;
      else if(url.pathname.endsWith('/favicon.ico')){bytes=Buffer.alloc(0);status=404;}
      else{
        const file=resolvePreviewFile(webRoot,manifest.base_path,decodeURIComponent(url.pathname));
        if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('unknown profile URL '+url.pathname);
        bytes=fs.readFileSync(file);const relative=path.relative(webRoot,file).split(path.sep).join('/');
        assert.equal(hash(bytes),artifactPins[relative],'immutable served asset drift: '+relative);
        type=({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json',
          '.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'})[path.extname(file)]||type;
      }
      responder.send(res,{bytes,status,headers:{'Content-Type':type,'Cache-Control':'no-store','Service-Worker-Allowed':'/'},
        tags:{path:url.pathname,query:url.search,group:currentGroup,destination:req.headers['sec-fetch-dest']||'',workerScript:req.headers['service-worker']||''}});
    }catch(error){report.errors.push(String(error));res.writeHead(500).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;expected.origin=origin;
  const executablePath=process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe';
  report.browserExecutable={path:executablePath,sha256:hash(fs.readFileSync(executablePath))};
  // Keep the original software launch flags. Native is an additional named cohort.
  const graphicsArgs=backend==='swiftshader'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:browserBackendArgs(backend);
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox',...graphicsArgs,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  ownedBrowserProcess=browser.process();
  assert.ok(Number.isSafeInteger(ownedBrowserProcess?.pid)&&ownedBrowserProcess.pid>0,'a positive launch-owned browser PID is required');
  report.browserPid=ownedBrowserProcess.pid;
  report.browser=await browser.version();assert.equal(report.browser,expectedBrowser,'pinned browser version changed');
  workerObservation=createWorkerExceptionObserver(browser,{ownerForTarget:target=>contexts.get(target.browserContext()),errors:report.errors,targets:report.targets});
  activeContext=await browser.createBrowserContext();const calibrationOwner={name:'calibration',errors:[]};contexts.set(activeContext,calibrationOwner);
  let page=await activeContext.newPage();page.on('pageerror',error=>calibrationOwner.errors.push(String(error)));
  await page.goto(origin+'/__cal/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js',{scope:'./'});await navigator.serviceWorker.ready;});
  const calibrationStart=performance.now();
  const calibrationParts=await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    const worker=new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('service-worker calibration deadline')),15000);
      channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(event.data);};reg.active.postMessage({url:new URL('./payload-worker',location.href).href},[channel.port2]);});
    const local=(async()=>{const response=await fetch('./payload-page'),bytes=await response.arrayBuffer();return {bytes:bytes.byteLength,
      sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')};})();
    return await Promise.all([local,worker]);
  });
  const calibrationDuration=performance.now()-calibrationStart;
  for(const part of calibrationParts){assert.equal(part.bytes,400000);assert.equal(part.sha256,calibrationHash);}
  assert.ok(calibrationDuration>=4120&&calibrationDuration<=4500,`shared-rate calibration outside declared 4120–4500ms window: ${calibrationDuration}`);
  report.calibration={passed:true,rateBytesPerSecond:200000,latencyMs:150,burstBytes:4096,clients:['page','service_worker'],
    pageCpu:1,payloadBytes:400000,payloadSha256:calibrationHash,parts:calibrationParts,durationMs:calibrationDuration,errors:calibrationOwner.errors};
  assert.equal(calibrationOwner.errors.length,0);await activeContext.close();activeContext=null;await waitNetworkIdle();persist();
  console.log(`CALIBRATED page+SW 800000 bytes in ${calibrationDuration.toFixed(1)} ms`);
  for(let pair=1;pair<=pairs;pair++){
    activeContext=await browser.createBrowserContext();const contextOwner={name:'pair-'+pair,errors:[]};contexts.set(activeContext,contextOwner);
    const pairRuns=[];
    for(const kind of ['cold','warm']){
      const run={pair,kind,name:`${kind}-${pair}`,errors:[],cleanupErrors:[],feedback:[],networkFailures:[]};pairRuns.push(run);report.runs.push(run);currentGroup=run.name;
      const startIndex=responder.records.length,startedAt=performance.now();page=await makePage(activeContext,run);
      await page.goto(origin+manifest.base_path,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForFunction(()=>document.body.dataset.appReady==='true'&&window.__solStartupProfile.lcp.some(item=>item.id==='observationImage'),{timeout:30000});
      const early=await page.evaluate(()=>({lcp:window.__solStartupProfile.lcp.at(-1),url:location.href}));
      console.log(`${run.name} IMAGE ${early.lcp.startTime.toFixed(1)} ms; waiting for verified core`);
      await coreInstalled(page);run.install={terminal:true,coreComplete:true,elapsedMs:performance.now()-startedAt};
      await waitNetworkIdle();run.initialRequests=responder.records.slice(startIndex).map(row=>row.path+row.query);
      const imageDigest=await page.evaluate(async({cache,url})=>{
        const response=await(await caches.open(cache)).match(url);if(!response)throw new Error('verified core lacks original image');
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
      },{cache:'sol-release-'+manifest.release_id,url:origin+expected.imagePath});
      const storeUrl=origin+manifest.base_path+manifest.namespace+'js/store.js?v='+manifest.release_id;
      run.domainReadiness=[];
      for(const task of tasks){
        const began=performance.now();let cpu;
        if(task.task==='inspector'&&process.argv.includes('--trace-inspector')){cpu=await page.createCDPSession();await cpu.send('Profiler.enable');await cpu.send('Profiler.start');}
        await observeFeedback(page,task);
        if(cpu){const result=await cpu.send('Profiler.stop');fs.writeFileSync(path.join(out,run.name+'-inspector.cpuprofile'),JSON.stringify(result.profile));await cpu.detach();}
        if(task.task==='research'){
          await page.waitForFunction(async url=>{const {store}=await import(url);return store.dataError||store.state.schema_version==='solar-state-snapshot.v3';},{timeout:45000,polling:100},storeUrl);
          const error=await page.evaluate(async url=>(await import(url)).store.dataError,storeUrl);assert.equal(error,null,'Research bundle must validate after deferred entry');
          run.researchIdentity=await page.evaluate(async url=>(await import(url)).store.dataBundleIdentity,storeUrl);assert.deepEqual(run.researchIdentity,expectedBundleIdentity);
        }else if(task.task==='sky'){
          await page.waitForFunction(()=>window.__skyDebug?.().snap,{timeout:90000,polling:100});
        }else if(task.task==='system'){
          await page.waitForFunction(async url=>{const s=(await import(url)).store.orrery;return s?.engineError||(s?.bodies.length===9&&document.body.dataset.viewCode==='ready');},{timeout:120000,polling:100},storeUrl);
          const error=await page.evaluate(async url=>(await import(url)).store.orrery.engineError,storeUrl);assert.equal(error,'','System engine must initialize and calculate correctly');
          await page.waitForFunction(async url=>{const s=(await import(url)).store.orrery;return s.catalogueStatus.stars==='ready'&&s.catalogueStatus.moons==='ready';},{timeout:90000,polling:100},storeUrl);
        }
        if(['research','sky','system'].includes(task.task))run.domainReadiness.push({task:task.task,elapsedMs:performance.now()-began});
      }
      await waitForWorkerActivityIdle(page,{timeoutMs:90000});await waitNetworkIdle(180000);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,0)))));
      const observed=await page.evaluate(()=>{
        const state=window.__solStartupProfile;
        if(state.nativeObserver)state.nativeEntries.push(...state.nativeObserver.takeRecords());
        const plain=entry=>({name:entry.name,startTime:entry.startTime,duration:entry.duration,processingStart:entry.processingStart,processingEnd:entry.processingEnd,
          interactionId:entry.interactionId,targetId:entry.target?.id??null,targetMode:entry.target?.dataset?.mode??null});
        for(const item of state.feedback){
          const matches=state.nativeEntries.filter(entry=>entry.name==='click'&&Math.abs(entry.startTime-item.inputTimeMs)<=1),target=document.querySelector(item.selector),entry=matches[0];
          const targetMatched=!!entry&&!!target&&(entry.target===target||target.contains(entry.target));
          // Absence may mean threshold censoring or delayed delivery; neither proves a bound.
          item.nativeTiming={supported:state.nativeSupported,thresholdMs:16,source:matches.length?'entry':'missing',matchCount:matches.length,targetMatched,
            entry:entry?plain(entry):null};
        }
        return {lcp:state.lcp.at(-1),lcpEntries:state.lcp,
        clsSupported:window.__solStartupProfile.clsSupported,shifts:window.__solStartupProfile.shifts,feedback:window.__solStartupProfile.feedback,
        wasm:window.__solStartupProfile.wasm,fetchTrace:window.__solStartupProfile.fetches,timeOrigin:window.__solStartupProfile.timeOrigin,workerActivity:window.__solWorkerActivity(),
        nativeEvents:state.nativeEntries.map(plain),
        image:{src:document.getElementById('observationImage').currentSrc,width:document.getElementById('observationImage').naturalWidth,height:document.getElementById('observationImage').naturalHeight}};
      });
      Object.assign(run,observed);run.image.sha256=imageDigest;
      // Read the actual application context after the measured tasks to avoid warming them.
      run.gpu=await readBrowserFeatureStatus(browser,await page.evaluate(captureBrowserCapabilities));assertBrowserBackend(backend,run.gpu);
      if(backend==='native')assert.equal(run.gpu.renderer,expectedRenderer,'actual native renderer differs from exact pin');
      for(const operation of run.wasm)if(!operation.stack?.includes('/js/skyEngine.js'))run.errors.push('unexpected main-thread WASM operation: '+operation.stack);
      assert.equal(run.workerActivity.errors.length,0,'worker activity observation failed');assert.equal(run.workerActivity.activeRequests,0);
      if(pair===1)await page.screenshot({path:path.join(out,kind+'-after-tasks.png')});
      // Leave by the real controls so the warm scenario naturally returns to Sun.
      await page.click('.mode-button[data-mode="today"]');await page.click('#exploreObservation');await waitForWorkerActivityIdle(page,{timeoutMs:10000});await waitNetworkIdle();
      if(process.argv.includes('--inject-late-error')&&pair===1&&kind==='cold'){
        await page.evaluate(()=>setTimeout(()=>{throw new Error('deliberate late profile failure');},0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      }
      if(process.argv.includes('--inject-late-worker-error')&&pair===1&&kind==='cold'){
        await page.evaluate(()=>{
          const url=URL.createObjectURL(new Blob(["setTimeout(()=>{throw new Error('deliberate late worker profile failure');},25);"],{type:'text/javascript'}));
          const worker=new Worker(url);worker.onerror=event=>event.preventDefault();window.__profileFaultWorker={worker,url};
        });
        await page.waitForFunction(()=>window.__solWorkerActivity().errors.some(error=>error.includes('deliberate late worker profile failure')),{timeout:5000});
        run.workerFaultDelivered=true;
        await page.evaluate(()=>{const {worker,url}=window.__profileFaultWorker;worker.terminate();URL.revokeObjectURL(url);delete window.__profileFaultWorker;});
      }
      run.lateWorkerActivity=await page.evaluate(()=>window.__solWorkerActivity());
      for(const error of run.lateWorkerActivity.errors)run.errors.push('worker activity: '+error);
      await page.close();run.elapsedMs=performance.now()-startedAt;run.cls=maximumSessionShift(run.shifts);
      let feedbackSummary;
      try{feedbackSummary=nearestRank(run.feedback.map(assessedFeedbackLatency),.95).toFixed(1)+' ms (frame/native upper bound)';}
      catch(error){feedbackSummary='inconclusive: '+String(error);}
      console.log(`${run.name} COMPLETE LCP=${run.lcp.startTime.toFixed(1)} CLS=${run.cls} feedback-p95=${feedbackSummary}`);persist();
    }
    await activeContext.close();activeContext=null;await waitNetworkIdle();
    for(const run of pairRuns)run.errors.push(...contextOwner.errors);
    if(process.argv.includes('--inject-cleanup-error')&&pair===1)report.cleanupErrors.push('deliberate completed-owner cleanup failure');
  }
  completed=true;
}catch(error){report.errors.push(error.stack||String(error));console.error(error.stack||String(error));}
finally{
  try{await activeContext?.close();}catch(error){report.cleanupErrors.push('context: '+String(error));}
  try{
    if(browser){
      assert.ok(Number.isSafeInteger(ownedBrowserProcess?.pid)&&ownedBrowserProcess.pid>0&&browser.process()===ownedBrowserProcess,'launch-owned browser process identity changed or is unavailable');
      await closeOwnedBrowserVerified(browser);
    }
  }catch(error){report.cleanupErrors.push('browser: '+String(error));}
  finally{
    if(browser){
      report.ownedBrowserExit={pid:ownedBrowserProcess?.pid??null,exitCode:ownedBrowserProcess?.exitCode??null,signalCode:ownedBrowserProcess?.signalCode??null};
      const exit=report.ownedBrowserExit;
      if(!Number.isSafeInteger(exit.pid)||exit.pid<1||exit.pid!==report.browserPid||exit.exitCode!==0||exit.signalCode!==null)
        report.cleanupErrors.push('browser: a verified launch-owned exit code 0 without signal is required');
    }
  }
  try{if(workerObservation){await workerObservation.settle();workerObservation.dispose();report.workerObservationSettled=true;}}
  catch(error){report.cleanupErrors.push('worker observation settlement: '+String(error));}
  responder.close();try{if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){report.cleanupErrors.push('HTTP server: '+String(error));}
  try{
    report.contextErrors=collectContextFailures(contexts.values());
    if(report.contextErrors.length)report.errors.push('late worker/context errors remain after owner shutdown');
    for(const row of report.network)if(!row.complete||row.aborted||row.error)report.errors.push(`incomplete HTTP owner ${row.id}: ${row.path}`);
    const expectedReads=Object.fromEntries(validatedJSONPaths.map(name=>[origin+manifest.base_path+name,{size:fs.statSync(path.join(webRoot,name)).size,sha256:artifactPins[name]}]));
    for(const run of report.runs){
      const classified=classifyCompleteReadCancellations({failures:run.networkFailures,fetches:run.fetchTrace??[],network:run.cdpNetwork??[],
        expectedAssets:expectedReads,identity:run.researchIdentity,expectedIdentity:expectedBundleIdentity});
      run.completeValidatedReadReports=classified.expected;run.unexpectedNetworkFailures=classified.unexpected;
      for(const failure of classified.unexpected)run.errors.push(`unexplained failed request: ${failure.url} · ${failure.errorText}`);
    }
    const after=sourcePins();report.sourceUnchanged=JSON.stringify(after)===JSON.stringify(sourceBefore);
    const postValidation=readbackProfileArtifact({webRoot,validator:path.join(root,'tools/validate_release_manifest.py'),expected:artifactPins});
    fs.writeFileSync(path.join(out,'artifact-post-validation.log'),postValidation.log);
    report.artifactUnchanged=postValidation.unchanged;
    fs.writeFileSync(path.join(out,'source-after.json'),JSON.stringify(after,null,2)+'\n');
    const assessment=assessStartupProfile({...report,sourceUnchanged:report.sourceUnchanged,artifactUnchanged:report.artifactUnchanged});report.assessment=assessment;
    const healthy=completed&&report.ownedBrowserExit?.exitCode===0&&report.ownedBrowserExit?.pid===report.browserPid&&report.workerObservationSettled===true&&!report.errors.length&&!report.cleanupErrors.length&&report.sourceUnchanged&&report.artifactUnchanged
      &&report.runs.every(run=>!run.errors.length&&!run.cleanupErrors.length);
    report.result=pairs===10?(healthy&&assessment.passed?'passed':'failed'):(healthy?'diagnostic-completed':'failed');
  }catch(error){report.cleanupErrors.push('final admission: '+String(error));report.result='failed';}
  for(const run of report.runs)fs.writeFileSync(path.join(out,run.name+'.json'),JSON.stringify(run,null,2)+'\n');
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`${report.result.toUpperCase()}: ${out}`);if(report.result==='failed')process.exitCode=1;
}
