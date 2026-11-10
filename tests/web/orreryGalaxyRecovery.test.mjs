import test from'node:test';import assert from'node:assert/strict';import{orreryHarness}from'./helpers/orreryHarness.mjs';import{sunGalacticPos}from'../../apps/web/js/orreryGalaxy.js';
const sunMarker=h=>h.gpuSubmissions.filter(d=>d.kind==='arrays'&&d.uniforms.u_size===.55).at(-1)?.uniforms.u_center;
async function advanced(t,held=false){
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,catalogues:held?{starcatalog:'held',moonelements:'pending'}:'pending'});await h.enterOrrery();await h.settle();h.input('orreryTime','1250');await h.settle();assert.equal(h.state.offsetYears,1250);
 h.event('orreryGalaxy','click');h.setAnimate(true);h.frame(100);h.setAnimate(false);assert.ok(h.state.galYears>0);const expected=Array.from(new Float32Array(sunGalacticPos(h.state.offsetYears+h.state.galYears)));assert.deepEqual(sunMarker(h),expected);const travelling=h.nodes.orreryLabels.children.find(e=>e.textContent.startsWith('☉ Sun ·'))?.textContent;assert.ok(travelling);return{h,expected,travelling};
}
test('paused advanced galactic Sun position survives graphics restoration',async t=>{
 const {h,expected,travelling}=await advanced(t),identity=JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies,h.state.galYears,h.state.offsetYears]);
 h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');await h.settle();
 assert.equal(JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies,h.state.galYears,h.state.offsetYears]),identity);
 assert.deepEqual(sunMarker(h),expected,'restoring buffers must reconcile the current galactic clock');assert.ok(h.nodes.orreryLabels.children.some(e=>e.textContent===travelling));assert.deepEqual(h.errors,[]);assert.deepEqual(h.bufferErrors,[]);
});
test('late star enrichment does not reset the paused galactic Sun marker to its default epoch',async t=>{
 const {h,expected,travelling}=await advanced(t,true),years=h.state.galYears,index=h.heldCatalogues.findIndex(x=>x.specifier.includes('starcatalog'));assert.ok(index>=0);
 await h.releaseCatalogue(index);assert.equal(h.state.catalogueStatus.stars,'ready');assert.equal(h.state.galYears,years);
 assert.deepEqual(sunMarker(h),expected,'catalogue rebuild must retain the advanced marker');assert.ok(h.nodes.orreryLabels.children.some(e=>e.textContent===travelling));assert.deepEqual(h.errors,[]);assert.deepEqual(h.bufferErrors,[]);
});
