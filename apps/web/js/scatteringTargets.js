// Resource/submission lifecycle only. Scientific plan and generator qualification
// belong to the caller; no scattering formula or shader compilation lives here.
import {atmosphereUniformValues,serializeAtmosphereProfile} from './atmosphereOptics.js';

export const SCATTERING_TARGET_LIMITS=Object.freeze({targets:2,evaluations:65536,bytesPerTarget:1048576,textureUnits:10});
export const SCATTERING_TARGET_UNIFORMS=Object.freeze(['u_scatteringReady','u_scatteringSurface','u_scatteringLimb',
  'u_scatteringAxis','u_scatteringU','u_scatteringV','u_scatteringCameraRadius','u_scatteringHeightRange',
  'u_scatteringSurfaceSize','u_scatteringLimbSize']);
const ENABLES={blend:'BLEND',depthTest:'DEPTH_TEST',cullFace:'CULL_FACE',scissorTest:'SCISSOR_TEST',
  stencilTest:'STENCIL_TEST',rasterizerDiscard:'RASTERIZER_DISCARD',sampleCoverage:'SAMPLE_COVERAGE',
  sampleAlphaToCoverage:'SAMPLE_ALPHA_TO_COVERAGE',dither:'DITHER'};
const UNITS=[7,8,9];
const number=value=>typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(Math.fround(value));
const vector=(value,size)=>Array.isArray(value)&&value.length===size&&value.every(number);
const sameNumber=(a,b)=>Object.is(Math.fround(a),Math.fround(b));
const sameVector=(a,b)=>a.length===b.length&&a.every((value,i)=>sameNumber(value,b[i]));
const sameFrame=(a,b)=>a&&b&&a.contextGeneration===b.contextGeneration&&a.sceneSerial===b.sceneSerial&&Object.is(a.epoch,b.epoch);
const binding=value=>value===null||(typeof value==='object'&&value!==null);
function message(error){try{return String(error?.message??error).slice(0,400);}catch{return 'Scattering diagnostic unavailable';}}

// Bound object traversal before the shared binary32 serializer. Clone values so
// later caller mutation cannot alter a submitted identity or its uniform data.
function snapshot(value){
  let nodes=0;
  function visit(item,depth){
    if(++nodes>512||depth>8)throw new RangeError('Scattering identity exceeds its bounded schema');
    if(typeof item==='number'){if(!number(item))throw new RangeError('Nonfinite scattering binary32 input');return Math.fround(item);}
    if(typeof item==='string'){if(item.length>2048)throw new RangeError('Scattering identity string too long');return item;}
    if(item===null||typeof item==='boolean')return item;
    if(Array.isArray(item)){if(item.length>64)throw new RangeError('Scattering identity array too long');return item.map(value=>visit(value,depth+1));}
    if(item&&Object.getPrototypeOf(item)===Object.prototype){
      const keys=Object.keys(item);if(keys.length>64)throw new RangeError('Scattering identity object too large');
      const result={};for(const key of keys){
        const descriptor=Object.getOwnPropertyDescriptor(item,key);
        if(key.length>80||!Object.hasOwn(descriptor,'value'))throw new TypeError('Scattering identity requires plain data');
        Object.defineProperty(result,key,{value:visit(descriptor.value,depth+1),enumerable:true});
      }return result;
    }
    throw new TypeError('Scattering identity requires plain finite data');
  }
  return visit(value,0);
}

function budget(plan,maxSize){
  if(!plan||plan.status!=='ready'||!Array.isArray(plan.surfaceSize)||plan.surfaceSize.length!==3
    ||!Array.isArray(plan.limbSize)||plan.limbSize.length!==2)throw new RangeError('Scattering plan dimensions missing');
  const [x,y,z]=plan.surfaceSize,[lx,ly]=plan.limbSize;
  if(![x,y,z,lx,ly].every(value=>Number.isSafeInteger(value)&&value>0&&value<=maxSize)
    ||x<2||y<2||lx<2||ly<2||![1,9,17].includes(z)||y*z>maxSize)throw new RangeError('Scattering plan dimensions rejected');
  const evaluations=x*y*z+lx*ly,bytes=evaluations*16;
  if(!Number.isSafeInteger(evaluations)||evaluations>SCATTERING_TARGET_LIMITS.evaluations
    ||plan.evaluations!==evaluations||plan.bytes!==bytes)throw new RangeError('Scattering plan allocation budget rejected');
  return {evaluations,bytes,sizes:[[x,y*z],[lx,ly]],shape:`${x},${y*z},${lx},${ly}`};
}

function upload(gl,locations,values){
  for(const [name,value] of Object.entries(values)){
    const location=locations[name];if(location==null)continue;
    if(name==='u_atmosphereEnabled'||name==='u_atmosphereRefractionEnabled')gl.uniform1i(location,value);
    else if(Array.isArray(value))gl[value.length===2?'uniform2fv':'uniform3fv'](location,value);
    else gl.uniform1f(location,value);
  }
}
function uploadGrid(gl,locations,plan,ready){
  gl.uniform1i(locations.u_scatteringReady,ready);
  for(const [name,value] of [['u_scatteringAxis',plan.axis],['u_scatteringU',plan.u],['u_scatteringV',plan.v]])
    gl.uniform3fv(locations[name],value);
  gl.uniform1f(locations.u_scatteringCameraRadius,plan.cameraRadius);
  gl.uniform2fv(locations.u_scatteringHeightRange,plan.heightRange);
  gl.uniform3iv(locations.u_scatteringSurfaceSize,plan.surfaceSize);gl.uniform2iv(locations.u_scatteringLimbSize,plan.limbSize);
  gl.uniform1i(locations.u_scatteringSurface,8);gl.uniform1i(locations.u_scatteringLimb,9);
}

/** Two bounded groups, each with surface/limb RGBA32F textures and a fullscreen VAO.
 * programs is a createShaderPrograms owner. Its generation is distinct from the
 * renderer context generation. generatorUniforms are caller-resolved locations.
 * admitPlan(plan, profile, opticalOptions) must confirm the caller's scientifically
 * qualified plan, including finite nonzero Sun and outside-camera domain. This
 * helper separately validates all dimensions, bytes and uploaded binary32 identity.
 * No getError result or successful draw submission proves GPU completion/content.
 * @param {*} gl WebGL2 context, borrowed for this context generation.
 * @param {{contextGeneration:number,programGeneration:number,programs:{generation:number,get:Function},
 * generatorKey:string,generatorUniforms:Object,admitPlan:Function,capacity?:number}} options
 */
export function createScatteringTargets(gl,{contextGeneration,programGeneration,programs,generatorKey,generatorUniforms,admitPlan,capacity=2}){
  if(!Number.isSafeInteger(contextGeneration)||contextGeneration<0||!Number.isSafeInteger(programGeneration)||programGeneration<0
    ||!Number.isInteger(capacity)||capacity<1||capacity>2)throw new RangeError('Invalid scattering resource identities or capacity');
  if(typeof admitPlan!=='function')throw new TypeError('Caller plan admission is required');
  if(!programs||programs.generation!==programGeneration||typeof programs.get!=='function'
    ||typeof generatorKey!=='string'||!generatorKey||generatorKey.length>80)throw new TypeError('Invalid scattering shader owner');
  const program=programs.get(generatorKey);
  if(!program||!generatorUniforms||generatorUniforms.u_scatteringPass==null||generatorUniforms.u_atmosphereColumnField==null)
    throw new TypeError('Already-ready scattering generator and uniform locations required');
  const locations={...generatorUniforms},entries=new Map();
  let currentFrame=null,lastSerial=-1,disposed=false,fatal='',maxSize=0,maxUnits=0,lastFailure='';
  try{
    if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float scattering targets unavailable');
    maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const fragmentUnits=gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);maxUnits=gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    if(!Number.isSafeInteger(maxSize)||maxSize<2||!Number.isSafeInteger(fragmentUnits)||fragmentUnits<10
      ||!Number.isSafeInteger(maxUnits)||maxUnits<10)throw new Error('Scattering targets require ten texture units and valid dimensions');
  }catch(error){fatal=message(error);}

  function release(entry,invalidateRevision=true){
    entry.submission=null;if(invalidateRevision)entry.revision++;
    const group=entry.group;entry.group=null;if(!group)return;
    // No framebuffer/texture rebinding during release, and no borrowed resources.
    for(const [method,value] of [['deleteTexture',group.surface],['deleteTexture',group.limb],
      ['deleteFramebuffer',group.framebuffer],['deleteVertexArray',group.vao]])if(value){
      try{gl[method](value);}catch(error){lastFailure=message(error);}
    }
  }
  function invalidate(){for(const entry of entries.values()){
    entry.submission=null;entry.revision++;if(entry.state==='submitted')entry.state=entry.group?'allocated':'deferred';
  }}
  function currentOwner(){
    if(disposed||fatal)return false;
    try{
      if(gl.isContextLost())throw new Error('Scattering graphics context lost');
      if(programs.generation!==programGeneration||programs.get(generatorKey)!==program)throw new Error('Scattering shader owner replaced or no longer ready');
      return true;
    }catch(error){fatal=message(error);currentFrame=null;for(const entry of entries.values()){release(entry);entry.state='unavailable';entry.reason=fatal;}return false;}
  }
  function beginFrame(frame){
    if(!currentOwner())return false;
    if(!frame||frame.contextGeneration!==contextGeneration||!Number.isSafeInteger(frame.sceneSerial)||frame.sceneSerial<0
      ||!number(frame.epoch)||frame.sceneSerial<lastSerial||(frame.sceneSerial===lastSerial&&!sameFrame(currentFrame,frame))){
      currentFrame=null;invalidate();lastFailure='Invalid or stale scattering frame identity';return false;
    }
    if(sameFrame(currentFrame,frame))return true;
    invalidate();currentFrame={contextGeneration,sceneSerial:frame.sceneSerial,epoch:frame.epoch};lastSerial=frame.sceneSerial;return true;
  }
  function validated(args){
    if(!args||!sameFrame(currentFrame,args.frame))throw new Error('Scattering frame does not match the current scene');
    const frame={...currentFrame};
    const {plan,profile,opticalOptions,columnTexture,columnIdentity}=args;
    const allocation=budget(plan,maxSize);
    if(!profile||!opticalOptions||!columnTexture||typeof columnIdentity!=='string'||!columnIdentity||columnIdentity.length>256
      ||!vector(plan.cameraBodyKm,3)||!vector(opticalOptions.cameraBodyKm,3)||!sameVector(plan.cameraBodyKm,opticalOptions.cameraBodyKm)
      ||!vector(opticalOptions.sunDirectionBody,3)||Math.hypot(...opticalOptions.sunDirectionBody.map(Math.fround))===0
      ||plan.body!==profile.body||!number(plan.radiusKm)||!number(plan.topKm)||!number(plan.polarRatio)
      ||plan.radiusKm<=0||plan.topKm<=0||!sameNumber(plan.radiusKm,profile.radiusKm)||!sameNumber(plan.topKm,profile.topKm)
      ||!sameNumber(plan.polarRatio,opticalOptions.polarRatio)||!vector(plan.axis,3)||!vector(plan.u,3)||!vector(plan.v,3)
      ||!number(plan.cameraRadius)||plan.cameraRadius<=0||!vector(plan.heightRange,2)||plan.heightRange[1]<plan.heightRange[0])
      throw new Error('Scattering camera, Sun, profile or grid identity rejected');
    const copied=snapshot({plan,profile,opticalOptions,columnIdentity});
    const values=snapshot(atmosphereUniformValues(profile,opticalOptions));
    const identity=serializeAtmosphereProfile({inputs:copied,uniforms:values});
    if(admitPlan(plan,profile,opticalOptions)!==true)throw new Error('Caller scattering plan admission rejected');
    if(identity!==serializeAtmosphereProfile({inputs:snapshot({plan,profile,opticalOptions,columnIdentity}),
      uniforms:snapshot(atmosphereUniformValues(profile,opticalOptions))}))throw new Error('Scattering input changed during admission');
    if(!sameFrame(currentFrame,frame)||!sameFrame(args.frame,frame))throw new Error('Scattering frame changed during admission');
    return {plan:copied.plan,values,identity,columnTexture,allocation,frame};
  }
  function restoreSnapshot(value){
    const handles=[];for(const entry of entries.values())if(entry.group)handles.push(...Object.values(entry.group));
    if(!value||!vector(value.viewport,4)||!value.viewport.every(Number.isInteger)||value.viewport[2]<=0||value.viewport[3]<=0
      ||!Number.isInteger(value.activeTexture)||value.activeTexture<gl.TEXTURE0||value.activeTexture>=gl.TEXTURE0+maxUnits
      ||!Array.isArray(value.colorMask)||value.colorMask.length!==4||!value.colorMask.every(v=>typeof v==='boolean')
      ||typeof value.depthMask!=='boolean'||!value.enabled||Object.keys(ENABLES).some(key=>typeof value.enabled[key]!=='boolean')
      ||!Array.isArray(value.textureUnits)||value.textureUnits.length!==3)throw new Error('Complete caller scattering restore state required');
    for(const key of ['drawFramebuffer','readFramebuffer','program','vertexArray'])
      if(!Object.hasOwn(value,key)||!binding(value[key])||handles.includes(value[key]))throw new Error('Restore state must contain caller-owned live bindings');
    const textureUnits=UNITS.map(unit=>{
      const matches=value.textureUnits.filter(item=>item?.unit===unit),item=matches[0];
      if(matches.length!==1||!Object.hasOwn(item,'texture')||!Object.hasOwn(item,'sampler')
        ||!binding(item.texture)||!binding(item.sampler)||handles.includes(item.texture))throw new Error('Caller texture/sampler restore binding missing or target-owned');
      return {...item};
    });
    return {...value,viewport:[...value.viewport],colorMask:[...value.colorMask],enabled:{...value.enabled},textureUnits};
  }
  function restore(value){
    let failure='';const apply=callback=>{try{callback();}catch(error){failure||=message(error);}};
    apply(()=>gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,value.drawFramebuffer));apply(()=>gl.bindFramebuffer(gl.READ_FRAMEBUFFER,value.readFramebuffer));
    apply(()=>gl.viewport(...value.viewport));apply(()=>gl.colorMask(...value.colorMask));apply(()=>gl.depthMask(value.depthMask));
    for(const [key,constant] of Object.entries(ENABLES))apply(()=>gl[value.enabled[key]?'enable':'disable'](gl[constant]));
    apply(()=>gl.bindVertexArray(value.vertexArray));apply(()=>gl.useProgram(value.program));
    for(const item of value.textureUnits){apply(()=>gl.activeTexture(gl.TEXTURE0+item.unit));
      apply(()=>gl.bindTexture(gl.TEXTURE_2D,item.texture));apply(()=>gl.bindSampler(item.unit,item.sampler));}
    apply(()=>gl.activeTexture(value.activeTexture));return failure;
  }
  function checkedError(entry,phase){
    const code=gl.getError();if(code!==gl.NO_ERROR){
      entry.glErrors.push({phase,code});if(entry.glErrors.length>8)entry.glErrors.shift();
      throw new Error(`Scattering GL error during ${phase}; see diagnostic glErrors`);
    }
  }
  function allocate(entry,allocation){
    const group={surface:null,limb:null,framebuffer:null,vao:null,shape:allocation.shape,bytes:allocation.bytes};entry.group=group;
    const requireResource=(value,label)=>{if(!value)throw new Error(`Scattering ${label} allocation failed`);return value;};
    group.framebuffer=requireResource(gl.createFramebuffer(),'framebuffer');group.vao=requireResource(gl.createVertexArray(),'vertex array');
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,group.framebuffer);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    for(let i=0;i<2;i++){
      const key=i===0?'surface':'limb',texture=requireResource(gl.createTexture(),'texture');group[key]=texture;
      gl.activeTexture(gl.TEXTURE0+8+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.bindSampler(8+i,null);
      gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,...allocation.sizes[i]);
      for(const parameter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.NEAREST);
      for(const parameter of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Scattering float framebuffer incomplete');
      checkedError(entry,'allocation');
    }
    return group;
  }
  function generate(key,args,callerState){
    if(typeof key!=='string'||!key||key.length>80){lastFailure='Invalid scattering target identity';return false;}
    let entry=entries.get(key);
    if(!entry){if(entries.size>=capacity){lastFailure='Scattering resident target capacity exceeded';return false;}
      entry={state:'deferred',reason:'',group:null,submission:null,revision:0,glErrors:[]};entries.set(key,entry);}
    if(!currentOwner()){entry.state='unavailable';entry.reason=fatal||'Scattering targets disposed';return false;}
    if(['unavailable','cancelled'].includes(entry.state))return false;
    let saved;
    try{saved=restoreSnapshot(callerState);}catch(error){
      // Deleting an old target here could implicitly unbind the very owned
      // handle that made this snapshot invalid. Preserve bindings and bounded
      // resources until an explicit retry/cancel; invalidate only admission.
      entry.submission=null;entry.revision++;entry.state='unavailable';entry.reason=message(error);return false;
    }
    entry.submission=null;entry.state=entry.group?'allocated':'deferred';const revision=++entry.revision;
    let changed=false,submitted=null;
    try{
      const data=validated(args);
      if(entry.revision!==revision||!currentOwner())throw new Error('Scattering demand changed before generation');
      checkedError(entry,'entry');changed=true;
      if(entry.group&&entry.group.shape!==data.allocation.shape)release(entry,false);
      if(entry.revision!==revision||!currentOwner())throw new Error('Scattering demand changed during resource release');
      const group=entry.group||allocate(entry,data.allocation);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,group.framebuffer);gl.bindVertexArray(group.vao);gl.useProgram(program);
      for(const constant of Object.values(ENABLES))gl.disable(gl[constant]);
      gl.colorMask(true,true,true,true);gl.depthMask(false);
      for(const unit of UNITS){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,unit===7?data.columnTexture:null);gl.bindSampler(unit,null);}
      upload(gl,locations,data.values);uploadGrid(gl,locations,data.plan,0);gl.uniform1i(locations.u_atmosphereColumnField,7);
      for(let pass=0;pass<2;pass++){
        if(entry.revision!==revision||!currentOwner())throw new Error('Scattering demand cancelled during generation');
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pass===0?group.surface:group.limb,0);
        gl.viewport(0,0,...data.allocation.sizes[pass]);gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));
        gl.uniform1i(locations.u_scatteringPass,pass);gl.drawArrays(gl.TRIANGLES,0,3);checkedError(entry,'submission');
      }
      if(entry.revision!==revision||!currentOwner()||!sameFrame(currentFrame,data.frame))throw new Error('Stale scattering submission');
      submitted=data;
    }catch(error){release(entry);if(entry.state!=='cancelled')entry.state='unavailable';entry.reason=message(error);}
    finally{if(changed&&saved){let failure=restore(saved);
      try{checkedError(entry,'restoration');}catch(error){failure||=message(error);}
      if(failure){release(entry);entry.state='unavailable';entry.reason=`Scattering state restoration failed: ${failure}`;submitted=null;}
    }}
    if(!submitted||entry.revision!==revision||!currentOwner()||!sameFrame(currentFrame,submitted.frame))return false;
    entry.submission=submitted;entry.state='submitted';entry.reason='Both passes submitted; GPU completion and contents not verified';return true;
  }
  function bind(key,args,consumer){
    const entry=entries.get(key);
    if(!consumer?.locations||consumer.locations.u_scatteringReady==null||!consumer.program
      ||!Number.isInteger(consumer.activeTexture)||consumer.activeTexture<gl.TEXTURE0||consumer.activeTexture>=gl.TEXTURE0+maxUnits)return false;
    // Caller promises this consumer program is current. No driver program query.
    let success=false;
    try{
      gl.uniform1i(consumer.locations.u_scatteringReady,0);
      if(!currentOwner()||entry?.state!=='submitted'||!entry.group||!entry.submission)return false;
      checkedError(entry,'binding-entry');const revision=entry.revision;
      const data=validated(args),prior=entry.submission;
      if(!currentOwner()||entry.revision!==revision||!prior||!sameFrame(prior.frame,data.frame)
        ||data.identity!==prior.identity||data.columnTexture!==prior.columnTexture)return false;
      uploadGrid(gl,consumer.locations,data.plan,0);
      gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,entry.group.surface);gl.bindSampler(8,null);
      gl.activeTexture(gl.TEXTURE0+9);gl.bindTexture(gl.TEXTURE_2D,entry.group.limb);gl.bindSampler(9,null);
      checkedError(entry,'binding');gl.uniform1i(consumer.locations.u_scatteringReady,1);success=true;
    }catch(error){if(entry){release(entry);entry.state='unavailable';entry.reason=message(error);}}
    finally{
      try{gl.activeTexture(consumer.activeTexture);if(entry)checkedError(entry,'binding-restoration');}
      catch(error){success=false;if(entry){release(entry);entry.state='unavailable';entry.reason=message(error);}}
      if(!success)try{gl.uniform1i(consumer.locations.u_scatteringReady,0);}catch(error){lastFailure=message(error);}
    }
    return success;
  }
  function cancel(key){for(const [name,entry] of entries)if(key===undefined||name===key){release(entry);entry.state='cancelled';entry.reason='Scattering demand cancelled';}}
  function retry(key){const entry=entries.get(key);if(!currentOwner()||!entry||!['unavailable','cancelled'].includes(entry.state))return false;
    release(entry);entry.state='deferred';entry.reason='';entry.glErrors=[];return true;}
  function dispose(){if(disposed)return;disposed=true;currentFrame=null;for(const entry of entries.values()){release(entry);entry.state='disposed';entry.reason='Scattering targets disposed';}}
  function status(key){const entry=entries.get(key);return {state:disposed?'disposed':fatal?'unavailable':entry?.state||'deferred',
    reason:entry?.reason||fatal||lastFailure,contextGeneration,programGeneration,estimatedBytes:entry?.group?.bytes||0,
    submission:entry?.submission?{...entry.submission.frame}:null,glErrors:entry?.glErrors.map(error=>({...error}))||[],gpuCompletionVerified:false};}
  return {beginFrame,generate,bind,cancel,retry,dispose,status};
}
