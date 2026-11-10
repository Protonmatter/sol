import {writeText,writeAttribute,writeBoolean} from './domWrites.js';

// The render orchestrator + per-surface progressive disclosure.

import { store } from "./store.js?v=dcca6290db";
import { renderWorkspace } from "./workspace.js?v=dcca6290db";
import { explorer, renderExplorer, currentObservationPresentation } from "./explorer.js?v=dcca6290db";
import {getResearchRenderer,getDestinationRenderer} from './viewRegistry.js';

/** @param {unknown} [intent] */
export function renderAll(intent=null) {
  applySurfaceVisibility();
  const observing = store.activeMode === 'today' && explorer.mode === 'observe';
  const researching = store.activeMode === 'today' && !observing;
  const research=getResearchRenderer();
  if(researching)research?.prepare(true);
  updateTaskHeader();
  if(researching)research?.draw(true,intent==="resize");
}

export function currentViewPresentation() {
  return store.activeMode === 'today' ? (explorer.mode === 'observe' ? currentObservationPresentation() : store.presentation)
    : store.activeMode === 'sky' ? store.sky?.presentation : store.orrery?.presentation;
}

export function updateTaskHeader() {
  const sun = store.activeMode === "today";
  const observing = sun && explorer.mode === 'observe';
  renderExplorer(store.activeMode);
  const destination=getDestinationRenderer();
  if(destination&&(sun||(store.activeMode==='sky'?store.sky:store.orrery)))destination(store.activeMode,store.sky,store.orrery);
  else if(!sun)renderPendingDestination();
  const presentation = currentViewPresentation();
  const title = document.getElementById("viewTitle");
  if (title) writeText(title, sun ? (observing ? 'The Sun' : 'Solar research') : store.activeMode === "sky" ? "My Sky" : "Solar System");
  const plain = document.getElementById("plainInsight"), surface = document.getElementById("surfaceInsight");
  if (plain) { writeBoolean(plain, 'hidden', !sun); if (observing) writeText(plain, presentation.headline);
    else if(!presentation)writeText(plain, 'The solar model is separate from the saved observation.'); }
  if (surface) { writeBoolean(surface, 'hidden', sun); writeText(surface, presentation?.headline || "Loading this view on your device…"); }
  const source = document.getElementById("viewSource"), time = document.getElementById("viewTime");
  if (source) writeText(source, presentation ? `${presentation.sourceKind} · ${presentation.providerLabel || "sources and limits available"}` : "Source: awaiting validated data");
  if (time) writeText(time, presentation?.timeLabel || "Time: awaiting validated data");
  const availability = document.getElementById("viewAvailability");
  if (availability) writeText(availability, observing ? (explorer.media === 'ready' ? 'Saved observation · false-color ultraviolet' : `Saved observation · ${explorer.media}`) : `View: ${(presentation?.availability || "awaiting validated data").replaceAll("_", " ")} · research and learning only${!sun && presentation?.error ? ` · ${presentation.error}` : ""}`);
  const status = document.getElementById("snapshotStatus"), retry = document.getElementById("retrySnapshot");
  const failed = sun && !observing && Boolean(presentation?.error);
  if (status) {
    writeBoolean(status, 'hidden', !failed);
    writeText(status, !failed ? "" : `Model-data update failed. ${presentation.availability === "last_valid" ? `Last validated model retained at elapsed time ${store.state.run?.time_seconds ?? "unknown"} s.` : "No validated model is available; the fallback is illustrative."} ${presentation.error} Observed imagery, when selected, remains a separate source.`);
  }
  if (retry) writeBoolean(retry, 'hidden', !failed);
}

function renderPendingDestination(){
  const text=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
  text('destinationEyebrow','ON YOUR DEVICE');
  text('destinationTitle',store.activeMode==='sky'?'My Sky':'Solar System');
  text('destinationDescription','Preparing this view…');text('destinationNote','');text('destinationCaption','Preparing this view…');
  const facts=document.getElementById('destinationFacts');if(facts){facts.replaceChildren();delete facts.dataset.content;}
  for(const id of ['destinationPreview','destinationAppearance','destinationFocus','destinationEarthLayers','systemJumps']){
    const node=document.getElementById(id);if(node)node.hidden=true;
  }
}

export function applySurfaceVisibility() {
  // Surface visibility is entirely CSS-driven off body[data-surface]; the Sun's depth lives in the
  // collapsible `.sun-section` drawers (hidden on My Sky / Solar System). Just set the attribute.
  const panel = document.querySelector(".control-panel");
  if (panel) writeAttribute(panel, "data-surface", store.activeMode);
  writeAttribute(document.body, "data-surface", store.activeMode);
  renderWorkspace(store.activeMode);
}
