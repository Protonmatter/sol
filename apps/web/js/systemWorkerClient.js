import {LatestWorkerClient} from "./workerClient.js?v=dcca6290db";
import {validateSystemRequest,assertSystemSnapshot} from "./systemContract.js?v=dcca6290db";
const client=new LatestWorkerClient({engine:"system",schema:"system-snapshot.v1",release:"__SOL_RELEASE_ID__",
  createWorker:()=>new Worker(new URL("./systemWorker.js?v=dcca6290db",import.meta.url),{type:"module",name:"Sol System metadata"}),
  validateRequest:validateSystemRequest,deadlineMs:10000});
export async function requestSystemSnapshot(unix) { return assertSystemSnapshot(await client.request({unix}),unix); }
export const cancelSystemSnapshot=()=>client.cancel();
