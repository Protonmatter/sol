// The Milky-Way (galactic-scale) MODEL for the 3-D view: constants, the Sun's galactic
// orbit, the differential-rotation shear, galactic→world placement, and the procedural
// point-cloud/guide-ring/label generation. Pure data + math — no GL, no DOM; orrery.js
// uploads the returned arrays and draws them (the same split as celestial.js/smallbodies.js).
//
// A face-on model of our Galaxy showing where the Sun sits: the Sun orbits ~8.18 kpc
// (≈26,700 ly) from the centre, in the Orion Spur between the Sagittarius–Carina and
// Perseus arms — and the model actually PUTS it there: the spur ridge passes through the
// Sun's position by construction, Sagittarius–Carina crosses the Sun's azimuth ~6.1 kpc
// out and Perseus ~9.6 kpc out. Structure follows the modern consensus picture: TWO
// dominant stellar arms (Scutum–Centaurus and Perseus) rooted at the ends of a central
// bar inclined ~28° to the Sun–centre line, two fainter arms (Sagittarius–Carina,
// Norma–Outer), and the local Orion Spur. Scale: 1 world unit ≈ 0.326 kpc (≈1,063 ly);
// disc radius ~15 kpc.

import { GAL_OBJECTS, GAL_TYPES } from "./galacticobjects.js?v=f3c390bd85";
import { bvToRGB, equToGal } from "./starphysics.js?v=f3c390bd85";

const D2R = Math.PI / 180;
const LY_PER_PC = 3.2615637772;
const LY_PER_KPC = 3261.5637772;

export const GAL_UNIT_KPC = 0.326;           // kpc per world unit
export const GAL_SUN_R = 8.178 / GAL_UNIT_KPC; // Sun's galactocentric distance (GRAVITY Collab. 2019)

// --- The Sun's galactic orbit, so the Milky-Way view carries the transit of time ---
// A "galactic year" is the time for one lap: T = 2π·R0 / Θ0, with R0 = 8.178 kpc and the local
// circular speed Θ0 ≈ 230 km/s → ≈ 2.18×10^8 yr. The Sun's azimuth advances at ω = 2π/T. NOTE the
// scale: over the ±5000-yr orbit scrubber the Sun moves only ω·5000 ≈ 0.008° here (sub-pixel), so the
// *visible* motion comes from animating — the Time-speed slider, scaled to millions of years per second.
export const GAL_THETA0 = 2.4;                                          // the Sun's current galactocentric azimuth (rad)
export const GAL_SPEED_KMS = 230;                                       // local circular speed Θ0
export const GAL_PERIOD_YR = (2 * Math.PI * 8.178 * 3.0856776e16) / GAL_SPEED_KMS / 3.15576e7; // ≈ 2.18e8 yr
export const GAL_OMEGA = (2 * Math.PI) / GAL_PERIOD_YR;                 // rad per year
// Differential rotation (flat curve): Ω(r) = GAL_SHEAR_K / max(r, Rc), in world units. Negative ⇒ the
// disc turns the same (clockwise) sense as the Sun, and at the Sun's radius Ω = GAL_OMEGA exactly, so
// the Sun stays embedded in its neighbourhood while the inner disc laps it and the arms wind up.
export const GAL_SHEAR_K = -(GAL_OMEGA * GAL_SUN_R);                    // V_circ in world·rad/yr (Ω·r is constant)
// Rigid rotation inside the bar radius (~3.4 kpc): a real bar is a PATTERN that turns as a unit;
// letting the flat-curve shear act inside it wound the bar itself into a spiral within a few
// hundred Myr of animation. (This also stands in for the rising inner rotation curve and avoids
// the r→0 singularity, as before.)
export const GAL_SHEAR_RC = 10.4;

// CPU twin of the point shader's differential rotation — so discrete objects (deep-sky landmarks) and
// their text labels orbit the galactic centre in lockstep with the sheared disc.
export function galShear(p, galYears) {
  if (!galYears) return p;
  const r = Math.max(Math.hypot(p[0], p[1]), GAL_SHEAR_RC);
  const ang = (GAL_SHEAR_K / r) * galYears, c = Math.cos(ang), s = Math.sin(ang);
  return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
}

export function sunGalacticPos(years) {
  const th = GAL_THETA0 - GAL_OMEGA * years;                     // azimuth at this galactic time
  return [GAL_SUN_R * Math.cos(th), GAL_SUN_R * Math.sin(th), 0];
}

// Galactic (l, b, distance-kpc) → the galaxy view's world frame: l=0 points from the Sun to the
// galactic centre, l=90° along the Sun's direction of rotation, b toward the north galactic pole.
export function galacticToWorld(lDeg, bDeg, dKpc) {
  const S = sunGalacticPos(0), th = GAL_THETA0;
  const gc = [-Math.cos(th), -Math.sin(th)];   // toward the galactic centre (l = 0)
  const rot = [Math.sin(th), -Math.cos(th)];   // direction of galactic rotation (l = 90°)
  const l = lDeg * D2R, b = bDeg * D2R, d = dKpc / GAL_UNIT_KPC, cb = Math.cos(b);
  const e0 = cb * Math.cos(l), e1 = cb * Math.sin(l);
  return [S[0] + d * (e0 * gc[0] + e1 * rot[0]), S[1] + d * (e0 * gc[1] + e1 * rot[1]), S[2] + d * Math.sin(b)];
}

// Build the procedural galaxy: disc/arm/bar/bulge/haze stars packed as the point-shader layout
// [x,y,z,size,r,g,b,a], the galactocentric guide rings as line-strip data, and the labels.
//
// GEOMETRY (all radii in kpc here, converted to world units on emission):
//   • Bar: half-length ~3.4 kpc, long axis inclined BAR_TILT ≈ 28° to the Sun–centre line
//     (Wegg & Gerhard 2013 give 27–33°).
//   • Four log-spiral arms rooted at the bar radius, 90° apart, pitch 16°: the two rooted at
//     the bar ENDS are the dominant stellar arms (Scutum–Centaurus, Perseus), the two between
//     are fainter (Sagittarius–Carina, Norma–Outer) — the two-major + two-minor consensus
//     picture (GLIMPSE star counts; Churchwell et al. 2009). The pitch is at the steep end of
//     published fits (10–16°) because with the arms rooted at the bar it is what lands the
//     crossings of the SUN'S azimuth in the right places: Sagittarius–Carina ~6.1 kpc out,
//     the Sun 8.178, Perseus ~9.6 — the ordering every "you are here" diagram must get right.
//   • Orion (Local) Spur: a short, flatter spiral segment BETWEEN those two arms whose ridge
//     passes through the Sun's position by construction.
// Arm labels are computed from the same formulas that generate the points, so they cannot
// detach from the features they name (the old hard-coded label coordinates did).
export function buildGalaxyModel() {
  const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(99173);
  const gauss = () => { // Box–Muller, driven by the same seeded rng so builds stay deterministic
    const u = Math.max(rng(), 1e-9), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const KPC = 1 / GAL_UNIT_KPC; // world units per kpc
  const pts = [];
  const RMAX = 46;                       // ~15 kpc disc edge
  const PITCH = 16 * D2R, B = 1 / Math.tan(PITCH);
  const BAR_TILT = 28 * D2R;
  const BAR_ANG = GAL_THETA0 - BAR_TILT; // bar long-axis azimuth (near end on the Sun's side)
  const R_START = 3.4 * KPC;             // arms take over where the bar ends
  // Arm azimuth at radius r (world units): the log spiral through (R_START, base).
  const armTheta = (base, r) => base + Math.log(r / R_START) * B;
  const ARMS = [
    { name: "Scutum–Centaurus Arm", base: BAR_ANG, major: true },
    { name: "Norma–Outer Arm", base: BAR_ANG + Math.PI / 2, major: false },
    { name: "Perseus Arm", base: BAR_ANG + Math.PI, major: true },
    { name: "Sagittarius–Carina Arm", base: BAR_ANG + 1.5 * Math.PI, major: false },
  ];
  // Spiral-arm stars: gaussian across-arm profile, blue-white young stars on the ridge, pink
  // HII knots, yellower field stars in the wings. Majors get twice the stars of the minors.
  for (const arm of ARMS) {
    const N = arm.major ? 3300 : 1550;
    for (let i = 0; i < N; i++) {
      const r = R_START + (RMAX - R_START) * Math.pow(rng(), 0.8);
      const sigma = 0.9 + 0.022 * r; // across-arm σ in world units: ≈0.3 kpc, widening outward
      const across = gauss() * sigma;
      const theta = armTheta(arm.base, r) + gauss() * 0.03;
      const rr = r + across;
      const x = rr * Math.cos(theta), y = rr * Math.sin(theta);
      const z = gauss() * 0.55 * (1.1 - 0.5 * Math.min(1, r / RMAX));
      const core = Math.exp(-(across * across) / (2 * sigma * sigma));
      const hii = rng() > (arm.major ? 0.92 : 0.95);
      const col = hii ? [1.0, 0.55, 0.62]
        : core > 0.6 && rng() > 0.35 ? [0.72, 0.82, 1.0]   // OB associations trace the ridge
          : [0.95, 0.93, 0.86];
      const a = (arm.major ? 0.55 : 0.4) + 0.4 * rng();
      pts.push(x, y, z, hii ? 2.8 : 1.5 + rng() * (arm.major ? 1.2 : 0.8), col[0], col[1], col[2], a);
    }
  }
  // The Orion (Local) Spur: a short, flat segment between Sagittarius–Carina and Perseus.
  // Ridge: r(s) = R_SPUR·exp(s / (2B)) through azimuth GAL_THETA0 + s — half the arms' pitch
  // (spurs run more azimuthally), ~2.5 kpc long, ridge 0.17 kpc outside the Sun at s = 0 so
  // the Sun sits INSIDE the spur's width, just like the real one.
  const R_SPUR = 8.35 * KPC;
  for (let i = 0; i < 750; i++) {
    const s = -0.6 + 1.3 * rng();
    const rr = R_SPUR * Math.exp(s / (2 * B)) + gauss() * 0.86; // ±0.28 kpc radial scatter
    const theta = GAL_THETA0 + s + gauss() * 0.012;
    const hii = rng() > 0.94;
    const col = hii ? [1.0, 0.55, 0.62] : rng() > 0.5 ? [0.75, 0.84, 1.0] : [0.95, 0.93, 0.88];
    pts.push(rr * Math.cos(theta), rr * Math.sin(theta), gauss() * 0.4, hii ? 2.5 : 1.4 + rng(), col[0], col[1], col[2], 0.45 + 0.4 * rng());
  }
  // Central bar: a coherent elongated distribution along BAR_ANG (not a bulge stretch) —
  // half-length R_START, ~1.1 kpc across, golden older population.
  for (let i = 0; i < 1300; i++) {
    const along = (rng() * 2 - 1) * R_START * (0.55 + 0.45 * rng());
    const acrossB = gauss() * 1.15, zB = gauss() * 0.9;
    const x = along * Math.cos(BAR_ANG) - acrossB * Math.sin(BAR_ANG);
    const y = along * Math.sin(BAR_ANG) + acrossB * Math.cos(BAR_ANG);
    pts.push(x, y, zB, 1.5 + rng() * 1.1, 1.0, 0.85, 0.6, 0.55 + 0.4 * rng());
  }
  // Inner bulge: compact spheroid under the bar.
  for (let i = 0; i < 1400; i++) {
    const r = Math.pow(rng(), 1.8) * 6.4, th = rng() * 2 * Math.PI;
    pts.push(r * Math.cos(th), r * Math.sin(th), gauss() * (1.6 - r * 0.12), 1.4 + rng() * 1.2, 1.0, 0.88, 0.66, 0.5 + 0.5 * rng());
  }
  // Diffuse disc haze
  for (let i = 0; i < 1600; i++) {
    const r = Math.sqrt(rng()) * RMAX, th = rng() * 2 * Math.PI;
    pts.push(r * Math.cos(th), r * Math.sin(th), gauss() * 0.7, 0.9, 0.75, 0.78, 0.95, 0.14 + 0.16 * rng());
  }

  // Reference rings at the Sun's orbit + galactocentric radii, as line strips.
  const guide = [], ranges = [];
  const ring = (rad, col) => {
    const first = guide.length / 6;
    for (let k = 0; k <= 128; k++) { const a = k / 128 * 2 * Math.PI; guide.push(Math.cos(a) * rad, Math.sin(a) * rad, 0, col[0], col[1], col[2]); }
    ranges.push({ first, count: 129 });
  };
  for (const kpc of [4, 8.178, 12, 16]) ring(kpc / GAL_UNIT_KPC, kpc === 8.178 ? [0.95, 0.78, 0.30] : [0.25, 0.3, 0.42]);

  const sunPos = sunGalacticPos(0);
  // Each arm label sits ON its generated curve (same formula as the points), at an azimuth
  // offset from the Sun's line chosen so the four don't stack; `shear: true` makes orrery.js
  // move them with the differentially-rotating disc, in lockstep with the points.
  const solveCrossing = (base) => { // arm's radius where it crosses the Sun's azimuth:
    // r = R_START·exp((GAL_THETA0 − base + 2πn)/B); pick the crossing nearest the Sun's radius.
    let bestR = null;
    for (let n = -2; n <= 3; n++) {
      const r = R_START * Math.exp((GAL_THETA0 - base + 2 * Math.PI * n) / B);
      if (r < R_START * 0.9 || r > RMAX * 1.05) continue;
      if (!bestR || Math.abs(Math.log(r / GAL_SUN_R)) < Math.abs(Math.log(bestR / GAL_SUN_R))) bestR = r;
    }
    return bestR;
  };
  const armLabel = (arm, dTheta) => {
    const rc = solveCrossing(arm.base);
    if (!rc) return null;
    const r = rc * Math.exp(dTheta / B), th = GAL_THETA0 + dTheta;
    return { name: arm.name, p: [r * Math.cos(th), r * Math.sin(th), 0], shear: true };
  };
  const labels = [
    { name: "◎ Galactic Centre (Sgr A*)", p: [0, 0, 0] },
    { name: "☉ Sun — you are here (~26,700 ly out)", p: sunPos, sun: true },
    armLabel(ARMS[0], 1.5),    // Scutum–Centaurus, well along its arc
    armLabel(ARMS[1], -1.6),   // Norma–Outer crosses far out; label it back along the curve
    armLabel(ARMS[2], 0.9),    // Perseus
    armLabel(ARMS[3], -0.9),   // Sagittarius–Carina
    { name: "Orion Spur — the Sun's arm segment", p: [R_SPUR * Math.exp(0.38 / (2 * B)) * Math.cos(GAL_THETA0 + 0.38), R_SPUR * Math.exp(0.38 / (2 * B)) * Math.sin(GAL_THETA0 + 0.38), 0], shear: true },
    { name: "Central bar", p: [R_START * 0.7 * Math.cos(BAR_ANG), R_START * 0.7 * Math.sin(BAR_ANG), 0], shear: true },
    { name: "Sun's orbit ≈ 26,700 ly", p: [GAL_SUN_R * Math.cos(GAL_THETA0 - 2.4), GAL_SUN_R * Math.sin(GAL_THETA0 - 2.4), 0] },
  ].filter(Boolean);
  return {
    points: new Float32Array(pts),
    count: pts.length / 8,
    guide: new Float32Array(guide),
    ranges,
    sunPos,
    labels,
  };
}

// The REAL naked-eye star catalogue (starcatalog.js — Hipparcos positions, parallax
// distances, B−V colours) placed at its true galactic positions for the galaxy view.
// Honest scale note: nearly every naked-eye star lies within ~2,000 ly of the Sun —
// under 2 world units here — so this layer renders as a compact bright halo around the
// Sun's marker. That is the point: it shows how LOCAL the visible night sky is. The
// solar-neighbourhood view below is the zoomed-in version where it resolves.
// `starCat` = the lazily-imported starcatalog.js namespace (see orrery.js enterOrrery).
export function buildCatalogStarsGalactic(starCat) {
  // The full Hipparcos payload is deliberately lazy. Return a valid empty point layer
  // during the first WebGL frame; buildGalaxyBuffers() replaces it when the catalogue
  // resolves. This keeps optional galaxy enrichment out of core renderer readiness.
  const { STAR_COUNT = 0, STAR_STRIDE = 0, STARS_PACKED = [] } = starCat || {};
  const pts = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const ra = STARS_PACKED[i * STAR_STRIDE];
    const dec = STARS_PACKED[i * STAR_STRIDE + 1];
    const mag = STARS_PACKED[i * STAR_STRIDE + 2];
    const bv = STARS_PACKED[i * STAR_STRIDE + 3];
    const dist = STARS_PACKED[i * STAR_STRIDE + 4];
    if (dist == null || !(dist > 0)) continue;
    const [l, b] = equToGal(ra, dec);
    const p = galacticToWorld(l, b, dist / LY_PER_KPC);
    const [r, g, bl] = bvToRGB(bv);
    pts.push(p[0], p[1], p[2], Math.max(0.8, 1.8 - 0.16 * mag), r, g, bl, 0.8);
  }
  return { points: new Float32Array(pts), count: pts.length / 8 };
}

// ---- The solar neighbourhood: a light-year-scale view of the same catalogue ----
// Heliocentric galactic frame, Sun at the origin: +x toward the galactic centre (l = 0),
// +y along galactic rotation (l = 90°), +z toward the north galactic pole. Positions are
// Hipparcos parallax distances — real 3-D star places, not a projection. Static at the
// J2000 epoch: proper motion is not animated here (over the scrubber's ±5000 yr even
// Barnard's Star moves under a pixel at this scale).
export const LOCAL_UNIT_LY = 10; // 1 world unit = 10 light-years

// Equatorial (J2000) + parallax distance -> the neighbourhood view's world position.
// The single definition: the point cloud, the labels, and orrery.js's click picking all
// call this, so a star can never be drawn in one place and hit-tested in another.
export function neighbourhoodPos(raDeg, decDeg, distLy) {
  const [l, b] = equToGal(raDeg, decDeg);
  const d = distLy / LOCAL_UNIT_LY, cb = Math.cos(b * D2R);
  return [d * cb * Math.cos(l * D2R), d * cb * Math.sin(l * D2R), d * Math.sin(b * D2R)];
}

export function buildNeighbourhoodModel(starCat) {
  const {
    STAR_COUNT = 0,
    STAR_STRIDE = 0,
    STARS_PACKED = [],
    NAMED_STARS = [],
  } = starCat || {};
  const pts = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const ra = STARS_PACKED[i * STAR_STRIDE];
    const dec = STARS_PACKED[i * STAR_STRIDE + 1];
    const mag = STARS_PACKED[i * STAR_STRIDE + 2];
    const bv = STARS_PACKED[i * STAR_STRIDE + 3];
    const dist = STARS_PACKED[i * STAR_STRIDE + 4];
    if (dist == null || !(dist > 0)) continue;
    const [x, y, z] = neighbourhoodPos(ra, dec, dist);
    // Size by ABSOLUTE magnitude: at true 3-D positions, intrinsic luminosity is the
    // honest visual weight (a red dwarf 8 ly away must not outshine Deneb at 2,600 ly).
    const absM = mag - 5 * Math.log10(dist / LY_PER_PC / 10);
    const size = Math.max(0.7, Math.min(6.0, 3.6 - 0.42 * absM));
    const [r, g, bl] = bvToRGB(bv);
    pts.push(x, y, z, size, r, g, bl, 0.9);
  }

  // Distance rings in the galactic plane, labelled — the scale ladder of the view.
  const guide = [], ranges = [], ringLabels = [];
  const RINGS = [10, 25, 50, 100, 250];
  for (const ly of RINGS) {
    const rad = ly / LOCAL_UNIT_LY, first = guide.length / 6;
    for (let k = 0; k <= 128; k++) {
      const a = (k / 128) * 2 * Math.PI;
      guide.push(Math.cos(a) * rad, Math.sin(a) * rad, 0, 0.25, 0.3, 0.42);
    }
    ranges.push({ first, count: 129 });
    ringLabels.push({ name: `${ly} ly`, p: [rad * Math.cos(-0.6), rad * Math.sin(-0.6), 0] });
  }

  // Label layer: named stars, nearest-and-brightest first. Text carries the measured
  // distance so the view doubles as a reference chart.
  const named = [];
  for (const s of NAMED_STARS) {
    if (s.dist == null) continue;
    if (!(s.dist <= 120 || s.mag <= 1.7)) continue;
    named.push({
      name: `${s.name} · ${s.dist < 100 ? s.dist.toFixed(1) : Math.round(s.dist)} ly`,
      p: neighbourhoodPos(s.ra, s.dec, s.dist),
      distLy: s.dist,
      mag: s.mag,
    });
  }
  named.sort((a, b) => a.distLy - b.distLy);

  return {
    points: new Float32Array(pts),
    count: pts.length / 8,
    guide: new Float32Array(guide),
    ranges,
    ringLabels,
    named,
  };
}

// Place the deep-sky landmark objects (nebulae, pulsars, black holes, nearby stars…) at their true
// positions relative to the Sun; `packed` is the point-shader layout for one upload.
export function buildGalObjectList() {
  const objects = GAL_OBJECTS.map((o) => {
    const t = GAL_TYPES[o.type] || GAL_TYPES.star;
    return { name: o.n, pos: galacticToWorld(o.l, o.b, o.d), type: o.type, note: o.note, col: t.col, size: t.size, tag: t.tag };
  });
  const packed = new Float32Array(objects.length * 8);
  objects.forEach((o, i) => packed.set([o.pos[0], o.pos[1], o.pos[2], o.size, o.col[0], o.col[1], o.col[2], 1.0], i * 8));
  return { objects, packed };
}
