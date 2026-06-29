// DOM text / panel updates driven by the current snapshot.

import { store } from "./store.js?v=18";
import { MODE_COPY, APPLICATION_COPY, STAGE_PLAIN, SIGNAL_TERMS, LEGEND_TERMS } from "./config.js?v=18";
import { text, textWithTitle, setPill } from "./dom.js?v=18";
import { stageFromActivity, plural, number, numberOrNa, compactNumberOrNa, humanizeId, formatUtc } from "./format.js?v=18";
import {
  fieldValues, meanField, selectedRegion, visibleLayers, visibleLayerSummary,
  dataStateLabel, dataStateClass, readinessLabel, readinessClass, feedStateLabel, feedStateClass,
  regionLocation, selectedRegionSummary, selectedRegionSentence,
  observationSummary, adapterSummary, layerSummary
} from "./selectors.js?v=18";

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
  text("runTime", `${((run.time_seconds || 0) / 86400).toFixed(2)} days`);
  text("plainInsight", modeInsight());
  text("regionCount", String((store.state.active_regions || []).length));
  text("brMax", brMax.toFixed(3));
  text("confidenceMean", confidenceMean.toFixed(3));
  text("schemaVersion", store.state.schema_version || "unknown");
  text("modeTitle", mode[0]);
  text("modeText", mode[1]);
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
  updateStageRail();

  if (!fields.br_normalized || !fields.continuum_proxy) {
    text("plainInsight", "Snapshot is missing expected fields; degraded fallback rendering is active.");
  }
}

function modeInsight() {
  if (store.activeMode === "today") return beginnerCycleInsight();
  if (store.activeMode === "explore") return "Click any marker on the Sun to inspect that sunspot group. Use the layer toggles to add or remove the magnetic-field and confidence overlays.";
  if (store.activeMode === "weather") return weatherInsight();
  if (store.activeMode === "research") return "This view shows what the model is and is not: the equations it runs, where its data comes from, and what still blocks operational forecasting.";
  return beginnerCycleInsight();
}

function weatherInsight() {
  const signals = store.state.observed_context?.space_weather_signals || {};
  return `SWPC context: Kp ${numberOrNa(signals.latest_kp, 1)}, F10.7 ${numberOrNa(signals.latest_f107, 1)}, GOES/X-ray ${compactNumberOrNa(signals.latest_goes_xray_flux)}, wind ${numberOrNa(signals.latest_solar_wind_speed_km_s, 0)} km/s. Learning view only.`;
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
    el.classList.toggle("active", /** @type {HTMLElement} */ (el).dataset.stage === current);
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
  const app = APPLICATION_COPY[store.activeMode] || APPLICATION_COPY.today;
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
  return `Daily feed status is ${store.feedStatus.status || "unknown"}. ${okCount} of ${sources.length} public sources are available. Last run: ${lastRun}. Next suggested run: ${nextRun}.${failureText}`;
}

export function updateModeButtons() {
  document.querySelectorAll(".mode-button").forEach((node) => {
    const isActive = /** @type {HTMLElement} */ (node).dataset.mode === store.activeMode;
    node.classList.toggle("active", isActive);
    node.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}
