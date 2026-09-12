// DOM text / panel updates driven by the current snapshot.

import { store } from "./store.js?v=dcca6290db";
import { MODE_COPY, APPLICATION_COPY, STAGE_PLAIN, SIGNAL_TERMS, LEGEND_TERMS } from "./config.js?v=dcca6290db";
import { text, textWithTitle, setPill } from "./dom.js?v=dcca6290db";
import { auroraAssessment } from "./aurora.js?v=dcca6290db";
import { syncObjectRows, matchesObject } from "./objectBrowser.js?v=dcca6290db";
import { stageFromActivity, plural, number, numberOrNa, compactNumberOrNa, humanizeId, formatUtc } from "./format.js?v=dcca6290db";
import { assessFeedFreshness } from "./presentationState.js?v=dcca6290db";
import {
  fieldValues, meanField, selectedRegion, visibleLayers, visibleLayerSummary,
  dataStateLabel, dataStateClass, readinessLabel, readinessClass, feedStateLabel, feedStateClass,
  regionLocation, selectedRegionSummary, selectedRegionSentence,
  observationSummary, adapterSummary, layerSummary
} from "./selectors.js?v=dcca6290db";

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
  updateCycleTable();
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
  return store.presentation?.headline || "Loading model and source evidence…";
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
  text("summaryPrimary", `${store.presentation?.headline || stage} Mean heuristic model score ${confidenceMean.toFixed(2)} (not probability).`);
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
  if (store.presentation?.showModelOverlays && layers.some(layer => layer.id === "confidence")) {
    const scale = document.createElement("span");
    scale.className = "score-scale";
    scale.textContent = "Heuristic model score — not probability: 0 · 0.25 · 0.5 · 0.75 · 1 (increasing opacity)";
    legend.appendChild(scale);
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
  // A verdict from stale or freshness-unknown Kp must say so — same honesty rule as the feed pill.
  // (latest_kp != null guard first: Number(null) is 0, which is finite — the caveat
  // would otherwise attach to the "no Kp reading" message too.)
  if (weather.latest_kp != null && Number.isFinite(Number(weather.latest_kp))) {
    const { freshness } = assessFeedFreshness(store.feedStatus, Date.now());
    if (freshness === "stale") detailText += " (Kp is from the last completed feed run — it may have changed since.)";
    else if (freshness === "unknown") detailText += " (Kp is retained from the displayed snapshot; current feed freshness is unknown because the next recommended run time is missing or invalid.)";
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

// Keyed native controls preserve actual focus identity during data refreshes.
function updateRegionList() {
  const list = document.getElementById("regionList");
  if (!list) return;
  const regions = store.state.active_regions || [];
  const query = /** @type {HTMLInputElement|null} */ (document.getElementById("regionSearch"))?.value || "";
  const records = regions.map(region => ({ id: region.id, label: `AR ${region.id} · ${regionLocation(region)}`,
    selected: region.id === store.selectedRegionId, className: `region-chip${region.id === store.selectedRegionId ? " selected" : ""}`,
    hidden: !matchesObject({ id: region.id, name: `AR ${region.id} ${regionLocation(region)}` }, query) }));
  syncObjectRows(list, records, id => window.dispatchEvent(new CustomEvent("sol:region-selected", { detail: id })));
  text("regionSearchStatus", `${records.filter(row => !row.hidden).length} of ${regions.length} modeled regions shown`);
}

function updateCycleTable() {
  const table=document.getElementById("cycleFrameTable");
  if (!table) return;
  const existing=new Map(Array.from(table.children).map(row=>[row.getAttribute("data-frame-id"),row]));
  const ids=new Set();
  for (const frame of store.seriesRecords) {
    ids.add(frame.id);
    let row=existing.get(frame.id);
    if (!row) {
      row=document.createElement("tr");row.setAttribute("data-frame-id",frame.id);
      row.append(document.createElement("td"),document.createElement("td"),document.createElement("td"));
      const button=document.createElement("button");button.type="button";button.className="time-btn ghost";
      row.children[2].appendChild(button);table.appendChild(row);
    }
    row.children[0].textContent=String(frame.months);
    row.children[1].textContent=frame.status === "ready" ? "Synthetic model available" : "Unavailable — no interpolation";
    const button=/** @type {HTMLButtonElement} */ (row.children[2].firstElementChild);
    button.textContent=`Select month ${frame.months}`;
    button.setAttribute("aria-pressed",String(frame.index === store.timelineIndex));
    button.onclick=()=>window.dispatchEvent(new CustomEvent("sol:frame-selected",{detail:frame.index}));
  }
  for (const row of Array.from(table.children)) if (!ids.has(row.getAttribute("data-frame-id"))) row.remove();
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
  const assessment = assessFeedFreshness(store.feedStatus, Date.now());
  const nextRun = assessment.freshness === "unknown" ? "unknown" : formatUtc(store.feedStatus.next_recommended_run_utc);
  const failureText = failed.length ? ` Failed sources: ${failed.join(", ")}.` : " No source failures are reported.";
  let freshnessText = " Current feed freshness is within the recommended refresh window.";
  if (assessment.freshness === "unknown") {
    freshnessText = " Current feed freshness is unknown because the next recommended run time is missing or invalid.";
  } else if (assessment.freshness === "stale") {
    freshnessText = assessment.overdueHours >= 48
      ? ` Current feed freshness is overdue by ${Math.floor(assessment.overdueHours / 24)} days; everything shown is retained from the last report.`
      : " Current feed freshness is overdue; values are retained from the last report.";
  }
  return `Last feed report: status ${store.feedStatus.status || "unknown"}; ${okCount} of ${sources.length} public sources succeeded. Last run: ${lastRun}. Next suggested run: ${nextRun}.${freshnessText}${failureText}`;
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
