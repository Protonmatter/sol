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
  const h=await orreryHarness(t,{controls:true,reducedMotion:true});
  await h.enterOrrery();t.after(()=>h.leaveOrrery());h.state.hdrEnabled=true;
  const canvas=h.nodes.orreryCanvas,size=[canvas.width,canvas.height];
  h.check('orreryTextures',true);
  assert.equal(h.state.hdrStatus.state,'unavailable');assert.match(h.state.hdrStatus.reason,/Floating-point/);
  assert.equal(h.state.hdrFrame,null);assert.deepEqual([canvas.width,canvas.height],size);
  assert.equal(h.errors.length,0);
});
