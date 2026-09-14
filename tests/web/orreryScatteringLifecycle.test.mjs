import assert from 'node:assert/strict';
import test from 'node:test';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {BODY} from '../../apps/web/js/bodyData.js';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';
import {terrainReference} from '../../apps/web/js/terrainAssets.js';

const incidentField=async()=>({values:new Float32Array(4*257*195),width:257,height:195,
  domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}});
const generatorDraws=draws=>draws.filter(draw=>draw.kind==='arrays'&&Number.isInteger(draw.uniforms.u_scatteringPass));
const consumers=draws=>draws.filter(draw=>draw.kind==='elements'&&draw.uniforms.u_scatteringReady===1);
async function boot(t,options={}){
  const h=await orreryHarness(t,{controls:true,incidentField,...options});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');await h.settle();
  t.after(()=>h.leaveOrrery());return h;
}

test('every physical scene generates two passes before surface and shell consumers, including paused repaints',async t=>{
  const h=await boot(t),before=h.gpuSubmissions.length,serial=h.state.scatteringFrame.sceneSerial;
  h.resize(812,604);const draws=h.gpuSubmissions.slice(before),generated=generatorDraws(draws),used=consumers(draws);
  assert.equal(h.state.opticsStatus.Earth,'ready');assert.equal(generated.length,2);assert.equal(used.length,2);
  assert.deepEqual(generated.map(draw=>draw.uniforms.u_scatteringPass),[0,1]);
  assert.ok(draws.indexOf(generated[1])<draws.indexOf(used[0]));
  assert.ok(generated.every(draw=>draw.framebuffer&&draw.framebuffer!==used[0].framebuffer));
  assert.ok(generated.every(draw=>draw.enabled.size===0&&!draw.depthWrites));
  assert.equal(used[0].framebuffer,null);assert.equal(used[1].framebuffer,null);
  assert.deepEqual(used[0].viewport,[0,0,812,604]);assert.equal(used[0].vertexArray,null);
  assert.equal(used[0].uniforms.u_scatteringReferenceHeightKm,BODY.Earth.radiusKm-getAtmosphereProfile('Earth').radiusKm);
  assert.equal(used[0].textures.get(8),used[1].textures.get(8));assert.equal(used[0].textures.get(9),used[1].textures.get(9));
  assert.ok(h.state.scatteringFrame.sceneSerial>serial);
  assert.equal(h.state.scatteringStatus.Earth.submission.sceneSerial,h.state.scatteringFrame.sceneSerial);
  const second=h.gpuSubmissions.length;h.resize(812,604);
  assert.equal(generatorDraws(h.gpuSubmissions.slice(second)).length,2,'same epoch/camera still requires a fresh scene submission');
  assert.equal(h.state.opticsStatus.Earth,'ready','previous output bindings cannot poison next-frame restore admission');
  assert.deepEqual(h.errors,[]);
});

test('failed float target admission keeps the full illustrative surface and shell and never retries on repaint',async t=>{
  const h=await boot(t,{scatteringFramebufferFailure:true});
  assert.equal(h.state.opticsStatus.Earth,'unavailable');assert.equal(consumers(h.gpuSubmissions).length,0);
  assert.ok(h.gpuDraws.some(draw=>draw.uniforms.u_mode===2),'fallback shell remains visible');
  const allocations=h.textureUploads.length,programs=h.programs.length,start=h.gpuSubmissions.length;
  h.resize(810,606);assert.equal(consumers(h.gpuSubmissions.slice(start)).length,0);
  assert.equal(h.textureUploads.length,allocations);assert.equal(h.programs.length,programs);
  assert.match(h.state.scatteringStatus.Earth.reason,/framebuffer/i);assert.deepEqual(h.errors,[]);
});

test('terrain contributes its admitted full v2 radius envelope and retains the catalogue datum',async t=>{
  const reference=terrainReference('Mars'),h=await boot(t,{terrainMesh:async(body)=>{
    const radius=BODY[body].radiusKm;
    return {pos:new Float32Array([1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1]),idx:new Uint16Array([0,1,2]),
      width:4,height:2,heightsKm:new Float32Array(8),minRadiusKm:radius,maxRadiusKm:radius,
      sourceId:terrainReference(body).id,sourceSha256:terrainReference(body).sha256,
      shadow:{shape:[radius,radius,radius,0.5],poles:[0,0]}};
  }});
  h.input('orreryAnchor','Mars','change');await h.settle();
  const used=consumers(h.gpuSubmissions).filter(draw=>draw.uniforms.u_bodyRadiusKm===BODY.Mars.radiusKm).at(-1);
  assert.ok(used);assert.equal(used.uniforms.u_terrainShadowEnabled,1);
  const profile=getAtmosphereProfile('Mars'),q=BODY.Mars.polarKm/BODY.Mars.radiusKm;
  assert.deepEqual(used.uniforms.u_scatteringHeightRange,[Math.fround(Math.min(0,BODY.Mars.radiusKm-profile.radiusKm,reference.minRadiusKm-profile.radiusKm)),
    Math.fround(Math.max(0,BODY.Mars.radiusKm-profile.radiusKm,reference.maxRadiusKm/q-profile.radiusKm))]);
  assert.equal(used.uniforms.u_scatteringReferenceHeightKm,BODY.Mars.radiusKm-profile.radiusKm);
  assert.equal(h.state.opticsStatus.Mars,'ready');
});

test('context restoration and optical retry cannot reuse prior generated textures or frame identity',async t=>{
  const h=await boot(t),previous=consumers(h.gpuSubmissions).at(-1),generation=h.state.scatteringFrame.contextGeneration;
  h.event('orreryCanvas','webglcontextlost');
  assert.equal(h.state.scatteringFrame,null);assert.ok(h.deletedTextures.includes(previous.textures.get(8)));
  h.event('orreryCanvas','webglcontextrestored');await h.settle();
  const restored=consumers(h.gpuSubmissions).at(-1);
  assert.notEqual(restored.textures.get(8),previous.textures.get(8));
  assert.ok(h.state.scatteringFrame.contextGeneration>generation);
  h.check('orreryOptics',false);assert.ok(h.deletedTextures.includes(restored.textures.get(9)));
  const first=h.gpuSubmissions.length;h.check('orreryOptics',true);await h.settle();
  const renewed=consumers(h.gpuSubmissions.slice(first)).at(-1);
  assert.ok(renewed);assert.notEqual(renewed.textures.get(9),restored.textures.get(9));
  assert.deepEqual(h.errors,[]);
});

test('a terrain identity mismatch cannot admit scattering while its geometric fallback stays present',async t=>{
  const h=await boot(t,{terrainMesh:async body=>({
    pos:new Float32Array([1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1]),idx:new Uint16Array([0,1,2]),
    width:4,height:2,heightsKm:new Float32Array(8),minRadiusKm:BODY[body].radiusKm,maxRadiusKm:BODY[body].radiusKm,
    sourceId:'stale-source',sourceSha256:'0'.repeat(64),shadow:{shape:[1,1,1,.5],poles:[0,0]},
  })});
  const first=h.gpuSubmissions.length;h.input('orreryAnchor','Mars','change');await h.settle();
  assert.equal(h.state.terrainRendered.Mars,true);assert.equal(h.state.opticsStatus.Mars,'unavailable');
  assert.match(h.state.scatteringStatus.Mars.reason,/Terrain source/);
  assert.equal(consumers(h.gpuSubmissions.slice(first)).filter(draw=>draw.uniforms.u_bodyRadiusKm===BODY.Mars.radiusKm).length,0);
  assert.deepEqual(h.errors,[]);
});

test('a failed caller-state capture keeps the drawable fallback and clears prior admission',async t=>{
  const h=await boot(t),getParameter=h.gl.getParameter;
  h.gl.getParameter=name=>{if(name===h.gl.VIEWPORT)throw Error('state read failed');return getParameter(name);};
  const first=h.gpuSubmissions.length;h.resize(806,602);
  assert.equal(h.state.opticsStatus.Earth,'unavailable');assert.match(h.state.scatteringStatus.Earth.reason,/state read failed/);
  assert.equal(consumers(h.gpuSubmissions.slice(first)).length,0);
  assert.ok(h.gpuSubmissions.length>first);assert.deepEqual(h.errors,[]);
});
