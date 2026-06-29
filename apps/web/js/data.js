// Snapshot / series / feed-status loaders and the observed-image cache.

import { store } from "./store.js?v=ce663a8e7f";
import { FALLBACK_STATE, BASE_IMAGES } from "./config.js?v=ce663a8e7f";
import { controls } from "./dom.js?v=ce663a8e7f";
import { renderAll } from "./view.js?v=ce663a8e7f";
import { maybeAutoStartTour } from "./tour.js?v=ce663a8e7f";

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

export function currentBaseImage() {
  // Cycle playback and live WASM runs are synthetic models, not today's Sun.
  if (store.timelineIndex >= 0 || store.liveEngineRun) return null;
  // Prefer the white-light continuum photosphere when the Continuum layer is on;
  // fall back to the magnetogram if only it is selected.
  let key = null;
  if (controls.continuum.checked) key = "continuum";
  else if (controls.magnetogram.checked) key = "magnetogram";
  if (!key) return null;
  const entry = loadBaseImage(key);
  if (entry && !entry.failed && entry.img.complete && entry.img.naturalWidth > 0) return entry;
  return null;
}

export async function loadState() {
  try {
    const response = await fetch("data/latest-state.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    store.state = await response.json();
  } catch (error) {
    store.state = FALLBACK_STATE;
  }
  store.liveState = store.state;
  store.feedStatus = await loadFeedStatus();
  renderAll();
  maybeAutoStartTour();
  loadSeries();
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

export async function loadSeries() {
  try {
    const response = await fetch("data/series/manifest.json", { cache: "no-store" });
    if (!response.ok) return;
    store.seriesManifest = await response.json();
    const frames = await Promise.all(
      (store.seriesManifest.frames || []).map((entry) =>
        fetch(`data/series/${entry.file}`, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null))
      )
    );
    store.seriesFrames = frames.filter(Boolean);
    const scrubber = /** @type {HTMLInputElement|null} */ (document.getElementById("timeScrubber"));
    if (scrubber && store.seriesFrames.length) scrubber.max = String(store.seriesFrames.length - 1);
    renderAll();
  } catch (error) {
    store.seriesFrames = [];
  }
}
