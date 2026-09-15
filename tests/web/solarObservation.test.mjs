import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getSolarObservation } from "../../apps/web/js/solarObservation.js";
import { textureEligible, visualAssetForBody } from "../../apps/web/js/visualAssets.js";

test("the solar observation binds original NASA bytes and separate clocks", async () => {
  const observation = getSolarObservation();
  const raw = await readFile(new URL(`../../apps/web/${observation.path}`, import.meta.url));
  assert.equal(createHash("sha256").update(raw).digest("hex"), observation.sha256);
  assert.equal(raw.length, observation.bytes);
  assert.equal(observation.capturedAt, "2026-09-12T00:07:22Z");
  assert.equal(observation.retrievedAt, "2026-09-13T05:03:15Z");
  assert.equal(observation.status, "archival");
  assert.equal(observation.sourceUrl, "https://sdo.gsfc.nasa.gov/assets/img/browse/2026/09/12/20260912_000722_1024_0171.jpg");
  assert.equal(observation.instrument, "AIA");
  assert.equal(observation.wavelengthAngstrom, 171);
  assert.equal(observation.isFalseColor, true);
  assert.match(observation.interpretation, /extreme ultraviolet/i);
});

test("the observation is immutable and cannot acquire surface or registration eligibility", () => {
  const observation = getSolarObservation();
  assert.equal(getSolarObservation(), observation);
  assert.equal(Object.isFrozen(observation), true);
  assert.equal(Object.isFrozen(observation.allowedUsages), true);
  assert.throws(() => { observation.status = "live"; }, TypeError);
  assert.deepEqual(observation.allowedUsages, ["observed-image"]);
  assert.equal(observation.registrationVerified, false);
  assert.equal(observation.globalMappingAllowed, false);
  assert.equal(observation.scientificAnalysisAllowed, false);
  assert.equal(visualAssetForBody(observation.id), null);
  assert.equal(textureEligible(observation.id), false);
});
