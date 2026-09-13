import assert from "node:assert/strict";
import test from "node:test";
import { orreryHarness } from "./helpers/orreryHarness.mjs";
import { appearanceReferences } from '../../apps/web/js/planetAppearance.js';

function assertOnlyRegisteredImages(h) {
  assert.deepEqual(h.images.map(image => image.src).sort(), appearanceReferences().map(a => a.path).sort(),
    'Only separately registered dated references load; legacy held globe/ring/disk imagery stays blocked');
}

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
  assert.equal(h.state.radius, 1.2);
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
  assert.equal(h.state.anchor, "Io"); assert.equal(h.state.radius, 0.28);
  assert.match(h.nodes.orreryDetail.textContent, /JPL Horizons/);
  h.input("orrerySpeed", "1"); h.setAnimate(true); h.frame(100);
  assert.ok(h.state.moonsAliasedCount > 0);
  assert.match(h.nodes.orreryAccuracy.textContent, /under-sampled|under.sample|too fast|hidden/i);
  assert.match(h.nodes.orreryAccuracy.textContent, /Rotation display rate-limited/);
  h.setAnimate(false); h.input("orreryTime", "100");
  assert.match(h.nodes.orreryAccuracy.textContent, /Moons hidden/);
  assert.match(h.nodes.orrerySelectedEpoch.textContent, /position unavailable outside the moon table interval/);
  h.input("orreryAnchor", "Io", "change");
  assert.ok(h.state.radius >= 1.2, "outside the moon table, focus frames the parent rather than nonexistent coordinates");
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
