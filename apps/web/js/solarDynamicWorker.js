// @lazy-module — bounded appearance descriptors, never a browser PFSS solve.
import {loadEngine} from '../engine.js';
import {sampleSolarAppearance} from './solarDynamicSampling.js';
const release='__SOL_RELEASE_ID__';
let busy=false;
self.onmessage=async event=>{
  const request=event.data;
  if(!Number.isSafeInteger(request?.generation)||request.generation<1)return;
  const identity={protocol:'sol-worker.v1',engine:'solar-appearance',schema:'solar-render-packet.v1',abi:1,release,generation:request.generation};
  if(busy||request.type!=='compute'||Object.keys(identity).some(k=>request[k]!==identity[k])){
    self.postMessage({...identity,type:'error',error:{code:'protocol',message:'Appearance request identity mismatch'}});return;
  }
  busy=true;
  try{
    const wasm=await loadEngine();
    self.postMessage({...identity,type:'result',value:sampleSolarAppearance(wasm,request.payload)});
  }catch(error){self.postMessage({...identity,type:'error',error:{code:'appearance_failed',message:error.message||'Appearance unavailable'}});}
  finally{busy=false;}
};
