// ES module: loads the real solar-core engine (compiled to WebAssembly) and runs
// it in the browser. Raw ABI — `simulate` returns a pointer into wasm linear
// memory and `result_len` gives the byte length; we decode the UTF-8 JSON, which
// is a byte-compatible solar-state-snapshot.v1 the renderer already consumes.

let wasmExports = null;
let loadPromise = null;

export function loadEngine() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    // Use instantiate(arrayBuffer) rather than instantiateStreaming so it works
    // even when the static server doesn't send the application/wasm MIME type.
    const response = await fetch("pkg/solar_wasm.wasm?v=c044ef3203", { cache: "no-store" });
    if (!response.ok) throw new Error(`wasm HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    wasmExports = instance.exports;
    return wasmExports;
  })();
  // If the load fails, clear the memoized promise so a later call can retry —
  // otherwise one transient network blip disables the live engine for the tab's
  // whole life. Callers still see this attempt's rejection via the returned promise.
  loadPromise.catch(() => { loadPromise = null; });
  return loadPromise;
}

export function engineReady() {
  return wasmExports != null;
}

// Runs the real engine and returns a parsed solar-state-snapshot.v1 object.
// Read the bytes immediately and copy them out before any further wasm call.
export function simulateSnapshot({ seed = 42, steps = 24, dtHours = 1, activity = 0.9, lon = 72, lat = 36 } = {}) {
  if (!wasmExports) throw new Error("engine not loaded");
  const ptr = wasmExports.simulate(seed, steps, dtHours, activity, lon, lat);
  const len = wasmExports.result_len();
  const view = new Uint8Array(wasmExports.memory.buffer, ptr, len);
  const json = new TextDecoder("utf-8").decode(view);
  return JSON.parse(json);
}
