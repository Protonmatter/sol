import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {BODY} from '../../apps/web/js/bodyData.js';
import {MOONS} from '../../apps/web/js/moons.js';
import {MOON_ELEMENTS} from '../../apps/web/js/moonelements.js';
import {moonOffsetAU} from '../../apps/web/js/moonorbits.js';
import {SYSTEM_ORDER} from '../../apps/web/js/systemContract.js';

test('fresh Saturn uses the Sun for its globe, rings and moons, independent of the camera',async t=>{
  // Synthetic alignment, not a claimed historical transit: retain real moon offsets
  // and place Saturn opposite Tethys so its shadow must reach the globe.
  const tethys={...MOONS.find(m=>m.n==='Tethys'),...MOON_ELEMENTS.Tethys};
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',useProductAppearanceDefault:true,
    illustrativeMap:async()=>({width:2048,height:1024,close(){}}),
    systemPositions(unix){
      const offset=moonOffsetAU(tethys,unix),distance=Math.hypot(...offset);
      return Float64Array.from(SYSTEM_ORDER.flatMap((name,i)=>name==='Saturn'
        ?offset.map(value=>-9.5*value/distance):name==='Sun'?[0,0,0]:[i+1,0,0]));
    }});
  await h.enterOrrery();t.after(()=>h.leaveOrrery());h.setAnimate(false);
  await h.settleCatalogues();h.input('orreryAnchor','Saturn','change');
  await h.settle();await h.settle();
  assert.equal(h.state.saturnLighting,'sun-directed');
  assert.equal(h.nodes.orrerySaturnLighting.value,'sun-directed');
  const body=h.state.bodies.find(b=>b.name==='Saturn'),position=[body.x_au,body.y_au,body.z_au];
  const direction=pos=>pos.map(value=>-value/Math.hypot(...pos));
  const near=(actual,expected)=>expected.forEach((value,i)=>assert.ok(Math.abs(actual[i]-value)<1e-6));
  const paint=()=>{const start=h.gpuSubmissions.length;h.check('orreryTextures',true);return h.gpuSubmissions.slice(start);};
  const surface=frame=>frame.find(draw=>draw.uniforms.u_bodyRadiusKm===BODY.Saturn.radiusKm&&draw.uniforms.u_mode===0).uniforms;
  const epoch=h.state.renderUnix,positions=JSON.stringify(h.state.bodies);
  const checkSolar=()=>{
    const frame=paint(),globe=surface(frame);
    near(globe.u_light,direction(position));
    assert.equal(globe.u_saturnLook,1,'recovered colors remain enabled under sunlight');
    assert.equal(globe.u_useTex,1);
    assert.ok(globe.u_moonShadowCount>0,'the synthetic Tethys transit must not be suppressed');
    const ring=frame.find(draw=>draw.kind==='arrays'&&draw.uniforms.u_prad!==undefined
      &&draw.uniforms.u_center.every((value,i)=>Math.abs(value-position[i])<1e-6));
    assert.ok(ring,'Saturn rings must be submitted');
    assert.deepEqual(ring.uniforms.u_light,globe.u_light,'globe and ring shadows share the solar direction');
    for(const name of ['Tethys','Titan']){
      const moon=h.moons.find(m=>m.n===name),offset=moonOffsetAU(moon,epoch);
      const draw=frame.find(d=>d.uniforms.u_bodyRadiusKm===moon.r&&d.uniforms.u_mode===0);
      assert.ok(draw,`${name} must be drawn`);
      near(draw.uniforms.u_light,direction(position.map((value,i)=>value+offset[i])));
      assert.equal(draw.uniforms.u_saturnLook,0);
    }
    return globe;
  };
  const initial=checkSolar();h.state.az+=Math.PI/2;h.state.el=-.8;h.state.radius*=1.2;
  const orbited=checkSolar();
  for(const key of ['u_light','u_lightObj','u_moonShadowCount','u_moonShadowPos[0]','u_moonShadowAxis[0]'])
    assert.deepEqual(orbited[key],initial[key],`${key} must not follow the camera`);
  h.input('orrerySaturnLighting','look-lab','change');
  const inspection=surface(paint());assert.notDeepEqual(inspection.u_light,initial.u_light);
  assert.equal(inspection.u_moonShadowCount,0,'inspection remains an explicit separate mode');
  h.input('orrerySaturnLighting','sun-directed','change');checkSolar();
  assert.equal(h.state.renderUnix,epoch);assert.equal(JSON.stringify(h.state.bodies),positions);
});

test('only a ready illustrative Saturn map receives the recovered display material',async t=>{
  let complete;
  const h=await orreryHarness(t,{controls:true,useProductAppearanceDefault:true,
    illustrativeMap:asset=>asset.body==='Saturn'?new Promise(resolve=>{complete=resolve;})
      :Promise.resolve({width:2048,height:1024,close(){}})});
  await h.enterOrrery();t.after(()=>h.leaveOrrery());h.setAnimate(false);
  h.input('orreryAnchor','Saturn','change');await h.settle();
  const saturn=draw=>draw.uniforms.u_bodyRadiusKm===BODY.Saturn.radiusKm&&draw.uniforms.u_mode===0;
  const paint=()=>{const start=h.gpuDraws.length;h.check('orreryTextures',h.state.useTextures);return h.gpuDraws.slice(start);};
  assert.ok(paint().filter(saturn).every(draw=>draw.uniforms.u_saturnLook===0),'pending maps keep the existing fallback');
  h.input('orrerySaturnLighting','look-lab','change');
  complete({width:2048,height:1024,close(){}});await h.settle();await h.settle();
  const epoch=h.state.renderUnix,positions=JSON.stringify(h.state.bodies),frame=paint();
  assert.ok(frame.some(draw=>saturn(draw)&&draw.uniforms.u_saturnLook===1&&draw.uniforms.u_useTex===1));
  assert.ok(frame.every(draw=>draw.uniforms.u_saturnLook!==1||saturn(draw)),
    'Saturn moons and other bodies cannot inherit the parent material');
  const inspection=frame.find(saturn).uniforms;
  assert.equal(inspection.u_moonShadowCount,0,'inspection light cannot reuse real-Sun moon transits');
  assert.equal(h.nodes.orrerySaturnControls.hidden,false);
  h.input('orrerySaturnLighting','sun-directed','change');
  const solar=paint().find(saturn).uniforms.u_light;
  assert.notDeepEqual(solar,inspection.u_light,'Sun-directed choice must reach the actual draw');
  const body=h.state.bodies.find(b=>b.name==='Saturn'),distance=Math.hypot(body.x_au,body.y_au,body.z_au);
  for(const [i,key] of ['x_au','y_au','z_au'].entries())assert.ok(Math.abs(solar[i]+body[key]/distance)<1e-6);
  for(const change of [()=>h.input('orreryPlanetLook','source-qualified','change'),()=>h.check('orreryTextures',false)]){
    change();await h.settle();assert.ok(paint().every(draw=>draw.uniforms.u_saturnLook!==1));
  }
  assert.equal(h.state.renderUnix,epoch);assert.equal(JSON.stringify(h.state.bodies),positions);
});
