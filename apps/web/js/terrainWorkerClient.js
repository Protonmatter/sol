import {terrainReference} from './terrainAssets.js';

/** Finite, isolated terrain work; CPU mesh generation never blocks the UI thread.
 * @param {string} body @param {number} level
 * @param {{equatorialRadiusKm:number,polarRadiusKm:number}} radii
 * @param {{signal?:AbortSignal,workerFactory?:()=>any,timeoutMs?:number}} options
 */
export function requestTerrainMesh(body,level,radii,{signal,workerFactory=()=>new Worker(new URL('./terrain.worker.js',import.meta.url),{type:'module'}),timeoutMs=30000}={}) {
  const reference=terrainReference(body);
  if(!reference||!Number.isInteger(level)||level<1||level>4
      ||![radii.equatorialRadiusKm,radii.polarRadiusKm,timeoutMs].every(x=>Number.isFinite(x)&&x>0)
      ||timeoutMs>30000)throw new Error('Invalid terrain worker request');
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error('Terrain request aborted'));return;}
    const worker=workerFactory();let finished=false;
    const finish=(error,value=null)=>{
      if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      worker.onmessage=null;worker.onerror=null;worker.terminate();
      if(error)reject(error);else resolve(value);
    };
    const abort=()=>finish(new Error('Terrain request aborted'));
    const timer=setTimeout(()=>finish(new Error('Terrain preparation timed out')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>finish(new Error('Terrain worker unavailable; smooth fallback retained'));
    worker.onmessage=event=>{
      const data=event.data;
      if(data?.body!==body||data?.level!==level){finish(new Error('Terrain worker identity mismatch'));return;}
      if(data.error){finish(new Error(String(data.error).slice(0,180)));return;}
      const mesh=data.mesh;
      if(!(mesh?.pos instanceof Float32Array)||!(mesh.idx instanceof Uint16Array||mesh.idx instanceof Uint32Array)
          ||mesh.pos.length%6||mesh.pos.length<18||mesh.pos.length>134000*6||mesh.idx.length>800000
          ||!Number.isFinite(mesh.maxRadiusKm)||!Number.isFinite(mesh.minRadiusKm)||mesh.minRadiusKm<=0
          ||mesh.maxRadiusKm<mesh.minRadiusKm||!mesh.pos.every(Number.isFinite)
          ||!mesh.idx.every(i=>i<mesh.pos.length/6)
          ||!(mesh.heightsKm instanceof Float32Array)||mesh.width!==reference.width||mesh.height!==reference.height
          ||mesh.sourceId!==reference.id||mesh.sourceSha256!==reference.sha256
          ||mesh.heightsKm.length!==mesh.width*mesh.height||!mesh.heightsKm.every(Number.isFinite)
          ||mesh.shadow?.shape?.length!==4||!mesh.shadow.shape.every(Number.isFinite)
          ||mesh.shadow?.poles?.length!==2||!mesh.shadow.poles.every(Number.isFinite)){
        finish(new Error('Invalid terrain mesh payload'));return;
      }
      finish(null,mesh);
    };
    try{worker.postMessage({body,level,radii:{...radii}});}
    catch(error){finish(new Error('Terrain request could not be submitted'));}
  });
}
