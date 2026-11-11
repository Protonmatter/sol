import { compileSolarModule } from "./wasmBroker.js";
import { LatestWorkerClient } from "./workerClient.js";
import { assertSolarSnapshot, SOLAR_STATE_SNAPSHOT_SCHEMA } from "./solarContract.js";
import { validateSolarRequest, SOLAR_LIMITS } from "./engineLimits.js";

const client = new LatestWorkerClient({prepareWorker:compileSolarModule,engine:"solar",schema:SOLAR_STATE_SNAPSHOT_SCHEMA,release:"__SOL_RELEASE_ID__",
  createWorker:()=>new Worker(new URL("./solarWorker.js",import.meta.url),{type:"module",name:"Sol solar model"}),
  validateRequest:validateSolarRequest,validateResult:assertSolarSnapshot,deadlineMs:SOLAR_LIMITS.deadlineMs});
export const requestSolarSimulation = request=>client.request(request);
export const cancelSolarSimulation = ()=>client.cancel();
