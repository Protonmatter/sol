import assert from "node:assert/strict";
import fs from "node:fs";
import inspector from "node:inspector";
import test from "node:test";
import vm from "node:vm";

test("source attribution rejects semantic queries, fragments and nonlocal URLs", async () => {
  const { loadSourceModules } = await import("./helpers/sourceModuleHarness.mjs");
  const base = new URL("../../apps/web/js/skyPresentation.js", import.meta.url);
  for (const suffix of ["?mode=one", "?v=one&mode=two", "#isolated", "?v=one#isolated", "?v="]) {
    await assert.rejects(loadSourceModules(vm.createContext({}), [new URL(base.href + suffix)]), /release cache tokens/);
  }
  await assert.rejects(loadSourceModules(vm.createContext({}), [new URL("https://example.invalid/module.js")]), /local file URL/);
});

test("controller harness preserves original source bytes and canonical V8 coverage offsets", async () => {
  // Replacing imports/exports or naming execution as an anonymous script must
  // fail this contract even if the controller's behavioral tests still pass.
  const helper = await import("./helpers/sourceModuleHarness.mjs").catch(() => ({}));
  assert.equal(typeof helper.loadSourceModules, "function", "exact-source module harness is available");
  const url = new URL("../../apps/web/js/skyPresentation.js", import.meta.url);
  const original = fs.readFileSync(url, "utf8");
  const session = new inspector.Session();
  session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) =>
    session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  try {
    await post("Debugger.enable");
    await post("Profiler.enable");
    await post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    const [namespace] = await helper.loadSourceModules(vm.createContext({}), [url]);
    assert.equal(namespace.parseSkyTime("2026-09-12T13:00", "utc"), Date.parse("2026-09-12T13:00:00Z") / 1000);
    const { result } = await post("Profiler.takePreciseCoverage");
    const entry = result.find(script => script.url === url.href);
    assert.ok(entry, "executed production module has its canonical file URL");
    const { scriptSource } = await post("Debugger.getScriptSource", { scriptId: entry.scriptId });
    assert.equal(scriptSource, original, "executed bytes are the complete unmodified source");
    assert.equal(entry.functions[0].ranges[0].endOffset, original.length);
    assert.ok(entry.functions.find(fn => fn.functionName === "parseSkyTime").ranges[0].count > 0);
  } finally {
    session.disconnect();
  }
});
