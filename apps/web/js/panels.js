// DOM text / panel updates driven by the current snapshot.

import { store } from "./store.js?v=d47a263346";
import { MODE_COPY, APPLICATION_COPY, STAGE_PLAIN, SIGNAL_TERMS, LEGEND_TERMS } from "./config.js?v=d47a263346";
import { text, textWithTitle, setPill } from "./dom.js?v=d47a263346";
import { auroraAssessment } from "./aurora.js?v=d47a263346";
import { stageFromActivity, plural, number, numberOrNa, compactNumberOrNa, humanizeId, formatUtc } from "./format.js?v=d47a263346";
import {
  fieldValues, meanField, selectedRegion, visibleLayers, visibleLayerSummary,
  dataStateLabel, dataStateClass, readinessLabel, readinessClass, feedStateLabel, feedStateClass, feedOverdueHours,
  regionLocation, selectedRegionSummary, selectedRegionSentence,
  observationSummary, adapterSummary, layerSummary
} from "./selectors.js?v=d47a263346";

export function updateText() {
  const run = store.state.run || {};
  const fields = store.state.fields || {};
  const brValues = fieldValues("br_normalized");
  const confidenceValues = fieldValues("confidence");
  const brMax = brValues.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const confidenceMean = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : 0;
  const mode = MODE_COPY[store.activeMode] || MODE_COPY.today;

  text("cycleStage", store.state.learning?.cycle_stage || stageFromActivity(run.activity_index || 0));
  textWithTitle("sourceMode", dataStateLabel(), store.state.source_mode || "unknown");
  text("plainInsight", modeInsight());
  text("regionCount", String((store.state.active_regions || []).length));
  text("brMax", brMax.toFixed(3));
  text("confidenceMean", confidenceMean.toFixed(3));
  text("schemaVersion", store.state.schema_version || "unknown");
  text("journeyTitle", store.state.learning?.cycle_stage || "Solar journey");
  text("journeyText", mode[1]);
  text("calibrationState", store.state.calibration_state || "not reported");
  text("layerLabels", layerSummary());
  text("observationState", observationSummary());
  text("adapterHealth", adapterSummary());
  text("feedHealth", feedHealthSummary());
  renderOperationalReadinessChecklist();
  text("warningList", (store.state.warnings || []).join("; ") || "none");
  updateSnapshotSummary(brMax, confidenceMean);
  updateLayerLegend();
  updateApplicationPanel();
  updateSelectionText();
  updateRegionList();
  updateStageRail();

  if (!fields.br_normalized || !fields.continuum_proxy) {
    text("plainInsight", "Snapshot is missing expected fields; degraded fallback rendering is active.");
  }
}

// The Sun is one surface now; the headline insight is always the plain-language cycle summary.
function modeInsight() {
  return beginnerCycleInsight();
}

function beginnerCycleInsight() {
  const stage = store.state.learning?.cycle_stage || stageFromActivity(store.state.run?.activity_index || 0);
  const count = (store.state.active_regions || []).length;
  const plain = STAGE_PLAIN[String(stage).toLowerCase()] || "an active part of its cycle";
  const are = count === 1 ? "is" : "are";
  return `The Sun is near ${stage} — ${plain}. Right now there ${are} ${count} active ${plural(count, "region")} (sunspot groups) on the side facing us; each marker on the disk is one of them.`;
}

function updateStageRail() {
  const stage = String(store.state.learning?.cycle_stage || stageFromActivity(store.state.run?.activity_index || 0)).toLowerCase();
  let current = "maximum";
  if (stage.includes("min")) current = "minimum";
  else if (stage.includes("declin")) current = "declining";
  else if (stage.includes("rising")) current = "rising";
  else if (stage.includes("max")) current = "maximum";
  document.querySelectorAll("#stageRail .stage-step").forEach((el) => {
    const isActive = /** @type {HTMLElement} */ (el).dataset.stage === current;
    el.classList.toggle("active", isActive);
    // Announce where we are in the cycle — the active step used to be class-only.
    if (isActive) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  });
}

function updateSnapshotSummary(brMax, confidenceMean) {
  const regions = store.state.active_regions || [];
  const stage = store.state.learning?.cycle_stage || stageFromActivity(store.state.run?.activity_index || 0);
  const visible = visibleLayerSummary();
  const dataLabel = dataStateLabel();
  const readiness = readinessLabel();
  text("summaryPrimary", `${stage}: ${regions.length} active regions, ${dataLabel} context, mean confidence ${confidenceMean.toFixed(2)}.`);
  text("summaryDetail", `Max normalized |Br| is ${brMax.toFixed(2)}. Visible layers: ${visible}. ${selectedRegionSentence()}Readiness: ${readiness}; space-weather operations remain gated.`);
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
  // The "What it means for Earth" drawer always surfaces the space-weather signals (Kp / F10.7 / etc.).
  const app = APPLICATION_COPY.weather;
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
  renderAuroraOutlook();
}

// "Will I see the aurora tonight?" — joins the snapshot's Kp with the My Sky observer
// (or the default location) into one plain-language verdict. Copy comes fully formed
// from aurora.js; this only writes DOM and adds the data-freshness caveat.
function renderAuroraOutlook() {
  const target = document.getElementById("auroraOutlook");
  if (!target) return;
  const weather = store.state.observed_context?.space_weather_signals || {};
  const observer = store.sky?.observer || { lat: 40.71, lon: -74.01, label: "New York (default)" };
  const outlook = auroraAssessment({
    latDeg: observer.lat,
    lonEastDeg: observer.lon,
    kp: weather.latest_kp != null ? Number(weather.latest_kp) : NaN,
    unixSeconds: Date.now() / 1000,
    locationLabel: observer.label,
  });
  target.textContent = "";
  target.className = `aurora-outlook aurora-${outlook.status}`;
  const headline = document.createElement("strong");
  headline.textContent = outlook.headline;
  const detail = document.createElement("span");
  let detailText = outlook.detail;
  // A verdict from stale Kp must say so — same honesty rule as the feed pill.
  // (latest_kp != null guard first: Number(null) is 0, which is finite — the caveat
  // would otherwise attach to the "no Kp reading" message too.)
  if (weather.latest_kp != null && Number.isFinite(Number(weather.latest_kp)) && feedOverdueHours() !== null) {
    detailText += " (Kp is from the last completed feed run — it may have changed since.)";
  }
  detail.textContent = ` ${detailText}`;
  const term = document.createElement("button");
  term.className = "term";
  term.type = "button";
  term.textContent = "?";
  term.setAttribute("data-term", "geomagnetic-latitude");
  term.setAttribute("aria-label", "What is geomagnetic latitude?");
  target.append(headline, detail, term);
}

function signalLabels(signals) {
  const context = store.state.observed_context || {};
  const weather = context.space_weather_signals || {};
  const selected = selectedRegion();
  return signals.map((signal) => {
    if (signal === "stage") return store.state.learning?.cycle_stage || "stage n/a";
    if (signal === "regions") return `${(store.state.active_regions || []).length} regions`;
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
    text("selectionText", "No active region is selected yet. Click a marker on the solar disk or open Explore to inspect one.");
    return;
  }
  panel?.classList.add("selected");
  text("selectionTitle", `AR ${region.id}: ${regionLocation(region)}`);
  text("selectionText", selectedRegionSummary(region));
}

// Keyboard/AT-accessible equivalent of clicking a marker on the solar disk: a list
// of real <button>s, one per active region. Wired via delegation in app.js.
// Skipped when nothing changed and focus is restored across rebuilds: timeline playback
// re-renders every 1.1 s, and the wholesale rebuild used to destroy the focused chip —
// teleporting keyboard users to <body> mid-interaction.
let lastRegionListSignature = null;
function updateRegionList() {
  const list = document.getElementById("regionList");
  if (!list) return;
  const regions = store.state.active_regions || [];
  // The signature must include the coordinates, not just the ids: timeline frames reuse
  // ids 1..N with different lat/lon, so an id-only key kept the previous frame's
  // locations in the list while the disk rendered the new snapshot.
  const signature = `${regions.map((r) => `${r.id}@${r.lat_deg},${r.lon_deg}`).join(";")}|${store.selectedRegionId}`;
  if (signature === lastRegionListSignature && list.childNodes.length) return;
  lastRegionListSignature = signature;
  const focused = /** @type {HTMLElement|null} */ (document.activeElement);
  const focusedId = focused && list.contains(focused) ? focused.dataset.regionId : null;
  list.textContent = "";
  if (!regions.length) {
    const empty = document.createElement("p");
    empty.className = "time-frame-label";
    empty.textContent = "No active regions in this snapshot.";
    list.appendChild(empty);
    return;
  }
  for (const region of regions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "region-chip";
    const isSelected = region.id === store.selectedRegionId;
    if (isSelected) btn.classList.add("selected");
    btn.setAttribute("aria-pressed", String(isSelected));
    btn.dataset.regionId = String(region.id);
    btn.textContent = `AR ${region.id} · ${regionLocation(region)}`;
    list.appendChild(btn);
  }
  if (focusedId) {
    /** @type {HTMLElement|null} */ (list.querySelector(`button[data-region-id="${focusedId}"]`))?.focus();
  }
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
  const readiness = store.state.operational_readiness || {};
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
    items.push({ label: "Operational blocker", detail: blocker, state: "blocked" });
  }
  return items;
}

function feedHealthSummary() {
  if (!store.feedStatus) return "Daily ingest has not run in this web data directory.";
  const sources = Array.isArray(store.feedStatus.sources) ? store.feedStatus.sources : [];
  const okCount = sources.filter((source) => source.ok).length;
  const failed = sources.filter((source) => !source.ok).map((source) => source.file || source.source || "unknown");
  const lastRun = formatUtc(store.feedStatus.last_run_utc);
  const nextRun = formatUtc(store.feedStatus.next_recommended_run_utc);
  const failureText = failed.length ? ` Failed sources: ${failed.join(", ")}.` : " No source failures are reported.";
  const overdue = feedOverdueHours();
  // The status file's "ok" was true when it was written; if the next recommended run
  // never happened, say so instead of presenting frozen health as current.
  const staleness = overdue === null ? "" : (
    overdue >= 48
      ? ` The daily feed is ${Math.floor(overdue / 24)} days overdue — everything shown is from that last run.`
      : " The daily feed is overdue; values are from the last completed run."
  );
  return `Daily feed status is ${store.feedStatus.status || "unknown"}${overdue !== null ? " (at last run)" : ""}. ${okCount} of ${sources.length} public sources are available. Last run: ${lastRun}. Next suggested run: ${nextRun}.${staleness}${failureText}`;
}

export function updateModeButtons() {
  document.querySelectorAll(".mode-button").forEach((node) => {
    const isActive = /** @type {HTMLElement} */ (node).dataset.mode === store.activeMode;
    node.classList.toggle("active", isActive);
    // aria-pressed, not aria-selected: aria-selected is only valid on tab/option/gridcell/
    // row roles, so AT ignored it on these plain buttons — the active destination was
    // invisible to screen-reader users.
    node.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}
