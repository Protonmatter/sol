// Condition-based transport for the existing Python smoke assertions. No virtual clock:
// hash validation and worker WASM must get real event-loop time before DOM capture.
import puppeteer from "puppeteer-core";
const [browserPath,url,screenshotPath]=process.argv.slice(2);
const target=new URL(url);
if(target.protocol!=="http:"||target.hostname!=="127.0.0.1"||target.username||target.password)throw new Error("Smoke driver requires a credential-free loopback HTTP fixture");
const sunTarget=target.pathname.endsWith("/index.html")&&!target.hash.startsWith("#sky=");
let browser;
let launchPromise;
let expired=false;
let phase="launch";
const controller=new AbortController();
// Python allows 100 seconds. At most 75 seconds of work plus 2 seconds
// launch-cancellation settlement and 8 seconds close leaves a 15-second margin.
const RUN_MS=75000, LAUNCH_SETTLE_MS=2000, CLOSE_MS=8000;
const errors=[];
const closing=new WeakMap();
function closeOwned(owned) {
  if(closing.has(owned))return closing.get(owned);
  const cleanup=(async()=>{
    let timer;
    try {
      await Promise.race([Promise.resolve().then(()=>owned.close()),new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("owned smoke browser close deadline")),CLOSE_MS);
      })]);
    } catch {
      const child=owned.process();
      if(child&&child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");
    } finally {
      clearTimeout(timer);
      owned.disconnect();
    }
  })();
  closing.set(owned,cleanup);
  return cleanup;
}
let deadlineTimer;
const deadline=new Promise((_,reject)=>{
  deadlineTimer=setTimeout(()=>{
    expired=true;
    controller.abort(); // Puppeteer also owns/cancels the process before launch resolves.
    reject(new Error(`Smoke run deadline exceeded during ${phase}`));
  },RUN_MS);
});
async function capture() {
  launchPromise=puppeteer.launch({executablePath:browserPath,headless:true,
    timeout:20000,protocolTimeout:60000,signal:controller.signal,args:[
    "--no-sandbox","--disable-dev-shm-usage","--use-angle=swiftshader","--enable-unsafe-swiftshader",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
  ]}).then(async owned=>{
    browser=owned;
    // A delayed launch result must never escape the cleanup owner, even after
    // the main deadline/settlement grace. No page work is allowed after expiry.
    if(expired){await closeOwned(owned);throw new Error("Smoke launch resolved after deadline");}
    return owned;
  });
  await launchPromise;
  phase="setup";
  const page=await browser.newPage();
  await page.setViewport({width:1280,height:900});
  await page.setBypassServiceWorker(true);
  page.on("pageerror",error=>errors.push(`Uncaught ${error.message}`));
  page.on("console",message=>{if(message.type()==="error")errors.push(`CONSOLE ERROR ${message.text()}`);});
  const cdp=await page.createCDPSession();await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs",{urls:["https://*","http://localhost/*"]});
  phase="navigation";
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
  let observationDom="";
  try {
    if(sunTarget) {
      phase="observation readiness";
      await page.waitForFunction(()=>{
        const visible=node=>Boolean(node&&!node.hidden&&node.getClientRects().length&&getComputedStyle(node).visibility!=="hidden");
        const image=document.getElementById("observationImage");
        const source=document.getElementById("observationSource");
        const status=document.getElementById("observationStatus")?.textContent||"";
        return document.body.dataset.surface==="today"&&document.body.dataset.experience==="observe"
          &&document.getElementById("exploreObservation")?.getAttribute("aria-pressed")==="true"
          &&visible(document.getElementById("solarObservation"))&&visible(image)&&image.complete&&image.naturalWidth>0
          &&source?.href?.startsWith("https://")&&source.textContent.includes("NASA")
          &&status.includes("UTC")&&status.includes("archival")&&!status.includes("unavailable");
      },{timeout:45000,polling:100});
      // Preserve the initial user experience before exercising the existing model.
      phase="observation capture";
      observationDom=await page.content();
      phase="research activation";
      await page.click("#exploreResearch");
    }
    phase="readiness";
    await page.waitForFunction(isSun=>{
      if(location.pathname.endsWith("__smoke_orrery.html"))return document.body.dataset.smokeDone==="yes"||Boolean(document.body.dataset.smokeErrs);
      if(location.hash.startsWith("#sky="))return document.querySelectorAll("#skyList [data-object-id]").length>0;
      if(isSun) {
        const canvas=document.getElementById("solarCanvas");
        const base=document.getElementById("baseLabel")?.textContent||"";
        if(document.body.dataset.experience!=="research"||document.getElementById("exploreResearch")?.getAttribute("aria-pressed")!=="true"
          ||!canvas?.getClientRects().length||getComputedStyle(canvas).visibility==="hidden"
          ||!base.startsWith("Base: ")||base.includes("loading"))return false;
      }
      return document.getElementById("schemaVersion")?.textContent?.startsWith("solar-state-snapshot.v")&&document.querySelectorAll("#regionList [data-object-id]").length>0;
    },{timeout:45000,polling:100},sunTarget);
    const failure=await page.evaluate(()=>document.body.dataset.smokeErrs || "");
    if(failure)throw new Error(failure);
    phase="fonts";
    await page.evaluate(()=>document.fonts.ready);
    phase="screenshot";
    if(screenshotPath)await page.screenshot({path:screenshotPath});
  } catch(error) {errors.push(`Smoke readiness failed: ${error.message}`);}
  phase="content";
  return {dom:await page.content(),observationDom,stderr:errors.join("\n")};
}
try {
  const captured=await Promise.race([capture(),deadline]);
  process.stdout.write(JSON.stringify(captured));
} finally {
  clearTimeout(deadlineTimer);
  if(!browser) {
    controller.abort();
    let settleTimer;
    try {
      await Promise.race([launchPromise?.catch(()=>{}),new Promise(resolve=>{
        settleTimer=setTimeout(resolve,LAUNCH_SETTLE_MS);
      })]);
    } finally {clearTimeout(settleTimer);}
  }
  if(browser)await closeOwned(browser);
}
