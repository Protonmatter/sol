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
