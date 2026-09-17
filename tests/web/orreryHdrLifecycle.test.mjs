import assert from 'node:assert/strict';
import test from 'node:test';
import {orreryHarness} from './helpers/orreryHarness.mjs';

function allowFloatTarget(gl){
  const extension=gl.getExtension.bind(gl),parameter=gl.getParameter.bind(gl);let color;
  Object.assign(gl,{MAX_RENDERBUFFER_SIZE:0x84e8,FRAMEBUFFER_COMPLETE:0x8cd5,
    getExtension:name=>name==='EXT_color_buffer_float'?{}:extension(name),
    getParameter:name=>name===0x84e8?4096:parameter(name),
    checkFramebufferStatus:()=>0x8cd5,
    clearBufferfv:(_buffer,_index,value)=>{color=value;},
    readPixels:(_x,_y,_w,_h,_format,_type,result)=>result.set(color),
  });
}

test('candidate dispatches every pass to linear composition and palettes restore the whole SDR frame',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true});
  await h.enterOrrery();t.after(()=>h.leaveOrrery());
  allowFloatTarget(h.gl);h.state.hdrEnabled=true;
  h.check('orreryTextures',true);
  assert.equal(h.state.hdrStatus.state,'ready');
  assert.equal(h.state.hdrStatus.presented.epoch,h.state.renderUnix);
  const first=h.gpuSubmissions.length;h.check('orreryShowOrbits',true);
  const scene=h.gpuSubmissions.slice(first).filter(draw=>!draw.uniforms.u_frameSerial);
  assert.ok(scene.length>5);assert.ok(scene.every(draw=>draw.uniforms.u_linearOutput===1));
  const released=h.deletedTextures.length;
  h.check('orreryEarthIce',true);
  assert.match(h.state.hdrStatus.reason,/palette/);
  assert.equal(h.state.hdrFrame,null);assert.ok(h.deletedTextures.length>released);
  const afterPalette=h.gpuSubmissions.length;h.check('orreryTextures',true);
  assert.ok(h.gpuSubmissions.slice(afterPalette).every(draw=>draw.uniforms.u_linearOutput===0));
  h.check('orreryEarthIce',false);assert.equal(h.state.hdrStatus.state,'ready');
  h.leaveOrrery();assert.equal(h.state.hdrFrame,null);
  await h.enterOrrery();assert.equal(h.state.hdrStatus.state,'ready');
});

test('missing float capability preserves usable scene and explicit unavailable status without changing resolution',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true,floatTargets:false});
  await h.enterOrrery();t.after(()=>h.leaveOrrery());h.state.hdrEnabled=true;
  const canvas=h.nodes.orreryCanvas,size=[canvas.width,canvas.height];
  h.check('orreryTextures',true);
  assert.equal(h.state.hdrStatus.state,'unavailable');assert.match(h.state.hdrStatus.reason,/Floating-point/);
  assert.equal(h.state.hdrFrame,null);assert.deepEqual([canvas.width,canvas.height],size);
  assert.equal(h.errors.length,0);
});

for(const failure of ['gpu-error','frame-identity'])test(`HDR ${failure} preserves rejection status while repainting SDR until owner replacement`,async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true});
  await h.enterOrrery();t.after(()=>h.leaveOrrery());h.setAnimate(false);allowFloatTarget(h.gl);
  const getError=h.gl.getError.bind(h.gl);let errorPending=false,inject=true,attempts=0;
  h.gl.getError=()=>{if(errorPending){errorPending=false;return h.gl.INVALID_VALUE;}return getError();};
  for(const method of ['drawArrays','drawElements']){
    const draw=h.gl[method].bind(h.gl);
    h.gl[method]=(...args)=>{
      draw(...args);const uniforms=h.gpuSubmissions.at(-1).uniforms;
      if(uniforms.u_frameSerial){attempts++;if(inject&&failure==='gpu-error'){inject=false;errorPending=true;}}
      else if(inject&&failure==='frame-identity'&&uniforms.u_linearOutput===1){inject=false;h.state.hdrFrame.serial=0;}
    };
  }
  const before=h.gpuSubmissions.length,released=h.deletedTextures.length;
  h.state.hdrEnabled=true;h.check('orreryTextures',true);
  assert.equal(inject,false,'The actual HDR route reached the injected failure');
  assert.equal(h.state.hdrStatus.state,'unavailable');
  assert.match(h.state.hdrStatus.reason,failure==='gpu-error'?/GPU rejected HDR presentation/:/HDR presentation rejected/);
  assert.equal(h.state.hdrStatus.estimatedBytes,0);assert.equal(h.state.hdrStatus.presented,null);
  assert.equal(h.state.hdrFrame,null);assert.ok(h.deletedTextures.length>released);
  const reason=h.state.hdrStatus.reason;
  const draws=h.gpuSubmissions.slice(before);
  const fallback=draws.slice(draws.findLastIndex(draw=>draw.uniforms.u_linearOutput===1||draw.uniforms.u_frameSerial)+1);
  assert.ok(fallback.length>5);assert.ok(fallback.every(draw=>draw.uniforms.u_linearOutput===0&&draw.framebuffer===null),
    'The SDR fallback submits all its draws to the default framebuffer');
  assert.match(h.nodes.orreryPhysicalStatus.textContent,new RegExp(reason.replaceAll('.','\\.')));
  const allocations=h.textureRecords.length,presented=attempts;
  h.resize(810,610);h.check('orreryShowOrbits',true);
  assert.equal(h.state.hdrStatus.state,'unavailable');assert.equal(h.state.hdrStatus.reason,reason);
  assert.equal(attempts,presented);assert.equal(h.textureRecords.length,allocations,'Repaints do not retry the disposed owner');
  h.state.hdrEnabled=false;h.check('orreryTextures',true);
  assert.equal(h.state.hdrStatus.state,'deferred');assert.match(h.state.hdrStatus.reason,/disabled/);
  h.state.hdrEnabled=true;h.check('orreryTextures',true);
  assert.equal(h.state.hdrStatus.state,'ready');assert.equal(attempts,presented+1);
  assert.equal(h.state.hdrStatus.presented.epoch,h.state.renderUnix);assert.deepEqual(h.errors,[]);
});

test('scattering generation restores the active HDR target before physical surface and shell composition',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true,incidentField:async()=>({
    values:new Float32Array(4*257*195),width:257,height:195,domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}})});
  await h.enterOrrery();t.after(()=>h.leaveOrrery());h.setAnimate(false);allowFloatTarget(h.gl);h.state.hdrEnabled=true;
  h.input('orreryAnchor','Earth','change');await h.settle();
  const parameter=h.gl.getParameter,framebufferQueries=[];
  h.gl.getParameter=name=>{if(name===h.gl.DRAW_FRAMEBUFFER_BINDING||name===h.gl.READ_FRAMEBUFFER_BINDING)framebufferQueries.push(name);return parameter(name);};
  const first=h.gpuSubmissions.length;h.resize(810,610);h.gl.getParameter=parameter;
  assert.deepEqual(framebufferQueries,[],'the HDR scene target is restored from its presentation owner, not read back from the driver');
  const draws=h.gpuSubmissions.slice(first),generated=draws.filter(draw=>Number.isInteger(draw.uniforms.u_scatteringPass));
  const physical=draws.filter(draw=>draw.kind==='elements'&&draw.uniforms.u_scatteringReady===1);
  const presented=draws.find(draw=>draw.uniforms.u_frameSerial);
  assert.equal(generated.length,2);assert.equal(physical.length,2);assert.ok(presented);
  assert.ok(physical[0].framebuffer);assert.equal(physical[0].framebuffer,physical[1].framebuffer);
  assert.notEqual(generated[0].framebuffer,physical[0].framebuffer);
  assert.equal(presented.framebuffer,null);
  assert.ok(physical.every(draw=>draw.uniforms.u_linearOutput===1));
  assert.deepEqual(physical[0].viewport,[0,0,810,610]);
  assert.equal(h.state.scatteringStatus.Earth.submission.sceneSerial,h.state.hdrStatus.presented.serial);
  assert.equal(h.state.scatteringStatus.Earth.submission.epoch,h.state.hdrStatus.presented.epoch);
  assert.deepEqual(h.errors,[]);
});
