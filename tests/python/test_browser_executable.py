import os
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import browser_smoke


class BrowserExecutableTests(unittest.TestCase):
    def test_actual_driver_deadlines_cover_stalls_and_late_launch_cleanup(self):
        # Execute the actual driver source with offline browser doubles and a
        # controlled timer queue, as in the independent review's hanging-font probe.
        script = r"""
import fs from 'node:fs'; import assert from 'node:assert/strict';
const source=fs.readFileSync(process.argv[1],'utf8').replace('import puppeteer from "puppeteer-core";','');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const flush=()=>new Promise(setImmediate);
for(const stage of ['new-page','setup','cdp','goto','readiness','fonts','screenshot','content','launch','late-launch','late-after-grace','close']) {
  const calls=[], timers=new Map(); let nextId=0, now=0, resolveLaunch, settled=false, failure=null, output='';
  const timer=(fn,ms)=>{const id=++nextId;timers.set(id,{fn,ms,at:now+ms});return id;};
  const clear=id=>timers.delete(id);
  const fire=id=>{const t=timers.get(id);timers.delete(id);now=Math.max(now,t.at);t.fn();};
  const wait=()=>new Promise(()=>{});
  const step=(name,value)=>{calls.push(name);return stage===name?wait():Promise.resolve(value);};
  const child={exitCode:null,signalCode:null,kill(signal){calls.push('kill:'+signal);this.exitCode=1;return true;}};
  const page={setViewport:()=>step('setup'),setBypassServiceWorker:async()=>{},on(){},
    createCDPSession:()=>step('cdp',{send:async()=>{}}),goto:()=>step('goto'),
    waitForFunction:()=>step('readiness'),evaluate:fn=>String(fn).includes('fonts.ready')?step('fonts'):Promise.resolve(''),
    screenshot:()=>step('screenshot'),content:()=>step('content','<body></body>')};
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
  const processMock={argv:['node','driver','owned-fixture-browser','http://127.0.0.1/fixture','fixture.png'],stdout:{write(value){output+=value;}}};
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
            return '<div id="regionList" data-object-id="1">solar-state-snapshot.v3</div>', ""
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
                    return '<div id="regionList" data-object-id="1">solar-state-snapshot.v3</div>', ""
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
