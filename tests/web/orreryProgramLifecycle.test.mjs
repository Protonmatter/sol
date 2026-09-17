import assert from 'node:assert/strict';
import test from 'node:test';
import {orreryHarness} from './helpers/orreryHarness.mjs';

const field=()=>({values:new Float32Array(4*257*195),width:257,height:195,
  domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}});
async function boot(t,options={}){
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true,incidentField:async()=>field(),...options});
  const entering=h.enterOrrery();await h.settle();h.completePrograms();h.frame(100);await entering;
  h.setAnimate(false);return h;
}
async function poll(h){for(let i=0;i<3&&h.frames.size;i++)h.frame(100);await h.settle();}
const physicalDraws=h=>h.gpuDraws.filter(draw=>draw.uniforms.u_atmosphereEnabled===1);

test('parallel startup performs no blocking shader status or uniform query before completion',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true});
  const entering=h.enterOrrery();await h.settle();
  assert.equal(h.shaderQueries.filter(q=>q.method!=='getProgramParameter'||q.parameter!==37297).length,0);
  assert.equal(h.draws,0);assert.ok(h.frames.size>0,'pending compilation has a bounded completion poll');
  h.completePrograms();h.frame(100);await entering;
  assert.ok(h.draws>0);assert.deepEqual(h.errors,[]);h.leaveOrrery();
});

test('leaving pending parallel startup deletes its programs and ignores stale completion',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true});
  const entering=h.enterOrrery();await h.settle();const original=[...h.programs];
  h.leaveOrrery();await entering;h.completePrograms();await h.settle();
  assert.ok(original.length>0);assert.ok(original.every(p=>h.deletedPrograms.includes(p)));
  assert.equal(h.draws,0);assert.equal(h.frames.size,0);assert.deepEqual(h.errors,[]);
  const renewed=h.enterOrrery();await h.settle();h.completePrograms();h.frame(100);await renewed;
  assert.ok(h.draws>0);h.leaveOrrery();
});

test('the base scene renders while all three demanded physical programs and fields own readiness',async t=>{
  const h=await boot(t);assert.equal(h.programs.length,6);assert.equal(h.state.programStatus.physical,'deferred');
  h.input('orreryAnchor','Earth','change');await h.settle();
  assert.equal(h.programs.length,9);assert.equal(h.state.opticsStatus.Earth,'loading');assert.equal(physicalDraws(h).length,0);
  assert.match(h.nodes.orreryPhysicalStatus.textContent,/programs and fields loading/i);
  const pending=h.programs.slice(6),draws=h.draws;await poll(h);assert.ok(h.draws>=draws);
  h.completePrograms(program=>program===pending[0]);await poll(h);
  assert.equal(h.state.programStatus.physical,'loading');assert.equal(physicalDraws(h).length,0);
  assert.equal(h.shaderQueries.filter(query=>query.method==='getUniformLocation'&&pending.includes(query.program)).length,0);
  h.completePrograms(program=>program===pending[1]);await poll(h);
  assert.equal(h.state.programStatus.physical,'loading','the complete generator is independently required');
  assert.equal(physicalDraws(h).length,0);
  assert.equal(h.shaderQueries.filter(query=>query.method==='getUniformLocation'&&pending.includes(query.program)).length,0);
  h.completePrograms();await poll(h);assert.equal(h.state.opticsStatus.Earth,'ready');assert.ok(physicalDraws(h).length>0);
  const sphereDraw=physicalDraws(h).find(draw=>Object.hasOwn(draw.uniforms,'u_style'));
  assert.ok(sphereDraw);assert.equal(sphereDraw.uniforms.u_linearOutput,0);
  assert.ok(Object.hasOwn(sphereDraw.uniforms,'u_textureLinear'),'the deferred program receives the current color contract');
  assert.deepEqual(h.errors,[]);h.leaveOrrery();
});

for(const failure of ['link','timeout'])test(`physical ${failure} failure keeps base rendering and requires explicit retry`,async t=>{
  const h=await boot(t);h.input('orreryAnchor','Earth','change');await h.settle();const failed=h.programs.slice(6);
  if(failure==='link'){h.setGraphicsFailure('link');h.completePrograms();}else h.advanceMonotonicTime(30100);
  await poll(h);assert.equal(h.state.opticsStatus.Earth,'unavailable');assert.equal(physicalDraws(h).length,0);
  assert.ok(failed.every(program=>h.deletedPrograms.includes(program)));
  assert.match(h.state.programDiagnostics.physicalSphere.error,failure==='link'?/link failure/i:/30000 ms/);
  const count=h.programs.length,draws=h.draws;h.resize(900,600);await h.settle();
  assert.equal(h.programs.length,count,'a failed program does not recompile on repaint');assert.ok(h.draws>draws);
  h.setGraphicsFailure('');h.check('orreryOptics',false);h.check('orreryOptics',true);await h.settle();
  assert.equal(h.programs.length,count+3);assert.equal(h.state.opticsStatus.Earth,'loading');
  h.completePrograms();await poll(h);assert.equal(h.state.opticsStatus.Earth,'ready');assert.ok(physicalDraws(h).length>0);
  h.leaveOrrery();
});

for(const reset of ['leave','hidden','optics','context'])test(`${reset} cancels pending physical programs and never admits their stale completion`,async t=>{
  const h=await boot(t);h.input('orreryAnchor','Earth','change');await h.settle();const pending=h.programs.slice(6);
  if(reset==='leave'){h.leaveOrrery();await h.enterOrrery();}
  else if(reset==='hidden'){h.setHidden(true);h.setHidden(false);h.resize(800,600);}
  else if(reset==='optics'){h.check('orreryOptics',false);h.check('orreryOptics',true);}
  else{h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');
    h.completePrograms(program=>!pending.includes(program));await poll(h);}
  await h.settle();assert.ok(pending.every(program=>h.deletedPrograms.includes(program)));
  h.completePrograms(program=>pending.includes(program));await poll(h);
  assert.equal(h.state.opticsStatus.Earth,'loading');assert.equal(physicalDraws(h).length,0);
  assert.equal(h.shaderQueries.filter(query=>query.method==='getUniformLocation'&&pending.includes(query.program)).length,0);
  h.completePrograms();await poll(h);assert.equal(h.state.opticsStatus.Earth,'ready');
  assert.ok(physicalDraws(h).every(draw=>!pending.includes(draw.program)));assert.deepEqual(h.errors,[]);h.leaveOrrery();
});

test('a queued failed-program notification cannot cancel a newer explicit retry in the same context',async t=>{
  const notifications=[],h=await boot(t,{queueMicrotask:fn=>notifications.push(fn)});
  while(notifications.length)notifications.shift()();
  h.input('orreryAnchor','Earth','change');await h.settle();h.setGraphicsFailure('link');h.completePrograms();await poll(h);
  h.setGraphicsFailure('');h.check('orreryOptics',false);h.check('orreryOptics',true);await h.settle();
  const renewed=h.programs.slice(-3);while(notifications.length)notifications.shift()();
  assert.equal(h.state.opticsStatus.Earth,'loading');assert.ok(renewed.every(program=>!h.deletedPrograms.includes(program)));
  h.completePrograms();await poll(h);while(notifications.length)notifications.shift()();
  assert.equal(h.state.opticsStatus.Earth,'ready');h.leaveOrrery();
});

test('a tab that spends the deadline hidden keeps its base compile instead of reporting no WebGL2',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true}),entering=h.enterOrrery();await h.settle();
  assert.equal(h.state.programStatus.base,'loading');
  // A hidden tab delivers no frame, so completion is never polled while the monotonic
  // clock runs past the mandatory deadline. Becoming visible must not expire it.
  h.advanceMonotonicTime(45000);
  h.setHidden(false);await h.settle();
  assert.equal(h.state.programStatus.base,'loading');
  assert.equal(h.contexts,1,'no context was rebuilt');
  h.completePrograms();h.frame(100);await entering;await h.settle();
  assert.equal(h.state.programStatus.base,'ready');
  assert.equal(h.state.programDiagnostics.sphere.error,'');
  h.leaveOrrery();
});

test('a time change during a parallel base compile cannot strand a ready context that never draws',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true}),entering=h.enterOrrery();await h.settle();
  assert.equal(h.state.programStatus.base,'loading');
  // The Now action advances the metadata generation without replacing the graphics owner.
  h.now();await h.settle();
  h.completePrograms();h.frame(100);await entering;await h.settle();
  assert.equal(h.state.programStatus.base,'ready');
  assert.ok(h.draws>0,'the ready context must draw');
  assert.ok(h.frames.size>0,'the frame loop must be armed');
  assert.ok(h.images.length>0,'reference textures must be requested');
  assert.equal(h.state.engineError,'');
  h.leaveOrrery();
});

test('leaving and re-entering during a pending parallel compile cannot hide the renewed canvas',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true});
  void h.enterOrrery();await h.settle();
  assert.equal(h.state.programStatus.base,'loading');
  // The superseded entry's compile resolves null once its manager is disposed. Its
  // continuation must not treat that as WebGL2 being unavailable and hide the canvas
  // the renewed entry is about to draw into.
  h.leaveOrrery();
  const renewed=h.enterOrrery();await h.settle();
  for(let i=0;i<6&&h.state.programStatus.base!=='ready';i++){h.completePrograms();if(h.frames.size)h.frame(100);await h.settle();}
  await renewed;await h.settle();
  assert.equal(h.state.programStatus.base,'ready');
  assert.notEqual(h.nodes.orreryCanvas.style.display,'none','the renewed canvas must stay visible');
  assert.ok(h.draws>0,'the renewed context draws');
  assert.equal(h.state.engineError,'');
  h.leaveOrrery();
});

test('mandatory startup timeout preserves the 30 second deadline and discloses failure without drawing placeholders',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true}),entering=h.enterOrrery();await h.settle();
  h.advanceMonotonicTime(30099);h.frame(100);assert.equal(h.state.programStatus.base,'loading');assert.equal(h.draws,0);
  h.advanceMonotonicTime(30100);h.frame(100);await entering;
  assert.equal(h.state.programStatus.base,'unavailable');assert.equal(h.draws,0);
  assert.match(h.state.programDiagnostics.sphere.error,/30000 ms/);
  assert.ok(h.programs.every(program=>h.deletedPrograms.includes(program)));assert.equal(h.frames.size,0);h.leaveOrrery();
});

test('parallel context restoration failure remains visible and cannot restart the frame loop',async t=>{
  const h=await boot(t);h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');
  const draws=h.draws;h.setGraphicsFailure('link');h.completePrograms();await poll(h);
  assert.equal(h.state.programStatus.base,'unavailable');assert.match(h.state.engineError,/graphics.*unavailable|restoration failed/i);
  assert.equal(h.draws,draws);assert.equal(h.frames.size,0);h.leaveOrrery();
});
