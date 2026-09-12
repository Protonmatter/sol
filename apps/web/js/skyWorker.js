// @lazy-module — full Sky/event calculations run only in this bounded module worker.
import { loadSkyEngine, skySnapshot, bodyTrack } from "./skyEngine.js?v=dcca6290db";
import { validateSkyWork } from "./skyLimits.js?v=dcca6290db";
const release="__SOL_RELEASE_ID__";
let busy=false;
self.onmessage=async event=>{
  const request=event.data;
  if (!Number.isSafeInteger(request?.generation)||request.generation<1) return;
  const identity={protocol:"sol-worker.v1",engine:"ephemeris",schema:"ephemeris-snapshot.v3",abi:1,release,generation:request.generation};
  if (request.type!=="compute"||request.protocol!==identity.protocol||request.engine!==identity.engine||request.schema!==identity.schema||request.abi!==1||request.release!==release||busy) {
    self.postMessage({...identity,type:"error",error:{code:"protocol",message:"Sky worker identity or admission mismatch"}});return;
  }
  busy=true;
  try {
    const p=validateSkyWork(request.payload);
    await loadSkyEngine();
    const value=p.operation==="snapshot"?{operation:p.operation,snapshot:skySnapshot(p.unix,p.lat,p.lon,p.elev)}:{operation:p.operation,samples:bodyTrack(p.bodyIndex,p.lat,p.lon,p.elev,p.unix,p.dtSeconds,p.samples)};
    self.postMessage({...identity,type:"result",value});
  } catch(error) { self.postMessage({...identity,type:"error",error:{code:error.code||"engine_failed",message:error.message||"Sky engine failed"}}); }
  finally { busy=false; }
};
