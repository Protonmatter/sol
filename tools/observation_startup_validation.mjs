// Local staged-image lifecycle checks with the actual application entry withheld.
// Functional evidence only: this harness does not qualify a loading-time budget.
import {releaseModulePath} from './release_module_urls.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {createStagedPreviewServer} from './staged_preview_server.mjs';
import {closeOwnedBrowserVerified} from './worker_coverage.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=(name,fallback)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const stage=path.resolve(argument('web-root',path.join(repo,'build/site')));
const out=path.resolve(argument('out',path.join(repo,'coverage/observation-startup')));
const fault=argument('fault','none');
assert.ok(['none','main-no-init'].includes(fault),'Unknown local fault injection');
const validation=spawnSync(process.env.PYTHON||'python',[path.join(repo,'tools/validate_release_manifest.py'),path.join(stage,'web-release-manifest.json')],{encoding:'utf8'});
assert.equal(validation.status,0,validation.stderr||validation.stdout||'Staged manifest validation failed');
const manifest=JSON.parse(fs.readFileSync(path.join(stage,'web-release-manifest.json'),'utf8'));
const visual=JSON.parse(fs.readFileSync(path.join(stage,manifest.namespace,'visual-assets.v1.json'),'utf8'));
const observation=visual.observed_images[0];
const imagePath=manifest.base_path+manifest.namespace+observation.path;
const cases=['ready-before-main','retry-before-main','retry-after-main','pending-at-main'];
const evidence={scope:'Actual staged early image, main-entry adoption and trusted retry. Service-worker bypass; no timing qualification.',fault,release_id:manifest.release_id,
  manifest_sha256:createHash('sha256').update(fs.readFileSync(path.join(stage,'web-release-manifest.json'))).digest('hex'),checks:[],errors:[]};
fs.mkdirSync(out,{recursive:true});
const server=createStagedPreviewServer(stage,manifest.base_path);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;

async function snapshot(page) {
  return page.evaluate(()=>{
    const image=document.getElementById('observationImage');
    return {src:image.currentSrc,width:image.naturalWidth,visible:image.checkVisibility(),
      busy:document.getElementById('observationMedia').getAttribute('aria-busy'),
      loading:!document.getElementById('observationLoading').hidden,
      unavailable:!document.getElementById('observationUnavailable').hidden,
      source:document.getElementById('viewSource').textContent,
      time:document.getElementById('viewTime').textContent,
      caption:document.getElementById('observationStatus').textContent,
      source_url:document.getElementById('observationSource').getAttribute('href'),
      credit:document.getElementById('observationCredit').textContent,
      alt:image.alt,
      retries:window.__observationRetries||[]};
  });
}

async function waitForImage(page,ready) {
  await page.waitForFunction(expected=>{
    const image=document.getElementById('observationImage');
    if(!image?.complete)return false;
    return expected ? image.naturalWidth>0&&image.checkVisibility()&&document.getElementById('observationMedia')?.getAttribute('aria-busy')==='false'
      : document.getElementById('observationUnavailable')?.hidden===false&&image.hidden;
  },{timeout:20000},ready);
}

try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  evidence.browser=await browser.version();
  for(const name of cases) {
    const check={name,status:'running',requests:[],page_errors:[]};
    evidence.checks.push(check);
    const context=await browser.createBrowserContext();
    let caseFailed=false;
    try {
      const page=await context.newPage();
      await page.setViewport({width:1440,height:900});
      await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      await page.setBypassServiceWorker(true);
      const held=[],heldImages=[],requests=check.requests,pageErrors=check.page_errors;
      let mainReleased=false,imageRequests=0;
      await page.setRequestInterception(true);
      page.on('request',request=>{
        const url=new URL(request.url());
        requests.push({path:url.pathname,type:request.resourceType()});
        if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol)){void request.abort();return;}
        if(url.pathname.endsWith('/app.js')&&!mainReleased){held.push(request);return;}
        if(url.pathname===imagePath){
          imageRequests++;
          if(name==='pending-at-main'){heldImages.push(request);return;}
          if(name!=='ready-before-main'&&imageRequests===1){void request.abort();return;}
        }
        void request.continue();
      });
      page.on('pageerror',error=>pageErrors.push(error.message));
      await page.evaluateOnNewDocument(()=>{
        window.__observationRetries=[];
        document.addEventListener('click',event=>{if(event.target?.id==='observationRetry')window.__observationRetries.push({trusted:event.isTrusted,at:performance.now()});},true);
      });
      const navigation=page.goto(origin+manifest.base_path,{waitUntil:'domcontentloaded',timeout:30000}).then(()=>({ok:true}),error=>({error:String(error)}));
      if(name==='pending-at-main')await page.waitForFunction(()=>document.readyState==='interactive',{timeout:20000});
      else await waitForImage(page,name==='ready-before-main');
      assert.ok(held.length>0,'main entry must actually be withheld');
      const early=await snapshot(page);
      check.early=early;
      assert.equal(imageRequests,1);
      assert.equal(early.busy,name==='pending-at-main'?'true':'false');
      assert.equal(early.loading,name==='pending-at-main');
      const capture=observation.captured_at ? observation.captured_at.replace('T',' ').replace('Z',' UTC')+' · archival' : 'Capture time unavailable · archival image';
      assert.equal(early.caption,capture);assert.equal(early.time,capture);
      assert.match(early.source,/observed.*NASA/);
      assert.equal(early.source_url,observation.source_url);assert.equal(early.credit,observation.credits);
      assert.ok(early.alt.includes(observation.interpretation));
      if(name==='retry-before-main') {
        await page.click('#observationRetry');await waitForImage(page,true);
        assert.equal(imageRequests,2);
      }
      const beforeMain=await snapshot(page);
      await page.screenshot({path:path.join(out,`${name}-early.png`)});
      mainReleased=true;
      for(const request of held) {
        if(fault==='main-no-init')await request.respond({status:200,contentType:'text/javascript',body:'// Deliberate local negative: main entry performs no initialization.\n'});
        else await request.continue();
      }
      assert.deepEqual(await navigation,{ok:true});
      const adopted=await snapshot(page);
      // Reading the actual canonical module cannot initialize its explorer. Static
      // captions and the early controller alone must fail this adoption proof.
      const explorerUrl=origin+manifest.base_path+manifest.namespace+releaseModulePath(manifest,'js/explorer.js');
      const actualMedia=()=>page.evaluate(async url=>(await import(url)).explorer.media,explorerUrl);
      adopted.explorer_media=await actualMedia();
      check.adopted=adopted;
      assert.equal(adopted.explorer_media,name==='pending-at-main'?'loading':beforeMain.unavailable?'failed':'ready','Main application did not adopt the shared observation state');
      assert.equal(imageRequests,name==='retry-before-main'?2:1,'application adoption cannot restart the image request');
      assert.equal(adopted.visible,beforeMain.visible);
      assert.equal(adopted.unavailable,beforeMain.unavailable);
      assert.match(adopted.time,/archival/);
      if(observation.captured_at)assert.ok(adopted.caption.includes(observation.captured_at.slice(0,10)));
      else assert.match(adopted.caption,/unavailable/);
      if(name==='retry-after-main') {await page.click('#observationRetry');await waitForImage(page,true);assert.equal(imageRequests,2);}
      if(name==='pending-at-main') {
        assert.equal(heldImages.length,1,'pending adoption cannot restart the parser request');
        for(const request of heldImages)await request.continue();
        await waitForImage(page,true);assert.equal(imageRequests,1);
      }
      const final=await snapshot(page);
      final.explorer_media=await actualMedia();assert.equal(final.explorer_media,'ready');
      assert.equal(final.visible,true);assert.equal(final.width,observation.dimensions[0]);
      assert.equal(new URL(final.src).pathname,imagePath);
      assert.equal(final.unavailable,false);assert.equal(final.loading,false);assert.equal(final.busy,'false');
      assert.equal(final.retries.length,['ready-before-main','pending-at-main'].includes(name)?0:1);
      assert.ok(final.retries.every(event=>event.trusted));
      assert.deepEqual(pageErrors,[]);
      await page.screenshot({path:path.join(out,`${name}-adopted.png`)});
      Object.assign(check,{status:'passed',beforeMain,adopted,final,image_requests:imageRequests,held_main_requests:held.length});
      console.log(JSON.stringify({name,status:'passed',image_requests:imageRequests,trusted_retries:final.retries.length}));
    } catch(error){caseFailed=true;throw error;}
    finally {
      try {await context.close();check.cleanup={status:'completed'};}
      catch(error){
        check.cleanup={status:'failed',message:String(error)};check.status='failed';
        if(!caseFailed)throw error;
        evidence.errors.push({owner:'context',case:name,message:String(error),stack:error?.stack});
      }
    }
  }
} catch(error){evidence.errors.push({message:String(error),stack:error?.stack});}
finally {
  evidence.cleanup={};
  const close=async(owner,operation)=>{
    try {await operation();evidence.cleanup[owner]={status:'completed'};}
    catch(error){
      const failure={owner,message:String(error),stack:error?.stack};
      evidence.cleanup[owner]={status:'failed',message:failure.message};evidence.errors.push(failure);
    }
  };
  if(browser)await close('browser',()=>closeOwnedBrowserVerified(browser));
  else evidence.cleanup.browser={status:'not_started'};
  await close('server_connections',()=>server.closeAllConnections());
  await close('server',()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  evidence.status=evidence.errors.length===0&&evidence.checks.length===cases.length&&evidence.checks.every(check=>check.status==='passed'&&check.page_errors.length===0)?'passed':'failed';
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({status:evidence.status,out,errors:evidence.errors}));
  process.exitCode=evidence.status==='passed'?0:1;
}
