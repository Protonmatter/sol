import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertSolarSnapshot, parseSolarSnapshot } from "../../apps/web/js/solarContract.js";

const fixtureText = fs.readFileSync(new URL("../../apps/web/data/latest-state.json", import.meta.url), "utf8");
const corpus = JSON.parse(fs.readFileSync(new URL("../fixtures/standalone-provenance.json", import.meta.url), "utf8"));

for (const fixture of corpus) {
  test(`standalone observation attribution: ${fixture.id}`, () => {
    const snapshot = JSON.parse(fixtureText);
    snapshot.observations[0].frames[0].provenance.source = fixture.source;
    const before = JSON.stringify(snapshot);
    for (const intake of [() => parseSolarSnapshot(before), () => assertSolarSnapshot(structuredClone(snapshot))]) {
      if (fixture.attributable) {
        const accepted = intake();
        assert.equal(accepted.observations[0].frames[0].provenance.source, fixture.source);
        assert.ok(Object.isFrozen(accepted.observations[0].frames[0].provenance));
      } else {
        assert.throws(intake, /provenance/, fixture.id);
      }
    }
    assert.equal(JSON.stringify(snapshot), before, "intake must preserve source evidence");
  });
}
