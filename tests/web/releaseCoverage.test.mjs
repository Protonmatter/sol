import assert from "node:assert/strict";
import test from "node:test";
import { GENERATED_MODULES, sourceCoverage } from "../../tools/js_coverage_scope.mjs";

test("release stamping restores original coverage offsets without dropping runtime modules", () => {
  const original = 'import "./x.js?v=old";\nconst id = "__SOL_RELEASE_ID__";\nwork();';
  const staged = 'import "./x.js?v=ci-long-release";\nconst id = "ci-long-release";\nwork();';
  const start = staged.indexOf("work()");
  const entry = { text: staged, rawScriptCoverage: { functions: [{ functionName: "", ranges: [
    { startOffset: start, endOffset: start + 6, count: 2 },
  ] }] } };
  const restored = sourceCoverage(entry, original, { release_id: "ci-long-release", namespace: "releases/ci-long-release/", base_path: "/sol/" });
  assert.equal(restored.rawScriptCoverage.functions[0].ranges[0].startOffset, original.indexOf("work()"));
  assert.equal(restored.rawScriptCoverage.functions[0].ranges[0].endOffset, original.indexOf("work()") + 6);
  assert.equal(restored.rawScriptCoverage.functions[0].ranges[0].count, 2);
  assert.equal(restored.text, original);
  assert.throws(() => sourceCoverage({ ...entry, text: staged + "foreign();" }, original,
    { release_id: "ci-long-release", namespace: "releases/ci-long-release/", base_path: "/sol/" }), /identity/);
  assert.ok(GENERATED_MODULES.has("js/solarSchema.js"));
  assert.ok(GENERATED_MODULES.has("js/ephemerisSchema.js"));
  assert.ok(!GENERATED_MODULES.has("js/ephemerisContract.js"));
  assert.ok(!GENERATED_MODULES.has("js/ephemerisContractV2.js"));
  assert.ok(!GENERATED_MODULES.has("js/solarContract.js"));
  assert.ok(!GENERATED_MODULES.has("sw.js"));
});
