import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

const field=()=>({values:new Float32Array(4*257*195),width:257,height:195,
  domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}});

for(const route of ['leave','galaxy','hidden','selection','optics','context']){
  test(`incident field cancels through ${route}, ignores late output and admits fresh demand`,async t=>{
    const pending=[];
    const h=await orreryHarness(t,{controls:true,incidentField:(body,{signal})=>new Promise(resolve=>pending.push({body,signal,resolve}))});
    await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');
    assert.equal(pending.length,1);const old=pending[0];assert.equal(old.body,'Earth');
    const epoch=h.state.renderUnix,bodies=JSON.stringify(h.state.bodies);
    if(route==='leave')h.leaveOrrery();
    else if(route==='galaxy')h.event('orreryGalaxy','click');
    else if(route==='hidden')h.setHidden(true);
    else if(route==='selection'){
      h.setAnimate(true);h.input('orrerySearch','Mars');h.nodes.orreryPositions.children[0].click();
    }else if(route==='optics')h.check('orreryOptics',false);
    else h.event('orreryCanvas','webglcontextlost');
    assert.equal(old.signal.aborted,true);
    if(route==='selection')h.setAnimate(false);
    const uploads=h.textureUploads.length;
    old.resolve(field());await h.settle();assert.equal(h.textureUploads.length,uploads,'late field may not upload on abandoned demand');
    assert.equal(h.state.renderUnix,epoch);assert.equal(JSON.stringify(h.state.bodies),bodies);
    if(route==='leave')await h.enterOrrery();
    else if(route==='galaxy')h.event('orreryGalaxy','click');
    else if(route==='hidden')h.setHidden(false);
    else if(route==='optics')h.check('orreryOptics',true);
    else if(route==='context')h.event('orreryCanvas','webglcontextrestored');
    h.input('orreryAnchor','Earth','change');assert.ok(pending.length>=2);
    const current=pending.at(-1);assert.equal(current.body,'Earth');assert.equal(current.signal.aborted,false);
    current.resolve(field());await h.settle();assert.equal(h.state.opticsStatus.Earth,'ready');
    assert.ok(h.gpuDraws.some(draw=>draw.uniforms.u_incidentFieldReady===1));
    h.leaveOrrery();for(const entry of pending)entry.resolve(field());await h.settle();
  });
}

test('incident failure retries only through explicit optical toggle and completed fields are released on leave',async t=>{
  let calls=0;
  const h=await orreryHarness(t,{controls:true,incidentField:async()=>{if(++calls===1)throw Error('field hash mismatch');return field();}});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');await h.settle();
  assert.equal(h.state.opticsStatus.Earth,'unavailable');h.resize(800,600);await h.settle();assert.equal(calls,1);
  h.check('orreryOptics',false);h.check('orreryOptics',true);await h.settle();assert.equal(calls,2);assert.equal(h.state.opticsStatus.Earth,'ready');
  const resident=h.textureRecords.find(record=>record.pixels instanceof Float32Array&&record.pixels.length===4*257*195)?.texture;
  assert.ok(resident);h.input('orreryAnchor','Sun','change');h.input('orreryAnchor','Earth','change');await h.settle();
  assert.equal(calls,2,'ready field is reusable within its active context');h.leaveOrrery();assert.ok(h.deletedTextures.includes(resident));
  await h.enterOrrery();await h.settle();assert.equal(calls,3);h.leaveOrrery();
});

test('queued field notifications read current cache status and stale cache generations cannot replace fresh readiness',async t=>{
  const notifications=[],pending=[];
  const h=await orreryHarness(t,{controls:true,queueMicrotask:fn=>notifications.push(fn),
    incidentField:(body,{signal})=>new Promise(resolve=>pending.push({body,signal,resolve}))});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');
  pending[0].resolve(field());await h.settle();h.nodes.orreryCanvas.clientWidth=0;
  assert.ok(notifications.length>=2);notifications.shift()();assert.equal(h.state.opticsStatus.Earth,'ready','an old loading notification must observe the now-ready cache');
  h.check('orreryOptics',false);h.check('orreryOptics',true);h.nodes.orreryCanvas.clientWidth=800;h.resize(800,600);
  pending[1].resolve(field());await h.settle();h.nodes.orreryCanvas.clientWidth=0;
  while(notifications.length)notifications.shift()();assert.equal(h.state.opticsStatus.Earth,'ready');h.leaveOrrery();
});

for(const reset of ['context','leave','optics'])test(`old field completion after ${reset} replacement cannot upload or overwrite the new request`,async t=>{
  const pending=[];
  const h=await orreryHarness(t,{controls:true,incidentField:(body,{signal})=>new Promise(resolve=>pending.push({body,signal,resolve}))});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');
  if(reset==='context'){h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');}
  else if(reset==='leave'){h.leaveOrrery();await h.enterOrrery();}
  else{h.check('orreryOptics',false);h.check('orreryOptics',true);}
  assert.equal(pending.length,2);
  const uploads=h.textureUploads.length;pending[0].resolve(field());await h.settle();
  assert.equal(h.textureUploads.length,uploads);assert.equal(h.state.opticsStatus.Earth,'loading');
  pending[1].resolve(field());await h.settle();assert.equal(h.state.opticsStatus.Earth,'ready');h.leaveOrrery();
});
