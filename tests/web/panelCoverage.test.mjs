import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";
import { createPanelDocument } from "./helpers/panelDomHost.mjs";

const moduleURL = name => new URL(`../../apps/web/js/${name}.js`, import.meta.url);
const NOW = Date.parse("2026-09-12T12:00:00Z");

async function panelHarness({ absent = [], blockedStorage = false } = {}) {
  const host = createPanelDocument(), { document, nodes, add } = host;
  const main = add("main", "main"); main.className = "app-shell";
  const controls = add("controls", "section", main); controls.className = "control-panel";
  const selection = add("selection", "section", main); selection.className = "selection-panel";
  const grid = add("modeGrid", "div", main); grid.className = "mode-grid";
  for (const id of ["cycleStage", "sourceMode", "plainInsight", "regionCount", "brMax", "confidenceMean", "schemaVersion",
    "journeyTitle", "journeyText", "calibrationState", "layerLabels", "observationState", "adapterHealth", "feedHealth",
    "operationalReadiness", "warningList", "summaryPrimary", "summaryDetail", "dataState", "ingestState", "readinessState",
    "layerLegend", "applicationTitle", "applicationText", "applicationSignals", "auroraOutlook", "selectionTitle", "selectionText",
    "regionList", "regionSearchStatus", "cycleFrameTable", "stageRail", "solarCanvas"]) add(id, "div", main);
  for (const id of ["layerConfidence", "layerRegions", "regionSearch"]) add(id, "input", controls);
  nodes.get("layerConfidence").checked = true;
  nodes.get("layerRegions").checked = true;
  for (const stage of ["minimum", "rising", "maximum", "declining"]) {
    const node = add(`stage-${stage}`, "button", nodes.get("stageRail"));
    node.className = "stage-step"; node.dataset.stage = stage;
  }
  for (const mode of ["today", "sky", "orrery"]) {
    const node = add(`mode-${mode}`, "button", grid); node.className = "mode-button"; node.dataset.mode = mode;
  }
  const layer = add("tourLayer"); layer.hidden = true;
  add("tourSpot", "div", layer);
  const card = add("tourCard", "section", layer); card.rect = { left: 0, top: 0, width: 240, height: 120 };
  for (const id of ["tourStepCount", "tourTitle", "tourBody"]) add(id, "div", card);
  for (const id of ["tourBack", "tourNext", "tourSkip"]) add(id, "button", card);
  add("tourStart", "button", main);
  add("priorFocus", "button", main);
  add("termTip").hidden = true;
  for (const id of absent) nodes.get(id)?.remove();
  const events = [], saved = new Map(), scrolls = [];
  let renderCount = 0;
  const context = vm.createContext({ document,
    Date: class extends Date { static now() { return NOW; } },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
    window: { innerWidth: 800, innerHeight: 600, dispatchEvent(event) { events.push({ type: event.type, detail: event.detail }); }, scrollTo(...args) { scrolls.push(args); } },
    localStorage: { setItem(key, value) { if (blockedStorage) throw new Error("storage unavailable"); saved.set(key, value); } },
  });
  const [panels, tour, tooltip, state] = await loadSourceModules(context,
    [moduleURL("panels"), moduleURL("tour"), moduleURL("tooltip"), moduleURL("store")], {
      resolveImport: (_specifier, url) => url.pathname.endsWith("/view.js") ? { renderAll() { renderCount++; } } : undefined,
    });
  const { store } = state;
  store.state = {
    schema_version: "solar-state-snapshot.v3", source_mode: "synthetic", calibration_state: "normalized model units",
    run: { activity_index: 0.9, time_seconds: 3600 }, learning: { cycle_stage: "solar maximum" },
    fields: { br_normalized: { values: [-2, 0, 1] }, continuum_proxy: { values: [1, 1, 1] }, confidence: { values: [0.2, 0.6] } },
    layers: [{ id: "confidence", kind: "inferred" }], observations: [], warnings: ["Research only", "No warning authority"],
    active_regions: [
      { id: 1, birth: { lat_deg: 10, lon_deg: 20, time_seconds: 0 }, model_position: { lat_deg: 10, lon_deg: 21 }, confidence: 0.4, complexity: 0.2, flux_norm: 1, area_msh: 30, tilt_deg: 5 },
      { id: 2, birth: { lat_deg: -15, lon_deg: 90, time_seconds: 0 }, model_position: { lat_deg: -15, lon_deg: 91 }, confidence: 0.8, complexity: 0.7, flux_norm: 2, area_msh: 40, tilt_deg: -5 },
    ],
    operational_readiness: { research_learning_ready: true, space_weather_operational: false,
      data_state: { source_mode: "synthetic", observation_mode: "none" },
      gates: [{ id: "snapshot_contract", label: "Snapshot contract", passed: true }, { id: "historical_validation", passed: false }], blockers: ["Unqualified for warnings"] },
    observed_context: { space_weather_signals: { latest_kp: 4, latest_f107: 120, latest_goes_xray_flux: 0.000012, latest_solar_wind_speed_km_s: 420 } },
  };
  store.presentation = { headline: "Synthetic solar maximum", sourceKind: "synthetic", showModelOverlays: true, coordinateLabel: "Modeled anchors" };
  store.wavelength = "model";
  store.seriesRecords = [{ id: "frame-0", months: 0, index: 0, status: "ready" }, { id: "frame-12", months: 12, index: 1, status: "unavailable" }];
  return { ...host, context, panels, tour, tooltip, store, events, saved, scrolls, renderCount: () => renderCount };
}

test("panels present current numeric facts, source limitations and keyboard glossary controls", async () => {
  const h = await panelHarness(); h.panels.updateText();
  assert.equal(h.nodes.get("brMax").textContent, "2.000");
  assert.equal(h.nodes.get("confidenceMean").textContent, "0.400");
  assert.equal(h.nodes.get("regionCount").textContent, "2");
  assert.equal(h.nodes.get("plainInsight").textContent, "Synthetic solar maximum");
  assert.equal(h.nodes.get("sourceMode").title, "synthetic");
  assert.match(h.nodes.get("summaryPrimary").textContent, /Mean heuristic model score 0.40 \(not probability\)/);
  assert.match(h.nodes.get("summaryDetail").textContent, /Max normalized \|Br\| is 2.00/);
  assert.equal(h.nodes.get("dataState").className, "state-pill fixture");
  assert.equal(h.nodes.get("readinessState").textContent, "readiness: research ready");
  assert.equal(h.nodes.get("ingestState").textContent, "feed: not run");
  assert.equal(h.nodes.get("warningList").textContent, "Research only; No warning authority");
  assert.equal(h.nodes.get("selectionTitle").textContent, "Click an active region");
  const legend = h.nodes.get("layerLegend");
  assert.equal(legend.children.length, 4);
  assert.equal(legend.children[1].getAttribute("data-term"), "confidence");
  assert.equal(legend.children[1].getAttribute("tabindex"), "0");
  assert.equal(legend.children[1].getAttribute("role"), "button");
  assert.match(legend.children[3].textContent, /Heuristic model score — not probability/);
  assert.deepEqual(h.nodes.get("applicationSignals").children.map(node => node.textContent), ["Kp 4.0", "F10.7 120.0", "GOES 1.20e-5", "wind 420 km/s"]);
  assert.equal(h.nodes.get("applicationSignals").children[0].getAttribute("data-term"), "kp");
  assert.equal(h.nodes.get("applicationSignals").children[0].style.cursor, "help");
  const checklist = h.nodes.get("operationalReadiness").firstElementChild;
  assert.equal(checklist.getAttribute("aria-label"), "Operational readiness checklist");
  assert.deepEqual(checklist.children.map(row => row.firstElementChild.textContent), ["PASS", "BLOCKED", "PASS", "BLOCKED", "BLOCKED"]);
  assert.match(checklist.children[3].textContent, /historical validation/);
  assert.match(checklist.children[4].textContent, /Unqualified for warnings/);
});

test("keyed region and cycle controls preserve identity, filter results and dispatch current selection", async () => {
  const h = await panelHarness(); h.panels.updateText();
  const list = h.nodes.get("regionList"), first = list.children[0], second = list.children[1];
  first.focus();
  h.store.selectedRegionId = 2;
  h.store.state.active_regions.reverse();
  h.nodes.get("regionSearch").value = "AR 2";
  h.store.timelineIndex = 1;
  const retainedFrame = h.nodes.get("cycleFrameTable").children[1];
  h.panels.updateText();
  assert.equal(list.children[0], second);
  assert.equal(list.children[1], first);
  assert.equal(h.document.activeElement, first);
  assert.equal(first.hidden, true);
  assert.equal(second.getAttribute("aria-pressed"), "true");
  assert.equal(h.nodes.get("regionSearchStatus").textContent, "1 of 2 modeled regions shown");
  assert.match(h.nodes.get("selectionTitle").textContent, /AR 2: modeled anchor: lat -15.0°, lon 91.0° W/);
  assert.match(h.nodes.get("selectionText").textContent, /Immutable birth:/);
  assert.equal(h.nodes.get("selection").classList.contains("selected"), true);
  second.click();
  const table = h.nodes.get("cycleFrameTable");
  assert.equal(table.children[1], retainedFrame);
  assert.equal(retainedFrame.children[1].textContent, "Unavailable — no interpolation");
  assert.equal(retainedFrame.children[2].firstElementChild.getAttribute("aria-pressed"), "true");
  retainedFrame.children[2].firstElementChild.click();
  assert.deepEqual(h.events, [{ type: "sol:region-selected", detail: 2 }, { type: "sol:frame-selected", detail: 1 }]);
  h.store.state.active_regions = [h.store.state.active_regions[0]];
  h.store.seriesRecords = [h.store.seriesRecords[1]];
  h.panels.updateText();
  assert.equal(list.children.length, 1);
  assert.equal(first.parentElement, null);
  assert.equal(table.children.length, 1);
  assert.equal(table.children[0], retainedFrame);
});

test("stage and mode changes update class and assistive-technology state together", async () => {
  const h = await panelHarness();
  for (const [label, expected] of [["solar minimum", "minimum"], ["rising phase", "rising"], ["declining phase", "declining"], ["solar maximum", "maximum"], ["unknown cycle", "maximum"]]) {
    h.store.state.learning.cycle_stage = label; h.panels.updateText();
    assert.deepEqual(h.nodes.get("stageRail").children.filter(node => node.classList.contains("active")).map(node => node.dataset.stage), [expected]);
    for (const node of h.nodes.get("stageRail").children) assert.equal(node.getAttribute("aria-current"), node.dataset.stage === expected ? "true" : null);
  }
  h.store.activeMode = "sky"; h.panels.updateModeButtons();
  assert.equal(h.nodes.get("mode-sky").getAttribute("aria-pressed"), "true");
  assert.equal(h.nodes.get("mode-today").getAttribute("aria-pressed"), "false");
  assert.equal(h.nodes.get("mode-sky").classList.contains("active"), true);
});

test("feed panels disclose failed sources, overdue age and stale Kp without relabelling old health", async () => {
  const h = await panelHarness();
  h.store.feedStatus = { status: "ok", last_run_utc: "2026-09-08T00:00:00Z", next_recommended_run_utc: "2026-09-09T00:00:00Z",
    sources: [{ ok: true, file: "kp.json" }, { ok: false, source: "wind" }, { ok: false }] };
  h.store.sky = { observer: { lat: 65, lon: -20, label: "Test observer" } };
  h.panels.updateText();
  assert.match(h.nodes.get("feedHealth").textContent, /ok \(at last run\).*1 of 3 public sources.*3 days overdue/);
  assert.match(h.nodes.get("feedHealth").textContent, /Failed sources: wind, unknown/);
  assert.equal(h.nodes.get("ingestState").className, "state-pill degraded");
  assert.match(h.nodes.get("auroraOutlook").textContent, /Test observer/);
  assert.match(h.nodes.get("auroraOutlook").textContent, /Kp is from the last completed feed run/);
  h.store.feedStatus.next_recommended_run_utc = "2026-09-12T00:00:00Z";
  h.store.feedStatus.sources = null;
  h.panels.updateText();
  assert.match(h.nodes.get("feedHealth").textContent, /daily feed is overdue;/);
  assert.match(h.nodes.get("feedHealth").textContent, /No source failures are reported/);
  assert.equal(h.nodes.get("ingestState").textContent, "feed: overdue");
  h.store.state.observed_context.space_weather_signals.latest_kp = null;
  h.panels.updateText();
  assert.match(h.nodes.get("auroraOutlook").textContent, /Aurora outlook unavailable/);
  assert.doesNotMatch(h.nodes.get("auroraOutlook").textContent, /Kp is from the last completed/);
});

test("degraded snapshots and absent optional panel nodes produce explicit fallback text", async () => {
  const h = await panelHarness({ absent: ["layerLegend", "applicationSignals", "auroraOutlook", "operationalReadiness", "regionList", "cycleFrameTable"] });
  h.store.state = {}; h.store.presentation = null; h.store.activeMode = "missing"; h.store.selectedRegionId = 9;
  h.panels.updateText();
  assert.equal(h.nodes.get("plainInsight").textContent, "Snapshot is missing expected fields; degraded fallback rendering is active.");
  assert.equal(h.nodes.get("brMax").textContent, "0.000");
  assert.equal(h.nodes.get("confidenceMean").textContent, "0.000");
  assert.equal(h.nodes.get("schemaVersion").textContent, "unknown");
  assert.equal(h.nodes.get("calibrationState").textContent, "not reported");
  assert.equal(h.nodes.get("warningList").textContent, "none");
  assert.equal(h.nodes.get("selection").classList.contains("selected"), false);
});

test("missing snapshot metadata remains visibly blocked with no fabricated weather or region values", async () => {
  const h = await panelHarness({ absent: ["regionSearch"] });
  h.store.state = { fields: { br_normalized: { values: [] }, continuum_proxy: { values: [] } } };
  h.store.presentation = null;
  h.panels.updateText();
  assert.equal(h.nodes.get("plainInsight").textContent, "Loading model and source evidence…");
  assert.equal(h.nodes.get("readinessState").textContent, "readiness: blocked");
  assert.equal(h.nodes.get("regionSearchStatus").textContent, "0 of 0 modeled regions shown");
  assert.equal(h.nodes.get("regionList").children.length, 0);
  assert.deepEqual(h.nodes.get("applicationSignals").children.map(node => node.textContent), ["Kp n/a", "F10.7 n/a", "GOES n/a", "wind n/a km/s"]);
  assert.match(h.nodes.get("auroraOutlook").textContent, /Aurora outlook unavailable/);
  const checklist = h.nodes.get("operationalReadiness").firstElementChild;
  assert.deepEqual(checklist.children.map(row => row.firstElementChild.textContent), ["BLOCKED", "BLOCKED"]);
  assert.match(checklist.children[0].textContent, /Research\/learning readiness has not passed for this snapshot/);
  assert.match(checklist.children[1].textContent, /Blocked for warnings, mission safety, fleet operations, and production decisions/);
});

test("readiness and observed-image controls expose snapshot status without retaining model overlays", async () => {
  const h = await panelHarness({ absent: ["auroraOutlook"] });
  h.store.state.operational_readiness = { research_learning_ready: true, space_weather_operational: true, gates: [], blockers: [] };
  h.store.presentation = { headline: "Observed image", sourceKind: "observed", showModelOverlays: false };
  h.store.wavelength = "continuum";
  h.panels.updateText();
  assert.equal(h.nodes.get("readinessState").textContent, "readiness: operational");
  const checklist = h.nodes.get("operationalReadiness").firstElementChild;
  assert.deepEqual(checklist.children.map(row => row.firstElementChild.textContent), ["PASS", "PASS"]);
  assert.match(checklist.children[1].textContent, /Operational use is marked enabled by the snapshot/);
  assert.equal(h.nodes.get("layerLegend").children.length, 1);
  assert.match(h.nodes.get("layerLegend").textContent, /observed/);
  assert.doesNotMatch(h.nodes.get("layerLegend").textContent, /Heuristic model score/);
  h.store.state.operational_readiness = { gates: {}, blockers: null };
  h.store.presentation.showModelOverlays = true;
  h.nodes.get("layerConfidence").checked = false;
  h.nodes.get("layerRegions").checked = false;
  h.panels.updateText();
  assert.equal(h.nodes.get("layerLegend").children.length, 1);
  assert.deepEqual(h.nodes.get("operationalReadiness").firstElementChild.children.map(row => row.firstElementChild.textContent), ["BLOCKED", "BLOCKED"]);
});

test("fresh and unknown feed records distinguish source failure from overdue data", async () => {
  const h = await panelHarness();
  h.store.feedStatus = { status: "ok", last_run_utc: "2026-09-12T00:00:00Z", next_recommended_run_utc: "2026-09-13T00:00:00Z",
    sources: [{ ok: true, file: "kp.json" }, { ok: false, file: "missing-wind.json" }] };
  h.panels.updateText();
  assert.equal(h.nodes.get("ingestState").textContent, "feed: daily ok");
  assert.equal(h.nodes.get("ingestState").className, "state-pill live");
  assert.match(h.nodes.get("feedHealth").textContent, /Daily feed status is ok\. 1 of 2 public sources/);
  assert.match(h.nodes.get("feedHealth").textContent, /Failed sources: missing-wind.json/);
  assert.doesNotMatch(h.nodes.get("feedHealth").textContent, /overdue|at last run/);
  assert.doesNotMatch(h.nodes.get("auroraOutlook").textContent, /Kp is from the last completed/);
  h.store.feedStatus = {};
  h.panels.updateText();
  assert.equal(h.nodes.get("ingestState").textContent, "feed: unknown");
  assert.equal(h.nodes.get("ingestState").className, "state-pill blocked");
  assert.match(h.nodes.get("feedHealth").textContent, /Daily feed status is unknown\. 0 of 0 public sources/);
  assert.doesNotMatch(h.nodes.get("feedHealth").textContent, /overdue|at last run/);
});

test("tour starts only on request, makes background inert, and restores the opener on exit", async () => {
  const h = await panelHarness(); h.nodes.get("priorFocus").focus(); h.store.activeMode = "sky";
  h.tour.maybeAutoStartTour();
  assert.equal(h.nodes.get("tourLayer").hidden, true);
  assert.equal(h.document.activeElement, h.nodes.get("priorFocus"));
  h.tour.startTour();
  assert.equal(h.store.activeMode, "today");
  assert.equal(h.store.tourIndex, 0);
  assert.equal(h.nodes.get("tourLayer").hidden, false);
  assert.equal(h.nodes.get("main").getAttribute("inert"), "");
  assert.equal(h.document.activeElement, h.nodes.get("tourCard"));
  assert.equal(h.nodes.get("tourBack").disabled, true);
  assert.equal(h.nodes.get("tourNext").textContent, "Next");
  assert.equal(h.nodes.get("tourStepCount").textContent, "Step 1 of 7");
  assert.equal(h.nodes.get("tourTitle").textContent, "Explore the Sun");
  assert.equal(h.nodes.get("tourSpot").classList.contains("hidden"), true);
  assert.equal(h.nodes.get("tourCard").style.left, "280px");
  assert.equal(h.nodes.get("tourCard").style.top, "240px");
  assert.deepEqual(h.scrolls, [[0, 0]]);
  assert.equal(h.renderCount(), 1);
  assert.equal(h.nodes.get("controls").scrollTop, 0);
  h.tour.endTour();
  assert.equal(h.nodes.get("tourLayer").hidden, true);
  assert.equal(h.nodes.get("main").getAttribute("inert"), null);
  assert.equal(h.store.tourIndex, -1);
  assert.equal(h.saved.get("sol-tour-seen"), "1");
  assert.equal(h.document.activeElement, h.nodes.get("tourStart"));
});

test("tour spotlight and card stay inside viewport and last step finishes cleanly", async () => {
  const h = await panelHarness(); h.tour.startTour();
  h.nodes.get("solarCanvas").rect = { left: 750, top: 520, width: 40, height: 60 };
  h.store.tourIndex = 1; h.tour.showTourStep();
  assert.equal(h.nodes.get("tourSpot").style.left, "744px");
  assert.equal(h.nodes.get("tourSpot").style.top, "514px");
  assert.equal(h.nodes.get("tourSpot").style.width, "52px");
  assert.equal(h.nodes.get("tourSpot").style.height, "72px");
  assert.equal(h.nodes.get("tourCard").style.left, "552px");
  assert.equal(h.nodes.get("tourCard").style.top, "388px");
  assert.equal(h.nodes.get("tourBack").disabled, false);
  h.nodes.get("solarCanvas").rect = { left: -100, top: 10, width: 20, height: 20 };
  h.tour.showTourStep();
  assert.equal(h.nodes.get("tourCard").style.left, "8px");
  assert.equal(h.nodes.get("tourCard").style.top, "42px");
  h.store.tourIndex = 6; h.tour.showTourStep();
  assert.equal(h.nodes.get("tourNext").textContent, "Done");
  assert.equal(h.nodes.get("tourTitle").textContent, "You're set");
  h.store.tourIndex = 7; h.tour.showTourStep();
  assert.equal(h.nodes.get("tourLayer").hidden, true);
});

test("tour traps forward/backward Tab while leaving ordinary navigation alone", async () => {
  const h = await panelHarness(); h.tour.startTour();
  const card = h.nodes.get("tourCard"), next = h.nodes.get("tourNext"), skip = h.nodes.get("tourSkip");
  card.focus();
  assert.equal(card.dispatch("keydown", { key: "Tab", shiftKey: true }).defaultPrevented, true);
  assert.equal(h.document.activeElement, skip);
  assert.equal(card.dispatch("keydown", { key: "Tab", shiftKey: false }).defaultPrevented, true);
  assert.equal(h.document.activeElement, next);
  assert.equal(card.dispatch("keydown", { key: "Tab", shiftKey: true }).defaultPrevented, true);
  assert.equal(h.document.activeElement, skip);
  assert.equal(card.dispatch("keydown", { key: "Escape" }).defaultPrevented, false);
  next.focus();
  assert.equal(card.dispatch("keydown", { key: "Tab", shiftKey: false }).defaultPrevented, false);
  for (const button of [h.nodes.get("tourBack"), next, skip]) button.disabled = true;
  assert.equal(card.dispatch("keydown", { key: "Tab" }).defaultPrevented, false);
});

test("tour restores visible prior focus when opener is hidden even if storage is blocked", async () => {
  const h = await panelHarness({ blockedStorage: true });
  h.nodes.get("tourStart").offsetParent = null;
  const prior = h.nodes.get("priorFocus"); prior.focus(); h.tour.startTour(); h.tour.endTour();
  assert.equal(h.document.activeElement, prior);
  assert.equal(h.nodes.get("main").getAttribute("inert"), null);
  assert.equal(h.saved.size, 0);
  prior.focus(); h.tour.startTour(); prior.remove(); h.tour.endTour();
  assert.notEqual(h.document.activeElement, prior);
  assert.equal(h.nodes.get("tourLayer").hidden, true);
});

test("missing tour layer or card leaves safe lifecycle calls and no forced focus", async () => {
  const missing = await panelHarness({ absent: ["tourLayer"] });
  missing.nodes.get("priorFocus").focus(); missing.tour.startTour();
  assert.equal(missing.store.tourIndex, -1);
  assert.equal(missing.document.activeElement, missing.nodes.get("priorFocus"));
  const noCard = await panelHarness({ absent: ["tourCard", "main"] });
  noCard.tour.startTour();
  assert.equal(noCard.nodes.get("tourLayer").hidden, false);
  noCard.store.tourIndex = 1; noCard.tour.showTourStep(); noCard.tour.endTour();
  assert.equal(noCard.nodes.get("tourLayer").hidden, true);
  const targetWithoutCard = await panelHarness({ absent: ["tourCard", "controls"] });
  targetWithoutCard.tour.startTour();
  targetWithoutCard.store.tourIndex = 1; targetWithoutCard.tour.showTourStep();
  assert.equal(targetWithoutCard.nodes.get("tourSpot").classList.contains("hidden"), false);
  assert.equal(targetWithoutCard.nodes.get("tourSpot").style.width, "252px");
  targetWithoutCard.tour.endTour();
  assert.equal(targetWithoutCard.nodes.get("tourLayer").hidden, true);
});

test("tooltip renders plain glossary text, changes ARIA owner and cleans up pinned state", async () => {
  const h = await panelHarness();
  const first = h.add("firstTerm", "button"), second = h.add("secondTerm", "button");
  first.setAttribute("data-term", "confidence"); second.setAttribute("data-term", "kp");
  assert.equal(h.tooltip.isTipHidden(), true);
  h.tooltip.showTip(first);
  const tip = h.nodes.get("termTip");
  assert.equal(h.tooltip.isTipHidden(), false);
  assert.equal(tip.firstElementChild.textContent, "Heuristic model score");
  assert.match(tip.textContent, /not probability, calibrated uncertainty/);
  assert.equal(first.getAttribute("aria-describedby"), "termTip");
  h.tooltip.showTip(second);
  assert.equal(first.getAttribute("aria-describedby"), null);
  assert.equal(second.getAttribute("aria-describedby"), "termTip");
  assert.equal(tip.firstElementChild.textContent, "Kp index");
  h.store.tipPinned = true; h.tooltip.hideTip(); h.tooltip.hideTip();
  assert.equal(second.getAttribute("aria-describedby"), null);
  assert.equal(h.store.tipPinned, false);
  assert.equal(h.tooltip.isTipHidden(), true);
});

test("tooltip placement clamps each edge and unknown terms do not replace visible definitions", async () => {
  const h = await panelHarness(), target = h.add("targetTerm", "button");
  target.setAttribute("data-term", "kp"); target.rect = { left: 790, top: 560, width: 10, height: 20 };
  h.nodes.get("termTip").rect = { left: 0, top: 0, width: 240, height: 60 };
  h.tooltip.showTip(target);
  assert.equal(h.nodes.get("termTip").style.left, "552px");
  assert.equal(h.nodes.get("termTip").style.top, "492px");
  target.rect = { left: -20, top: -30, width: 10, height: 10 }; h.tooltip.showTip(target);
  assert.equal(h.nodes.get("termTip").style.left, "8px");
  assert.equal(h.nodes.get("termTip").style.top, "8px");
  const unknown = h.add("unknownTerm", "button"); unknown.setAttribute("data-term", "missing"); h.tooltip.showTip(unknown);
  assert.equal(h.nodes.get("termTip").firstElementChild.textContent, "Kp index");
  assert.equal(unknown.getAttribute("aria-describedby"), null);
  const missing = await panelHarness({ absent: ["termTip"] });
  missing.tooltip.showTip(target); missing.store.tipPinned = true; missing.tooltip.hideTip();
  assert.equal(missing.tooltip.isTipHidden(), true);
  assert.equal(missing.store.tipPinned, false);
});
