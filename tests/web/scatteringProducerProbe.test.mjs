import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {installProgramSourceEvidence} from '../../tools/physical_spin_probe.mjs';
import {installScatteringProducerEvidence} from '../../tools/scattering_producer_probe.mjs';

function fixture(){
  const names=['VERTEX_SHADER','FRAGMENT_SHADER','TEXTURE_2D','TEXTURE_BINDING_2D','ACTIVE_TEXTURE','CURRENT_PROGRAM',
    'DRAW_FRAMEBUFFER','READ_FRAMEBUFFER','FRAMEBUFFER','DRAW_FRAMEBUFFER_BINDING','COLOR_ATTACHMENT0','DRAW_BUFFER0',
    'FRAMEBUFFER_ATTACHMENT_OBJECT_NAME','FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE','FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL','TEXTURE',
    'VIEWPORT','COLOR_WRITEMASK','DEPTH_WRITEMASK','RGBA32F','RG32F','TRIANGLES','COLOR','SAMPLER_BINDING',
    'BLEND','DEPTH_TEST','CULL_FACE','SCISSOR_TEST','STENCIL_TEST','RASTERIZER_DISCARD','SAMPLE_COVERAGE','SAMPLE_ALPHA_TO_COVERAGE','DITHER'];
  const constants=Object.fromEntries(names.map((name,i)=>[name,i+1]));Object.assign(constants,{TEXTURE0:100,COLOR_BUFFER_BIT:0x4000});
  const calls=[],frame={contextGeneration:2,sceneSerial:5,epoch:2451545},columnTexture={},surface={},limb={},fbo={};
  const column={status:'ready',internalFormat:constants.RG32F,sha256:'c'.repeat(64),sequence:1};
  class GL{
    constructor(){Object.assign(this,constants);this.unit=this.TEXTURE0;this.textures=new Map();this.samplers=new Map();this.attachments=new Map();
      this.program=null;this.framebuffer=null;this.viewportValue=[0,0,1,1];this.mask=[true,true,true,true];this.depth=false;this.enabled=new Set();this.lost=false;}
    createShader(type){return {type};} shaderSource(){} attachShader(){} detachShader(){} linkProgram(){} deleteProgram(){}
    useProgram(program){calls.push(['useProgram',this,program]);if(!program?.invalid)this.program=program;}
    activeTexture(unit){this.unit=unit;} bindTexture(_target,texture){if(!texture?.invalid)this.textures.set(this.unit,texture);}
    bindSampler(unit,sampler){this.samplers.set(this.TEXTURE0+unit,sampler);}
    bindFramebuffer(target,value){if(target!==this.READ_FRAMEBUFFER&&!value?.invalid)this.framebuffer=value;}
    framebufferTexture2D(_target,_attachment,_type,texture,level){if(!texture?.invalid)this.attachments.set(this.framebuffer,{texture,level});}
    texStorage2D(...args){calls.push(['texStorage2D',this,...args]);} texParameteri(){} texParameterf(){}
    texImage2D(){} texSubImage2D(){} copyTexImage2D(){} copyTexSubImage2D(){} compressedTexImage2D(){} compressedTexSubImage2D(){} generateMipmap(){} deleteTexture(){}
    viewport(...value){this.viewportValue=value;} colorMask(...value){this.mask=value;} depthMask(value){this.depth=value;}
    enable(value){this.enabled.add(value);} disable(value){this.enabled.delete(value);} isEnabled(value){return this.enabled.has(value);}
    isContextLost(){return this.lost;}
    getParameter(name){
      switch(name){
        case this.CURRENT_PROGRAM:return this.program;case this.ACTIVE_TEXTURE:return this.unit;
        case this.TEXTURE_BINDING_2D:return this.textures.get(this.unit)||null;case this.SAMPLER_BINDING:return this.samplers.get(this.unit)||null;
        case this.DRAW_FRAMEBUFFER_BINDING:return this.framebuffer;case this.DRAW_BUFFER0:return this.drawBuffer??this.COLOR_ATTACHMENT0;
        case this.VIEWPORT:return this.viewportValue;case this.COLOR_WRITEMASK:return this.mask;case this.DEPTH_WRITEMASK:return this.depth;
        default:throw Error(`Unexpected query ${name}`);
      }
    }
    getFramebufferAttachmentParameter(_target,_attachment,name){const a=this.attachments.get(this.framebuffer);
      if(name===this.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)return a?.texture;
      if(name===this.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)return this.TEXTURE;
      if(name===this.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL)return a?.level;throw Error('Unknown attachment query');}
    getUniformLocation(program,name){return Object.hasOwn(program.uniforms,name)?{program,name}:null;}
    getUniform(program,location){assert.equal(location.program,program);const value=program.uniforms[location.name];return Array.isArray(value)?new Float32Array(value):value;}
    drawArrays(...args){calls.push(['drawArrays',this,...args]);if(this.throwDraw)throw Error('Native draw rejected');return 'native-result';}
    drawElements(){} drawElementsInstanced(){} drawArraysInstanced(){} drawRangeElements(){}
    clear(){} clearBufferfv(){} clearBufferiv(){} clearBufferuiv(){} blitFramebuffer(){}
  }
  const gl=new GL(),context=vm.createContext({WebGL2RenderingContext:GL,
    __solPhysicalTextureEvidence:{snapshot:(actual,texture)=>actual===gl&&texture===columnTexture?column:null}});
  vm.runInContext(`(${installProgramSourceEvidence.toString()})()`,context);
  vm.runInContext(`(${installScatteringProducerEvidence.toString()})()`,context);
  const evidence=context.__solScatteringProducerEvidence;
  const atmosphere={u_atmosphereEnabled:1,u_atmosphereRadiusKm:1,u_atmosphereTopKm:1,u_atmospherePolarRatio:1,
    u_atmosphereDensityScaleKm:[3,4],u_atmosphereRayleighKm:[.1,.2,.3],u_atmosphereAerosolKm:[.4,.5,.6],
    u_atmosphereAerosolSSA:[.7,.8,.9],u_atmosphereG:.8,u_atmosphereCameraKm:[0,0,3],u_atmosphereSunDirection:[-1,0,0],
    u_atmosphereSolarScale:1,u_atmosphereExposure:1};
  for(const key of Object.keys(atmosphere))atmosphere[key]=Array.isArray(atmosphere[key])?atmosphere[key].map(Math.fround):Math.fround(atmosphere[key]);
  const grid={u_scatteringAxis:[0,0,1],u_scatteringU:[0,-1,0],u_scatteringV:[1,0,0],u_scatteringCameraRadius:3,
    u_scatteringHeightRange:[0,0],u_scatteringSurfaceSize:[128,193,1],u_scatteringLimbSize:[128,64]};
  const generator={uniforms:{...atmosphere,...grid,u_scatteringPass:0,u_atmosphereColumnField:7}},consumer={uniforms:{...grid,
    u_scatteringReady:1,u_scatteringSurface:8,u_scatteringLimb:9}};
  delete consumer.uniforms.u_scatteringAxis;delete consumer.uniforms.u_scatteringCameraRadius;
  delete consumer.uniforms.u_scatteringLimb;delete consumer.uniforms.u_scatteringLimbSize;
  const link=(program=generator,fragment='generator fragment')=>{
    const vs=gl.createShader(gl.VERTEX_SHADER),fs=gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vs,'generator vertex');gl.shaderSource(fs,fragment);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    gl.detachShader(program,vs);gl.detachShader(program,fs);
  };link();
  const configure=()=>evidence.configure({vertexSource:'generator vertex',fragmentSource:'generator fragment',getFrame:()=>frame});configure();
  const allocate=(texture,width,height,format=gl.RGBA32F)=>{gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,1,format,width,height);};
  allocate(surface,128,193);allocate(limb,128,64);
  gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,columnTexture);
  const produce=(pass,beforeDraw=()=>{},texture=pass===0?surface:limb)=>{
    gl.useProgram(generator);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    gl.viewport(0,0,128,pass===0?193:64);gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));
    generator.uniforms.u_scatteringPass=pass;beforeDraw();return gl.drawArrays(gl.TRIANGLES,0,3);
  };
  const bound=()=>{gl.useProgram(consumer);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
    for(const [unit,texture]of [[8,surface],[9,limb]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);}gl.activeTexture(gl.TEXTURE0+2);};
  const published={state:'submitted',submission:{...frame}};
  const capture=(overrides={})=>evidence.capture(gl,consumer,atmosphere,{frame,columnTexture,published,heightRange:[0,0],sizes:{surface:[128,193,1],limb:[128,64]},...overrides});
  return {gl,context,evidence,calls,frame,column,columnTexture,surface,limb,fbo,atmosphere,grid,generator,consumer,published,
    link,configure,allocate,produce,bound,capture,complete:()=>{produce(0);produce(1);bound();}};
}

test('producer evidence requires two actual full color-writing draws and joins bound current consumer textures',()=>{
  const f=fixture();assert.equal(f.capture().passed,false,'published status alone cannot pass');
  f.complete();const r=f.capture();assert.equal(r.passed,true,r.reason);assert.equal(r.passes.length,2);
  assert.ok(r.passes[0].drawSequence<r.passes[1].drawSequence);assert.equal(r.passes[0].column.sha256,f.column.sha256);
  assert.equal(r.counters.candidateQueries,2);assert.equal(r.counters.accepted,2);
  assert.equal(f.gl.getParameter(f.gl.ACTIVE_TEXTURE),f.gl.TEXTURE0+2,'capture restores selector');
  assert.equal(f.produce(0),'native-result');assert.ok(f.calls.every(call=>call[1]===f.gl));
});

test('stale frame, context generation, epoch, incomplete pair, held output and reversed passes reject',()=>{
  for(const change of [f=>f.frame.sceneSerial++,f=>f.frame.contextGeneration++,f=>f.frame.epoch++,
    f=>f.published.state='unavailable',f=>f.published.submission.sceneSerial++,f=>f.gl.lost=true,
    f=>{f.produce(0);f.bound();},f=>f.configure(),f=>{f.gl.activeTexture(f.gl.TEXTURE0+9);f.gl.bindTexture(f.gl.TEXTURE_2D,{});},
    f=>{f.produce(1);f.produce(0);f.bound();}]){
    const f=fixture();f.complete();change(f);assert.equal(f.capture().passed,false);
  }
  const f=fixture();f.produce(0);f.bound();assert.equal(f.capture().passed,false);
});

test('actual producer write state and active profile are mandatory, with no source-hint substitution',()=>{
  for(const change of [f=>f.gl.program={uniforms:f.generator.uniforms},f=>f.gl.viewport(1,0,128,193),
    f=>f.gl.colorMask(false,true,true,true),f=>f.gl.depthMask(true),f=>f.gl.enable(f.gl.SCISSOR_TEST),
    f=>f.gl.enable(f.gl.RASTERIZER_DISCARD),f=>f.gl.drawBuffer=0,
    f=>f.gl.attachments.get(f.fbo).level=1,f=>f.generator.uniforms.u_atmosphereEnabled=0,
    f=>f.generator.uniforms.u_atmosphereColumnField=6,f=>f.gl.bindSampler(7,{}),
    f=>f.generator.uniforms.u_scatteringSurfaceSize=[128,192,1],f=>delete f.generator.uniforms.u_atmosphereG]){
    const f=fixture();f.produce(0,()=>change(f));f.produce(1);f.bound();assert.equal(f.capture().passed,false);
  }
  const f=fixture();f.produce(0,()=>{const invalid={invalid:true,uniforms:f.generator.uniforms};f.link(invalid);f.gl.useProgram(invalid);});
  f.produce(1);f.bound();assert.equal(f.capture().passed,false,'ignored invalid useProgram hint cannot replace actual CURRENT_PROGRAM');
});

test('generator source mismatch is CPU-filtered before driver queries and relinks invalidate accepted outputs',()=>{
  const f=fixture();f.complete();f.link(f.generator,'incorrect fragment');f.bound();assert.equal(f.capture().passed,false);
  f.produce(0);f.bound();const r=f.capture();assert.equal(r.passed,false);assert.equal(r.counters.sourceFiltered,1);
  assert.equal(r.counters.candidateQueries,2,'nonmatching source adds no candidate driver query');
});

test('current profile, camera, Sun, grid, datum range, and static column revision must match both passes',()=>{
  for(const change of [f=>f.atmosphere.u_atmosphereCameraKm=[0,0,4],f=>f.atmosphere.u_atmosphereSunDirection=[0,-1,0],
    f=>f.atmosphere.u_atmosphereExposure=2,f=>f.atmosphere.u_atmosphereAerosolSSA=[1,1,1],
    f=>f.consumer.uniforms.u_scatteringU=[1,0,0],f=>f.consumer.uniforms.u_scatteringHeightRange=[0,1],
    f=>f.consumer.uniforms.u_scatteringSurface=9,f=>f.gl.bindSampler(8,{}),
    f=>f.column.sequence++,f=>f.column.sha256='changed',f=>f.column.status='invalid']){
    const f=fixture();f.complete();change(f);assert.equal(f.capture().passed,false);
  }
  for(const key of ['u_scatteringAxis','u_scatteringCameraRadius']){
    const f=fixture();f.generator.uniforms[key]=key.endsWith('Axis')?[1,0,0]:4;f.complete();assert.equal(f.capture().passed,false);
  }
  const f=fixture();f.generator.uniforms.u_scatteringU=[1,0,0];f.generator.uniforms.u_scatteringV=[0,1,0];
  f.consumer.uniforms.u_scatteringU=[1,0,0];f.consumer.uniforms.u_scatteringV=[0,1,0];f.complete();
  assert.equal(f.capture().passed,false,'shared stale basis cannot prove correspondence with the actual camera');
});

test('every supported texture mutation, output clear/write, delete, or reallocation invalidates draw evidence',()=>{
  for(const name of ['texImage2D','texSubImage2D','copyTexImage2D','copyTexSubImage2D','compressedTexImage2D','compressedTexSubImage2D',
    'generateMipmap','texParameteri','texParameterf','deleteTexture','texStorage2D']){
    const f=fixture();f.complete();f.gl.activeTexture(f.gl.TEXTURE0+8);
    if(name==='deleteTexture')f.gl[name](f.surface);else f.gl[name](f.gl.TEXTURE_2D,1,f.gl.RGBA32F,128,193);
    assert.equal(f.capture().passed,false,name);
  }
  for(const name of ['clear','clearBufferfv','clearBufferiv','clearBufferuiv','blitFramebuffer','drawElements',
    'drawElementsInstanced','drawArraysInstanced','drawRangeElements','drawArrays']){
    const f=fixture();f.complete();f.gl.bindFramebuffer(f.gl.DRAW_FRAMEBUFFER,f.fbo);
    f.gl.framebufferTexture2D(f.gl.DRAW_FRAMEBUFFER,f.gl.COLOR_ATTACHMENT0,f.gl.TEXTURE_2D,f.surface,0);
    f.gl[name](name==='clear'?f.gl.COLOR_BUFFER_BIT:f.gl.COLOR,0,3);assert.equal(f.capture().passed,false,name);
  }
});

test('same current inputs may regenerate a fresh pair, unrelated framebuffer drawing preserves it',()=>{
  const f=fixture();f.complete();f.gl.clear(f.gl.COLOR_BUFFER_BIT);f.gl.drawElements(f.gl.TRIANGLES,123,0,0);
  assert.equal(f.capture().passed,true);f.frame.sceneSerial++;f.published.submission={...f.frame};f.complete();assert.equal(f.capture().passed,true);
  const g=fixture();g.allocate(g.surface,128,193,g.gl.RG32F);g.complete();assert.equal(g.capture().passed,false);
});

test('native exceptions propagate and observer failures cannot alter native draw return behavior',()=>{
  const f=fixture();f.gl.throwDraw=true;assert.throws(()=>f.produce(0),/Native draw rejected/);
  f.gl.throwDraw=false;f.context.__solPhysicalTextureEvidence.snapshot=()=>{throw Error('observer-only failure');};
  assert.equal(f.produce(0),'native-result');f.produce(1);f.bound();assert.equal(f.capture().passed,false);
});

test('basis proof admits independently rounded oblate cameras and both projected-Sun and fallback axes',()=>{
  const normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  for(const singleScale of [false,true])for(const camera of [[100.123,-312.875,7492.14],[7310.11,94.27,-218.531]]){
    const f=fixture(),q=.99664,c=[camera[0],camera[1],camera[2]/q],axis=normalize(c),light=normalize([-.871,.315,-.19/q]);
    const dot=axis.reduce((sum,x,i)=>sum+x*light[i],0);
    const u=singleScale?normalize(light.map((x,i)=>x-dot*axis[i])):normalize(cross(Math.abs(axis[2])<.9?[0,0,1]:[1,0,0],axis));
    const v=cross(axis,u),changes={u_atmosphereCameraKm:camera.map(Math.fround),u_atmospherePolarRatio:Math.fround(q),
      u_atmosphereSunDirection:normalize([-.871,.315,-.19]).map(Math.fround),u_atmosphereDensityScaleKm:singleScale?[3,3]:[3,4]};
    Object.assign(f.atmosphere,changes);Object.assign(f.generator.uniforms,changes,{u_scatteringAxis:axis.map(Math.fround),
      u_scatteringCameraRadius:Math.fround(Math.hypot(...c)),u_scatteringU:u.map(Math.fround),u_scatteringV:v.map(Math.fround)});
    Object.assign(f.consumer.uniforms,{u_scatteringU:u.map(Math.fround),u_scatteringV:v.map(Math.fround)});
    f.complete();const result=f.capture();assert.equal(result.passed,true,result.reason);
  }
});

test('invalid native binding hints cannot hide writes or mutations to previously admitted outputs',()=>{
  for(const change of [f=>{f.gl.bindFramebuffer(f.gl.DRAW_FRAMEBUFFER,f.fbo);f.gl.bindFramebuffer(f.gl.DRAW_FRAMEBUFFER,{invalid:true});f.gl.clear(f.gl.COLOR_BUFFER_BIT);},
    f=>{f.gl.bindFramebuffer(f.gl.DRAW_FRAMEBUFFER,f.fbo);f.gl.framebufferTexture2D(f.gl.DRAW_FRAMEBUFFER,f.gl.COLOR_ATTACHMENT0,f.gl.TEXTURE_2D,{invalid:true},0);f.gl.clear(f.gl.COLOR_BUFFER_BIT);},
    f=>{f.gl.activeTexture(f.gl.TEXTURE0+8);f.gl.bindTexture(f.gl.TEXTURE_2D,{invalid:true});f.gl.texSubImage2D(f.gl.TEXTURE_2D,0,0,0,1,1,0,0,null);},
    f=>{f.gl.program={uniforms:f.consumer.uniforms};}]){
    const f=fixture();f.complete();change(f);assert.equal(f.capture().passed,false);
  }
});

test('surface-only optimized limb uniforms are absent while required surface uniforms and both producer dimensions stay mandatory',()=>{
  const f=fixture();f.complete();assert.equal(f.capture().passed,true);
  assert.equal(f.gl.getUniformLocation(f.consumer,'u_scatteringLimb'),null);
  assert.equal(f.gl.getUniformLocation(f.consumer,'u_scatteringLimbSize'),null);
  for(const name of ['u_scatteringSurface','u_scatteringSurfaceSize','u_scatteringHeightRange','u_scatteringU','u_scatteringV']){
    const g=fixture();g.complete();delete g.consumer.uniforms[name];assert.equal(g.capture().passed,false,name);
  }
  const g=fixture();g.generator.uniforms.u_scatteringLimbSize=[64,64];g.allocate(g.limb,64,64);
  g.produce(0);g.produce(1,()=>g.gl.viewport(0,0,64,64));g.bound();assert.equal(g.capture().passed,false,'unused limb dimensions still require the admitted plan');
});

test('shell schema requires its active limb uniforms while still validating the complete producer pair',()=>{
  const f=fixture();f.complete();delete f.consumer.uniforms.u_scatteringSurface;delete f.consumer.uniforms.u_scatteringSurfaceSize;
  delete f.consumer.uniforms.u_scatteringHeightRange;Object.assign(f.consumer.uniforms,{u_scatteringLimb:9,u_scatteringLimbSize:[128,64]});
  const result=f.capture({consumerKind:'shell'});assert.equal(result.passed,true,result.reason);
  assert.equal(result.passes.length,2);delete f.consumer.uniforms.u_scatteringLimbSize;
  assert.equal(f.capture({consumerKind:'shell'}).passed,false);
  assert.equal(f.capture({consumerKind:'unknown'}).passed,false);
});
