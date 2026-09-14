// Incremental terrain allocations only; source textures and other passes have separate budgets.
const CPU_LIMIT=48*1024*1024,GPU_LIMIT=64*1024*1024;

/** Conservatively includes transfer/output overlap before starting a worker.
 * @param {{width:number,height:number,bytes:number}} reference @param {number} level */
export function terrainResourceEstimate(reference,level) {
  const {width,height,bytes}=reference,segments=[0,48,96,192,256][level];
  if(!segments||!Number.isInteger(width)||!Number.isInteger(height)||width!==height*2||width>4096||height>2048||bytes!==width*height*2)
    throw new Error('Invalid terrain resource dimensions');
  const vertices=(segments+1)*(segments*2+1),meshBytes=vertices*24+segments*2*(segments-1)*6*(vertices>65536?4:2);
  const gpuBytes=width*height*4+meshBytes;
  const cpuBytes=bytes*2+width*height*4+meshBytes;
  // At most two complete GPU entries and one preparation may overlap.
  if(cpuBytes>CPU_LIMIT||gpuBytes*2>GPU_LIMIT)throw new Error('Terrain resource byte budget exceeded');
  return {cpuBytes,gpuBytes,meshBytes,cpuLimit:CPU_LIMIT,gpuLimit:GPU_LIMIT};
}

/** One worker/transfer group at a time; queued cancellation is prompt and bounded. */
export function createTerrainPreparationQueue() {
  const waiting=[];let active=false;
  function next(){
    if(active||!waiting.length)return;
    const item=waiting.shift();item.signal.removeEventListener('abort',item.abort);
    if(item.signal.aborted){item.reject(new Error('Terrain request aborted'));next();return;}
    active=true;
    Promise.resolve().then(()=>item.task()).then(item.resolve,item.reject).finally(()=>{active=false;next();});
  }
  return {
    /** @param {AbortSignal} signal @param {()=>Promise<any>} task */
    run(signal,task){return new Promise((resolve,reject)=>{
      if(signal.aborted){reject(new Error('Terrain request aborted'));return;}
      const item={signal,task,resolve,reject,abort:null};
      item.abort=()=>{const index=waiting.indexOf(item);if(index>=0)waiting.splice(index,1);reject(new Error('Terrain request aborted'));};
      if(waiting.length>=2){reject(new Error('Terrain preparation queue budget exceeded'));return;}
      signal.addEventListener('abort',item.abort,{once:true});waiting.push(item);next();
    });},
  };
}

/** Upload one already admitted mesh. Every partial companion is released on failure.
 * @param {WebGL2RenderingContext} context @param {any} mesh */
export function uploadTerrainMesh(context,mesh) {
  const pos=context.createBuffer(),idx=context.createBuffer(),heightTex=context.createTexture();
  try {
    if(!pos||!idx||!heightTex)throw new Error('Terrain GPU allocation failed');
    context.bindBuffer(context.ARRAY_BUFFER,pos);context.bufferData(context.ARRAY_BUFFER,mesh.pos,context.STATIC_DRAW);
    context.bindBuffer(context.ELEMENT_ARRAY_BUFFER,idx);context.bufferData(context.ELEMENT_ARRAY_BUFFER,mesh.idx,context.STATIC_DRAW);
    context.activeTexture(context.TEXTURE0+5);context.bindTexture(context.TEXTURE_2D,heightTex);
    context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL,false);context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    context.texImage2D(context.TEXTURE_2D,0,context.R32F,mesh.width,mesh.height,0,context.RED,context.FLOAT,mesh.heightsKm);
    for(const parameter of [context.TEXTURE_MIN_FILTER,context.TEXTURE_MAG_FILTER])context.texParameteri(context.TEXTURE_2D,parameter,context.NEAREST);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_S,context.REPEAT);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE);
    if(context.getError()!==context.NO_ERROR)throw new Error('GPU rejected terrain geometry');
    return {pos,idx,heightTex,count:mesh.idx.length,indexType:mesh.idx instanceof Uint32Array?context.UNSIGNED_INT:context.UNSIGNED_SHORT,
      interleaved:true,minRadiusKm:mesh.minRadiusKm,maxRadiusKm:mesh.maxRadiusKm,shadow:mesh.shadow,
      sourceId:mesh.sourceId,sourceSha256:mesh.sourceSha256};
  } catch(error) {
    if(pos)context.deleteBuffer(pos);if(idx)context.deleteBuffer(idx);if(heightTex)context.deleteTexture(heightTex);
    throw error;
  } finally {if(context.activeTexture)context.activeTexture(context.TEXTURE0);}
}
