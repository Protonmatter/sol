import test from'node:test';import assert from'node:assert/strict';import{orreryHarness}from'./helpers/orreryHarness.mjs';
const terrain=()=>({pos:new Float32Array([1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1]),idx:new Uint16Array([0,1,2]),width:4,height:2,heightsKm:new Float32Array(8),minRadiusKm:1737.4,maxRadiusKm:1737.4,shadow:{shape:[1737.4,1737.4,1737.4,.5],poles:[0,0]}});
test('ready selected terrain is actually drawn and never replaced by the optional base-sphere pool',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,terrainMesh:async()=>terrain()});await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Moon','change');await h.settle();await h.settle();
 assert.equal(h.state.engineError,'');assert.equal(h.state.terrainStatus.Moon,'ready');assert.equal(h.state.terrainRendered.Moon,true);
 const start=h.drawCalls.length;h.input('orrerySize',String(h.state.exaggeration));
 assert.ok(h.drawCalls.slice(start).some(call=>call[0]==='elements'&&call[2]===3),'the protected3-index measured terrain must reach drawElements');
 assert.deepEqual(h.errors,[]);
});

test('optional detail upload failure keeps the original full-resolution scene and physics usable',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,optionalSphereUploadFailures:1});await h.enterOrrery();await h.settle();
 assert.equal(h.state.engineError,'');assert.equal(h.state.bodies.length,9);assert.equal(h.state.programStatus.base,'ready');
 assert.ok(h.drawCalls.some(call=>call[0]==='elements'&&call[2]===27648));
 assert.ok(!h.drawCalls.some(call=>call[0]==='elements'&&[768,1728,3072,6912,12288].includes(call[2])),'an incomplete pool cannot supply partial draw records');
 assert.deepEqual(h.errors,[]);
});
test('mandatory base upload failure is visible and explicit Retry rebuilds the graphics context',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,baseSphereUploadFailures:1});await h.enterOrrery();await h.settle();
 assert.match(h.state.engineError,/base graphics|base sphere/i);assert.equal(h.state.bodies.length,9);assert.equal(h.state.programStatus.base,'unavailable');
 const before=h.contexts,epoch=h.state.renderUnix;assert.equal(h.errors.length,1,'exactly the expected setup error is retained');
 await h.retry();await h.settle();assert.equal(h.state.engineError,'');assert.equal(h.state.programStatus.base,'ready');assert.equal(h.contexts,before+1);
 assert.equal(h.state.renderUnix,epoch);assert.ok(h.draws>0);assert.equal(h.errors.length,1,'successful Retry adds no new error');
});

for(const parallel of [false,true])test('restoration base failure publishes owned error for '+(parallel?'parallel':'synchronous')+' programs and Retry retains physics',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,parallelPrograms:parallel});
 const entering=h.enterOrrery();if(parallel){await h.settle();h.completePrograms();h.frame(100);}await entering;await h.settle();h.setAnimate(false);
 const identity=JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies]),requests=h.requests.length;
 h.event('orreryCanvas','webglcontextlost');
 h.setBaseSphereUploadFailures(1);
 assert.doesNotThrow(()=>h.event('orreryCanvas','webglcontextrestored'),'restoration errors must use the normal owned status path');
 if(parallel){await h.settle();for(let turn=0;turn<16&&h.state.programStatus.base==='loading';turn++){h.completePrograms();assert.ok(h.frames.size,'a pending shader poll must be scheduled');h.frame(100);await h.settle();}}await h.settle();
 assert.match(h.state.engineError,/restoration failed.*base graphics/i);assert.equal(h.state.programStatus.base,'unavailable');
 assert.equal(h.requests.length,requests);assert.equal(JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies]),identity);
 await h.retry();if(parallel){for(let turn=0;turn<16&&h.state.programStatus.base==='loading';turn++){h.completePrograms();assert.ok(h.frames.size,'Retry shader poll');h.frame(100);await h.settle();}}await h.settle();
 assert.equal(h.state.engineError,'');assert.equal(h.state.programStatus.base,'ready');assert.equal(JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies]),identity);
 assert.deepEqual(h.errors,[],'handled restoration failures do not become uncaught page errors');
});

test('late star publication during parallel graphics restore retains CPU catalogue facts without old-buffer uploads',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,parallelPrograms:true,catalogues:{starcatalog:'held',moonelements:'pending'}});
 const entering=h.enterOrrery();await h.settle();h.completePrograms();h.frame(100);await entering;await h.settle();h.setAnimate(false);
 // Named-star enrichment is demanded through the real catalogue control.
 h.input('orreryObjectGroup','star','change');await h.settle();
 const index=h.heldCatalogues.findIndex(x=>x.specifier.includes('starcatalog'));assert.ok(index>=0);
 h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');await h.settle();assert.equal(h.state.programStatus.base,'loading');
 const uploads=h.bufferUploads.length;await h.releaseCatalogue(index);assert.equal(h.state.catalogueStatus.stars,'ready');
 assert.equal(h.bufferUploads.length,uploads,'CPU catalogue publication waits to upload until new graphics handles exist');assert.deepEqual(h.bufferErrors,[]);
 for(let turn=0;turn<16&&h.state.programStatus.base==='loading';turn++){h.completePrograms();assert.ok(h.frames.size);h.frame(100);await h.settle();}
 assert.equal(h.state.programStatus.base,'ready');assert.equal(h.state.engineError,'');assert.deepEqual(h.bufferErrors,[]);assert.deepEqual(h.errors,[]);
});

for(const parallel of [false,true])test('restoration draw failure is observed for '+(parallel?'parallel':'synchronous')+' completion',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,parallelPrograms:parallel});const entering=h.enterOrrery();
 if(parallel){await h.settle();h.completePrograms();h.frame(100);}await entering;await h.settle();h.setAnimate(false);
 const identity=JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies]);h.event('orreryCanvas','webglcontextlost');
 const draw=h.gl.drawElements;let once=true;h.gl.drawElements=(...args)=>{if(once){once=false;throw Error('controlled restoration draw');}return draw(...args);};
 assert.doesNotThrow(()=>h.event('orreryCanvas','webglcontextrestored'));
 if(parallel){await h.settle();for(let turn=0;turn<16&&h.state.programStatus.base==='loading';turn++){h.completePrograms();assert.ok(h.frames.size);h.frame(100);await h.settle();}}
 await h.settle();assert.match(h.state.engineError,/restoration failed.*controlled restoration draw/i);assert.equal(JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies]),identity);
 await h.retry();await h.settle();assert.equal(h.state.engineError,'');assert.deepEqual(h.errors,[]);
});
test('leaving a pending restoration suppresses late setup and failure publication',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,parallelPrograms:true});const entering=h.enterOrrery();await h.settle();h.completePrograms();h.frame(100);await entering;await h.settle();h.setAnimate(false);
 h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');await h.settle();assert.equal(h.state.programStatus.base,'loading');
 h.leaveOrrery();const draws=h.draws;h.state.engineError='replacement status';h.setGraphicsFailure('shader');h.completePrograms();
 for(let turn=0;turn<16&&h.frames.size;turn++){h.frame(100);await h.settle();}await h.settle();
 assert.equal(h.state.engineError,'replacement status');assert.equal(h.draws,draws);assert.deepEqual(h.errors,[]);
});
