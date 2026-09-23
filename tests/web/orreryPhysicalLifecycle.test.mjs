import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

const mesh=()=>({pos:new Float32Array([1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1]),idx:new Uint16Array([0,1,2]),
  width:4,height:2,heightsKm:new Float32Array(8),minRadiusKm:1737.4,maxRadiusKm:1737.4,
  shadow:{shape:[1737.4,1737.4,1737.4,0.5],poles:[0,0]}});

test('failed demanded terrain detail stays visible as a failure while lower detail renders and retries explicitly',async t=>{
  const loads=[];
  const h=await orreryHarness(t,{controls:true,terrainMesh:(body,level,_shape,{signal})=>
    new Promise((resolve,reject)=>loads.push({body,level,signal,resolve,reject}))});
  await h.enterOrrery();h.setAnimate(false);h.resize(240,160);h.input('orreryAnchor','Moon','change');
  assert.equal(loads.length,1);assert.equal(loads[0].level,1);
  loads[0].resolve(mesh());await h.settle();assert.equal(h.state.terrainStatus.Moon,'ready');
  h.resize(800,600);await h.settle();assert.equal(loads.length,2);assert.equal(loads[1].level,2);
  assert.equal(h.state.terrainRendered.Moon,true,'ready lower detail continues to render');
  assert.equal(h.state.terrainStatus.Moon,'loading','the pending requested level owns status');
  assert.match(h.nodes.orreryPhysicalStatus.textContent,/loading.*lower detail/i);
  loads[1].reject(Error('higher detail unavailable'));await h.settle();
  assert.equal(h.state.terrainStatus.Moon,'unavailable');assert.equal(h.state.terrainRendered.Moon,true);
  assert.match(h.nodes.orreryPhysicalStatus.textContent,/unavailable.*lower detail.*retry/i);
  h.resize(40,24);await h.settle();assert.equal(h.state.terrainStatus.Moon,'deferred');
  assert.equal(h.state.terrainRendered.Moon,false);assert.equal(loads.length,2,'sub-threshold views have no terrain demand');
  h.resize(240,160);await h.settle();assert.equal(h.state.terrainStatus.Moon,'ready','returning to cached low detail clears the unrelated failure');
  h.resize(800,600);await h.settle();assert.equal(h.state.terrainStatus.Moon,'unavailable');assert.equal(loads.length,2);
  h.check('orreryTerrain',false);h.check('orreryTerrain',true);await h.settle();
  assert.equal(loads.length,3);assert.equal(loads[2].level,2);assert.equal(h.state.terrainRendered.Moon,true);
  loads[2].resolve(mesh());await h.settle();assert.equal(h.state.terrainStatus.Moon,'ready');
  assert.doesNotMatch(h.nodes.orreryPhysicalStatus.textContent,/unavailable|retry/i);h.leaveOrrery();
});

test('late completion of another terrain level cannot replace current demand status',async t=>{
  const loads=[];
  const h=await orreryHarness(t,{controls:true,terrainMesh:(body,level)=>
    new Promise((resolve,reject)=>loads.push({body,level,resolve,reject}))});
  await h.enterOrrery();h.setAnimate(false);h.resize(240,160);h.input('orreryAnchor','Moon','change');
  h.resize(800,600);assert.deepEqual(loads.map(load=>load.level),[1],'new source work queues behind the active CPU reservation');
  loads[0].resolve(mesh());await h.settle();
  assert.deepEqual(loads.map(load=>load.level),[1,2]);
  assert.equal(h.state.terrainStatus.Moon,'loading');assert.equal(h.state.terrainRendered.Moon,true);
  loads[1].reject(Error('requested level failed'));await h.settle();
  assert.equal(h.state.terrainStatus.Moon,'unavailable');assert.equal(h.state.terrainRendered.Moon,true);h.leaveOrrery();
});

test('a background star clears planetary status and disposes the anchor gallery without another image request',async t=>{
  const images=[];
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',phenomenonImage:(id,{signal})=>{
    images.push({id,signal});return new Promise(()=>{});
  }});
  await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);
  h.input('orreryAnchor','Jupiter','change');assert.equal(images.length,1);
  h.input('orrerySearch','Earth');h.nodes.orreryPositions.children[0].click();
  assert.equal(images[0].signal.aborted,true);assert.equal(h.nodes.orreryPlanetPhenomena.hidden,true);
  assert.match(h.nodes.orreryPhysicalStatus.textContent,/optical/i);
  let label;
  for(let turn=0;turn<64&&!label;turn++){
    label=h.nodes.orreryLabels.children.find(node=>node.style.display==='block'
      &&node.className.includes('sky-star')&&!h.moons.some(moon=>moon.n===node.textContent));
    if(!label)h.event('orreryCanvas','keydown',{key:'ArrowLeft'});
  }
  assert.ok(label,'a named background star has a visible label');
  const point={pointerId:1,clientX:Number(label.dataset.projectionX),clientY:Number(label.dataset.projectionY)};
  h.setAnimate(true);
  h.event('orreryCanvas','pointerdown',point);h.event('orreryCanvas','pointerup',point);
  assert.ok(h.state.selectedStar);assert.equal(h.state.selected,null);assert.equal(h.state.galaxy,false);
  assert.equal(h.nodes.orreryPhysicalStatus.hidden,true,'selection clears status without waiting for a drawable frame');
  assert.equal(h.nodes.orreryPhysicalStatus.textContent,'');assert.equal(h.nodes.orreryPlanetPhenomena.hidden,true);
  h.frame(100);await h.settle();assert.equal(images.length,1,'star inspection cannot reload the unrelated anchor observation');
  h.input('orreryAnchor','Jupiter','change');assert.equal(h.state.selectedStar,null);
  assert.equal(images.length,2);assert.equal(h.nodes.orreryPlanetPhenomena.hidden,false);
  h.nodes.orreryCanvas.clientWidth=0;
  h.input('orreryObjectGroup','star','change');h.input('orrerySearch','Sirius');h.nodes.orreryPositions.children[0].click();
  assert.ok(h.state.selectedStar);assert.equal(images[1].signal.aborted,true,'a star selection cancels the active planetary image');
  assert.equal(h.nodes.orreryPlanetPhenomena.hidden,true);assert.equal(h.nodes.orreryPlanetPhenomena.children.length,0);
  h.input('orreryAnchor','Earth','change');assert.equal(h.state.selectedStar,null);
  assert.equal(h.nodes.orreryPhysicalStatus.hidden,false);assert.match(h.nodes.orreryPhysicalStatus.textContent,/optical/i);
  assert.equal(images.length,2);h.leaveOrrery();
});

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

test('solar restart retains a ready atlas without another transfer, release or GPU upload',async t=>{
  let loads=0;
  const h=await orreryHarness(t,{controls:true,solarAtlas:async()=>{
    loads++;if(loads>1)throw Error('source is now offline');return {width:2048,height:1024,close(){}};
  }});
  await h.enterOrrery();h.setAnimate(false);h.event('orreryInspectSun','click');await h.settle();
  assert.equal(h.state.solarStatus,'ready');assert.equal(loads,1);
  h.event('orrerySolarPlay','click');h.frame(100);assert.ok(h.state.solarPlayback.seconds>0);
  const uploads=h.textureUploads.length,releases=h.deletedTextures.length,epoch=h.state.renderUnix,bodies=JSON.stringify(h.state.bodies);
  h.event('orrerySolarRestart','click');
  assert.equal(h.state.solarPlayback.seconds,0);assert.equal(h.state.solarPlayback.playing,false);
  assert.equal(h.state.solarStatus,'ready','restart cannot temporarily discard the displayed observation');
  await h.settle();assert.equal(loads,1);assert.equal(h.textureUploads.length,uploads);assert.equal(h.deletedTextures.length,releases);
  assert.equal(h.nodes.orrerySolarPlay.disabled,false);assert.equal(h.nodes.orrerySolarPlay.getAttribute('aria-pressed'),'false');
  h.event('orrerySolarPlay','click');h.frame(200);assert.ok(h.state.solarPlayback.seconds>0,'cached source remains playable offline');
  assert.equal(h.state.renderUnix,epoch);assert.equal(JSON.stringify(h.state.bodies),bodies);h.leaveOrrery();
});

test('solar restart preserves a pending atlas request and uploads its completion once',async t=>{
  const loads=[];let closed=0;
  const h=await orreryHarness(t,{controls:true,solarAtlas:({signal})=>new Promise(resolve=>loads.push({signal,resolve}))});
  await h.enterOrrery();h.setAnimate(false);h.event('orreryInspectSun','click');
  assert.equal(h.state.solarStatus,'loading');assert.equal(loads.length,1);
  h.input('orrerySolarTime','4');const uploads=h.textureUploads.length,releases=h.deletedTextures.length;
  h.event('orrerySolarRestart','click');h.event('orrerySolarRestart','click');
  assert.equal(h.state.solarPlayback.seconds,0);assert.equal(h.state.solarPlayback.playing,false);
  assert.equal(loads.length,1,'restart must coalesce with the existing atlas request');
  assert.equal(loads[0].signal.aborted,false);assert.equal(h.state.solarStatus,'loading');
  assert.equal(h.textureUploads.length,uploads);assert.equal(h.deletedTextures.length,releases);
  loads[0].resolve({width:2048,height:1024,close(){closed++;}});await h.settle();
  assert.equal(h.state.solarStatus,'ready');assert.equal(closed,1);
  const uploaded=h.textureUploads.slice(uploads);
  assert.equal(uploaded.length,2,'the atlas and its radial quiet profile upload once');
  const quiet=uploaded.find(args=>args[3]===32&&args[4]===2);
  assert.equal(quiet?.[2],33321);assert.equal(quiet?.[6],6403);assert.equal(quiet.at(-1).length,32*2);
  assert.equal(h.deletedTextures.length,releases);assert.equal(h.nodes.orrerySolarPlay.disabled,false);h.leaveOrrery();
});

test('solar restart explicitly retries an unavailable atlas and retains the recovered entry',async t=>{
  const loads=[];
  const h=await orreryHarness(t,{controls:true,solarAtlas:({signal})=>new Promise((resolve,reject)=>loads.push({signal,resolve,reject}))});
  await h.enterOrrery();h.setAnimate(false);h.event('orreryInspectSun','click');
  loads[0].reject(Error('transient solar transfer'));await h.settle();assert.equal(h.state.solarStatus,'unavailable');
  h.resize(800,600);await h.settle();assert.equal(loads.length,1,'ordinary paint must not retry a failed source');
  h.input('orrerySolarTime','4');h.event('orrerySolarRestart','click');
  assert.equal(loads.length,2);assert.equal(h.state.solarStatus,'loading');assert.equal(loads[1].signal.aborted,false);
  assert.equal(h.state.solarPlayback.seconds,0);assert.equal(h.state.solarPlayback.playing,false);
  loads[1].resolve({width:2048,height:1024,close(){}});await h.settle();assert.equal(h.state.solarStatus,'ready');
  const uploads=h.textureUploads.length,releases=h.deletedTextures.length;
  h.event('orrerySolarRestart','click');await h.settle();
  assert.equal(loads.length,2);assert.equal(h.state.solarStatus,'ready');
  assert.equal(h.textureUploads.length,uploads);assert.equal(h.deletedTextures.length,releases);h.leaveOrrery();
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
    if(h.frames.size)h.frame(100);
    const coronaFlow=route==='orrerySolarTime'||route==='orrerySolarRestart'||route==='orrerySolarMode';
    assert.equal(h.frames.size,coronaFlow?1:0,coronaFlow?'the EUV flow clock stays armed after source scrubbing':'leaving the EUV Sun stops the flow clock');
    if(coronaFlow){
      const unix=h.state.renderUnix;
      h.frame(h.state.lastTick+1000);
      assert.equal(h.state.renderUnix,unix,'corona flow does not advance orbital time');
      assert.equal(h.state.solarPlayback.playing,false);
      assert.equal(h.frames.size,1);
    }
    h.leaveOrrery();
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
