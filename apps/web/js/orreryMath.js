// Pure math for the 3-D view: column-major mat4/vec3 helpers, the IAU WGCCRE body
// orientation, and the sphere / ring / orbit-ellipse geometry builders. No GL, no DOM,
// no module state — extracted from orrery.js along the same data+pure-function lines as
// celestial.js and smallbodies.js, so it is reviewable (and testable) in isolation.

import { rotationPhase } from "./bodyData.js?v=3b7d0d5283";

// ---------------------------------------------------------------- mat/vec (column-major)
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
export function lookAt(eye, c, up) {
  const z = norm(sub(eye, c)), x = norm(cross(up, z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}
export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const translate = (t) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
export const scaleM = (s) => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1];
export function normalMat3(m) { return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]; }

const D2R = Math.PI / 180, ECL_J2000 = 23.43928 * D2R;
// Equatorial-J2000 (ICRS) unit vector → ecliptic-J2000 world frame (rotate −ε about x).
function eclFromEqu(v) {
  const c = Math.cos(ECL_J2000), s = Math.sin(ECL_J2000);
  return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c];
}

// Physically-correct body orientation per the IAU WGCCRE 2015 convention, as a column-major mat4
// (rotation only). The spin axis is the IAU pole (α0, δ0); the prime meridian is measured by the
// rotation angle W = W0 + Ẇ·d from the ascending node of the body's equator on the ICRS equator
// (RA = α0 + 90°). This fixes the ABSOLUTE phase — so the right meridian/hemisphere faces the Sun at
// any time t — rather than spinning from an arbitrary reference. Ẇ<0 (Venus, Uranus) → retrograde.
export function iauRotation(phys, unixSeconds) {
  const a0 = phys.poleRaDeg * D2R, d0 = phys.poleDecDeg * D2R, w = rotationPhase(phys, unixSeconds);
  const pole = norm(eclFromEqu([Math.cos(d0) * Math.cos(a0), Math.cos(d0) * Math.sin(a0), Math.sin(d0)]));
  const node = norm(eclFromEqu([-Math.sin(a0), Math.cos(a0), 0])); // ascending node of the equator (RA=α0+90°)
  const pxn = cross(pole, node);                                    // node rotated +90° about the pole (eastward)
  const cw = Math.cos(w), sw = Math.sin(w);
  const x = norm([node[0] * cw + pxn[0] * sw, node[1] * cw + pxn[1] * sw, node[2] * cw + pxn[2] * sw]); // prime meridian
  const y = cross(pole, x);                                         // +90° east longitude
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, pole[0], pole[1], pole[2], 0, 0, 0, 0, 1];
}

// ---------------------------------------------------------------- sphere + ring + ellipse geometry
export function buildSphere(stacks, slices) {
  const pos = [], idx = [];
  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks, phi = v * Math.PI;       // 0..π, pole at +z
    const z = Math.cos(phi), r = Math.sin(phi);
    for (let j = 0; j <= slices; j++) {
      const u = j / slices, th = u * 2 * Math.PI;
      pos.push(r * Math.cos(th), r * Math.sin(th), z);  // unit sphere; normal == position
    }
  }
  const row = slices + 1;
  for (let i = 0; i < stacks; i++) for (let j = 0; j < slices; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
}

// A ring annulus in the body's equatorial (xy) plane, radii in AU, vertex-coloured from the real
// km structure (C/B/A brightness + the Cassini Division gap). Returns interleaved [x,y,z,r,g,b,a,frac].
export function buildRing(rings, rEqAU, radiusKm) {
  const inner = (rings.innerKm / radiusKm) * rEqAU;
  const outer = (rings.outerKm / radiusKm) * rEqAU;
  const RAD = 56, ANG = 120, v = [];
  const colorAt = (rAU) => {
    const km = (rAU / rEqAU) * radiusKm;
    if (rings.gaps) for (const [g0, g1] of rings.gaps) if (km > g0 && km < g1) return [0, 0, 0, 0];
    if (!rings.gaps) return [0.62, 0.64, 0.66, 0.16]; // faint Uranus/Neptune rings
    let a, tint;
    if (km < 92000) { a = 0.18; tint = [0.55, 0.50, 0.42]; }        // C ring (dim)
    else if (km < 117580) { a = 0.78; tint = [0.86, 0.78, 0.60]; }  // B ring (bright)
    else { a = 0.5; tint = [0.78, 0.72, 0.56]; }                    // A ring
    return [tint[0], tint[1], tint[2], a];
  };
  for (let i = 0; i < RAD; i++) {
    const f0 = i / RAD, f1 = (i + 1) / RAD;
    const r0 = inner + (outer - inner) * f0;
    const r1 = inner + (outer - inner) * f1;
    const c0 = colorAt(r0), c1 = colorAt(r1);
    for (let j = 0; j < ANG; j++) {
      const t0 = (j / ANG) * 2 * Math.PI, t1 = ((j + 1) / ANG) * 2 * Math.PI;
      const p = (r, t, c, f) => v.push(r * Math.cos(t), r * Math.sin(t), 0, c[0], c[1], c[2], c[3], f);
      p(r0, t0, c0, f0); p(r1, t0, c1, f1); p(r1, t1, c1, f1);
      p(r0, t0, c0, f0); p(r1, t1, c1, f1); p(r0, t1, c0, f0);
    }
  }
  return new Float32Array(v);
}

// The true inclined orbit ellipse for a body's osculating elements, as world-space points.
export function ellipse3d(b) {
  const a = b.a_au, e = b.ecc;
  const inc = b.inc_deg * Math.PI / 180, node = b.node_deg * Math.PI / 180, argp = b.argp_deg * Math.PI / 180;
  const co = Math.cos(argp), so = Math.sin(argp), cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc), bm = a * Math.sqrt(1 - e * e), pts = [];
  for (let k = 0; k <= 160; k++) {
    const ea = (k / 160) * 2 * Math.PI, xp = a * (Math.cos(ea) - e), yp = bm * Math.sin(ea);
    pts.push([(co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
      (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp, (so * si) * xp + (co * si) * yp]);
  }
  return pts;
}
