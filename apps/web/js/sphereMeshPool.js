// Context-owned optional sphere buffers. The renderer owns the original sphere.
import {SPHERE_MESH_LEVELS,SPHERE_BASE_LEVEL,SPHERE_VERTEX_ALLOWANCE,sphereMeshLevel,validateUnitSpherePositions} from './sphereMeshPolicy.js';

/** @typedef {{pos:WebGLBuffer,idx:WebGLBuffer,count:number,indexType?:number,stacks?:number}} SphereMesh */
/** @typedef {{pos:Float32Array,idx:Uint16Array}} SphereGeometry */
/** @typedef {{phase:string,message:string,code:number|null,cleanupErrors:string[]}} PoolFailure */

/** @param {SphereGeometry} data @param {number} stacks */
function gridGeometry(data,stacks){
  const slices=2*stacks;
  if(!data||!(data.pos instanceof Float32Array)||!(data.idx instanceof Uint16Array)
      ||data.pos.length!==(stacks+1)*(slices+1)*3||data.idx.length!==stacks*slices*6
      ||!validateUnitSpherePositions(data.pos))return false;
  for(let i=0;i<=stacks;i++){
    const phi=i/stacks*Math.PI,r=Math.sin(phi),z=Math.cos(phi);
    for(let j=0;j<=slices;j++){
      const theta=j/slices*2*Math.PI,k=(i*(slices+1)+j)*3;
      if(Math.hypot(data.pos[k]-r*Math.cos(theta),data.pos[k+1]-r*Math.sin(theta),data.pos[k+2]-z)>SPHERE_VERTEX_ALLOWANCE)return false;
    }
  }
  let k=0;
  for(let i=0;i<stacks;i++)for(let j=0;j<slices;j++){
    const a=i*(slices+1)+j,b=a+slices+1;
    if(data.idx[k++]!==a||data.idx[k++]!==b||data.idx[k++]!==a+1||data.idx[k++]!==a+1||data.idx[k++]!==b||data.idx[k++]!==b+1)return false;
  }
  return true;
}
/** @param {number} stacks */
function borrowedIndices(stacks){
  const stride=SPHERE_BASE_LEVEL/stacks,slices=2*stacks,row=2*SPHERE_BASE_LEVEL+1;
  if(!Number.isInteger(stride))throw new RangeError('Sphere level is not an index-only divisor');
  const indices=new Uint16Array(stacks*slices*6);let k=0;
  for(let i=0;i<stacks;i++)for(let j=0;j<slices;j++){
    const a=i*stride*row+j*stride,b=(i+1)*stride*row+j*stride;
    indices[k++]=a;indices[k++]=b;indices[k++]=a+stride;
    indices[k++]=a+stride;indices[k++]=b;indices[k++]=b+stride;
  }
  return indices;
}
/** @param {unknown} value */
const message=value=>value instanceof Error?value.message:String(value);

class BaseSphereBindingError extends Error {
  /** @param {string} text @param {number|null} code */
  constructor(text,code=null){super(text);this.name='BaseSphereBindingError';this.code=code;}
}
/** @param {WebGL2RenderingContext} gl @param {SphereMesh} base @param {string} stage */
function assertBaseBindings(gl,base,stage){
  try{
    if(!gl.isBuffer(base.pos)||!gl.isBuffer(base.idx))throw new BaseSphereBindingError(`Base sphere buffers are not live in this context (${stage})`);
    gl.bindBuffer(gl.ARRAY_BUFFER,base.pos);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,base.idx);
    const error=gl.getError();
    if(error!==gl.NO_ERROR)throw new BaseSphereBindingError(`Base sphere binding failed (${stage},0x${error.toString(16)})`,error);
  }catch(error){
    if(error instanceof BaseSphereBindingError)throw error;
    throw new BaseSphereBindingError(`Base sphere binding restoration failed (${stage}): ${message(error)}`);
  }
}

/**
 * Create the cleanup owner BEFORE calling initialize(). The caller retains this
 * controller even if mandatory base validation/restoration throws; therefore
 * failed cleanup remains explicitly retryable. Only a complete temporary mesh
 * map becomes selectable. initialize() is one-shot and idempotent.
 *
 * A null selection means use the caller's CURRENT base, never an old pool base.
 * No per-draw GL query/allocation occurs. The caller owns the base handles and
 * guarantees baseGeometry was uploaded to them; isBuffer/binding validation
 * proves current live ownership/target compatibility, not GPU byte identity.
 *
 * Preexisting base errors and base-restoration errors stay fatal/observable.
 * Optional allocation/upload failure instead retains a valid original renderer.
 * @param {{gl:WebGL2RenderingContext,base:SphereMesh,baseGeometry:SphereGeometry,
 *   buildSphere:(stacks:number,slices:number)=>SphereGeometry,generation:number}} options
 */
export function createSphereMeshPool({gl,base,baseGeometry,buildSphere,generation}){
  if(!base?.pos||!base.idx||base.count!==baseGeometry?.idx?.length||!gridGeometry(baseGeometry,SPHERE_BASE_LEVEL))
    throw new TypeError('Invalid base sphere geometry or buffers');
  if(!Number.isSafeInteger(generation)||generation<0)throw new TypeError('Invalid sphere context generation');
  if(typeof buildSphere!=='function')throw new TypeError('Sphere geometry builder is required');
  /** @type {Map<number,SphereMesh>} */
  const levels=new Map();
  /** @type {Map<WebGLBuffer,number>} */
  const owned=new Map();
  /** @type {PoolFailure|null} */
  let failure=null;
  let ready=false,invalidated=false,started=false;
  const baseBytes=baseGeometry.pos.byteLength+baseGeometry.idx.byteLength;
  let phase='allocation';
  /** @type {number|null} */
  let code=null;
  const cleanup=(abandon=false)=>{
    ready=false;invalidated=true;levels.clear();
    /** @type {string[]} */
    const cleanupErrors=[];
    let released=0;
    if(abandon||gl.isContextLost()){released=owned.size;owned.clear();}
    else for(const buffer of owned.keys()){
      try{gl.deleteBuffer(buffer);owned.delete(buffer);released++;}
      catch(error){cleanupErrors.push(message(error));}
    }
    return {released,pendingBuffers:owned.size,cleanupErrors};
  };
  /** @param {number} target @param {Float32Array|Uint16Array} data */
  const upload=(target,data)=>{
    phase='allocation';const buffer=gl.createBuffer();
    if(!buffer){const error=gl.getError();if(error!==gl.NO_ERROR)code=error;throw new Error('Optional sphere buffer allocation returned null');}
    owned.set(buffer,data.byteLength);
    phase='upload';gl.bindBuffer(target,buffer);gl.bufferData(target,data,gl.STATIC_DRAW);
    const error=gl.getError();
    if(error!==gl.NO_ERROR){code=error;throw new Error(`Optional sphere buffer upload failed (0x${error.toString(16)})`);}
    return buffer;
  };
  const initialize=()=>{
    if(started||invalidated)return ready;
    started=true;
    if(gl.isContextLost()){
      invalidated=true;failure={phase:'context-lost',message:'Graphics context is lost',code:null,cleanupErrors:[]};return false;
    }
    let baseValidated=false,baseRestored=false;
    /** @type {Map<number,SphereMesh>} */
    const draft=new Map([[SPHERE_BASE_LEVEL,base]]);
    try{
      phase='base';const existing=gl.getError();
      if(existing!==gl.NO_ERROR)throw new BaseSphereBindingError(`Base graphics setup failed before optional sphere buffers (0x${existing.toString(16)})`,existing);
      assertBaseBindings(gl,base,'before optional allocation');baseValidated=true;
      for(const stacks of SPHERE_MESH_LEVELS){
        if(stacks===SPHERE_BASE_LEVEL)continue;
        let pos=base.pos;
        /** @type {Uint16Array} */
        let indices;
        if(stacks===32){
          phase='geometry';const geometry=buildSphere(32,64);
          if(!gridGeometry(geometry,32))throw new Error('Invalid optional32 sphere geometry');
          pos=upload(gl.ARRAY_BUFFER,geometry.pos);indices=geometry.idx;
        }else indices=borrowedIndices(stacks);
        const idx=upload(gl.ELEMENT_ARRAY_BUFFER,indices);
        draft.set(stacks,Object.freeze({pos,idx,count:indices.length,indexType:gl.UNSIGNED_SHORT,stacks}));
      }
      if(gl.isContextLost())throw new Error('Graphics context lost while constructing optional spheres');
      // Check restoration BEFORE publication; WebGL errors usually do not throw.
      assertBaseBindings(gl,base,'restoring after optional uploads');baseRestored=true;
      for(const [stacks,mesh]of draft)levels.set(stacks,mesh);
      ready=true;
    }catch(error){
      const report=cleanup();
      failure={phase:error instanceof BaseSphereBindingError?'base':phase,message:message(error),
        code:error instanceof BaseSphereBindingError?error.code:code,cleanupErrors:report.cleanupErrors};
      if(error instanceof BaseSphereBindingError)throw error;
    }finally{
      if(baseValidated&&!baseRestored&&!gl.isContextLost()){
        try{assertBaseBindings(gl,base,'restoring after failed construction');}
        catch(error){
          const report=cleanup();failure={phase:'base',message:message(error),
            code:error instanceof BaseSphereBindingError?error.code:null,cleanupErrors:report.cleanupErrors};
          throw error;
        }
      }
    }
    return ready;
  };
  return {
    initialize,
    get ready(){return ready;},
    get failure(){return failure;},
    /** @param {ArrayLike<number>} mvp @param {number} width @param {number} height @param {boolean} eligible @param {WebGL2RenderingContext} context @param {number} ownerGeneration */
    select(mvp,width,height,eligible,context,ownerGeneration){
      if(!ready||invalidated||context!==gl||ownerGeneration!==generation)return null;
      if(!eligible)return base;
      return levels.get(sphereMeshLevel(mvp,width,height))??base;
    },
    dispose(){return cleanup();},
    abandon(){return cleanup(true);},
    stats(){
      let optionalBufferBytes=0;for(const bytes of owned.values())optionalBufferBytes+=bytes;
      return {ready,invalidated,started,generation,ownedBuffers:owned.size,levelCount:levels.size,
        optionalBufferBytes,totalBufferBytes:baseBytes+optionalBufferBytes};
    },
  };
}
