"use strict";

const FALLBACK_STATE = {
  schema_version: "solar-state-snapshot.v1",
  model_version: "0.1.1",
  source_mode: "degraded",
  operational_use: false,
  calibration_state: "normalized magnetic units; physical Gauss/Mx calibration not asserted",
  run: { seed: 42, steps: 1, dt_hours: 1, activity_index: 0.9, time_seconds: 3600, mode: "DegradedSyntheticFallback" },
  grid: { lon_count: 8, lat_count: 4, dlon_deg: 45, dlat_deg: 45 },
  layers: [
    { id: "br_normalized", label: "Radial magnetic field", kind: "synthetic", units: "normalized magnetic field" },
    { id: "continuum_proxy", label: "Continuum brightness proxy", kind: "inferred", units: "relative intensity" },
    { id: "confidence", label: "Model confidence", kind: "degraded", units: "0..1" }
  ],
  fields: {
    br_normalized: { units: "normalized magnetic field", values: [0, 0.3, -0.2, 0.1, -0.4, 0.2, 0.1, 0, 0.1, -0.7, 0.8, 0.2, -0.1, 0.4, -0.3, 0.1, 0, 0.2, -0.1, 0.1, 0.3, -0.2, 0.2, 0, 0, 0, 0.1, -0.1, 0, 0, 0.1, 0] },
    continuum_proxy: { units: "relative intensity", values: [1, 0.9, 0.96, 1, 0.82, 0.94, 1.02, 1, 1, 0.35, 0.28, 0.92, 1, 0.86, 0.96, 1, 1, 0.95, 1, 1.02, 0.9, 0.95, 1, 1, 1, 1, 1.02, 1, 1, 1, 1, 1] },
    confidence: { units: "0..1", values: [0.2, 0.4, 0.4, 0.2, 0.5, 0.4, 0.3, 0.2, 0.2, 0.55, 0.55, 0.3, 0.2, 0.45, 0.4, 0.2, 0.2, 0.35, 0.3, 0.2, 0.4, 0.3, 0.2, 0.2, 0.2, 0.2, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2] }
  },
  active_regions: [
    { id: 1, lat_deg: 14, lon_deg: 110, flux_norm: 0.8, area_msh: 900, tilt_deg: 12, complexity: 0.7, confidence: 0.65 },
    { id: 2, lat_deg: -18, lon_deg: 240, flux_norm: 0.6, area_msh: 650, tilt_deg: -9, complexity: 0.55, confidence: 0.6 }
  ],
  learning: {
    cycle_stage: "solar maximum",
    plain_language_insight: "Fallback data is active; load a generated snapshot for the research view."
  },
  operational_readiness: {
    schema_version: "operational-readiness.v1",
    status: "degraded_fallback",
    research_learning_ready: false,
    space_weather_operational: false,
    data_state: {
      source_mode: "degraded",
      observation_mode: "none",
      cache_state: "missing"
    },
    gates: [
      { id: "snapshot_contract", label: "Snapshot contract valid", passed: false },
      { id: "calibrated_physical_units", label: "Calibrated physical units", passed: false },
      { id: "historical_validation", label: "Historical validation", passed: false },
      { id: "operational_monitoring", label: "Operational monitoring", passed: false }
    ],
    blockers: ["Fallback state only; generate or replay a validated snapshot."]
  },
  observations: [],
  warnings: ["Fallback state rendered because apps/web/data/latest-state.json was unavailable."]
};

const MODE_COPY = {
  today: ["Today on the Sun", "A plain-language snapshot of where the Sun is in its cycle and what is happening on the side facing us right now."],
  explore: ["Explore the Sun", "Toggle layers, then click any marker to inspect a sunspot group's location, size, magnetic complexity, and how confident the model is."],
  weather: ["Space Weather", "How today's solar activity maps to things people feel on Earth — aurora, GPS, radio, and satellites. A learning view, not an alert service."],
  research: ["Research", "The model behind the picture: the equations it runs, where its data comes from, source-adapter health, and the gates that still block operational forecasting."]
};

const APPLICATION_COPY = {
  today: {
    title: "Where the Sun is now",
    text: "The Sun runs an ~11-year cycle from quiet (minimum) to active (maximum). More sunspot groups means more flares and more aurora.",
    signals: ["stage", "regions", "confidence"]
  },
  explore: {
    title: "Inspect active regions",
    text: "Each marker is a sunspot group. Click one to see its location, magnetic complexity, area, and the model's confidence.",
    signals: ["selected AR", "complexity", "confidence"]
  },
  weather: {
    title: "Space-weather impact",
    text: "Public SWPC indices map to impact categories you may have heard of. Shown for learning only — this app issues no warnings.",
    signals: ["Kp", "F10.7", "GOES/X-ray", "solar wind"]
  },
  research: {
    title: "Model bench & provenance",
    text: "Seeded simulations, immutable snapshots, provenance labels, adapter health, and golden checks make algorithm changes auditable.",
    signals: ["schema", "provenance", "golden tests"]
  }
};

// Plain-language definitions surfaced via the ? affordances and legend/signal chips.
const GLOSSARY = {
  "active-region": ["Active region", "A magnetically intense area on the Sun, usually marked by a sunspot group. Active regions are where flares and coronal mass ejections come from."],
  "br": ["Br — radial magnetic field", "How strongly the magnetic field points out of or into the surface at a spot. Shown here in normalized units, not calibrated Gauss."],
  "confidence": ["Confidence", "How much the model trusts the value at a spot, from 0 (low) to 1 (high). It drops where data is sparse or the field changes quickly."],
  "continuum": ["Continuum", "Ordinary visible (white) light from the Sun's surface. Sunspots look dark in continuum because they are cooler than their surroundings."],
  "magnetogram": ["Magnetogram", "A map of the surface magnetic field. Opposite magnetic polarities (north/south) are drawn as opposite colors."],
  "kp": ["Kp index", "A 0–9 scale of global geomagnetic activity. Higher Kp means stronger geomagnetic storms and aurora visible farther from the poles."],
  "f107": ["F10.7", "The Sun's radio brightness at 10.7 cm wavelength — a long-running, reliable proxy for overall solar activity."],
  "goes-xray": ["GOES X-ray flux", "Solar X-ray brightness measured by the GOES satellites. Spikes mark solar flares, graded C, M, and X by strength."],
  "solar-wind": ["Solar wind", "The constant stream of charged particles flowing off the Sun. Faster, denser wind can drive geomagnetic storms at Earth."],
  "stage-minimum": ["Solar minimum", "The calm low point of the ~11-year cycle. Few or no sunspots, few flares, and aurora are rare and stay near the poles."],
  "stage-rising": ["Rising phase", "Activity climbs out of minimum: sunspots grow more frequent and appear at mid-latitudes. Flares and aurora become more common."],
  "stage-maximum": ["Solar maximum", "The busy peak of the cycle. The most sunspots, the most flares and coronal mass ejections, and the best chance of aurora far from the poles."],
  "stage-declining": ["Declining phase", "Activity winds down toward the next minimum. Sunspots become less frequent and drift toward the Sun's equator."]
};

const SIGNAL_TERMS = { "Kp": "kp", "F10.7": "f107", "GOES/X-ray": "goes-xray", "solar wind": "solar-wind" };
const LEGEND_TERMS = { continuum_proxy: "continuum", br_normalized: "magnetogram", confidence: "confidence", active_regions: "active-region" };

// Which panels each surface reveals. "today" is the beginner glance (none of these).
const MANAGED_PANELS = [".layer-controls", ".layer-legend", ".metric-grid", ".mode-copy", ".selection-panel", ".application-panel", ".research-panel"];
const SURFACE_PANELS = {
  today: [],
  explore: [".layer-controls", ".layer-legend", ".metric-grid", ".mode-copy", ".selection-panel"],
  weather: [".metric-grid", ".mode-copy", ".application-panel"],
  research: [".layer-controls", ".layer-legend", ".metric-grid", ".mode-copy", ".selection-panel", ".application-panel", ".research-panel"]
};

let state = FALLBACK_STATE;
let feedStatus = null;
let activeMode = "today";
let selectedRegionId = null;
let projectedRegions = [];
let projectedButterflyRegions = [];
let activeBaseKind = "synthetic";
let activeBaseLabel = "synthetic photosphere";
let liveState = FALLBACK_STATE;
let seriesFrames = [];
let seriesManifest = null;
let timelineIndex = -1; // -1 = live "now"; otherwise an index into seriesFrames
let playTimer = 0;

// Real, recognizable Sun imagery (NASA SDO latest browse frames). These are the
// observed photosphere base the model layers are composited onto. The disk
// geometry below was measured from the 1024px source: the Sun is centered with
// radius = 0.4565 * width. Loaded without crossOrigin (display-only draw; the
// disk canvas is never read back, so a tainted canvas is fine).
const BASE_IMAGES = {
  continuum: {
    url: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIC.jpg",
    label: "SDO/HMI continuum",
    centerFrac: 0.5,
    radiusFrac: 0.4565
  },
  magnetogram: {
    url: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIB.jpg",
    label: "SDO/HMI magnetogram",
    centerFrac: 0.5,
    radiusFrac: 0.4565
  }
};
const baseImageCache = {};

function loadBaseImage(key) {
  if (baseImageCache[key]) return baseImageCache[key];
  const cfg = BASE_IMAGES[key];
  if (!cfg) return null;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => renderAll();
  img.onerror = () => { baseImageCache[key].failed = true; };
  img.src = cfg.url;
  const entry = { img, cfg, failed: false };
  baseImageCache[key] = entry;
  return entry;
}

function currentBaseImage() {
  // Cycle playback is a synthetic model, not today's Sun — render it synthetically.
  if (timelineIndex >= 0) return null;
  // Prefer the white-light continuum photosphere as the observed base when the
  // Continuum layer is on; fall back to the magnetogram if only it is selected.
  let key = null;
  if (controls.continuum.checked) key = "continuum";
  else if (controls.magnetogram.checked) key = "magnetogram";
  if (!key) return null;
  const entry = loadBaseImage(key);
  if (entry && !entry.failed && entry.img.complete && entry.img.naturalWidth > 0) return entry;
  return null;
}

const controls = {
  continuum: document.getElementById("layerContinuum"),
  magnetogram: document.getElementById("layerMagnetogram"),
  confidence: document.getElementById("layerConfidence"),
  regions: document.getElementById("layerRegions")
};

async function loadState() {
  try {
    const response = await fetch("data/latest-state.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    state = await response.json();
  } catch (error) {
    state = FALLBACK_STATE;
  }
  liveState = state;
  feedStatus = await loadFeedStatus();
  renderAll();
  maybeAutoStartTour();
  loadSeries();
}

async function loadSeries() {
  try {
    const response = await fetch("data/series/manifest.json", { cache: "no-store" });
    if (!response.ok) return;
    seriesManifest = await response.json();
    const frames = await Promise.all(
      (seriesManifest.frames || []).map((entry) =>
        fetch(`data/series/${entry.file}`, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null))
      )
    );
    seriesFrames = frames.filter(Boolean);
    const scrubber = document.getElementById("timeScrubber");
    if (scrubber && seriesFrames.length) scrubber.max = String(seriesFrames.length - 1);
    drawButterfly();
  } catch (error) {
    seriesFrames = [];
  }
}

function setTimelineFrame(index) {
  if (!seriesFrames.length) return;
  timelineIndex = Math.max(0, Math.min(seriesFrames.length - 1, index));
  state = seriesFrames[timelineIndex];
  selectedRegionId = null;
  const scrubber = document.getElementById("timeScrubber");
  if (scrubber) scrubber.value = String(timelineIndex);
  renderAll();
  updateTimeFrameLabel();
}

function goLive() {
  stopPlay();
  timelineIndex = -1;
  state = liveState;
  selectedRegionId = null;
  renderAll();
  updateTimeFrameLabel();
}

function playStep() {
  if (!seriesFrames.length) return;
  const next = timelineIndex + 1 >= seriesFrames.length ? 0 : timelineIndex + 1;
  setTimelineFrame(next);
}

function startPlay() {
  if (!seriesFrames.length) return;
  if (timelineIndex < 0) setTimelineFrame(0);
  stopPlay();
  playTimer = window.setInterval(playStep, 1100);
  updatePlayButton(true);
}

function stopPlay() {
  if (playTimer) {
    window.clearInterval(playTimer);
    playTimer = 0;
  }
  updatePlayButton(false);
}

function togglePlay() {
  if (playTimer) stopPlay();
  else startPlay();
}

function updatePlayButton(playing) {
  const button = document.getElementById("playToggle");
  if (button) button.textContent = playing ? "❚❚ Pause" : "▶ Play cycle";
}

function updateTimeFrameLabel() {
  const label = document.getElementById("timeFrameLabel");
  if (!label) return;
  if (timelineIndex < 0) {
    label.textContent = "Live: today's Sun (NASA SDO)";
    return;
  }
  const meta = (seriesManifest && seriesManifest.frames && seriesManifest.frames[timelineIndex]) || {};
  const stage = state.learning?.cycle_stage || meta.stage || "cycle";
  const months = meta.months != null ? meta.months : "?";
  label.textContent = `Cycle model — ${stage}, ~${months} months in (synthetic)`;
}

async function loadFeedStatus() {
  try {
    const response = await fetch("data/feed-status.json", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

function renderAll() {
  applySurfaceVisibility();
  updateText();
  drawSolarDisk();
  drawButterfly();
}

function applySurfaceVisibility() {
  const panel = document.querySelector(".control-panel");
  if (panel) panel.setAttribute("data-surface", activeMode);
  const show = new Set(SURFACE_PANELS[activeMode] || []);
  for (const selector of MANAGED_PANELS) {
    const node = document.querySelector(selector);
    if (node) node.classList.toggle("surface-hide", !show.has(selector));
  }
  const research = document.querySelector(".research-panel");
  if (research) research.open = activeMode === "research";
}

function updateText() {
  const run = state.run || {};
  const fields = state.fields || {};
  const brValues = fieldValues("br_normalized");
  const confidenceValues = fieldValues("confidence");
  const brMax = brValues.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const confidenceMean = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : 0;
  const mode = MODE_COPY[activeMode];

  text("cycleStage", state.learning?.cycle_stage || stageFromActivity(run.activity_index || 0));
  textWithTitle("sourceMode", dataStateLabel(), state.source_mode || "unknown");
  text("runTime", `${((run.time_seconds || 0) / 86400).toFixed(2)} days`);
  text("plainInsight", modeInsight());
  text("regionCount", String((state.active_regions || []).length));
  text("brMax", brMax.toFixed(3));
  text("confidenceMean", confidenceMean.toFixed(3));
  text("schemaVersion", state.schema_version || "unknown");
  text("modeTitle", mode[0]);
  text("modeText", mode[1]);
  text("journeyTitle", state.learning?.cycle_stage || "Solar journey");
  text("journeyText", mode[1]);
  text("calibrationState", state.calibration_state || "not reported");
  text("layerLabels", layerSummary());
  text("observationState", observationSummary());
  text("adapterHealth", adapterSummary());
  text("feedHealth", feedHealthSummary());
  renderOperationalReadinessChecklist();
  text("warningList", (state.warnings || []).join("; ") || "none");
  updateSnapshotSummary(brMax, confidenceMean);
  updateLayerLegend();
  updateApplicationPanel();
  updateSelectionText();
  updateStageRail();

  if (!fields.br_normalized || !fields.continuum_proxy) {
    text("plainInsight", "Snapshot is missing expected fields; degraded fallback rendering is active.");
  }
}

function modeInsight() {
  if (activeMode === "today") return beginnerCycleInsight();
  if (activeMode === "explore") return "Click any marker on the Sun to inspect that sunspot group. Use the layer toggles to add or remove the magnetic-field and confidence overlays.";
  if (activeMode === "weather") return weatherInsight();
  if (activeMode === "research") return "This view shows what the model is and is not: the equations it runs, where its data comes from, and what still blocks operational forecasting.";
  return beginnerCycleInsight();
}

function weatherInsight() {
  const signals = state.observed_context?.space_weather_signals || {};
  return `SWPC context: Kp ${numberOrNa(signals.latest_kp, 1)}, F10.7 ${numberOrNa(signals.latest_f107, 1)}, GOES/X-ray ${compactNumberOrNa(signals.latest_goes_xray_flux)}, wind ${numberOrNa(signals.latest_solar_wind_speed_km_s, 0)} km/s. Learning view only.`;
}

// Plain-language, no-jargon first impression for the default (Cycle) view.
// The dense SWPC-provenance string still lives in the Research panel (L3).
const STAGE_PLAIN = {
  "solar minimum": "its quietest point in the 11-year sunspot cycle",
  "rising or declining phase": "ramping between quiet and active years",
  "solar maximum": "its 11-year peak, when sunspots are most common"
};

function beginnerCycleInsight() {
  const stage = state.learning?.cycle_stage || stageFromActivity(state.run?.activity_index || 0);
  const count = (state.active_regions || []).length;
  const plain = STAGE_PLAIN[String(stage).toLowerCase()] || "an active part of its cycle";
  const are = count === 1 ? "is" : "are";
  return `The Sun is near ${stage} — ${plain}. Right now there ${are} ${count} active ${plural(count, "region")} (sunspot groups) on the side facing us; each marker on the disk is one of them.`;
}

function updateStageRail() {
  const stage = String(state.learning?.cycle_stage || stageFromActivity(state.run?.activity_index || 0)).toLowerCase();
  let current = "maximum";
  if (stage.includes("min")) current = "minimum";
  else if (stage.includes("declin")) current = "declining";
  else if (stage.includes("rising")) current = "rising";
  else if (stage.includes("max")) current = "maximum";
  document.querySelectorAll("#stageRail .stage-step").forEach((el) => {
    el.classList.toggle("active", el.dataset.stage === current);
  });
}

function updateSnapshotSummary(brMax, confidenceMean) {
  const regions = state.active_regions || [];
  const stage = state.learning?.cycle_stage || stageFromActivity(state.run?.activity_index || 0);
  const visible = visibleLayerSummary();
  const dataLabel = dataStateLabel();
  const readiness = readinessLabel();
  text(
    "summaryPrimary",
    `${stage}: ${regions.length} active regions, ${dataLabel} context, mean confidence ${confidenceMean.toFixed(2)}.`
  );
  text(
    "summaryDetail",
    `Max normalized |Br| is ${brMax.toFixed(2)}. Visible layers: ${visible}. ${selectedRegionSentence()}Readiness: ${readiness}; space-weather operations remain gated.`
  );
  setPill("dataState", `data: ${dataLabel}`, dataStateClass());
  setPill("ingestState", `feed: ${feedStateLabel()}`, feedStateClass());
  setPill("readinessState", `readiness: ${readiness}`, readinessClass());
}

function updateLayerLegend() {
  const legend = document.getElementById("layerLegend");
  if (!legend) return;
  legend.textContent = "";
  const layers = visibleLayers();
  if (!layers.length) {
    const chip = document.createElement("span");
    chip.className = "legend-chip degraded";
    chip.textContent = "no rendered layers";
    legend.appendChild(chip);
    return;
  }
  for (const layer of layers) {
    const chip = document.createElement("span");
    chip.className = `legend-chip ${layer.kind || "degraded"}`;
    chip.textContent = `${layer.label || layer.id}: ${layer.kind || "unknown"}`;
    const term = LEGEND_TERMS[layer.id];
    if (term) {
      chip.setAttribute("data-term", term);
      chip.setAttribute("tabindex", "0");
      chip.setAttribute("role", "button");
    }
    legend.appendChild(chip);
  }
}

function updateApplicationPanel() {
  const app = APPLICATION_COPY[activeMode] || APPLICATION_COPY.cycle;
  text("applicationTitle", app.title);
  text("applicationText", app.text);
  const target = document.getElementById("applicationSignals");
  if (!target) return;
  target.textContent = "";
  const signalValues = signalLabels(app.signals);
  app.signals.forEach((signal, index) => {
    const chip = document.createElement("span");
    chip.className = "signal-chip";
    chip.textContent = signalValues[index];
    const term = SIGNAL_TERMS[signal];
    if (term) {
      chip.setAttribute("data-term", term);
      chip.setAttribute("tabindex", "0");
      chip.setAttribute("role", "button");
      chip.style.cursor = "help";
    }
    target.appendChild(chip);
  });
}

function signalLabels(signals) {
  const context = state.observed_context || {};
  const weather = context.space_weather_signals || {};
  const selected = selectedRegion();
  return signals.map((signal) => {
    if (signal === "stage") return state.learning?.cycle_stage || "stage n/a";
    if (signal === "regions") return `${(state.active_regions || []).length} regions`;
    if (signal === "confidence") return `confidence ${meanField("confidence").toFixed(2)}`;
    if (signal === "selected AR") return selected ? `AR ${selected.id}` : "no region selected";
    if (signal === "complexity") return selected ? `complexity ${number(selected.complexity, 2)}` : "complexity n/a";
    if (signal === "Kp") return `Kp ${numberOrNa(weather.latest_kp, 1)}`;
    if (signal === "F10.7") return `F10.7 ${numberOrNa(weather.latest_f107, 1)}`;
    if (signal === "GOES/X-ray") return `GOES ${compactNumberOrNa(weather.latest_goes_xray_flux)}`;
    if (signal === "solar wind") return `wind ${numberOrNa(weather.latest_solar_wind_speed_km_s, 0)} km/s`;
    return signal;
  });
}

function updateSelectionText() {
  const region = selectedRegion();
  const panel = document.querySelector(".selection-panel");
  if (!region) {
    panel?.classList.remove("selected");
    text("selectionTitle", "Click an active region");
    text("selectionText", "No active region is selected yet. Click a marker on the solar disk or switch to Regions mode to inspect one.");
    return;
  }
  panel?.classList.add("selected");
  text("selectionTitle", `AR ${region.id}: ${regionLocation(region)}`);
  text("selectionText", selectedRegionSummary(region));
}

function drawSolarDisk() {
  const canvas = document.getElementById("solarCanvas");
  resizeCanvasToDisplaySize(canvas, 720);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;

  projectedRegions = [];
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.35);
  sky.addColorStop(0, "#16110c");
  sky.addColorStop(0.62, "#050506");
  sky.addColorStop(1, "#010102");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const base = currentBaseImage();
  if (base) {
    drawObservedBase(ctx, base, cx, cy, radius);
    activeBaseKind = "observed";
    activeBaseLabel = base.cfg.label;
  } else {
    drawSunBase(ctx, cx, cy, radius);
    drawSurfaceTexture(ctx, cx, cy, radius);
    activeBaseKind = "synthetic";
    activeBaseLabel = "synthetic photosphere";
  }
  drawMagneticPatches(ctx, cx, cy, radius);

  drawModeOverlay(ctx, cx, cy, radius);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(247,183,51,0.82)";
  ctx.lineWidth = Math.max(1.5, width * 0.0025);
  ctx.stroke();

  if (controls.regions.checked) {
    drawActiveRegions(ctx, cx, cy, radius);
  }

  const observed = activeBaseKind === "observed";
  text("baseLabel", `Base: ${activeBaseLabel} (${observed ? "observed" : "synthetic"})`);
  const baseNode = document.getElementById("baseLabel");
  if (baseNode) baseNode.className = `base-label ${observed ? "observed" : "synthetic"}`;
}

function drawObservedBase(ctx, entry, cx, cy, radius) {
  const { img, cfg } = entry;
  const srcSize = img.naturalWidth;
  const scale = radius / (srcSize * cfg.radiusFrac);
  const srcCenter = srcSize * cfg.centerFrac;
  const destSize = srcSize * scale;
  const destX = cx - srcCenter * scale;
  const destY = cy - srcCenter * scale;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, destX, destY, destSize, destSize);
  // Soften the clipped limb so the real disk blends into the dark sky.
  const limb = ctx.createRadialGradient(cx, cy, radius * 0.74, cx, cy, radius);
  limb.addColorStop(0, "rgba(0,0,0,0)");
  limb.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = limb;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawSunBase(ctx, cx, cy, radius) {
  const disk = ctx.createRadialGradient(cx - radius * 0.26, cy - radius * 0.32, radius * 0.12, cx, cy, radius);
  disk.addColorStop(0, controls.continuum.checked ? "#ffd27a" : "#f6aa45");
  disk.addColorStop(0.36, controls.continuum.checked ? "#ff8d24" : "#e67816");
  disk.addColorStop(0.74, "#d86b12");
  disk.addColorStop(1, "#7a300c");
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = disk;
  ctx.fill();
}

function drawSurfaceTexture(ctx, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const seed = state.run?.seed || 42;
  for (let i = 0; i < 850; i += 1) {
    const a = hash01(i * 3 + seed) * Math.PI * 2;
    const rr = Math.sqrt(hash01(i * 7 + seed)) * radius * 0.98;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    const limb = 1 - Math.min(1, rr / radius);
    const size = radius * (0.0035 + 0.0075 * hash01(i * 11 + seed));
    const bright = hash01(i * 13 + seed) > 0.48;
    ctx.globalAlpha = (bright ? 0.09 : 0.07) * (0.55 + limb);
    ctx.fillStyle = bright ? "#ffd58f" : "#9d390c";
    ctx.beginPath();
    ctx.ellipse(x, y, size * 1.7, size, a, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#ffd275";
  ctx.lineWidth = Math.max(1, radius * 0.004);
  for (let i = 0; i < 34; i += 1) {
    const y = cy - radius * 0.74 + i * radius * 0.045;
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.86, y);
    ctx.bezierCurveTo(cx - radius * 0.32, y + Math.sin(i) * 10, cx + radius * 0.35, y - Math.cos(i) * 12, cx + radius * 0.86, y);
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawMagneticPatches(ctx, cx, cy, radius) {
  if (!controls.magnetogram.checked && !controls.confidence.checked && !controls.continuum.checked) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  // Let the real photosphere read through the synthetic model overlay.
  if (activeBaseKind === "observed") ctx.globalAlpha = 0.55;

  for (const region of state.active_regions || []) {
    const point = projectRegion(region, cx, cy, radius);
    if (!point || point.z < -0.2) continue;
    const baseSize = radius * (0.032 + 0.07 * clamp(region.complexity || 0.35, 0, 1));
    const tilt = ((region.tilt_deg || 0) / 180) * Math.PI;
    const dx = Math.cos(tilt) * baseSize * 0.72;
    const dy = -Math.sin(tilt) * baseSize * 0.38;
    const flux = clamp(region.flux_norm || 0.5, 0.2, 1.5);

    if (controls.continuum.checked && activeBaseKind !== "observed") {
      drawSpot(ctx, point.x, point.y, baseSize * 0.42 * flux, "rgba(55,18,8,0.48)", "rgba(55,18,8,0)");
    }
    if (controls.magnetogram.checked) {
      drawSpot(ctx, point.x + dx, point.y + dy, baseSize * flux, "rgba(90,105,220,0.5)", "rgba(90,105,220,0)");
      drawSpot(ctx, point.x - dx, point.y - dy, baseSize * flux, "rgba(236,64,126,0.48)", "rgba(236,64,126,0)");
    }
    if (controls.confidence.checked) {
      drawSpot(ctx, point.x, point.y, baseSize * 1.35, "rgba(97,224,155,0.22)", "rgba(97,224,155,0)");
    }
  }

  ctx.restore();
}

function drawSpot(ctx, x, y, radius, inner, outer) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawActiveRegions(ctx, cx, cy, radius) {
  const selected = selectedRegion();
  for (const region of state.active_regions || []) {
    const point = projectRegion(region, cx, cy, radius);
    if (!point || point.z < -0.15) continue;
    projectedRegions.push({ ...point, region });
    const isSelected = selected && selected.id === region.id;
    const size = (activeMode === "explore" ? 6 : 4) + 12 * clamp(region.complexity || 0.3, 0, 1);
    ctx.beginPath();
    ctx.arc(point.x, point.y, size + (isSelected ? 5 : 0), 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "rgba(247,183,51,0.25)" : "rgba(64,214,200,0.18)";
    ctx.fill();
    ctx.lineWidth = isSelected ? 3.5 : 2;
    ctx.strokeStyle = isSelected ? "#f7b733" : region.flux_norm >= 0.7 ? "#d958a7" : "#40d6c8";
    ctx.stroke();

    if (activeMode === "explore" && (isSelected || region.complexity > 0.78)) {
      ctx.fillStyle = "rgba(246,243,232,0.92)";
      ctx.font = `${Math.max(11, radius * 0.032)}px Segoe UI, sans-serif`;
      ctx.fillText(`AR ${region.id}`, point.x + size + 5, point.y - size - 4);
    }
  }
}

function drawModeOverlay(ctx, cx, cy, radius) {
  if (activeMode === "today") {
    drawLatitudeBands(ctx, cx, cy, radius, "rgba(247,183,51,0.12)");
  } else if (activeMode === "explore") {
    drawLatitudeBands(ctx, cx, cy, radius, "rgba(247,183,51,0.12)");
    drawGeometryOverlay(ctx, cx, cy, radius);
  } else if (activeMode === "weather") {
    drawWeatherOverlay(ctx, cx, cy, radius);
  } else if (activeMode === "research") {
    drawSchemaOverlay(ctx, cx, cy, radius);
  }
}

function drawLatitudeBands(ctx, cx, cy, radius, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (const lat of [-40, -20, 0, 20, 40]) {
    const y = cy - radius * Math.sin((lat / 180) * Math.PI);
    const width = radius * Math.cos((lat / 180) * Math.PI);
    ctx.beginPath();
    ctx.ellipse(cx, y, width, Math.max(4, radius * 0.012), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawWeatherOverlay(ctx, cx, cy, radius) {
  const frames = observationFrames();
  ctx.strokeStyle = "rgba(64,214,200,0.72)";
  ctx.fillStyle = "rgba(64,214,200,0.9)";
  ctx.lineWidth = Math.max(2, radius * 0.008);
  for (let i = 0; i < 5; i += 1) {
    const y = cy - radius * 0.42 + i * radius * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx + radius * 0.72, y);
    ctx.quadraticCurveTo(cx + radius * 1.05, y + radius * 0.08, cx + radius * 1.28, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + radius * 1.28, y);
    ctx.lineTo(cx + radius * 1.22, y - 6);
    ctx.lineTo(cx + radius * 1.22, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  drawCanvasLabel(ctx, cx - radius * 0.95, cy + radius * 0.78, `SWPC frames: ${frames.length || 0}`);
}

function drawGeometryOverlay(ctx, cx, cy, radius) {
  drawLatitudeBands(ctx, cx, cy, radius, "rgba(246,243,232,0.2)");
  ctx.strokeStyle = "rgba(246,243,232,0.18)";
  ctx.lineWidth = 1;
  for (const lon of [-60, -30, 0, 30, 60]) {
    const x = cx + radius * Math.sin((lon / 180) * Math.PI);
    const width = radius * Math.cos((lon / 180) * Math.PI);
    ctx.beginPath();
    ctx.ellipse(x, cy, Math.max(5, width * 0.035), radius, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(247,183,51,0.65)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * 1.15, cy - radius * 0.18);
  ctx.stroke();
  drawCanvasLabel(ctx, cx + radius * 0.46, cy - radius * 0.3, "observer");
}

function drawSchemaOverlay(ctx, cx, cy, radius) {
  const nodes = [
    ["SWPC", -0.72, -0.58, "#40d6c8"],
    ["Helioviewer", 0.42, -0.72, "#f7b733"],
    ["JPL geometry", 0.62, 0.62, "#d958a7"]
  ];
  for (const [label, ox, oy, color] of nodes) {
    const x = cx + radius * ox;
    const y = cy + radius * oy;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.065, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,9,12,0.72)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    drawCanvasLabel(ctx, x + radius * 0.08, y + 4, label);
  }
}

function drawClassroomOverlay(ctx, cx, cy, radius) {
  const steps = ["Observe", "Infer", "Validate", "Caveat"];
  steps.forEach((step, index) => {
    const x = cx - radius * 0.74 + index * radius * 0.5;
    const y = cy + radius * 0.86;
    ctx.fillStyle = "rgba(8,9,12,0.72)";
    ctx.fillRect(x - 6, y - 18, radius * 0.36, 28);
    ctx.strokeStyle = index === 0 ? "#f7b733" : "rgba(246,243,232,0.24)";
    ctx.strokeRect(x - 6, y - 18, radius * 0.36, 28);
    ctx.fillStyle = "#f6f3e8";
    ctx.font = `${Math.max(10, radius * 0.03)}px Segoe UI, sans-serif`;
    ctx.fillText(step, x, y);
  });
}

function drawCanvasLabel(ctx, x, y, label) {
  ctx.font = "13px Segoe UI, sans-serif";
  const metrics = ctx.measureText(label);
  ctx.fillStyle = "rgba(8,9,12,0.72)";
  ctx.fillRect(x - 6, y - 15, metrics.width + 12, 22);
  ctx.fillStyle = "#f6f3e8";
  ctx.fillText(label, x, y);
}

function drawButterfly() {
  const canvas = document.getElementById("butterflyCanvas");
  resizeCanvasToDisplaySize(canvas, 980);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  projectedButterflyRegions = [];
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, width, height);
  if (seriesFrames.length) {
    drawButterflySeries(ctx, width, height);
  } else {
    drawButterflySnapshot(ctx, width, height);
  }
}

// A real butterfly diagram: sunspot latitude (y) against cycle time (x), one
// column per series frame. The wings start at high latitude and migrate toward
// the equator as the cycle advances.
function drawButterflySeries(ctx, width, height) {
  const padLeft = 38;
  const padRight = 14;
  const top = 14;
  const bottom = height - 24;
  const plotH = bottom - top;
  const count = seriesFrames.length;
  const latToY = (lat) => top + (1 - (lat + 45) / 90) * plotH;
  const frameToX = (i) => padLeft + (count === 1 ? 0.5 : i / (count - 1)) * (width - padLeft - padRight);

  ctx.strokeStyle = "#313742";
  ctx.lineWidth = 1;
  for (const lat of [45, 0, -45]) {
    const y = latToY(lat);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
  }

  if (timelineIndex >= 0) {
    const x = frameToX(timelineIndex);
    ctx.strokeStyle = "rgba(247,183,51,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  seriesFrames.forEach((frame, i) => {
    const x = frameToX(i);
    for (const region of frame.active_regions || []) {
      const lat = region.lat_deg || 0;
      const y = latToY(lat);
      const size = 1.4 + 4 * clamp(region.complexity || 0.3, 0, 1);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = lat >= 0 ? "rgba(247,183,51,0.82)" : "rgba(64,214,200,0.82)";
      ctx.fill();
    }
  });

  ctx.fillStyle = "#aeb4bd";
  ctx.font = "13px Segoe UI, sans-serif";
  ctx.fillText("+45°", 4, latToY(45) + 4);
  ctx.fillText("eq", 12, latToY(0) + 4);
  ctx.fillText("-45°", 4, latToY(-45) + 4);
  ctx.fillText("time →  (one idealized ~11-year cycle)", padLeft, height - 7);
}

// Fallback used before the series loads: today's regions plotted by latitude.
function drawButterflySnapshot(ctx, width, height) {
  ctx.strokeStyle = "#313742";
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i += 1) {
    const y = (height / 6) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  const regions = state.active_regions || [];
  regions.forEach((region, index) => {
    const x = 30 + (index / Math.max(regions.length - 1, 1)) * (width - 60);
    const y = height / 2 - ((region.lat_deg || 0) / 45) * (height * 0.42);
    const isSelected = selectedRegionId === region.id;
    const size = (isSelected ? 6 : 3) + 8 * clamp(region.complexity || 0.3, 0, 1);
    projectedButterflyRegions.push({ x, y, region });
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#f7b733" : region.lat_deg >= 0 ? "rgba(247,183,51,0.85)" : "rgba(64,214,200,0.85)";
    ctx.fill();
  });
  ctx.fillStyle = "#aeb4bd";
  ctx.font = "14px Segoe UI, sans-serif";
  ctx.fillText("+45 deg", 14, 22);
  ctx.fillText("equator", 14, height / 2 - 8);
  ctx.fillText("-45 deg", 14, height - 14);
}

function resizeCanvasToDisplaySize(canvas, maxSize) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const scale = Math.min(window.devicePixelRatio || 1, 2, maxSize / Math.max(rect.width, 1));
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function solarColor(intensity, br, confidence) {
  const base = clamp(intensity, 0.05, 1.35);
  let r = 206 * base + 34;
  let g = 90 * base + 28;
  let b = 22 * base + 7;
  const absBr = Math.abs(br);
  if (br > 0) {
    b += 150 * clamp(br, 0, 1);
    g += 50 * clamp(br, 0, 1);
  } else if (br < 0) {
    r += 90 * clamp(-br, 0, 1);
    b += 85 * clamp(-br, 0, 1);
  }
  if (absBr > 0.42) {
    r *= 0.82;
    g *= 0.78;
    b *= 0.82;
  }
  if (confidence > 0) {
    g = g * (1 - confidence * 0.32) + 210 * confidence * 0.32;
  }
  return `rgb(${clamp(Math.round(r), 0, 255)}, ${clamp(Math.round(g), 0, 255)}, ${clamp(Math.round(b), 0, 255)})`;
}

function solarTexture(lon, lat, dx, dy, z, br) {
  const granules = Math.sin(37 * lon + 8 * Math.sin(5 * lat)) * Math.sin(41 * lat + 5 * Math.cos(4 * lon));
  const superGranules = Math.sin(10 * lon + 1.7) * Math.cos(12 * lat - 0.9);
  const fine = Math.sin((dx + dy) * 91 + Math.sin(lon * 17) * 4) * 0.5 + Math.cos((dx - dy) * 73) * 0.5;
  const faculaBoost = 0.08 * clamp(Math.abs(br) * 1.8, 0, 1) * Math.pow(z, 0.35);
  return clamp(1 + granules * 0.045 + superGranules * 0.035 + fine * 0.018 + faculaBoost, 0.82, 1.22);
}

function sampleField(values, lonF, latF, lonCount, latCount, fallback) {
  if (!values.length) return fallback;
  const y0 = clamp(Math.floor(latF), 0, latCount - 1);
  const y1 = clamp(y0 + 1, 0, latCount - 1);
  const x0 = wrapIndex(Math.floor(lonF), lonCount);
  const x1 = wrapIndex(x0 + 1, lonCount);
  const tx = lonF - Math.floor(lonF);
  const ty = clamp(latF - Math.floor(latF), 0, 1);
  const a = valueAt(values, y0 * lonCount + x0, fallback);
  const b = valueAt(values, y0 * lonCount + x1, fallback);
  const c = valueAt(values, y1 * lonCount + x0, fallback);
  const d = valueAt(values, y1 * lonCount + x1, fallback);
  const top = a * (1 - tx) + b * tx;
  const bottom = c * (1 - tx) + d * tx;
  return top * (1 - ty) + bottom * ty;
}

function projectRegion(region, cx, cy, radius) {
  const lon = (((region.lon_deg || 0) / 360) * Math.PI * 2) - Math.PI;
  const lat = ((region.lat_deg || 0) / 180) * Math.PI;
  const z = Math.cos(lat) * Math.cos(lon);
  return {
    x: cx + radius * Math.cos(lat) * Math.sin(lon),
    y: cy - radius * Math.sin(lat),
    z
  };
}

function selectedRegion() {
  const regions = state.active_regions || [];
  if (selectedRegionId != null) {
    return regions.find((region) => region.id === selectedRegionId) || null;
  }
  if (activeMode !== "explore" || !regions.length) return null;
  return [...regions].sort((a, b) => (b.complexity || 0) - (a.complexity || 0))[0];
}

function visibleLayers() {
  const layerMap = new Map((state.layers || []).map((layer) => [layer.id, layer]));
  const requested = [];
  if (controls.continuum.checked) requested.push("continuum_proxy");
  if (controls.magnetogram.checked) requested.push("br_normalized");
  if (controls.confidence.checked) requested.push("confidence");
  if (controls.regions.checked) requested.push("active_regions");
  return requested.map((id) => layerMap.get(id) || { id, label: id, kind: "degraded" });
}

function visibleLayerSummary() {
  const layers = visibleLayers();
  if (!layers.length) return "none";
  return layers.map((layer) => `${layer.label || layer.id} (${layer.kind || "unknown"})`).join(", ");
}

function observationFrames() {
  const frames = [];
  for (const report of state.observations || []) {
    if (Array.isArray(report.frames)) frames.push(...report.frames);
  }
  return frames;
}

function dataStateLabel() {
  const mode = String(state.source_mode || "").toLowerCase();
  const frameModes = observationFrames().map((frame) => String(frame.source_mode || "").toLowerCase());
  const readinessState = state.operational_readiness?.data_state || {};
  if (mode.includes("degraded") || readinessState.cache_state === "missing") return "degraded";
  if (mode.includes("live") || frameModes.includes("live")) return "live";
  if (mode.includes("cached") || frameModes.includes("cached")) return "cached";
  if (mode.includes("fixture") || frameModes.includes("fixture")) return "fixture";
  if (mode.includes("synthetic")) return "synthetic";
  return "unknown";
}

function dataStateClass() {
  const label = dataStateLabel();
  if (label === "live") return "live";
  if (label === "cached") return "cached";
  if (label === "fixture" || label === "synthetic") return "fixture";
  return "degraded";
}

function readinessLabel() {
  const readiness = state.operational_readiness || {};
  if (readiness.space_weather_operational === true) return "operational";
  if (readiness.research_learning_ready === true) return "research ready";
  if (String(readiness.status || "").includes("research")) return "research only";
  return "blocked";
}

function feedStateLabel() {
  if (!feedStatus) return "not run";
  if (feedStatus.status === "ok") return "daily ok";
  if (feedStatus.status === "degraded") return "degraded";
  if (feedStatus.status === "failed") return "failed";
  return "unknown";
}

function feedStateClass() {
  const label = feedStateLabel();
  if (label === "daily ok") return "live";
  if (label === "degraded") return "fixture";
  if (label === "failed") return "degraded";
  return "blocked";
}

function readinessClass() {
  const label = readinessLabel();
  if (label === "operational" || label === "research ready") return "research-ready";
  if (label === "research only") return "research-only";
  return "blocked";
}

function readinessSummary() {
  const readiness = state.operational_readiness || {};
  const gates = Array.isArray(readiness.gates) ? readiness.gates : [];
  const failed = gates.filter((gate) => gate.passed === false).map((gate) => gate.label || gate.id);
  const blockers = readiness.blockers || [];
  const status = readiness.research_learning_ready === true ? "Research and learning workflows are ready" : "Research and learning workflows are not ready";
  const operational = readiness.space_weather_operational === true
    ? "Space-weather operational use is enabled."
    : "Space-weather operational use is blocked.";
  const gateText = failed.length ? ` Blocked operational gates: ${failed.slice(0, 4).join(", ")}.` : " All declared gates passed.";
  const blockerText = blockers.length ? ` Main blockers: ${blockers.slice(0, 3).join(" ")}` : "";
  return `${status}. ${operational}${gateText}${blockerText}`;
}

function renderOperationalReadinessChecklist() {
  const node = document.getElementById("operationalReadiness");
  if (!node) return;
  node.textContent = "";

  const list = document.createElement("ul");
  list.className = "status-checklist";
  list.setAttribute("aria-label", "Operational readiness checklist");

  for (const item of readinessChecklistItems()) {
    const row = document.createElement("li");
    row.className = `status-checklist-item ${item.state}`;

    const badge = document.createElement("span");
    badge.className = `status-badge ${item.state}`;
    badge.textContent = item.state === "pass" ? "PASS" : "BLOCKED";

    const copy = document.createElement("span");
    copy.className = "status-copy";

    const label = document.createElement("strong");
    label.textContent = item.label;
    copy.appendChild(label);

    if (item.detail) {
      const detail = document.createElement("span");
      detail.textContent = item.detail;
      copy.appendChild(detail);
    }

    row.appendChild(badge);
    row.appendChild(copy);
    list.appendChild(row);
  }

  node.appendChild(list);
}

function readinessChecklistItems() {
  const readiness = state.operational_readiness || {};
  const gates = Array.isArray(readiness.gates) ? readiness.gates : [];
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];
  const items = [
    {
      label: "Research and learning workflows",
      detail: readiness.research_learning_ready === true
        ? "Snapshot rendering, deterministic replay, and research caveats are available."
        : "Research/learning readiness has not passed for this snapshot.",
      state: readiness.research_learning_ready === true ? "pass" : "blocked"
    },
    {
      label: "Space-weather operational use",
      detail: readiness.space_weather_operational === true
        ? "Operational use is marked enabled by the snapshot."
        : "Blocked for warnings, mission safety, fleet operations, and production decisions.",
      state: readiness.space_weather_operational === true ? "pass" : "blocked"
    }
  ];

  for (const gate of gates) {
    items.push({
      label: gate.label || humanizeId(gate.id),
      detail: gate.passed === true ? "Gate is satisfied." : "Gate is required before operational space-weather use.",
      state: gate.passed === true ? "pass" : "blocked"
    });
  }

  for (const blocker of blockers) {
    items.push({
      label: "Operational blocker",
      detail: blocker,
      state: "blocked"
    });
  }

  return items;
}

function feedHealthSummary() {
  if (!feedStatus) return "Daily ingest has not run in this web data directory.";
  const sources = Array.isArray(feedStatus.sources) ? feedStatus.sources : [];
  const okCount = sources.filter((source) => source.ok).length;
  const failed = sources.filter((source) => !source.ok).map((source) => source.file || source.source || "unknown");
  const lastRun = formatUtc(feedStatus.last_run_utc);
  const nextRun = formatUtc(feedStatus.next_recommended_run_utc);
  const failureText = failed.length ? ` Failed sources: ${failed.join(", ")}.` : " No source failures are reported.";
  return `Daily feed status is ${feedStatus.status || "unknown"}. ${okCount} of ${sources.length} public sources are available. Last run: ${lastRun}. Next suggested run: ${nextRun}.${failureText}`;
}

function fieldValues(id) {
  return state.fields?.[id]?.values || [];
}

function valueAt(values, index, fallback) {
  const value = values[index];
  return Number.isFinite(value) ? value : fallback;
}

function wrapIndex(value, count) {
  return ((value % count) + count) % count;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hash01(value) {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function number(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function numberOrNa(value, digits) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "n/a";
}

function compactNumberOrNa(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  if (parsed !== 0 && Math.abs(parsed) < 0.01) return parsed.toExponential(2);
  return parsed.toFixed(2);
}

function meanField(id) {
  const values = fieldValues(id);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function selectedRegionSentence() {
  const region = selectedRegion();
  if (!region) return "";
  return `Selected ${selectedRegionSummary(region)} `;
}

function selectedRegionSummary(region) {
  return `AR ${region.id} is at ${regionLocation(region)} with normalized flux ${number(region.flux_norm, 2)}, complexity ${complexityLabel(region.complexity)}, area ${number(region.area_msh, 0)} MSH, tilt ${number(region.tilt_deg, 1)} deg, and confidence ${number(region.confidence, 2)}.`;
}

function regionLocation(region) {
  return `lat ${number(region.lat_deg, 1)} deg, lon ${number(region.lon_deg, 1)} deg`;
}

function complexityLabel(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= 0.8) return `high (${value.toFixed(2)})`;
  if (value >= 0.55) return `moderate (${value.toFixed(2)})`;
  return `low (${value.toFixed(2)})`;
}

function observedSignalSummary() {
  const signals = state.observed_context?.space_weather_signals || {};
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

function countBy(values) {
  return values.reduce((counts, value) => {
    const key = value || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function formatCounts(counts) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${value} ${key}`)
    .join(", ");
}

function readableMode(value) {
  const textValue = String(value || "unknown").toLowerCase();
  if (textValue.includes("cached")) return "cached";
  if (textValue.includes("fixture")) return "fixture";
  if (textValue.includes("live")) return "live";
  if (textValue.includes("synthetic")) return "synthetic";
  if (textValue.includes("observed")) return "observed";
  if (textValue.includes("inferred")) return "inferred";
  if (textValue.includes("degraded") || textValue.includes("missing") || textValue.includes("failed")) return "degraded";
  return textValue.replace(/[_-]+/g, " ");
}

function humanizeId(value) {
  return String(value || "unknown").replace(/[_-]+/g, " ");
}

function plural(count, singular) {
  return count === 1 ? singular : `${singular}s`;
}

function formatUtc(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace(".000Z", "Z");
}

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function textWithTitle(id, value, title) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = value;
  node.title = title;
}

function setPill(id, value, stateClass) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = value;
  node.className = `state-pill ${stateClass}`;
}

function stageFromActivity(activity) {
  if (activity >= 0.75) return "solar maximum";
  if (activity >= 0.45) return "rising or declining phase";
  return "solar minimum";
}

function observationSummary() {
  const frames = observationFrames();
  if (!frames.length) return "No observation frames are loaded; the app is rendering synthetic state only.";
  const counts = countBy(frames.map((frame) => readableMode(frame.source_mode)));
  const observedContext = state.observed_context?.activity_proxy_sources || {};
  const contextParts = [];
  if (observedContext.solar_region_rows) contextParts.push(`${observedContext.solar_region_rows} SWPC region rows`);
  if (observedContext.goes_xray_flares_7_day_rows) contextParts.push(`${observedContext.goes_xray_flares_7_day_rows} GOES flare rows`);
  if (observedContext.planetary_k_index_rows) contextParts.push(`${observedContext.planetary_k_index_rows} Kp rows`);
  if (observedContext.f107_cm_flux_rows) contextParts.push(`${observedContext.f107_cm_flux_rows} F10.7 rows`);
  const sourceText = contextParts.length ? ` Context includes ${contextParts.join(", ")}.` : "";
  return `${frames.length} observation ${plural(frames.length, "frame")} loaded (${formatCounts(counts)}). ${observedSignalSummary()}${sourceText} These are public context layers, not operational truth.`;
}

function adapterSummary() {
  const health = [];
  for (const observation of state.observations || []) {
    if (Array.isArray(observation.adapter_health)) {
      health.push(...observation.adapter_health);
    }
  }
  if (!health.length) return "No external adapters are attached; synthetic snapshot only.";
  const counts = countBy(health.map((item) => readableMode(item.state)));
  const unavailable = health.filter((item) => !["cached", "fixture", "live"].includes(readableMode(item.state)));
  const missingText = unavailable.length ? ` Missing or degraded: ${unavailable.map((item) => humanizeId(item.id)).join(", ")}.` : " No adapter failures are reported.";
  return `${health.length} source ${plural(health.length, "adapter")} tracked (${formatCounts(counts)}). ${criticalAdapterText(health)}${missingText}`;
}

function layerSummary() {
  const layers = state.layers || [];
  if (!layers.length) return "No layer metadata is present in this snapshot.";
  const counts = countBy(layers.map((layer) => readableMode(layer.kind)));
  const visible = visibleLayers().map((layer) => `${layer.label || humanizeId(layer.id)} (${readableMode(layer.kind)})`);
  return `${layers.length} declared ${plural(layers.length, "layer")} (${formatCounts(counts)}). Currently visible: ${visible.join(", ") || "none"}. Synthetic and inferred layers come from the model; observed layers are retained as provenance context.`;
}

for (const input of Object.values(controls)) {
  input.addEventListener("change", renderAll);
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeMode = button.dataset.mode;
    if (activeMode === "explore" && selectedRegionId == null) {
      const region = selectedRegion();
      selectedRegionId = region ? region.id : null;
    }
    updateModeButtons();
    renderAll();
  });
});

function updateModeButtons() {
  document.querySelectorAll(".mode-button").forEach((node) => {
    const isActive = node.dataset.mode === activeMode;
    node.classList.toggle("active", isActive);
    node.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

document.getElementById("solarCanvas").addEventListener("click", (event) => {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  let best = null;
  for (const item of projectedRegions) {
    const distance = Math.hypot(item.x - x, item.y - y);
    if (distance < 34 && (!best || distance < best.distance)) {
      best = { distance, item };
    }
  }
  if (best) {
    selectedRegionId = best.item.region.id;
    activeMode = "explore";
    updateModeButtons();
    renderAll();
  }
});

document.getElementById("butterflyCanvas").addEventListener("click", (event) => {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  if (seriesFrames.length) {
    const usable = canvas.width - 38 - 14;
    const frac = clamp((x - 38) / usable, 0, 1);
    stopPlay();
    setTimelineFrame(Math.round(frac * (seriesFrames.length - 1)));
    return;
  }
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  let best = null;
  for (const item of projectedButterflyRegions) {
    const distance = Math.hypot(item.x - x, item.y - y);
    if (distance < 28 && (!best || distance < best.distance)) {
      best = { distance, item };
    }
  }
  if (best) {
    selectedRegionId = best.item.region.id;
    activeMode = "explore";
    updateModeButtons();
    renderAll();
  }
});

loadState();

let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderAll();
    if (tourIndex >= 0) showTourStep();
  }, 120);
});

// --- Glossary tooltips: plain-language help on hover, keyboard focus, and tap. ---
const termTip = document.getElementById("termTip");
let tipPinned = false;

function showTip(target) {
  if (!termTip) return;
  const entry = GLOSSARY[target.getAttribute("data-term")];
  if (!entry) return;
  termTip.textContent = "";
  const title = document.createElement("strong");
  title.textContent = entry[0];
  termTip.appendChild(title);
  termTip.appendChild(document.createTextNode(entry[1]));
  termTip.hidden = false;
  const rect = target.getBoundingClientRect();
  const tip = termTip.getBoundingClientRect();
  let left = Math.min(rect.left, window.innerWidth - tip.width - 8);
  let top = rect.bottom + 8;
  if (top + tip.height > window.innerHeight - 8) top = rect.top - tip.height - 8;
  termTip.style.left = `${Math.max(8, left)}px`;
  termTip.style.top = `${Math.max(8, top)}px`;
}

function hideTip() {
  if (termTip) termTip.hidden = true;
  tipPinned = false;
}

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest ? event.target.closest("[data-term]") : null;
  if (target && !tipPinned) showTip(target);
});
document.addEventListener("mouseout", (event) => {
  const target = event.target.closest ? event.target.closest("[data-term]") : null;
  if (target && !tipPinned) hideTip();
});
document.addEventListener("focusin", (event) => {
  const target = event.target.closest ? event.target.closest("[data-term]") : null;
  if (target) showTip(target);
});
document.addEventListener("focusout", (event) => {
  const target = event.target.closest ? event.target.closest("[data-term]") : null;
  if (target && !tipPinned) hideTip();
});
document.addEventListener("click", (event) => {
  const target = event.target.closest ? event.target.closest("[data-term]") : null;
  if (target) {
    event.preventDefault();
    if (tipPinned && !termTip.hidden) {
      hideTip();
    } else {
      showTip(target);
      tipPinned = true;
    }
  } else if (tipPinned) {
    hideTip();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideTip();
    if (tourIndex >= 0) endTour();
  }
});

// --- Onboarding tour: a short, skippable orientation for first-time visitors. ---
const TOUR_STEPS = [
  { target: null, title: "Meet the Sun", body: "This is the real Sun as seen today by NASA's SDO satellite — not a drawing. Take a few seconds and I'll show you around." },
  { target: "#solarCanvas", title: "Real sunspots", body: "Those dark specks are sunspots: cooler, magnetically intense patches. The more sunspots there are, the more active the Sun is." },
  { target: "#stageRail", title: "Where we are in the cycle", body: "The Sun runs an ~11-year cycle from quiet (Minimum) to busy (Maximum). The highlighted step is where it is right now — click any step to learn about it." },
  { target: ".mode-grid", title: "Go as deep as you like", body: "Today is the simple view. Explore lets you click sunspot groups and toggle layers. Space Weather and Research go deeper." },
  { target: null, title: "You're set", body: "Tap any '?' to learn a term, and click a marker on the Sun to inspect it. Enjoy exploring." }
];

const tourLayer = document.getElementById("tourLayer");
const tourSpot = document.getElementById("tourSpot");
const tourCard = document.getElementById("tourCard");
let tourIndex = -1;

function startTour() {
  if (!tourLayer) return;
  activeMode = "today";
  updateModeButtons();
  renderAll();
  window.scrollTo(0, 0);
  const panel = document.querySelector(".control-panel");
  if (panel) panel.scrollTop = 0;
  tourIndex = 0;
  tourLayer.hidden = false;
  showTourStep();
}

function endTour() {
  if (tourLayer) tourLayer.hidden = true;
  tourIndex = -1;
  try { localStorage.setItem("sol-tour-seen", "1"); } catch (error) { /* storage may be blocked */ }
}

function showTourStep() {
  const step = TOUR_STEPS[tourIndex];
  if (!step) { endTour(); return; }
  text("tourStepCount", `Step ${tourIndex + 1} of ${TOUR_STEPS.length}`);
  text("tourTitle", step.title);
  text("tourBody", step.body);
  const back = document.getElementById("tourBack");
  const next = document.getElementById("tourNext");
  if (back) back.disabled = tourIndex === 0;
  if (next) next.textContent = tourIndex === TOUR_STEPS.length - 1 ? "Done" : "Next";

  const targetEl = step.target ? document.querySelector(step.target) : null;
  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const pad = 6;
    tourSpot.classList.remove("hidden");
    tourSpot.style.left = `${rect.left - pad}px`;
    tourSpot.style.top = `${rect.top - pad}px`;
    tourSpot.style.width = `${rect.width + pad * 2}px`;
    tourSpot.style.height = `${rect.height + pad * 2}px`;
    positionTourCard(rect);
  } else {
    tourSpot.classList.add("hidden");
    centerTourCard();
  }
}

function positionTourCard(rect) {
  const card = tourCard.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 12;
  if (top + card.height > window.innerHeight - 8) top = rect.top - card.height - 12;
  if (left + card.width > window.innerWidth - 8) left = window.innerWidth - card.width - 8;
  tourCard.style.left = `${Math.max(8, left)}px`;
  tourCard.style.top = `${Math.max(8, top)}px`;
}

function centerTourCard() {
  const card = tourCard.getBoundingClientRect();
  tourCard.style.left = `${Math.max(8, (window.innerWidth - card.width) / 2)}px`;
  tourCard.style.top = `${Math.max(8, (window.innerHeight - card.height) / 2)}px`;
}

function maybeAutoStartTour() {
  let seen = null;
  try { seen = localStorage.getItem("sol-tour-seen"); } catch (error) { seen = "1"; }
  if (!seen) startTour();
}

document.getElementById("tourStart")?.addEventListener("click", startTour);
document.getElementById("tourSkip")?.addEventListener("click", endTour);
document.getElementById("tourBack")?.addEventListener("click", () => {
  if (tourIndex > 0) { tourIndex -= 1; showTourStep(); }
});
document.getElementById("tourNext")?.addEventListener("click", () => {
  if (tourIndex >= TOUR_STEPS.length - 1) { endTour(); return; }
  tourIndex += 1;
  showTourStep();
});

// --- Timeline scrubber / playback wiring. ---
document.getElementById("timeScrubber")?.addEventListener("input", (event) => {
  stopPlay();
  setTimelineFrame(Number(event.target.value));
});
document.getElementById("playToggle")?.addEventListener("click", togglePlay);
document.getElementById("nowBtn")?.addEventListener("click", goLive);
