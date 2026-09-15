import assert from "node:assert/strict";
import test from "node:test";
import { orreryHarness as harness } from "./helpers/orreryHarness.mjs";
import { matchesMoonNormal } from "./helpers/moonDraws.mjs";
import { MOON_ALBEDO, MOON_ALBEDO_REFERENCE } from "../../apps/web/js/moonAppearance.js";
import { moonOffsetAU } from "../../apps/web/js/moonorbits.js";
import { sunlightOnMoon } from "../../apps/web/js/moonshadows.js";
import { iauRotation } from "../../apps/web/js/orreryMath.js";
import { BODY, AU_KM } from "../../apps/web/js/bodyData.js";
import { appearanceReferences } from '../../apps/web/js/planetAppearance.js';

test("Sun submits an emissive white display while held solar texture detail stays disabled", async t => {
  const h = await harness(t, { controls: true, reducedMotion: true });
  await h.enterOrrery();
  const epoch = h.state.renderUnix, bodies = JSON.stringify(h.state.bodies);
  for (const enabled of [false, true]) {
    const first = h.uniformDraws.length;
    h.check("orreryTextures", enabled);
    const sun = h.uniformDraws.slice(first).find(draw => draw.u_mode === 1);
    assert.ok(sun, "the actual renderer submits the Sun");
    const [r, g, b] = sun.u_base;
    assert.ok(r >= 0.95 && g >= 0.95 && b >= 0.9, "emissive display must not reuse the gray missing-detail material");
    assert.ok(r >= g && g >= b && r - b < 0.1, "subtle display warmth, not the EUV false-color palette");
    assert.equal(sun.u_style, -1, "unqualified procedural spots and granulation stay disabled");
    assert.equal(sun.u_useTex, 0, "unregistered camera disk cannot wrap onto the sphere");
    assert.deepEqual(sun.u_model.slice(12, 15), [0, 0, 0], "Sun remains at the engine origin");
  }
  assert.ok(!h.images.some(image => /\/sun\.jpg(?:$|\?)/.test(image.src)));
  assert.equal(h.state.renderUnix, epoch);
  assert.equal(JSON.stringify(h.state.bodies), bodies);
  h.leaveOrrery();
});

test("held moon textures retain neutral albedo-scaled GPU inputs and eclipse attenuation", async t => {
  const h = await harness(t, { controls: true, catalogues: "ready", reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  h.input("orreryAnchor", "Jupiter", "change");
  h.state.radius = 0.1;
  const first = h.uniformDraws.length;
  h.check("orreryTrueScale", true);
  const jupiter = h.state.bodies.find(body => body.name === "Jupiter");
  const parent = [jupiter.x_au, jupiter.y_au, jupiter.z_au];
  const rot = iauRotation(BODY.Jupiter, h.state.renderUnix);
  const toBody = vector => [0, 1, 2].map(i => rot[i * 4] * vector[0] + rot[i * 4 + 1] * vector[1] + rot[i * 4 + 2] * vector[2]);
  const sun = toBody(parent.map(value => -value * AU_KM));
  const uploads = new Map();
  for (const moon of h.moons.filter(moon => moon.p === "Jupiter")) {
    const offset = moonOffsetAU(moon, h.state.renderUnix);
    const position = offset.map((value, i) => value + parent[i]);
    const matches = h.uniformDraws.slice(first).filter(draw => draw.u_style === -1 && draw.u_mode === 0
      && matchesMoonNormal(h, moon, draw.u_nmat)
      && draw.u_model?.slice(12, 15).every((value, i) => Math.abs(value - position[i]) < 1e-6));
    assert.equal(matches.length, 1, `${moon.n}: one actual moon sphere upload at its physical position`);
    const draw = matches[0], [red, green, blue] = draw.u_base;
    assert.equal(draw.u_useTex, 0, `${moon.n}: held texture cannot supply detail`);
    assert.equal(draw.u_texMode, 0);
    assert.equal(red, green, `${moon.n}: no unqualified catalogue hue`);
    assert.equal(red, blue);
    const sunlit = sunlightOnMoon(toBody(offset.map(value => value * AU_KM)), sun,
      { eqRadius: BODY.Jupiter.radiusKm, polarRadius: BODY.Jupiter.polarKm, sunRadius: BODY.Sun.radiusKm });
    const illumination = 0.06 + 0.94 * sunlit;
    const expected = (MOON_ALBEDO[moon.n] / MOON_ALBEDO_REFERENCE * illumination) ** (1 / 2.2);
    assert.ok(Math.abs(red - expected) < 1e-6, `${moon.n}: uploaded brightness retains the existing albedo and eclipse transfer`);
    uploads.set(moon.n, red ** 2.2 / illumination);
  }
  assert.ok(uploads.get("Europa") > uploads.get("Ganymede"), "the larger Ganymede must retain its lower reflectance");
  assert.ok(Math.abs(uploads.get("Callisto") / uploads.get("Europa") - MOON_ALBEDO.Callisto / MOON_ALBEDO.Europa) < 1e-6);
  assert.ok(h.images.filter(image=>image.src).every(image=>appearanceReferences().some(a=>a.path===image.src)),
    'only dated registered references load; held moon images remain blocked');
  assert.ok(Object.values(h.state.appearanceStatus).filter(status=>status==='loading').length<=2,
    'only the bounded set of useful visible maps can be pending');
  h.leaveOrrery();
});

test("paused physical-scale control updates immediately when the canvas cannot paint", async t => {
  const h = await harness(t, { controls: true, reducedMotion: true });
  await h.enterOrrery(); h.frame(1000);
  assert.equal(h.frames.size, 0);
  const epoch = h.state.renderUnix, before = h.draws;
  h.nodes.orreryCanvas.clientWidth = 0;
  h.nodes.orrerySize.value = "2";
  for (const checked of [true, false]) {
    h.check("orreryTrueScale", checked);
    assert.equal(h.state.trueScale, checked);
    assert.equal(h.nodes.orrerySize.disabled, checked, "control state cannot depend on a successful GPU paint");
    assert.match(h.nodes.orreryScaleStatus.textContent, checked ? /Physical scale/ : /Enlarged for visibility/);
    assert.equal(h.nodes.orrerySize.value, "2", "preserve the user's parked enlargement value");
    assert.equal(h.state.renderUnix, epoch);
    assert.equal(h.frames.size, 0, "scale changes do not resume a paused clock");
    assert.equal(h.draws, before, "the zero-width canvas did not paint");
  }
  h.leaveOrrery();
});

test("Retry after failed System re-entry restores the retained canvas and animation loop", async t => {
  const h = await harness(t);
  await h.enterOrrery();
  assert.equal(h.state.engineError, "");
  assert.equal(h.state.bodies.length, 9);
  assert.equal(h.contexts, 1);
  assert.ok(h.draws > 0, "first entry reaches real paint and GPU draw calls");
  assert.equal(h.frames.size, 1);
  h.leaveOrrery();
  assert.equal(h.frames.size, 0);
  h.failWorker(true);
  await h.enterOrrery(); await h.settle();
  assert.equal(h.state.bodies.length, 9, "last valid metadata survives failure");
  assert.equal(h.nodes.orreryCanvas.style.display, "none");
  assert.equal(h.nodes.orreryRetry.hidden, false);
  assert.equal(h.frames.size, 0);
  await h.retry();
  assert.match(h.state.engineError, /test worker unavailable/);
  assert.equal(h.nodes.orreryCanvas.style.display, "none", "failed Retry retains fallback");
  assert.equal(h.nodes.orreryRetry.hidden, false);
  assert.equal(h.frames.size, 0, "failed Retry cannot start animation with invalid entry data");
  h.failWorker(false);
  const before = h.draws;
  await h.retry();
  assert.equal(h.state.engineError, "");
  assert.equal(h.nodes.orreryCanvas.style.display, "", "successful Retry must restore canvas visibility");
  assert.equal(h.nodes.orreryRetry.hidden, true);
  assert.equal(h.contexts, 1, "reuse the initialized WebGL context");
  assert.ok(h.draws > before, "recovery repaints immediately");
  assert.equal(h.frames.size, 1, "recovery restarts exactly one frame loop");
  const unix = h.state.renderUnix;
  h.frame(1000);
  assert.ok(h.state.renderUnix > unix, "recovered loop advances the actual simulation clock");
  assert.equal(h.frames.size, 1);
  h.leaveOrrery();
});

test("reentrant Retry handler cannot cancel the full System recovery already entering", async t => {
  const h = await harness(t);
  await h.enterOrrery();
  h.leaveOrrery();
  h.failWorker(true);
  await h.enterOrrery(); await h.settle();
  assert.equal(h.nodes.orreryCanvas.style.display, "none");
  assert.equal(h.nodes.orreryRetry.hidden, false);
  assert.equal(h.frames.size, 0);
  h.failWorker(false);
  const before = h.draws, requestCount = h.requests.length;
  const first = h.retry();
  assert.equal(h.state.entering, true, "second invocation precedes entry's worker result publication");
  // Boundary-injected reentrancy, not proof of a user double-click: the first
  // handler synchronously hides Retry, so a browser may not dispatch another click.
  const second = h.retry();
  await Promise.all([first, second]);
  assert.equal(h.state.engineError, "");
  assert.equal(h.nodes.orreryCanvas.style.display, "");
  assert.equal(h.frames.size, 1, "reentrant Retry must complete one full rendering recovery");
  assert.ok(h.draws > before, "recovery paints the retained canvas");
  assert.equal(h.requests.length, requestCount + 1, "invocations coalesce into the pending entry request");
  assert.equal(h.state.entering, false);
  assert.equal(h.nodes.orreryRetry.hidden, true);
  const unix = h.state.renderUnix;
  h.frame(1000);
  assert.ok(h.state.renderUnix > unix);
  assert.equal(h.frames.size, 1);
  h.leaveOrrery();
});

test("paused System recovery repaints but does not turn animation on", async t => {
  const h = await harness(t);
  h.state.animate = false;
  await h.enterOrrery();
  h.frame(1000);
  assert.equal(h.frames.size, 0, "paused view idles after its entry frame");
  h.leaveOrrery();
  h.failWorker(true);
  await h.enterOrrery(); await h.settle();
  assert.equal(h.nodes.orreryCanvas.style.display, "none");
  h.failWorker(false);
  const before = h.draws;
  await h.retry();
  assert.equal(h.nodes.orreryCanvas.style.display, "");
  assert.equal(h.state.engineError, "");
  assert.ok(h.draws > before);
  assert.equal(h.state.animate, false);
  assert.equal(h.frames.size, 1);
  const unix = h.state.renderUnix;
  h.frame(2000);
  assert.equal(h.state.renderUnix, unix);
  assert.equal(h.frames.size, 0, "recovered paused view returns to idle");
  h.leaveOrrery();
});

test("metadata-only Retry preserves the running System epoch and single animation loop", async t => {
  const h = await harness(t);
  await h.enterOrrery();
  h.failWorker(true);
  h.advanceMonotonicTime(1000);
  h.frame(1000);
  await h.settle();
  assert.match(h.state.engineError, /Orbital metadata unavailable/);
  assert.equal(h.nodes.orreryCanvas.style.display, "");
  assert.equal(h.frames.size, 1);
  const unix = h.state.renderUnix;
  const requestCount = h.requests.length;
  h.failWorker(false);
  await h.retry();
  assert.equal(h.state.engineError, "");
  assert.equal(h.state.renderUnix, unix, "metadata recovery must not reset the rendered clock");
  assert.equal(h.requests.length, requestCount + 1);
  assert.equal(h.requests.at(-1), unix, "metadata request is bound to the current rendered epoch");
  assert.equal(h.frames.size, 1);
  assert.equal(h.contexts, 1);
  h.leaveOrrery();
});

for (const { edge, start, direction } of [
  { edge: "upper", start: "9999-12-31T23:59:00Z", direction: 1 },
  // Reverse rate is adversarial state injection; the current speed controls only
  // advance time. Admission must still protect the lower computational boundary.
  { edge: "lower", start: "-009999-01-01T00:01:00Z", direction: -1 },
]) test(`System animation retains its last valid epoch at the ${edge} bound and recovers through Now`, async t => {
  const h = await harness(t);
  const initialUnix = Date.parse(start) / 1000;
  h.setWallUnix(initialUnix);
  await h.enterOrrery();
  h.state.yearsPerSec = direction / (24 * 365.25);
  h.holdSnapshots();
  h.advanceMonotonicTime(1000);
  h.frame(1000);
  assert.equal(h.state.renderUnix, initialUnix + direction * 57.6, "first frame remains admitted");
  assert.equal(h.requests.length, 2, "hold a valid metadata refresh across the next frame");
  const validUnix = h.state.renderUnix, validBodies = h.state.bodies;
  const validElapsed = h.state.simElapsed, validMetadataUnix = h.state.metadataUnix;
  const positionsBefore = h.positionEpochs.length, drawsBefore = h.draws;
  h.frame(1050);
  assert.equal(h.positionEpochs.length, positionsBefore, "unsupported epoch must not reach raw WASM positions");
  assert.equal(h.state.renderUnix, validUnix);
  assert.equal(h.state.simElapsed, validElapsed);
  assert.equal(h.state.bodies, validBodies, "rejected frame keeps the complete coordinate set");
  assert.equal(h.state.metadataUnix, validMetadataUnix);
  assert.equal(h.state.simStepSeconds, 0);
  assert.equal(h.state.animate, false);
  assert.equal(h.nodes.orreryAnimate.checked, false);
  assert.equal(h.frames.size, 0, "a rejected frame must not keep rescheduling animation");
  assert.ok(h.draws > drawsBefore, "the retained epoch is still painted");
  assert.match(h.state.engineError, /epoch.*outside.*retained/i);
  assert.match(h.nodes.orreryAccuracy.textContent, /choose.*time|Now/i);
  assert.equal(h.nodes.orreryRetry.hidden, false);
  assert.equal(h.state.presentation.availability, "last_valid");
  assert.ok(h.presentations.every(p => p.availability !== "unavailable"));
  const boundaryError = h.state.engineError;
  h.completeSnapshot(1);
  await h.settle();
  assert.equal(h.state.engineError, boundaryError, "a delayed pre-stop reply must not erase the boundary notice");
  assert.equal(h.state.bodies, validBodies);
  assert.equal(h.frames.size, 0);

  h.holdSnapshots(false);
  h.setWallUnix(1800000000);
  h.now();
  await h.settle();
  assert.equal(h.state.renderUnix, 1800000000);
  assert.equal(h.state.simElapsed, 0);
  assert.equal(h.state.engineError, "");
  assert.equal(h.nodes.orreryRetry.hidden, true);
  assert.equal(h.state.animate, false, "choosing a valid time preserves the user's paused state");
  assert.equal(h.frames.size, 0);
  h.state.yearsPerSec = 1 / (24 * 365.25);
  h.setAnimate(true);
  assert.equal(h.frames.size, 1);
  h.frame(1100);
  assert.equal(h.state.renderUnix, 1800000057.6);
  assert.equal(h.frames.size, 1, "explicit resume starts only one loop");
  h.leaveOrrery();
});

for (const epoch of ["-009999-01-01T00:00:00Z", "9999-12-31T23:59:59Z"])
  test(`paused System entry at ${epoch} preserves its valid epoch`, async t => {
    const h = await harness(t), unix = Date.parse(epoch) / 1000;
    h.setWallUnix(unix);
    h.setAnimate(false);
    await h.enterOrrery();
    const positionsBefore = h.positionEpochs.length;
    h.frame(1000);
    assert.equal(h.state.renderUnix, unix);
    assert.equal(h.state.simElapsed, 0);
    assert.equal(h.state.simStepSeconds, 0);
    assert.equal(h.state.engineError, "");
    assert.equal(h.state.animate, false);
    assert.equal(h.positionEpochs.length, positionsBefore);
    assert.equal(h.frames.size, 0);
    h.leaveOrrery();
  });

for (const settlesBeforeShow of [false, true]) for (const animate of [true, false])
  test(`first System entry resumes ${settlesBeforeShow ? "after" : "before"} cancellation settles (${animate ? "animated" : "paused"})`, async t => {
    const h = await harness(t);
    h.setAnimate(animate);
    h.holdSnapshots();
    const obsolete = h.enterOrrery();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.bodies.length, 0);
    h.setHidden(true);
    if (settlesBeforeShow) await obsolete;
    h.setHidden(false);
    const current = h.enterOrrery();
    assert.equal(h.requests.length, 2, "visible recovery must request a fresh generation");
    h.completeSnapshot(0); // A terminated worker may still have an already queued event.
    await obsolete;
    await h.settle();
    assert.equal(h.state.entering, true, "obsolete completion must not release the current entry");
    assert.equal(h.state.bodies.length, 0);
    assert.equal(h.frames.size, 0);
    assert.equal(h.contexts, 0);
    assert.equal(h.enterOrrery(), current, "only current-generation entry calls coalesce");
    assert.equal(h.requests.length, 2);
    h.completeSnapshot(1);
    await current;
    assert.equal(h.state.entering, false);
    assert.equal(h.state.bodies.length, 9);
    assert.equal(h.state.engineError, "");
    assert.equal(h.nodes.orreryCanvas.style.display, "");
    assert.equal(h.nodes.orreryRetry.hidden, true);
    assert.ok(h.draws > 0);
    assert.equal(h.contexts, 1);
    assert.equal(h.frames.size, 1);
    h.setHidden(false);
    assert.equal(h.frames.size, 1, "repeated visible events cannot duplicate the loop");
    const unix = h.state.renderUnix;
    h.frame(1000);
    assert.equal(h.state.renderUnix, animate ? unix + 57.6 : unix);
    assert.equal(h.frames.size, animate ? 1 : 0);
    assert.deepEqual(h.errors, [], "cancelled entry is not a current initialization failure");
    h.leaveOrrery();
  });

test("late engine loading from a cancelled entry cannot clear or publish over its replacement", async t => {
  const h = await harness(t), releaseEngine = h.holdEngine();
  const obsolete = h.enterOrrery();
  await h.settle(); // First worker reply is ready, but shared WASM loading is still pending.
  h.setHidden(true);
  h.holdSnapshots();
  h.setWallUnix(1800000100);
  h.setHidden(false);
  const current = h.enterOrrery();
  assert.equal(h.requests.length, 2);
  releaseEngine();
  await obsolete;
  await h.settle();
  assert.equal(h.state.entering, true);
  assert.equal(h.state.bodies.length, 0, "cancelled entry's successful data must not publish");
  assert.equal(h.frames.size, 0);
  assert.equal(h.enterOrrery(), current);
  h.completeSnapshot(1);
  await current;
  assert.equal(h.state.renderUnix, 1800000100);
  assert.equal(h.state.metadataUnix, 1800000100);
  assert.equal(h.state.bodies.length, 9);
  assert.equal(h.state.entering, false);
  assert.equal(h.state.engineError, "");
  assert.equal(h.contexts, 1);
  assert.equal(h.frames.size, 1);
  h.leaveOrrery();
});
