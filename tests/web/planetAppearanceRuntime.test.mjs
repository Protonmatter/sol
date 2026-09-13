import assert from "node:assert/strict";
import test from "node:test";
import { orreryHarness } from "./helpers/orreryHarness.mjs";
import { appearanceReference, appearanceReferences } from "../../apps/web/js/planetAppearance.js";
import { BODY } from "../../apps/web/js/bodyData.js";
import { MOONS } from "../../apps/web/js/moons.js";

const layers = [
  { role: "night-lights", control: "orreryEarthNight", flag: "u_earthNight", sampler: "u_nightTex", unit: 2 },
  { role: "weather", control: "orreryEarthWeather", flag: "u_earthWeather", sampler: "u_weatherTex", unit: 3 },
  { role: "sea-ice", control: "orreryEarthIce", flag: "u_earthIce", sampler: "u_iceTex", unit: 4 },
];

test('wide overview defers reference downloads until a mapped body has useful visible detail', async t => {
  const h = await orreryHarness(t, { controls:true, reducedMotion:true });
  await h.enterOrrery(); t.after(()=>h.leaveOrrery());
  assert.deepEqual(h.images.map(image=>image.src).sort(), ['Jupiter','Saturn'].map(body=>appearanceReference(body).path).sort(),
    'only the two visibly resolved giant planets need overview maps');
  h.input('orreryAnchor','Earth','change');
  assert.equal(h.images.filter(image=>image.src).length,2,'only two active image requests may start at once');
  assert.ok(h.images.filter(image=>image.src).every(image=>['surface','night-lights'].some(role=>appearanceReference('Earth',role).path===image.src)));
  assert.equal(h.state.appearanceStatus[appearanceReference('Earth','sea-ice').id],'deferred');
  assert.equal(h.state.appearanceStatus[appearanceReference('Earth','weather').id],'deferred');
});

async function start(t, options = {}) {
  const h = await orreryHarness(t, { controls: true, reducedMotion: true, ...options });
  await h.enterOrrery();
  t.after(() => h.leaveOrrery());
  assert.equal(h.state.engineError, "");
  // Existing swath/mask regressions explicitly select the observational source.
  if (options.source !== "default") h.input("orreryEarthCloudSource", "daily", "change");
  h.input('orreryAnchor','Earth','change');
  return h;
}

function sourceImage(h, body, role = "surface") {
  const asset = appearanceReference(body, role);
  assert.ok(asset, `${body} ${role} has a reviewed reference`);
  const image = h.images.findLast(candidate => candidate.src === asset.path);
  assert.ok(image, `renderer requested ${asset.path}`);
  return { asset, image };
}

function complete(h, body, role = "surface") {
  const { asset, image } = sourceImage(h, body, role);
  [image.width, image.height] = asset.dimensions;
  image.onload();
  return { asset, image, texture: h.textureRecords.findLast(record => record.pixels === image)?.texture };
}

function paint(h, action = () => h.check("orreryTextures", h.state.useTextures)) {
  const first = h.gpuDraws.length;
  action();
  return h.gpuDraws.slice(first);
}

function bodyDraw(h, draws, name = "Earth") {
  const body = h.state.bodies.find(body => body.name === name);
  const position = name === "Sun" ? [0, 0, 0] : [body.x_au, body.y_au, body.z_au];
  const matches = draws.filter(({ uniforms: u }) => u.u_mode === (name === "Sun" ? 1 : 0)
    && u.u_model?.slice(12, 15).every((value, i) => Math.abs(value - position[i]) < 1e-6));
  assert.equal(matches.length, 1, `${name} has one surface draw at its engine position`);
  return matches[0];
}

function assertFlags(draw, enabled) {
  for (const layer of layers) assert.equal(draw.uniforms[layer.flag], Number(enabled.includes(layer.role)), layer.role);
}

test("qualified catalogue moon maps share readiness, registration, albedo and eclipse boundaries", async t => {
  const h = await start(t, { catalogues: "ready" });
  await h.settleCatalogues();
  const assets = appearanceReferences().filter(a => MOONS.some(m => m.n === a.body));
  assert.ok(assets.length >= 6, "qualified Saturnian mosaics must reach the real renderer");
  const epoch = h.state.renderUnix, positions = JSON.stringify(h.state.bodies);
  for (const asset of assets) {
    h.input("orreryAnchor", asset.body, "change");
    const before = paint(h);
    const loaded = complete(h, asset.body);
    const matches = paint(h).filter(draw => draw.uniforms.u_useTex === 1 && draw.textures.get(0) === loaded.texture);
    assert.equal(matches.length, 1, `${asset.body}: exactly its own moon uses the source`);
    const draw = matches[0], u = draw.uniforms;
    assert.ok(Object.values(h.state.appearanceStatus).filter(status=>status==='ready').length<=8,
      'touring mapped moons cannot accumulate an unbounded GPU cache');
    const liveMaps = h.textureRecords.filter(record=>h.images.includes(record.pixels)&&!h.deletedTextures.includes(record.texture));
    assert.ok(liveMaps.length<=8,'eviction deletes real GPU texture handles before the ninth admission');
    assert.equal(u.u_texMode, 4);
    assert.equal(u.u_style, -1);
    assert.equal(u.u_mapNoData, {none:0,black:1,alpha:2}[asset.nodata]);
    assert.equal(u.u_map[0], asset.mapping.primeMeridianU);
    assert.equal(u.u_map[1], asset.mapping.longitudeDirection === 'east' ? 1 : -1);
    assertFlags(draw, []);
    assert.equal(u.u_moonShadowCount, 0);
    const prior = before.find(draw => JSON.stringify(draw.uniforms.u_model) === JSON.stringify(u.u_model));
    assert.ok(prior, "source load cannot change position, radius or fixed reference frame");
    assert.deepEqual(u.u_base, prior.uniforms.u_base, "source contrast keeps albedo and eclipse gain");
    assert.ok(paint(h, () => h.check("orreryTextures", false)).every(draw => draw.uniforms.u_useTex !== 1));
    h.check("orreryTextures", true);
  }
  assert.equal(h.state.renderUnix, epoch);
  assert.equal(JSON.stringify(h.state.bodies), positions);
  assert.equal(h.errors.length, 0);
  assert.ok(h.deletedTextures.length>=assets.length-8);
  const evicted = assets.find(asset=>h.state.appearanceStatus[asset.id]==='deferred');
  assert.ok(evicted,'a previously visited map outside current demand is evicted');
  h.input('orreryAnchor',evicted.body,'change');
  const reloaded = complete(h,evicted.body);
  assert.equal(h.state.appearanceStatus[evicted.id],'ready');
  assert.ok(paint(h).some(draw=>draw.textures.get(0)===reloaded.texture && draw.uniforms.u_texMode===4));
});

test("failed catalogue moon imagery retries explicitly and cannot be replaced by an unqualified legacy image", async t => {
  const h = await start(t, { catalogues: "ready" });
  await h.settleCatalogues();
  h.input("orreryAnchor", "Mimas", "change");
  const {asset, image} = sourceImage(h, "Mimas");
  image.onerror();
  assert.equal(h.state.appearanceStatus[asset.id], 'unavailable');
  assert.ok(paint(h).every(draw => draw.uniforms.u_useTex !== 1));
  const count = h.images.length;
  paint(h); assert.equal(h.images.length, count, 'ordinary frames never retry a failed source');
  h.check("orreryTextures", false); h.check("orreryTextures", true);
  const recovered = complete(h, "Mimas");
  assert.notEqual(recovered.image, image);
  assert.ok(paint(h).some(draw => draw.uniforms.u_texMode === 4 && draw.textures.get(0) === recovered.texture));
  assert.equal(h.state.engineError, '');
});

test("Earth defaults to the complete historical composite; swaths require an explicit source choice", async t => {
  const h = await start(t, { source: "default" });
  assert.equal(h.state.earthCloudSource, "composite");
  complete(h, "Earth");
  const reference = complete(h, "Earth", "cloud-composite");
  assert.ok(!h.images.some(image=>image.src===appearanceReference('Earth','weather').path));
  const epoch = h.state.renderUnix, bodies = JSON.stringify(h.state.bodies);
  assert.equal(bodyDraw(h, paint(h)).textures.get(3), reference.texture);
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /2002/);
  assert.doesNotMatch(h.nodes.orreryEarthLayerStatus.textContent, /12 September 2026/);
  h.input("orreryEarthCloudSource", "daily", "change");
  const daily = complete(h, "Earth", "weather");
  assert.equal(bodyDraw(h, paint(h)).textures.get(3), daily.texture);
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /12 September 2026/);
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /swath.*gaps|gaps.*swath/i);
  h.input("orreryEarthCloudSource", "composite", "change");
  assert.equal(bodyDraw(h, paint(h)).textures.get(3), reference.texture);
  h.input("orreryEarthCloudSource", "invalid", "change");
  assert.equal(h.state.earthCloudSource, "composite");
  assert.equal(h.nodes.orreryEarthCloudSource.value, "composite");
  assert.equal(h.state.renderUnix, epoch);
  assert.equal(JSON.stringify(h.state.bodies), bodies);
});

test("missing selected composite never silently substitutes dated swaths", async t => {
  const h = await start(t, { source: "default" });
  complete(h, "Earth");
  const reference = sourceImage(h, "Earth", "cloud-composite");
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 0, "pending composite does not use available daily swaths");
  reference.image.onerror();
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 0);
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /2002.*unavailable/);
  h.input("orreryEarthCloudSource", "daily", "change");
  complete(h, 'Earth', 'weather');
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 1);
  h.input("orreryEarthCloudSource", "composite", "change");
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 0);
  h.check("orreryTextures", false); h.check("orreryTextures", true);
  const recovered = complete(h, "Earth", "cloud-composite");
  assert.equal(bodyDraw(h, paint(h)).textures.get(3), recovered.texture);
  assert.equal(h.state.engineError, "");
});

test("explicit daily imagery rejects a late cancelled composite without substituting another source", async t => {
  const h = await start(t, {source:'default'});
  complete(h, "Earth");
  const epoch = h.state.renderUnix, bodies = JSON.stringify(h.state.bodies);
  const composite = sourceImage(h,'Earth','cloud-composite');
  const lateLoad = composite.image.onload;
  [composite.image.width,composite.image.height] = composite.asset.dimensions;
  h.input('orreryEarthCloudSource','daily','change');
  const daily = sourceImage(h, "Earth", "weather");
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 0);
  const uploads = h.textureRecords.length;
  lateLoad();
  assert.equal(h.textureRecords.length,uploads,'cancelled decode never uploads');
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 0, "late completion of an unselected source cannot replace the selection");
  daily.image.onerror();
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 0);
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /12 September 2026.*unavailable/);
  assert.doesNotMatch(h.nodes.orreryEarthLayerStatus.textContent, /2002/);
  h.input("orreryEarthCloudSource", "composite", "change");
  complete(h,'Earth','cloud-composite');
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 1);
  h.input("orreryEarthCloudSource", "daily", "change");
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_earthWeather, 0);
  assert.equal(h.state.renderUnix, epoch);
  assert.equal(JSON.stringify(h.state.bodies), bodies);
});

test("registered references load from reviewed local paths; pending imagery is disclosed without changing the engine", async t => {
  const h = await start(t);
  assert.ok(h.images.filter(image=>image.src).every(image=>appearanceReferences().some(asset=>asset.path===image.src)));
  assert.equal(Object.values(h.state.appearanceStatus).filter(status=>status==='loading').length,2);
  assert.equal(h.state.appearanceStatus[appearanceReference('Earth','weather').id],'queued');
  assert.equal(h.state.appearanceStatus[appearanceReference('Earth','sea-ice').id],'deferred');
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /loading/i);
  assert.equal(h.nodes.orreryIceLegend.hidden, true);
  assert.equal(h.state.sunImageUnix, null, "reference loading cannot invent a solar observation epoch");
  const draw = bodyDraw(h, paint(h));
  assert.equal(draw.uniforms.u_useTex, 0);
  assertFlags(draw, []);
  assert.equal(h.errors.length, 0);
});

test("Earth dispatches registered land, night lights, weather and ice only to its own sphere", async t => {
  const h = await start(t, { catalogues: "ready" });
  await h.settleCatalogues();
  const epoch = h.state.renderUnix, positions = JSON.stringify(h.state.bodies);
  h.check("orreryEarthIce", true);
  const day = complete(h, "Earth"), loaded = new Map();
  for (const layer of layers) loaded.set(layer.role, complete(h, "Earth", layer.role));
  h.input('orreryAnchor','Mars','change');
  const mars = complete(h, "Mars");
  h.input('orreryAnchor','Earth','change');
  h.check("orreryEarthIce", true);
  assert.equal(h.nodes.orreryIceLegend.hidden, false);
  assert.ok(h.nodes.orreryIceLegendCaption.textContent.includes(appearanceReference("Earth", "sea-ice").observation_label));
  const draws = paint(h), earth = bodyDraw(h, draws);
  assert.equal(earth.uniforms.u_useTex, 1);
  assert.equal(earth.uniforms.u_texMode, 3);
  assert.equal(earth.textures.get(0), day.texture);
  assert.deepEqual(earth.uniforms.u_map, [0.5, 1, 2, 0], "Earth grid uses Greenwich center, east-positive longitude and geodetic latitude");
  assert.deepEqual(earth.uniforms.u_mapWindow, [1, 1, 0, 0], "the complete source extent survives upload");
  for (const [index, value] of [-Math.PI / 2, Math.PI / 2, -Math.PI / 2, Math.PI / 2].entries()) {
    assert.ok(Math.abs(earth.uniforms.u_mapLat[index] - value) < 1e-6);
  }
  assert.equal(earth.uniforms.u_mapNoData, 0);
  assert.ok(Math.abs(earth.uniforms.u_oblate - BODY.Earth.polarKm / BODY.Earth.radiusKm) < 1e-12);
  assertFlags(earth, layers.map(layer => layer.role));
  for (const layer of layers) {
    assert.equal(earth.uniforms[layer.sampler], layer.unit);
    assert.equal(earth.textures.get(layer.unit), loaded.get(layer.role).texture);
    assert.equal(h.state.appearanceStatus[loaded.get(layer.role).asset.id], "ready");
  }
  for (const name of ["Sun", "Mercury", "Venus", "Mars", "Moon", "Jupiter", "Saturn", "Uranus", "Neptune"]) {
    assertFlags(bodyDraw(h, draws, name), []);
  }
  const marsDraw = bodyDraw(h, draws, "Mars");
  assert.equal(marsDraw.textures.get(0), mars.texture);
  assert.equal(marsDraw.uniforms.u_mapNoData, 2, "the source's admitted coverage mask reaches its shader");
  h.input("orreryAnchor", "Jupiter", "change");
  h.state.radius = 0.1;
  const close = paint(h, () => h.check("orreryTrueScale", true));
  const moonDraws = close.filter(({ uniforms: u }) => u.u_mode === 0 && u.u_nmat?.every((v, i) => v === Number(i % 4 === 0)));
  assert.ok(moonDraws.length >= 4, "real loaded Galilean moon draws exercise shared-program cleanup");
  for (const moon of moonDraws) assertFlags(moon, []);
  assert.equal(h.state.renderUnix, epoch);
  assert.equal(JSON.stringify(h.state.bodies), positions);
  assert.equal(h.errors.length, 0);
});

test("layer toggles update dispatch and dates immediately; the global reference toggle clears every Earth sampler", async t => {
  const h = await start(t);
  h.check("orreryEarthIce", true);
  complete(h, "Earth");
  for (const layer of layers) complete(h, "Earth", layer.role);
  h.check("orreryEarthIce", true);
  const epoch = h.state.renderUnix;
  for (const layer of layers) {
    const off = bodyDraw(h, paint(h, () => h.check(layer.control, false)));
    assertFlags(off, layers.filter(other => other !== layer).map(other => other.role));
    assert.ok(!h.nodes.orreryEarthLayerStatus.textContent.includes(appearanceReference("Earth", layer.role).label));
    const on = bodyDraw(h, paint(h, () => h.check(layer.control, true)));
    assertFlags(on, layers.map(other => other.role));
    assert.ok(h.nodes.orreryEarthLayerStatus.textContent.includes(appearanceReference("Earth", layer.role).observation_label));
  }
  const disabled = bodyDraw(h, paint(h, () => h.check("orreryTextures", false)));
  assert.equal(disabled.uniforms.u_useTex, 0);
  assertFlags(disabled, []);
  for (const layer of layers) assert.equal(disabled.textures.get(layer.unit), disabled.textures.get(0), "disabled auxiliary sampler uses the same white fallback");
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /switched off/);
  assert.equal(h.nodes.orreryIceLegend.hidden, true);
  assertFlags(bodyDraw(h, paint(h, () => h.check("orreryTextures", true))), layers.map(layer => layer.role));
  const referenceDates = h.nodes.orreryEarthLayerStatus.textContent;
  h.input("orreryTime", "2"); await h.settle();
  assert.notEqual(h.state.renderUnix, epoch);
  assert.equal(h.nodes.orreryEarthLayerStatus.textContent, referenceDates, "model time never relabels imagery as new weather");
  for (const layer of layers) h.check(layer.control, false);
  assertFlags(bodyDraw(h, paint(h)), []);
});

test("missing Earth base imagery withholds auxiliary maps; one failed layer does not disable another", async t => {
  const h = await start(t);
  h.check("orreryEarthIce", true);
  complete(h, "Earth", "night-lights");
  const weather = sourceImage(h, "Earth", "weather");
  weather.image.onerror();
  complete(h, "Earth", "sea-ice");
  assert.equal(h.state.appearanceStatus[weather.asset.id], "unavailable");
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /unavailable/);
  assertFlags(bodyDraw(h, paint(h)), [], "a missing registered base cannot supply implicit Earth coordinates");
  const day = sourceImage(h, "Earth");
  day.image.onerror();
  assert.equal(h.state.appearanceStatus[day.asset.id], "unavailable");
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_useTex, 0);
  assert.match(h.nodes.orreryInsight.textContent, /reference images are unavailable/);
  assert.equal(h.state.engineError, "", "optional image failures do not invalidate accepted positions");
  h.event("orreryCanvas", "webglcontextlost");
  h.event("orreryCanvas", "webglcontextrestored"); await h.settle();
  complete(h, "Earth"); complete(h, "Earth", "night-lights");
  sourceImage(h, "Earth", "weather").image.onerror();
  assertFlags(bodyDraw(h, paint(h)), ["night-lights"]);
  assert.equal(h.errors.length, 0);
});

test("reference toggle retries only failed uploads and rejects callbacks from replaced attempts", async t => {
  const h = await start(t);
  const day = complete(h, "Earth"), weather = sourceImage(h, "Earth", "weather");
  const pendingNight = sourceImage(h, "Earth", "night-lights");
  const oldLoad = weather.image.onload, oldError = weather.image.onerror;
  [weather.image.width, weather.image.height] = weather.asset.dimensions;
  oldError();
  const count = h.images.length, epoch = h.state.renderUnix, bodies = JSON.stringify(h.state.bodies);
  paint(h); paint(h);
  assert.equal(h.images.length, count, "ordinary scene frames do not retry failed files");
  h.check("orreryTextures", false); h.check("orreryTextures", true);
  assert.equal(h.images.filter(image=>image.src===weather.asset.path).length,1, "one explicit toggle retries the failed asset after releasing its failed Image");
  assert.notEqual(sourceImage(h, "Earth", "weather").image, weather.image);
  assert.equal(sourceImage(h, "Earth").image, day.image, "ready maps remain cached");
  assert.notEqual(sourceImage(h, "Earth", "night-lights").image, pendingNight.image, "disabled pending layers restart only when re-enabled");
  assert.equal(h.state.appearanceStatus[weather.asset.id], "loading");
  const uploads = h.textureRecords.length;
  oldLoad(); oldError();
  assert.equal(h.textureRecords.length, uploads, "obsolete source callbacks cannot upload or leak a texture");
  assert.equal(h.state.appearanceStatus[weather.asset.id], "loading");
  const recovered = complete(h, "Earth", "weather");
  const readyUploads = h.textureRecords.length;
  recovered.image.onload(); recovered.image.onerror(); oldError();
  assert.equal(h.textureRecords.length, readyUploads, "completed requests settle once");
  assert.equal(h.state.appearanceStatus[weather.asset.id], "ready");
  complete(h, "Earth", "night-lights");
  assert.equal(h.state.appearanceStatus[pendingNight.asset.id], "ready");
  assertFlags(bodyDraw(h, paint(h)), ["night-lights", "weather"]);
  assert.equal(h.state.renderUnix, epoch);
  assert.equal(JSON.stringify(h.state.bodies), bodies);
});

test("returning to the view retries a failed image without restarting pending or ready references", async t => {
  const h = await start(t);
  const pendingDay = sourceImage(h, "Earth"), night = complete(h, "Earth", 'night-lights');
  const failed = sourceImage(h, "Earth", 'weather');
  failed.image.onerror();
  const count = h.images.length;
  h.leaveOrrery(); await h.enterOrrery();
  assert.equal(h.images.length, count + 1);
  assert.equal(sourceImage(h, "Earth").image, pendingDay.image);
  assert.equal(sourceImage(h, "Earth", 'night-lights').image, night.image);
  assert.equal(h.state.appearanceStatus[failed.asset.id], "loading");
  complete(h, "Earth", 'weather'); complete(h, "Earth");
  assert.equal(h.state.appearanceStatus[failed.asset.id], "ready");
  assert.equal(h.state.appearanceStatus[pendingDay.asset.id], "ready");
});

test("mapped failure notices follow recovery without deleting independent navigation or legacy hints", async t => {
  const h = await start(t);
  const base = "Navigation hint. (A separate legacy image is unavailable.)";
  h.nodes.orreryInsight.textContent = base;
  complete(h,'Earth');
  const weather = sourceImage(h, "Earth", "weather"), night = sourceImage(h, "Earth", 'night-lights');
  weather.image.onerror(); night.image.onerror();
  assert.match(h.nodes.orreryInsight.textContent, /reference images are unavailable/);
  h.check("orreryTextures", false); h.check("orreryTextures", true);
  complete(h, "Earth", "weather"); sourceImage(h, "Earth", 'night-lights').image.onerror();
  assert.match(h.nodes.orreryInsight.textContent, /reference images are unavailable/, "one remaining failed map must stay disclosed");
  h.check("orreryTextures", false); h.check("orreryTextures", true);
  complete(h, "Earth", 'night-lights');
  assert.ok(!Object.values(h.state.appearanceStatus).includes('unavailable'));
  assert.equal(h.nodes.orreryInsight.textContent, base, "only the recovered mapped-failure notice is removed");
});

test("context loss invalidates late source callbacks and restores only the new generation", async t => {
  const h = await start(t);
  const staleDay = sourceImage(h, "Earth"), staleNight = sourceImage(h, "Earth", "night-lights");
  [staleDay.image.width, staleDay.image.height] = staleDay.asset.dimensions;
  const staleLoad = staleDay.image.onload, staleFailure = staleNight.image.onerror;
  const before = h.textureRecords.length;
  h.event("orreryCanvas", "webglcontextlost");
  for (const stale of [staleDay,staleNight]) {
    assert.equal(stale.image.onload,null); assert.equal(stale.image.onerror,null); assert.equal(stale.image.src,'');
  }
  assert.ok(Object.values(h.state.appearanceStatus).every(status => status === "unavailable"));
  const lostStatus = JSON.stringify(h.state.appearanceStatus);
  staleLoad(); staleFailure();
  assert.equal(h.textureRecords.length, before);
  assert.equal(JSON.stringify(h.state.appearanceStatus), lostStatus, "late callbacks cannot replace the context-loss disclosure");
  h.event("orreryCanvas", "webglcontextrestored"); await h.settle();
  const rebuilt = h.textureRecords.length;
  staleLoad(); staleFailure();
  assert.equal(h.textureRecords.length, rebuilt, "old bitmaps cannot upload into a replacement context");
  assert.equal(h.state.appearanceStatus[staleDay.asset.id], "loading");
  assert.equal(h.state.appearanceStatus[staleNight.asset.id], "loading");
  assert.equal(h.state.appearanceStatus[appearanceReference('Earth','sea-ice').id],'deferred');
  assert.equal(h.state.appearanceStatus[appearanceReference('Earth','cloud-composite').id],'deferred');
  complete(h, "Earth"); complete(h, "Earth", "night-lights"); complete(h, "Earth", "weather");
  staleFailure();
  assert.equal(h.state.appearanceStatus[staleNight.asset.id], "ready");
  assertFlags(bodyDraw(h, paint(h)), ["night-lights", "weather"]);
  assert.equal(h.warnings.length, 0, "obsolete failures must not publish a false unavailable notice");
});

test("4096 texture limit resamples the complete 5400-pixel Earth extent and preserves map registration", async t => {
  const h = await start(t, { maxTextureSize: 4096 });
  const { image, asset } = complete(h, "Earth");
  const resample = h.canvasCommands.filter(command => command.method === "drawImage" && command.args[0] === image);
  assert.equal(resample.length, 1);
  assert.deepEqual(resample[0].args.slice(1), [0, 0, 4096, 2048], "five-argument drawImage scales the full source without a crop");
  const canvas = resample[0].canvas;
  assert.equal(canvas.width, 4096); assert.equal(canvas.height, 2048);
  const upload = h.textureRecords.find(record => record.pixels === canvas);
  assert.ok(upload);
  assert.equal(h.state.appearanceStatus[asset.id], "ready");
  const draw = bodyDraw(h, paint(h));
  assert.equal(draw.textures.get(0), upload.texture);
  assert.deepEqual(draw.uniforms.u_mapWindow, [1, 1, 0, 0]);
  assert.equal(draw.uniforms.u_texMode, 3);
});

test("GPU upload errors delete the rejected image and keep its reference unavailable", async t => {
  const h = await start(t);
  const pending = sourceImage(h,'Earth'), staleLoad = pending.image.onload, staleError = pending.image.onerror;
  h.setTextureUploadError(h.gl.OUT_OF_MEMORY);
  const { asset, texture } = complete(h, "Earth");
  assert.ok(texture, "the WebGL boundary received an upload before reporting its error");
  assert.ok(h.deletedTextures.includes(texture));
  assert.equal(h.state.appearanceStatus[asset.id], "unavailable");
  assert.equal(pending.image.onload,null); assert.equal(pending.image.onerror,null); assert.equal(pending.image.src,'');
  const uploads = h.textureRecords.length, warnings = h.warnings.length;
  staleLoad(); staleError();
  assert.equal(h.textureRecords.length,uploads); assert.equal(h.warnings.length,warnings);
  const rejected = bodyDraw(h, paint(h));
  assert.equal(rejected.uniforms.u_useTex, 0);
  assert.notEqual(rejected.textures.get(0), texture);
  assertFlags(rejected, []);
  h.setTextureUploadError(0);
  h.input('orreryAnchor','Mars','change');
  const mars = complete(h, "Mars");
  assert.equal(h.state.appearanceStatus[mars.asset.id], "ready", "a failed Earth upload does not prevent other sources rendering");
  assert.equal(bodyDraw(h, paint(h), "Mars").textures.get(0), mars.texture);
  assert.equal(h.state.engineError, "");
});

test("sea ice retains nearest sampling and no mipmaps, while display imagery retains linear filtering", async t => {
  const h = await start(t);
  h.check('orreryEarthNight',false); h.check('orreryEarthWeather',false); h.check('orreryEarthIce',true);
  const day = complete(h, "Earth"), ice = complete(h, "Earth", "sea-ice");
  const filters = texture => new Map(h.textureParameters.filter(record => record.texture === texture).map(record => [record.name, record.value]));
  const scientific = filters(ice.texture), photographic = filters(day.texture);
  assert.equal(scientific.get(h.gl.TEXTURE_MIN_FILTER), h.gl.NEAREST);
  assert.equal(scientific.get(h.gl.TEXTURE_MAG_FILTER), h.gl.NEAREST);
  assert.ok(!h.mipmapTextures.includes(ice.texture), "averaged scientific palette colors would not match the legend");
  assert.equal(photographic.get(h.gl.TEXTURE_MIN_FILTER), h.gl.LINEAR_MIPMAP_LINEAR);
  assert.equal(photographic.get(h.gl.TEXTURE_MAG_FILTER), h.gl.LINEAR);
  assert.ok(h.mipmapTextures.includes(day.texture));
  assert.equal(scientific.get(h.gl.TEXTURE_WRAP_S), h.gl.REPEAT);
  assert.equal(scientific.get(h.gl.TEXTURE_WRAP_T), h.gl.CLAMP_TO_EDGE);
});

test("masked reference uploads premultiply coverage and reset that state for each subsequent image", async t => {
  const h = await start(t);
  h.check('orreryEarthNight',false); h.check('orreryEarthWeather',true); h.check('orreryEarthIce',false);
  const order = [["Earth", "weather", true], ["Earth", "surface", false], ["Mars", "surface", true]];
  for (const sequence of [order, [...order].reverse()]) {
    if (sequence !== order) {
      h.event("orreryCanvas", "webglcontextlost");
      h.event("orreryCanvas", "webglcontextrestored"); await h.settle();
    }
    for (const [body, role, expected] of sequence) {
      h.input('orreryAnchor',body,'change');
      const { image, asset } = complete(h, body, role);
      const upload = h.textureRecords.findLast(record => record.pixels === image);
      assert.ok(upload);
      assert.equal(upload.pixelStore.get(h.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), expected,
        `${body} ${role} upload must set its own alpha convention regardless of previous source completion`);
      assert.equal(upload.pixelStore.get(h.gl.UNPACK_FLIP_Y_WEBGL), false, "north-top geographic source rows must not flip during alpha correction");
      assert.equal(h.state.appearanceStatus[asset.id], "ready");
    }
  }
  assertFlags(bodyDraw(h, paint(h)), ["weather"]);
  assert.equal(h.errors.length, 0);
});

test("an oversized scientific palette fails closed instead of creating interpolated ice classes", async t => {
  const h = await start(t, { maxTextureSize: 1024 });
  h.check('orreryEarthNight',false); h.check('orreryEarthWeather',false); h.check('orreryEarthIce',true);
  complete(h, "Earth");
  const before = h.textureRecords.length;
  const ice = complete(h, "Earth", "sea-ice");
  assert.equal(h.state.appearanceStatus[ice.asset.id], "unavailable");
  assert.equal(h.textureRecords.length, before, "unsupported scientific grid is rejected before GPU upload");
  assert.ok(!h.canvasCommands.some(command => command.method === "drawImage" && command.args[0] === ice.image));
  assertFlags(bodyDraw(h, paint(h, () => h.check("orreryEarthIce", true))), []);
  assert.match(h.nodes.orreryEarthLayerStatus.textContent, /unavailable/);
});

test("unavailable downsampling canvas leaves a smaller GPU usable with an explicit reference fallback", async t => {
  const h = await start(t, { maxTextureSize: 4096, canvas2dUnavailable: true });
  const before = h.textureRecords.length;
  const day = complete(h, "Earth");
  assert.equal(h.state.appearanceStatus[day.asset.id], "unavailable");
  assert.equal(h.textureRecords.length, before);
  assert.equal(bodyDraw(h, paint(h)).uniforms.u_useTex, 0);
  assert.equal(h.state.engineError, "");
  assert.equal(h.errors.length, 0);
});

test('decoded source dimensions must match the pinned grid before allocating GPU memory', async t => {
  const h = await start(t);
  const {asset,image} = sourceImage(h,'Earth');
  [image.width,image.height] = [asset.dimensions[0]*2,asset.dimensions[1]*2];
  const before = h.textureRecords.length;
  image.onload();
  assert.equal(h.textureRecords.length,before);
  assert.equal(h.state.appearanceStatus[asset.id],'unavailable');
  assert.equal(image.onload,null); assert.equal(image.onerror,null); assert.equal(image.src,'');
});

test('disabled optional layers never fetch; a queued ice choice can be withdrawn before a slot opens', async t => {
  const h = await start(t,{source:'default'});
  h.check('orreryEarthIce',true);
  assert.equal(h.state.appearanceStatus[appearanceReference('Earth','sea-ice').id],'queued');
  h.check('orreryEarthIce',false);
  h.check('orreryEarthWeather',false);
  h.input('orreryEarthCloudSource','daily','change');
  complete(h,'Earth'); complete(h,'Earth','night-lights');
  for (const role of ['weather','cloud-composite','sea-ice']) {
    assert.ok(!h.images.some(image=>image.src===appearanceReference('Earth',role).path),`${role} stays unfetched`);
    assert.equal(h.state.appearanceStatus[appearanceReference('Earth',role).id],'deferred');
  }
  h.check('orreryEarthWeather',true);
  const daily = complete(h,'Earth','weather');
  assert.equal(bodyDraw(h,paint(h)).textures.get(3),daily.texture);
  h.check('orreryEarthIce',true);
  complete(h,'Earth','sea-ice');
  assertFlags(bodyDraw(h,paint(h)),['night-lights','weather','sea-ice']);
});

test('inactive or disabled views cannot upload a late image; galaxy views request no surface maps', async t => {
  const h = await start(t);
  const day = sourceImage(h,'Earth'), late = day.image.onload;
  [day.image.width,day.image.height] = day.asset.dimensions;
  const uploads = h.textureRecords.length;
  h.leaveOrrery(); late();
  assert.equal(h.textureRecords.length,uploads);
  await h.enterOrrery();
  const active = sourceImage(h,'Earth'), cancelled = active.image.onload;
  [active.image.width,active.image.height] = active.asset.dimensions;
  h.check('orreryTextures',false); cancelled();
  assert.equal(h.textureRecords.length,uploads);
  assert.ok(!Object.values(h.state.appearanceStatus).includes('loading'));
  h.state.galaxy = true; h.check('orreryTextures',true);
  assert.ok(!Object.values(h.state.appearanceStatus).includes('loading'));
  h.state.galaxy = false; paint(h);
  assert.equal(Object.values(h.state.appearanceStatus).filter(status=>status==='loading').length,2);
});
