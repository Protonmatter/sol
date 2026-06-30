// Shared mutable application state. With native ES modules you cannot reassign
// an imported binding, so cross-module state lives as properties on this object:
// every module imports `store` and reads/writes `store.x`.

import { FALLBACK_STATE } from "./config.js?v=a2360b7fc1";

export const store = {
  /** @type {import('./config.js').Snapshot} */
  state: FALLBACK_STATE,
  /** @type {import('./config.js').Snapshot} */
  liveState: FALLBACK_STATE,
  feedStatus: /** @type {any} */ (null),
  activeMode: "today",
  /** @type {number|null} */
  selectedRegionId: null,
  /** @type {Array<{x:number,y:number,z:number,region:any}>} */
  projectedRegions: [],
  /** @type {Array<{x:number,y:number,region:any}>} */
  projectedButterflyRegions: [],
  activeBaseKind: "synthetic",
  activeBaseLabel: "synthetic photosphere",
  wavelength: "continuum", // which SDO channel drives the solar disk ("model" = synthetic engine view)
  /** @type {import('./config.js').Snapshot[]} */
  seriesFrames: [],
  seriesManifest: /** @type {any} */ (null),
  timelineIndex: -1, // -1 = live "now"; otherwise an index into seriesFrames
  playTimer: 0,
  liveEngineRun: false, // true while showing an in-browser WASM engine run
  tourIndex: -1,
  tipPinned: false
};
