// @lazy-module — full System JSON/metadata is only computed in a worker.
import {loadSkyEngine,systemSnapshot} from "./skyEngine.js";
import {validateSystemRequest,assertSystemSnapshot} from "./systemContract.js";
const release="__SOL_RELEASE_ID__";
let busy=false;
self.onmessage=async event=>{
  const request=event.data;
  if(!Number.isSafeInteger(request?.generation)||request.generation<1)return;
  const identity={protocol:"sol-worker.v1",engine:"system",schema:"system-snapshot.v1",abi:1,release,generation:request.generation};
  if(!["initialize","compute"].includes(request.type)||Object.keys(identity).some(k=>identity[k]!==request[k])||busy){self.postMessage({...identity,type:"error",error:{code:"protocol",message:"System worker identity/admission mismatch"}});return;}
  if(request.module!==undefined && !(request.module instanceof WebAssembly.Module)) {
    self.postMessage({...identity,type:"error",error:{code:"protocol",message:"Invalid compiled WASM module"}});return;
  }
  busy=true;
  try {
    if(request.type==="initialize"){await loadSkyEngine(request.module);self.postMessage({...identity,type:"ready"});return;}
    const {unix}=validateSystemRequest(request.payload);await loadSkyEngine(request.module);self.postMessage({...identity,type:"result",value:assertSystemSnapshot(systemSnapshot(unix),unix)});
  }
  catch(error){self.postMessage({...identity,type:"error",error:{code:error.code||"engine_failed",message:error.message}});}
  finally {busy=false;}
};
