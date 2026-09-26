import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {appearanceReference} from '../../apps/web/js/planetAppearance.js';

async function settleEarthLayers(h) {
  for (const role of ['surface','cloud-composite','night-lights']) {
    const asset=appearanceReference('Earth',role);
    const image=h.images.findLast(item=>item.src===asset.path);
    if(image?.onload){image.width=asset.dimensions[0];image.height=asset.dimensions[1];image.onload();}
  }
  await h.settle();await h.settle();
}

test('default Earth loads the recovered July map and draws the Sites recipe without changing positions',async t=>{
  const loads=[];
  const h=await orreryHarness(t,{controls:true,useProductAppearanceDefault:true,
    illustrativeMap:async asset=>{loads.push(asset);return {width:asset.dimensions[0],height:asset.dimensions[1],close(){}};}});
  await h.enterOrrery();h.setAnimate(false);
  h.input('orreryAnchor','Earth','change');await h.settle();await settleEarthLayers(h);
  assert.ok(loads.some(asset=>asset.path.endsWith('earth-land-2004-july.jpg')),'default Earth requests the recovered July surface');
  assert.equal(h.state.earthLookStatus,'ready');
  assert.ok(h.gpuDraws.some(draw=>draw.uniforms.u_earthLookExposure===1.6),'the Sites display exposure reaches the renderer');
  const positions=JSON.stringify(h.state.bodies),epoch=h.state.renderUnix;
  h.input('orreryPlanetLook','source-qualified','change');await h.settle();
  assert.equal(h.state.earthLookStatus,'deferred');
  assert.equal(JSON.stringify(h.state.bodies),positions);assert.equal(h.state.renderUnix,epoch);
  h.leaveOrrery();
});

test('Earth rejects and closes a decode that finishes after the page is hidden',async t=>{
  const pending=[];
  const h=await orreryHarness(t,{controls:true,useProductAppearanceDefault:true,
    illustrativeMap:(asset,signal)=>asset.body==='Earth'?new Promise(resolve=>pending.push({signal,resolve}))
      :Promise.resolve({width:2048,height:1024,close(){}})});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');await h.settle();
  const load=pending.at(-1);assert.ok(load);
  h.setHidden(true);assert.equal(load.signal.aborted,true);
  const image={width:5400,height:2700,closed:false,close(){this.closed=true;}};
  load.resolve(image);await h.settle();assert.equal(image.closed,true);
  assert.ok(!h.textureRecords.some(record=>record.pixels===image));h.leaveOrrery();
});

test('Earth shader failure stays isolated and the appearance selector retries it',async t=>{
  const h=await orreryHarness(t,{controls:true,useProductAppearanceDefault:true,
    illustrativeMap:async asset=>({width:asset.dimensions[0],height:asset.dimensions[1],close(){}})});
  await h.enterOrrery();h.setAnimate(false);h.setGraphicsFailure('shader');
  h.input('orreryAnchor','Earth','change');await h.settle();
  assert.equal(h.state.earthLookStatus,'unavailable');assert.equal(h.state.programStatus.base,'ready');
  h.setGraphicsFailure('');
  h.input('orreryPlanetLook','source-qualified','change');h.input('orreryPlanetLook','illustrative','change');await h.settle();
  assert.equal(h.state.earthLookStatus,'ready');h.leaveOrrery();
});

test('cloud toggles reach both passes and context loss deletes the exact Earth resources',async t=>{
  let earthImage;
  const h=await orreryHarness(t,{controls:true,useProductAppearanceDefault:true,
    illustrativeMap:async asset=>{const image={width:asset.dimensions[0],height:asset.dimensions[1],close(){}};
      if(asset.body==='Earth')earthImage=image;return image;}});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');await h.settle();await settleEarthLayers(h);
  const texture=h.textureRecords.find(record=>record.pixels===earthImage)?.texture;
  const mask=h.textureRecords.find(record=>record.args[2]===h.gl.R8&&record.pixels?.length===512*256)?.texture;
  assert.ok(texture);assert.ok(mask);
  const before=h.gpuSubmissions.length;h.check('orreryEarthWeather',false);
  const draws=h.gpuSubmissions.slice(before).filter(draw=>draw.uniforms.u_earthLookExposure===1.6);
  assert.ok(draws.length>=2);assert.ok(draws.every(draw=>draw.uniforms.u_earthWeather===0));
  assert.ok(draws.some(draw=>draw.uniforms.u_earthLookPass===0&&draw.depthWrites));
  assert.ok(draws.some(draw=>draw.uniforms.u_earthLookPass===1&&!draw.depthWrites));
  assert.ok(draws.filter(draw=>draw.uniforms.u_earthLookPass===1).every(draw=>draw.blend[0]===h.gl.ONE
    &&draw.blend[1]===h.gl.ONE_MINUS_SRC_ALPHA),'tone-mapped limb radiance uses premultiplied composition');
  h.event('orreryCanvas','webglcontextlost',{preventDefault(){}});
  assert.ok(h.deletedTextures.includes(texture));assert.ok(h.deletedTextures.includes(mask));
  assert.equal(h.state.earthLookStatus,'deferred');h.leaveOrrery();
});

test('sea ice and daily swaths restore the existing Earth path and bounded loads',async t=>{
  let earthLoads=0;
  const h=await orreryHarness(t,{controls:true,useProductAppearanceDefault:true,
    illustrativeMap:async asset=>{if(asset.body==='Earth')earthLoads++;return {width:asset.dimensions[0],height:asset.dimensions[1],close(){}};}});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');await h.settle();await settleEarthLayers(h);
  h.check('orreryEarthIce',true);await h.settle();assert.equal(h.state.earthLookStatus,'deferred');
  const loads=earthLoads;h.resize(900,650);await h.settle();assert.equal(earthLoads,loads);
  h.check('orreryEarthIce',false);await h.settle();assert.equal(h.state.earthLookStatus,'ready');
  h.input('orreryEarthCloudSource','daily','change');await h.settle();assert.equal(h.state.earthLookStatus,'deferred');
  assert.ok(h.images.some(image=>image.src===appearanceReference('Earth','weather').path));
  h.leaveOrrery();
});
