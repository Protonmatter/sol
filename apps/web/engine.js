// ES module: loads the real solar-core engine (compiled to WebAssembly) and runs
// it in the browser. Raw ABI — `simulate` returns a pointer into wasm linear
// memory and `result_len` gives the byte length; we decode the UTF-8 JSON, which
// must pass the active solar schema and semantics before any caller receives it.

import { parseSolarSnapshot, parseStrictJson } from "./js/solarContract.js?v=dcca6290db";
import { validateSolarRequest } from "./js/engineLimits.js?v=dcca6290db";
import { EngineError } from "./js/workerClient.js?v=dcca6290db";

let wasmExports = null;
let loadPromise = null;

export function loadEngine() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    // Use instantiate(arrayBuffer) rather than instantiateStreaming so it works
    // even when the static server doesn't send the application/wasm MIME type.
    // cache:"no-cache" (NOT no-store): the wasm is built at deploy and is not folded
    // into the ?v= content hash (it's gitignored), so we must revalidate — but a 304
    // lets the browser reuse the cached bytes instead of re-downloading every visit.
    const response = await fetch(new URL("./pkg/solar_wasm.wasm?v=dcca6290db", import.meta.url), { cache: "no-cache" });
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

// Runs the real engine and returns a validated active-contract object.
// Read the bytes immediately and copy them out before any further wasm call.
export function simulateSnapshot({ seed = 42, steps = 24, dtHours = 1, activity = 0.9, lon = 72, lat = 36 } = {}) {
  validateSolarRequest({seed,steps,dtHours,activity,lon,lat});
  if (!wasmExports) throw new Error("engine not loaded");
  const ptr = wasmExports.simulate(seed, steps, dtHours, activity, lon, lat);
  const len = wasmExports.result_len();
  const view = new Uint8Array(wasmExports.memory.buffer, ptr, len);
  const json = new TextDecoder("utf-8").decode(view);
  const data = parseStrictJson(json);
  if(data?.schema_version === "engine-error.v1") throw new EngineError(data.error?.code || "engine_failed", data.error?.message || "Engine rejected request");
  return parseSolarSnapshot(json);
}
