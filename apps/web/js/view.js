// The render orchestrator + per-surface progressive disclosure.

import { store } from "./store.js?v=dcca6290db";
import { updateText } from "./panels.js?v=dcca6290db";
import { drawSolarDisk, drawButterfly } from "./render.js?v=dcca6290db";
import { currentBaseImage, baseImageState } from "./data.js?v=dcca6290db";
import { resolvePresentation } from "./presentationState.js?v=dcca6290db";
import { renderWorkspace } from "./workspace.js?v=dcca6290db";
import { explorer, renderExplorer, currentObservationPresentation } from "./explorer.js?v=dcca6290db";
import { renderDestinationOverview } from './destinationOverview.js?v=dcca6290de';

export function renderAll() {
  applySurfaceVisibility();
  const observing = store.activeMode === 'today' && explorer.mode === 'observe';
  const researching = store.activeMode === 'today' && !observing;
  if (researching) currentBaseImage();
  store.presentation = resolvePresentation({ snapshot: store.state, wavelength: store.wavelength,
    imageState: baseImageState(store.wavelength), feedStatus: store.feedStatus,
    timeline: store.timelineIndex >= 0 ? store.seriesRecords[store.timelineIndex] : null,
    liveEngineRun: store.liveEngineRun, dataError: store.dataError, nowMs: Date.now() });
  document.getElementById("solarExport")?.toggleAttribute("disabled",store.state.schema_version !== "solar-state-snapshot.v3");
  updateText();
  updateTaskHeader();
  if (researching) drawSolarDisk();
  drawButterfly();
}

export function currentViewPresentation() {
  return store.activeMode === 'today' ? (explorer.mode === 'observe' ? currentObservationPresentation() : store.presentation)
    : store.activeMode === 'sky' ? store.sky?.presentation : store.orrery?.presentation;
}

export function updateTaskHeader() {
  const sun = store.activeMode === "today";
  const observing = sun && explorer.mode === 'observe';
  renderExplorer(store.activeMode);
  renderDestinationOverview(store.activeMode, store.sky, store.orrery);
  const presentation = currentViewPresentation();
  const title = document.getElementById("viewTitle");
  if (title) title.textContent = sun ? (observing ? 'The Sun' : 'Solar research') : store.activeMode === "sky" ? "My Sky" : "Solar System";
  const plain = document.getElementById("plainInsight"), surface = document.getElementById("surfaceInsight");
  if (plain) { plain.hidden = !sun; if (observing) plain.textContent = presentation.headline; }
  if (surface) { surface.hidden = sun; surface.textContent = presentation?.headline || "Loading this view on your device…"; }
  const source = document.getElementById("viewSource"), time = document.getElementById("viewTime");
  if (source) source.textContent = presentation ? `${presentation.sourceKind} · ${presentation.providerLabel || "sources and limits available"}` : "Source: awaiting validated data";
  if (time) time.textContent = presentation?.timeLabel || "Time: awaiting validated data";
  const availability = document.getElementById("viewAvailability");
  if (availability) availability.textContent = observing ? (explorer.media === 'ready' ? 'Saved observation · false-color ultraviolet' : `Saved observation · ${explorer.media}`) : `View: ${(presentation?.availability || "awaiting validated data").replaceAll("_", " ")} · research and learning only${!sun && presentation?.error ? ` · ${presentation.error}` : ""}`;
  const status = document.getElementById("snapshotStatus"), retry = document.getElementById("retrySnapshot");
  const failed = sun && !observing && Boolean(presentation?.error);
  if (status) {
    status.hidden = !failed;
    status.textContent = !failed ? "" : `Model-data update failed. ${presentation.availability === "last_valid" ? `Last validated model retained at elapsed time ${store.state.run?.time_seconds ?? "unknown"} s.` : "No validated model is available; the fallback is illustrative."} ${presentation.error} Observed imagery, when selected, remains a separate source.`;
  }
  if (retry) retry.hidden = !failed;
}

export function applySurfaceVisibility() {
  // Surface visibility is entirely CSS-driven off body[data-surface]; the Sun's depth lives in the
  // collapsible `.sun-section` drawers (hidden on My Sky / Solar System). Just set the attribute.
  const panel = document.querySelector(".control-panel");
  if (panel) panel.setAttribute("data-surface", store.activeMode);
  document.body.setAttribute("data-surface", store.activeMode);
  renderWorkspace(store.activeMode);
}
