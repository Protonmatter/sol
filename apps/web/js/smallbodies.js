// Small bodies for the 3-D Solar System view: the asteroid and Kuiper belts (procedural populations
// at their true radii), the major dwarf planets / named asteroids and a few famous comets (REAL
// osculating orbits + Kepler-propagated markers), and the farthest human-made spacecraft.
//
// ACCURACY — read this before trusting a position. The planets in this view are arcsecond-accurate
// (VSOP2013 / TOP2013). Everything in THIS module is the *illustrative* small-body layer:
//   • belts        — procedural particle clouds at the correct radii/thickness (statistical, not real objects),
//   • dwarfs/comets — orbit geometry (a, e, i, Ω, ω) from published elements is accurate; the marker is
//                     propagated with a two-body Kepler model (no planetary perturbations) — good to ~a degree,
//   • spacecraft   — placed from approximate current distance + heading; they move ~3 AU/yr, so they only
//                     mean anything near the present.
// All of it is heliocentric ecliptic-J2000 (AU), the same frame the engine's planets use.

const D2R = Math.PI / 180;
const J2000 = 2451545.0;

// Solve Kepler's equation M = E − e·sinE for the eccentric anomaly E (rad), robust for ALL e < 1.
// The naive E = M starting guess DIVERGES at high eccentricity (e.g. comets: Halley 0.97, Hale–Bopp
// 0.995) — it oscillates and never settles, so the body's position becomes garbage that jumps wildly
// with time. Danby's initial guess E = M + 0.85·e·sign(M) (with M wrapped to [−π, π]) converges in a
// few Newton steps for every elliptical orbit.
export function eccentricAnomaly(M, e) {
  M = M % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI; else if (M < -Math.PI) M += 2 * Math.PI;
  let E = M + 0.85 * e * (M < 0 ? -1 : 1);
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

// Classical elements + mean anomaly → heliocentric ecliptic-J2000 position (AU). Same rotation as the
// engine's `equinoctial_to_xyz` / orrery `ellipse3d`, so small bodies share the planets' frame exactly.
export function keplerXYZ(a, e, inc, node, argp, M) {
  const E = eccentricAnomaly(M, e);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(argp), so = Math.sin(argp), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(inc), si = Math.sin(inc);
  return [
    (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
    (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
    (so * si) * xp + (co * si) * yp,
  ];
}

// Mean anomaly (rad) at `jy2k` Julian years from J2000. n = 2π/P, P = a^1.5 yr (Kepler III, heliocentric).
// Minor bodies carry M0 (deg @ J2000); comets carry Tp (JD of perihelion, where M = 0).
export function meanAnomaly(b, jy2k) {
  const n = (2 * Math.PI) / Math.pow(b.a, 1.5);
  if (b.Tp != null) return n * (jy2k - (b.Tp - J2000) / 365.25);
  return b.M0 * D2R + n * jy2k;
}

// Convert a small body's stored degrees → an object `ellipse3d()` can draw (its orbit outline).
export function asOrbit(b) {
  return { a_au: b.a, ecc: b.e, inc_deg: b.i, node_deg: b.node, argp_deg: b.argp };
}

// Current heliocentric position (AU) of a dwarf/asteroid/comet at `jy2k`.
export function bodyXYZ(b, jy2k) {
  return keplerXYZ(b.a, b.e, b.i * D2R, b.node * D2R, b.argp * D2R, meanAnomaly(b, jy2k));
}

// Dwarf planets + named main-belt asteroids. a[AU], e, i/node/argp/M0 in degrees (J2000 osculating).
export const DWARFS = [
  { n: "Pluto",    a: 39.482, e: 0.2488, i: 17.16, node: 110.30, argp: 113.83, M0: 14.53,  col: [0.86, 0.76, 0.62], note: "dwarf planet · 248-yr orbit, crosses Neptune's" },
  { n: "Ceres",    a: 2.7658, e: 0.0785, i: 10.59, node: 80.39,  argp: 73.12,  M0: 77.37,  col: [0.80, 0.80, 0.76], note: "largest asteroid — and a dwarf planet" },
  { n: "Vesta",    a: 2.3617, e: 0.0887, i: 7.14,  node: 103.85, argp: 151.20, M0: 307.69, col: [0.84, 0.79, 0.66], note: "brightest main-belt asteroid" },
  { n: "Eris",     a: 67.86,  e: 0.4361, i: 44.04, node: 35.95,  argp: 151.64, M0: 204.16, col: [0.88, 0.90, 0.94], note: "scattered-disc dwarf, ~Pluto's size" },
  { n: "Makemake", a: 45.43,  e: 0.1613, i: 28.98, node: 79.62,  argp: 294.83, M0: 153.0,  col: [0.86, 0.66, 0.55], note: "Kuiper-belt dwarf planet" },
  { n: "Haumea",   a: 43.18,  e: 0.1964, i: 28.21, node: 122.17, argp: 239.18, M0: 217.8,  col: [0.90, 0.90, 0.96], note: "elongated, fast-spinning dwarf with a ring" },
];

// Famous comets. Tp = JD of perihelion (M = 0). i > 90° ⇒ retrograde orbit.
export const COMETS = [
  { n: "1P/Halley",  a: 17.834, e: 0.96714, i: 162.26, node: 58.42,  argp: 111.33, Tp: 2446470.5, col: [0.70, 0.88, 1.0], note: "near aphelion now; returns ~2061" },
  // Tp = 2023-10-22 perihelion (JPL SBDB). The previous value (JD 2459919.5 = 2022-12-06)
  // was not an Encke perihelion at all — the marker sat ~90° off along the orbit.
  { n: "2P/Encke",   a: 2.2155, e: 0.84833, i: 11.78,  node: 334.57, argp: 186.55, Tp: 2460240.0, col: [0.75, 0.95, 0.85], note: "shortest-period comet, 3.3 yr" },
  { n: "Hale–Bopp",  a: 186.0,  e: 0.99511, i: 89.43,  node: 282.47, argp: 130.59, Tp: 2450537.5, col: [0.90, 0.96, 1.0], note: "Great Comet of 1997 · ~2500-yr orbit" },
];

// The farthest human-made objects: approximate CURRENT (≈2026) heliocentric distance [AU] + ecliptic
// heading (lon, lat in degrees). They recede ~3–3.6 AU/yr, so these are "roughly where they are now."
export const PROBES = [
  { n: "Voyager 1",    dist: 167, lon: 256, lat: 34,  col: [1.0, 0.55, 0.45], note: "farthest human-made object · interstellar space" },
  { n: "Voyager 2",    dist: 140, lon: 290, lat: -35, col: [1.0, 0.6, 0.5],   note: "interstellar, on a southward heading" },
  { n: "Pioneer 10",   dist: 137, lon: 70,  lat: 3,   col: [1.0, 0.7, 0.55],  note: "silent since 2003 · heading toward Aldebaran" },
  { n: "New Horizons", dist: 60,  lon: 287, lat: -1,  col: [1.0, 0.65, 0.5],  note: "flew past Pluto (2015) and Arrokoth (2019)" },
];

export function probeXYZ(p) {
  const lon = p.lon * D2R, lat = p.lat * D2R, r = p.dist;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

// Build the two belts as point clouds: Float32 [x,y,z, size, r,g,b,a] per particle (the orrery's
// point-shader layout). Particles are scattered uniformly in azimuth across the radial band, with a
// small out-of-plane (z) spread standing in for the population's inclinations.
export function buildBelts() {
  const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7919);
  const belt = (n, rMin, rMax, zSpread, base, sz) => {
    const out = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      const r = rMin + (rMax - rMin) * rng();
      const th = rng() * 2 * Math.PI;
      const z = (rng() - 0.5) * 2 * zSpread;
      const tw = 0.45 + 0.55 * rng();
      out.set([r * Math.cos(th), r * Math.sin(th), z, sz * (0.7 + 0.6 * rng()), base[0], base[1], base[2], 0.55 * tw], i * 8);
    }
    return out;
  };
  return {
    // Main belt ≈ 2.1–3.3 AU (thin sheet); Kuiper belt ≈ 30–48 AU (wider, puffier).
    asteroid: { data: belt(2400, 2.1, 3.3, 0.12, [0.82, 0.75, 0.58], 1.5), count: 2400 },
    kuiper:   { data: belt(2800, 30, 48, 2.2, [0.66, 0.80, 0.96], 1.6), count: 2800 },
  };
}
