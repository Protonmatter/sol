// ES module: loads the solar-ephemeris engine (WebAssembly) and validates
// provider-neutral ephemeris-snapshot.v2 responses from both local and server tiers.

import { assertEphemerisSnapshotV2 } from "./ephemerisContract.js?v=11ffac3b2b";

let wasmExports = null;
let loadPromise = null;

export function loadSkyEngine() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    // no-cache (revalidate, reuse on 304) rather than no-store: this module embeds the
    // packed VSOP2013/ELP/TOP tables (~0.5 MB) — re-downloading it on every visit was
    // the single largest repeat-load cost in the app.
    const response = await fetch("pkg/solar_ephemeris.wasm?v=11ffac3b2b", { cache: "no-cache" });
    if (!response.ok) throw new Error(`ephemeris wasm HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    wasmExports = instance.exports;
    return wasmExports;
  })();
  loadPromise.catch(() => { loadPromise = null; });
  return loadPromise;
}

function readResult(ptr, len) {
  const view = new Uint8Array(wasmExports.memory.buffer, ptr, len);
  return JSON.parse(new TextDecoder("utf-8").decode(view));
}

// Returns a validated ephemeris-snapshot.v2 for a Unix time + observer.
export function skySnapshot(unixSeconds, lat, lonEast, elev) {
  if (!wasmExports) throw new Error("sky engine not loaded");
  const ptr = wasmExports.sky_snapshot(unixSeconds, lat, lonEast, elev);
  const len = wasmExports.result_len();
  return assertEphemerisSnapshotV2(readResult(ptr, len));
}

// Returns system-snapshot.v1: heliocentric ecliptic positions for the orbit view.
export function systemSnapshot(unixSeconds) {
  if (!wasmExports) throw new Error("sky engine not loaded");
  const ptr = wasmExports.system_snapshot(unixSeconds);
  const len = wasmExports.result_len();
  return readResult(ptr, len);
}

// Body order of the raw positions fast path — must match system_snapshot_json's
// bodies array (the Rust side derives both from one shared table).
export const SYSTEM_POSITIONS_ORDER = [
  "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Moon",
];

// Per-frame fast path: raw f64 heliocentric positions straight out of linear memory —
// no JSON serialize/parse. Returns null when the loaded wasm predates the export
// (deploy-safe feature detection: the caller falls back to systemSnapshot), and COPIES
// the values out because the view dies if wasm memory grows.
export function systemPositions(unixSeconds) {
  if (!wasmExports || typeof wasmExports.system_positions !== "function") return null;
  const ptr = wasmExports.system_positions(unixSeconds);
  const len = wasmExports.system_positions_len();
  return new Float64Array(wasmExports.memory.buffer, ptr, len).slice();
}

export const BODY_INDEX = {
  Sun: 0, Moon: 1, Mercury: 2, Venus: 3, Mars: 4,
  Jupiter: 5, Saturn: 6, Uranus: 7, Neptune: 8,
};

export function bodyTrack(bodyIndex, lat, lonEast, elev, unix0, dtSeconds, n) {
  if (!wasmExports) throw new Error("sky engine not loaded");
  const ptr = wasmExports.body_track(bodyIndex, lat, lonEast, elev, unix0, dtSeconds, n);
  const len = wasmExports.result_len();
  return readResult(ptr, len);
}

// The optional provider must be explicitly configured by the deployment.
// Never default to localhost: on a public site that targets the visitor's machine.
const configuredBase =
  typeof window !== "undefined" && typeof window.SOL_EPHEMERIS_SERVER === "string"
    ? window.SOL_EPHEMERIS_SERVER.trim()
    : "";

export const SERVER_BASE = configuredBase.replace(/\/+$/, "");
export const SERVER_CONFIGURED = SERVER_BASE.length > 0;

function configureServerControl() {
  if (typeof document === "undefined") return;
  const button = document.getElementById("skyProviderServer");
  if (!button) return;
  if (!SERVER_CONFIGURED) {
    button.disabled = true;
    button.textContent = "JPL DE441 server (not configured)";
    button.title = "This deployment has no optional high-precision server endpoint.";
    button.setAttribute("aria-disabled", "true");
  } else {
    button.textContent = "JPL DE441 server (sends location)";
    button.title = "Sends the selected coordinates, elevation, and time to the configured Sol ephemeris server.";
  }
}
configureServerControl();

function consentKey() {
  return `sol-ephemeris-server-consent:${SERVER_BASE}`;
}

function ensureServerConsent() {
  if (typeof window === "undefined") return true;
  try {
    if (window.localStorage.getItem(consentKey()) === "granted") return true;
  } catch (_) {
    // Continue with session-only consent.
  }
  const granted = window.confirm(
    "Use the optional JPL DE441 server?\n\n"
    + "The selected latitude, longitude, elevation, and observation time will be sent "
    + "to the configured Sol ephemeris server. The default on-device engine sends nothing."
  );
  if (!granted) return false;
  try { window.localStorage.setItem(consentKey(), "granted"); } catch (_) { /* session only */ }
  return true;
}

export async function checkServerHealth(base = SERVER_BASE) {
  if (!base) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${base}/health`, {
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const health = await response.json();
    return health.status === "ok" && health.schema_version === "ephemeris-snapshot.v2";
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function discloseBrowserAugmentation(snapshot) {
  const provider = snapshot.provider;
  if (!provider || provider.tier !== "server") return snapshot;
  const disclosure =
    "Browser view may augment server body positions with on-device rise/transit/set events and catalogue stars.";
  provider.source = `${provider.source}; on-device Sol augmentation is identified in snapshot warnings`;
  if (!snapshot.warnings.includes(disclosure)) snapshot.warnings.push(disclosure);
  return snapshot;
}

export async function fetchServerSky(unixSeconds, lat, lonEast, elev, base = SERVER_BASE) {
  if (!base) throw new Error("JPL DE441 server is not configured for this deployment");
  if (!ensureServerConsent()) throw new Error("remote ephemeris request was not authorized");

  const url = new URL(`${base.replace(/\/+$/, "")}/v2/sky`, window.location.href);
  url.searchParams.set("unix", String(unixSeconds));
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lonEast));
  url.searchParams.set("elev", String(elev));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, {
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ephemeris server HTTP ${response.status}`);
    const snapshot = await response.json();
    if (snapshot.error) throw new Error(snapshot.error);
    return discloseBrowserAugmentation(assertEphemerisSnapshotV2(snapshot));
  } finally {
    clearTimeout(timer);
  }
}
