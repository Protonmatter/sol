import assert from "node:assert/strict";
import test from "node:test";
import {validateSolarRequest,SOLAR_LIMITS} from "../../apps/web/js/engineLimits.js";
test("solar admission includes exact dimension, duration and aggregate boundaries",()=>{
  for(const lon of [127,128])assert.equal(validateSolarRequest({lon}).lon,lon);
  assert.throws(()=>validateSolarRequest({lon:129}),e=>e.code==="invalid_request");
  for(const steps of [624,625])assert.equal(validateSolarRequest({lon:125,lat:64,steps,dtHours:0.001}).steps,steps);
  assert.throws(()=>validateSolarRequest({lon:125,lat:64,steps:626,dtHours:0.001}),e=>e.code==="capacity");
  for(const dtHours of [335.999,336])assert.equal(validateSolarRequest({steps:1,lon:8,lat:4,dtHours}).dtHours,dtHours);
  assert.throws(()=>validateSolarRequest({steps:2,dtHours:168.001}),e=>e.code==="capacity");
  assert.equal(SOLAR_LIMITS.deadlineMs,10000);assert.ok(Object.isFrozen(validateSolarRequest()));
});
test("invalid numbers are rejected, never clamped into a different scientific request",()=>{
  for(const request of [{steps:Infinity},{steps:-1},{steps:0.5},{seed:-1},{seed:2**32},{activity:NaN},{activity:1.1},{dtHours:0},{dtHours:Infinity},{lon:8.1},{lat:65},{lat:3}])assert.throws(()=>validateSolarRequest(request));
  assert.deepEqual(validateSolarRequest({steps:0}),{seed:42,steps:0,dtHours:1,activity:0.9,lon:72,lat:36});
});
