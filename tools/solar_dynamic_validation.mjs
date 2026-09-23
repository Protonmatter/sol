#!/usr/bin/env node
// Staged-application acceptance, on a fresh browser profile and actual WebGL2.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {createStagedPreviewServer} from './staged_preview_server.mjs';
import {closeOwnedBrowser} from './worker_coverage.mjs';
import {browserBackendArgs,assertBrowserBackend,captureBrowserCapabilities} from './browser_backend.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const webRoot=path.resolve(option('web-root',path.join(root,'build/site-dynamic-sun-01')));
const out=path.resolve(option('out',path.join(root,'build/dynamic-sun-browser')));fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(webRoot,'web-release-manifest.json'),'utf8'));
const backend=option('backend','native'),server=createStagedPreviewServer(webRoot,manifest.base_path);
const evidence={scope:'Actual staged application: illustrative solar renderer and controls; not physical iPhone or calibrated plasma qualification',release:manifest.release_id,source_sha:manifest.source_sha,checks:[],errors:[],captures:[],states:[]};
const save=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
for(const asset of manifest.assets){const bytes=fs.readFileSync(path.join(webRoot,asset.path));assert.equal(bytes.length,asset.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;
try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
    args:[...browserBackendArgs(backend),'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  page=await browser.newPage();page.on('pageerror',e=>{evidence.errors.push(e.message);save();});
  await page.setViewport({width:1280,height:1000});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.goto(`http://127.0.0.1:${server.address().port}${manifest.base_path}`,{waitUntil:'networkidle0',timeout:45000});
  await page.click('[data-mode="orrery"]');
  const state=()=>page.evaluate(async()=>{
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import('./js/store.js'+q),s=store.orrery;
    return {mode:s.solarMode,inspection:s.solarInspection,dynamic:s.solarDynamicStatus,clock:s.solarDynamicClock,
      epoch:s.renderUnix,active:s.active,program:s.programStatus,error:s.engineError,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  await page.waitForFunction(async()=>{const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;const {store}=await import('./js/store.js'+q);return store.orrery?.bodies?.length===9;},{timeout:30000});
  await page.click('#orreryInspectSun');
  await page.waitForFunction(async()=>{const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;const {store}=await import('./js/store.js'+q);return ['ready','unavailable'].includes(store.orrery.solarDynamicStatus.state);},{timeout:45000});
  let s=await state();evidence.states.push(s);save();assert.equal(s.dynamic.state,'ready',s.dynamic.reason);assert.equal(s.mode,'dynamic-euv');
  evidence.capabilities=await page.evaluate(captureBrowserCapabilities);assertBrowserBackend(backend,evidence.capabilities);
  const canvas=await page.$('#orreryCanvas');
  async function capture(name){const file=path.join(out,`${name}.png`);await canvas.screenshot({path:file});evidence.captures.push({name,file});save();return PNG.sync.read(fs.readFileSync(file));}
  async function canonicalView(view){
    await page.evaluate(async view=>{
      const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
      const [{store},{iauRotation},{BODY},{SOLAR_SOURCE_UNIX}]=await Promise.all([import('./js/store.js'+q),import('./js/orreryMath.js'+q),import('./js/bodyData.js'+q),import('./js/solarAppearance.js'+q)]);
      const s=store.orrery,r=iauRotation(BODY.Sun,SOLAR_SOURCE_UNIX+s.solarDynamicClock.seconds);
      const column=view==='north'?8:view==='limb'?4:0,sign=view==='back'?-1:1;
      const axis=[r[column],r[column+1],r[column+2]].map(n=>n*sign);
      s.az=Math.atan2(axis[1],axis[0]);s.el=Math.asin(axis[2]);
      const time=document.getElementById('solarDynamicTime');time.dispatchEvent(new Event('input',{bubbles:true}));
    },view);
  }
  for(const view of ['front','limb','back','north']){await canonicalView(view);await capture('canonical-'+view);}
  await canonicalView('front');
  const first=await capture('euv-front-t0');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.$eval('#solarDynamicTime',el=>{el.value='900';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const second=await capture('euv-front-t900');
  let changed=0,difference=0;
  for(let i=0;i<first.data.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(first.data[i+c]-second.data[i+c]);if(d>9)changed++;difference+=d;}
  assert.ok(changed>200,'scenario changes must affect more than a label');
  evidence.checks.push({name:'fixed-camera modeled time changes rendered pixels',changed,mean_channel_difference:difference/(first.width*first.height*3)});
  const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.85,box.y+box.height*.5,{steps:10});await page.mouse.up();
  await capture('euv-orbited');
  await page.select('#orrerySolarMode','dynamic-visible');await capture('photosphere');
  await page.click('#solarDynamicLayers > summary');await page.click('#solarDynamicCloseup');await capture('photosphere-closeup');
  await page.click('#solarDynamicWhole');
  await page.select('#orrerySolarMode','dynamic-euv');
  await canonicalView('front');
  const exposureMeans=[];
  for(const ev of ['0','-2','-4']){
    await page.select('#solarDynamicExposure',ev);const frame=await capture('euv-exposure-'+ev);
    let sum=0;for(let i=0;i<frame.data.length;i+=4)sum+=frame.data[i]+frame.data[i+1]+frame.data[i+2];
    exposureMeans.push(sum/(frame.width*frame.height*3));
  }
  assert.ok(exposureMeans[0]>exposureMeans[1]&&exposureMeans[1]>exposureMeans[2],'Exposure must act before tone mapping');
  await page.select('#solarDynamicExposure','0');await page.click('#solarDynamicCorona');await capture('euv-disk-only');await page.click('#solarDynamicCorona');
  evidence.checks.push({name:'exposure controls and corona-free disk diagnostic',exposureMeans});
  await page.click('#solarDynamicCool');await capture('euv-cool-plasma');await page.click('#solarDynamicCool');
  await page.click('#solarDynamicEruption');
  await page.$eval('#solarDynamicTime',el=>{el.value='2700';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await capture('euv-explicit-eruption');
  // Actual context-generation recovery, retaining a paused, usable model.
  await page.$eval('#orreryCanvas',el=>new Promise((resolve,reject)=>{
    const ext=el.getContext('webgl2').getExtension('WEBGL_lose_context');if(!ext){reject(Error('Context-loss extension unavailable'));return;}
    const timeout=setTimeout(()=>reject(Error('Context restoration timed out')),10000);
    el.addEventListener('webglcontextrestored',()=>{clearTimeout(timeout);resolve(true);},{once:true});
    el.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),150),{once:true});ext.loseContext();
  }));
  await page.waitForFunction(async()=>{const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;const {store}=await import('./js/store.js'+q);return store.orrery.solarDynamicStatus.state==='ready';},{timeout:45000});
  assert.equal((await state()).clock.playing,false);evidence.checks.push({name:'context loss restores verified resources and remains paused'});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  await page.click('#solarDynamicPlay');
  await page.waitForFunction(()=>document.getElementById('solarDynamicPlay').getAttribute('aria-pressed')==='true');
  const timings=await page.evaluate(()=>new Promise(resolve=>{
    const intervals=[];let previous=performance.now(),start=previous;
    const next=now=>{intervals.push(now-previous);previous=now;if(now-start<5000)requestAnimationFrame(next);else resolve(intervals);};requestAnimationFrame(next);
  }));
  timings.sort((a,b)=>a-b);evidence.checks.push({name:'native five-second active frame cadence (not thermal qualification)',frames:timings.length,p50_ms:timings[Math.floor(timings.length*.5)],p95_ms:timings[Math.floor(timings.length*.95)]});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.waitForFunction(()=>document.getElementById('solarDynamicPlay').getAttribute('aria-pressed')==='false',{timeout:5000});
  s=await state();assert.equal(s.clock.playing,false);evidence.checks.push({name:'reduced motion pauses model',seconds:s.clock.seconds});
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.select('#orrerySolarMode','dynamic-euv');await page.click('#solarDynamicWhole');
  await page.waitForFunction(async()=>{const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;const {store}=await import('./js/store.js'+q);return store.orrery.solarDynamicStatus.state==='ready';},{timeout:45000});
  await page.screenshot({path:path.join(out,'mobile-layout.png'),fullPage:true});
  s=await state();evidence.states.push(s);assert.equal(s.dynamic.state,'ready');assert.equal(s.overflow,false,'mobile layout must not overflow');
  assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));evidence.checks.push({name:'responsive layout and no page errors'});evidence.passed=true;save();
  console.log(JSON.stringify({checks:evidence.checks,out}));
}catch(error){evidence.passed=false;evidence.errors.push(error.message);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});save();throw error;}
finally{if(browser)await closeOwnedBrowser(browser);await new Promise(resolve=>server.close(resolve));}
