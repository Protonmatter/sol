import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERATED_MODULES,
  relativeRuntimeModules,
  absoluteRuntimeModules,
  addUnexecutedCoverage,
} from "../../tools/js_coverage_scope.mjs";
import coverageModule from "istanbul-lib-coverage";

test("unexecuted handwritten workers and historical modules remain counted at zero", async () => {
  const coverage = coverageModule.createCoverageMap({});
  const files = absoluteRuntimeModules();
  await addUnexecutedCoverage(coverage, files);
  assert.equal(coverage.files().length, files.length);
  for (const file of files) {
    assert.equal(coverage.fileCoverageFor(file).toSummary().lines.covered, 0, file);
    assert.ok(coverage.fileCoverageFor(file).toSummary().lines.total > 0, file);
  }
  const before = coverage.toJSON();
  await addUnexecutedCoverage(coverage, files);
  assert.deepEqual(coverage.toJSON(), before);
});

test("browser coverage scope cannot silently omit a new application module", () => {
  const all = relativeRuntimeModules({ includeGenerated: true });
  const handWritten = relativeRuntimeModules();
  assert.ok(all.includes("app.js"));
  assert.ok(all.includes("engine.js"));
  assert.ok(all.includes("sw.js"));
  assert.ok(handWritten.includes("sw.js"));
  assert.ok(all.includes("js/orrery.js"));
  assert.ok(all.includes("js/sky.js"));
  assert.ok(all.includes("js/starcatalog.js"));
  assert.deepEqual(
    all.filter((file) => !handWritten.includes(file)).sort(),
    [...GENERATED_MODULES].sort(),
  );
  for (const generated of GENERATED_MODULES) {
    assert.ok(all.includes(generated), `${generated} must still be required to load in Chromium`);
    assert.ok(!handWritten.includes(generated), `${generated} must not inflate the logic percentage`);
  }
});
