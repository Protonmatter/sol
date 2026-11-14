import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

async function paused(t){
  const h=await orreryHarness(t,{controls:true,reducedMotion:true,manualFrames:true});
  await h.enterOrrery();h.setAnimate(false);h.frame(100);return h;
}

test('manual resolution changes backing pixels while preserving CSS labels, physical data and camera zoom',async t=>{
  const h=await paused(t);h.input('orreryAnchor','Earth','change');h.frame(116);
  const bodies=JSON.stringify(h.state.bodies),epoch=h.state.renderUnix,radius=h.state.radius;
  const earth=h.nodes.orreryLabels.children.find(node=>node.textContent==='Earth');
  const projection=[earth.dataset.projectionX,earth.dataset.projectionY];
  const first=h.gpuSubmissions.length;
  h.input('orreryQuality','low','change');assert.equal(h.frames.size,1);
  assert.equal(h.nodes.orreryCanvas.width,800,'control waits for the shared frame boundary');
  assert.match(h.nodes.orreryQualityStatus.textContent,/Low/);
  h.frame(132);assert.equal(h.nodes.orreryCanvas.width,480);assert.equal(h.nodes.orreryCanvas.height,360);
  assert.equal(h.state.radius,radius);assert.equal(h.state.renderUnix,epoch);assert.equal(JSON.stringify(h.state.bodies),bodies);
  assert.deepEqual([earth.dataset.projectionX,earth.dataset.projectionY],projection);
  assert.ok(h.gpuSubmissions.slice(first).some(draw=>draw.viewport[2]===480&&draw.viewport[3]===360));
  assert.equal(h.frames.size,0,'resolution cannot resume paused animation');
  h.input('orreryQuality','high','change');h.frame(148);assert.equal(h.nodes.orreryCanvas.width,800);
});

test('point marker DPR follows the backing-resolution tier at high density',async t=>{
  const h=await paused(t);h.resize(800,600,2);h.check('orreryShowSmall',true);h.frame(116);
  h.input('orreryQuality','balanced','change');const first=h.gpuSubmissions.length;h.frame(132);
  assert.equal(h.nodes.orreryCanvas.width,1280);
  const points=h.gpuSubmissions.slice(first).filter(draw=>draw.uniforms.u_dpr!==undefined);
  assert.ok(points.length);assert.ok(points.every(draw=>draw.uniforms.u_dpr===1.6));
});

test('Auto uses sustained continuous delivery evidence and manual choices remain deterministic',async t=>{
  const h=await paused(t);h.setAnimate(true);
  // The first drawn frame was at 100 ms. Slow delivery during the three-second start-up
  // window is loading, so the same evidence only lowers resolution once that window has passed.
  for(let i=1;i<=14;i++)h.frame(100+i*34);
  assert.equal(h.state.renderQuality.tier,'high');assert.match(h.nodes.orreryQualityStatus.textContent,/Auto.*High/);
  for(let i=1;i<=14;i++)h.frame(4000+i*34);
  assert.equal(h.state.renderQuality.tier,'balanced');assert.match(h.nodes.orreryQualityStatus.textContent,/Auto.*Balanced/);
  assert.equal(h.frames.size,1,'quality sampling shares the animation owner');
  h.input('orreryQuality','high','change');
  for(let i=15;i<=40;i++)h.frame(4000+i*34);
  assert.equal(h.state.renderQuality.tier,'high');assert.equal(h.nodes.orreryCanvas.width,800);
});

test('hidden, skipped and restarted frames do not count as sustained delivery overload',async t=>{
  const h=await paused(t);h.setAnimate(true);
  for(let i=1;i<=8;i++)h.frame(100+i*34);
  h.setHidden(true);assert.equal(h.frames.size,0);h.setHidden(false);h.frame(10000);h.frame(10034);
  assert.equal(h.state.renderQuality.tier,'high');
  h.nodes.orreryCanvas.clientWidth=0;
  for(let i=1;i<=15;i++)h.frame(10034+i*34);
  assert.equal(h.state.renderQuality.tier,'high');assert.equal(h.orreryFrameTimings().at(-1).rendered,false);
});

test('fractional backing dimensions do not refit the camera or change CSS-space picking',async t=>{
  const h=await paused(t);h.resize(391,643,1.5);h.input('orreryAnchor','Saturn','change');h.frame(116);
  const radius=h.state.radius,first=h.gpuDraws.length;
  h.input('orreryQuality','low','change');h.frame(132);
  assert.equal(h.state.radius,radius,'backing-pixel rounding is not a viewport aspect change');
  assert.ok(h.gpuDraws.length>first);
  const point={pointerId:7,clientX:391/2,clientY:643/2};
  h.event('orreryCanvas','pointerdown',point);h.event('orreryCanvas','pointerup',point);
  assert.equal(h.state.selected,'Saturn');
});
