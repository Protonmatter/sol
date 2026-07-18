// Derived reads over the current snapshot in `store`. No DOM writes.

import { store } from "./store.js?v=8a19107712";
import { controls } from "./dom.js?v=8a19107712";
import { BASE_IMAGES } from "./config.js?v=8a19107712";
import {
  number, numberOrNa, compactNumberOrNa, plural, countBy, formatCounts,
  readableMode, humanizeId, complexityLabel
} from "./format.js?v=8a19107712";

export function fieldValues(id) {
  return store.state.fields?.[id]?.values || [];
}

export function meanField(id) {
  const values = fieldValues(id);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function selectedRegion() {
  const regions = store.state.active_regions || [];
  if (store.selectedRegionId != null) {
    return regions.find((region) => region.id === store.selectedRegionId) || null;
  }
  // (The old auto-select-most-complex branch tested activeMode === "explore", a surface
  // that no longer exists — it was unreachable dead code, so explicit selection is the
  // only path, matching the app's actual behaviour.)
  return null;
}

export function visibleLayers() {
  const layerMap = new Map((store.state.layers || []).map((layer) => [layer.id, layer]));
  const out = [];
  // The base solar image: the chosen wavelength channel, or the synthetic model.
  if (store.wavelength === "model") {
    out.push({ id: "model", label: "Synthetic model", kind: "synthetic" });
  } else {
    const cfg = BASE_IMAGES[store.wavelength];
    out.push({ id: store.wavelength, label: cfg ? cfg.label : store.wavelength, kind: "observed" });
  }
  // Overlays on top of whatever base.
  if (controls.confidence.checked) out.push(layerMap.get("confidence") || { id: "confidence", label: "Model confidence", kind: "degraded" });
  if (controls.regions.checked) out.push(layerMap.get("active_regions") || { id: "active_regions", label: "Active regions", kind: "synthetic" });
  return out;
}

export function visibleLayerSummary() {
  const layers = visibleLayers();
  if (!layers.length) return "none";
  return layers.map((layer) => `${layer.label || layer.id} (${layer.kind || "unknown"})`).join(", ");
}

export function observationFrames() {
  const frames = [];
  for (const report of store.state.observations || []) {
    if (Array.isArray(report.frames)) frames.push(...report.frames);
  }
  return frames;
}

export function dataStateLabel() {
  const mode = String(store.state.source_mode || "").toLowerCase();
  const frameModes = observationFrames().map((frame) => String(frame.source_mode || "").toLowerCase());
  const readinessState = store.state.operational_readiness?.data_state || {};
  if (mode.includes("degraded") || readinessState.cache_state === "missing") return "degraded";
  if (mode.includes("live") || frameModes.includes("live")) return "live";
  if (mode.includes("cached") || frameModes.includes("cached")) return "cached";
  if (mode.includes("fixture") || frameModes.includes("fixture")) return "fixture";
  if (mode.includes("synthetic")) return "synthetic";
  return "unknown";
}

export function dataStateClass() {
  const label = dataStateLabel();
  if (label === "live") return "live";
  if (label === "cached") return "cached";
  if (label === "fixture" || label === "synthetic") return "fixture";
  return "degraded";
}

export function readinessLabel() {
  const readiness = store.state.operational_readiness || {};
  if (readiness.space_weather_operational === true) return "operational";
  if (readiness.research_learning_ready === true) return "research ready";
  if (String(readiness.status || "").includes("research")) return "research only";
  return "blocked";
}

export function readinessClass() {
  const label = readinessLabel();
  if (label === "operational" || label === "research ready") return "research-ready";
  if (label === "research only") return "research-only";
  return "blocked";
}

// Hours the daily feed is past its own next_recommended_run_utc (minus a 6 h grace
// window for a merely-late run), or null when not overdue / not knowable. The feed
// status file records health AT GENERATION TIME — without this recheck a frozen
// 16-day-old "ok" renders as current health forever, which is exactly the kind of
// silent dishonesty the provenance labels exist to prevent. `nowMs` is injectable
// for tests.
export function feedOverdueHours(nowMs = Date.now()) {
  if (!store.feedStatus || !store.feedStatus.next_recommended_run_utc) return null;
  const due = Date.parse(store.feedStatus.next_recommended_run_utc);
  if (!Number.isFinite(due)) return null;
  const graceMs = 6 * 3600 * 1000;
  const overdueMs = nowMs - due - graceMs;
  return overdueMs > 0 ? overdueMs / 3600 / 1000 : null;
}

export function feedStateLabel() {
  if (!store.feedStatus) return "not run";
  if (store.feedStatus.status === "ok") {
    const overdue = feedOverdueHours();
    if (overdue !== null) {
      return overdue >= 48 ? `stale ${Math.floor(overdue / 24)}d` : "overdue";
    }
    return "daily ok";
  }
  if (store.feedStatus.status === "degraded") return "degraded";
  if (store.feedStatus.status === "failed") return "failed";
  if (store.feedStatus.status === "aborted") return "aborted";
  return "unknown";
}

export function feedStateClass() {
  const label = feedStateLabel();
  if (label === "daily ok") return "live";
  // A stale-but-healthy feed must not wear the healthy green: short overdue reads
  // amber ("fixture"), multi-day staleness reads like a failure ("degraded").
  if (label === "overdue") return "fixture";
  if (label.startsWith("stale")) return "degraded";
  if (label === "degraded") return "fixture";
  if (label === "failed" || label === "aborted") return "degraded";
  return "blocked";
}

export function regionLocation(region) {
  return `lat ${number(region.lat_deg, 1)}°, lon ${number(region.lon_deg, 1)}°`;
}

export function selectedRegionSummary(region) {
  return `AR ${region.id} is at ${regionLocation(region)} with normalized flux ${number(region.flux_norm, 2)}, complexity ${complexityLabel(region.complexity)}, area ${number(region.area_msh, 0)} MSH (millionths of the solar hemisphere), tilt ${number(region.tilt_deg, 1)}°, and confidence ${number(region.confidence, 2)}.`;
}

export function selectedRegionSentence() {
  const region = selectedRegion();
  if (!region) return "";
  return `Selected ${selectedRegionSummary(region)} `;
}

export function observedSignalSummary() {
  const signals = store.state.observed_context?.space_weather_signals || {};
  const parts = [];
  if (signals.latest_kp != null) parts.push(`Kp ${numberOrNa(signals.latest_kp, 1)}`);
  if (signals.latest_f107 != null) parts.push(`F10.7 ${numberOrNa(signals.latest_f107, 1)}`);
  if (signals.latest_goes_xray_flux != null) parts.push(`GOES/X-ray ${compactNumberOrNa(signals.latest_goes_xray_flux)}`);
  if (signals.latest_solar_wind_speed_km_s != null) parts.push(`solar wind ${numberOrNa(signals.latest_solar_wind_speed_km_s, 0)} km/s`);
  if (!parts.length) return "No public space-weather signal values are summarized in this snapshot.";
  return `Latest public signals: ${parts.join(", ")}.`;
}

function criticalAdapterText(health) {
  const mag = health.find((item) => item.id === "swpc-rtsw-mag-1m");
  const wind = health.find((item) => item.id === "swpc-rtsw-wind-1m");
  const parts = [];
  if (mag) parts.push(`SWPC magnetometer is ${readableMode(mag.state)}`);
  if (wind) parts.push(`SWPC solar wind is ${readableMode(wind.state)}`);
  return parts.length ? `${parts.join("; ")}. ` : "";
}

export function observationSummary() {
  const frames = observationFrames();
  if (!frames.length) return "No observation frames are loaded; the app is rendering synthetic state only.";
  const counts = countBy(frames.map((frame) => readableMode(frame.source_mode)));
  const observedContext = store.state.observed_context?.activity_proxy_sources || {};
  const contextParts = [];
  if (observedContext.solar_region_rows) contextParts.push(`${observedContext.solar_region_rows} SWPC region rows`);
  if (observedContext.goes_xray_flares_7_day_rows) contextParts.push(`${observedContext.goes_xray_flares_7_day_rows} GOES flare rows`);
  if (observedContext.planetary_k_index_rows) contextParts.push(`${observedContext.planetary_k_index_rows} Kp rows`);
  if (observedContext.f107_cm_flux_rows) contextParts.push(`${observedContext.f107_cm_flux_rows} F10.7 rows`);
  const sourceText = contextParts.length ? ` Context includes ${contextParts.join(", ")}.` : "";
  return `${frames.length} observation ${plural(frames.length, "frame")} loaded (${formatCounts(counts)}). ${observedSignalSummary()}${sourceText} These are public context layers, not operational truth.`;
}

export function adapterSummary() {
  const health = [];
  for (const observation of store.state.observations || []) {
    if (Array.isArray(observation.adapter_health)) health.push(...observation.adapter_health);
  }
  if (!health.length) return "No external adapters are attached; synthetic snapshot only.";
  const counts = countBy(health.map((item) => readableMode(item.state)));
  const unavailable = health.filter((item) => !["cached", "fixture", "live"].includes(readableMode(item.state)));
  const missingText = unavailable.length ? ` Missing or degraded: ${unavailable.map((item) => humanizeId(item.id)).join(", ")}.` : " No adapter failures are reported.";
  return `${health.length} source ${plural(health.length, "adapter")} tracked (${formatCounts(counts)}). ${criticalAdapterText(health)}${missingText}`;
}

export function layerSummary() {
  const layers = store.state.layers || [];
  if (!layers.length) return "No layer metadata is present in this snapshot.";
  const counts = countBy(layers.map((layer) => readableMode(layer.kind)));
  const visible = visibleLayers().map((layer) => `${layer.label || humanizeId(layer.id)} (${readableMode(layer.kind)})`);
  return `${layers.length} declared ${plural(layers.length, "layer")} (${formatCounts(counts)}). Currently visible: ${visible.join(", ") || "none"}. Synthetic and inferred layers come from the model; observed layers are retained as provenance context.`;
}
