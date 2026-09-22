import assert from 'node:assert/strict';
import test from 'node:test';
import {getAtmosphereProfile,ATMOSPHERE_UNIFORMS} from '../../apps/web/js/atmosphereOptics.js';
import {createScatteringTargets} from '../../apps/web/js/scatteringTargets.js';

const names=[...ATMOSPHERE_UNIFORMS,'u_atmosphereColumnField','u_scatteringPass',
  'u_scatteringReady','u_scatteringSurface','u_scatteringLimb','u_scatteringAxis','u_scatteringU',
  'u_scatteringV','u_scatteringCameraRadius','u_scatteringHeightRange','u_scatteringSurfaceSize','u_scatteringLimbSize'];
const locations=Object.fromEntries(names.map(name=>[name,name]));
const frame=(sceneSerial=1,epoch=1800000000.25)=>({contextGeneration:12,sceneSerial,epoch});
function input(sceneSerial=1){
  const profile=getAtmosphereProfile('Earth');
  return {frame:frame(sceneSerial),profile,columnTexture:{column:true},columnIdentity:'earth-columns-v1',
    opticalOptions:{cameraBodyKm:[0,0,14000],sunDirectionBody:[1,0,0],polarRatio:1,solarDistanceAu:1,exposure:1},
    plan:{status:'ready',body:'Earth',radiusKm:profile.radiusKm,topKm:profile.topKm,polarRatio:1,
      cameraBodyKm:[0,0,14000],cameraRadius:14000,axis:[0,0,1],u:[1,0,0],v:[0,1,0],
      heightRange:[0,0],surfaceSize:[8,9,1],limbSize:[8,4],evaluations:104,bytes:1664}};
}
function graphics(options={}){
  const gl={},constants=['DRAW_FRAMEBUFFER','READ_FRAMEBUFFER','FRAMEBUFFER_COMPLETE','COLOR_ATTACHMENT0',
    'TEXTURE_2D','RGBA32F','NEAREST','CLAMP_TO_EDGE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','TEXTURE_WRAP_S','TEXTURE_WRAP_T',
    'MAX_TEXTURE_SIZE','MAX_TEXTURE_IMAGE_UNITS','MAX_COMBINED_TEXTURE_IMAGE_UNITS','BLEND','DEPTH_TEST','CULL_FACE',
    'SCISSOR_TEST','STENCIL_TEST','RASTERIZER_DISCARD','SAMPLE_COVERAGE','SAMPLE_ALPHA_TO_COVERAGE','DITHER','COLOR','TRIANGLES'];
  constants.forEach((name,i)=>{gl[name]=i+1;});gl.TEXTURE0=100;gl.NO_ERROR=0;gl.OUT_OF_MEMORY=1285;
  const enabled={blend:true,depthTest:true,cullFace:true,scissorTest:true,stencilTest:true,rasterizerDiscard:true,
    sampleCoverage:true,sampleAlphaToCoverage:true,dither:true};
  const enableNames={blend:'BLEND',depthTest:'DEPTH_TEST',cullFace:'CULL_FACE',scissorTest:'SCISSOR_TEST',
    stencilTest:'STENCIL_TEST',rasterizerDiscard:'RASTERIZER_DISCARD',sampleCoverage:'SAMPLE_COVERAGE',
    sampleAlphaToCoverage:'SAMPLE_ALPHA_TO_COVERAGE',dither:'DITHER'};
  const restore={drawFramebuffer:{hdr:true},readFramebuffer:{read:true},viewport:[13,17,800,600],
    program:{scene:true},vertexArray:{sceneVao:true},activeTexture:gl.TEXTURE0+2,
    textureUnits:[7,8,9,10].map(unit=>({unit,texture:{previous:unit},sampler:{previousSampler:unit}})),
    enabled:{...enabled},colorMask:[false,true,false,true],depthMask:true};
  const state={...restore,viewport:[...restore.viewport],enabled:{...enabled},colorMask:[...restore.colorMask],
    textureUnits:restore.textureUnits.map(value=>({...value}))};
  const live=new Set(),deleted=[],draws=[],clears=[],allocations=[],queries=[],uniforms=new Map(),errors=[];
  let serial=0,attempt=0;
  const resource=type=>{attempt++;if(attempt===options.failAllocation)return null;const r={type,id:++serial};live.add(r);return r;};
  const release=r=>{assert.ok(live.has(r),'delete exactly one owned resource');live.delete(r);deleted.push(r);
    for(const item of state.textureUnits)if(item.texture===r)item.texture=null;
    for(const key of ['drawFramebuffer','readFramebuffer','vertexArray'])if(state[key]===r)state[key]=null;
  };
  const unit=()=>state.textureUnits.find(value=>value.unit===state.activeTexture-gl.TEXTURE0);
  gl.isContextLost=()=>!!options.lost;
  gl.getExtension=name=>{assert.equal(name,'EXT_color_buffer_float');return options.extension===false?null:{};};
  gl.getParameter=name=>{queries.push(name);assert.ok([gl.MAX_TEXTURE_SIZE,gl.MAX_TEXTURE_IMAGE_UNITS,gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS].includes(name),'only capability queries');return name===gl.MAX_TEXTURE_SIZE?(options.maxSize??4096):(options.maxUnits??16);};
  for(const [name,type] of [['createTexture','texture'],['createFramebuffer','framebuffer'],['createVertexArray','vao']])gl[name]=()=>resource(type);
  for(const name of ['deleteTexture','deleteFramebuffer','deleteVertexArray'])gl[name]=release;
  for(const name of ['createShader','compileShader','createProgram','linkProgram','getShaderParameter','getProgramParameter','getUniformLocation','deleteProgram','deleteShader','finish','flush','readPixels'])gl[name]=()=>assert.fail(`Forbidden ${name}`);
  gl.activeTexture=value=>{state.activeTexture=value;};
  gl.bindTexture=(target,value)=>{assert.equal(target,gl.TEXTURE_2D);unit().texture=value;};
  gl.bindSampler=(index,value)=>{state.textureUnits.find(item=>item.unit===index).sampler=value;};
  gl.bindFramebuffer=(target,value)=>{assert.ok([gl.DRAW_FRAMEBUFFER,gl.READ_FRAMEBUFFER].includes(target));state[target===gl.DRAW_FRAMEBUFFER?'drawFramebuffer':'readFramebuffer']=value;};
  gl.bindVertexArray=value=>{state.vertexArray=value;};gl.useProgram=value=>{state.program=value;};
  gl.viewport=(...value)=>{state.viewport=value;};gl.colorMask=(...value)=>{state.colorMask=value;};gl.depthMask=value=>{state.depthMask=value;};
  for(const [method,on] of [['enable',true],['disable',false]])gl[method]=cap=>{
    const key=Object.keys(enableNames).find(name=>gl[enableNames[name]]===cap);assert.ok(key);state.enabled[key]=on;
  };
  gl.texStorage2D=(_target,levels,format,width,height)=>{
    assert.equal(levels,1);assert.equal(format,gl.RGBA32F);allocations.push({width,height,texture:unit().texture});
    if(options.storageError)errors.push(gl.OUT_OF_MEMORY);
  };
  gl.texParameteri=()=>{};
  gl.framebufferTexture2D=(_target,attachment,_type,texture)=>{assert.equal(attachment,gl.COLOR_ATTACHMENT0);state.drawFramebuffer.attachment=texture;};
  gl.checkFramebufferStatus=()=>options.incomplete?0:gl.FRAMEBUFFER_COMPLETE;
  gl.drawBuffers=value=>assert.deepEqual(value,[gl.COLOR_ATTACHMENT0]);
  gl.getError=()=>errors.shift()??0;
  gl.clearBufferfv=(target,index,value)=>{assert.equal(target,gl.COLOR);assert.equal(index,0);clears.push([...value]);};
  for(const method of ['uniform1i','uniform1f','uniform2fv','uniform3fv','uniform2iv','uniform3iv'])gl[method]=(location,value)=>{if(location!=null)uniforms.set(location,Array.isArray(value)?[...value]:value);};
  gl.drawArrays=(mode,first,count)=>{
    assert.equal(mode,gl.TRIANGLES);assert.equal(first,0);assert.equal(count,3);
    assert.ok(Object.values(state.enabled).every(value=>!value),'prepass disables every write-blocking state');
    assert.deepEqual(state.colorMask,[true,true,true,true]);assert.equal(state.depthMask,false);
    assert.ok(state.vertexArray&&live.has(state.vertexArray));
    draws.push({viewport:[...state.viewport],texture:state.drawFramebuffer.attachment,pass:uniforms.get('u_scatteringPass')});
    if(options.drawError)errors.push(gl.OUT_OF_MEMORY);
    options.onDraw?.();
  };
  return {gl,options,state,restore,live,deleted,draws,clears,allocations,queries,uniforms,errors};
}
function setup(options={}){
  const h=graphics(options),program={borrowed:true},programs={generation:7,get:()=>program};
  const manager=createScatteringTargets(h.gl,{contextGeneration:12,programGeneration:7,programs,generatorKey:'generator',
    generatorUniforms:locations,admitPlan:()=>true});
  return {...h,manager,programs,program};
}

test('submits both complete bounded targets using a borrowed ready program and restores caller HDR state',()=>{
  const h=setup(),args=input();assert.equal(h.manager.beginFrame(args.frame),true);
  assert.equal(h.manager.generate('Earth',args,h.restore),true);
  assert.deepEqual(h.draws.map(d=>({viewport:d.viewport,pass:d.pass})),[{viewport:[0,0,8,9],pass:0},{viewport:[0,0,8,4],pass:1}]);
  assert.deepEqual(h.clears,[[0,0,0,0],[0,0,0,0]]);
  assert.deepEqual(h.state,h.restore);assert.equal(h.live.size,4);
  assert.equal(h.manager.status('Earth').state,'submitted');assert.equal(h.manager.status('Earth').estimatedBytes,1664);
  assert.equal(h.manager.status('Earth').gpuCompletionVerified,false);
  const before=h.queries.length;
  assert.equal(h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:h.restore.activeTexture}),true);
  assert.equal(h.uniforms.get('u_scatteringReady'),1);assert.equal(h.state.activeTexture,h.restore.activeTexture);
  assert.equal(h.queries.length,before,'no draw-time state/capability queries');
  h.manager.dispose();h.manager.dispose();assert.equal(h.live.size,0);
});

test('exact frame, binary32 camera/Sun/profile/grid and column identity are required at every bind',()=>{
  for(const change of [a=>a.frame.sceneSerial++,a=>a.frame.epoch+=.001,a=>a.frame.contextGeneration++,
    a=>a.opticalOptions.cameraBodyKm[0]=1,a=>a.opticalOptions.sunDirectionBody[1]=.001,
    a=>a.profile={...a.profile,aerosolG:.7},a=>a.plan.u[1]=.01,a=>a.columnTexture={},a=>a.columnIdentity='changed']){
    const h=setup(),args=input();h.manager.beginFrame(args.frame);assert.equal(h.manager.generate('Earth',args,h.restore),true);
    change(args);assert.equal(h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}),false);
    assert.equal(h.uniforms.get('u_scatteringReady'),0);h.manager.dispose();
  }
  const h=setup(),args=input();h.manager.beginFrame(args.frame);h.manager.generate('Earth',args,h.restore);
  args.opticalOptions.cameraBodyKm[2]+=1e-8;args.plan.cameraBodyKm[2]+=1e-8;
  assert.equal(h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}),true,'same uploaded binary32 identity');
  args.opticalOptions.cameraBodyKm[0]=-0;args.plan.cameraBodyKm[0]=-0;
  assert.equal(h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}),false,'signed zero is an explicit binary32 identity');
});

test('beginning a new frame invalidates earlier submissions even when bind supplies the old identity',()=>{
  const h=setup(),args=input();h.manager.beginFrame(args.frame);h.manager.generate('Earth',args,h.restore);
  assert.equal(h.manager.beginFrame(frame(2)),true);
  assert.equal(h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}),false);
  assert.equal(h.manager.status('Earth').state,'allocated');
  assert.equal(h.manager.beginFrame(frame(1)),false,'serial cannot go backwards');
  assert.equal(h.manager.generate('Earth',args,h.restore),false);assert.equal(h.draws.length,2);
});

test('forged budget and malformed plans cannot allocate even when the caller admission predicate accepts',()=>{
  const changes=[a=>a.plan.evaluations=1,a=>a.plan.bytes=1,a=>a.plan.surfaceSize=[512,512,17],
    a=>a.plan.surfaceSize=[2,2,2],a=>a.plan.limbSize=[NaN,2],a=>a.plan.surfaceSize=[2,Number.MAX_SAFE_INTEGER,17],
    a=>a.plan.cameraBodyKm[0]=1,a=>a.plan.radiusKm=1,a=>a.plan.axis[0]=1e100,
    a=>a.opticalOptions.sunDirectionBody=[0,0,0],a=>a.opticalOptions.solarDistanceAu=1e-40,
    a=>a.profile={...a.profile,cycle:null}];
  for(const [i,change] of changes.entries()){
    const h=setup(),args=input();change(args);if(i===changes.length-1)args.profile.cycle=args.profile;
    h.manager.beginFrame(args.frame);assert.equal(h.manager.generate('Earth',args,h.restore),false,`invalid case ${i}`);
    assert.equal(h.live.size,0);assert.equal(h.allocations.length,0);
  }
});

test('the admitted column sampler location is required even when ozone is bound',()=>{
  const h=graphics(),programs={generation:3,get:()=>({})},admitPlan=()=>true;
  const uniforms={...locations,u_atmosphereOzoneField:'u_atmosphereOzoneField'};
  delete uniforms.u_atmosphereColumnField;
  assert.throws(()=>createScatteringTargets(h.gl,{contextGeneration:12,programGeneration:3,programs,generatorKey:'g',generatorUniforms:uniforms,admitPlan}),/uniform locations required/);
});

test('caller plan admission is mandatory and is rechecked on bind',()=>{
  const h=graphics(),programs={generation:3,get:()=>({})};
  assert.throws(()=>createScatteringTargets(h.gl,{contextGeneration:12,programGeneration:3,programs,generatorKey:'g',generatorUniforms:locations}),/admission/i);
  let admitted=true;const program={};programs.get=()=>program;
  const p=createScatteringTargets(h.gl,{contextGeneration:12,programGeneration:3,programs,generatorKey:'g',generatorUniforms:locations,admitPlan:()=>admitted});
  const args=input();p.beginFrame(args.frame);assert.equal(p.generate('Earth',args,h.restore),true);
  admitted=false;assert.equal(p.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}),false);
  p.dispose();assert.equal(h.live.size,0);
});

test('capability and allocation failures release partial resources and require explicit retry',()=>{
  for(const options of [{extension:false},{maxUnits:9},{maxUnits:10},{maxSize:4},{incomplete:true},
    ...[1,2,3,4].map(failAllocation=>({failAllocation})),{storageError:true},{drawError:true}]){
    const h=setup(options),args=input();h.manager.beginFrame(args.frame);
    assert.equal(h.manager.generate('Earth',args,h.restore),false,JSON.stringify(options));
    assert.equal(h.live.size,0);assert.deepEqual(h.state,h.restore);
    const count=h.allocations.length;h.manager.generate('Earth',args,h.restore);assert.equal(h.allocations.length,count,'no implicit retry loop');
    h.manager.dispose();assert.equal(h.live.size,0);
  }
  const h=setup({failAllocation:2}),args=input();h.manager.beginFrame(args.frame);
  assert.equal(h.manager.generate('Earth',args,h.restore),false);h.options.failAllocation=0;
  assert.equal(h.manager.retry('Earth'),true);assert.equal(h.manager.generate('Earth',args,h.restore),true);
});

test('resident groups are capped at two and growth releases the old group before allocation',()=>{
  const h=setup(),a=input(),b=input();h.manager.beginFrame(a.frame);
  assert.equal(h.manager.generate('Earth',a,h.restore),true);assert.equal(h.manager.generate('Mars',b,h.restore),true);
  assert.equal(h.live.size,8);assert.equal(h.manager.generate('third',input(),h.restore),false);assert.equal(h.live.size,8);
  const prior=[...h.live];a.plan.surfaceSize=[4,9,9];a.plan.heightRange=[0,1];a.plan.evaluations=356;a.plan.bytes=5696;
  assert.equal(h.manager.generate('Earth',a,h.restore),true);assert.equal(h.live.size,8);
  assert.ok(prior.slice(0,4).every(resource=>!h.live.has(resource)));
  h.manager.cancel();assert.equal(h.live.size,0);h.manager.dispose();
});

test('cancellation, context loss and program replacement cannot admit late submission',()=>{
  const h=setup(),args=input();h.manager.beginFrame(args.frame);
  h.options.onDraw=()=>h.manager.cancel('Earth');
  assert.equal(h.manager.generate('Earth',args,h.restore),false);assert.equal(h.live.size,0);assert.deepEqual(h.state,h.restore);
  h.options.onDraw=null;assert.equal(h.manager.retry('Earth'),true);assert.equal(h.manager.generate('Earth',args,h.restore),true);
  h.programs.get=()=>({replacement:true});
  assert.equal(h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}),false);
  assert.equal(h.live.size,0);assert.equal(h.manager.retry('Earth'),false);
  const lost=setup(),other=input();lost.manager.beginFrame(other.frame);lost.manager.generate('Earth',other,lost.restore);lost.options.lost=true;
  assert.equal(lost.manager.bind('Earth',other,{program:lost.restore.program,locations,activeTexture:102}),false);
  assert.equal(lost.live.size,0);
});

test('restores the exact default framebuffer and hands consumed GL errors to diagnostics',()=>{
  const h=setup(),args=input();h.restore.drawFramebuffer=null;h.restore.readFramebuffer=null;
  h.state.drawFramebuffer=null;h.state.readFramebuffer=null;h.manager.beginFrame(args.frame);h.errors.push(1282,1281);
  assert.equal(h.manager.generate('Earth',args,h.restore),false);
  assert.equal(h.live.size,0);assert.deepEqual(h.state,h.restore);
  assert.deepEqual(h.manager.status('Earth').glErrors,[{phase:'entry',code:1282}]);
  assert.equal(h.gl.getError(),1281,'does not silently drain the caller error queue');
  h.manager.retry('Earth');assert.equal(h.manager.generate('Earth',args,h.restore),true);
  assert.deepEqual(h.state,h.restore);
});

test('restores any supported active selector, including units above the ten-unit minimum',()=>{
  const h=setup({maxUnits:16}),args=input();h.restore.activeTexture=115;h.state.activeTexture=115;
  h.manager.beginFrame(args.frame);assert.equal(h.manager.generate('Earth',args,h.restore),true);
  assert.deepEqual(h.state,h.restore);
  assert.equal(h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:115}),true);
  assert.equal(h.state.activeTexture,115);
});

test('silent GL binding and restoration errors never report a usable submission',()=>{
  for(const phase of ['binding','restoration']){
    const h=setup(),args=input();h.manager.beginFrame(args.frame);
    if(phase==='binding')assert.equal(h.manager.generate('Earth',args,h.restore),true);
    const original=phase==='binding'?h.gl.bindTexture:h.gl.useProgram;
    let injected=false;
    if(phase==='binding')h.gl.bindTexture=(target,value)=>{original(target,value);if(!injected&&value?.type==='texture'){injected=true;h.errors.push(1282);}};
    else h.gl.useProgram=value=>{original(value);if(!injected&&value===h.restore.program){injected=true;h.errors.push(1282);}};
    const ok=phase==='binding'?h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}):h.manager.generate('Earth',args,h.restore);
    assert.equal(ok,false,phase);assert.equal(h.manager.status('Earth').state,'unavailable');
    assert.equal(h.live.size,0);assert.ok(h.manager.status('Earth').glErrors.some(item=>item.phase===phase&&item.code===1282));
    if(phase==='binding')assert.equal(h.uniforms.get('u_scatteringReady'),0);else assert.deepEqual(h.state,h.restore);
  }
});

test('replacement or frame advancement inside admission cannot validate a stale bind',()=>{
  for(const replacement of ['program','frame']){
    const h=graphics(),program={},programs={generation:7,get:()=>program};let onAdmit=()=>{};
    const manager=createScatteringTargets(h.gl,{contextGeneration:12,programGeneration:7,programs,generatorKey:'g',generatorUniforms:locations,
      admitPlan:()=>{onAdmit();return true;}});
    const args=input();manager.beginFrame(args.frame);assert.equal(manager.generate('Earth',args,h.restore),true);
    onAdmit=()=>{if(replacement==='program')programs.get=()=>null;else manager.beginFrame(frame(2));};
    assert.equal(manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}),false,replacement);
    assert.equal(h.uniforms.get('u_scatteringReady'),0);manager.dispose();assert.equal(h.live.size,0);
  }
});

test('rejects restore handles owned by this manager before any resize mutation',()=>{
  const h=setup(),args=input();h.manager.beginFrame(args.frame);h.manager.generate('Earth',args,h.restore);
  const calls=h.draws.length;const invalid={...h.restore,textureUnits:h.restore.textureUnits.map(item=>({...item}))};
  invalid.textureUnits[1].texture=h.allocations[0].texture;
  h.state.textureUnits[1].texture=invalid.textureUnits[1].texture;
  assert.equal(h.manager.generate('Earth',args,invalid),false);
  assert.equal(h.draws.length,calls);assert.deepEqual(h.state,invalid);assert.equal(h.live.size,4,'invalid preflight cannot delete still-bound owned handles');
  assert.equal(h.manager.status('Earth').submission,null);assert.equal(h.manager.status('Earth').state,'unavailable');
  h.manager.cancel();assert.equal(h.live.size,0);
});

test('accepts the fixed 65536-node ceiling and rejects a one-node excess independently of caller admission',()=>{
  for(const excess of [false,true]){
    const h=setup({maxSize:8192}),args=input();args.plan.surfaceSize=[112,512,1];args.plan.limbSize=[128,64];
    if(excess){args.plan.surfaceSize=[127,451,1];args.plan.limbSize=[2,4130];}
    args.plan.evaluations=args.plan.surfaceSize.reduce((a,b)=>a*b,1)+args.plan.limbSize.reduce((a,b)=>a*b,1);
    args.plan.bytes=args.plan.evaluations*16;h.manager.beginFrame(args.frame);
    assert.equal(args.plan.evaluations,excess?65537:65536);
    assert.equal(h.manager.generate('Earth',args,h.restore),!excess);h.manager.dispose();assert.equal(h.live.size,0);
  }
});

test('supports current and legacy nine/seventeen-plane shapes and a failed resize leaves no old submission',()=>{
  for(const shape of [[128,49,9],[80,41,17],[96,65,9],[64,49,17]]){
    const h=setup(),args=input();args.plan.surfaceSize=shape;args.plan.limbSize=[128,64];args.plan.heightRange=[0,1];
    args.plan.evaluations=shape.reduce((a,b)=>a*b,1)+8192;args.plan.bytes=args.plan.evaluations*16;
    h.manager.beginFrame(args.frame);assert.equal(h.manager.generate('Earth',args,h.restore),true);
    assert.deepEqual(h.allocations.map(({width,height})=>[width,height]),[[shape[0],shape[1]*shape[2]],[128,64]]);
    assert.deepEqual(h.draws.map(({viewport})=>viewport),[[0,0,shape[0],shape[1]*shape[2]],[0,0,128,64]]);
    assert.equal(h.manager.status('Earth').estimatedBytes,args.plan.bytes);
    h.options.incomplete=true;args.plan.surfaceSize=[8,9,1];args.plan.evaluations=8264;args.plan.bytes=132224;
    assert.equal(h.manager.generate('Earth',args,h.restore),false);assert.equal(h.live.size,0);
    assert.equal(h.manager.bind('Earth',args,{program:h.restore.program,locations,activeTexture:102}),false);
    assert.equal(h.uniforms.get('u_scatteringReady'),0);assert.deepEqual(h.state,h.restore);
  }
});

test('disposal and caller mutation during submission cannot leave a late ready result',()=>{
  const h=setup(),args=input();h.manager.beginFrame(args.frame);h.options.onDraw=()=>h.manager.dispose();
  assert.equal(h.manager.generate('Earth',args,h.restore),false);assert.equal(h.live.size,0);assert.deepEqual(h.state,h.restore);
  assert.equal(h.manager.status('Earth').state,'disposed');assert.equal(h.manager.retry('Earth'),false);
  const other=setup(),next=input();other.manager.beginFrame(next.frame);
  other.options.onDraw=()=>{next.opticalOptions.sunDirectionBody[1]=.1;};
  assert.equal(other.manager.generate('Earth',next,other.restore),true,'submitted immutable original inputs');
  assert.equal(other.manager.bind('Earth',next,{program:other.restore.program,locations,activeTexture:102}),false,'mutated caller input never matches the immutable submission');
  other.manager.dispose();assert.equal(other.live.size,0);
});
