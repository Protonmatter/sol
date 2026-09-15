import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SURFACE_MAPPING, NIGHT_LIGHT_FULL_COSINE, surfaceUv,
  srgbToLinear, linearToSrgb, nightLightWeight } from "../../apps/web/js/surfaceMapping.js";

const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} differs from ${expected}`);

test("default surface mapping is immutable and fixes the prime meridian, directions and poles", () => {
  assert.ok(Object.isFrozen(DEFAULT_SURFACE_MAPPING));
  assert.ok(Object.isFrozen(DEFAULT_SURFACE_MAPPING.latitudeBounds));
  assert.ok(Object.isFrozen(DEFAULT_SURFACE_MAPPING.uvScale));
  assert.ok(Object.isFrozen(DEFAULT_SURFACE_MAPPING.uvOffset));
  assert.throws(() => { DEFAULT_SURFACE_MAPPING.latitudeBounds[0] = -60; }, TypeError);
  for (const [position, expected] of [
    [[1, 0, 0], [.5, .5]], [[0, 1, 0], [.75, .5]], [[0, -1, 0], [.25, .5]],
    [[-1, 0, 0], [0, .5]], [[-1, -0, 0], [0, .5]], [[0, 0, 1], [.5, 0]], [[0, 0, -1], [.5, 1]],
  ]) {
    const result = surfaceUv(position);
    near(result.u, expected[0]); near(result.v, expected[1]); assert.equal(result.inCoverage, true);
  }
});

test("asymmetric longitude anchors detect mirrored maps and a half-turn registration error", () => {
  const anchors = [[[1, 0, 0], .5], [[0, 1, 0], .75], [[0, -1, 0], .25]];
  const verify = config => { for (const [position, expected] of anchors) near(surfaceUv(position, config).u, expected); };
  verify(DEFAULT_SURFACE_MAPPING);
  assert.throws(() => verify({ longitudeDirection: "west" }), assert.AssertionError);
  assert.throws(() => verify({ primeMeridianU: 0 }), assert.AssertionError);
  near(surfaceUv([0, 1, 0], { longitudeDirection: "west" }).u, .25);
  near(surfaceUv([0, 1, 0], { primeMeridianU: 0 }).u, .25);
  near(surfaceUv([1, 0, 0], { primeMeridianU: 1 }).u, 0);
});

test("the longitude seam wraps without changing latitude or folding hemispheres", () => {
  const left = surfaceUv([-1, -1e-8, .5]), right = surfaceUv([-1, 1e-8, .5]);
  assert.ok(left.u < 1e-8); assert.ok(right.u > 1 - 1e-8);
  near(left.v, right.v);
  near(Math.min(Math.abs(left.u - right.u), 1 - Math.abs(left.u - right.u)), 1e-8 / Math.PI, 1e-14);
  const south = surfaceUv([-1, 1e-8, -.5]);
  near(right.v + south.v, 1); assert.ok(right.v < .5 && south.v > .5);
});

test("ellipsoid latitude distinguishes parametric, planetocentric and planetographic coordinates", () => {
  // Independent analytic anchors: q=.5 and object position (1,0,.5) give
  // geographic atan(1)=45deg, parametric atan(.5), and centric atan(.25).
  const p = [1, 0, .5], q = .5;
  near(surfaceUv(p, { latitudeType: "planetographic" }, q).v, .25);
  near(surfaceUv(p, { latitudeType: "parametric" }, q).v, (90 - 26.56505117707799) / 180);
  near(surfaceUv(p, { latitudeType: "planetocentric" }, q).v, (90 - 14.036243467926479) / 180);
  near(surfaceUv([1, 0, 2], { latitudeType: "planetocentric" }, q).v, .25);
  near(surfaceUv([1, 0, -.5], { latitudeType: "planetographic" }, q).v, .75);
  for (const latitudeType of ["parametric", "planetocentric", "planetographic"]) {
    near(surfaceUv([1, 0, 1], { latitudeType }, 1).v, .25);
    near(surfaceUv([0, 0, 1], { latitudeType }, q).v, 0);
    near(surfaceUv([0, 0, -1], { latitudeType }, q).v, 1);
  }
});

test("partial latitude coverage never clamps a missing cap onto edge pixels", () => {
  const config = { latitudeBounds: [-45, 45] };
  for (const [position, v] of [[[1, 0, 1], 0], [[1, 0, 0], .5], [[1, 0, -1], 1]]) {
    const result = surfaceUv(position, config); near(result.v, v); assert.equal(result.inCoverage, true);
  }
  const north = surfaceUv([0, 0, 1], config), south = surfaceUv([0, 0, -1], config);
  assert.equal(north.inCoverage, false); near(north.v, -.5);
  assert.equal(south.inCoverage, false); near(south.v, 1.5);
  const asymmetric = { latitudeBounds: [-30, 90] };
  near(surfaceUv([1, 0, 0], asymmetric).v, .75);
});

test("mapping is scale invariant for typed vectors and large or tiny finite coordinates", () => {
  const expected = surfaceUv([1, -1, 1]);
  for (const position of [new Float32Array([2, -2, 2]), [1e308, -1e308, 1e308], [1e-300, -1e-300, 1e-300]]) {
    const actual = surfaceUv(position); near(actual.u, expected.u); near(actual.v, expected.v);
  }
});

test("pixel-center affine windows preserve registration and mark uncovered seams instead of wrapping", () => {
  const padded = {uvScale: [.8, .5], uvOffset: [.1, .25]};
  near(surfaceUv([1, 0, 0], padded).u, .5); near(surfaceUv([0, 0, 1], padded).v, .25);
  near(surfaceUv([0, 0, -1], padded).v, .75);
  // A slightly shorter-than-360-degree source grid (the admitted Venus map)
  // must leave its tiny missing seam uncovered instead of sampling the opposite edge.
  const missingEdge = surfaceUv([-1, 1e-6, 0], {uvScale: [1.0000047158519485, 1], uvOffset: [0, 0]});
  assert.ok(missingEdge.u > 1); assert.equal(missingEdge.inCoverage, false);
  const cropped = surfaceUv([-1, -1e-6, 0], {uvScale: [1, 1], uvOffset: [-.01, 0]});
  assert.ok(cropped.u < 0); assert.equal(cropped.inCoverage, false);
  for (const config of [{uvScale: [0, 1]}, {uvScale: [-1, 1]}, {uvScale: [Infinity, 1]}, {uvScale: [1]},
    {uvOffset: [1, 0]}, {uvOffset: [-1, 0]}, {uvOffset: [NaN, 0]}, {uvOffset: [true, 0]}, {uvOffset: null}])
    assert.throws(() => surfaceUv([1, 0, 0], config), /UV/);
});

test("mapping rejects invalid vectors, axes, configuration and unknown conventions", () => {
  for (const position of [null, [], [0, 0, 0], [1, 2], [1, 2, 3, 4], [1, NaN, 0], [1, Infinity, 0], [true, 0, 0], "123"])
    assert.throws(() => surfaceUv(position), /position/);
  for (const axisRatio of [0, -1, NaN, Infinity, true, "1"])
    assert.throws(() => surfaceUv([1, 0, 0], DEFAULT_SURFACE_MAPPING, axisRatio), /axisRatio/);
  for (const config of [null, [], { unknown: true }, { primeMeridianU: -.1 }, { primeMeridianU: 1.1 },
    { primeMeridianU: NaN }, { longitudeDirection: "east-positive" }, { latitudeType: "geodetic" },
    { latitudeBounds: [-90, 90, 100] }, { latitudeBounds: [45, -45] }, { latitudeBounds: [0, 0] },
    { latitudeBounds: [-91, 90] }, { latitudeBounds: [-90, 91] }, { latitudeBounds: [-90, NaN] }])
    assert.throws(() => surfaceUv([1, 0, 0], config), /mapping|primeMeridian|longitude|latitude/);
});

test("standard sRGB transfer handles both segments and linear-light blending", () => {
  near(srgbToLinear(0), 0); near(srgbToLinear(1), 1);
  near(srgbToLinear(.04045), .0031308049535603713);
  near(srgbToLinear(.5), .21404114048223255);
  near(linearToSrgb(.0031308), .040449936);
  near(linearToSrgb(.5), .7353569830524495);
  for (const value of [0, .001, .02, .04045, .1, .5, .75, 1]) near(linearToSrgb(srgbToLinear(value)), value, 5e-8);
  assert.ok(linearToSrgb((srgbToLinear(0) + srgbToLinear(1)) / 2) > .7, "half-light is not encoded channel .5");
});

test("night-light visibility is solar-facing, bounded and smoothly reaches the stated twilight limit", () => {
  near(NIGHT_LIGHT_FULL_COSINE, -.10452846326765347);
  for (const cosine of [0, .2, 1]) assert.equal(nightLightWeight(cosine), 0);
  for (const cosine of [-1, -.5, NIGHT_LIGHT_FULL_COSINE]) assert.equal(nightLightWeight(cosine), 1);
  near(nightLightWeight(NIGHT_LIGHT_FULL_COSINE / 2), .5);
  let previous = 1;
  for (let i = 0; i <= 200; i++) {
    const weight = nightLightWeight(-1 + i / 100);
    assert.ok(weight >= 0 && weight <= previous); previous = weight;
  }
});

test("color and illumination helpers reject nonfinite and out-of-domain inputs", () => {
  for (const value of [NaN, Infinity, -Infinity, true, "0.5", null, -.01, 1.01])
    for (const transfer of [srgbToLinear, linearToSrgb]) assert.throws(() => transfer(value), /\[0, 1\]/);
  for (const value of [NaN, Infinity, true, "0", -1.01, 1.01]) assert.throws(() => nightLightWeight(value), /cosZenith/);
});
