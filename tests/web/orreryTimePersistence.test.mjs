import assert from 'node:assert/strict';
import test from 'node:test';
import {orreryHarness} from './helpers/orreryHarness.mjs';

// These exercise production entry/clock/detail logic. Only browser/GPU/engine I/O
// and the two clocks are provided by the existing harness.
test('paused System reentry retains its scientific epoch after wall time passes', async t => {
  const h=await orreryHarness(t,{controls:true});
  await h.enterOrrery();h.setAnimate(false);
  const epoch=h.state.renderUnix,bodies=JSON.stringify(h.state.bodies);
  h.leaveOrrery();h.setWallUnix(1800003600);
  await h.enterOrrery();h.frame(1000);
  assert.equal(h.state.renderUnix,epoch);
  assert.equal(JSON.stringify(h.state.bodies),bodies);
  assert.equal(h.state.animate,false);assert.equal(h.frames.size,0);
  // Explicit resume advances from that preserved epoch, not the newer wall clock.
  h.setAnimate(true);h.frame(2000);
  assert.equal(h.state.renderUnix,epoch+57.6);
  h.leaveOrrery();
});

test('running System reentry resumes from its last simulated epoch without wall-time drift', async t => {
  const h=await orreryHarness(t,{controls:true});
  await h.enterOrrery();h.frame(1000);
  const epoch=h.state.renderUnix;
  h.leaveOrrery();h.setWallUnix(1800007200);
  await h.enterOrrery();
  assert.equal(h.state.renderUnix,epoch);
  h.frame(2000);assert.equal(h.state.renderUnix,epoch+57.6);
  h.leaveOrrery();
});

test('paused failed reentry and full Retry retain the accepted epoch', async t => {
  const h=await orreryHarness(t,{controls:true});
  await h.enterOrrery();h.setAnimate(false);
  const epoch=h.state.renderUnix;
  h.leaveOrrery();h.setWallUnix(1800003600);h.failWorker(true);
  await h.enterOrrery();await h.settle();
  assert.equal(h.state.renderUnix,epoch);
  assert.equal(h.nodes.orreryCanvas.style.display,'none');
  h.setWallUnix(1800007200);h.failWorker(false);await h.retry();
  assert.equal(h.state.renderUnix,epoch);
  assert.equal(h.nodes.orreryCanvas.style.display,'');
  assert.equal(h.state.animate,false);
  h.frame(1000);assert.equal(h.state.renderUnix,epoch);h.leaveOrrery();
});

test('Now and explicit time offsets still replace a retained paused System epoch', async t => {
  const h=await orreryHarness(t,{controls:true});
  await h.enterOrrery();h.setAnimate(false);h.leaveOrrery();
  h.setWallUnix(1800003600);await h.enterOrrery();
  assert.equal(h.state.renderUnix,1800000000);
  h.now();await h.settle();assert.equal(h.state.renderUnix,1800003600);
  h.input('orreryTime','1');await h.settle();
  assert.equal(h.state.renderUnix,1831561200);
  h.leaveOrrery();h.setWallUnix(1800007200);await h.enterOrrery();
  assert.equal(h.state.renderUnix,1831561200);
  assert.equal(h.state.animate,false);h.leaveOrrery();
});

function selectSmallBody(h,name) {
  h.input('orrerySearch',name);
  const row=h.nodes.orreryPositions.children.find(node=>node.dataset.objectId===name);
  assert.ok(row,`${name} remains keyboard-selectable`);row.click();
}
function distanceCell(h) {
  const cells=h.nodes.orreryDetail.querySelector('dl').children;
  return cells[cells.findIndex(node=>node.textContent==='Distance from Sun')+1];
}

// Recorded distances from the existing illustrative catalogue at fixed epochs.
// These check synchronization of the displayed facts, not orbital accuracy.
for(const [name,before,after] of [
  ['1P/Halley','34.92 AU · light 4.8 h','2.45 AU · light 0.3 h'],
  ['Pluto','35.62 AU · light 4.9 h','43.78 AU · light 6.1 h'],
])test(`changing System time refreshes ${name} distance without replacing focused details`,async t=>{
  const h=await orreryHarness(t,{controls:true});await h.enterOrrery();h.setAnimate(false);
  selectSmallBody(h,name);const cell=distanceCell(h);
  assert.equal(cell.textContent,before);
  const disclosure=h.nodes.orreryDetail.querySelector('details'),summary=disclosure.querySelector('summary');
  disclosure.open=true;summary.focus();
  h.input('orreryTime','34');await h.settle();
  assert.equal(cell.textContent,after);
  assert.equal(distanceCell(h),cell);
  assert.equal(h.nodes.orreryDetail.querySelector('details'),disclosure);
  assert.equal(disclosure.open,true);assert.equal(summary.ownerDocument.activeElement,summary);
  h.leaveOrrery();
});

test('animation refreshes selected comet facts before another metadata response',async t=>{
  const h=await orreryHarness(t,{controls:true});await h.enterOrrery();h.setAnimate(false);
  h.input('orreryTime','34');await h.settle();selectSmallBody(h,'1P/Halley');
  const cell=distanceCell(h);assert.equal(cell.textContent,'2.45 AU · light 0.3 h');
  h.input('orrerySpeedEntry','18262.5'); // 50 years/s, existing bounded maximum.
  h.holdSnapshots();h.setAnimate(true);h.frame(1000);
  assert.equal(cell.textContent,'2.62 AU · light 0.4 h');
  assert.equal(distanceCell(h),cell);h.leaveOrrery();
});

test('selected small-body facts follow explicit time changes while graphics are unavailable',async t=>{
  const h=await orreryHarness(t,{controls:true});await h.enterOrrery();h.setAnimate(false);
  selectSmallBody(h,'1P/Halley');const cell=distanceCell(h);
  h.event('orreryCanvas','webglcontextlost');
  h.input('orreryTime','34');await h.settle();
  assert.equal(cell.textContent,'2.45 AU · light 0.3 h');
  assert.equal(distanceCell(h),cell);h.leaveOrrery();
});

test('probe cards keep their disclosed fixed approximate distance when System time changes',async t=>{
  const h=await orreryHarness(t,{controls:true});await h.enterOrrery();h.setAnimate(false);
  selectSmallBody(h,'Voyager 1');const cell=distanceCell(h);
  assert.equal(cell.textContent,'167.00 AU · light 23.1 h');
  h.input('orreryTime','34');await h.settle();
  assert.equal(cell.textContent,'167.00 AU · light 23.1 h');
  assert.equal(distanceCell(h),cell);h.leaveOrrery();
});
