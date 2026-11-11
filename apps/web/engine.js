// ES module: loads the real solar-core engine (compiled to WebAssembly) and runs
// it in the browser. Raw ABI — `simulate` returns a pointer into wasm linear
// memory and `result_len` gives the byte length; we decode the UTF-8 JSON, which
// must pass the active solar schema and semantics before any caller receives it.

import { parseSolarSnapshot, parseStrictJson } from "./js/solarContract.js";
import { validateSolarRequest } from "./js/engineLimits.js";
import { EngineError } from "./js/workerClient.js";

import { compileSolarModule } from "./js/wasmBroker.js";

let wasmExports = null;
let loadPromise = null;

/** @param {WebAssembly.Module} [compiledModule] */
export function loadEngine(compiledModule = undefined) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const module = compiledModule ?? await compileSolarModule();
    // Module instantiation returns an Instance (the byte overload returns a pair).
    // Each realm owns its own instance and memory, even when compiled code is shared.
    const instance = await WebAssembly.instantiate(module, {});
    wasmExports = instance.exports;
    return wasmExports;
  })();
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
  if (!engineReady()) throw new Error("engine not loaded");
  const ptr = wasmExports.simulate(seed, steps, dtHours, activity, lon, lat);
  const len = wasmExports.result_len();
  const view = new Uint8Array(wasmExports.memory.buffer, ptr, len);
  const json = new TextDecoder("utf-8").decode(view);
  const data = parseStrictJson(json);
  if(data?.schema_version === "engine-error.v1") throw new EngineError(data.error?.code || "engine_failed", data.error?.message || "Engine rejected request");
  return parseSolarSnapshot(json);
}
