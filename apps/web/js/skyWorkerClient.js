import { LatestWorkerClient, EngineError } from "./workerClient.js?v=dcca6290db";
import { SKY_LIMITS, validateSkyWork } from "./skyLimits.js?v=dcca6290db";
import { assertEphemerisSnapshotV3, assertEphemerisRequestBinding } from "./ephemerisContract.js?v=dcca6290db";

export function createSkyWorkerClient(options = {}) {
  const client=new LatestWorkerClient({engine:"ephemeris",schema:"ephemeris-snapshot.v3",release:"__SOL_RELEASE_ID__",
    createWorker:()=>new Worker(new URL("./skyWorker.js?v=dcca6290db",import.meta.url),{type:"module",name:"Sol Sky engine"}),
    ...options,validateRequest:validateSkyWork,deadlineMs:SKY_LIMITS.deadlineMs});
  return {
    async request(value) {
      const request=validateSkyWork(value);
      const result=await client.request(request);
      if (result?.operation!==request.operation) throw new EngineError("protocol","Sky result operation mismatch");
      if (request.operation==="snapshot") {
        const snapshot=assertEphemerisSnapshotV3(result.snapshot);
        return assertEphemerisRequestBinding(snapshot,request.unix,request.lat,request.lon,request.elev);
      }
      if (!Array.isArray(result.samples)||result.samples.length!==request.samples||Array.from(result.samples).some(s=>!s||!Number.isFinite(s.alt)||s.alt < -90||s.alt > 90||!Number.isFinite(s.az)||s.az<0||s.az>=360||s.up!==(s.alt>0))) throw new EngineError("protocol","Invalid or incomplete Sky trajectory");
      return result.samples;
    },
    cancel:()=>client.cancel(),dispose:()=>client.dispose()
  };
}
