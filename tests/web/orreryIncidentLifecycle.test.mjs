import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

const field=()=>({values:new Float32Array(4*257*195),width:257,height:195,
  domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}});

test('base sphere programs cover pending, disabled, moon and transparent draws across physical readiness and restoration',async t=>{
  const pending=[];
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',incidentField:()=>new Promise(resolve=>pending.push(resolve))});
  const sphereDraws=()=>h.gpuDraws.filter(d=>Object.hasOwn(d.uniforms,'u_style'));
  const checkRouting=()=>{
    const draws=sphereDraws();assert.ok(draws.length);
    for(const draw of draws){
      const enabled=draw.uniforms.u_atmosphereEnabled===1;
      for(const source of draw.program.sources){
        assert.equal(source.includes('const int u_atmosphereEnabled = 0;'),!enabled,'Only active reference profiles use the physical sphere program');
      }
    }
    return draws;
  };
  await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);h.input('orreryAnchor','Earth','change');
  assert.equal(pending.length,1);checkRouting();
  const base=sphereDraws()[0].program;
  pending.shift()(field());await h.settle();
  const ready=checkRouting().filter(d=>d.uniforms.u_atmosphereEnabled===1);
  assert.ok(ready.length);assert.notEqual(ready.at(-1).program,base);
  assert.ok(sphereDraws().some(d=>d.uniforms.u_mode===2),'Illustrative transparent shells remain covered');
  h.check('orreryOptics',false);checkRouting();
  assert.equal(sphereDraws().at(-1).program,base);
  h.check('orreryOptics',true);pending.shift()(field());await h.settle();checkRouting();
  h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');
  const restoredBase=sphereDraws().at(-1).program;assert.notEqual(restoredBase,base);
  pending.shift()(field());await h.settle();checkRouting();
  assert.ok(sphereDraws().some(d=>d.uniforms.u_atmosphereEnabled===1&&d.program!==ready.at(-1).program),'Physical program is recreated with its own uniform map');
  h.input('orreryAnchor','Mars','change');pending.shift()(field());await h.settle();checkRouting();
  assert.ok(sphereDraws().some(d=>d.uniforms.u_atmosphereEnabled===1&&d.uniforms.u_bodyRadiusKm<4000),'Mars also selects physical optics');
  h.input('orreryAnchor','Jupiter','change');h.state.radius=.1;const start=h.gpuDraws.length;
  h.check('orreryTrueScale',true);
  const moons=h.gpuDraws.slice(start).filter(d=>d.uniforms.u_mode===0&&d.uniforms.u_nmat?.every((v,i)=>v===Number(i%4===0)));
  assert.ok(moons.length>=4,'Real Galilean moon draws exercise routing after physical Mars');
  for(const moon of moons)assert.ok(moon.program.sources.every(source=>source.includes('const int u_atmosphereEnabled = 0;')));
  checkRouting();
  h.leaveOrrery();
});

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

test('reference transfer waits for both fields and column failure cancels incident work',async t=>{
  let finishColumn,incidentSignal;
  const h=await orreryHarness(t,{controls:true,incidentField:async(_body,{signal})=>{incidentSignal=signal;return field();},
    atmosphereColumns:()=>new Promise(resolve=>{finishColumn=resolve;})});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');await h.settle();
  assert.equal(h.state.opticsStatus.Earth,'loading');
  assert.ok(!h.gpuDraws.some(draw=>draw.uniforms.u_atmosphereEnabled===1));
  finishColumn({values:new Float32Array([8,1.2]),width:1,height:1});await h.settle();
  assert.equal(h.state.opticsStatus.Earth,'ready');assert.equal(incidentSignal.aborted,false);
  assert.ok(h.gpuDraws.some(draw=>draw.uniforms.u_atmosphereEnabled===1&&draw.uniforms.u_atmosphereColumnField===7));
  const residents=h.textureRecords.filter(r=>r.pixels instanceof Float32Array).map(r=>r.texture);
  h.leaveOrrery();for(const texture of residents)assert.ok(h.deletedTextures.includes(texture));
});

test('column admission failure disables optical transfer and aborts its companion',async t=>{
  let signal;
  const h=await orreryHarness(t,{controls:true,incidentField:async(_body,options)=>{signal=options.signal;return new Promise(()=>{});},
    atmosphereColumns:async()=>{throw Error('column hash mismatch');}});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');await h.settle();
  assert.equal(signal.aborted,true);assert.equal(h.state.opticsStatus.Earth,'unavailable');
  assert.ok(!h.gpuDraws.some(draw=>draw.uniforms.u_atmosphereEnabled===1));h.leaveOrrery();
});

for(const failure of ['throw','gl-error'])test(`optical upload ${failure} releases both textures and resets the active unit`,async t=>{
  const h=await orreryHarness(t,{controls:true,incidentField:async()=>field()});
  await h.enterOrrery();h.setAnimate(false);
  const upload=h.gl.texImage2D,readError=h.gl.getError,active=h.gl.activeTexture;let lastUnit,failed=false;
  h.gl.activeTexture=unit=>{lastUnit=unit;return active(unit);};
  h.gl.texImage2D=(...args)=>{if(args.at(-1) instanceof Float32Array&&args.at(-1).length===2){failed=true;if(failure==='throw')throw Error('column allocation failure');}return upload(...args);};
  h.gl.getError=()=>failed&&failure==='gl-error'?1285:readError();
  h.input('orreryAnchor','Earth','change');await h.settle();
  assert.equal(h.state.opticsStatus.Earth,'unavailable');assert.ok(h.deletedTextures.length>=2);
  assert.equal(lastUnit,h.gl.TEXTURE0);h.leaveOrrery();
});
