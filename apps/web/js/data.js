// Snapshot / series / feed-status loaders and the observed-image cache.

import { store } from "./store.js?v=aebfcb9c5a";
import { FALLBACK_STATE, BASE_IMAGES } from "./config.js?v=aebfcb9c5a";
import { renderAll } from "./view.js?v=aebfcb9c5a";
import { maybeAutoStartTour } from "./tour.js?v=aebfcb9c5a";

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
  // "model" = the synthetic engine view; any other value = that real SDO wavelength channel.
  if (!store.wavelength || store.wavelength === "model") return null;
  const entry = loadBaseImage(store.wavelength);
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
