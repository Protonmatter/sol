import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

const mesh=()=>({pos:new Float32Array([1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1]),idx:new Uint16Array([0,1,2]),
  width:4,height:2,heightsKm:new Float32Array(8),minRadiusKm:1737.4,maxRadiusKm:1737.4,
  shadow:{shape:[1737.4,1737.4,1737.4,0.5],poles:[0,0]}});

test('terrain layer off/on explicitly retries failed current detail and ordinary paints do not',async t=>{
  const calls=[];
  const h=await orreryHarness(t,{controls:true,terrainMesh:async(body,level)=>{
    calls.push({body,level});if(calls.length===1)throw Error('transient terrain transfer');return mesh();
  }});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Moon','change');await h.settle();
  assert.equal(h.state.terrainStatus.Moon,'unavailable');assert.equal(calls.length,1);
  h.resize(800,600);h.resize(800,600);await h.settle();assert.equal(calls.length,1,'repaint cannot become an unbounded retry loop');
  h.check('orreryTerrain',false);h.check('orreryTerrain',true);await h.settle();
  assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);assert.equal(h.state.terrainStatus.Moon,'ready');
  h.check('orreryTerrain',false);h.check('orreryTerrain',true);await h.settle();assert.equal(calls.length,2,'ready data survives layer toggles');
  h.leaveOrrery();
});

test('terrain retry follows the current viewport and selected body instead of abandoned failed keys',async t=>{
  const calls=[];
  const h=await orreryHarness(t,{controls:true,terrainMesh:async(body,level)=>{calls.push({body,level});throw Error('unavailable test source');}});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Moon','change');await h.settle();assert.equal(calls.length,1);
  h.check('orreryTerrain',false);h.resize(240,160);assert.equal(calls.length,1);
  h.check('orreryTerrain',true);await h.settle();assert.equal(calls.length,2);assert.equal(calls[1].body,'Moon');
  assert.notEqual(calls[1].level,calls[0].level,'the new viewport demands another detail level');
  h.check('orreryTerrain',false);h.input('orreryAnchor','Mars','change');assert.equal(calls.length,2);
  h.check('orreryTerrain',true);await h.settle();assert.equal(calls.length,3);assert.equal(calls[2].body,'Mars');
  h.resize(240,160);await h.settle();assert.equal(calls.length,3,'failed current demand remains bounded');h.leaveOrrery();
});

test('leaving retains ready terrain and atlas resources and preserves the paused scientific snapshot',async t=>{
  let terrainLoads=0,solarLoads=0;
  const h=await orreryHarness(t,{controls:true,terrainMesh:async()=>{terrainLoads++;return mesh();},
    solarAtlas:async()=>{solarLoads++;return {width:2048,height:1024,close(){}};}});
  await h.enterOrrery();h.setAnimate(false);h.event('orreryInspectSun','click');await h.settle();
  h.input('orreryAnchor','Moon','change');await h.settle();assert.equal(terrainLoads,1);assert.equal(solarLoads,1);
  const bodies=JSON.stringify(h.state.bodies),epoch=h.state.renderUnix;
  h.leaveOrrery();await h.enterOrrery();await h.settle();
  assert.equal(h.state.terrainStatus.Moon,'ready');assert.equal(h.state.solarStatus,'ready');
  h.event('orreryInspectSun','click');await h.settle();assert.equal(terrainLoads,1);assert.equal(solarLoads,1);
  assert.equal(h.state.renderUnix,epoch);assert.equal(JSON.stringify(h.state.bodies),bodies);h.leaveOrrery();
});

test('leaving cancels pending terrain and atlas work before GPU upload and reentry requests fresh work',async t=>{
  const terrain=[],solar=[];let closed=0;
  const h=await orreryHarness(t,{controls:true,
    terrainMesh:(body,level,_shape,{signal})=>new Promise(resolve=>terrain.push({body,level,signal,resolve})),
    solarAtlas:({signal})=>new Promise(resolve=>solar.push({signal,resolve})),
  });
  await h.enterOrrery();h.setAnimate(false);h.event('orreryInspectSun','click');h.input('orreryAnchor','Moon','change');
  assert.equal(solar.length,1);assert.equal(terrain.length,1);
  const oldTerrain=terrain[0],oldSolar=solar[0];h.leaveOrrery();
  assert.equal(oldTerrain.signal.aborted,true);assert.equal(oldSolar.signal.aborted,true);
  const uploads=h.textureUploads.length,buffers=h.bufferUploads.length;
  oldTerrain.resolve(mesh());oldSolar.resolve({width:2048,height:1024,close(){closed++;}});await h.settle();
  assert.equal(closed,1);assert.equal(h.textureUploads.length,uploads,'late hidden completions cannot upload buffers or images');
  assert.equal(h.bufferUploads.length,buffers,'late terrain geometry cannot upload while hidden');
  assert.equal(h.frames.size,0);assert.equal(h.state.terrainStatus.Moon,'deferred');assert.equal(h.state.solarStatus,'deferred');
  await h.enterOrrery();h.event('orreryInspectSun','click');h.input('orreryAnchor','Moon','change');
  assert.equal(terrain.length,2);assert.equal(solar.length,2);assert.equal(terrain[1].signal.aborted,false);assert.equal(solar[1].signal.aborted,false);
  h.leaveOrrery();await h.enterOrrery();h.event('orreryInspectSun','click');h.input('orreryAnchor','Moon','change');
  const reentryUploads=h.textureUploads.length,reentryBuffers=h.bufferUploads.length;
  terrain[1].resolve(mesh());solar[1].resolve({width:2048,height:1024,close(){closed++;}});await h.settle();
  assert.equal(closed,2);assert.equal(h.textureUploads.length,reentryUploads);assert.equal(h.bufferUploads.length,reentryBuffers);
  assert.equal(h.state.terrainStatus.Moon,'loading');assert.equal(h.state.solarStatus,'loading');
  h.leaveOrrery();terrain[2].resolve(mesh());solar[2].resolve({width:2048,height:1024,close(){closed++;}});await h.settle();assert.equal(closed,3);
});

for(const route of ['orreryGalaxy','orreryLocal','orreryTextures','leave']){
  test(`source playback pauses through ${route} and returning requires an explicit restart`,async t=>{
    const h=await orreryHarness(t,{controls:true,solarAtlas:true});
    await h.enterOrrery();h.setAnimate(false);h.event('orreryInspectSun','click');await h.settle();
    h.event('orrerySolarPlay','click');assert.equal(h.state.solarPlayback.playing,true);
    h.frame(100);const seconds=h.state.solarPlayback.seconds,epoch=h.state.renderUnix,bodies=JSON.stringify(h.state.bodies);
    if(route==='leave')h.leaveOrrery();else if(route==='orreryTextures')h.check(route,false);else h.event(route,'click');
    assert.equal(h.state.solarPlayback.playing,false);assert.equal(h.nodes.orrerySolarPlay.textContent,'Play source');
    assert.equal(h.nodes.orrerySolarPlay.getAttribute('aria-pressed'),'false');
    h.event('orrerySolarPlay','click');assert.equal(h.state.solarPlayback.playing,false,'a hidden or unavailable source cannot restart');
    if(h.frames.size)h.frame(150);assert.equal(h.frames.size,0);assert.equal(h.state.solarPlayback.seconds,seconds);assert.equal(h.state.renderUnix,epoch);
    assert.equal(JSON.stringify(h.state.bodies),bodies,'source playback and surface transitions cannot alter scientific body records');
    if(route==='leave')await h.enterOrrery();else if(route==='orreryTextures')h.check(route,true);else h.event('orreryGalaxy','click');
    assert.equal(h.state.solarPlayback.playing,false);assert.equal(h.state.solarPlayback.seconds,seconds);
    h.event('orrerySolarPlay','click');h.frame(200);assert.ok(h.state.solarPlayback.seconds>seconds);
    h.leaveOrrery();
  });
}

for(const route of ['orreryGalaxy','orreryLocal','orreryTextures','orreryAnchor','body-row','star-row','orrerySolarMode','orrerySolarTime','orrerySolarRestart','context-lost']){
  test(`source pause and controls do not depend on a drawable canvas through ${route}`,async t=>{
    const h=await orreryHarness(t,{controls:true,solarAtlas:true,catalogues:'ready'});
    await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);h.event('orreryInspectSun','click');await h.settle();
    h.event('orrerySolarPlay','click');assert.equal(h.state.solarPlayback.playing,true);
    h.nodes.orreryCanvas.clientWidth=0;
    if(route==='orreryTextures')h.check(route,false);
    else if(route==='orreryAnchor')h.input(route,'Earth','change');
    else if(route==='body-row'||route==='star-row'){
      h.input('orreryObjectGroup',route==='star-row'?'star':'all','change');
      h.input('orrerySearch',route==='star-row'?'Sirius':'Earth');h.nodes.orreryPositions.children[0].click();
    }else if(route==='orrerySolarMode')h.input(route,'visible','change');
    else if(route==='orrerySolarTime')h.input(route,'4');
    else if(route==='context-lost')h.event('orreryCanvas','webglcontextlost');
    else h.event(route,'click');
    assert.equal(h.state.solarPlayback.playing,false);assert.equal(h.nodes.orrerySolarPlay.textContent,'Play source');
    if(h.frames.size)h.frame(100);assert.equal(h.frames.size,0);h.leaveOrrery();
  });
}

for(const route of ['orreryGalaxy','orreryLocal']){
  test(`leaving a named star through ${route} clears selection, detail, focus and positions`,async t=>{
    const h=await orreryHarness(t,{controls:true,catalogues:'ready'});
    await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);h.event('orreryLocal','click');
    h.input('orreryObjectGroup','star','change');h.input('orrerySearch','Sirius');
    const sirius=h.nodes.orreryPositions.children.find(node=>node.textContent.startsWith('Sirius ·'));
    sirius.click();assert.match(h.state.selected,/^star:/);assert.equal(h.nodes.orreryFocusSelected.disabled,true);
    h.event(route,'click');assert.equal(h.state.selectedStar,null);assert.equal(h.state.selected,null);
    assert.equal(h.nodes.orrerySelectionStatus.textContent,'No object selected');assert.doesNotMatch(h.nodes.orreryDetail.textContent,/Hipparcos \(ESA 1997\)/);
    assert.equal(h.nodes.orreryFocusSelected.disabled,false);
    assert.ok(h.nodes.orreryPositions.children.every(node=>node.getAttribute('aria-pressed')!=='true'));
    if(h.state.galaxy)h.event('orreryGalaxy','click');
    h.input('orreryObjectGroup','all','change');h.input('orrerySearch','Earth');h.nodes.orreryPositions.children[0].click();
    assert.equal(h.state.selected,'Earth');assert.equal(h.nodes.orreryFocusSelected.disabled,false);
    h.event('orreryFocusSelected','click');assert.equal(h.state.anchor,'Earth');
    h.input('orreryObjectGroup','star','change');h.input('orrerySearch','Sirius');h.nodes.orreryPositions.children[0].click();
    h.event(route,'click');assert.equal(h.state.selectedStar,null);assert.equal(h.state.selected,null);
    assert.equal(h.nodes.orrerySelectionStatus.textContent,'No object selected');assert.equal(h.nodes.orreryFocusSelected.disabled,false);
    assert.doesNotMatch(h.nodes.orreryDetail.textContent,/Hipparcos \(ESA 1997\)/);h.leaveOrrery();
  });
}
