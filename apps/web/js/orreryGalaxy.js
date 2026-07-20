// The Milky-Way (galactic-scale) MODEL for the 3-D view: constants, the Sun's galactic
// orbit, the differential-rotation shear, galactic→world placement, and the procedural
// point-cloud/guide-ring/label generation. Pure data + math — no GL, no DOM; orrery.js
// uploads the returned arrays and draws them (the same split as celestial.js/smallbodies.js).
//
// A face-on model of our Galaxy showing where the Sun sits: the Sun orbits ~8.18 kpc
// (≈26,700 ly) from the centre, in the Orion Spur between the Sagittarius and Perseus arms.
// Scale: 1 world unit ≈ 0.326 kpc (≈1,063 ly); disc radius ~15 kpc. Logarithmic spiral
// arms + a central bar/bulge.

import { GAL_OBJECTS, GAL_TYPES } from "./galacticobjects.js?v=78434029fa";
import { bvToRGB, equToGal } from "./starphysics.js?v=78434029fa";

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
export const GAL_SHEAR_RC = 6.0;                                        // ≈2 kpc: rigid inner rotation below this

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

// Build the procedural galaxy: disc/arm/bulge/haze stars packed as the point-shader layout
// [x,y,z,size,r,g,b,a], the galactocentric guide rings as line-strip data, and the fixed labels.
export function buildGalaxyModel() {
  const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(99173);
  const pts = [];
  const ARMS = 4, PITCH = 12.5 * Math.PI / 180, B = 1 / Math.tan(PITCH), RMAX = 46;
  // Spiral-arm stars
  for (let i = 0; i < 5200; i++) {
    const arm = i % ARMS;
    const t = Math.pow(rng(), 0.5);
    const r = 3 + t * (RMAX - 3);
    const theta = arm * (2 * Math.PI / ARMS) + Math.log(r / 3) * B + (rng() - 0.5) * 0.5;
    const spread = 1.2 + r * 0.10;
    const rx = (rng() - 0.5) * spread, ry = (rng() - 0.5) * spread;
    const x = r * Math.cos(theta) + rx, y = r * Math.sin(theta) + ry;
    const z = (rng() - 0.5) * (1.4 - 0.9 * Math.min(1, r / RMAX)) * 1.6;
    const hii = rng() > 0.93;
    const col = hii ? [1.0, 0.5, 0.6] : (rng() > 0.5 ? [0.8, 0.86, 1.0] : [0.95, 0.95, 0.92]);
    const a = 0.5 + 0.5 * rng();
    pts.push(x, y, z, hii ? 2.6 : 1.5 + rng(), col[0], col[1], col[2], a);
  }
  // Central bulge / bar
  for (let i = 0; i < 2000; i++) {
    const u = rng(), r = Math.pow(u, 1.6) * 9;
    const th = rng() * 2 * Math.PI;
    const bar = 1 + 0.8 * Math.abs(Math.cos(th)); // slight bar elongation
    const x = r * bar * Math.cos(th), y = r * Math.sin(th), z = (rng() - 0.5) * (3.2 - r * 0.2);
    pts.push(x, y, z, 1.4 + rng() * 1.2, 1.0, 0.86, 0.62, 0.5 + 0.5 * rng());
  }
  // Diffuse disc haze
  for (let i = 0; i < 1400; i++) {
    const r = Math.sqrt(rng()) * RMAX, th = rng() * 2 * Math.PI;
    pts.push(r * Math.cos(th), r * Math.sin(th), (rng() - 0.5) * 2.0, 0.9, 0.7, 0.75, 0.95, 0.18 + 0.2 * rng());
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
  return {
    points: new Float32Array(pts),
    count: pts.length / 8,
    guide: new Float32Array(guide),
    ranges,
    sunPos,
    labels: [
      { name: "◎ Galactic Centre (Sgr A*)", p: [0, 0, 0] },
      { name: "☉ Sun — you are here (~26,700 ly out)", p: sunPos, sun: true },
      { name: "Perseus Arm", p: [-30, 14, 0] },
      { name: "Sagittarius Arm", p: [18, -22, 0] },
      { name: "Sun's orbit ≈ 26,700 ly", p: [GAL_SUN_R * Math.cos(-0.5), GAL_SUN_R * Math.sin(-0.5), 0] },
    ],
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
  const { STAR_COUNT, STAR_STRIDE, STARS_PACKED } = starCat;
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

export function buildNeighbourhoodModel(starCat) {
  const { STAR_COUNT, STAR_STRIDE, STARS_PACKED, NAMED_STARS } = starCat;
  const pts = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const ra = STARS_PACKED[i * STAR_STRIDE];
    const dec = STARS_PACKED[i * STAR_STRIDE + 1];
    const mag = STARS_PACKED[i * STAR_STRIDE + 2];
    const bv = STARS_PACKED[i * STAR_STRIDE + 3];
    const dist = STARS_PACKED[i * STAR_STRIDE + 4];
    if (dist == null || !(dist > 0)) continue;
    const [l, b] = equToGal(ra, dec);
    const d = dist / LOCAL_UNIT_LY, cb = Math.cos(b * D2R);
    const x = d * cb * Math.cos(l * D2R), y = d * cb * Math.sin(l * D2R), z = d * Math.sin(b * D2R);
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
    const [l, b] = equToGal(s.ra, s.dec);
    const d = s.dist / LOCAL_UNIT_LY, cb = Math.cos(b * D2R);
    named.push({
      name: `${s.name} · ${s.dist < 100 ? s.dist.toFixed(1) : Math.round(s.dist)} ly`,
      p: [d * cb * Math.cos(l * D2R), d * cb * Math.sin(l * D2R), d * Math.sin(b * D2R)],
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
