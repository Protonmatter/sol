import assert from "node:assert/strict";
import test from "node:test";
import { orreryHarness } from "./helpers/orreryHarness.mjs";
import { matchesMoonNormal } from "./helpers/moonDraws.mjs";
import { appearanceReferences } from '../../apps/web/js/planetAppearance.js';
import { BODY } from '../../apps/web/js/bodyData.js';
import {terrainExtentKm} from '../../apps/web/js/terrainAssets.js';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';

function assertOnlyRegisteredImages(h) {
  assert.ok(h.images.filter(image=>image.src).every(image=>appearanceReferences().some(a=>a.path===image.src)),
    'Only separately registered dated references load; legacy held globe/ring/disk imagery stays blocked');
  assert.ok(Object.values(h.state.appearanceStatus).filter(status=>status==='loading').length <= 2,
    'reference image transfer/decode concurrency remains bounded');
}

test('ready Sun writes only photosphere depth, then composites emission in front of distant and behind nearer rings',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true,solarAtlas:true});
  await h.enterOrrery();await h.settleCatalogues();
  h.event('orreryInspectSun','click');await h.settleCatalogues();
  assert.equal(h.state.solarStatus,'ready');
  h.input('orreryAnchor','Sun','change');
  const saturn=h.state.bodies.find(b=>b.name==='Saturn'),p=[saturn.x_au,saturn.y_au,saturn.z_au];
  for(const side of [1,-1]){
    h.state.az=Math.atan2(side*p[1],side*p[0]);h.state.el=Math.asin(side*p[2]/Math.hypot(...p));h.state.radius=40;
    const first=h.gpuSubmissions.length;h.check('orreryTextures',true);
    const draws=h.gpuSubmissions.slice(first),solar=draws.filter(draw=>draw.uniforms.u_camObj);
    assert.deepEqual(solar.map(d=>d.uniforms.u_pass),[1,2],'separate opaque and emissive solar passes');
    assert.equal(solar[0].depthWrites,true);assert.equal(solar[1].depthWrites,false);
    assert.deepEqual(solar[1].blend,[h.gl.ONE,h.gl.ONE],'optically thin emission retains background light');
    const corona=draws.indexOf(solar[1]);
    const opaque=draws.filter(draw=>draw.uniforms.u_mode===0&&draw.kind==='elements');
    assert.ok(opaque.length>=9,'opaque planets remain in the full scene');
    assert.ok(opaque.every(draw=>draw.depthWrites&&draws.indexOf(draw)<corona),'all opaque bodies establish depth first');
    const ring=draws.find(draw=>draw.uniforms.u_prad&&Math.hypot(...draw.uniforms.u_center.map((v,i)=>v-p[i]))<1e-4);
    assert.ok(ring,'Saturn ring is submitted');assert.equal(ring.depthWrites,false);
    assert.equal(draws.indexOf(ring)>corona,side===1,'near ring attenuates emission; far ring remains behind it');
    assert.ok(!draws.some(draw=>draw.uniforms.u_mode===1),'no fallback sphere may cover the source');
  }
  h.check('orreryTopDown',true);h.check('orreryFreeFly',true);h.event('orreryInspectSun','click');
  assert.equal(h.state.topDown,false,'inspection must use the source-facing orbit camera');
  assert.equal(h.nodes.orreryTopDown.checked,false,'the top-down control agrees with the camera');
  assert.equal(h.state.freeFly,false);assert.equal(h.nodes.orreryFreeFly.checked,false);
  for(const [width,height] of [[800,600],[320,540]]){
    h.resize(width,height);h.event('orreryInspectSun','click');
    const solar=h.gpuDraws.findLast(draw=>draw.uniforms.u_pass===1).uniforms;
    const occupied=solar.u_extent/Math.sqrt(Math.hypot(...solar.u_camObj)**2-solar.u_extent**2)/(Math.tan(21*Math.PI/180)*Math.min(1,width/height));
    assert.ok(occupied>.9&&occupied<.97,`source inspection fills ${occupied} without clipping the corona envelope`);
  }
  assert.equal(h.state.solarInspection,true);assert.deepEqual(h.errors,[]);
});

test('deferred atmospheric halos rebind their own body lighting and normals after opaque moons',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});await h.enterOrrery();await h.settleCatalogues();
  h.state.opticsEnabled=false;const first=h.gpuSubmissions.length;h.check('orreryTextures',false);
  const draws=h.gpuSubmissions.slice(first),opaque=draws.filter(d=>d.uniforms.u_mode===0&&d.kind==='elements');
  const halos=draws.filter(d=>d.uniforms.u_mode===2&&d.kind==='elements');assert.equal(halos.length,6);
  assert.ok(!halos.some(halo=>halo.uniforms.u_hazeRayleighTau?.[2]>0.05),'Earth does not receive the 1.015× limb shell');
  for(const halo of halos){
    const body=opaque.find(d=>d.uniforms.u_model.slice(12,15).every((v,i)=>v===halo.uniforms.u_model[12+i]));
    assert.ok(body);assert.equal(halo.depthWrites,false);assert.ok(draws.indexOf(halo)>draws.indexOf(opaque.at(-1)));
    for(const key of ['u_nmat','u_cam','u_light','u_atmo','u_atmoStr'])assert.deepEqual(halo.uniforms[key],body.uniforms[key],key);
  }
  assert.deepEqual(h.errors,[]);
});

test('Sun inspection omits surrounding bodies and restores the overview without moving physical state',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});await h.enterOrrery();await h.settleCatalogues();
  const identity=JSON.stringify([h.state.renderUnix,h.state.bodies]),guides=h.state.showOrbits;
  let from=h.gpuDraws.length;h.event('orreryInspectSun','click');
  const draws=h.gpuDraws.slice(from).filter(({uniforms:u})=>u.u_mode===0||u.u_mode===1);
  assert.equal(h.state.solarInspection,true);assert.ok(h.state.radius<2);assert.equal(draws.length,1);
  assert.equal(draws[0].uniforms.u_mode,1);assert.equal(h.state.showOrbits,guides);
  assert.equal(JSON.stringify([h.state.renderUnix,h.state.bodies]),identity);
  from=h.gpuDraws.length;h.input('orreryAnchor','Sun','change');
  assert.equal(h.state.solarInspection,false);assert.equal(h.state.radius,26);
  assert.equal(h.state.az,0.7);assert.equal(h.state.el,0.45);
  assert.ok(h.gpuDraws.slice(from).filter(({uniforms:u})=>u.u_mode===0).length>=9);
  const overviewLabels=new Set(h.nodes.orreryLabels.children
    .filter(node=>node.style.display==='block').map(node=>node.textContent));
  assert.ok(overviewLabels.has('Mercury'),'Mercury keeps a readable overview label');
  assert.ok(overviewLabels.has('Venus'),'Venus keeps a readable overview label');
  h.event('orreryInspectSun','click');h.input('orreryAnchor','Earth','change');assert.equal(h.state.solarInspection,false);
  assert.equal(JSON.stringify([h.state.renderUnix,h.state.bodies]),identity);assert.deepEqual(h.errors,[]);
});

function assertFocusedDisc(h, expected = .76, extentRatio = null) {
  if(extentRatio===null){const body=BODY[h.state.anchor];extentRatio=body?Math.max(1+(getAtmosphereProfile(h.state.anchor)?.topKm||0)/body.radiusKm,(terrainExtentKm(h.state.anchor)?.maxRadiusKm||body.radiusKm)/body.radiusKm):1;}
  const u = h.gpuDraws.findLast(({ uniforms: u }) => u.u_mode === 0 && u.u_model
    && Math.abs(u.u_mvp[12] / u.u_mvp[15]) < 1e-3 && Math.abs(u.u_mvp[13] / u.u_mvp[15]) < 1e-3)?.uniforms;
  assert.ok(u, 'an actual submitted sphere is at the focus centre');
  const extent = Math.hypot(...u.u_model.slice(0, 3)) * extentRatio;
  const aspect = h.nodes.orreryCanvas.clientWidth / h.nodes.orreryCanvas.clientHeight;
  const occupied = extent / Math.sqrt(h.state.radius ** 2 - extent ** 2)
    / (Math.tan(21 * Math.PI / 180) * Math.min(1, aspect));
  assert.ok(Math.abs(occupied - expected) < 2e-6, `focus occupies ${occupied} of the limiting viewport`);
  return extent;
}

test('focused planets and moons fit desktop and portrait views without changing submitted body geometry', async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: 'ready', reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  assert.equal(h.state.radius, 26, 'initial Solar System overview is unchanged');
  const bodies = JSON.stringify(h.state.bodies);
  const moonModels = new Set();
  const capture = action => {
    const first = h.gpuDraws.length; action();
    const draws = h.gpuDraws.slice(first).filter(({ uniforms: u }) => u.u_model && (u.u_mode === 0 || u.u_mode === 1));
    for (const { uniforms: u } of draws) {
      if (h.moons.some(moon => matchesMoonNormal(h, moon, u.u_nmat))) moonModels.add(JSON.stringify(u.u_model));
    }
    return draws.map(({ uniforms: u }) => JSON.stringify(u.u_model)).sort();
  };
  const before = capture(() => h.check('orreryTextures', h.state.useTextures));
  const models = new Map(before.map(value => [JSON.stringify(JSON.parse(value).slice(12, 15)), value]));
  // Camera distance intentionally admits previously sub-pixel moon systems.
  // Compare every reappearing model and require every core rotating body to remain. Catalogue
  // moons carry their own spin frame and may leave the view with camera distance, so they are
  // recognised by that frame rather than counted as core bodies.
  const core = before.filter(value => JSON.parse(value)[1] !== 0 && !moonModels.has(value));
  assert.equal(core.length, 10);
  for (const [width, height] of [[800, 600], [320, 540]]) {
    h.resize(width, height);
    for (const name of ['Earth', 'Moon', 'Saturn', 'Io']) {
      const after = capture(() => h.input('orreryAnchor', name, 'change'));
      for (const value of core) assert.ok(after.includes(value), `${name}: every core model remains unchanged`);
      for (const value of after) {
        const key = JSON.stringify(JSON.parse(value).slice(12, 15));
        if (models.has(key)) assert.equal(value, models.get(key), `${name}: a reappearing body retains its radius and transform`);
        else models.set(key, value);
      }
      const ratio = name === 'Saturn' ? BODY.Saturn.rings.outerKm / BODY.Saturn.radiusKm : null;
      assertFocusedDisc(h, .76, ratio);
    }
  }
  const extent = assertFocusedDisc(h);
  for (let i = 0; i < 20; i++) h.event('orreryCanvas', 'keydown', { key: '+' });
  assert.ok(h.state.radius > extent && h.state.radius < extent * 1.09, 'moon zoom is bounded outside its actual sphere');
  assert.equal(JSON.stringify(h.state.bodies), bodies, 'camera gestures do not change engine positions or epoch');
  h.input('orreryAnchor', 'Sun', 'change');
  assert.equal(h.state.radius, 26, 'explicit Sun overview remains available');
  assert.equal(h.errors.length, 0);
});

test('focused camera follows growing and shrinking display extents without resetting manual zoom', async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: 'ready', reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  const bodies = JSON.stringify(h.state.bodies), epoch = h.state.renderUnix;
  h.check('orreryTrueScale', true);
  h.input('orreryAnchor', 'Earth', 'change');
  const physicalDistance = h.state.radius;
  assertFocusedDisc(h);
  h.check('orreryTrueScale', false);
  assertFocusedDisc(h);
  assert.ok(h.state.radius > physicalDistance * 100, 'enlargement must move the eye outside the enlarged globe');
  h.check('orreryTrueScale', true);
  assert.ok(Math.abs(h.state.radius / physicalDistance - 1) < 1e-12, 'shrinking restores the same framing');
  h.check('orreryTrueScale', false);
  const normalExtent = assertFocusedDisc(h), normalFit = h.state.radius;
  h.input('orrerySize', '2');
  assertFocusedDisc(h);
  const fittedDistance = h.state.radius;
  h.event('orreryCanvas', 'keydown', { key: '+' });
  const zoom = h.state.radius / fittedDistance;
  h.check('orreryShowLabels', false);
  assert.equal(h.state.radius / fittedDistance, zoom, 'an ordinary repaint retains manual zoom');
  h.input('orrerySize', '1');
  assert.ok(Math.abs(h.state.radius / normalFit - zoom) < 1e-12, 'size changes preserve zoom relative to the fit');
  for (let i = 0; i < 30; i++) h.event('orreryCanvas', 'keydown', { key: '+' });
  h.check('orreryTrueScale', true);
  assert.ok(h.state.radius > BODY.Earth.radiusKm / 149597870.7, 'geometry shrink respects the physical near-surface zoom bound');
  h.check('orreryTrueScale', false);
  assert.ok(h.state.radius > normalExtent, 'geometry growth respects the enlarged near-surface zoom bound');
  assert.equal(JSON.stringify(h.state.bodies), bodies);
  assert.equal(h.state.renderUnix, epoch);
  assert.equal(h.errors.length, 0);
});

test('existing focus refits portrait resizing and retains zoom while overview and free flight stay independent', async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: 'ready', reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  h.resize(320, 720);
  assert.equal(h.state.radius, 26, 'initial overview does not become a Sun close-up');
  h.resize(800, 600);
  h.input('orreryAnchor', 'Saturn', 'change');
  const ratio = BODY.Saturn.rings.outerKm / BODY.Saturn.radiusKm;
  assertFocusedDisc(h, .76, ratio);
  h.resize(320, 720);
  assertFocusedDisc(h, .76, ratio);
  const portraitFit = h.state.radius;
  h.event('orreryCanvas', 'keydown', { key: '-' });
  const zoom = h.state.radius / portraitFit;
  h.resize(800, 600);
  const landscapeZoomed = h.state.radius;
  h.input('orreryAnchor', 'Saturn', 'change');
  assert.ok(Math.abs(landscapeZoomed / h.state.radius - zoom) < 1e-12, 'resize preserves the deliberate zoom ratio');
  const fitted = h.state.radius;
  h.resize(1600, 1200, 2);
  assert.equal(h.state.radius, fitted, 'same-aspect resize and DPR changes do not alter zoom');
  h.check('orreryTopDown', true); h.resize(320, 720);
  assert.equal(h.state.radius, 78, 'top-down keeps the system overview');
  h.check('orreryTopDown', false);
  assertFocusedDisc(h, .76, ratio);
  h.check('orreryFreeFly', true);
  const freePosition = JSON.stringify(h.state.freePos), freeRadius = h.state.radius;
  h.resize(800, 600); h.check('orreryTrueScale', true);
  assert.equal(JSON.stringify(h.state.freePos), freePosition, 'resize and scale do not move the free-fly camera');
  assert.equal(h.state.radius, freeRadius, 'free flight does not mutate the stored orbit zoom');
  h.check('orreryFreeFly', false);
  assertFocusedDisc(h, .76, ratio);
  h.event('orreryGalaxy', 'click'); h.resize(320, 720);
  assert.equal(h.state.radius, 118, 'galaxy keeps its separate overview distance');
  h.event('orreryGalaxy', 'click');
  assertFocusedDisc(h, .76, ratio);
  h.input('orreryAnchor', 'Pluto', 'change'); h.resize(800, 600);
  assert.equal(h.state.radius, 4, 'small-body marker focus keeps its contextual distance');
  h.input('orreryAnchor', 'Sun', 'change'); h.resize(320, 720);
  assert.equal(h.state.radius, 26, 'explicit Sun overview remains independent of aspect');
  assert.equal(h.errors.length, 0);
});

test('a focused moon crossing its validated epoch frames its parent immediately and recovers on return', async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: 'ready', reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  h.input('orreryAnchor', 'Io', 'change');
  const moonDistance = h.state.radius;
  assertFocusedDisc(h);
  h.input('orreryTime', '100'); await h.settle();
  assert.equal(h.state.anchor, 'Io', 'unavailable target remains selected with its limit disclosed');
  assert.match(h.nodes.orrerySelectedEpoch.textContent, /position unavailable outside the moon table interval/);
  assertFocusedDisc(h);
  assert.ok(h.state.radius > moonDistance * 2, 'fallback is reframed before drawing the larger parent');
  const parentDistance = h.state.radius;
  h.input('orreryAnchor', 'Jupiter', 'change');
  assert.ok(Math.abs(h.state.radius / parentDistance - 1) < 1e-12, 'implicit fallback and explicit parent focus agree');
  h.input('orreryAnchor', 'Io', 'change');
  h.now(); await h.settle();
  assert.equal(h.state.moonsHiddenReason, '');
  assertFocusedDisc(h);
  assert.ok(Math.abs(h.state.radius / moonDistance - 1) < 1e-12, 'valid moon return restores its close-up without another Focus action');
  assert.equal(h.errors.length, 0);
});

test("Orrery speed controls preserve the rate across units and bound manual entry", async t => {
  const h = await orreryHarness(t, { controls: true });
  await h.enterOrrery();
  assert.equal(h.nodes.orrerySpeedUnit.value, "1");
  h.input("orrerySpeedEntry", "2");
  assert.equal(h.state.yearsPerSec, 2 / 365.25);
  h.input("orrerySpeedUnit", "365.25", "change");
  assert.equal(h.state.yearsPerSec, 2 / 365.25, "unit changes express, rather than alter, the current rate");
  assert.equal(h.nodes.orrerySpeedEntry.value, "0.005476");
  h.input("orrerySpeedEntry", "1000");
  assert.equal(h.state.yearsPerSec, 50);
  assert.equal(h.nodes.orrerySpeedEntry.value, "50", "clamping must rewrite the input to the rate actually used");
  for (const invalid of ["", "0", "-1", "bad", "Infinity"]) {
    h.input("orrerySpeedEntry", invalid);
    assert.equal(h.state.yearsPerSec, 50);
  }
  h.input("orrerySpeedEntry", "0.000000001");
  assert.equal(h.state.yearsPerSec, 0.0001 / 365.25);
  h.input("orrerySpeed", "0");
  assert.equal(h.state.yearsPerSec, 1 / (24 * 365.25));
  h.input("orrerySpeed", "1");
  assert.ok(Math.abs(h.state.yearsPerSec - 5) < 1e-12);
  const preset = h.nodes.orrerySpeedPresets.children.find(node => node.dataset.dps === "1");
  h.event("orrerySpeedPresets", "click", { target: preset });
  assert.equal(h.state.yearsPerSec, 1 / 365.25);
  assert.equal(preset.getAttribute("aria-pressed"), "true");
  assert.equal(preset.classList.contains("active"), true);
  h.event("orrerySpeedPresets", "click");
  assert.equal(h.state.yearsPerSec, 1 / 365.25, "clicking empty preset-container space does not change speed");
  assert.equal(h.errors.length, 0);
});

test("Orrery orbit gestures clamp zoom and preserve the surviving pinch origin", async t => {
  const h = await orreryHarness(t, { controls: true, reducedMotion: true });
  await h.enterOrrery();
  assert.equal(h.state.animate, false);
  assert.equal(h.nodes.orreryAnimate.checked, false);
  const event = (type, fields) => h.event("orreryCanvas", type, fields);
  const startingAzimuth = h.state.az;
  event("pointermove", { pointerId: 99, clientX: 50, clientY: 50 });
  assert.equal(h.state.az, startingAzimuth);
  event("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
  event("pointermove", { pointerId: 1, clientX: 120, clientY: 110 });
  assert.ok(Math.abs(h.state.az - (startingAzimuth - 0.16)) < 1e-12);
  assert.ok(Math.abs(h.state.el - 0.53) < 1e-12);
  event("pointerdown", { pointerId: 2, clientX: 220, clientY: 110 });
  event("pointermove", { pointerId: 2, clientX: 320, clientY: 110 });
  assert.equal(h.state.radius, 13);
  event("pointerup", { pointerId: 2, clientX: 320, clientY: 110 });
  const afterPinch = h.state.az;
  event("pointermove", { pointerId: 1, clientX: 121, clientY: 110 });
  assert.ok(Math.abs(h.state.az - (afterPinch - 0.008)) < 1e-12, "lifting one finger must not whip the remaining drag");
  event("pointercancel", { pointerId: 1 });
  assert.equal(h.state.selected, null, "a pinch must not become a click selection");
  const beforeWheel = h.state.radius;
  assert.equal(event("wheel", { deltaY: 1 }).defaultPrevented, true);
  assert.equal(h.state.radius, beforeWheel * 1.12);
  for (const [key, field, delta] of [["ArrowLeft", "az", -0.1], ["ArrowRight", "az", 0.1], ["ArrowUp", "el", 0.1], ["ArrowDown", "el", -0.1]]) {
    const previous = h.state[field];
    assert.equal(event("keydown", { key }).defaultPrevented, true);
    assert.ok(Math.abs(h.state[field] - previous - delta) < 1e-12);
  }
  assert.equal(event("keydown", { key: "Escape" }).defaultPrevented, false);
  for (const key of ["+", "=", "]", "-", "_", "["]) assert.equal(event("keydown", { key }).defaultPrevented, true);
  for (let i = 0; i < 50; i++) event("keydown", { key: "+" });
  assert.equal(h.state.radius, 0.6);
  for (let i = 0; i < 60; i++) event("keydown", { key: "-" });
  assert.equal(h.state.radius, 160);
  assert.ok(h.draws > 0);
  assert.equal(h.errors.length, 0);
});

test("Orrery free flight integrates held controls while paused and releases them deterministically", async t => {
  const h = await orreryHarness(t, { controls: true, reducedMotion: true });
  await h.enterOrrery();
  h.frame(100);
  assert.equal(h.frames.size, 0, "a paused orbit idles");
  h.check("orreryFreeFly", true);
  assert.equal(h.state.freeFly, true);
  assert.equal(globalThis.document.activeElement, h.nodes.orreryCanvas);
  assert.equal(h.frames.size, 1, "camera movement remains responsive while orbital time is paused");
  const epoch = h.state.renderUnix;
  const event = (type, fields) => h.event("orreryCanvas", type, fields);
  for (const key of ["w", "s", "a", "d", "q", "e", "r", "f"]) {
    const position = Array.from(h.state.freePos);
    assert.equal(event("keydown", { key }).defaultPrevented, true);
    h.frame((h.state.lastTick || 100) + 20);
    assert.ok(Math.hypot(...position.map((v, i) => h.state.freePos[i] - v)) > 0, `${key} moves the camera`);
    event("keyup", { key: key.toUpperCase() });
    assert.equal(h.state.keys.size, 0);
  }
  const position = Array.from(h.state.freePos);
  event("keydown", { key: "Shift" }); event("keydown", { key: "w" });
  h.frame(h.state.lastTick + 20);
  assert.ok(Math.abs(Math.hypot(...position.map((v, i) => h.state.freePos[i] - v)) - 0.48) < 1e-10);
  event("blur"); assert.equal(h.state.keys.size, 0);
  assert.equal(h.state.renderUnix, epoch, "free flight must not advance a paused system clock");
  for (const [key, field, delta] of [["ArrowLeft", "yaw", 0.06], ["ArrowRight", "yaw", -0.06], ["ArrowUp", "pitch", 0.06], ["ArrowDown", "pitch", -0.06]]) {
    const prior = h.state[field]; event("keydown", { key }); assert.ok(Math.abs(h.state[field] - prior - delta) < 1e-12);
  }
  assert.equal(event("keydown", { key: "Escape" }).defaultPrevented, false);
  const yaw = h.state.yaw;
  event("pointerdown", { pointerId: 1, clientX: 20, clientY: 20 });
  event("pointermove", { pointerId: 1, clientX: 40, clientY: 30 });
  event("pointerup", { pointerId: 1, clientX: 40, clientY: 30 });
  assert.ok(Math.abs(h.state.yaw - yaw + 0.1) < 1e-12);
  for (const shiftKey of [false, true]) {
    const p = Array.from(h.state.freePos); event("wheel", { deltaY: -1, shiftKey });
    assert.ok(Math.abs(Math.hypot(...p.map((v, i) => h.state.freePos[i] - v)) - (shiftKey ? 2 : 0.5)) < 1e-10);
  }
  h.input("orreryAnchor", "Jupiter", "change");
  assert.equal(h.state.anchor, "Jupiter");
  assert.equal(h.state.selected, null, "free-flight anchor control must not unexpectedly select or reframe a body");
  h.check("orreryFreeFly", false); h.frame(h.state.lastTick + 20);
  assert.equal(h.frames.size, 0);
  assert.equal(h.errors.length, 0);
});

test("Orrery rendering controls preserve accessible selection and expose the real scale and epoch", async t => {
  const h = await orreryHarness(t, { controls: true, renderer: "Test hardware boundary" });
  await h.enterOrrery(); h.setAnimate(false);
  assert.match(h.nodes.orreryBackend.textContent, /Test hardware boundary/);
  assert.match(h.nodes.orreryMetadataEpoch.textContent, /metadata refresh is asynchronous/);
  assert.match(h.nodes.orreryDetail.textContent, /Click the Sun/);
  const options = h.nodes.orreryAnchor.querySelectorAll("option").map(node => node.value);
  for (const name of ["Sun", "Earth", "Moon", "Io", "Titan", "Pluto", "Voyager 1"]) assert.ok(options.includes(name), `${name} can be focused without waiting on catalogues`);
  h.input("orrerySearch", "");
  const earth = h.nodes.orreryPositions.children.find(node => node.dataset.objectId === "Earth");
  earth.focus(); earth.click();
  assert.equal(h.state.selected, "Earth");
  assert.equal(earth.getAttribute("aria-pressed"), "true");
  assert.match(h.nodes.orreryDetail.textContent, /Equatorial radius/);
  assert.equal(globalThis.document.activeElement, earth);
  h.event("orreryFocusSelected", "click");
  assert.equal(h.state.anchor, "Earth");
  assertFocusedDisc(h);
  const detail = h.nodes.orreryDetail.firstElementChild;
  h.input("orreryTime", "1"); await h.settle();
  assert.equal(h.state.offsetYears, 1);
  assert.equal(h.nodes.orreryDetail.firstElementChild, detail, "refresh updates facts without replacing the focused card");
  assert.equal(h.nodes.orreryPositions.children.find(node => node.dataset.objectId === "Earth"), earth);
  h.input("orrerySearch", "  eArTh ");
  assert.deepEqual(h.nodes.orreryPositions.children.map(node => node.dataset.objectId), ["Earth"]);
  h.input("orrerySearch", ""); h.input("orreryObjectGroup", "moon", "change");
  assert.ok(h.nodes.orreryPositions.children.some(node => node.dataset.objectId === "Io"));
  assert.ok(!h.nodes.orreryPositions.children.some(node => node.dataset.objectId === "Earth"));
  h.input("orreryObjectGroup", "all", "change");
  h.input("orreryAnchor", "Sun", "change");
  assert.equal(h.state.selected, "Sun"); assert.equal(h.state.radius, 26);
  assert.equal(h.nodes.orrerySelectionStatus.textContent, "Sun selected");
  h.input("orreryAnchor", "Io", "change");
  assert.equal(h.state.selected, "Io"); assert.match(h.nodes.orreryDetail.textContent, /moon|Jupiter/);
  h.check("orreryShowSmall", true);
  h.input("orreryAnchor", "Pluto", "change");
  assert.equal(h.state.radius, 4); assert.match(h.nodes.orreryDetail.textContent, /Dwarf planet/);
  const radius = h.state.radius;
  h.check("orreryTopDown", true); assert.equal(h.state.radius, 78);
  h.check("orreryTopDown", false); assert.equal(h.state.radius, radius);
  h.input("orrerySize", "2"); assert.equal(h.state.exaggeration, 2);
  h.check("orreryTrueScale", true);
  assert.match(h.nodes.orreryScaleStatus.textContent, /Physical scale/);
  assert.equal(h.nodes.orrerySize.disabled, true);
  assert.equal(h.nodes.orrerySize.value, "2");
  h.check("orreryTrueScale", false);
  assert.equal(h.nodes.orrerySize.disabled, false);
  assert.equal(h.nodes.orrerySize.value, "2");
  assert.match(h.nodes.orreryScaleStatus.textContent, /Enlarged for visibility/);
  for (const [control, property] of [["ShowOrbits", "showOrbits"], ["ShowSky", "showSky"], ["ShowConst", "showConst"], ["ShowLabels", "showLabels"], ["ShowSunEq", "showSunEq"], ["ShowSmall", "showSmall"], ["ShowMoons", "showMoons"], ["DeepSky", "galDeepSky"], ["Textures", "useTextures"]]) {
    for (const checked of [false, true]) {
      const before = h.draws; h.check(`orrery${control}`, checked);
      assert.equal(h.state[property], checked); assert.ok(h.draws > before, `${control} repaints while paused`);
    }
  }
  h.resize(640, 480, 2);
  assert.equal(h.nodes.orreryCanvas.width, 1280); assert.equal(h.nodes.orreryCanvas.height, 960);
  const labels = h.nodes.orreryLabels.children.filter(node => node.style.display === "block");
  assert.ok(labels.length > 0);
  for (const label of labels) assert.ok(Number.isFinite(Number(label.dataset.projectionX)) && Number.isFinite(Number(label.dataset.projectionY)));
  h.leaveOrrery(); const draws = h.draws; h.resize(320, 240); assert.equal(h.draws, draws);
  assert.equal(h.errors.length, 0);
});

test("Orrery galaxy and neighbourhood clocks stay separate from planetary time and keep star selection honest", async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: "ready" });
  await h.enterOrrery(); await h.settleCatalogues();
  assert.equal(h.warnings.length, 0, "committed moon and star catalogues load successfully");
  const epoch = h.state.renderUnix, radius = h.state.radius, solarRate = h.state.yearsPerSec;
  h.check("orreryFreeFly", true); h.event("orreryGalaxy", "click");
  assert.equal(h.state.freeFly, false); assert.equal(h.nodes.orreryFreeFly.checked, false);
  assert.equal(h.state.galaxy, true); assert.equal(h.state.radius, 118);
  assert.match(h.nodes.orreryScaleStatus.textContent, /kiloparsecs/);
  assert.equal(h.nodes.orrerySpeedExtras.style.display, "none");
  assert.equal(h.nodes.orrerySpeed.max, "50");
  h.input("orrerySpeed", "10"); assert.equal(h.state.galSpeed, 10);
  h.input("orrerySpeedEntry", "200"); h.input("orrerySpeedUnit", "365.25", "change");
  h.event("orrerySpeedPresets", "click", { target: h.nodes.orrerySpeedPresets.children[1] });
  assert.equal(h.state.yearsPerSec, solarRate, "galaxy controls cannot overwrite the parked planetary speed");
  h.frame(100); h.frame(150);
  assert.equal(h.state.galYears, 660000); assert.equal(h.state.renderUnix, epoch);
  h.setAnimate(false); h.input("orreryTime", "2");
  assert.equal(h.state.offsetYears, 2);
  const galaxyTime = h.state.galYears;
  h.event("orreryLocal", "click");
  assert.equal(h.state.localView, true); assert.equal(h.state.radius, 28);
  assert.match(h.nodes.orreryScaleStatus.textContent, /light-years.*static catalogue/);
  h.setAnimate(true); h.frame(200); h.frame(250);
  assert.equal(h.state.galYears, galaxyTime, "a static neighbourhood view must not advance the hidden galaxy clock");
  h.setAnimate(false);
  h.input("orreryObjectGroup", "star", "change"); h.input("orrerySearch", "Sirius");
  const sirius = h.nodes.orreryPositions.children.find(node => node.textContent.startsWith("Sirius ·"));
  assert.ok(sirius); sirius.click();
  assert.equal(h.state.selectedStar.name, "Sirius");
  assert.match(h.nodes.orreryDetail.textContent, /Hipparcos \(ESA 1997\)/);
  assert.match(h.nodes.orrerySelectedEpoch.textContent, /not an independently validated apparent place/);
  assert.equal(h.nodes.orreryFocusSelected.disabled, true);
  const anchor = h.state.anchor; h.event("orreryFocusSelected", "click"); assert.equal(h.state.anchor, anchor);
  h.event("orreryLocal", "click"); assert.equal(h.state.localView, false);
  assert.equal(h.state.selectedStar, null); assert.equal(h.state.radius, 118);
  // Disc clicks have no per-object picking; a star card must not reappear.
  h.event("orreryCanvas", "pointerdown", { pointerId: 1, clientX: 400, clientY: 300 });
  h.event("orreryCanvas", "pointerup", { pointerId: 1, clientX: 400, clientY: 300 });
  assert.equal(h.state.selectedStar, null);
  h.event("orreryGalaxy", "click");
  assert.equal(h.state.galaxy, false); assert.equal(h.state.radius, radius);
  assert.equal(h.nodes.orrerySpeed.max, "1"); assert.equal(h.nodes.orrerySpeedExtras.style.display, "");
  assert.equal(h.state.yearsPerSec, solarRate);
  h.event("orreryLocal", "click"); assert.equal(h.state.galaxy, true); assert.equal(h.state.localView, true);
  h.event("orreryGalaxy", "click"); assert.equal(h.state.galaxy, false); assert.equal(h.state.localView, false);
  h.now(); assert.equal(h.state.galYears, 0); assert.equal(h.state.renderUnix, epoch);
  assert.equal(h.errors.length, 0);
});

test("Orrery loaded moons use real elements and disclose clock aliasing and unavailable epochs", async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: "ready", reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  h.input("orreryAnchor", "Jupiter", "change");
  assert.equal(h.state.moonsHiddenReason, "");
  const labels = h.nodes.orreryLabels.children.map(node => node.textContent);
  assert.ok(labels.includes("Io"), "the real loaded Jupiter system contributes moon markers");
  h.input("orreryAnchor", "Io", "change");
  assert.equal(h.state.anchor, "Io"); assertFocusedDisc(h);
  assert.match(h.nodes.orreryDetail.textContent, /JPL Horizons/);
  h.input("orrerySpeed", "1"); h.setAnimate(true); h.frame(100);
  assert.ok(h.state.moonsAliasedCount > 0);
  assert.match(h.nodes.orreryAccuracy.textContent, /under-sampled|under.sample|too fast|hidden/i);
  assert.match(h.nodes.orreryAccuracy.textContent, /Rotation display rate-limited/);
  h.setAnimate(false); h.input("orreryTime", "100");
  assert.match(h.nodes.orreryAccuracy.textContent, /Moons hidden/);
  assert.match(h.nodes.orrerySelectedEpoch.textContent, /position unavailable outside the moon table interval/);
  h.input("orreryAnchor", "Io", "change");
  assertFocusedDisc(h);
  const parentDistance = h.state.radius;
  h.input("orreryAnchor", "Jupiter", "change");
  assert.equal(h.state.radius, parentDistance, "unavailable moon focus fits the same parent geometry");
  h.input("orreryAnchor", "Io", "change");
  h.input("orrerySearch", "Io");
  assert.match(h.nodes.orreryPositions.children.find(node => node.dataset.objectId === "Io").textContent, /position unavailable at this epoch/);
  h.now(); await h.settle();
  assert.equal(h.state.moonsHiddenReason, "");
  assert.equal(h.errors.length, 0);
});

test("Orrery failed optional catalogues remain disclosed and retry on a later entry", async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: "failed", reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  assert.match(h.state.moonsHiddenReason, /elements failed to load/);
  assert.match(h.nodes.orreryAccuracy.textContent, /elements failed to load/);
  assert.ok(h.warnings.some(args => args[0].includes("moon elements unavailable")));
  assert.ok(h.warnings.some(args => args[0].includes("star catalogue unavailable")));
  assert.equal(h.state.engineError, "", "optional catalogue failure must not invalidate the core system snapshot");
  h.leaveOrrery(); h.setCatalogueMode("ready");
  await h.enterOrrery(); await h.settleCatalogues();
  h.input("orreryAnchor", "Jupiter", "change");
  assert.equal(h.state.moonsHiddenReason, "");
  h.input("orrerySearch", "Sirius");
  assert.ok(h.nodes.orreryPositions.children.some(node => node.textContent.startsWith("Sirius ·")));
  assert.equal(h.errors.length, 0);
});

test("Orrery rejects unregistered imagery even when fetch-epoch metadata is available", async t => {
  const h = await orreryHarness(t, { controls: true, reducedMotion: true, sunMetadata: { fetched_unix: 1790000000 } });
  await h.enterOrrery(); await h.settle();
  assert.equal(h.state.sunImageUnix, null, "fetch time must not qualify an observation or map registration");
  assertOnlyRegisteredImages(h);
  assert.ok(h.draws > 0, "neutral surfaces keep the scene usable");
  h.check("orreryTextures", false); assert.equal(h.state.useTextures, false);
  h.check("orreryTextures", true); assert.equal(h.state.useTextures, true);
  assertOnlyRegisteredImages(h);
  assert.equal(h.errors.length, 0);
});

for (const graphicsFailure of ["unavailable", "shader", "link"]) {
  test(`Orrery ${graphicsFailure} graphics failure keeps text positions and explicit Retry restores rendering`, async t => {
    const h = await orreryHarness(t, { controls: true, graphicsFailure });
    await h.enterOrrery(); await h.settle();
    assert.equal(h.nodes.orreryCanvas.style.display, "none");
    assert.match(h.state.engineError, /WebGL2 is unavailable/);
    assert.equal(h.nodes.orreryRetry.hidden, false);
    assert.equal(h.state.bodies.length, 9);
    assert.ok(h.nodes.orreryPositions.children.some(node => node.dataset.objectId === "Earth"));
    assert.equal(h.draws, 0); assert.equal(h.frames.size, 0);
    assert.equal(h.errors.length, graphicsFailure === "unavailable" ? 0 : 1);
    h.setGraphicsFailure(""); await h.retry();
    assert.equal(h.nodes.orreryCanvas.style.display, ""); assert.equal(h.state.engineError, "");
    assert.equal(h.nodes.orreryRetry.hidden, true); assert.ok(h.draws > 0); assert.equal(h.frames.size, 1);
  });
}

test("Orrery context restoration rebuilds graphics, cancels stale work and rearms exactly one frame", async t => {
  const h = await orreryHarness(t, { controls: true });
  await h.enterOrrery(); await h.settle();
  const images = h.images.length, contexts = h.contexts;
  h.check("orreryFreeFly", true); h.event("orreryCanvas", "keydown", { key: "w" });
  const epoch = h.state.renderUnix, coordinates = h.state.bodies.map(body => body.x_au);
  assert.equal(h.event("orreryCanvas", "webglcontextlost").defaultPrevented, true);
  assert.equal(h.state.keys.size, 0); assert.equal(h.frames.size, 0);
  assert.match(h.state.engineError, /context lost/);
  assert.equal(h.state.renderUnix, epoch); assert.deepEqual(h.state.bodies.map(body => body.x_au), coordinates);
  h.event("orreryCanvas", "webglcontextrestored"); await h.settle();
  assert.equal(h.state.engineError, ""); assert.equal(h.contexts, contexts + 1);
  assert.equal(h.frames.size, 1); assert.equal(h.images.length, images * 2, "dead-context textures must be loaded again");
  h.event("orreryCanvas", "webglcontextlost"); h.setGraphicsFailure("unavailable");
  h.event("orreryCanvas", "webglcontextrestored"); assert.equal(h.frames.size, 0);
  h.leaveOrrery(); const inactiveContexts = h.contexts;
  h.event("orreryCanvas", "webglcontextrestored"); assert.equal(h.contexts, inactiveContexts);
  assert.equal(h.errors.length, 0);
});

test("Orrery canvas picks use the same real projected body and moon coordinates as their labels", async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: "ready", reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  function clickLabel(name) {
    const label = h.nodes.orreryLabels.children.find(node => node.textContent === name && node.style.display === "block");
    assert.ok(label, `${name} has a visible label`);
    const event = { pointerId: 1, clientX: Number(label.dataset.projectionX), clientY: Number(label.dataset.projectionY) };
    assert.ok(Number.isFinite(event.clientX) && Number.isFinite(event.clientY));
    h.event("orreryCanvas", "pointerdown", event); h.event("orreryCanvas", "pointerup", event);
    assert.equal(h.state.selected, name); assert.equal(h.state.selectedStar, null);
    assert.equal(h.nodes.orrerySelectionStatus.textContent, `${name} selected`);
  }
  // Selecting a different object first proves the canvas pick really changes it.
  h.input("orreryAnchor", "Sun", "change");
  h.input("orrerySearch", "Earth"); h.nodes.orreryPositions.children[0].click();
  clickLabel("Sun");
  h.input("orreryAnchor", "Io", "change"); clickLabel("Io");
  h.check("orreryShowSmall", true);
  h.input("orreryAnchor", "Pluto", "change");
  h.input("orrerySearch", "Earth"); h.nodes.orreryPositions.children[0].click();
  clickLabel("Pluto");
  assert.match(h.nodes.orreryDetail.textContent, /Dwarf planet/);
  h.check("orreryShowSky", false); h.check("orreryShowSmall", false);
  const empty = { pointerId: 2, clientX: -1000, clientY: -1000 };
  h.event("orreryCanvas", "pointerdown", empty); h.event("orreryCanvas", "pointerup", empty);
  assert.equal(h.state.selected, null); assert.equal(h.state.selectedStar, null);
  assert.match(h.nodes.orreryDetail.textContent, /Click the Sun/);
  h.check("orreryShowSky", true);
  h.event("orreryCanvas", "pointerdown", empty); h.event("orreryCanvas", "pointerup", empty);
  assert.equal(h.state.selectedStar, null);
  h.event("orreryLocal", "click");
  const namedLabel = h.nodes.orreryLabels.children.find(node => node.style.display === "block" && node.className.includes("sky-star") && node.textContent.includes(" · "));
  assert.ok(namedLabel, "a real neighbourhood catalogue star is rendered and labeled");
  const starPoint = { pointerId: 3, clientX: Number(namedLabel.dataset.projectionX), clientY: Number(namedLabel.dataset.projectionY) };
  h.event("orreryCanvas", "pointerdown", starPoint); h.event("orreryCanvas", "pointerup", starPoint);
  assert.equal(h.state.selectedStar.name, namedLabel.textContent.split(" · ")[0]);
  assert.match(h.nodes.orreryDetail.textContent, /Hipparcos \(ESA 1997\)/);
  h.event("orreryCanvas", "pointerdown", empty); h.event("orreryCanvas", "pointerup", empty);
  assert.equal(h.state.selectedStar, null);
  assert.equal(h.errors.length, 0);
});

for (const idleScheduler of ["idle", "timeout"]) {
  test(`Orrery holds unqualified generated maps with ${idleScheduler} scheduling available`, async t => {
    const h = await orreryHarness(t, { controls: true, geography: "ready", idleScheduler, reducedMotion: true });
    await h.enterOrrery(); await h.settleCatalogues();
    assert.equal(h.idleTasks.size, 0);
    assert.equal(h.canvasCommands.length, 0, "unqualified geography cannot generate invented surface detail");
    assert.ok(!h.textureUploads.some(args => args.at(-1)?.tagName === "CANVAS"));
    assertOnlyRegisteredImages(h);
    assert.ok(h.draws > 0);
    assert.equal(h.warnings.length, 0); assert.equal(h.errors.length, 0);
  });
}

test("Orrery held map work cannot upload after GPU context loss", async t => {
  const h = await orreryHarness(t, { controls: true, geography: "ready" });
  await h.enterOrrery(); await h.settleCatalogues();
  assert.equal(h.idleTasks.size, 0);
  const uploads = h.textureUploads.length;
  h.event("orreryCanvas", "webglcontextlost"); await h.flushIdleTasks();
  assert.equal(h.canvasCommands.length, 0); assert.equal(h.textureUploads.length, uploads);
  assert.match(h.state.engineError, /context lost/);
});

test("Orrery neutral surfaces require no geography transfer", async t => {
  const h = await orreryHarness(t, { controls: true, geography: "failed" });
  await h.enterOrrery(); await h.settleCatalogues();
  assert.equal(h.warnings.length, 0);
  const draws = h.draws; h.frame(100); assert.ok(h.draws > draws);
  assert.equal(h.state.engineError, ""); assert.equal(h.errors.length, 0);
});


test("returning to orbit and from galaxy restores truthful shared help", async t => {
  const h = await orreryHarness(t, { controls: true, reducedMotion: true });
  await h.enterOrrery();
  h.check("orreryFreeFly", true); h.check("orreryFreeFly", false);
  const hint = h.nodes.orreryInsight.textContent;
  assert.match(hint, /source-qualified/i);
  assert.match(hint, /low.detail/i);
  assert.match(hint, /enlarged.*physical/i);
  assert.doesNotMatch(hint, /real photographic surface maps|correct sizes/);
  h.event("orreryGalaxy", "click"); h.event("orreryGalaxy", "click");
  assert.equal(h.nodes.orreryInsight.textContent, hint);
});

test("explicit neighbourhood star picks open the inspector, empty picks and frames do not", async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: "ready", reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  h.event("orreryLocal", "click");
  const label = h.nodes.orreryLabels.children.find(node => node.style.display === "block" && !/^[0-9]|Sun/.test(node.textContent));
  assert.ok(label, "a named neighbourhood star is visible");
  const point = { pointerId: 1, clientX: Number(label.dataset.projectionX), clientY: Number(label.dataset.projectionY) };
  const selectedEvents = () => h.events.filter(event => event.type === "sol:object-selected");
  const before = selectedEvents().length;
  h.event("orreryCanvas", "pointerdown", point); h.event("orreryCanvas", "pointerup", point);
  assert.ok(h.state.selectedStar, "the label position selects a real star");
  assert.equal(selectedEvents().length, before + 1);
  assert.equal(selectedEvents().at(-1).detail.surface, "orrery");
  h.frame(100);
  const empty = { pointerId: 2, clientX: -1000, clientY: -1000 };
  h.event("orreryCanvas", "pointerdown", empty); h.event("orreryCanvas", "pointerup", empty);
  assert.equal(h.state.selectedStar, null);
  assert.equal(selectedEvents().length, before + 1);
});



test("System opens with optional clutter hidden and guide and small-body controls restore layers", async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: "ready", reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  for (const key of ["showConst", "showSmall", "showSunEq"]) assert.equal(h.state[key], false, key);
  for (const key of ["showOrbits", "showSky", "showLabels", "showMoons"]) assert.equal(h.state[key], true, key);
  assert.equal(h.state.moonGuideMode, "context");
  const drawsAfter = (control, on) => {
    const before = h.drawCalls.length;
    h.check(control, on);
    return h.drawCalls.length - before;
  };
  const baseline = drawsAfter("orreryShowSunEq", false);
  assert.ok(drawsAfter("orreryShowSunEq", true) > baseline, "reference geometry and drop lines add render calls");
  assert.equal(drawsAfter("orreryShowSunEq", false), baseline, "reference geometry disappears immediately while paused");
  assert.ok(drawsAfter("orreryShowSmall", true) > baseline, "retained optional bodies and paths can render");
  assert.equal(drawsAfter("orreryShowSmall", false), baseline);
  assert.ok(drawsAfter("orreryShowConst", true) > baseline, "constellation overlay remains available");
  assert.equal(drawsAfter("orreryShowConst", false), baseline);
  assert.ok(h.nodes.orreryPositions.children.some(node => node.textContent.startsWith("Pluto")), "hidden small bodies retain searchable catalogue facts");
});
