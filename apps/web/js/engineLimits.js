import { EngineError } from "./workerClient.js?v=dcca6290db";

export const SOLAR_LIMITS = Object.freeze({maxLon:128,maxLat:64,maxHours:336,maxCellSteps:10000000,deadlineMs:10000,minLon:8,minLat:4,minDtHours:0.001});

export function validateSolarRequest({seed=42,steps=24,dtHours=1,activity=0.9,lon=72,lat=36}={}) {
  const invalid = message=>{throw new EngineError("invalid_request",message);};
  if(!Number.isInteger(seed) || seed<0 || seed>4294967295) invalid("Seed must be an unsigned 32-bit integer");
  if(!Number.isInteger(steps) || steps<0 || steps>4294967295) invalid("Steps must be a nonnegative unsigned integer");
  if(!Number.isFinite(dtHours) || dtHours<SOLAR_LIMITS.minDtHours || dtHours>SOLAR_LIMITS.maxHours) invalid("Time step must be finite, between 0.001 and 336 hours");
  if(!Number.isFinite(activity) || activity<0 || activity>1) invalid("Activity must be finite and between zero and one");
  if(!Number.isInteger(lon) || lon<SOLAR_LIMITS.minLon || lon>SOLAR_LIMITS.maxLon || !Number.isInteger(lat) || lat<SOLAR_LIMITS.minLat || lat>SOLAR_LIMITS.maxLat) invalid("Grid must be 8–128 longitude by 4–64 latitude cells");
  // One extra transport interval covers partial-anchor replay. Rust also budgets
  // event/replay source work before each advance, and the worker wall deadline is independent.
  const cost = lon * lat * steps * (Math.ceil(dtHours) + 1);
  if(steps*dtHours>SOLAR_LIMITS.maxHours || !Number.isSafeInteger(cost) || cost>SOLAR_LIMITS.maxCellSteps) throw new EngineError("capacity","Calculation exceeds the 14-day or 10-million cell-step budget");
  return Object.freeze({seed,steps,dtHours,activity,lon,lat});
}
