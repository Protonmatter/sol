// Tests for store-coupled selectors — specifically the feed-staleness logic that keeps
// a frozen "ok" from rendering as current health. dom.js touches `document` at module
// evaluation, so a minimal shim is installed BEFORE the selectors import; every element
// lookup returning null exercises the same guards the browser relies on.
const domNodes = new Map([
  ["layerConfidence", { checked: false }],
  ["layerRegions", { checked: false }],
]);
globalThis.document = { getElementById: (id) => domNodes.get(id) || null };

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Module identity includes the query string: selectors.js imports "./store.js?v=<token>"
// (see build_web.py), so importing store.js WITHOUT the token yields a second, unrelated
// store instance — every mutation below would be invisible to the selectors. Extract the
// live token from selectors.js itself so these tests survive every restamp.
const selectorsUrl = new URL("../../apps/web/js/selectors.js", import.meta.url);
const tokenMatch = readFileSync(selectorsUrl, "utf8").match(/\.\/store\.js\?v=([0-9a-zA-Z]+)/);
const q = tokenMatch ? `?v=${tokenMatch[1]}` : "";
const { store } = await import(`../../apps/web/js/store.js${q}`);
const selectors = await import("../../apps/web/js/selectors.js");
const {
  fieldValues, meanField, selectedRegion, visibleLayers, visibleLayerSummary,
  observationFrames, dataStateLabel, dataStateClass, readinessLabel, readinessClass,
  feedOverdueHours, feedStateLabel, feedStateClass, regionLocation,
  selectedRegionSummary, selectedRegionSentence, observedSignalSummary,
  observationSummary, adapterSummary, layerSummary,
} = selectors;

const HOUR = 3600 * 1000;
const T0 = Date.parse("2026-07-03T05:40:00Z"); // the feed's next_recommended_run_utc

test("feedOverdueHours: not overdue inside the 6h grace, exact hours past it", () => {
  store.feedStatus = { status: "ok", next_recommended_run_utc: "2026-07-03T05:40:00Z" };
  assert.equal(feedOverdueHours(T0 + 5 * HOUR), null);           // late but within grace
  assert.ok(Math.abs(feedOverdueHours(T0 + 7 * HOUR) - 1) < 1e-9); // 1h past grace
  assert.equal(feedOverdueHours(T0 - HOUR), null);               // not yet due
});

test("feedOverdueHours: missing or malformed inputs never throw, just decline to judge", () => {
  store.feedStatus = null;
  assert.equal(feedOverdueHours(T0), null);
  store.feedStatus = { status: "ok" };
  assert.equal(feedOverdueHours(T0), null);
  store.feedStatus = { status: "ok", next_recommended_run_utc: "not a date" };
  assert.equal(feedOverdueHours(T0), null);
});

test("a multi-day-stale 'ok' feed reads stale and wears the failure tone", () => {
  // A next-run date far in the past is deterministically overdue on any real clock.
  store.feedStatus = { status: "ok", next_recommended_run_utc: "2000-01-01T00:00:00Z" };
  assert.match(feedStateLabel(), /^stale \d+d$/);
  assert.equal(feedStateClass(), "degraded");
});

test("a current 'ok' feed still reads healthy", () => {
  const soon = new Date(Date.now() + 3600 * 1000).toISOString();
  store.feedStatus = { status: "ok", next_recommended_run_utc: soon };
  assert.equal(feedStateLabel(), "daily ok");
  assert.equal(feedStateClass(), "live");
});

test("explicit failure states pass through untouched", () => {
  store.feedStatus = { status: "failed", next_recommended_run_utc: "2000-01-01T00:00:00Z" };
  assert.equal(feedStateLabel(), "failed");
  assert.equal(feedStateClass(), "degraded");
});

test("dataStateLabel precedence: degraded beats live beats cached beats fixture", () => {
  store.state = { source_mode: "live+degraded-cache", operational_readiness: {} };
  assert.equal(dataStateLabel(), "degraded");
  store.state = { source_mode: "synthetic+cached-observed-context", operational_readiness: {} };
  assert.equal(dataStateLabel(), "cached");
  store.state = { source_mode: "synthetic", operational_readiness: {} };
  assert.equal(dataStateLabel(), "synthetic");
  store.state = { source_mode: "", observations: [{ frames: [{ source_mode: "fixture" }] }] };
  assert.equal(dataStateLabel(), "fixture");
  assert.equal(dataStateClass(), "fixture");
  store.state = {};
  assert.equal(dataStateLabel(), "unknown");
  assert.equal(dataStateClass(), "degraded");
});

test("field and selection selectors handle populated and absent state", () => {
  store.state = {
    fields: { temperature: { values: [1, 2, 6] } },
    active_regions: [{ id: 7, lat_deg: 1, lon_deg: 2 }],
  };
  assert.deepEqual(fieldValues("temperature"), [1, 2, 6]);
  assert.equal(meanField("temperature"), 3);
  assert.equal(meanField("missing"), 0);
  store.selectedRegionId = 7;
  assert.equal(selectedRegion().id, 7);
  store.selectedRegionId = 8;
  assert.equal(selectedRegion(), null);
  store.selectedRegionId = null;
  assert.equal(selectedRegion(), null);
});

test("visible layers reflect the selected base and overlay controls", () => {
  store.state = {
    layers: [
      { id: "confidence", label: "Confidence", kind: "inferred" },
      { id: "active_regions", label: "Regions", kind: "observed" },
    ],
  };
  store.wavelength = "model";
  domNodes.get("layerConfidence").checked = true;
  domNodes.get("layerRegions").checked = true;
  assert.deepEqual(visibleLayers().map((x) => x.id), ["model", "confidence", "active_regions"]);
  assert.match(visibleLayerSummary(), /Synthetic model/);
  store.wavelength = "unknown-channel";
  domNodes.get("layerConfidence").checked = false;
  domNodes.get("layerRegions").checked = false;
  assert.equal(visibleLayerSummary(), "unknown-channel (observed)");
});

test("readiness labels and classes cover every contract state", () => {
  const cases = [
    [{ space_weather_operational: true }, "operational", "research-ready"],
    [{ research_learning_ready: true }, "research ready", "research-ready"],
    [{ status: "research_only" }, "research only", "research-only"],
    [{ status: "blocked" }, "blocked", "blocked"],
  ];
  for (const [readiness, label, cls] of cases) {
    store.state = { operational_readiness: readiness };
    assert.equal(readinessLabel(), label);
    assert.equal(readinessClass(), cls);
  }
});

test("feed labels and tones cover absent, late, degraded, failed, and unknown", () => {
  const cases = [
    [null, "not run", "blocked"],
    [{ status: "ok", next_recommended_run_utc: new Date(Date.now() - 8 * HOUR).toISOString() }, "overdue", "fixture"],
    [{ status: "degraded" }, "degraded", "fixture"],
    [{ status: "failed" }, "failed", "degraded"],
    [{ status: "aborted" }, "aborted", "degraded"],
    [{ status: "something-new" }, "unknown", "blocked"],
  ];
  for (const [status, label, cls] of cases) {
    store.feedStatus = status;
    assert.equal(feedStateLabel(), label);
    assert.equal(feedStateClass(), cls);
  }
});

test("region copy preserves coordinates, units, and explicit selection", () => {
  const region = {
    id: 42, lat_deg: -12.25, lon_deg: 130.75, flux_norm: 0.6,
    complexity: 0.9, area_msh: 340, tilt_deg: -3.2, confidence: 0.88,
  };
  assert.equal(regionLocation(region), "lat -12.3°, lon 130.8°");
  assert.match(selectedRegionSummary(region), /AR 42.*high \(0.90\).*340 MSH/);
  store.state = { active_regions: [region] };
  store.selectedRegionId = 42;
  assert.match(selectedRegionSentence(), /^Selected AR 42/);
  store.selectedRegionId = null;
  assert.equal(selectedRegionSentence(), "");
});

test("observation, adapter, signal, and layer summaries expose provenance", () => {
  store.wavelength = "model";
  domNodes.get("layerConfidence").checked = false;
  domNodes.get("layerRegions").checked = false;
  store.state = {};
  assert.match(observedSignalSummary(), /^No public/);
  assert.match(observationSummary(), /^No observation/);
  assert.match(adapterSummary(), /^No external/);
  assert.match(layerSummary(), /^No layer metadata/);

  store.state = {
    observations: [{
      frames: [{ source_mode: "live" }, { source_mode: "cached" }],
      adapter_health: [
        { id: "swpc-rtsw-mag-1m", state: "live" },
        { id: "swpc-rtsw-wind-1m", state: "missing" },
      ],
    }],
    observed_context: {
      space_weather_signals: {
        latest_kp: 3.4, latest_f107: 155.2,
        latest_goes_xray_flux: 0.000005, latest_solar_wind_speed_km_s: 433,
      },
      activity_proxy_sources: {
        solar_region_rows: 4, goes_xray_flares_7_day_rows: 2,
        planetary_k_index_rows: 8, f107_cm_flux_rows: 1,
      },
    },
    layers: [{ id: "model", label: "Model", kind: "synthetic" }],
  };
  assert.equal(observationFrames().length, 2);
  assert.match(observedSignalSummary(), /Kp 3.4.*F10.7 155.2.*solar wind 433 km\/s/);
  assert.match(observationSummary(), /2 observation frames.*4 SWPC region rows/);
  assert.match(adapterSummary(), /SWPC magnetometer is live.*SWPC solar wind is degraded.*swpc rtsw wind 1m/);
  assert.match(layerSummary(), /1 declared layer.*Currently visible: Synthetic model/);
});
