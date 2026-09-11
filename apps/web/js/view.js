// The render orchestrator + per-surface progressive disclosure.

import { store } from "./store.js?v=dcca6290db";
import { updateText } from "./panels.js?v=dcca6290db";
import { drawSolarDisk, drawButterfly } from "./render.js?v=dcca6290db";
import { currentBaseImage, baseImageState } from "./data.js?v=dcca6290db";
import { resolvePresentation } from "./presentationState.js?v=dcca6290db";

export function renderAll() {
  applySurfaceVisibility();
  currentBaseImage();
  store.presentation = resolvePresentation({ snapshot: store.state, wavelength: store.wavelength,
    imageState: baseImageState(store.wavelength), feedStatus: store.feedStatus,
    timeline: store.timelineIndex >= 0 ? store.seriesRecords[store.timelineIndex] : null,
    liveEngineRun: store.liveEngineRun, dataError: store.dataError, nowMs: Date.now() });
  updateTaskHeader();
  document.getElementById("solarExport")?.toggleAttribute("disabled",store.state.schema_version !== "solar-state-snapshot.v3");
  updateText();
  drawSolarDisk();
  drawButterfly();
}

export function updateTaskHeader() {
  const sun = store.activeMode === "today";
  const presentation = sun ? store.presentation : store.activeMode === "sky" ? store.sky?.presentation : store.orrery?.presentation;
  const title = document.getElementById("viewTitle");
  if (title) title.textContent = sun ? "Explore the Sun" : store.activeMode === "sky" ? "Find your sky" : "Explore the Solar System";
  const plain = document.getElementById("plainInsight"), surface = document.getElementById("surfaceInsight");
  if (plain) plain.hidden = !sun;
  if (surface) { surface.hidden = sun; surface.textContent = presentation?.headline || "Loading this view on your device…"; }
  const source = document.getElementById("viewSource"), time = document.getElementById("viewTime");
  if (source) source.textContent = presentation ? `${presentation.sourceKind} · ${presentation.providerLabel || "sources and limits available"}` : "Source: awaiting validated data";
  if (time) time.textContent = presentation?.timeLabel || "Time: awaiting validated data";
  const status = document.getElementById("snapshotStatus"), retry = document.getElementById("retrySnapshot");
  const failed = sun && Boolean(presentation?.error);
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
}
