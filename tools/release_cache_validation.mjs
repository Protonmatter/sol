// Actual Chromium, three immutable local artifacts and two open clients. No external I/O.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import puppeteer from "puppeteer-core";
const option=(key,fallback)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.slice(key.length+3)||fallback;
const roots=["a","b","c"].map(key=>path.resolve(option(key,`build/cache-${key}`)));
const manifests=roots.map(root=>JSON.parse(fs.readFileSync(path.join(root,"web-release-manifest.json"),"utf8")));
assert.ok(manifests.every(m=>m.base_path==="/"),"this local harness requires root-path artifacts");
const out=path.resolve(option("out","coverage/release-cache"));fs.mkdirSync(out,{recursive:true});
const evidence={browser:"",releases:manifests.map(m=>m.release_id),checks:[],requests:[],workerErrors:[]};
let active=0,offline=false,corrupt=false,browser;
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  evidence.requests.push({name,active,offline,corrupt});
  if(offline){res.destroy();return;}
  const file=path.resolve(roots[active],`.${name.endsWith("/")?name+"index.html":name}`);
  if(!file.startsWith(roots[active]+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  let bytes=fs.readFileSync(file);
  if(corrupt&&name===`/${manifests[2].namespace}pkg/solar_wasm.wasm`){bytes=Buffer.from(bytes);bytes[0]^=1;}
  res.setHeader("Content-Type",({".js":"text/javascript",".html":"text/html",".json":"application/json",".wasm":"application/wasm",".css":"text/css"})[path.extname(file)]||"application/octet-stream");
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
try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN,headless:true,args:["--no-sandbox","--use-angle=swiftshader","--enable-unsafe-swiftshader","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]});
  evidence.browser=await browser.version();
  browser.on("targetcreated",async target=>{
    if(target.type()!=="service_worker")return;
    try{const session=await target.createCDPSession();await session.send("Runtime.enable");session.on("Runtime.exceptionThrown",event=>evidence.workerErrors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));}catch{}
  });
  const page=await browser.newPage();await page.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"reduce"}]);
  await page.goto(origin,{waitUntil:"domcontentloaded"});await ready(page);await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const old=await browser.newPage();await old.goto(`${origin}/${manifests[0].namespace}index.html`,{waitUntil:"domcontentloaded"});
  await old.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const oldUrl=old.url();
  await page.bringToFront();
  active=1;
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await page.waitForFunction(async()=>{const reg=await navigator.serviceWorker.getRegistration();return reg?.waiting?.state==="installed";},{timeout:45000,polling:100});
  assert.equal(new URL(page.url()).pathname,`/${manifests[0].namespace}index.html`,"waiting update cannot reload an open client");
  assert.equal(old.url(),oldUrl);
  await page.waitForSelector("#releaseUpdate:not([hidden])");
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
  evidence.result="passed";evidence.manifest_sha256=roots.map(root=>hash(fs.readFileSync(path.join(root,"web-release-manifest.json"))));
  process.stdout.write(`PASS: actual-browser release cache ${out}\n`);
} finally {
  if(browser)for(const page of await browser.pages())try{evidence.checks.push(await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker?.getRegistration();return {url:location.href,status:document.getElementById("releaseStatus")?.textContent,active:reg?.active?.scriptURL,waiting:reg?.waiting?.state,caches:await caches.keys()};
  }));}catch{}
  fs.writeFileSync(path.join(out,"evidence.json"),JSON.stringify(evidence,null,2)+"\n");
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
