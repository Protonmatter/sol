import { compileEphemerisModule } from "./wasmBroker.js";
import {LatestWorkerClient} from "./workerClient.js";
import {validateSystemRequest,assertSystemSnapshot} from "./systemContract.js";
const client=new LatestWorkerClient({engine:"system",schema:"system-snapshot.v1",release:"__SOL_RELEASE_ID__",
  initialize:true,prepareWorker:compileEphemerisModule,
  createWorker:()=>new Worker(new URL("./systemWorker.js",import.meta.url),{type:"module",name:"Sol System metadata"}),
  validateRequest:validateSystemRequest,deadlineMs:10000});
export async function requestSystemSnapshot(unix) { return assertSystemSnapshot(await client.request({unix}),unix); }
export const cancelSystemSnapshot=()=>client.cancel();
