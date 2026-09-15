import assert from 'node:assert/strict';
import test from 'node:test';
import { appearanceReference, appearanceReferences, appearanceUniforms } from '../../apps/web/js/planetAppearance.js';
import { moonAlbedoGain, moonBaseColor } from '../../apps/web/js/moonAppearance.js';
import { moonOffsetAU } from '../../apps/web/js/moonorbits.js';
import { srgbToLinear, linearToSrgb } from '../../apps/web/js/surfaceMapping.js';
import { orreryHarness } from './helpers/orreryHarness.mjs';

const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} differs from independent fixture ${expected}`);

// These are independently enumerated renderer routes, not a contract table imported
// from the implementation. Each row executes request, upload, draw and fallback.
// Breaks caught: Mercury sent to legacy shading; Io sent to grayscale; a mapped
// moon sent to the planet decode path; coverage premultiplication leaking between
// uploads; a source load or texture toggle changing fallback albedo/position.
const surfaceRoutes = [
  ['Mercury', 3, true], ['Venus', 3, true], ['Earth', 3, false], ['Mars', 3, true],
  ['Jupiter', 3, true], ['Saturn', 3, true], ['Uranus', 3, true], ['Neptune', 3, true], ['Moon', 3, false],
  ['Mimas', 4, false], ['Iapetus', 4, false], ['Enceladus', 4, false], ['Tethys', 4, false],
  ['Dione', 4, false], ['Rhea', 4, false], ['Phobos', 4, false],
  ['Io', 5, true], ['Europa', 4, true], ['Ganymede', 4, true], ['Callisto', 4, true],
];

function paint(h) {
  const first = h.gpuDraws.length;
  h.check('orreryTextures', h.state.useTextures);
  return h.gpuDraws.slice(first);
}

function loadImage(h, body, role = 'surface') {
  const asset = appearanceReference(body, role);
  assert.ok(asset, `${body}/${role} requires a qualified source`);
  const image = h.images.findLast(candidate => candidate.src === asset.path);
  assert.ok(image, `${body}/${role} was actually requested`);
  [image.width, image.height] = asset.dimensions;
  image.onload();
  const upload = h.textureRecords.findLast(record => record.pixels === image);
  assert.ok(upload, `${body}/${role} reached the real makeTexture upload boundary`);
  return { asset, image, upload };
}

function sameSurface(draws, reference) {
  const matches = draws.filter(draw => draw.uniforms.u_mode === 0
    && JSON.stringify(draw.uniforms.u_model) === JSON.stringify(reference.uniforms.u_model));
  assert.equal(matches.length, 1, 'one surface draw retains the same physical/display geometry');
  return matches[0];
}

test('every admitted surface reaches its color recipe and retains its own fallback through loading and disablement', async t => {
  assert.deepEqual(appearanceReferences().filter(asset => asset.role === 'surface').map(asset => asset.body).sort(),
    surfaceRoutes.map(([body]) => body).sort(), 'a newly admitted surface requires a route qualification fixture');
  const h = await orreryHarness(t, { controls: true, reducedMotion: true, catalogues: 'ready' });
  // The shared host gives unlisted GL constants a generic value; assign distinct
  // real enums so this fixture can detect an accidental sRGB-storage migration.
  Object.assign(h.gl, { RGBA: 0x1908, SRGB8_ALPHA8: 0x8c43, UNSIGNED_BYTE: 0x1401 });
  await h.enterOrrery(); t.after(() => h.leaveOrrery()); await h.settleCatalogues();
  h.check('orreryEarthNight', false); h.check('orreryEarthWeather', false);
  for (const [body, mode, premultiplied] of surfaceRoutes) {
    h.input('orreryAnchor', body, 'change');
    if (body === 'Venus') {
      // Visible light shows the cloud deck; the Magellan radar route is qualified as an opt-in layer.
      paint(h);
      assert.ok(!h.images.some(image => image.src === appearanceReference(body).path), 'Venus radar is not fetched by default');
      h.check('orreryVenusRadar', true);
    }
    const before = paint(h);
    const { upload } = loadImage(h, body);
    const loaded = paint(h).filter(draw => draw.uniforms.u_mode === 0
      && draw.uniforms.u_useTex === 1 && draw.textures.get(0) === upload.texture);
    assert.equal(loaded.length, 1, `${body}: its uploaded reference is bound to exactly one surface`);
    const draw = loaded[0], fallback = sameSurface(before, draw);
    assert.equal(draw.uniforms.u_texMode, mode, `${body}: the actual draw selects its color recipe`);
    assert.equal(draw.uniforms.u_style, -1, `${body}: no procedural substitute is selected`);
    assert.equal(draw.uniforms.u_atmosphereEnabled, 0,
      `${body}: unavailable numerical atmosphere resources cannot opt a display recipe into physical transport`);
    assert.equal(fallback.uniforms.u_useTex, 0, `${body}: pending reference has a usable fallback`);
    assert.deepEqual(draw.uniforms.u_base, fallback.uniforms.u_base, `${body}: upload cannot decode or renormalize shared u_base`);
    assert.equal(upload.pixelStore.get(h.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), premultiplied,
      `${body}: alpha is independently selected for each upload`);
    const filters = new Map(h.textureParameters.filter(record => record.texture === upload.texture).map(record => [record.name, record.value]));
    assert.equal(filters.get(h.gl.TEXTURE_MIN_FILTER), h.gl.LINEAR_MIPMAP_LINEAR);
    assert.equal(filters.get(h.gl.TEXTURE_MAG_FILTER), h.gl.LINEAR);
    assert.ok(h.mipmapTextures.includes(upload.texture));
    assert.equal(upload.args.length, 6, 'image upload uses the DOM-source overload');
    const linearFilter = body === 'Earth' || body === 'Moon';
    assert.equal(upload.args[2], linearFilter ? h.gl.SRGB8_ALPHA8 : h.gl.RGBA,
      'opaque primary maps decode before filtering; coverage and moon display recipes retain their reference filters');
    assert.equal(draw.uniforms.u_textureLinear, linearFilter ? 1 : 0,
      'a hardware-decoded source is never decoded again in the material');
    assert.equal(upload.args[3], h.gl.RGBA);
    assert.equal(upload.args[4], h.gl.UNSIGNED_BYTE);
    h.check('orreryTextures', false);
    const disabled = sameSurface(paint(h), draw);
    assert.equal(disabled.uniforms.u_useTex, 0);
    assert.deepEqual(disabled.uniforms.u_base, fallback.uniforms.u_base, `${body}: toggling does not alter albedo or source-derived fallback color`);
    h.check('orreryTextures', true);
    if (body === 'Venus') h.check('orreryVenusRadar', false);
  }
  assert.equal(h.errors.length, 0);
});

test('Earth display emission, cloud composites and scientific palette keep separate upload and sampler contracts', async t => {
  const h = await orreryHarness(t, { controls: true, reducedMotion: true });
  await h.enterOrrery(); t.after(() => h.leaveOrrery());
  h.input('orreryAnchor', 'Earth', 'change');
  const day = loadImage(h, 'Earth');
  const sourceRoles = [
    ['night-lights', 'u_earthNight', 'u_nightTex', 2, false, false],
    ['cloud-composite', 'u_earthWeather', 'u_weatherTex', 3, false, false],
    ['weather', 'u_earthWeather', 'u_weatherTex', 3, true, false],
    ['sea-ice', 'u_earthIce', 'u_iceTex', 4, false, true],
  ];
  for (const [role, flag, sampler, unit, premultiplied, palette] of sourceRoles) {
    if (role === 'weather') h.input('orreryEarthCloudSource', 'daily', 'change');
    if (role === 'sea-ice') h.check('orreryEarthIce', true);
    const { upload } = loadImage(h, 'Earth', role);
    const earth = paint(h).find(draw => draw.textures.get(0) === day.upload.texture && draw.uniforms.u_mode === 0);
    assert.ok(earth);
    assert.equal(earth.uniforms[flag], 1, `${role}: only a ready enabled source is admitted`);
    assert.equal(earth.uniforms[sampler], unit);
    assert.equal(earth.textures.get(unit), upload.texture);
    assert.equal(upload.pixelStore.get(h.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), premultiplied,
      `${role}: scientific alpha stays straight and emission is not treated as masked weather`);
    const filters = new Map(h.textureParameters.filter(record => record.texture === upload.texture).map(record => [record.name, record.value]));
    assert.equal(filters.get(h.gl.TEXTURE_MIN_FILTER), palette ? h.gl.NEAREST : h.gl.LINEAR_MIPMAP_LINEAR);
    assert.equal(filters.get(h.gl.TEXTURE_MAG_FILTER), palette ? h.gl.NEAREST : h.gl.LINEAR);
    assert.equal(h.mipmapTextures.includes(upload.texture), !palette);
  }
});

test('every catalogue moon without an admitted map keeps its display fallback and rejects Earth material state', async t => {
  const h = await orreryHarness(t, { controls: true, reducedMotion: true, catalogues: 'ready' });
  await h.enterOrrery(); t.after(() => h.leaveOrrery()); await h.settleCatalogues();
  h.check('orreryTrueScale', true);
  const unmapped = ['Deimos', 'Titan', 'Ariel', 'Umbriel', 'Titania', 'Oberon', 'Miranda', 'Triton', 'Nereid', 'Proteus'];
  assert.deepEqual(h.moons.filter(moon => !appearanceReference(moon.n)).map(moon => moon.n).sort(), [...unmapped].sort());
  for (const name of unmapped) {
    h.input('orreryAnchor', name, 'change'); h.state.radius = 1e-5;
    const moon = h.moons.find(moon => moon.n === name);
    const parent = h.state.bodies.find(body => body.name === moon.p);
    assert.ok(parent, `${name}: catalogue parent remains available`);
    // Use the existing position consumer to identify the draw, not to claim an
    // independent ephemeris check. This test observes material routing only.
    const offset = moonOffsetAU(moon, h.state.renderUnix);
    const position = [parent.x_au, parent.y_au, parent.z_au].map((value, i) => value + offset[i]);
    for (const textures of [false, true]) {
      h.check('orreryTextures', textures);
      const matches = paint(h).filter(draw => draw.uniforms.u_mode === 0
        && draw.uniforms.u_model?.slice(12, 15).every((value, i) => Math.abs(value - position[i]) < 1e-6));
      assert.equal(matches.length, 1, `${name}: locate its actual physical-position draw`);
      const u = matches[0].uniforms;
      assert.equal(u.u_useTex, 0); assert.equal(u.u_texMode, 0); assert.equal(u.u_style, -1);
      assert.equal(u.u_atmosphereEnabled, 0);
      assert.equal(u.u_earthNight, 0); assert.equal(u.u_earthWeather, 0); assert.equal(u.u_earthIce, 0);
      const [r, g, b] = u.u_base;
      assert.ok(r > 0 && g > 0 && b > 0, `${name}: fallback remains visible`);
      if (name === 'Titan') { near(r / b, 3, 5e-7); near(g / b, 2, 5e-7); }
      else { near(r, g, 1e-7); near(g, b, 1e-7); }
    }
  }
});

test('black and alpha no-data remain distinct API modes although no current reference declares black no-data', () => {
  const source = appearanceReference('Mercury');
  assert.equal(appearanceReferences().some(asset => asset.nodata === 'black'), false);
  assert.equal(appearanceUniforms({ ...source, nodata: 'none' }).nodata, 0);
  assert.equal(appearanceUniforms({ ...source, nodata: 'black' }).nodata, 1);
  assert.equal(appearanceUniforms({ ...source, nodata: 'alpha' }).nodata, 2);
  // Color transfer must not make valid dark material indistinguishable from a
  // separately declared no-data sentinel. This is not a source-coverage claim.
  near(srgbToLinear(1 / 255), 0.0003035269835488375);
});

test('independent high-contrast fixtures quantify why decode-after-filter is not a neutral sRGB migration', () => {
  // Equal opaque black/white texels. Current RGBA filtering produces encoded
  // 0.5, then the registered branch decodes; linear filtering would produce 0.5
  // in light and a much brighter encoded value. Expectations are hand-pinned.
  near(srgbToLinear(0.5), 0.21404114048223255);
  near(linearToSrgb(0.5), 0.7353569830524495);
  near((srgbToLinear(0) + srgbToLinear(1)) / 2, 0.5);
  assert.ok(linearToSrgb(0.5) - 0.5 > 0.23, 'filter-order changes are visibly material, not round-off');
  // With 50% covered WHITE and 50% transparent missing data, covered RGB is
  // white, alpha remains 0.5, and composition over black is linear 0.5. Decoding
  // the premultiplied 0.5 without first unpremultiplying would darken this edge.
  near(linearToSrgb(srgbToLinear(1) * 0.5), 0.7353569830524495);
  near(linearToSrgb(srgbToLinear(0.5) * 0.5), 0.3607802138332792);
});

test('published moon display gains cannot be reinterpreted as linear albedo or encoded a second time', () => {
  const bright = moonBaseColor({ n: 'Enceladus', col: [0.55, 0.55, 0.55] });
  const dark = moonBaseColor({ n: 'Phobos', col: [0.55, 0.55, 0.55] });
  for (const channel of bright) near(channel, 1);
  // Independently evaluated with 50-digit Decimal arithmetic: (0.06/1.04)^(1/2.2).
  for (const channel of dark) near(channel, 0.27344612776452043, 1e-10);
  near(moonAlbedoGain('Phobos') ** 2.2, 0.057692307692307696);
  assert.ok(Math.abs(srgbToLinear(dark[0]) - 0.057692307692307696) > 0.002,
    'the legacy power-2.2 display scale is an approximation, not exact piecewise sRGB radiometry');
  assert.ok(linearToSrgb(dark[0]) > 0.55,
    'encoding an already encoded moon display gain would substantially brighten the moon');
});
