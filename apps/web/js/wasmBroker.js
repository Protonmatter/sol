// A realm owns compiled code only. Every consumer instantiates its own mutable
// memory; the main realm supplies Modules to workers by structured clone.
export const EPHEMERIS_WASM_URL = new URL('../pkg/solar_ephemeris.wasm', import.meta.url).href;
export const SOLAR_WASM_URL = new URL('../pkg/solar_wasm.wasm', import.meta.url).href;

export function createWasmModuleBroker({
  fetchResource = (url, options) => fetch(url, options),
  compileModule = bytes => WebAssembly.compile(bytes),
  deadlineMs = 60000, now = () => performance.now(),
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw new RangeError('Invalid WASM asset deadline');
  /** @type {Map<string, Promise<WebAssembly.Module>>} */
  const modules = new Map();
  return {
    /** @returns {Promise<WebAssembly.Module>} */
    compiledModule(url) {
      const key = new URL(url).href;
      if (modules.has(key)) return modules.get(key);
      const controller = new AbortController();
      const started = now();
      let timer;
      const deadlineError = () => new Error('WASM asset compilation exceeded its wall deadline');
      const work = (async () => {
        const response = await fetchResource(key, {cache:'no-cache',signal:controller.signal});
        if (!response.ok) throw new Error(`wasm HTTP ${response.status}`);
        // Buffer compilation also works when static hosts send missing/wrong MIME.
        const module = await compileModule(await response.arrayBuffer());
        const finished = now();
        if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) throw new Error('WASM asset clock must be finite and monotonic');
        if (finished - started >= deadlineMs) throw deadlineError();
        return module;
      })();
      /** @type {Promise<WebAssembly.Module>} */
      const timeout = new Promise((_, reject) => {
        timer = setTimer(() => { controller.abort(); reject(deadlineError()); }, deadlineMs);
      });
      const promise = Promise.race([work,timeout]).finally(() => clearTimer(timer));
      modules.set(key,promise);
      // A late rejected attempt must never evict a newer successful compilation.
      promise.catch(() => { if (modules.get(key) === promise) modules.delete(key); });
      return promise;
    },
  };
}
const broker = createWasmModuleBroker();
export const compileEphemerisModule = () => broker.compiledModule(EPHEMERIS_WASM_URL);
export const compileSolarModule = () => broker.compiledModule(SOLAR_WASM_URL);
