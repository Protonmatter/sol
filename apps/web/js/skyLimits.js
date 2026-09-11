import { EngineError } from "./workerClient.js?v=dcca6290db";

export const SKY_LIMITS = Object.freeze({minUnix:-62135596800,maxUnix:253402300800,maxSamples:257,maxStepSeconds:3600,maxSpanSeconds:172800,deadlineMs:10000});

export function validateSkyWork(value) {
  const fail = message => { throw new EngineError("invalid_input",message); };
  if (!value || typeof value !== "object" || !["snapshot","track"].includes(value.operation)) fail("Unknown Sky operation");
  const {lat,lon,elev,unix}=value;
  if (!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lon)||lon < -360||lon > 360||!Number.isFinite(elev)||elev < -12000||elev > 100000) fail("Observer outside supported bounds");
  const epochValid = time => Number.isFinite(time)&&time>=SKY_LIMITS.minUnix&&time<SKY_LIMITS.maxUnix;
  if (!epochValid(unix)) fail("Epoch outside proleptic Gregorian years 1 through 9999");
  if (value.operation === "track") {
    const {bodyIndex,dtSeconds,samples}=value;
    if (!Number.isInteger(bodyIndex)||bodyIndex<0||bodyIndex>8) fail("Unknown trajectory body");
    if (!Number.isInteger(samples)||samples<2||samples>SKY_LIMITS.maxSamples) fail("Trajectory requires 2 through 257 samples");
    if (!Number.isFinite(dtSeconds)||dtSeconds===0||Math.abs(dtSeconds)>SKY_LIMITS.maxStepSeconds) fail("Trajectory step must be nonzero and at most 3600 seconds");
    const span=dtSeconds*(samples-1);
    if (Math.abs(span)>SKY_LIMITS.maxSpanSeconds||!epochValid(unix+span)) fail("Trajectory span or endpoint outside supported bounds");
  }
  return {...value};
}
