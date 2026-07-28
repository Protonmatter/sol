import test from "node:test";
import assert from "node:assert/strict";
import { SPHERE_FS } from "../../apps/web/js/orreryShaders.js";

test("Sun shader preserves HMI intensity without presenting its orange browse palette as natural colour", () => {
  assert.match(SPHERE_FS, /float solarLuma=dot\(sc,/);
  assert.match(SPHERE_FS, /solarLuma\*1\.35/);
  assert.match(SPHERE_FS, /vec3\(1\.0,0\.97,0\.90\)/);
  assert.doesNotMatch(SPHERE_FS, /u_sunTint/);
});
