// Actual Chromium, three immutable local artifacts and two open clients. No external I/O.
import {releaseModulePath} from './release_module_urls.mjs';
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import puppeteer from "puppeteer-core";
import {classifyReleaseCacheErrors} from './release_cache_errors.mjs';
import {createWorkerExceptionObserver} from './worker_exception_observer.mjs';
const option=(key,fallback)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.slice(key.length+3)||fallback;
const roots=["a","b","c"].map(key=>path.resolve(option(key,`build/cache-${key}`)));
const manifests=roots.map(root=>JSON.parse(fs.readFileSync(path.join(root,"web-release-manifest.json"),"utf8")));
assert.ok(manifests.every(m=>m.base_path==="/"),"this local harness requires root-path artifacts");
const out=path.resolve(option("out","coverage/release-cache"));fs.mkdirSync(out,{recursive:true});
const evidence={browser:"",releases:manifests.map(m=>m.release_id),checks:[],requests:[],workerErrors:[],workerErrorEvents:[],pageErrors:[],workerObserverMessages:[],workerObservationErrors:[],workerTargets:[]};
let active=0,offline=false,corrupt=false,corruptEnrichment=false,browser,workerObservation,completed=false,criticalFaultConfirmed=false;
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  evidence.requests.push({name,active,offline,corrupt,corruptEnrichment});
  if(offline){res.destroy();return;}
  const file=path.resolve(roots[active],`.${name.endsWith("/")?name+"index.html":name}`);
  if(!file.startsWith(roots[active]+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  let bytes=fs.readFileSync(file);
  if(corrupt&&name===`/${manifests[2].namespace}pkg/solar_wasm.wasm`){bytes=Buffer.from(bytes);bytes[0]^=1;}
  if(corruptEnrichment&&name===`/${manifests[2].namespace}js/starcatalog.js`)bytes=Buffer.concat([bytes,Buffer.from('\n// deliberate byte-integrity fault\n')]);
  res.setHeader("Content-Type",({".js":"text/javascript",".html":"text/html",".json":"application/json",".wasm":"application/wasm",".css":"text/css",".jpg":"image/jpeg"})[path.extname(file)]||"application/octet-stream");
  res.setHeader("Cache-Control","no-store");res.end(bytes);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const ready=page=>page.waitForFunction(async()=>{
  const reg=await navigator.serviceWorker.getRegistration();return reg?.active?.state==="activated";
},{timeout:45000,polling:100});
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const fetchHash=(page,url)=>page.evaluate(async url=>{
  const response=await fetch(url);if(!response.ok)throw Error(`HTTP ${response.status}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await response.arrayBuffer())),v=>v.toString(16).padStart(2,"0")).join("");
},url);
const ownedPage=async owner=>{const page=await owner.newPage();page.on('pageerror',error=>evidence.pageErrors.push(error.stack||error.message));await page.setViewport({width:1440,height:900});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);return page;};
const catalogueFiles=['js/moonelements.js','js/starcatalog.js'];
const systemState=(page,manifest)=>page.evaluate(async({url})=>{
  const s=(await import(url)).store.orrery;
  return s?{phase:{...s.catalogueStatus},bodies:s.bodies.map(body=>[body.name,body.x_au,body.y_au,body.z_au]),error:s.engineError,
    status:document.getElementById('orreryCatalogueStatus').textContent,retry:document.getElementById('orreryCatalogueRetry').checkVisibility()}:null;
},{url:`/${manifest.namespace}${releaseModulePath(manifest,'js/store.js')}`});
const waitCatalogues=(page,manifest,stars,moons,deadline=performance.now()+90000)=>{
  const remaining=deadline-performance.now();
  if(!(remaining>0))throw new Error('Catalogue readiness exceeded its original deadline');
  return page.waitForFunction(async({url,stars,moons})=>{
    const s=(await import(url)).store.orrery;
    // Catalogue requests can finish before main-thread/worker engine preparation.
    return s?.bodies.length===9&&!s.entering&&s.catalogueStatus.stars===stars&&s.catalogueStatus.moons===moons;
  },{timeout:remaining,polling:100},{url:`/${manifest.namespace}${releaseModulePath(manifest,'js/store.js')}`,stars,moons});
};
const enterAndDemandCatalogues=async(page,manifest,stars,moons)=>{
  const deadline=performance.now()+90000;
  await page.bringToFront();
  await page.click('[data-mode="orrery"]');
  const remaining=deadline-performance.now();
  if(!(remaining>0))throw new Error('Catalogue view entry exceeded its original deadline');
  await page.waitForFunction(()=>document.body.dataset.viewCode==='ready'&&document.body.dataset.viewCodeName==='orrery'
    &&!!document.querySelector('#orreryAnchor option[value="Jupiter"]'),{timeout:remaining});
  // These native controls create the production demand. Merely entering System
  // must no longer be treated as a request for either optional enrichment table.
  await page.select('#orreryAnchor','Jupiter');
  await page.select('#orreryObjectGroup','star');
  await waitCatalogues(page,manifest,stars,moons,deadline);
};
const cachedCatalogues=(page,manifest)=>page.evaluate(async({cache,paths})=>{
  const stored=await caches.open(cache);return await Promise.all(paths.map(async url=>!!(await stored.match(url))));
},{cache:`sol-release-${manifest.release_id}`,paths:catalogueFiles.map(file=>`/${manifest.namespace}${file}`)});
try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN,headless:true,args:["--no-sandbox","--use-angle=swiftshader","--enable-unsafe-swiftshader","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]});
  evidence.browser=await browser.version();
  workerObservation=createWorkerExceptionObserver(browser,{ownerForTarget:()=>({name:'release-cache',errors:evidence.workerObserverMessages}),
    errors:evidence.workerObservationErrors,targets:evidence.workerTargets,
    onException:({message,target})=>{evidence.workerErrors.push(message);evidence.workerErrorEvents.push({message,active,offline,corrupt,corruptEnrichment,target:target.url()});},
    onSetupError:({error,target})=>evidence.workerObservationErrors.push(`worker setup ${target.url()}: ${String(error)}`)});
  // The initial page is intentionally never claimed by the installing worker. Its
  // already-loaded image therefore cannot rely on a later cache-on-fetch request.
  // Use fresh storage and a new renderer on return so neither a prior tab nor the
  // HTTP/image memory cache can supply the default observation accidentally.
  const firstVisitContext=await browser.createBrowserContext();
  try {
    active=2;
    const manifest=manifests[2];
    const visualAssets=JSON.parse(fs.readFileSync(path.join(roots[2],manifest.namespace,'visual-assets.v1.json'),'utf8'));
    const observationPath=visualAssets.observed_images?.[0]?.path;
    assert.equal(typeof observationPath,'string','candidate must declare its default archived observation');
    const observationAsset=manifest.assets.find(asset=>asset.path===manifest.namespace+observationPath);
    assert.ok(observationAsset,'candidate must inventory the default archived observation');
    const requestStart=evidence.requests.length;
    const first=await ownedPage(firstVisitContext);await first.setCacheEnabled(false);
    await first.goto(origin,{waitUntil:'domcontentloaded'});
    await first.waitForFunction(()=>{const image=document.getElementById('observationImage');return image?.complete&&image.naturalWidth>0;},{timeout:20000});
    const online=await first.evaluate(()=>({
      controlled:!!navigator.serviceWorker.controller,
      source:document.getElementById('viewSource').textContent,
      time:document.getElementById('viewTime').textContent,
      caption:document.getElementById('observationStatus').textContent,
      imageUrl:document.getElementById('observationImage').currentSrc,
      width:document.getElementById('observationImage').naturalWidth,
    }));
    assert.equal(online.controlled,false,'the first image must load before service-worker control');
    assert.match(online.source,/observed.*NASA/);assert.match(online.time,/archival/);
    assert.equal(new URL(online.imageUrl).pathname,'/'+observationAsset.path);
    await ready(first);
    assert.deepEqual(await cachedCatalogues(first,manifest),[false,false],'core installation must omit full enrichment tables');
    assert.ok(!evidence.requests.slice(requestStart).some(row=>catalogueFiles.some(file=>row.name===`/${manifest.namespace}${file}`)),
      'initial Sun and completed SW installation must not request full Moon/star tables');
    const installedImage=await first.evaluate(async({cache,url})=>!!(await(await caches.open(cache)).match(url)),{cache:`sol-release-${manifest.release_id}`,url:online.imageUrl});
    await first.close();offline=true;
    const returned=await ownedPage(firstVisitContext);await returned.setCacheEnabled(false);
    await returned.goto(origin,{waitUntil:'domcontentloaded',timeout:30000});
    await returned.waitForFunction(()=>{
      const image=document.getElementById('observationImage'),unavailable=document.getElementById('observationUnavailable');
      return image?.complete&&(image.naturalWidth>0||unavailable?.hidden===false);
    },{timeout:20000});
    const offlineReturn=await returned.evaluate(()=>({
      controlled:!!navigator.serviceWorker.controller,
      decoded:document.getElementById('observationImage').naturalWidth>0,
      imageVisible:document.getElementById('observationImage').getClientRects().length>0,
      source:document.getElementById('viewSource').textContent,
      time:document.getElementById('viewTime').textContent,
      caption:document.getElementById('observationStatus').textContent,
      imageUrl:document.getElementById('observationImage').currentSrc,
      unavailable:!document.getElementById('observationUnavailable').hidden,
      modelVisible:document.getElementById('solarCanvas').getClientRects().length>0,
    }));
    const firstOffline={releaseId:manifest.release_id,installedImage,online,offlineReturn};
    evidence.checks.push({firstOfflineObservation:firstOffline});
    assert.equal(offlineReturn.controlled,true,'offline return must be served by the installed worker');
    assert.equal(offlineReturn.decoded,true,'first offline return must decode the original default observation without a second online visit');
    assert.equal(offlineReturn.imageVisible,true,'cached observation must be visible in the default view');
    assert.equal(installedImage,true,'completed installation must already contain the default observation');
    assert.equal(offlineReturn.unavailable,false);assert.equal(offlineReturn.modelVisible,false);
    for(const key of ['source','time','caption','imageUrl'])assert.equal(offlineReturn[key],online[key],`offline observation retains its original ${key}`);
    firstOffline.sha256=await fetchHash(returned,online.imageUrl);
    assert.equal(firstOffline.sha256,observationAsset.sha256,'offline image bytes match the immutable release manifest');
    await enterAndDemandCatalogues(returned,manifest,'failed','failed');
    const missing=await systemState(returned,manifest);assert.equal(missing.error,'');assert.equal(missing.bodies.length,9);
    assert.equal(missing.retry,true);assert.match(missing.status,/unavailable|failed|could not/i);
    assert.deepEqual(await cachedCatalogues(returned,manifest),[false,false]);
    evidence.checks.push({firstOfflineEnrichmentUnavailable:missing});
    offline=false;corruptEnrichment=true;
    await returned.click('#orreryCatalogueRetry');await waitCatalogues(returned,manifest,'failed','ready');
    assert.deepEqual(await cachedCatalogues(returned,manifest),[true,false],'corrupt optional bytes must not enter the verified cache');
    evidence.checks.push({controlledCorruptStarRejected:await systemState(returned,manifest)});
    corruptEnrichment=false;await returned.click('#orreryCatalogueRetry');await waitCatalogues(returned,manifest,'ready','ready');
    for(const file of catalogueFiles){
      const asset=manifest.assets.find(item=>item.path===manifest.namespace+file);assert.equal(asset.role,'optional');
      assert.equal(await fetchHash(returned,'/'+asset.path),asset.sha256,'on-use admission retains exact enrichment bytes');
    }
    assert.deepEqual((await systemState(returned,manifest)).bodies,missing.bodies,'recovery must preserve accepted planetary positions');
    await returned.evaluate(()=>localStorage.removeItem('sol-surface'));await returned.close();offline=true;
    const enrichedReturn=await ownedPage(firstVisitContext);await enrichedReturn.setCacheEnabled(false);
    await enrichedReturn.goto(origin,{waitUntil:'domcontentloaded',timeout:30000});
    await enrichedReturn.waitForFunction(()=>document.body.dataset.appReady==='true');
    await enterAndDemandCatalogues(enrichedReturn,manifest,'ready','ready');const enriched=await systemState(enrichedReturn,manifest);
    assert.equal(enriched.error,'');assert.equal(enriched.bodies.length,9);evidence.checks.push({verifiedEnrichmentOfflineReturn:enriched});
  } finally {await firstVisitContext.close();offline=false;active=0;}
  // An installed worker does not claim the initial document. Its online module
  // use remains distinct from controlled on-use cache admission.
  const uncontrolledContext=await browser.createBrowserContext();
  try{
    active=2;const manifest=manifests[2],page=await ownedPage(uncontrolledContext);await page.setCacheEnabled(false);
    await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.appReady==='true');await ready(page);
    assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),false);
    await enterAndDemandCatalogues(page,manifest,'ready','ready');
    assert.deepEqual(await cachedCatalogues(page,manifest),[false,false],'uncontrolled online use is not verified cache admission');
    evidence.checks.push({uncontrolledOnlineEnrichment:await systemState(page,manifest),cacheAdmission:false});
  }finally{await uncontrolledContext.close();active=0;}
  const page=await ownedPage(browser);await page.setViewport({width:1440,height:900});await page.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"reduce"}]);
  await page.goto(origin,{waitUntil:"domcontentloaded"});await ready(page);await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const old=await ownedPage(browser);await old.goto(`${origin}/${manifests[0].namespace}index.html`,{waitUntil:"domcontentloaded"});
  await old.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const oldUrl=old.url();
  await page.bringToFront();
  active=1;
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await page.waitForFunction(async()=>{const reg=await navigator.serviceWorker.getRegistration();return reg?.waiting?.state==="installed";},{timeout:45000,polling:100});
  assert.equal(new URL(page.url()).pathname,`/${manifests[0].namespace}index.html`,"waiting update cannot reload an open client");
  assert.equal(old.url(),oldUrl);
  await page.waitForSelector("#releaseUpdate:not([hidden])");
  const offlineMenu=await page.$('.offline-menu > summary');
  if(offlineMenu) await offlineMenu.click();
  await page.waitForSelector("#releaseUpdate",{visible:true});
  const navigation=page.waitForNavigation({waitUntil:"domcontentloaded",timeout:30000});
  await page.click("#releaseUpdate");await navigation;
  assert.equal(new URL(page.url()).pathname,`/${manifests[1].namespace}index.html`,"explicit requester enters verified B");
  assert.equal(old.url(),oldUrl,"other open tab retains A document");
  await ready(page);
  offline=true;
  for(const [client,index]of[[page,1],[old,0]]) {
    const manifest=manifests[index];
    for(const name of ["app.js","pkg/solar_wasm.wasm","pkg/solar_ephemeris.wasm"]) {
      const expected=manifest.assets.find(asset=>asset.path===manifest.namespace+name).sha256;
      assert.equal(await fetchHash(client,`/${manifest.namespace}${name}`),expected,`offline release ${index}: exact ${name}`);
    }
    const selected=await client.evaluate(async url=>await(await fetch(url)).json(),`/${manifest.namespace}web-release-manifest.json`);
    assert.equal(selected.release_id,manifest.release_id);
  }
  evidence.checks.push("A and B remain byte-coherent offline after explicit requester-only update");
  offline=false;active=2;corrupt=true;
  const failed=await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    return await new Promise(async(resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error("corrupt update did not terminate")),45000);
      reg.addEventListener("updatefound",()=>{const worker=reg.installing;worker.addEventListener("statechange",()=>{if(worker.state==="redundant"){clearTimeout(timer);resolve(true);}});},{once:true});
      try{await reg.update();}catch(error){clearTimeout(timer);reject(error);}
    });
  });
  assert.equal(failed,true);
  const cacheNames=await page.evaluate(()=>caches.keys());
  assert.ok(cacheNames.includes(`sol-release-${manifests[0].release_id}`));
  assert.ok(cacheNames.includes(`sol-release-${manifests[1].release_id}`));
  assert.ok(!cacheNames.includes(`sol-release-${manifests[2].release_id}`));
  assert.ok(!cacheNames.includes(`sol-stage-${manifests[2].release_id}`));
  offline=true;
  const bApp=manifests[1].assets.find(a=>a.path===manifests[1].namespace+"app.js");
  assert.equal(await fetchHash(page,`/${bApp.path}`),bApp.sha256);
  assert.equal(await page.evaluate(async()=> (await fetch("/releases/unknown/app.js")).status),409);
  evidence.checks.push("corrupt critical WASM rejects C, removes only incomplete C stage, preserves A/B and denies unknown release");
  criticalFaultConfirmed=true;
  completed=true;evidence.manifest_sha256=roots.map(root=>hash(fs.readFileSync(path.join(root,"web-release-manifest.json"))));
 } catch(error) {evidence.failure=error.stack||String(error);throw error;} finally {
  if(browser)for(const page of await browser.pages())try{evidence.checks.push(await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker?.getRegistration();return {url:location.href,status:document.getElementById("releaseStatus")?.textContent,active:reg?.active?.scriptURL,waiting:reg?.waiting?.state,caches:await caches.keys()};
  }));}catch{}
  evidence.cleanupErrors=[];
  try{if(browser)await browser.close();}catch(error){evidence.cleanupErrors.push(String(error));}
  try{if(workerObservation){await workerObservation.settle();workerObservation.dispose();evidence.workerObservationSettled=true;}}
  catch(error){evidence.cleanupErrors.push('worker observation settlement: '+String(error));}
  try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){evidence.cleanupErrors.push(String(error));}
  const faultDelivered=evidence.requests.some(row=>row.active===2&&row.corrupt&&row.name===`/${manifests[2].namespace}pkg/solar_wasm.wasm`);
  const classified=classifyReleaseCacheErrors(evidence.workerErrorEvents,{faultConfirmed:criticalFaultConfirmed,faultDelivered,
    workerURLs:manifests.slice(0,2).map(manifest=>`${origin}/sw.js?v=${manifest.release_id}`)});
  evidence.expectedWorkerErrors=classified.expected;evidence.unexpectedWorkerErrors=classified.unexpected;
  evidence.result=completed&&evidence.workerObservationSettled===true&&!evidence.workerObservationErrors.length&&!evidence.pageErrors.length&&!evidence.unexpectedWorkerErrors.length&&!evidence.cleanupErrors.length?'passed':'failed';
  if(evidence.result==='passed')process.stdout.write(`PASS: actual-browser release cache ${out}\n`);
  else process.exitCode=1;
  fs.writeFileSync(path.join(out,"evidence.json"),JSON.stringify(evidence,null,2)+"\n");
}
