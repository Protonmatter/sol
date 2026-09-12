import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createHash, webcrypto } from "node:crypto";
import { readDataBundle } from "../../apps/web/js/dataBundle.js";
import { assertEphemerisSnapshotV3, parseEphemerisSnapshot, mergeLocalEvents } from "../../apps/web/js/ephemerisContract.js";
import { assertEphemerisSnapshotV2 } from "../../apps/web/js/ephemerisContractV2.js";
import { assertSolarSnapshot, parseStrictJson } from "../../apps/web/js/solarContract.js";

const solar = JSON.parse(fs.readFileSync(new URL("../../apps/web/data/latest-state.json", import.meta.url), "utf8"));
const ephemeris = JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json", import.meta.url), "utf8")).snapshot;
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const hash = raw => createHash("sha256").update(raw).digest("hex");

// Each mutation targets a named contract failure, independent of validator internals.
function rejectionCases(prefix, fixture, intake, cases) {
  for (const [name, mutate, reason] of cases) test(`${prefix}: ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.throws(() => intake(value), reason);
  });
}

rejectionCases("live ephemeris rejects", () => structuredClone(ephemeris), assertEphemerisSnapshotV3, [
  ["wrong coordinate frame", s => { s.bodies[0].coordinate_frame = "J2000"; }, /constant mismatch/],
  ["unknown body kind", s => { s.bodies[0].kind = "comet"; }, /unsupported value/],
  ["too few bodies", s => { s.bodies = []; }, /too few entries/],
  ["epoch below Gregorian domain", s => { s.time.jd_utc = 1721425.4; }, /unsupported proleptic Gregorian epoch/],
  ["epoch at excluded domain end", s => { s.time.jd_utc = 5373484.5; }, /unsupported proleptic Gregorian epoch/],
  ["unattributed precision EOP", s => { s.time.earth_orientation.source = "unqualified provider"; }, /precision EOP requires IERS/],
  ["UTC with historical null TAI", s => { s.time.jd_tai = null; }, /historical approximation mismatch/],
  ["unpaired TAI offset", s => { s.time.tai_minus_utc_seconds = null; }, /TAI values must both/],
  ["historical proxy with precision quality", s => { Object.assign(s.time, { input_time_semantics: "historical_ut1_proxy", jd_tai: null, tai_minus_utc_seconds: null }); }, /historical approximation requires degraded/],
  ["inconsistent UT1", s => { s.time.jd_ut1 += 0.001; }, /inconsistent time scales/],
  ["inconsistent delta T", s => { s.time.delta_t_seconds += 1; }, /inconsistent time scales/],
  ["inconsistent TAI", s => { s.time.jd_tai += 0.001; }, /inconsistent TAI\/TT/],
  ["inconsistent TT with otherwise matching delta T", s => { s.time.jd_tt += 0.001; s.time.delta_t_seconds = (s.time.jd_tt - s.time.jd_ut1) * 86400; }, /inconsistent TAI\/TT/],
  ["contradictory EOP accuracy", s => { s.accuracy.eop_status = "degraded"; }, /EOP status mismatch/],
  ["unvalidated evidence with record IDs", s => { s.accuracy.evidence_record_ids = ["unaccepted-record"]; }, /evidence status mismatch/],
  ["duplicate identities", s => { s.bodies.push(structuredClone(s.bodies[0])); }, /duplicate identity/],
  ["right ascension alias disagreement", s => { s.bodies[0].ra_deg += 0.001; }, /topocentric aliases disagree/],
  ["declination alias disagreement", s => { s.bodies[0].dec_deg += 0.001; }, /topocentric aliases disagree/],
  ["infinite major body", s => { Object.assign(s.bodies[0], { range_approximation: "infinite_catalogue_star", geocentric_range_km: null, observer_range_km: null }); }, /invalid infinite catalogue-star range/],
  ["infinite non-star", s => { s.bodies.find(b => b.range_approximation === "infinite_catalogue_star").kind = "planet"; }, /invalid infinite catalogue-star range/],
  ["catalogue-star parallax", s => { s.bodies.find(b => b.range_approximation === "infinite_catalogue_star").geocentric_apparent_ra_deg += 0.001; }, /infinite star has parallax/],
  ["Moon geocentric aliases", s => { const b = s.bodies.find(b => b.name === "Moon"); b.geocentric_apparent_ra_deg = b.ra_deg; b.geocentric_apparent_dec_deg = b.dec_deg; }, /geocentric alias/],
  ["omitted mandatory identity", s => { s.bodies.find(b => b.name === "Neptune").name = "Other planet"; }, /missing Neptune/],
]);

test("historical live approximation preserves explicit null TAI and degraded quality", () => {
  const value = structuredClone(ephemeris);
  Object.assign(value.time, { input_time_semantics: "historical_ut1_proxy", jd_tai: null, tai_minus_utc_seconds: null });
  value.time.earth_orientation.quality = "pre_utc_ut1_proxy";
  value.accuracy.eop_status = "pre_utc_ut1_proxy";
  assert.equal(assertEphemerisSnapshotV3(value), value);
  assert.equal(value.time.jd_tai, null);
  assert.equal(value.accuracy.eop_status, "pre_utc_ut1_proxy");
});

test("provider error payload retains its actionable error", () => {
  assert.throws(() => parseEphemerisSnapshot('{"error":"Ephemeris calculation unavailable"}'), { message: "Ephemeris calculation unavailable" });
});

test("local event merge rejects independently valid snapshots from different mean-solar days", () => {
  const remote = structuredClone(ephemeris), local = structuredClone(ephemeris);
  for (const key of ["jd_utc", "jd_tai", "jd_tt", "jd_ut1"]) local.time[key] += 1;
  local.events_window.start_jd += 1;
  local.events_window.end_jd += 1;
  for (const body of local.bodies) for (const event of Object.values(body.events)) if (event.jd !== null) event.jd += 1;
  assert.equal(assertEphemerisSnapshotV3(local), local);
  assert.throws(() => mergeLocalEvents(remote, local), /local backfill window mismatch/);
  assert.equal(remote.events_window.start_jd, 2461222.5);
});

function historical() {
  return {
    schema_version: "ephemeris-snapshot.v2", engine_version: "synthetic-contract-test",
    provider: { tier: "client", source: "offline fixture", ephemeris: "synthetic", endpoint_contract: "ephemeris-snapshot.v2" },
    time: { jd_utc: 2460000.75, jd_tt: 2460000.75, jd_ut1: 2460000.75, jd_tai: null, tai_minus_utc_seconds: null,
      dut1_seconds: 0, delta_t_seconds: 0, lst_deg: 0, obliquity_deg: 23,
      earth_orientation: { source: "synthetic test", quality: "degraded", xp_arcsec: 0, yp_arcsec: 0, dut1_uncertainty_seconds: 0.9 } },
    observer: { terrestrial_lat_deg: 0, terrestrial_lon_deg_east: 90, polar_motion_corrected_lat_deg: 0, polar_motion_corrected_lon_deg_east: 90, elev_m: 0 },
    accuracy: { class: "degraded", coordinate_semantics: "synthetic", time_scales: "synthetic", validation_scope: "synthetic", valid_epoch: "synthetic", non_goal: "accuracy", eop_status: "degraded" },
    bodies: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"].map(name => ({
      name, kind: name === "Moon" ? "moon" : name === "Sun" ? "star" : "planet",
      coordinate_frame: "true_equator_and_equinox_of_date", ra_deg: 1, dec_deg: 2,
      geocentric_apparent_ra_deg: 0, geocentric_apparent_dec_deg: 2, topocentric_apparent_ra_deg: 1, topocentric_apparent_dec_deg: 2,
      distance_km: 100000, alt_deg: 20, az_deg: 90, alt_refracted_deg: 21, above_horizon: true,
      compass: "E", angular_size_arcsec: 10, horizontal_parallax_deg: 1,
      rise_jd: null, transit_jd: null, set_jd: null, transit_alt_deg: null,
    })), warnings: ["Synthetic degraded test"],
  };
}

rejectionCases("historical ephemeris rejects", historical, assertEphemerisSnapshotV2, [
  ["array observer", s => { s.observer = []; }, /observer: expected object/],
  ["nonfinite epoch", s => { s.time.jd_utc = Infinity; }, /jd_utc: expected finite number/],
  ["whitespace engine identity", s => { s.engine_version = " \t"; }, /engine_version: expected non-empty string/],
  ["lower latitude overflow", s => { s.observer.terrestrial_lat_deg = -91; }, /terrestrial_lat_deg: expected -90/],
  ["upper latitude overflow", s => { s.observer.terrestrial_lat_deg = 91; }, /terrestrial_lat_deg: expected -90/],
  ["excluded RA endpoint", s => { s.bodies[0].ra_deg = 360; }, /ra_deg: expected 0 <= value < 360/],
  ["unknown body kind", s => { s.bodies[0].kind = "comet"; }, /kind: unsupported kind/],
  ["wrong frame", s => { s.bodies[0].coordinate_frame = "J2000"; }, /unexpected coordinate frame/],
  ["RA alias disagreement", s => { s.bodies[0].ra_deg = 2; }, /must alias topocentric_apparent_ra_deg/],
  ["Dec alias disagreement", s => { s.bodies[0].dec_deg = 3; }, /must alias topocentric_apparent_dec_deg/],
  ["infinite planetary range", s => { s.bodies[2].distance_km = null; }, /may be null only for catalogue stars/],
  ["numeric visibility", s => { s.bodies[0].above_horizon = 1; }, /expected boolean/],
  ["contradictory refracted visibility", s => { s.bodies[0].above_horizon = false; }, /disagrees with alt_refracted_deg/],
  ["live schema in historical reader", s => { s.schema_version = "ephemeris-snapshot.v3"; }, /expected ephemeris-snapshot.v2/],
  ["unknown provider tier", s => { s.provider.tier = "remote"; }, /unsupported tier/],
  ["wrong provider contract", s => { s.provider.endpoint_contract = "ephemeris-snapshot.v3"; }, /must be ephemeris-snapshot.v2/],
  ["unpaired TAI values", s => { s.time.jd_tai = 2460000.75; }, /both be null or both numeric/],
  ["unknown EOP quality", s => { s.time.earth_orientation.quality = "exact"; }, /unsupported quality/],
  ["contradictory EOP accuracy", s => { s.accuracy.eop_status = "rapid"; }, /must match EOP quality/],
  ["non-array bodies", s => { s.bodies = {}; }, /bodies: expected array/],
  ["duplicate body", s => { s.bodies.push(structuredClone(s.bodies[0])); }, /duplicate body name/],
  ["missing Neptune", s => { s.bodies.pop(); }, /missing major body Neptune/],
  ["unmodelled lunar parallax", s => { s.bodies[1].geocentric_apparent_ra_deg = 1; }, /topocentric coordinates alias geocentric/],
  ["absent warnings", s => { s.warnings = []; }, /expected at least one warning/],
]);

test("historical catalogue stars require equal finite-angle aliases at infinite range", () => {
  const value = historical();
  const star = { ...value.bodies[0], name: "Fixture star", distance_km: null, geocentric_apparent_ra_deg: 1 };
  value.bodies.push(star);
  assert.equal(assertEphemerisSnapshotV2(value), value);
  assert.equal(value.bodies.at(-1).distance_km, null);
  star.geocentric_apparent_ra_deg = 2;
  assert.throws(() => assertEphemerisSnapshotV2(value), /catalogue star must equal geocentric RA/);
  star.geocentric_apparent_ra_deg = 1;
  star.geocentric_apparent_dec_deg = 3;
  assert.throws(() => assertEphemerisSnapshotV2(value), /catalogue star must equal geocentric Dec/);
});

rejectionCases("solar contract rejects", () => structuredClone(solar), assertSolarSnapshot, [
  ["unsupported layer kind", s => { s.layers[0].kind = "certain"; }, /unsupported value/],
  ["undisclosed normalization", s => { s.calibration_state = "calibrated Gauss"; }, /must disclose normalized units/],
  ["duplicate layers", s => { s.layers.push(structuredClone(s.layers[0])); }, /layers: duplicate identities/],
  ["duplicate region IDs", s => { s.active_regions.push(structuredClone(s.active_regions[0])); }, /active_regions: duplicate identities/],
  ["missing confidence layer", s => { s.layers = s.layers.filter(l => l.id !== "confidence"); }, /layers: missing confidence/],
  ["malformed observation report", s => { s.observations[0].schema_version = "observation-frame.v99"; }, /observations: invalid report/],
  ["missing observation mode", s => { s.observations[0].source_mode = ""; }, /observations: invalid report/],
  ["non-array observation frames", s => { s.observations[0].frames = {}; }, /observations: invalid report/],
  ["unattributed observation", s => { delete s.observations[0].frames[0].provenance.source; }, /missing attributable provenance/],
  ["missing active provenance flag", s => { delete s.observations[0].frames[0].provenance.active; }, /missing attributable provenance/],
  ["array raw metadata", s => { s.observations[0].frames[0].provenance.raw_source_metadata = []; }, /missing attributable provenance/],
  ["empty quality flags", s => { s.observations[0].frames[0].quality_flags = []; }, /missing attributable provenance/],
  ["source mode disagreement", s => { s.operational_readiness.data_state.source_mode = "other"; }, /source mode mismatch/],
  ["observation mode disagreement", s => { s.operational_readiness.data_state.observation_mode = "none"; }, /observation mode mismatch/],
  ["live state without observations", s => { s.observations = []; Object.assign(s.operational_readiness.data_state, { observation_mode: "none", live_data_present: true }); }, /live data without observations/],
  ["missing required gate", s => { s.operational_readiness.gates = s.operational_readiness.gates.filter(g => g.id !== "historical_validation"); }, /gates: missing historical_validation/],
  ["contradictory provenance gate", s => { s.operational_readiness.gates.find(g => g.id === "public_data_provenance").passed = false; }, /provenance validity mismatch/],
]);

test("raw JSON and structured solar intake enforce their finite nesting and size budgets", () => {
  assert.throws(() => parseStrictJson(null), /16 MiB text limit/);
  assert.throws(() => parseStrictJson(" ".repeat(16 * 1024 * 1024 + 1)), /16 MiB text limit/);
  assert.throws(() => parseStrictJson("[".repeat(130) + "0" + "]".repeat(130)), /nesting exceeds 128 levels/);
  assert.deepEqual(parseStrictJson("[true,false,null]"), [true, false, null]);
  const value = structuredClone(solar);
  let nested = value.observed_context;
  for (let index = 0; index < 130; index++) nested = nested.child = {};
  assert.throws(() => assertSolarSnapshot(value), /nesting exceeds 128 levels/);
});

function bundleFixture({ mutateValues = () => {}, mutateManifest = () => {}, mutatePointer = () => {}, release = false, mutateRelease = () => {} } = {}) {
  const source = { schema_version: "public-data-cache-manifest.v2", bundle_id: "source", acquired_at_utc: "2024-02-29T00:00:00Z", failures: [],
    products: [{ product_id: "observation", source: "synthetic fixture", origin: "current-fetch", observation_time_utc: null, retrieved_at_utc: null,
      quality: ["fixture only"], failure: null, license: "fixture", critical: true, path: "payloads/observation.json", size_bytes: 2, sha256: hash(bytes({})) }] };
  const values = { snapshot: structuredClone(solar), observations: structuredClone(solar.observations[0]), source_manifest: source,
    feed_status: { schema_version: "daily-ingest-status.v2", bundle_id: "bundle", source_bundle_id: "source", status: "ok", generated_at_utc: "2024-02-29T00:00:00Z", observation_time_utc: null, delivery_state: "validated", warnings: [],
      sources: [{ file: "observation", source: "synthetic fixture", ok: true, origin: "current-fetch", observation_time_utc: null, retrieved_at_utc: null }] },
    series_manifest: { schema_version: "series-manifest.v1", frames: [] } };
  mutateValues(values);
  const prefix = release ? "https://example.invalid/sol/releases/release-a/" : "https://example.invalid/";
  const root = prefix + "data/bundles/bundle/", files = new Map(), components = [];
  for (const [role, value] of Object.entries(values)) {
    const raw = bytes(value), path = role.startsWith("series_frame:") ? `series/frame-${role.slice(13)}.json` : `${role}.json`;
    files.set(root + path, raw);
    components.push({ role, path, schema_version: value.schema_version, size_bytes: raw.length, sha256: hash(raw) });
  }
  const manifest = { schema_version: "research-data-bundle.v1", bundle_id: "bundle", source_bundle_id: "source", source_manifest_sha256: hash(bytes(source)), generated_at_utc: "2024-02-29T00:00:00Z", components };
  mutateManifest(manifest);
  const raw = bytes(manifest);
  files.set(root + "manifest.json", raw);
  const pointer = { schema_version: "bundle-pointer.v1", bundle_id: "bundle", manifest_path: "bundles/bundle/manifest.json", manifest_sha256: hash(raw) };
  mutatePointer(pointer);
  let options;
  if (release) {
    const record = { schema_version: "web-release-manifest.v1", release_id: "release-a", namespace: "releases/release-a/", base_path: "/sol/", data_bundle_id: "bundle",
      data_bundle: { bundle_id: "bundle", manifest_path: "releases/release-a/data/" + pointer.manifest_path, manifest_sha256: pointer.manifest_sha256 },
      assets: [...files].map(([url, raw]) => ({ path: new URL(url).pathname.slice(5), size: raw.length, sha256: hash(raw), role: "critical" })) };
    mutateRelease(record);
    options = { releaseUrl: prefix + "web-release-manifest.json", expectedReleaseId: "release-a" };
    files.set(options.releaseUrl, bytes(record));
  } else {
    options = { pointerUrl: prefix + "data/current.json" };
    files.set(options.pointerUrl, bytes(pointer));
  }
  const seen = [];
  const fetcher = async url => {
    seen.push(url);
    assert.ok(files.has(url), `unexpected bundle request: ${url}`);
    return new Response(files.get(url));
  };
  return { files, seen, options: { ...options, fetcher, crypto: webcrypto } };
}

const bundleCases = [
  ["missing pointer field", { mutatePointer: p => { delete p.bundle_id; } }, /Missing bundle field bundle_id/],
  ["unexpected pointer field", { mutatePointer: p => { p.extra = true; } }, /Unexpected bundle field extra/],
  ["pointer type mismatch", { mutatePointer: p => { p.bundle_id = 2; } }, /Bundle schema type mismatch/],
  ["pointer version mismatch", { mutatePointer: p => { p.schema_version = "bundle-pointer.v99"; } }, /Bundle schema value mismatch/],
  ["traversing manifest path", { mutatePointer: p => { p.manifest_path = "../manifest.json"; } }, /Invalid bundle relative path/],
  ["invalid bundle ID", { mutatePointer: p => { p.bundle_id = "!bundle"; } }, /Invalid bundle identity\/hash/],
  ["malformed digest", { mutatePointer: p => { p.manifest_sha256 = "z".repeat(64); } }, /Invalid bundle identity\/hash/],
  ["short digest", { mutatePointer: p => { p.manifest_sha256 = "a"; } }, /Bundle string outside bounds/],
  ["incorrect manifest digest", { mutatePointer: p => { p.manifest_sha256 = "a".repeat(64); } }, /Bundle manifest hash mismatch/],
  ["manifest identity mismatch", { mutateManifest: m => { m.bundle_id = "other"; } }, /Bundle identity mismatch/],
  ["too few components", { mutateManifest: m => { m.components = []; } }, /Bundle array outside bounds/],
  ["oversized component declaration", { mutateManifest: m => { m.components[0].size_bytes = 16777217; } }, /Bundle number outside bounds/],
  ["negative component declaration", { mutateManifest: m => { m.components[0].size_bytes = -1; } }, /Bundle number outside bounds/],
  ["unknown role", { mutateManifest: m => { m.components[0].role = "unrecognized"; } }, /Unknown bundle role/],
  ["duplicated role", { mutateManifest: m => { m.components.push(structuredClone(m.components[0])); } }, /Duplicate bundle component/],
  ["malformed component hash", { mutateManifest: m => { m.components[0].sha256 = "z".repeat(64); } }, /Duplicate bundle component or invalid hash/],
  ["wrong component schema", { mutateManifest: m => { m.components[0].schema_version = "solar-state-snapshot.v99"; } }, /Component schema mismatch/],
  ["required role replaced by orphan", { mutateManifest: m => { m.components.find(c => c.role === "observations").role = "series_frame:0"; } }, /Missing bundle role observations/],
  ["source identity disagreement", { mutateValues: v => { v.source_manifest.bundle_id = "other"; } }, /Source\/status bundle identity mismatch/],
  ["hidden source degradation", { mutateValues: v => { v.source_manifest.products[0].failure = "fixture acquisition failed"; } }, /Feed status must preserve source degradation/],
  ["invalid normalized report", { mutateValues: v => { v.observations.frames = {}; } }, /Invalid normalized observations/],
  ["missing observation context", { mutateValues: v => { delete v.snapshot.observed_context; } }, /Snapshot observation context disagrees/],
  ["wrong series schema", { mutateValues: v => { v.series_manifest.schema_version = "series-manifest.v99"; } }, /Invalid series schema/],
  ["missing selected series payload", { mutateValues: v => { v.series_manifest.frames = [{ file: "frame-0.json", months: 0, index: 0 }]; } }, /Missing series component/],
  ["release identity mismatch", { release: true, mutateRelease: r => { r.release_id = "foreign"; } }, /Release identity mismatch/],
  ["missing release descriptor", { release: true, mutateRelease: r => { delete r.data_bundle; } }, /Missing release-bound data bundle/],
  ["bundle outside immutable namespace", { release: true, mutateRelease: r => { r.data_bundle.manifest_path = "releases/foreign/data/bundles/bundle/manifest.json"; } }, /Bundle outside release namespace/],
  ["optional bundle manifest", { release: true, mutateRelease: r => { r.assets.find(a => a.path === r.data_bundle.manifest_path).role = "optional"; } }, /Bundle manifest is not release-bound/],
  ["wrong release component size", { release: true, mutateRelease: r => { r.assets.find(a => a.path.endsWith("snapshot.json")).size += 1; } }, /Component not bound to release asset/],
];
for (const [name, options, reason] of bundleCases) test(`bundle reader rejects ${name}`, async () => {
  const fixture = bundleFixture(options);
  await assert.rejects(readDataBundle(fixture.options), reason);
  assert.ok(fixture.seen.every(url => !url.endsWith("latest-state.json")), "failed bundles must not read mutable aliases");
});

test("hash-bound current source and leap-day metadata retain a complete immutable publication", async () => {
  const fixture = bundleFixture();
  const result = await readDataBundle(fixture.options);
  assert.equal(result.bundleId, "bundle");
  assert.equal(result.feedStatus.status, "ok");
  assert.equal(result.feedStatus.generated_at_utc, "2024-02-29T00:00:00Z");
  assert.deepEqual(result.seriesFrames, []);
  assert.ok(Object.isFrozen(result.snapshot));
  assert.ok(Object.isFrozen(result.feedStatus));
});

test("bundle reader rejects absent selection and failed HTTP without fallback requests", async () => {
  await assert.rejects(readDataBundle({ fetcher: async () => { assert.fail("no selection may perform I/O"); } }), /Missing bundle selection/);
  const seen = [];
  await assert.rejects(readDataBundle({ pointerUrl: "https://example.invalid/current.json", fetcher: async url => {
    seen.push(url); return new Response("unavailable", { status: 503 });
  } }), /Bundle HTTP 503/);
  assert.deepEqual(seen, ["https://example.invalid/current.json"]);
});

test("oversized bundle streams are cancelled and released before JSON parsing", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readDataBundle({ pointerUrl: "https://example.invalid/current.json", fetcher: async () => new Response(stream) }), /Bundle exceeds byte limit/);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});
