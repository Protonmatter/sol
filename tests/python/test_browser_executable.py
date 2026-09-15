import os
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import browser_smoke

READY_SUN = ('<body data-experience="research"><div id="baseLabel">Base: synthetic photosphere (synthetic)</div>'
             '<div id="regionList" data-object-id="1">solar-state-snapshot.v3</div></body>')


class BrowserExecutableTests(unittest.TestCase):
    def test_actual_driver_verifies_observe_before_native_research_entry(self):
        script = r"""
import fs from 'node:fs'; import assert from 'node:assert/strict';
const source=fs.readFileSync(process.argv[1],'utf8').replace('import puppeteer from "puppeteer-core";','');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
for(const broken of ['', 'image', 'observation-hidden', 'capture-time', 'source', 'research-entry', 'model-base', 'canvas', 'regions', 'schema']) {
  const calls=[]; let output='';
  const node=(text='')=>({textContent:text,hidden:false,getClientRects(){return this.hidden?[]:[{}];},getAttribute(){return 'true';}});
  const elements={solarObservation:node(), observationImage:{...node(),complete:true,naturalWidth:1024},
    observationSource:{...node('NASA / SDO'),href:'https://sdo.gsfc.nasa.gov/fixture.jpg'},
    observationStatus:node('2026-09-11 12:00:00 UTC · archival'),exploreObservation:node(),exploreResearch:node(),
    solarCanvas:node(),baseLabel:node('Base: loading'),schemaVersion:node('solar-state-snapshot.v3')};
  const document={body:{dataset:{surface:'today',experience:'observe'}},fonts:{ready:Promise.resolve()},
    getElementById:id=>elements[id],querySelectorAll:()=>broken==='regions'?[]:[{}]};
  if(broken==='image')elements.observationImage.naturalWidth=0;
  if(broken==='observation-hidden')elements.solarObservation.hidden=true;
  if(broken==='capture-time')elements.observationStatus.textContent='Capture time unavailable · archival image';
  if(broken==='source')elements.observationSource.href='';
  if(broken==='canvas')elements.solarCanvas.hidden=true;
  if(broken==='schema')elements.schemaVersion.textContent='Loading snapshot.';
  const page={setViewport:async()=>{},setBypassServiceWorker:async()=>{},on(){},
    createCDPSession:async()=>({send:async()=>{}}),goto:async()=>{},
    async waitForFunction(predicate,options,...args){
      calls.push('ready:'+document.body.dataset.experience);
      assert.equal(options.timeout,45000,'each readiness wait remains bounded');
      if(!predicate(...args))throw new Error('fixture readiness timed out');
    },evaluate:async fn=>fn(),
    async click(selector){
      assert.equal(selector,'#exploreResearch');calls.push('native-research-click');
      if(broken!=='research-entry')document.body.dataset.experience='research';
      if(broken!=='model-base')elements.baseLabel.textContent='Base: synthetic photosphere (synthetic)';
    },
    async content(){const mode=document.body.dataset.experience;calls.push('capture:'+mode);
      return `<body data-experience="${mode}"><img id="observationImage"><div id="baseLabel">${elements.baseLabel.textContent}</div></body>`;}
  };
  const browser={newPage:async()=>page,close:async()=>{calls.push('close');},disconnect(){},process(){throw new Error('unexpected kill');}};
  const processMock={argv:['node','driver','fixture-browser','http://127.0.0.1/sol/releases/fixture/index.html'],stdout:{write(value){output+=value;}}};
  await new AsyncFunction('puppeteer','process','document','location','getComputedStyle',source)(
    {launch:async()=>browser},processMock,document,{pathname:'/sol/releases/fixture/index.html',hash:''},()=>({visibility:'visible'}));
  const result=JSON.parse(output);
  assert.ok(calls.includes('close'),'browser ownership and cleanup are retained');
  if(!broken){
    assert.equal(result.stderr,'');
    assert.match(result.observationDom,/data-experience="observe"/);
    assert.match(result.observationDom,/Base: loading/,'hidden model placeholder is allowed before native Research entry');
    assert.match(result.dom,/data-experience="research"/);
    assert.ok(!result.dom.includes('Base: loading'));
    assert.ok(calls.indexOf('capture:observe')<calls.indexOf('native-research-click'),'initial observation is captured first');
    assert.ok(calls.indexOf('native-research-click')<calls.indexOf('ready:research'),'model readiness follows actual entry');
  } else {
    assert.match(result.stderr,/Smoke readiness failed: fixture readiness timed out/,broken);
    if(['image','observation-hidden','capture-time','source'].includes(broken)){
      assert.equal(result.observationDom,'',broken+': invalid observation is never captured as ready');
      assert.ok(!calls.includes('native-research-click'),broken+': failure cannot skip ahead to Research');
    } else assert.ok(calls.includes('native-research-click'),broken+': model failure is checked after native entry');
  }
}
"""
        result = subprocess.run(["node", "--input-type=module", "-e", script,
            str(browser_smoke.ROOT / "tools/browser_smoke_driver.mjs")], text=True, capture_output=True, timeout=10, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_sun_transport_requires_initial_observe_capture(self):
        for observation in (None, '', '<body data-experience="research"><img id="observationImage"></body>'):
            with self.subTest(observation=observation):
                payload = {"dom": READY_SUN, "stderr": "", "observationDom": observation or ""}
                completed = subprocess.CompletedProcess([], 0, json.dumps(payload), "")
                with patch.object(browser_smoke.subprocess, "run", return_value=completed):
                    with self.assertRaisesRegex(AssertionError, "initial Observe capture"):
                        browser_smoke.dump_dom("browser", "http://127.0.0.1/sol/releases/fixture/index.html")

    def test_sun_transport_allows_hidden_model_placeholder_only_in_observe(self):
        payload = {"dom": READY_SUN, "stderr": "", "observationDom":
            '<body data-experience="observe"><img id="observationImage"><div>Base: loading</div><div>Loading snapshot.</div></body>'}
        completed = subprocess.CompletedProcess([], 0, json.dumps(payload), "")
        with patch.object(browser_smoke.subprocess, "run", return_value=completed):
            self.assertEqual(browser_smoke.dump_dom("browser", "http://127.0.0.1/index.html"), (READY_SUN, ""))
        for invalid in (READY_SUN.replace('Base: synthetic photosphere (synthetic)', 'Base: loading'),
                        READY_SUN + '<div>Loading snapshot.</div>',
                        READY_SUN.replace('data-experience="research"', 'data-experience="observe"'),
                        READY_SUN.replace('id="baseLabel"', 'id="missingBaseLabel"')):
            with self.subTest(invalid=invalid), patch.object(browser_smoke, "dump_dom", return_value=(invalid, "")) as dump:
                with self.assertRaisesRegex(AssertionError, "Sun Research"):
                    browser_smoke.run_smoke("http://127.0.0.1", "browser")
                self.assertEqual(dump.call_count, 1, 'a Research readiness failure cannot proceed to Sky')

    def test_actual_driver_deadlines_cover_stalls_and_late_launch_cleanup(self):
        # Execute the actual driver source with offline browser doubles and a
        # controlled timer queue, as in the independent review's hanging-font probe.
        script = r"""
import fs from 'node:fs'; import assert from 'node:assert/strict';
const source=fs.readFileSync(process.argv[1],'utf8').replace('import puppeteer from "puppeteer-core";','');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const flush=()=>new Promise(setImmediate);
for(const stage of ['new-page','setup','cdp','goto','readiness','observation-readiness','observation-capture','research-activation','research-readiness','fonts','screenshot','content','launch','late-launch','late-after-grace','close']) {
  const calls=[], timers=new Map(); let nextId=0, now=0, resolveLaunch, settled=false, failure=null, output='';
  const sunCase=stage.startsWith('observation-')||stage.startsWith('research-');let waits=0,captures=0;
  const timer=(fn,ms)=>{const id=++nextId;timers.set(id,{fn,ms,at:now+ms});return id;};
  const clear=id=>timers.delete(id);
  const fire=id=>{const t=timers.get(id);timers.delete(id);now=Math.max(now,t.at);t.fn();};
  const wait=()=>new Promise(()=>{});
  const step=(name,value)=>{calls.push(name);return stage===name?wait():Promise.resolve(value);};
  const child={exitCode:null,signalCode:null,kill(signal){calls.push('kill:'+signal);this.exitCode=1;return true;}};
  const page={setViewport:()=>step('setup'),setBypassServiceWorker:async()=>{},on(){},
    createCDPSession:()=>step('cdp',{send:async()=>{}}),goto:()=>step('goto'),
    waitForFunction:()=>step(sunCase?(++waits===1?'observation-readiness':'research-readiness'):'readiness'),
    evaluate:fn=>String(fn).includes('fonts.ready')?step('fonts'):Promise.resolve(''),click:()=>step('research-activation'),
    screenshot:()=>step('screenshot'),content:()=>step(sunCase&&++captures===1?'observation-capture':'content','<body></body>')};
  const browser={newPage:()=>step('new-page',page),close(){calls.push('close');return stage==='close'?wait():Promise.resolve();},
    process:()=>child,disconnect(){calls.push('disconnect');}};
  const puppeteer={launch(options){calls.push('launch');
    assert.ok(options.timeout>0&&options.timeout<=30000,'launch needs its own bounded startup');
    assert.ok(options.protocolTimeout>=45000&&options.protocolTimeout<=75000,'CDP must allow the existing45s readiness but fit inside the whole-run budget');
    assert.ok(options.signal,'pending launch must have cancellation before a browser handle exists');
    options.signal.addEventListener('abort',()=>calls.push('abort'));
    if(stage==='launch')return wait();
    if(stage.startsWith('late-'))return new Promise(resolve=>{resolveLaunch=resolve;});
    return Promise.resolve(browser);
  }};
  const processMock={argv:['node','driver','owned-fixture-browser','http://127.0.0.1/'+(sunCase?'index.html':'fixture'),'fixture.png'],stdout:{write(value){output+=value;}}};
  const task=new AsyncFunction('puppeteer','process','setTimeout','clearTimeout',source)(puppeteer,processMock,timer,clear);
  task.then(()=>{settled=true;},error=>{settled=true;failure=error;});
  await flush();
  assert.equal(failure,null,failure?.message);
  const deadline=[...timers].find(([,t])=>t.ms>=30000&&t.ms<=80000);
  if(stage!=='close') {
    assert.ok(deadline,stage+': whole-run deadline must be armed before stalled work');
    fire(deadline[0]); await flush();
    if(stage==='late-launch'){resolveLaunch(browser);await flush();}
  }
  // Advance only the bounded cleanup timers. No real Chromium, sleep or network.
  for(let i=0;i<5&&!settled;i++){
    const next=[...timers].filter(([,t])=>t.ms<30000).sort((a,b)=>a[1].at-b[1].at)[0];
    if(next)fire(next[0]);
    await flush();
  }
  assert.ok(settled,stage+': cleanup must settle before Python outer timeout');
  assert.ok(now<=85000,stage+': work and cleanup must reserve at least15s before the100s outer deadline');
  if(stage==='late-after-grace'){resolveLaunch(browser);await flush();}
  if(stage==='launch')assert.ok(calls.includes('abort'),'unresolved launch must be cancelled');
  else assert.ok(calls.includes('close'),stage+': own browser must be closed');
  if(stage==='close')assert.ok(calls.includes('kill:SIGKILL'),'stalled close forces only the owned child');
  else {assert.ok(failure,stage+': timeout cannot become success');assert.equal(output,'',stage+': no partial JSON success after deadline');}
  if(stage.startsWith('late-'))assert.ok(!calls.includes('setup'),'late browser must not continue page work');
}
"""
        result = subprocess.run(["node", "--input-type=module", "-e", script,
            str(browser_smoke.ROOT / "tools/browser_smoke_driver.mjs")], text=True, capture_output=True, timeout=10, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_runtime_failure_preserves_the_driver_timeout_cause(self):
        with self.assertRaisesRegex(AssertionError, "Runtime.callFunctionOn timed out"):
            browser_smoke.assert_no_runtime_failure("<body></body>",
                "Smoke readiness failed: Runtime.callFunctionOn timed out", "Solar System")

    def test_system_readiness_requires_lifecycle_and_actual_loaded_moon_knots(self):
        predicate = browser_smoke.MOON_READINESS_JS
        script = f"""
const assert = require('node:assert/strict');
const ready = ({predicate});
const identity = Array.from({{length:21}}, (_, i) => ({{n:String(i)}}));
const input = {{state:{{}},time:{{}},moons:identity,lifecycleReady:true,rows:22,backend:'Rendering on WebGL2'}};
assert.equal(ready(input),false,'identity rows alone cannot establish readiness');
identity.forEach(m => m.el = [[1,2,3]]);
assert.equal(ready(input),true,'actual populated shared catalogue is ready');
for(const change of [{{lifecycleReady:false}},{{rows:21}},{{backend:'unavailable'}},{{state:null}},{{time:null}},{{moons:[]}},{{moons:Array(21)}}])
  assert.equal(ready({{...input,...change}}),false,JSON.stringify(change));
identity[0].el = [];
assert.equal(ready(input),false,'empty knots are not loaded');
"""
        result = subprocess.run(["node", "-e", script], text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_screenshot_transport_rejects_readiness_failure_even_with_png(self):
        failed = subprocess.CompletedProcess([], 0, json.dumps({"dom": "<body></body>", "stderr": "Smoke readiness failed: timed out"}), "")
        def capture(command, **_kwargs):
            Path(command[-1]).write_bytes(b"\x89PNG\r\n\x1a\n" + b"x" * 20_000)
            return failed
        with patch.object(browser_smoke.subprocess, "run", side_effect=capture):
            with self.assertRaisesRegex(AssertionError, "readiness"):
                browser_smoke.capture_screenshot("browser", "http://127.0.0.1/fixture")

    def test_deterministic_system_failure_is_not_retried_or_screenshotted(self):
        def captured(_browser, url):
            if "__smoke_orrery" in url:
                return '<body data-smoke-ready="yes"></body>', ""
            if "#sky=" in url:
                return '<button data-mode="sky" aria-pressed="true"></button><div id="skyList" class="sky-row">device civil timezone, not observer timezone</div>', ""
            return READY_SUN, ""
        with patch.object(browser_smoke, "dump_dom", side_effect=captured) as dump, patch.object(browser_smoke, "capture_screenshot") as screenshot:
            with self.assertRaisesRegex(AssertionError, "interaction assertions failed"):
                browser_smoke.run_smoke("http://127.0.0.1", "browser")
            self.assertEqual(dump.call_count, 3, "one bounded condition wait per surface; no retry hides a failure")
            screenshot.assert_not_called()

    def test_each_of_the_eleven_system_markers_is_still_mandatory(self):
        markers = [f'data-smoke-{name}="yes"' for name in (
            "mode", "ready", "default-speed", "sun-detail", "speed", "paused",
            "aliasing", "reset", "validity", "done")]
        markers.append('data-smoke-moon-rows="22"')
        for absent in markers:
            with self.subTest(absent=absent):
                def captured(_browser, url):
                    if "__smoke_orrery" in url:
                        return "<body " + " ".join(m for m in markers if m != absent) + "></body>", ""
                    if "#sky=" in url:
                        return '<button data-mode="sky" aria-pressed="true"></button><div id="skyList" class="sky-row">device civil timezone, not observer timezone</div>', ""
                    return READY_SUN, ""
                with patch.object(browser_smoke, "dump_dom", side_effect=captured), patch.object(browser_smoke, "capture_screenshot") as screenshot:
                    with self.assertRaisesRegex(AssertionError, absent):
                        browser_smoke.run_smoke("http://127.0.0.1", "browser")
                    screenshot.assert_not_called()

    def test_driver_rejects_nonfixture_and_credential_urls_before_launch(self):
        for url in ("https://127.0.0.1/", "http://example.invalid/", "file:///tmp/index.html", "http://fixture:dummy@127.0.0.1/"):
            with self.subTest(url=url):
                result = subprocess.run(["node", str(browser_smoke.ROOT / "tools/browser_smoke_driver.mjs"),
                    "never-launch-this-browser", url], text=True, capture_output=True, timeout=10, check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("credential-free loopback HTTP fixture", result.stderr)

    def test_explicit_existing_executable_precedes_path_search(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "browser with spaces.exe"
            executable.touch()
            with patch.dict(os.environ, {"CHROME_BIN": str(executable)}), patch.object(browser_smoke.shutil, "which") as search:
                self.assertEqual(browser_smoke.browser_binary(), str(executable.resolve()))
                search.assert_not_called()

    def test_invalid_override_fails_without_silent_fallback(self):
        with patch.dict(os.environ, {"CHROME_BIN": "missing-sol-browser.exe"}), patch.object(browser_smoke.shutil, "which") as search:
            with self.assertRaisesRegex(FileNotFoundError, "CHROME_BIN"):
                browser_smoke.browser_binary()
            search.assert_not_called()

    def test_directory_override_is_not_executable(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"CHROME_BIN": directory}):
            with self.assertRaisesRegex(FileNotFoundError, "CHROME_BIN"):
                browser_smoke.browser_binary()

    def test_existing_linux_discovery_is_preserved(self):
        with patch.dict(os.environ, {"CHROME_BIN": ""}), patch.object(browser_smoke.shutil, "which", side_effect=[None, "/usr/bin/google-chrome"]) as search:
            self.assertEqual(browser_smoke.browser_binary(), "/usr/bin/google-chrome")
            self.assertEqual(search.call_count, 2)
