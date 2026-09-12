import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import * as guard from "../../apps/web/js/solarContract.js";
import { solarImageRegistrationSchema } from "../../apps/web/js/solarSchema.js";

test("registration evidence cannot be usable without a bounded structure/epoch guard", () => {
  assert.equal(typeof guard.assessSolarImageRegistration, "function");
  assert.equal(guard.assessSolarImageRegistration(null, null, null).status, "unavailable");
});

test("registration applies the literal shared source-attribution corpus without rewriting evidence", () => {
  const sources = JSON.parse(fs.readFileSync(new URL("../fixtures/standalone-provenance.json", import.meta.url)));
  const corpus = JSON.parse(fs.readFileSync(new URL("../fixtures/solar-registration.json", import.meta.url)));
  const snapshot = JSON.parse(fs.readFileSync(new URL("../../apps/web/data/latest-state.json", import.meta.url)));
  snapshot.coordinates.reference_epoch_jd_tt = corpus.reference_epoch_jd_tt;

  for (const sourceCase of sources) {
    const registration = structuredClone(corpus.registration);
    registration.source = structuredClone(sourceCase.source);
    const originalSource = structuredClone(sourceCase.source);
    const asset = {
      image_id: registration.image_id,
      sha256: registration.image_sha256,
      capture_timestamp: registration.capture_timestamp,
    };

    const result = guard.assessSolarImageRegistration(registration, structuredClone(snapshot), asset);

    assert.equal(
      result.status === "structure_epoch_compatible",
      sourceCase.attributable,
      `${sourceCase.id}: ${result.reason}`,
    );
    assert.equal(result.compositing_permitted, false, sourceCase.id);
    assert.deepEqual(registration.source, originalSource, `${sourceCase.id}: input source changed`);
    if (sourceCase.attributable) {
      assert.deepEqual(result.evidence.source, originalSource, `${sourceCase.id}: retained evidence changed`);
    }
  }
});

test("registration shared corpus bounds identity, UTC/TT, epoch and image geometry without enabling compositing", () => {
  const corpus = JSON.parse(fs.readFileSync(new URL("../fixtures/solar-registration.json", import.meta.url)));
  const base = JSON.parse(fs.readFileSync(new URL("../../apps/web/data/latest-state.json", import.meta.url)));
  assert.deepEqual(solarImageRegistrationSchema, JSON.parse(fs.readFileSync(new URL("../../docs/solar-image-registration-v1.schema.json", import.meta.url))));
  for (const c of corpus.cases) {
    const r = structuredClone(corpus.registration); r[c.path[0]] = c.value;
    const snapshot = structuredClone(base); snapshot.coordinates.reference_epoch_jd_tt = corpus.reference_epoch_jd_tt;
    const asset = { image_id: r.image_id, sha256: r.image_sha256, capture_timestamp: r.capture_timestamp };
    const result = guard.assessSolarImageRegistration(r, snapshot, asset);
    assert.equal(result.status === "structure_epoch_compatible", c.compatible, `${c.id}: ${result.reason}`);
    assert.equal(result.compositing_permitted, false);
  }
  const snapshot = structuredClone(base); snapshot.coordinates.reference_epoch_jd_tt = corpus.reference_epoch_jd_tt;
  const r = corpus.registration;
  const asset = { image_id: r.image_id, sha256: r.image_sha256, capture_timestamp: r.capture_timestamp };
  assert.equal(guard.assessSolarImageRegistration(r, snapshot, { ...asset, sha256: "2".repeat(64) }).status, "unavailable");
  assert.equal(guard.assessSolarImageRegistration(r, { ...snapshot, coordinates: { ...snapshot.coordinates, reference_epoch_jd_tt: 2451545 } }, asset).status, "unavailable");
  assert.equal(guard.assessSolarImageRegistration({ ...r, p_deg: NaN }, snapshot, asset).status, "unavailable");
});
