#!/usr/bin/env node
// Actual staged DOM/canvas playback. No external requests, fabricated images, or UI mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {createStagedPreviewServer} from './staged_preview_server.mjs';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const webRoot=path.resolve(option('web-root',path.join(root,'build/site-dynamic-sun-02')));
const out=path.resolve(option('out',path.join(root,'build/solar-sequence-browser')));
const browserPath=option('browser',process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe');
const release=JSON.parse(fs.readFileSync(path.join(webRoot,'web-release-manifest.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pageRoot=path.resolve(webRoot,release.namespace);
assert.ok(pageRoot.startsWith(webRoot+path.sep),'release namespace containment');
const input=relative=>{
  const filename=path.join(pageRoot,relative),raw=fs.readFileSync(filename);
  const record=release.assets.find(a=>a.path===release.namespace+relative);
  assert.ok(record,`missing release asset ${relative}`);assert.equal(raw.length,record.size);assert.equal(hash(raw),record.sha256);
  return raw;
};
const source=JSON.parse(input('solar-observation-sequence.v1.json'));
for(const frame of source.frames){const raw=input(frame.asset_path);assert.equal(hash(raw),frame.sha256);}
for(const module of ['js/solarSequenceControls.js','js/solarSequencePlayer.js','js/explorer.js','index.html'])input(module);
const evidence={schema_version:'solar-sequence-browser-validation.v1',release:release.release_id,source_sha:release.source_sha,
  manifest_sha256:hash(input('solar-observation-sequence.v1.json')),scope:'Actual staged archive DOM and decoded canvas pixels; not scientific quality or device/GPU qualification',checks:[],errors:[],captures:[]};
fs.mkdirSync(out,{recursive:true});
const save=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const server=createStagedPreviewServer(webRoot,release.base_path);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,page;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  browser=await puppeteer.launch({executablePath:browserPath,headless:true,timeout:20000,protocolTimeout:30000,
    args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage();await page.setViewport({width:1280,height:1000});await page.setBypassServiceWorker(true);
  page.on('pageerror',error=>{evidence.errors.push(error.message);save();});
  await page.setRequestInterception(true);
  page.on('request',request=>{const url=new URL(request.url());if(['data:','blob:'].includes(url.protocol)||url.hostname==='127.0.0.1')request.continue();else{evidence.errors.push(`External request blocked: ${url.origin}`);request.abort();}});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.goto(`http://127.0.0.1:${server.address().port}${release.base_path}`,{waitUntil:'networkidle0',timeout:45000});
  const state=()=>page.evaluate(async()=>{
    const query=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {currentObservationPresentation}=await import('./js/explorer.js'+query);
    const {store}=await import('./js/store.js'+query);
    const canvas=document.getElementById('observationSequenceCanvas');
    const bytes=canvas.getContext('2d').getImageData(0,0,512,512).data;
    const pixelHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    return {presentation:currentObservationPresentation(),selected:document.getElementById('observationSequenceToggle').getAttribute('aria-pressed'),
      playing:document.getElementById('observationSequencePlay').getAttribute('aria-pressed'),index:Number(document.getElementById('observationSequenceTime').value),
      hidden:canvas.hidden,stillHidden:document.getElementById('observationImage').hidden,pixelHash,nonzero:bytes.some((v,i)=>i%4!==3 && v>0),
      modelTimelineIndex:store.timelineIndex,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  await page.click('#observationSequenceToggle');
  await page.waitForFunction(()=>!document.getElementById('observationSequenceCanvas').hidden && document.getElementById('observationSequencePlay').disabled===true,{timeout:15000});
  let first=await state();assert.equal(first.selected,'true');assert.equal(first.playing,'false');assert.equal(first.presentation.capturedAt,source.frames[0].observed_at);assert.equal(first.presentation.sourceKind,'observed');assert.equal(first.presentation.compositingPermitted,false);assert.equal(first.stillHidden,true);assert.equal(first.nonzero,true);
  evidence.checks.push({name:'selection displays first actual archive frame paused',state:first});save();
  const canvas=await page.$('#observationSequenceCanvas');
  await canvas.screenshot({path:path.join(out,'archive-first.png')});evidence.captures.push('archive-first.png');
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);await page.select('#observationSequenceRate','600');await page.click('#observationSequencePlay');
  await page.waitForFunction(()=>Number(document.getElementById('observationSequenceTime').value)>=2,{timeout:10000});
  await page.click('#observationSequencePlay');const paused=await state();assert.equal(paused.playing,'false');assert.equal(paused.presentation.capturedAt,source.frames[paused.index].observed_at);
  await wait(350);const held=await state();assert.equal(held.presentation.capturedAt,paused.presentation.capturedAt);assert.equal(held.pixelHash,paused.pixelHash);assert.equal(held.modelTimelineIndex,first.modelTimelineIndex);
  evidence.checks.push({name:'play advances real source time and pause holds exact pixels/time',state:paused});
  await page.$eval('#observationSequenceTime',el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>Number(document.getElementById('observationSequenceTime').value)===120 && document.getElementById('observationSequenceTimeLabel').textContent.includes('18:30:09.350'),{timeout:10000});
  const last=await state();assert.equal(last.presentation.capturedAt,source.frames.at(-1).observed_at);assert.notEqual(last.pixelHash,first.pixelHash);assert.equal(last.playing,'false');
  await canvas.screenshot({path:path.join(out,'archive-last.png')});evidence.captures.push('archive-last.png');
  await page.click('#observationSequencePlay');await wait(250);assert.equal((await state()).index,120);
  evidence.checks.push({name:'scrub displays exact endpoint pixels and no automatic loop',state:last});
  await page.click('#observationSequenceRestart');await page.waitForFunction(()=>Number(document.getElementById('observationSequenceTime').value)===0);
  await page.click('#observationSequencePlay');await page.waitForFunction(()=>document.getElementById('observationSequencePlay').getAttribute('aria-pressed')==='true');
  await page.click('[data-mode="sky"]');const hidden=await state();assert.equal(hidden.playing,'false');await wait(350);
  await page.click('[data-mode="today"]');const returned=await state();assert.equal(returned.playing,'false');assert.equal(returned.presentation.capturedAt,hidden.presentation.capturedAt);
  evidence.checks.push({name:'navigation pauses and return has no catch-up',state:returned});
  await page.evaluate(()=>{
    const query=matchMedia('(prefers-reduced-motion: reduce)');
    globalThis.__sequenceMotionAudit={query,events:[],before:{matches:query.matches,visibility:document.visibilityState}};
    query.addEventListener('change',event=>globalThis.__sequenceMotionAudit.events.push({matches:event.matches,time:performance.now(),playing:document.getElementById('observationSequencePlay').getAttribute('aria-pressed')}));
  });
  await page.click('#observationSequencePlay');
  await page.waitForFunction(()=>document.getElementById('observationSequencePlay').getAttribute('aria-pressed')==='true'
    && !matchMedia('(prefers-reduced-motion: reduce)').matches,{timeout:5000});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches,{timeout:5000});
  await page.waitForFunction(()=>document.getElementById('observationSequencePlay').getAttribute('aria-pressed')==='false',{timeout:5000});
  const motionAudit=await page.evaluate(()=>({before:globalThis.__sequenceMotionAudit.before,events:globalThis.__sequenceMotionAudit.events,matches:globalThis.__sequenceMotionAudit.query.matches,visibility:document.visibilityState}));
  const reduced=await state();await wait(250);const reducedHeld=await state();
  assert.equal(reducedHeld.presentation.capturedAt,reduced.presentation.capturedAt);assert.equal(reducedHeld.pixelHash,reduced.pixelHash);
  evidence.checks.push({name:'reduced-motion preference pauses actual controls and holds pixels/time',motionAudit});
  // Resize the same live document. Switching Puppeteer's isMobile flag would
  // reload it and reset the selected source, invalidating this continuity check.
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});await page.screenshot({path:path.join(out,'archive-mobile-layout.png'),fullPage:true});assert.equal((await state()).overflow,false);
  await page.click('#observationSequenceToggle');const still=await state();assert.equal(still.selected,'false');assert.equal(still.hidden,true);assert.equal(still.stillHidden,false);
  evidence.checks.push({name:'mobile layout bounded and toggle restores original still'});
  assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));evidence.passed=true;save();console.log(JSON.stringify({passed:true,checks:evidence.checks.length,out}));
}catch(error){evidence.errors.push(error.message);evidence.passed=false;if(page){
  evidence.failureState=await page.evaluate(()=>({motion:matchMedia('(prefers-reduced-motion: reduce)').matches,visibility:document.visibilityState,
    playing:document.getElementById('observationSequencePlay')?.getAttribute('aria-pressed'),label:document.getElementById('observationSequenceTimeLabel')?.textContent,
    motionEvents:globalThis.__sequenceMotionAudit?.events??null})).catch(()=>null);
  await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});
}save();throw error;}
finally{if(browser)await closeOwnedBrowser(browser);await new Promise(resolve=>server.close(resolve));}
