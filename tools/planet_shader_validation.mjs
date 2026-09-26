// Native driver regression: cold Mars compilation must not invalidate Jupiter's map.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {browserBackendArgs,captureBrowserCapabilities,assertBrowserBackend} from './browser_backend.mjs';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const argument=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const url=argument('url',''),output=argument('output-dir','build/planet-shader-validation');
if(!url)throw Error('Provide --url=<local staged SOL URL>');
fs.mkdirSync(output,{recursive:true});
const warnings=[],errors=[],report={url,cases:[],warnings,errors};
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'),headless:true,args:browserBackendArgs('native')});
try{
  const page=await browser.newPage();page.setDefaultTimeout(60000);
  await page.setViewport({width:1280,height:900});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  page.on('console',m=>{if(m.type()==='warn')warnings.push(m.text());if(m.type()==='error')errors.push(m.text());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'networkidle0'});await page.click('[data-mode=orrery]');
  await page.waitForFunction(async()=>{
    const q=new URL(document.querySelector('script[type=module][src^="app.js"]').src).search;
    window.__planetValidationState=(await import('./js/store.js'+q)).store.orrery;
    return __planetValidationState?.bodies.length===9&&!__planetValidationState.entering;
  });
  report.capabilities=await page.evaluate(captureBrowserCapabilities);assertBrowserBackend('native',report.capabilities);
  await page.select('#orrerySolarMode','visible');
  await page.$eval('#orreryAnimate',e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.select('#orreryAnchor','Mars');
  report.pending=await page.evaluate(()=>Object.values(__planetValidationState.programDiagnostics).filter(x=>x.status==='loading').map(x=>x.key));
  assert(report.pending.includes('physicalSphere'),'cold physical compilation must be exercised');
  await page.select('#orreryAnchor','Jupiter');
  // Do not wrap draw calls or consume getError before upload: that would hide the
  // delayed error which the real texture uploader must detect on the broken build.
  await page.waitForFunction(()=>['ready','unavailable'].includes(__planetValidationState.illustrativeStatus.Jupiter));
  const state=()=>page.evaluate(()=>{
    const s=__planetValidationState,c=document.getElementById('orreryCanvas'),gl=c.getContext('webgl2');
    return {body:s.anchor,texture:s.illustrativeStatus[s.anchor],physical:s.programStatus.physical,optics:s.opticsStatus[s.anchor],camera:[s.az,s.el,s.radius],error:gl.getError(),engineError:s.engineError};
  });
  const initial=await state();report.cases.push(initial);
  assert.equal(initial.texture,'ready','Jupiter must retain its upgraded map after pending Mars cancellation');
  assert.equal(initial.error,0);assert.equal(initial.engineError,'');
  await (await page.$('#orreryCanvas')).screenshot({path:path.join(output,'jupiter-after-mars.png')});
  for(const body of ['Mars','Jupiter']){
    await page.select('#orreryAnchor',body);
    await page.waitForFunction(b=>['ready','unavailable'].includes(__planetValidationState.illustrativeStatus[b]),{},body);
    if(body==='Mars'){
      await page.waitForFunction(()=>__planetValidationState.programStatus.physical!=='loading',{timeout:35000});
      report.marsPrograms=await page.evaluate(()=>__planetValidationState.programDiagnostics);
    }
    for(let i=0;i<8;i++){
      await page.evaluate(({body,i})=>{
        const s=__planetValidationState;s.az=i*Math.PI/4;s.el=.2;s.radius=body==='Mars'?.23:.8;
        document.getElementById('orrerySize').dispatchEvent(new Event('input',{bubbles:true}));
      },{body,i});
      const sample=await state();report.cases.push(sample);assert.equal(sample.texture,'ready');assert.equal(sample.error,0);assert.equal(sample.engineError,'');
      await (await page.$('#orreryCanvas')).screenshot({path:path.join(output,`${body}-${i}.png`)});
    }
  }
  assert.deepEqual(errors,[]);assert.equal(warnings.filter(s=>s.includes('GL_INVALID')).length,0);
  report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await closeOwnedBrowser(browser);}
console.log(JSON.stringify(report,null,2));
