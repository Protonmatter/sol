// Unit tests for the 3-D view's pure math: vec/mat helpers, IAU body orientation,
// and the geometry builders. Golden values are structural invariants (orthonormality,
// counts) rather than platform-sensitive decimals.
import test from "node:test";
import assert from "node:assert/strict";
import {
  perspective, lookAt, mul, sub, add, cross, dot, norm, translate, scaleM,
  normalMat3, iauRotation, buildSphere, ringOpacityProfile, buildRing, ellipse3d,
} from "../../apps/web/js/orreryMath.js";
import { BODY } from "../../apps/web/js/bodyData.js";

const EPS = 1e-9;
const approx = (a, b, eps = EPS) => Math.abs(a - b) < eps;

test("vector helpers satisfy their algebra", () => {
  assert.deepEqual(sub([3, 2, 1], [1, 1, 1]), [2, 1, 0]);
  assert.deepEqual(add([1, 2, 3], [1, 1, 1]), [2, 3, 4]);
  // cross(x, y) = z, and the result is orthogonal to both inputs
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  const a = [0.3, -1.2, 2.2], b = [1.1, 0.4, -0.6];
  const c = cross(a, b);
  assert.ok(approx(dot(c, a), 0) && approx(dot(c, b), 0));
  // norm returns unit length, and guards the zero vector instead of dividing by 0
  const u = norm([3, 4, 0]);
  assert.ok(approx(Math.hypot(...u), 1));
  assert.deepEqual(norm([0, 0, 0]), [0, 0, 0]);
});

test("mat4 multiply: identity is neutral and translate composes additively", () => {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const t = translate([1, 2, 3]);
  assert.deepEqual(mul(I, t), t);
  const t2 = mul(translate([1, 0, 0]), translate([0, 1, 0]));
  assert.deepEqual(t2.slice(12, 15), [1, 1, 0]);
});

test("camera and transform matrices preserve their geometric contracts", () => {
  const p = perspective(Math.PI / 2, 2, 1, 101);
  assert.ok(approx(p[0], 0.5) && approx(p[5], 1));
  assert.equal(p[11], -1);
  const view = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  assert.deepEqual(view.slice(0, 12), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  assert.ok(view.slice(12).every((value, i) => approx(value, [0, 0, -5, 1][i])));
  const model = mul(translate([1, 2, 3]), scaleM([2, 3, 4]));
  assert.deepEqual(normalMat3(model), [2, 0, 0, 0, 3, 0, 0, 0, 4]);
});

test("orbit-camera basis remains right-handed and continuous across a full azimuth sweep", () => {
  let previousRight = null;
  for (const el of [-1.45, -0.8, 0, 0.8, 1.45]) {
    previousRight = null;
    for (let i = 0; i <= 720; i++) {
      const az = -Math.PI + (i / 720) * Math.PI * 2;
      const eye = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
      const view = lookAt(eye, [0, 0, 0], [0, 0, 1]);
      const right = [view[0], view[4], view[8]];
      const up = [view[1], view[5], view[9]];
      const back = [view[2], view[6], view[10]];
      assert.ok(approx(Math.hypot(...right), 1, 1e-8));
      assert.ok(approx(dot(cross(right, up), back), 1, 1e-8), `right-handed at el=${el}, az=${az}`);
      if (previousRight) {
        assert.ok(dot(previousRight, right) > 0.9999, `no roll flip at el=${el}, az=${az}`);
      }
      previousRight = right;
    }
  }
});

test("iauRotation returns a proper (right-handed, orthonormal) rotation for every body", () => {
  const unix = 1_767_225_600; // 2026-01-01T00:00:00Z
  for (const [name, body] of Object.entries(BODY)) {
    if (body.poleRaDeg == null) continue;
    const m = iauRotation(body, unix);
    const x = [m[0], m[1], m[2]], y = [m[4], m[5], m[6]], z = [m[8], m[9], m[10]];
    for (const v of [x, y, z]) assert.ok(approx(Math.hypot(...v), 1, 1e-6), `${name}: unit axes`);
    assert.ok(approx(dot(x, y), 0, 1e-6) && approx(dot(y, z), 0, 1e-6) && approx(dot(z, x), 0, 1e-6), `${name}: orthogonal`);
    // det = +1 (a rotation, not a reflection): cross(x, y) must equal z
    const zc = cross(x, y);
    assert.ok(approx(zc[0], z[0], 1e-6) && approx(zc[1], z[1], 1e-6) && approx(zc[2], z[2], 1e-6), `${name}: right-handed`);
  }
});

test("iauRotation actually spins: Earth's prime meridian moves ~360.99°/day", () => {
  const earth = BODY.Earth;
  const unix = 1_767_225_600;
  const m0 = iauRotation(earth, unix);
  const m1 = iauRotation(earth, unix + 86400);
  // After one day the meridian axis returns to nearly (but not exactly) the same
  // direction — the ~0.9856°/day solar-vs-sidereal surplus.
  const cosAngle = dot([m0[0], m0[1], m0[2]], [m1[0], m1[1], m1[2]]);
  assert.ok(cosAngle > 0.999, "returns near the start after 24h");
  assert.ok(cosAngle < 1 - 1e-6, "but not exactly — Earth is not tidally locked to the Sun");
});

test("buildSphere emits the documented vertex/index counts", () => {
  const { pos, idx } = buildSphere(8, 12);
  assert.equal(pos.length, (8 + 1) * (12 + 1) * 3);
  assert.equal(idx.length, 8 * 12 * 6);
  // Every vertex sits on the unit sphere (normal == position invariant)
  for (let i = 0; i < pos.length; i += 3) {
    assert.ok(approx(Math.hypot(pos[i], pos[i + 1], pos[i + 2]), 1, 1e-6));
  }
});

test("ring opacity and mesh agree on gaps and optical bands", () => {
  const saturn = { innerKm: 74500, outerKm: 140220, gaps: [[117580, 122170]] };
  const profile = ringOpacityProfile(saturn, 512);
  assert.equal(profile.length, 512);
  assert.ok(Math.max(...profile) > 190, "B ring should be optically thick");
  assert.ok(profile.some((v) => v === 0), "Cassini Division should be transparent");

  const mesh = buildRing(saturn, 1e-4, 60268);
  assert.equal(mesh.length % 8, 0);
  assert.ok(mesh.length > 120 * 6 * 8);
  const alphas = [];
  for (let i = 6; i < mesh.length; i += 8) alphas.push(mesh[i]);
  assert.ok(alphas.some((a) => a === 0));
  assert.ok(alphas.some((a) => a > 0.7));

  const faint = ringOpacityProfile({ innerKm: 1, outerKm: 2 }, 4);
  assert.deepEqual([...faint], [41, 41, 41, 41]);
});

test("ellipse3d closes, obeys periapsis/apoapsis radii, and inclines out of plane", () => {
  const a = 5, e = 0.2;
  const points = ellipse3d({ a_au: a, ecc: e, inc_deg: 30, node_deg: 40, argp_deg: 20 });
  assert.equal(points.length, 161);
  for (let i = 0; i < 3; i++) assert.ok(approx(points[0][i], points.at(-1)[i], 1e-9));
  const radii = points.map((p) => Math.hypot(...p));
  assert.ok(approx(Math.min(...radii), a * (1 - e), 1e-8));
  assert.ok(approx(Math.max(...radii), a * (1 + e), 1e-8));
  assert.ok(points.some((p) => Math.abs(p[2]) > 0.1));
});
