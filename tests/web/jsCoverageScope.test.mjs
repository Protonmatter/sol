import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERATED_MODULES,
  relativeRuntimeModules,
} from "../../tools/js_coverage_scope.mjs";

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
