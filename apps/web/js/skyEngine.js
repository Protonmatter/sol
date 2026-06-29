// ES module: loads the solar-ephemeris engine (WebAssembly) and returns sky snapshots.
// Same raw-ABI pattern as engine.js, but a separate wasm module/instance.

let wasmExports = null;
let loadPromise = null;

export function loadSkyEngine() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const response = await fetch("pkg/solar_ephemeris.wasm", { cache: "no-store" });
    if (!response.ok) throw new Error(`ephemeris wasm HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    wasmExports = instance.exports;
    return wasmExports;
  })();
  return loadPromise;
}

// Returns a parsed ephemeris-snapshot.v1 for a Unix time + observer (lon east-positive).
export function skySnapshot(unixSeconds, lat, lonEast, elev) {
  if (!wasmExports) throw new Error("sky engine not loaded");
  const ptr = wasmExports.sky_snapshot(unixSeconds, lat, lonEast, elev);
  const len = wasmExports.result_len();
  const view = new Uint8Array(wasmExports.memory.buffer, ptr, len);
  return JSON.parse(new TextDecoder("utf-8").decode(view));
}

// Returns a parsed system-snapshot.v1: heliocentric ecliptic positions (AU) of the planets.
export function systemSnapshot(unixSeconds) {
  if (!wasmExports) throw new Error("sky engine not loaded");
  const ptr = wasmExports.system_snapshot(unixSeconds);
  const len = wasmExports.result_len();
  const view = new Uint8Array(wasmExports.memory.buffer, ptr, len);
  return JSON.parse(new TextDecoder("utf-8").decode(view));
}

// Optional high-precision tier (docs/SOLAR_SYSTEM_SPEC.md §2.1, P7): the same
// ephemeris-snapshot.v1 contract, served from the DE441 backend instead of the WASM engine.
// The base URL is overridable via window.SOL_EPHEMERIS_SERVER for non-localhost deployments.
export const SERVER_BASE =
  (typeof window !== "undefined" && window.SOL_EPHEMERIS_SERVER) || "http://localhost:8787";

export async function fetchServerSky(unixSeconds, lat, lonEast, elev, base = SERVER_BASE) {
  const url = `${base}/v1/sky?unix=${unixSeconds}&lat=${lat}&lon=${lonEast}&elev=${elev}`;
  const resp = await fetch(url, { mode: "cors" });
  if (!resp.ok) throw new Error(`ephemeris server HTTP ${resp.status}`);
  const snap = await resp.json();
  if (snap.error) throw new Error(snap.error);
  return snap;
}
