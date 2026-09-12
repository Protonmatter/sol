// Local-only Sky workflow evidence: locked Chromium driver, fresh staged WASM,
// mock recipient only. No astronomical accuracy or assistive-tech qualification.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import puppeteer from "puppeteer-core";

const option=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const root=path.resolve(option("web-root","build/p12-preview")),out=path.resolve(option("out","coverage/p12-sky"));
const manifest=JSON.parse(fs.readFileSync(path.join(root,"web-release-manifest.json"),"utf8"));
const evidence={checks:[],errors:[],workers:[],mockRequests:0,redirectTargetRequests:0};
const redirectTarget=http.createServer((_req,res)=>{evidence.redirectTargetRequests++;res.writeHead(502,{"Access-Control-Allow-Origin":"*"}).end("local redirect destination");});
await new Promise(resolve=>redirectTarget.listen(0,"127.0.0.1",resolve));
const redirectOrigin=`http://127.0.0.1:${redirectTarget.address().port}`;
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(pathname.startsWith("/redirect-provider/")){res.writeHead(302,{Location:redirectOrigin+req.url,"Access-Control-Allow-Origin":"*"}).end();return;}
  if(pathname.startsWith("/mock-")){evidence.mockRequests++;res.writeHead(502,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}).end('{"error":"offline test provider","code":"upstream_failed"}');return;}
  const file=path.resolve(root,`.${pathname.endsWith("/")?pathname+"index.html":pathname}`);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader("Content-Type",({".js":"text/javascript",".html":"text/html",".wasm":"application/wasm",".json":"application/json",".css":"text/css"})[path.extname(file)]||"application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
fs.mkdirSync(out,{recursive:true});
try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN,headless:true,args:["--no-sandbox","--use-angle=swiftshader","--enable-unsafe-swiftshader","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]});
  const page=await browser.newPage();
  page.on("pageerror",e=>evidence.errors.push(e.message));
  page.on("workercreated",worker=>evidence.workers.push(new URL(worker.url()).pathname));
  await page.setBypassServiceWorker(true);
  const cdp=await page.createCDPSession();await cdp.send("Network.enable");await cdp.send("Network.setBlockedURLs",{urls:["https://*","http://localhost/*"]});
  await page.evaluateOnNewDocument(base=>{
    window.SOL_EPHEMERIS_SERVER=base+"/mock-one";
    window.__copies=[];Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>window.__copies.push(value)}});
  },origin);
  await page.setViewport({width:1440,height:900});
  await page.goto(origin,{waitUntil:"networkidle0"});
  const prefix=new URL(".",page.url()).pathname;
  const token=await page.evaluate(async()=> (await (await fetch("app.js")).text()).match(/sky\.js(\?v=[A-Za-z0-9._-]+)/)?.[1]||"");
  const moduleUrl=`${prefix}js/sky.js${token}`;
  await page.click('[data-mode="sky"]');
  await page.waitForFunction(()=>window.__skyDebug?.().snap,{timeout:20000});
  assert.ok(evidence.workers.some(url=>url.includes("skyWorker.js")),"real Sky snapshot uses a module worker");
  assert.match(await page.$eval("#skyLocLabel",n=>n.textContent),/example/);
  assert.equal(evidence.mockRequests,0);
  const redirectHealth=await page.evaluate(async({prefix,token,origin})=>{
    const {SkyConsent}=await import(`${prefix}js/skyPrivacy.js${token}`);
    const {checkServerHealth}=await import(`${prefix}js/skyEngine.js${token}`);
    const consent=new SkyConsent();consent.setRecipient(origin+"/redirect-provider");consent.grant();
    return checkServerHealth(origin+"/redirect-provider",consent);
  },{prefix,token,origin});
  assert.equal(redirectHealth,false);assert.equal(evidence.redirectTargetRequests,0,"health must never contact redirect destination");
  const beforeRedirect=await page.evaluate(()=>JSON.stringify(window.__skyDebug().snap));
  const workersBeforeRedirect=evidence.workers.length;
  await page.evaluate(base=>{window.SOL_EPHEMERIS_SERVER=base+"/redirect-provider";},origin);
  await page.click("#skyProviderServer");await page.click("#skyConsentAllow");
  await page.waitForFunction(()=>/Requested Sky unavailable/.test(document.getElementById("skyProvenance").textContent));
  assert.equal(evidence.redirectTargetRequests,0,"snapshot must never contact redirect destination");
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__skyDebug().snap)),beforeRedirect,"redirect failure retains exact validated snapshot");
  assert.equal(evidence.workers.length,workersBeforeRedirect,"redirect failure never starts an implicit local fallback worker");
  await page.click("#skyConsentRevoke");await page.waitForFunction(()=>/Source: computed on device/.test(document.getElementById("skyProvenance").textContent),{timeout:20000});
  await page.evaluate(base=>{window.SOL_EPHEMERIS_SERVER=base+"/mock-one";},origin);
  await page.focus('#skyList [data-object-id="Moon"]');await page.keyboard.press("Enter");
  assert.match(await page.$eval("#skySelectedFacts",n=>n.textContent),/Moon/);
  const focus=await page.evaluate(async url=>{
    const module=await import(url),node=document.activeElement;
    for(let i=0;i<10;i++){await module.renderSky();if(document.activeElement!==node)return false;}
    return true;
  },moduleUrl);
  assert.equal(focus,true,"ten actual worker refreshes preserve focused native row");
  await page.type("#skySearch","Mars");
  assert.match(await page.$eval("#skySelectedFacts",n=>n.textContent),/Moon/);
  assert.equal(await page.$$eval("#skyList button:not([hidden])",nodes=>nodes.length),1);
  await page.select("#skyFilter","below");
  const geometry=await page.evaluate(()=>Array.from(document.querySelectorAll("#skyList button:not([hidden])")).every(node=>window.__skyDebug().snap.bodies.find(b=>b.name===node.dataset.objectId).alt_deg<=0));assert.equal(geometry,true);
  await page.$eval("#skySearch",n=>{n.value="";n.dispatchEvent(new Event("input"));});await page.select("#skyFilter","all");
  assert.ok(await page.$eval("#skyList",n=>n.getBoundingClientRect().height<=540),"complete catalogue list has a bounded scroll area");
  const before=await page.evaluate(()=>JSON.stringify(window.__skyDebug().snap));
  await page.$eval("#skyLat",n=>{n.value="91";});await page.$eval("#skyLon",n=>{n.value="0";});await page.click("#skySet");
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__skyDebug().snap)),before);assert.match(await page.$eval("#skyInputError",n=>n.textContent),/bounds/);
  await page.select("#skyTimeMode","utc");assert.match(await page.$eval("#skyTimeLabel",n=>n.textContent),/display in UTC/);
  await page.evaluate(()=>{
    for(const [id,value] of [["skyLat","12.345678"],["skyLon","-76.54321"],["skyElev","123.5"]])document.getElementById(id).value=value;
    document.getElementById("skySet").click();
    const time=document.getElementById("skyTime");time.value="2026-07-01T12:00";time.dispatchEvent(new Event("change"));
  });
  await page.waitForFunction(()=>{
    const s=window.__skyDebug().snap;
    return s.observer.terrestrial_lat_deg===12.345678&&s.observer.terrestrial_lon_deg_east===-76.54321&&s.observer.elev_m===123.5&&s.time.jd_utc===2461223;
  },{timeout:20000});
  const stableRoot=new URL(manifest.base_path,origin).href;
  const capturedHash="#sky=12.345678,-76.54321,1782907200,123.5";
  await page.click("#skyShare");assert.equal(await page.evaluate(()=>window.__copies.length),0);assert.equal(await page.$eval("#skySharePreview",n=>n.hidden),false);assert.match(await page.$eval("#skySharePreviewText",n=>n.textContent),/precise latitude/);
  // A newer snapshot must not replace the observer/time already disclosed for sharing.
  await page.$eval("#skyTime",n=>{n.value="2026-07-02T12:00";n.dispatchEvent(new Event("change"));});
  await page.waitForFunction(()=>window.__skyDebug().snap.time.jd_utc===2461224,{timeout:20000});
  await page.click("#skyShareConfirm");assert.equal(await page.evaluate(()=>window.__copies.length),1);
  assert.equal(await page.evaluate(()=>window.__copies[0]),stableRoot+capturedHash,"share uses the deployment root and originally previewed snapshot");
  const clipboardFallbacks=[];
  for(const mode of ["missing","rejected"]){
    await page.evaluate(mode=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:mode==="missing"?undefined:{writeText:async()=>{throw new DOMException("Permission denied","NotAllowedError");}}}),mode);
    await page.click("#skyShare");
    assert.equal(await page.$("#skyShareManualCopy"),null,"manual copy field requires confirmation");
    const beforeHash=await page.evaluate(()=>location.hash);
    await page.click("#skyShareConfirm");
    await page.waitForSelector("#skyShareManualCopy",{visible:true,timeout:5000});
    const manual=await page.$eval("#skyShareManualCopy",n=>({readOnly:n.readOnly,label:n.getAttribute("aria-label"),value:n.value,focused:document.activeElement===n,start:n.selectionStart,end:n.selectionEnd}));
    assert.equal(manual.readOnly,true);assert.match(manual.label,/share link/i);assert.equal(manual.focused,true);
    assert.equal(manual.start,0);assert.equal(manual.end,manual.value.length);
    assert.equal(manual.value,stableRoot+"#sky=12.345678,-76.54321,1782993600,123.5");
    assert.match(await page.$eval("#skyInputError",n=>n.textContent),/copy.*manually/i);
    assert.equal(await page.$eval("#skySharePreview",n=>n.hidden),false);
    assert.equal(await page.evaluate(()=>location.hash),beforeHash,"fallback must not publish precise coordinates in browser history");
    await page.setViewport({width:390,height:844});
    await page.$eval("#skyShareManualCopy",n=>n.scrollIntoView({block:"center"}));
    const narrow=await page.evaluate(()=>{
      const field=document.getElementById("skyShareManualCopy");
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,
        controlsFit:["skyShareManualCopy","skyShareConfirm","skyShareCancel"].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;}),
        focused:document.activeElement===field,selected:field.selectionStart===0&&field.selectionEnd===field.value.length};
    });
    assert.deepEqual(narrow,{overflow:false,controlsFit:true,focused:true,selected:true},`${mode}: manual copy works at 390px`);
    await page.screenshot({path:path.join(out,`sky-share-manual-${mode}-390.png`)});
    await page.click("#skyShareCancel");
    assert.equal(await page.$("#skyShareManualCopy"),null);assert.equal(await page.$eval("#skySharePreview",n=>n.hidden),true);
    clipboardFallbacks.push({mode,selected:true,readOnly:true,accessibleLabel:true,cancelCleared:true,narrow});
    await page.setViewport({width:1440,height:900});
  }
  await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>window.__copies.push(value)}}));
  await page.click("#skyExport");assert.match(await page.$eval("#skySharePreviewText",n=>n.textContent),/Raw JSON/);await page.click("#skyShareCancel");
  await page.click("#skyProviderServer");assert.equal(evidence.mockRequests,0);await page.click("#skyConsentDeny");assert.equal(evidence.mockRequests,0);
  await page.waitForFunction(()=>/Source: computed on device/.test(document.getElementById("skyProvenance").textContent),{timeout:20000});
  await page.click("#skyProviderServer");await page.evaluate(base=>{window.SOL_EPHEMERIS_SERVER=base+"/mock-two";},origin);await page.click("#skyConsentAllow");assert.equal(evidence.mockRequests,0);assert.match(await page.$eval("#skyInputError",n=>n.textContent),/Recipient changed/);
  const retained=await page.evaluate(()=>JSON.stringify(window.__skyDebug().snap));
  await page.click("#skyConsentAllow");await page.waitForFunction(()=>/Requested Sky unavailable/.test(document.getElementById("skyProvenance").textContent));
  assert.equal(evidence.mockRequests,1);assert.equal(await page.evaluate(()=>JSON.stringify(window.__skyDebug().snap)),retained,"remote error retains exact snapshot, no hidden local fallback");
  await page.click("#skyConsentRevoke");await page.waitForFunction(()=>/Source: computed on device/.test(document.getElementById("skyProvenance").textContent),{timeout:20000});assert.equal(evidence.mockRequests,1);
  const lifecycle=await page.evaluate(async url=>{
    const module=await import(url),before=window.__skyDebug().snap;
    const pending=module.renderSky();module.leaveSky();await pending;
    const retained=window.__skyDebug().snap===before;
    module.enterSky();return retained;
  },moduleUrl);assert.equal(lifecycle,true,"navigation cancellation retains last valid state");
  await page.waitForFunction(()=>/Source: computed on device/.test(document.getElementById("skyProvenance").textContent),{timeout:20000});
  for(const width of [1440,390,320]) {
    await page.setViewport({width,height:900});await page.evaluate(()=>window.dispatchEvent(new Event("resize")));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${width}: no horizontal overflow`);
    await page.screenshot({path:path.join(out,`sky-${width}.png`),fullPage:true});
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`sky-hero-${width}.png`)});
    await page.$eval("#skySelectedFacts",n=>n.scrollIntoView());await page.screenshot({path:path.join(out,`sky-facts-${width}.png`)});
    evidence.checks.push({width,overflow});
  }
  assert.deepEqual(evidence.errors,[]);
  const shared=await page.evaluate(()=>window.__copies[0]);
  await page.goto(shared,{waitUntil:"networkidle0"});
  const immutablePath=manifest.base_path+manifest.namespace+"index.html";
  await page.waitForFunction(expected=>location.pathname===expected,{timeout:20000},immutablePath);
  assert.equal(new URL(page.url()).hash,capturedHash,"actual root bootstrap must forward the entire captured fragment");
  await page.reload({waitUntil:"networkidle0"});
  assert.equal(new URL(page.url()).pathname,immutablePath);assert.equal(new URL(page.url()).hash,capturedHash);
  await page.click('[data-mode="sky"]');
  await page.waitForFunction(()=>window.__skyDebug?.().snap,{timeout:20000});
  assert.match(await page.$eval("#skyLocLabel",n=>n.textContent),/Shared location/);
  const roundtrip=await page.evaluate(()=>{
    const [lat,lon,unix,elev]=location.hash.slice(5).split(",").map(Number),s=window.__skyDebug().snap;
    return s.observer.terrestrial_lat_deg===lat&&s.observer.terrestrial_lon_deg_east===lon&&s.observer.elev_m===elev&&Math.abs(s.time.jd_utc-(unix/86400+2440587.5))<=2**-29;
  });assert.equal(roundtrip,true,"copied precise location/time survives an actual page reload");
  assert.deepEqual(evidence.errors,[]);
  evidence.checks.push({focus,geometry,lifecycle,clipboardFallbacks,shareStablePath:manifest.base_path,capturedSnapshot:true,bootstrapPath:immutablePath,fragmentPreserved:true,roundtrip,remoteRequests:evidence.mockRequests,result:"passed"});
  console.log("PASS: actual Sky worker, keyed focus, privacy, recovery, cancellation and reflow");
} finally {
  fs.writeFileSync(path.join(out,"evidence.json"),JSON.stringify(evidence,null,2)+"\n");
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>redirectTarget.close(resolve));
}
