import { LatestWorkerClient } from "./workerClient.js?v=dcca6290db";
import { assertSolarSnapshot, SOLAR_STATE_SNAPSHOT_SCHEMA } from "./solarContract.js?v=dcca6290db";
import { validateSolarRequest, SOLAR_LIMITS } from "./engineLimits.js?v=dcca6290db";

const client = new LatestWorkerClient({engine:"solar",schema:SOLAR_STATE_SNAPSHOT_SCHEMA,release:"__SOL_RELEASE_ID__",
  createWorker:()=>new Worker(new URL("./solarWorker.js?v=dcca6290db",import.meta.url),{type:"module",name:"Sol solar model"}),
  validateRequest:validateSolarRequest,validateResult:assertSolarSnapshot,deadlineMs:SOLAR_LIMITS.deadlineMs});
export const requestSolarSimulation = request=>client.request(request);
export const cancelSolarSimulation = ()=>client.cancel();
