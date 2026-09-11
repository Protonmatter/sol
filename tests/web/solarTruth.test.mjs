import assert from "node:assert/strict";
import test from "node:test";
import { projectSolarPoint, confidenceEncoding } from "../../apps/web/js/solarProjection.js";
import { makeSeriesRecords, seriesPosition, nextAvailableFrame, nearestSeriesFrame } from "../../apps/web/js/seriesModel.js";
import { resolvePresentation } from "../../apps/web/js/presentationState.js";

test("declared central meridian faces the viewer, west projects right and far hemisphere is hidden", () => {
  const coordinates = { central_meridian_longitude_deg: 30, longitude_positive: "west" };
  assert.deepEqual(projectSolarPoint(0, 30, coordinates), { x: 0, y: -0, z: 1, visible: true });
  assert.ok(projectSolarPoint(0, 75, coordinates).x > 0);
  assert.equal(projectSolarPoint(0, 210, coordinates).visible, false);
  assert.equal(projectSolarPoint(NaN, 30, coordinates), null);
});

test("score encoding responds monotonically to actual confidence, including zero", () => {
  const low = confidenceEncoding(0.1), high = confidenceEncoding(0.95);
  assert.ok(high.opacity > low.opacity);
  assert.equal(confidenceEncoding(0).opacity, 0);
  assert.equal(confidenceEncoding(null), null);
  assert.equal(confidenceEncoding(1.1), null);
});

test("missing month twelve retains its identity and month twenty-four position", () => {
  const manifest = { frames: [{ file: "a.json", months: 0 }, { file: "b.json", months: 12 }, { file: "c.json", months: 24 }] };
  const records = makeSeriesRecords(manifest, [{ run: {} }, null, { run: {} }]);
  assert.deepEqual(records.map(r => [r.months, r.status]), [[0, "ready"], [12, "unavailable"], [24, "ready"]]);
  assert.equal(seriesPosition(records, 1), 0.5);
  assert.equal(seriesPosition(records, 2), 1);
  assert.deepEqual(nextAvailableFrame(records, 0, 1), { index: 2, skipped: 1 });
  assert.equal(nextAvailableFrame(makeSeriesRecords(manifest, [null, null, null]), 0, 1), null);
});

test("synthetic regions and stale context never become observations in presentation", () => {
  const snapshot = { run: { time_seconds: 3600 }, active_regions: [{ lat_deg: 0, lon_deg: 0 }], coordinates: { central_meridian_longitude_deg: 0 }, learning: { cycle_stage: "solar maximum" } };
  const before = JSON.stringify(snapshot);
  const view = resolvePresentation({ snapshot, wavelength: "model", imageState: "failed", feedStatus: { next_recommended_run_utc: "2026-01-01T00:00:00Z" }, nowMs: Date.parse("2026-09-11T00:00:00Z") });
  assert.equal(view.sourceKind, "synthetic");
  assert.equal(view.freshness, "stale");
  assert.match(view.headline, /modeled region/);
  assert.doesNotMatch(view.headline, /right now|facing us|observed region/i);
  assert.equal(view.comparisonAllowed, false);
  assert.equal(JSON.stringify(snapshot), before);
  assert.ok(Object.isFrozen(view));
  assert.match(resolvePresentation({ snapshot, timeline: { months: 24 }, nowMs: 0 }).headline, /month 24/);
});

test("an observed image with unknown capture time cannot be called current or aligned", () => {
  const view = resolvePresentation({ snapshot: {}, wavelength: "continuum", imageState: "live", nowMs: 0 });
  assert.equal(view.sourceKind, "observed");
  assert.match(view.timeLabel, /capture time unavailable/i);
  assert.equal(view.comparisonAllowed, false);
  assert.equal(view.showModelOverlays, false);
});

test("scrubbing uses actual month spacing and preserves a selected missing slot", () => {
  const records = makeSeriesRecords({ frames: [{file:"a.json",months:0},{file:"b.json",months:2},{file:"c.json",months:24}] }, [{}, null, {}]);
  assert.equal(nearestSeriesFrame(records, 2 / 24), 1);
  assert.equal(nearestSeriesFrame(records, 0.6), 2);
  assert.equal(nearestSeriesFrame([], 0.5), null);
});

test("fallback coordinates do not imply validated data, and a gap names retained model time", () => {
  const fallback = { schema_version:"solar-state-snapshot.v1", coordinates:{central_meridian_longitude_deg:0}, run:{time_seconds:42} };
  assert.equal(resolvePresentation({snapshot:fallback,dataError:"invalid"}).availability, "unavailable");
  assert.match(resolvePresentation({snapshot:fallback,timeline:{months:12,status:"unavailable"}}).timeLabel, /42 s.*retained/i);
});
