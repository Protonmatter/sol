#!/usr/bin/env node
// Browser proof for the production gallery, including source-bound optional images.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(key,value)=>process.argv.find(x=>x.startsWith('--'+key+'='))?.slice(key.length+3)??value;
const webRoot=path.resolve(arg('web-root',path.join(root,'apps/web')));
const out=path.resolve(arg('out',path.join(root,'coverage/planet-phenomena')));
const chrome=arg('browser',process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestFile=path.join(webRoot,'web-release-manifest.json');
const release=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):null;
const pageRoot=release?path.resolve(webRoot,release.namespace):webRoot;
assert.ok(pageRoot===webRoot||pageRoot.startsWith(webRoot+path.sep));
const sourceHashes={};
function input(name){
  const raw=fs.readFileSync(path.join(pageRoot,name));sourceHashes[name]=hash(raw);
  if(release){
    const relative=path.relative(webRoot,path.join(pageRoot,name)).split(path.sep).join('/');
    assert.equal(release.assets.find(a=>a.path===relative)?.sha256,hash(raw),'release binding: '+name);
  }return raw;
}
const manifest=JSON.parse(input('planet-phenomena.v1.json'));
const files=new Map();
for(const name of ['js/planetPhenomena.js','js/planetPhenomenaManifest.js','planet-phenomena.css',...manifest.observations.map(x=>x.asset.path)])files.set('/'+name,input(name));
const evidence={schema_version:'planet-phenomena-validation.v1',status:'running',scope:'Production historical observation gallery; no globe registration or current weather claim',
  web_root:webRoot,release_namespace:release?.namespace??null,source_hashes:sourceHashes,checks:[],runtime_errors:[]};
const requests=[];let browser,server,deadline,expired=false;
fs.mkdirSync(out,{recursive:true});
async function run(){
  server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SOL mission observation reference</title><link rel="stylesheet" href="/planet-phenomena.css"><style>body{background:#07111a;color:#e6edf5;font:14px system-ui;margin:0;padding:20px}main{max-width:600px;margin:auto}h1{font-size:22px}#host{border:1px solid #34404e;border-radius:12px;padding:14px;box-sizing:border-box}</style><main><h1>SOL · atmosphere in detail</h1><div id="host"></div></main>');return;}
    const raw=files.get(url.pathname);
    if(raw){const type=url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.png')?'image/png':'image/jpeg';res.writeHead(200,{'Content-Type':type,'Content-Length':raw.length});res.end(raw);}
    else{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await puppeteer.launch({executablePath:chrome,headless:true,timeout:15000,protocolTimeout:15000,
    args:['--no-sandbox','--disable-dev-shm-usage','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  if(expired){await closeOwnedBrowser(browser,{timeoutMs:5000});throw Error('Browser launched after validation deadline');}
  const page=await browser.newPage();await page.setViewport({width:760,height:1050});
  page.on('pageerror',error=>evidence.runtime_errors.push(error.message));
  page.on('request',request=>requests.push(request.url()));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load',timeout:15000});
  await page.evaluate(async()=>{const module=await import('/js/planetPhenomena.js');window.gallery={module,dispose:()=>{}};});
  for(const body of ['Jupiter','Saturn','Neptune']){
    await page.evaluate(body=>{window.gallery.dispose();window.gallery.dispose=window.gallery.module.renderPlanetPhenomena(document.querySelector('#host'),body);},body);
    for(const item of manifest.observations.filter(x=>x.body===body)){
      await page.select('.planet-phenomena__select',item.id);
      await page.waitForFunction(()=>{const image=document.querySelector('.planet-phenomena__image');return image&&!image.hidden&&image.complete&&image.naturalWidth>0;},{timeout:10000});
      const actual=await page.evaluate(()=>{const image=document.querySelector('.planet-phenomena__image');return {dimensions:[image.naturalWidth,image.naturalHeight],title:document.querySelector('.planet-phenomena__heading').textContent,source:document.querySelector('.planet-phenomena__source').href,status:document.querySelector('.planet-phenomena__status').textContent};});
      assert.deepEqual(actual.dimensions,item.asset.dimensions);assert.equal(actual.source,item.source_page);assert.equal(actual.title,item.title);
      evidence.checks.push({name:item.id+' decoded from verified source bytes',actual,passed:true});
      await page.screenshot({path:path.join(out,item.id+'.png'),fullPage:true});
    }
  }
  const imageRequests=requests.filter(url=>url.includes('/textures/phenomena/')).map(url=>new URL(url).pathname);
  assert.deepEqual(new Set(imageRequests),new Set(manifest.observations.map(x=>'/'+x.asset.path)));
  assert.ok(requests.every(url=>url.startsWith('http://127.0.0.1:')||url.startsWith('blob:http://127.0.0.1:')));
  evidence.checks.push({name:'all image requests remain selected same-origin references',requests:imageRequests,passed:true});
  await page.setViewport({width:390,height:844});
  const mobile=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth,select:document.querySelector('select').getBoundingClientRect().height}));
  assert.ok(mobile.scroll<=mobile.viewport);assert.ok(mobile.select>=44);
  evidence.checks.push({name:'mobile card fits viewport with native accessible control',actual:mobile,passed:true});
  await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  await page.evaluate(()=>{window.gallery.dispose();window.gallery.dispose=window.gallery.module.renderPlanetPhenomena(document.querySelector('#host'),'Earth');});
  assert.ok(await page.$eval('#host',node=>node.hidden&&node.children.length===0));
  evidence.checks.push({name:'unsupported body leaves no misleading observation',passed:true});
  assert.deepEqual(evidence.runtime_errors,[]);
}
try{
  await Promise.race([run(),new Promise((_,reject)=>{deadline=setTimeout(()=>{expired=true;reject(Error('Gallery browser validation exceeded 60 seconds'));},60000);})]);
  evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.message;process.exitCode=1;}
finally{
  clearTimeout(deadline);if(browser)await closeOwnedBrowser(browser,{timeoutMs:5000});
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log('Planet observations '+evidence.status+': '+evidence.checks.length+' checks. '+path.join(out,'evidence.json'));
  if(evidence.error)console.error(evidence.error);
}
