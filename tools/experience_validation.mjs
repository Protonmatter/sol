// Local-only functional/reflow evidence using the repository's locked Chromium driver.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const root = path.resolve(arg("web-root", path.join(repo, "apps/web")));
const out = path.resolve(arg("out", path.join(repo, "coverage/experience")));
const captureOnly = process.argv.includes("--capture-only");
const diagnostics = { browser: "", requests: [], console: [], checks: [], sourceRoot: root };
let invalidSnapshot = false;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  diagnostics.requests.push({path:pathname,status:"local_request"});
  const file = path.resolve(root, `.${pathname.endsWith("/") ? pathname + "index.html" : pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  if (invalidSnapshot && (pathname.endsWith("/data/latest-state.json") || /\/data\/bundles\/[^/]+\/snapshot\.json$/.test(pathname))) { res.setHeader("Content-Type", "application/json"); res.end('{"schema_version":"broken"}'); return; }
  res.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".jpg": "image/jpeg", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === "object" ? address.port : 0}`;
let browser;
fs.mkdirSync(out, { recursive: true });
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  diagnostics.browser = await browser.version();
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin === origin || url.protocol === "data:") request.continue();
    else { diagnostics.requests.push({ url: url.origin + url.pathname, status: "blocked_by_local_test" }); request.abort(); }
  });
  page.on("pageerror", error => diagnostics.console.push({ type: "pageerror", message: error.message }));
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.getElementById("schemaVersion")?.textContent?.startsWith("solar-state-snapshot.v"));
  // Import the same tokened modules the actual app uses, not a duplicate store.
  const token = await page.evaluate(async () => (await (await fetch("app.js")).text()).match(/store\.js(\?v=[A-Za-z0-9._-]+)/)?.[1] || "");
  const prefix = new URL(".",page.url()).pathname;
  await page.evaluate(value=>{window.__solQaPrefix=value;},prefix);
  const moduleUrl = `${prefix}js/store.js${token}`;
  await page.click('[data-mode="today"]');
  await page.evaluate(async q => { (await import(`${window.__solQaPrefix}js/wavelength.js${q}`)).setWavelength("model"); }, token);
  // Exercise the longest supported header state explicitly; document overflow can
  // remain hidden while individual controls have already been clipped off-screen.
  await page.evaluate(() => {
    document.getElementById("releaseUpdate").hidden=false;
    document.getElementById("releaseStatus").textContent="Verified update ready; this tab retains its current release.";
  });
  for (const [width, height] of [[1440, 900], [390, 844], [320, 800]]) {
    await page.setViewport({ width, height });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForFunction(() => document.querySelector(".viewport").getBoundingClientRect().width <= innerWidth);
    await page.screenshot({ path: path.join(out, `sun-${width}.png`), fullPage: true });
    const layout = await page.evaluate(() => {
      const rect = selector => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; };
      const clippedControls=Array.from(document.querySelectorAll(".header-actions a, .header-actions button, .timeline-controls button, .timeline-controls input")).filter(node=>{
        const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&(r.left < -1 || r.right > innerWidth+1);
      }).map(node=>node.id||node.textContent.trim());
      return { hero: rect(".viewport"), inspector: rect(".control-panel"), nav: rect(".mode-nav"), clippedControls, overflow: document.documentElement.scrollWidth > innerWidth + 1, tourHidden: document.getElementById("tourLayer")?.hidden !== false };
    });
    diagnostics.checks.push({ viewport: [width, height], layout });
    if (!captureOnly) {
      assert.equal(layout.overflow, false, `${width}: no horizontal reflow overflow`);
      assert.deepEqual(layout.clippedControls, [], `${width}: every header and timeline control remains inside the viewport`);
      assert.equal(layout.tourHidden, true, "tour never interrupts first use automatically");
      assert.ok(layout.hero.x >= 0 && layout.hero.x + layout.hero.width <= width + 1, `${width}: hero is not clipped by hidden overflow`);
      assert.ok(layout.inspector.x >= 0 && layout.inspector.x + layout.inspector.width <= width + 1, `${width}: inspector is not clipped`);
      assert.ok(layout.nav && layout.nav.y < layout.hero.y, "destination navigation precedes hero");
      if (width < 800) assert.ok(layout.hero.y < layout.inspector.y, "hero precedes inspector on mobile");
    }
  }
  if (!captureOnly) {
    await page.setViewport({ width: 1440, height: 900 });
    const truth = await page.evaluate(async u => { const {store} = await import(u); return store.presentation; }, moduleUrl);
    assert.equal(truth.sourceKind, "synthetic");
    assert.match(truth.headline, /modeled|model/);
    assert.equal(truth.comparisonAllowed, false);
    await page.evaluate(()=>{document.getElementById("sourcesAndLimits").open=true;document.getElementById("viewEvidencePreview").click();});
    const exported=await page.$eval("#viewEvidenceJson",node=>JSON.parse(node.textContent));
    assert.deepEqual(exported.presentation,truth,"summary exports the same immutable explanatory revision as the visible view");
    await page.click("#viewEvidenceCancel");
    await page.evaluate(()=>{document.getElementById("sourcesAndLimits").open=false;});
    await page.evaluate(() => { document.getElementById("sunExplore").open = true; });
    await page.focus("#regionList button");
    const focusStable = await page.evaluate(async q => {
      const {store} = await import(`${window.__solQaPrefix}js/store.js${q}`);
      const {renderAll} = await import(`${window.__solQaPrefix}js/view.js${q}`);
      const node = document.activeElement, original = store.state;
      for (let i = 0; i < 10; i++) {
        store.state = {...original, active_regions: original.active_regions.map(region => ({...region, complexity: region.complexity + i * 0.00001}))};
        renderAll();
        if (document.activeElement !== node) return false;
      }
      store.state = original;
      renderAll();
      return document.activeElement === node;
    }, token);
    assert.equal(focusStable, true, "ten real DOM data refreshes retain exact focused node");
    const confidencePixels = await page.evaluate(async q => {
      const {store} = await import(`${window.__solQaPrefix}js/store.js${q}`);
      const {renderAll} = await import(`${window.__solQaPrefix}js/view.js${q}`);
      const original = store.state, canvas = document.getElementById("solarCanvas"), checkbox = document.getElementById("layerConfidence");
      const checked = checkbox.checked;
      checkbox.checked = true;
      const urls = [0, 0.95].map(value => {
        store.state = {...original, fields:{...original.fields, confidence:{...original.fields.confidence, values:original.fields.confidence.values.map(() => value)}}};
        renderAll();
        return canvas.toDataURL();
      });
      store.state = original; checkbox.checked = checked; renderAll();
      return urls[0] !== urls[1];
    }, token);
    assert.equal(confidencePixels, true, "changing only the score changes actual canvas pixels");
    const previous = await page.evaluate(async u => JSON.stringify((await import(u)).store.state), moduleUrl);
    invalidSnapshot = true;
    await page.evaluate(async q => (await import(`${window.__solQaPrefix}js/data.js${q}`)).loadState(), token);
    assert.equal(await page.evaluate(async u => JSON.stringify((await import(u)).store.state), moduleUrl), previous, "invalid replacement retains exact last-valid snapshot");
    assert.ok(await page.evaluate(async u => (await import(u)).store.dataError, moduleUrl));
    assert.match(await page.$eval("#snapshotStatus",node=>node.textContent), /failed.*retained.*elapsed|failed.*retained.*time/i);
    assert.equal(await page.$eval("#retrySnapshot",node=>node.hidden),false);
    invalidSnapshot = false;
    await page.click("#retrySnapshot");
    await page.waitForFunction(()=>document.getElementById("snapshotStatus").hidden);
    assert.equal(await page.evaluate(async u => (await import(u)).store.dataError, moduleUrl),null);
    await page.click("#panelToggle");
    for (const destination of ["sky", "orrery", "today"]) assert.equal(await page.$eval(`[data-mode="${destination}"]`, node => !!node.getBoundingClientRect().width), true, "navigation survives hidden inspector");
    await page.click("#panelToggle");
    await page.waitForFunction(()=>document.querySelectorAll("#cycleFrameTable tr").length>=3);
    const cycle=await page.evaluate(async q=>{
      const {store}=await import(`${window.__solQaPrefix}js/store.js${q}`);
      const {renderAll}=await import(`${window.__solQaPrefix}js/view.js${q}`);
      const original={frames:store.seriesFrames,records:store.seriesRecords};
      store.seriesFrames=store.seriesFrames.slice();store.seriesFrames[1]=null;
      store.seriesRecords=store.seriesRecords.map((r,i)=>i===1?{...r,snapshot:null,status:"unavailable"}:r);
      renderAll();
      document.querySelector("#cycleFrameTable tr button").click();
      document.getElementById("nextFrame").click();
      const skipped=store.timelineIndex===2 && /skipped 1/.test(document.getElementById("timeFrameLabel").textContent);
      document.querySelectorAll("#cycleFrameTable tr button")[1].click();
      const gap=store.timelineIndex===1 && /unavailable/.test(document.getElementById("timeFrameLabel").textContent);
      store.seriesFrames=original.frames;store.seriesRecords=original.records;document.getElementById("nowBtn").click();
      return {skipped,gap};
    },token);
    assert.deepEqual(cycle,{skipped:true,gap:true});
    const workers=[];page.on("workercreated",worker=>workers.push(worker.url()));
    // Chromium's page-scoped Fetch interception does not reliably service module-worker
    // imports. The fixture has no configured remote provider; block external HTTPS
    // via CDP while allowing worker imports from the isolated loopback server.
    page.removeAllListeners("request");
    await page.setRequestInterception(false);
    const networkSession=await page.createCDPSession();
    await networkSession.send("Network.enable");
    await networkSession.send("Network.setBlockedURLs",{urls:["https://*","http://localhost/*"]});
    await page.click("#liveRun");
    await page.waitForFunction(()=>/Computed on your device|Engine result unavailable/.test(document.getElementById("liveStatus").textContent),{timeout:20000});
    const workerStatus=await page.$eval("#liveStatus",node=>node.textContent);
    diagnostics.checks.push({workerStatus,workers});
    assert.match(workerStatus,/Computed on your device/);
    assert.ok(workers.some(url=>url.includes("solarWorker.js")),"actual solar calculation runs in a browser worker");
    const cancellation=await page.evaluate(async q=>{
      const {store}=await import(`${window.__solQaPrefix}js/store.js${q}`),before=store.state;
      document.getElementById("liveRun").click();document.getElementById("liveCancel").click();
      await new Promise(resolve=>setTimeout(resolve,300));
      return {retained:store.state===before,status:document.getElementById("liveStatus").textContent};
    },token);
    assert.equal(cancellation.retained,true);assert.match(cancellation.status,/cancelled/i);

    await page.click('[data-mode="orrery"]');
    await page.waitForFunction(async u=>{const state=(await import(u)).store.orrery;return state?.active&&state.bodies.length===9;},{timeout:25000},moduleUrl);
    await page.waitForSelector('#orreryPositions [data-object-id="Earth"]');
    await page.focus('#orreryPositions [data-object-id="Earth"]');
    const system=await page.evaluate(async q=>{
      const {store}=await import(`${window.__solQaPrefix}js/store.js${q}`),s=store.orrery;
      const focused=document.activeElement;
      const input=document.getElementById("orreryTime");
      for(let i=0;i<10;i++){input.value=String(i);input.dispatchEvent(new Event("input"));if(document.activeElement!==focused)return {focus:false};}
      input.value="0";input.dispatchEvent(new Event("input"));
      const before=Date.UTC(2026,11,31,23,59,59.9)/1000;s.renderUnix=before;s.yearsPerSec=1/365.25;
      document.getElementById("orreryAnimate").checked=true;document.getElementById("orreryAnimate").dispatchEvent(new Event("change"));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      document.getElementById("orreryAnimate").checked=false;document.getElementById("orreryAnimate").dispatchEvent(new Event("change"));
      const header=document.getElementById("viewTime").textContent,rendered=s.renderUnix;
      const paused=s.renderUnix;await new Promise(resolve=>setTimeout(resolve,120));
      const pauseStable=paused===s.renderUnix;
      const labels=Array.from(document.querySelectorAll("#orreryLabels span")).filter(node=>getComputedStyle(node).display!=="none").map(node=>{const r=node.getBoundingClientRect();return{id:node.dataset.objectId,x:r.x,y:r.y,width:r.width,height:r.height};});
      return {focus:document.activeElement===focused,header,rendered,pauseStable,labels};
    },token);
    assert.equal(system.focus,true,"ten real System time changes preserve focused body node");
    assert.equal(system.pauseStable,true,"paused System stops advancing its clock");
    assert.match(system.header,/2027-01-01/);assert.ok(system.header.startsWith(new Date(system.rendered*1000).toISOString()),"header uses the same rendered instant");
    assert.ok(system.labels.length>0&&system.labels.length<=16);
    for(const a of system.labels)for(const b of system.labels.filter(x=>x!==a))assert.ok(a.x+a.width+3.9<=b.x||b.x+b.width+3.9<=a.x||a.y+a.height+3.9<=b.y||b.y+b.height+3.9<=a.y,`label clearance: ${a.id}/${b.id}`);
    await page.screenshot({path:path.join(out,"system-1440.png"),fullPage:true});
    await page.type("#orrerySearch","Sirius");
    await page.waitForFunction(()=>document.getElementById("orreryPositions").textContent.includes("Sirius"),{timeout:10000});
    await page.click("#orreryPositions button");
    assert.match(await page.$eval("#orreryDetail",node=>node.textContent),/Sirius/);
    await page.setViewport({width:390,height:844});
    await page.screenshot({path:path.join(out,"system-390.png"),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);

    // Local microprofile, not physical-device or field performance qualification.
    const cdp=await page.createCDPSession();await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
    const profile=await page.evaluate(async q=>{
      const engine=await import(`${window.__solQaPrefix}js/skyEngine.js${q}`);await engine.loadSkyEngine();
      const rows=[];for(const years of [-5000,0,5000])for(let i=0;i<100;i++){
        const unix=Date.UTC(2026,0,1)/1000+years*365.25*86400+i*86400;
        let start=performance.now();engine.systemPositions(unix);const rawMs=performance.now()-start;
        start=performance.now();engine.systemSnapshot(unix);rows.push({years,rawMs,jsonMs:performance.now()-start});
      }return rows;
    },token);
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});
    const percentile=(key,p)=>{const a=profile.map(r=>r[key]).sort((a,b)=>a-b);return a[Math.ceil(p*a.length)-1];};
    const microprofile={configuration:"headless Chromium / SwiftShader / 4x CPU throttle / 300 pairs across -5000,0,+5000 Julian years",rawP95Ms:percentile("rawMs",.95),rawMaxMs:Math.max(...profile.map(r=>r.rawMs)),jsonP95Ms:percentile("jsonMs",.95),jsonMaxMs:Math.max(...profile.map(r=>r.jsonMs))};
    diagnostics.checks.push({cycle,workers,cancellation,system,microprofile});
    fs.writeFileSync(path.join(out,"system-main-thread-profile.json"),JSON.stringify({microprofile,samples:profile},null,2)+"\n");
    assert.ok(microprofile.rawP95Ms<=16,"fixed-nine-body position-only main-thread exception stays under 16ms p95 in this local controlled sample");
    assert.ok(workers.some(url=>url.includes("systemWorker.js")),"full System JSON is off-main in an actual worker");
    assert.ok(!/\bsystemSnapshot\s*\(/.test(fs.readFileSync(path.join(root,prefix.replace(/^\//,""),"js/orrery.js"),"utf8")),"renderer never invokes the heavy synchronous JSON path");
    assert.deepEqual(diagnostics.console, [], "no uncaught browser errors");
  }
  diagnostics.checks.push({ result: captureOnly ? "capture_only" : "passed" });
  process.stdout.write(`${captureOnly ? "CAPTURED" : "PASS"}: local experience evidence ${out}\n`);
} finally {
  fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(diagnostics, null, 2) + "\n");
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
