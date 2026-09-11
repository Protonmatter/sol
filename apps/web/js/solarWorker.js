// @lazy-module — loaded only as a module worker after an explicit simulation request.
import { loadEngine, simulateSnapshot } from "../engine.js?v=dcca6290db";
import { validateSolarRequest } from "./engineLimits.js?v=dcca6290db";
import { SOLAR_STATE_SNAPSHOT_SCHEMA } from "./solarContract.js?v=dcca6290db";
const release = "__SOL_RELEASE_ID__";
let busy = false;
self.onmessage = async event=>{
  const request = event.data;
  if(!Number.isSafeInteger(request?.generation) || request.generation<1) return;
  const identity = {protocol:"sol-worker.v1",engine:"solar",abi:1,release,schema:SOLAR_STATE_SNAPSHOT_SCHEMA,generation:request.generation};
  if(request.type!=="compute" || request.protocol!==identity.protocol || request.engine!=="solar" || request.schema!==identity.schema || request.abi!==1 || request.release!==release || busy) {
    self.postMessage({...identity,type:"error",error:{code:"protocol",message:"Solar worker request identity or admission mismatch"}});return;
  }
  busy = true;
  try {
    const payload = validateSolarRequest(request.payload);
    await loadEngine();
    self.postMessage({...identity,type:"result",value:simulateSnapshot(payload)});
  } catch(error) {
    self.postMessage({...identity,type:"error",error:{code:error.code || "engine_failed",message:error.message || "Solar engine failed"}});
  } finally { busy = false; }
};
