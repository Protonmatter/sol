import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {BODY, AU_KM} from '../../apps/web/js/bodyData.js';

async function boot(t) {
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();return h;
}
function submitted(h,name) {
  const body=h.state.bodies.find(b=>b.name===name),p=[body.x_au,body.y_au,body.z_au];
  return h.gpuDraws.findLast(({uniforms:u})=>u.u_mode===0&&u.u_model&&u.u_model.slice(12,15).every((v,i)=>Math.abs(v-p[i])<1e-7))?.uniforms;
}
function radius(u) {return Math.hypot(...u.u_model.slice(0,3));}
function occupied(h,extent) {
  return extent/Math.sqrt(h.state.radius**2-extent**2)/(Math.tan(21*Math.PI/180)*Math.min(1,h.nodes.orreryCanvas.clientWidth/h.nodes.orreryCanvas.clientHeight));
}
test('Saturn body focus fills desktop and phone with its rings at physical relative scale',async t=>{
  const h=await boot(t),physical=JSON.stringify(h.state.bodies);
  for(const [w,hgt] of [[800,600],[390,640]]) {
    h.resize(w,hgt);h.input('orreryAnchor','Saturn','change');
    const r=radius(submitted(h,'Saturn'));
    assert.ok(Math.abs(r/(BODY.Saturn.radiusKm/AU_KM)-1)<1e-6,'inspection uses physical radius');
    assert.ok(Math.abs(occupied(h,r*BODY.Saturn.rings.outerKm/BODY.Saturn.radiusKm)-.76)<1e-5,'rings fill 76% of limiting dimension');
  }
  assert.equal(JSON.stringify(h.state.bodies),physical);await h.settleCatalogues();await h.settle();assert.deepEqual(h.errors,[]);
});
test('Earth body and Moon system framing share physical geometry with independently useful camera fits',async t=>{
  const h=await boot(t);h.input('orreryAnchor','Earth','change');
  const bodyFit=h.state.radius,earth=radius(submitted(h,'Earth'));
  assert.ok(occupied(h,earth)>.70,'Earth globe dominates body inspection');
  assert.equal(h.nodes.orreryFocusSystem.disabled,false);
  h.event('orreryFocusSystem','click');
  assert.ok(h.state.radius>bodyFit*40,'system action fits the distant Moon');
  assert.ok(Math.abs(radius(submitted(h,'Earth'))/earth-1)<1e-6,'system action only changes framing');
  const moon=submitted(h,'Moon');assert.ok(moon,'Moon is submitted at its engine position');
  assert.ok(Math.abs(radius(moon)/earth-BODY.Moon.radiusKm/BODY.Earth.radiusKm)<1e-6);
  h.check('orreryTrueScale',true);const fit=h.state.radius;
  h.event('orreryFocusSelected','click');assert.ok(h.state.radius<fit/40);
  h.event('orreryFocusSystem','click');assert.ok(Math.abs(h.state.radius/fit-1)<1e-10,'true scale retains separate system fit');
  await h.settleCatalogues();await h.settle();assert.deepEqual(h.errors,[]);
});
test('body picking covers the displayed globe away from the old fixed centre hit target',async t=>{
  const h=await boot(t);h.input('orreryAnchor','Earth','change');h.check('orreryShowSky',false);
  const c=h.nodes.orreryCanvas,rect=c.getBoundingClientRect();
  h.event('orreryCanvas','pointerup',{clientX:rect.left+c.clientWidth/2+80,clientY:rect.top+c.clientHeight/2,pointerId:1});
  assert.equal(h.state.selected,'Earth','a click well inside the rendered Earth picks Earth');
  await h.settleCatalogues();await h.settle();assert.deepEqual(h.errors,[]);
});
test('inspection scale is independent of overview enlargement and survives galaxy and Sun modes',async t=>{
  const h=await boot(t);h.input('orreryAnchor','Earth','change');const fit=h.state.radius;
  h.input('orrerySize','2');h.check('orreryTrueScale',true);h.check('orreryTrueScale',false);
  assert.equal(h.state.radius,fit);assert.equal(h.nodes.orrerySize.disabled,true);
  h.event('orreryGalaxy','click');h.event('orreryGalaxy','click');assert.equal(h.state.radius,fit);
  h.input('orreryAnchor','Sun','change');assert.equal(h.state.radius,26);assert.equal(h.nodes.orrerySize.disabled,false);
  h.check('orreryTrueScale',true);assert.equal(h.nodes.orrerySize.disabled,true);
  h.event('orreryInspectSun','click');assert.equal(h.state.solarInspection,true);
  await h.settleCatalogues();await h.settle();assert.deepEqual(h.errors,[]);
});

test('Saturn satellite action fits outer moons without the former eight-globe cap',async t=>{
  const h=await boot(t);h.input('orreryAnchor','Saturn','change');const bodyFit=h.state.radius;
  h.event('orreryFocusSystem','click');await h.settleCatalogues();
  assert.ok(h.state.radius/bodyFit>20,'outer moon orbit is included in explicit system framing');
  assert.equal(h.state.anchor,'Saturn');
  h.event('orreryFocusSelected','click');assert.equal(h.state.radius,bodyFit);
  await h.settleCatalogues();await h.settle();assert.deepEqual(h.errors,[]);
});

test('close physical Moon geometry supplies label occlusion and a pickable globe',async t=>{
  const h=await boot(t);h.input('orreryAnchor','Moon','change');h.check('orreryShowSky',false);
  const c=h.nodes.orreryCanvas,rect=c.getBoundingClientRect();
  h.event('orreryCanvas','pointerup',{clientX:rect.left+c.clientWidth/2+60,clientY:rect.top+c.clientHeight/2,pointerId:2});
  assert.equal(h.state.selected,'Moon','physical moon close-up is selectable beyond the centre');
  await h.settleCatalogues();await h.settle();assert.deepEqual(h.errors,[]);
});
