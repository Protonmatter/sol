import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parseStrictJson, parseSolarSnapshot, assertSolarSnapshot } from "../../apps/web/js/solarContract.js";
import { parseSolarSnapshot as parseHistorical } from "../fixtures/historical/solarContractV2.js";
import { solarSchema } from "../../apps/web/js/solarSchema.js";
const fixtureText = fs.readFileSync(new URL("../../apps/web/data/latest-state.json", import.meta.url), "utf8");

test("parsed structured clones reject sparse and invalid samples without repairing them", () => {
  for (const field of ["br_normalized", "continuum_proxy", "confidence"]) {
    for (const mutation of ["all holes", "one hole", undefined, null, NaN]) {
      const value = JSON.parse(fixtureText);
      if (mutation === "all holes") value.fields[field].values = new Array(value.grid.lon_count * value.grid.lat_count);
      else if (mutation === "one hole") delete value.fields[field].values[17];
      else value.fields[field].values[17] = mutation;
      const cloned = structuredClone(value);
      assert.throws(() => assertSolarSnapshot(cloned), undefined, `${field}: ${String(mutation)}`);
    }
  }
  const sparseWarnings = JSON.parse(fixtureText);
  delete sparseWarnings.warnings[0];
  assert.throws(() => assertSolarSnapshot(structuredClone(sparseWarnings)), /missing array item/);
  const dense = structuredClone(JSON.parse(fixtureText));
  assert.equal(assertSolarSnapshot(dense), dense);
  assert.ok(Object.isFrozen(dense.fields.br_normalized.values));
  assert.equal(Object.keys(dense.fields.br_normalized.values).length, dense.grid.lon_count * dense.grid.lat_count);
});

test("live and historical guards reject cross-version mixing", () => {
  const historical = fs.readFileSync(new URL("../fixtures/historical/solar-v2.json", import.meta.url), "utf8");
  assert.equal(parseHistorical(historical).schema_version, "solar-state-snapshot.v2");
  assert.throws(() => parseSolarSnapshot(historical));
  assert.throws(() => parseHistorical(fixtureText));
  const parsed = JSON.parse(fixtureText);
  assert.equal(assertSolarSnapshot(parsed), parsed);
  assert.ok(Object.isFrozen(parsed.uncertainty.activity));
  const invalid = JSON.parse(fixtureText); invalid.observed_context = { value: Infinity };
  assert.throws(() => assertSolarSnapshot(invalid));
});

test("browser schema matches the canonical closed solar schema", () => {
  assert.deepEqual(solarSchema, JSON.parse(fs.readFileSync(new URL("../../docs/solar-state-snapshot-v3.schema.json", import.meta.url), "utf8")));
});
test("raw intake rejects duplicate keys, malformed numbers and nonfinite numbers", () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '[01]', '[1.]', '[-.1]', '[1.e2]', '[1e400]']) assert.throws(() => parseStrictJson(text), undefined, text);
  assert.deepEqual(parseStrictJson(' { "a": [0, -0.1, 1.2e+3], "b": "a\\\"b" } '), { a: [0, -0.1, 1200], b: 'a"b' });
});
test("only schema-valid and semantically coherent solar snapshots pass", () => {
  assert.equal(parseSolarSnapshot(fixtureText).schema_version, "solar-state-snapshot.v3");
  const mutations = [
    s => { s.grid = null; }, s => { s.schema_version = "solar-state-snapshot.v1"; },
    s => { s.fields.confidence.values.pop(); }, s => { s.fields.confidence.values[0] = 1.1; },
    s => { s.coordinates.longitude_positive = "east"; }, s => { s.run.time_seconds += 1; },
    s => { s.extra = true; }, s => { s.model_version = ""; }, s => { s.operational_use = true; },
    s => { s.coordinates.rotation_reference_deg_per_day = 15; },
  ];
  for (const mutate of mutations) { const s = JSON.parse(fixtureText); mutate(s); assert.throws(() => parseSolarSnapshot(JSON.stringify(s))); }
});

test("browser agrees with Rust and Python on the shared lexical and snapshot corpus", () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
  for (const fixture of read("strict-intake.json")) {
    if (fixture.accepted) assert.doesNotThrow(() => parseStrictJson(fixture.text), fixture.id);
    else assert.throws(() => parseStrictJson(fixture.text), undefined, fixture.id);
  }
  for (const fixture of read("snapshot-intake.json")) {
    const value = JSON.parse(fixtureText);
    let parent = value;
    for (const segment of fixture.path.slice(0, -1)) parent = parent[segment];
    const key = fixture.path.at(-1);
    if (fixture.remove) delete parent[key]; else parent[key] = fixture.value;
    if (fixture.accepted) assert.doesNotThrow(() => parseSolarSnapshot(JSON.stringify(value)), fixture.id);
    else assert.throws(() => parseSolarSnapshot(JSON.stringify(value)), undefined, fixture.id);
  }
});

test("raw and structured intake bind longitude to immutable birth and model age", () => {
  const cases = JSON.parse(fs.readFileSync(new URL("../fixtures/solar-longitude-intake.json", import.meta.url), "utf8"));
  for (const fixture of cases) {
    const value = JSON.parse(fixtureText);
    value.run.steps = 1;
    value.run.dt_hours = fixture.at_time_seconds / 3600;
    value.run.time_seconds = fixture.at_time_seconds;
    value.uncertainty.activity.at_time_seconds = fixture.at_time_seconds;
    value.active_regions = [value.active_regions[0]];
    const region = value.active_regions[0];
    region.birth = { time_seconds: fixture.birth_time_seconds, lat_deg: fixture.lat_deg, lon_deg: fixture.birth_lon_deg };
    Object.assign(region.model_position, { at_time_seconds: fixture.at_time_seconds, lat_deg: fixture.lat_deg, lon_deg: fixture.model_lon_deg });
    for (const intake of [() => parseSolarSnapshot(JSON.stringify(value)), () => assertSolarSnapshot(structuredClone(value))]) {
      if (fixture.accepted) assert.doesNotThrow(intake, fixture.id);
      else assert.throws(intake, /longitude/, fixture.id);
    }
  }
});
