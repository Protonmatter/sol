// Pure, immutable explanatory revision. No clock reads, DOM, I/O, or physical evolution.
import { projectSolarPoint, regionAnchor } from "./solarProjection.js?v=dcca6290db";

/** @param {any} input */
export function resolvePresentation(input) {
  const { snapshot = {}, wavelength = "model", imageState = "pending", feedStatus, timeline, liveEngineRun = false, dataError = null, nowMs = 0 } = input;
  const due = Date.parse(feedStatus?.next_recommended_run_utc || "");
  const freshness = Number.isFinite(due) ? (nowMs > due + 6 * 3600000 ? "stale" : "within_refresh_window") : "unknown";
  const observed = !timeline && !liveEngineRun && wavelength !== "model" && imageState === "live";
  const count = snapshot.active_regions?.length || 0;
  const visible = (snapshot.active_regions || []).filter(region => {
    const anchor = regionAnchor(region);
    return projectSolarPoint(anchor.lat_deg, anchor.lon_deg, snapshot.coordinates)?.visible;
  }).length;
  const sourceKind = observed ? "observed" : "synthetic";
  const unavailable = dataError && snapshot.schema_version !== "solar-state-snapshot.v3";
  const timeLabel = observed ? "Observed image — capture time unavailable" : timeline
    ? timeline.status === "unavailable" ? `Selected month ${timeline.months} unavailable · model elapsed ${snapshot.run?.time_seconds ?? "unknown"} s retained` : `Idealized cycle · month ${timeline.months}`
    : `Model elapsed time: ${Number.isFinite(snapshot.run?.time_seconds) ? snapshot.run.time_seconds + " s" : "unavailable"}`;
  const headline = timeline?.status === "unavailable" ? `Cycle month ${timeline.months} unavailable. Retaining the last valid model; this is not a frame for the selected month.`
    : unavailable ? "No validated snapshot is available. This is an illustrative fallback, not an observation."
    : observed ? "SDO observed image; model results are available separately. Capture time is not supplied by this browse image."
    : timeline ? `Idealized cycle, month ${timeline.months}. These ${count} modeled regions are generated.`
    : `${count} modeled region${count === 1 ? "" : "s"}; ${visible} in the model's visible hemisphere. Magnetic regions are synthetic${freshness === "stale" ? "; attached feed context is stale" : ""}.`;
  return Object.freeze({ sourceKind, freshness, availability: unavailable ? "unavailable" : dataError ? "last_valid" : "ready", timeLabel, headline,
    totalRegions: count, visibleRegions: visible, comparisonAllowed: false,
    comparisonReason: "Capture-epoch image registration is unavailable; model and observed views remain separate.",
    showModelOverlays: !observed, coordinateLabel: "Modeled anchors (not observed centroids)",
    scoreLabel: "Heuristic model score — not probability", operationalLabel: "Research and learning only — not operational forecasting",
    error: dataError, revision: `${snapshot.schema_version || "unavailable"}:${snapshot.run?.time_seconds ?? "unknown"}:${timeline?.months ?? "latest"}:${sourceKind}:${freshness}:${dataError || "ok"}` });
}

export function resolveSkyPresentation({ snapshot, observerLabel = "Example observer", actualProvider = "local", requestedProvider = "local", error = null }) {
  if (!snapshot) return Object.freeze({ sourceKind: "inferred", headline: "Choose a location and time to calculate your sky. Location stays on your device by default.", timeLabel: "No valid sky snapshot yet", availability: "unavailable", error });
  const unix = (snapshot.time.jd_utc - 2440587.5) * 86400;
  const date = new Date(unix * 1000);
  const above = snapshot.bodies.filter(body => body.alt_deg > 0).length;
  const scale = date.getUTCFullYear() < 1972 ? "UTC/UT approximation" : "UTC";
  return Object.freeze({ sourceKind: "inferred", headline: `${observerLabel}: ${above} objects above the geometric horizon. This does not guarantee visibility; weather, terrain and light pollution are not modeled.`,
    timeLabel: `${date.toISOString()} · ${scale}, proleptic Gregorian`, availability: error ? "last_valid" : "ready", actualProvider, requestedProvider, error,
    providerLabel: actualProvider === "local" ? "Computed on your device" : "Configured remote provider", aboveCount: above,
    operationalLabel: "Research and learning only", revision: `${snapshot.schema_version}:${snapshot.time.jd_utc}:${actualProvider}:${error || "ok"}` });
}

export function resolveSystemPresentation({ renderUnix, scene = "system", selected = null, hasSnapshot = true, error = null }) {
  const date = new Date(renderUnix * 1000);
  const timeLabel = !hasSnapshot ? "No valid System positions available" : scene === "system" ? (Number.isFinite(date.getTime()) ? `${date.toISOString()} · proleptic Gregorian` : "Render time unavailable") : "Illustrative galactic model clock — distinct from planetary epoch";
  return Object.freeze({ sourceKind: "inferred", headline: !hasSnapshot ? "System engine unavailable. Retry to load model positions." : scene === "system" ? `${selected ? selected + " selected. " : ""}Model positions; body sizes may be enlarged for visibility. Select an object for its scale and evidence.` : "Explore the galactic context. Distances, display scale and illustrative motion are labeled separately.", timeLabel, availability: !hasSnapshot ? "unavailable" : error ? "last_valid" : "ready", error, revision: `${scene}:${renderUnix}:${selected || "none"}:${hasSnapshot}:${error || "ok"}` });
}
