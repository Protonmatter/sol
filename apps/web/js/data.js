// Snapshot / series / feed-status loaders and the observed-image cache.

import { store } from "./store.js?v=dcca6290db";
import { FALLBACK_STATE, BASE_IMAGES } from "./config.js?v=dcca6290db";
import { renderAll } from "./view.js?v=dcca6290db";
import { maybeAutoStartTour } from "./tour.js?v=dcca6290db";
import { readDataBundle } from "./dataBundle.js?v=dcca6290db";
import { prepareBundlePublication } from "./timeline.js?v=dcca6290db";
import { dynamicSourceEligible } from "./visualAssets.js?v=dcca6290db";

const baseImageCache = {};

function loadBaseImage(key) {
  if (baseImageCache[key]) return baseImageCache[key];
  const cfg = BASE_IMAGES[key];
  if (!cfg) return null;
  if (!dynamicSourceEligible(key, cfg.url)) {
    const denied = { img: null, cfg, failed: true };
    baseImageCache[key] = denied;
    return denied;
  }
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

let loadGeneration = 0;

export async function loadState() {
  const generation = ++loadGeneration;
  try {
    const releaseId = "__SOL_RELEASE_ID__";
    const localPreview = releaseId.startsWith("__SOL_");
    const bundle = await readDataBundle(localPreview
      ? { pointerUrl: new URL("../data/current.json", import.meta.url).href }
      : { releaseUrl: new URL("../web-release-manifest.json", import.meta.url).href, expectedReleaseId: releaseId });
    if (generation !== loadGeneration) return;
    // All required bytes and identities passed before one synchronous publication.
    prepareBundlePublication();
    Object.assign(store, { state: bundle.snapshot, liveState: bundle.snapshot,
      timelineIndex: -1, liveEngineRun: false, selectedRegionId: null,
      dataBundleIdentity: bundle.identity,
      feedStatus: bundle.feedStatus, seriesManifest: bundle.seriesManifest,
      seriesRecords: bundle.seriesRecords, seriesFrames: bundle.seriesFrames,
      dataError: null, seriesError: null });
    const scrubber = /** @type {HTMLInputElement|null} */ (document.getElementById("timeScrubber"));
    if (scrubber) { scrubber.max = String(Math.max(0, bundle.seriesFrames.length - 1)); scrubber.value = "0"; }
    const liveStatus = document.getElementById("liveStatus");
    if (liveStatus) liveStatus.textContent = "Latest loaded feed context. Simulate starts a new calculation.";
  } catch (error) {
    if (generation !== loadGeneration) return;
    store.dataError = `Snapshot bundle unavailable or invalid: ${error.message}. Retaining the last valid view where available.`;
    store.seriesError = `Cycle series retained with its selected bundle: ${error.message}`;
    if (!store.state) { store.state = FALLBACK_STATE; store.liveState = FALLBACK_STATE; }
  }
  renderAll();
  maybeAutoStartTour();
}

// Compatibility entry point: a retry reloads one complete bundle, not a mutable
// series manifest independently of the currently displayed snapshot/status.
export async function loadSeries() { return loadState(); }
