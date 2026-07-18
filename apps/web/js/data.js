// Snapshot / series / feed-status loaders and the observed-image cache.

import { store } from "./store.js?v=8a19107712";
import { FALLBACK_STATE, BASE_IMAGES } from "./config.js?v=8a19107712";
import { renderAll } from "./view.js?v=8a19107712";
import { maybeAutoStartTour } from "./tour.js?v=8a19107712";

const baseImageCache = {};

function loadBaseImage(key) {
  if (baseImageCache[key]) return baseImageCache[key];
  const cfg = BASE_IMAGES[key];
  if (!cfg) return null;
  const img = new Image();
  img.decoding = "async";
  const announce = () => window.dispatchEvent(new Event("sol:baseimage")); // caption provenance refresh
  img.onload = () => { renderAll(); announce(); };
  img.onerror = () => { entry.failed = true; renderAll(); announce(); }; // relabel as synthetic immediately
  img.src = cfg.url;
  const entry = { img, cfg, failed: false };
  baseImageCache[key] = entry;
  return entry;
}

// Give a failed channel another chance when the user selects it again — a transient network
// blip used to pin that wavelength to the synthetic fallback for the tab's whole life (the
// same reasoning engine.js documents for retrying its WASM fetch). Deliberately NOT retried
// automatically from onerror: that would loop through renderAll while the network is down.
export function retryBaseImage(key) {
  if (baseImageCache[key] && baseImageCache[key].failed) delete baseImageCache[key];
}

// Whether the current wavelength's live image is showing, for provenance-consistent captions.
export function baseImageState(key) {
  const entry = baseImageCache[key];
  if (!entry) return "pending";
  if (entry.failed) return "failed";
  return entry.img.complete && entry.img.naturalWidth > 0 ? "live" : "pending";
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
    // no-cache = always revalidate but reuse on 304. The data changes at most daily;
    // no-store forced a full ~450 KB re-download of snapshot + series every visit.
    const response = await fetch("data/latest-state.json", { cache: "no-cache" });
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
    const response = await fetch("data/feed-status.json", { cache: "no-cache" });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

export async function loadSeries() {
  try {
    const response = await fetch("data/series/manifest.json", { cache: "no-cache" });
    if (!response.ok) return;
    store.seriesManifest = await response.json();
    // Per-frame .catch: one dropped connection must not reject the whole Promise.all
    // and discard the frames that DID load (Play/scrub would be dead for the session).
    const frames = await Promise.all(
      (store.seriesManifest.frames || []).map((entry) =>
        fetch(`data/series/${entry.file}`, { cache: "no-cache" })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
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
