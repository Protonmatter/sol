// Factual physical database for the Sun, the eight planets, and the Moon.
//
// Sources: NASA Planetary Fact Sheets (nssdc.gsfc.nasa.gov) and the IAU Working Group on
// Cartographic Coordinates and Rotational Elements 2015 report (Archinal et al. 2018) for the
// spin-axis orientation and rotation rate. These are TIME-INDEPENDENT constants — the engine
// (VSOP2013 / ELP-MPP02) supplies the time-varying positions; this table supplies the body's
// size, shape, spin, gravity, field, and atmosphere. Used by the 3-D renderer to orient each
// body's axis and animate its rotation, and by the detail panel to state the facts.
//
// IAU pole (poleRaDeg/poleDecDeg) is the north-pole direction in the ICRS (≈ equatorial J2000)
// frame; w0Deg + wDotDegPerDay give the prime-meridian rotation W(d) = w0 + wDot·d, with d the
// number of days (TT) from J2000 — wDot is negative for retrograde rotators (Venus, Uranus).
// rotationHours is the sidereal rotation period (negative = retrograde) for human-readable display.

export const SUN_RADIUS_KM = 695700;
export const AU_KM = 149597870.7;

/** @typedef {{
 *  radiusKm:number, polarKm:number, massKg:number, densityGcm3:number,
 *  gravity:number, escapeKms:number, rotationHours:number, tiltDeg:number,
 *  poleRaDeg:number, poleDecDeg:number, w0Deg:number, wDotDegPerDay:number,
 *  magDipoleEarth:number, magnetosphere:boolean, atmosphere:{pressureBar:number,composition:string},
 *  albedo:number, meanTempK:number, style:string, color:[number,number,number],
 *  rings?:{innerKm:number, outerKm:number, gaps?:[number,number][]}, blurb:string }} BodyPhys */

/** @type {Record<string, BodyPhys>} */
export const BODY = {
  Sun: {
    radiusKm: 695700, polarKm: 695700, massKg: 1.9885e30, densityGcm3: 1.408,
    gravity: 274.0, escapeKms: 617.5, rotationHours: 609.12 /* 25.38 d Carrington sidereal */, tiltDeg: 7.25,
    poleRaDeg: 286.13, poleDecDeg: 63.87, poleRaDotDegPerCty: 0.0, poleDecDotDegPerCty: 0.0, w0Deg: 84.176, wDotDegPerDay: 14.1844,
    magDipoleEarth: 0, magnetosphere: true,
    atmosphere: { pressureBar: 0, composition: "H₂ plasma (73% H, 25% He by mass)" },
    albedo: 0, meanTempK: 5772, style: "sun", color: [1.0, 0.83, 0.36],
    blurb: "A G2V main-sequence star; luminosity 3.828×10²⁶ W. Rotates differentially (~25 d equator, ~34 d poles). Surface granulation, sunspots, an X-ray corona at ~1–3 MK, and a continuous solar wind.",
  },
  Mercury: {
    radiusKm: 2439.7, polarKm: 2439.7, massKg: 3.301e23, densityGcm3: 5.427,
    gravity: 3.70, escapeKms: 4.25, rotationHours: 1407.6 /* 58.646 d, 3:2 spin–orbit */, tiltDeg: 0.034,
    poleRaDeg: 281.0103, poleDecDeg: 61.4155, poleRaDotDegPerCty: -0.0328, poleDecDotDegPerCty: -0.0049, w0Deg: 329.5988, wDotDegPerDay: 6.1385108,
    magDipoleEarth: 0.0006, magnetosphere: true,
    atmosphere: { pressureBar: 1e-15, composition: "trace exosphere (O, Na, H, He, K)" },
    albedo: 0.142, meanTempK: 440, style: "cratered", color: [0.62, 0.57, 0.50],
    blurb: "Airless, heavily cratered, 3:2 spin–orbit resonance. A weak global dipole (~1% of Earth's) sustains a small magnetosphere.",
  },
  Venus: {
    radiusKm: 6051.8, polarKm: 6051.8, massKg: 4.867e24, densityGcm3: 5.243,
    gravity: 8.87, escapeKms: 10.36, rotationHours: -5832.5 /* retrograde, 243.025 d */, tiltDeg: 177.36,
    poleRaDeg: 272.76, poleDecDeg: 67.16, poleRaDotDegPerCty: 0.0, poleDecDotDegPerCty: 0.0, w0Deg: 160.20, wDotDegPerDay: -1.4813688,
    magDipoleEarth: 0, magnetosphere: false,
    atmosphere: { pressureBar: 92, composition: "96.5% CO₂, 3.5% N₂; sulfuric-acid clouds" },
    albedo: 0.689, meanTempK: 737, style: "venus", color: [0.93, 0.87, 0.66],
    blurb: "A runaway greenhouse: 92 bar of CO₂, 737 K surface. Rotates retrograde once per 243 days — slower than its year. No intrinsic magnetic field (only an induced one).",
  },
  Earth: {
    radiusKm: 6378.14, polarKm: 6356.75, massKg: 5.972e24, densityGcm3: 5.514,
    gravity: 9.80, escapeKms: 11.19, rotationHours: 23.9345, tiltDeg: 23.44,
    poleRaDeg: 0.0, poleDecDeg: 90.0, poleRaDotDegPerCty: -0.641, poleDecDotDegPerCty: -0.557, w0Deg: 190.147, wDotDegPerDay: 360.9856235,
    // Earth's axis does not drift in a straight line: it precesses around the ECLIPTIC pole on a
    // ~25,770-year cone of half-angle ε. The IAU's linear α0/δ0 rates above are the tangent to
    // that cone at J2000 and are only intended for use near it — run backwards they push δ0 past
    // 90°, which is not a declination at all (at −1000 yr the linear form gives 95.6°). Since the
    // date slider spans ±5000 years, the cone is modelled directly; it agrees with the IAU rates
    // to 0.001° over the first few centuries and stays physical across the whole span.
    // Validated against the pole star of the era: at −4800 yr it lands 0.26° from Thuban.
    precession: { obliquityDeg: 23.43928, rateArcsecPerYear: 50.2879, lon0Deg: 90 },
    magDipoleEarth: 1.0, magnetosphere: true,
    atmosphere: { pressureBar: 1.0, composition: "78% N₂, 21% O₂, 1% Ar + H₂O" },
    albedo: 0.367, meanTempK: 288, style: "earth", color: [0.30, 0.52, 0.86],
    blurb: "Liquid-water oceans, a nitrogen–oxygen atmosphere, and a strong dipole field (the reference, 8×10²² A·m²) driving a protective magnetosphere and aurorae.",
  },
  Mars: {
    radiusKm: 3396.2, polarKm: 3376.2, massKg: 6.417e23, densityGcm3: 3.933,
    gravity: 3.71, escapeKms: 5.03, rotationHours: 24.6229, tiltDeg: 25.19,
    poleRaDeg: 317.681, poleDecDeg: 52.887, poleRaDotDegPerCty: -0.1061, poleDecDotDegPerCty: -0.0609, w0Deg: 176.630, wDotDegPerDay: 350.89198226,
    magDipoleEarth: 0, magnetosphere: false,
    atmosphere: { pressureBar: 0.00636, composition: "95% CO₂, 2.7% N₂, 1.6% Ar" },
    albedo: 0.170, meanTempK: 210, style: "mars", color: [0.82, 0.40, 0.26],
    blurb: "Thin CO₂ air, polar CO₂/water ice caps, iron-oxide dust. No global field today — only crustal remanent magnetism in the southern highlands.",
  },
  Jupiter: {
    radiusKm: 71492, polarKm: 66854, massKg: 1.898e27, densityGcm3: 1.326,
    gravity: 24.79, escapeKms: 59.5, rotationHours: 9.9259, tiltDeg: 3.13,
    poleRaDeg: 268.056595, poleDecDeg: 64.495303, poleRaDotDegPerCty: -0.006499, poleDecDotDegPerCty: 0.002413, w0Deg: 284.95, wDotDegPerDay: 870.536,
    magDipoleEarth: 20000, magnetosphere: true,
    atmosphere: { pressureBar: NaN, composition: "90% H₂, 10% He; NH₃/H₂O cloud decks" },
    albedo: 0.538, meanTempK: 165, style: "jupiter", color: [0.86, 0.76, 0.60],
    blurb: "The largest planet — visibly oblate (flattening 6.5%). Fastest rotation (9.9 h) drives zonal bands and the centuries-old Great Red Spot. A colossal magnetosphere ~20,000× Earth's dipole.",
  },
  Saturn: {
    radiusKm: 60268, polarKm: 54364, massKg: 5.683e26, densityGcm3: 0.687,
    gravity: 10.44, escapeKms: 35.5, rotationHours: 10.656, tiltDeg: 26.73,
    poleRaDeg: 40.589, poleDecDeg: 83.537, poleRaDotDegPerCty: -0.036, poleDecDotDegPerCty: -0.004, w0Deg: 38.90, wDotDegPerDay: 810.7939024,
    magDipoleEarth: 580, magnetosphere: true,
    atmosphere: { pressureBar: NaN, composition: "96% H₂, 3% He; NH₃ haze" },
    albedo: 0.499, meanTempK: 134, style: "saturn", color: [0.91, 0.83, 0.58],
    // Ring radii (km from Saturn's centre): D/C inner edge to the A-ring outer edge, with the
    // Cassini Division as a gap. (Saturn radius 60,268 km → rings span ~1.24–2.27 R.)
    rings: { innerKm: 74500, outerKm: 136780, gaps: [[117580, 122170]] },
    blurb: "Less dense than water. The most spectacular ring system — ice and rock from 1.2 to 2.3 Saturn-radii, split by the Cassini Division. Most oblate planet (flattening 9.8%).",
  },
  Uranus: {
    radiusKm: 25559, polarKm: 24973, massKg: 8.681e25, densityGcm3: 1.270,
    gravity: 8.69, escapeKms: 21.3, rotationHours: -17.24 /* retrograde */, tiltDeg: 97.77,
    poleRaDeg: 257.311, poleDecDeg: -15.175, poleRaDotDegPerCty: 0.0, poleDecDotDegPerCty: 0.0, w0Deg: 203.81, wDotDegPerDay: -501.1600928,
    magDipoleEarth: 50, magnetosphere: true,
    atmosphere: { pressureBar: NaN, composition: "83% H₂, 15% He, 2% CH₄ (methane → cyan)" },
    albedo: 0.488, meanTempK: 76, style: "uranus", color: [0.66, 0.88, 0.90],
    rings: { innerKm: 38000, outerKm: 51150 },
    blurb: "Tipped 98° — it rolls along its orbit on its side. Methane absorbs red light, giving its cyan hue. A field tilted 59° from the spin axis and offset from centre.",
  },
  Neptune: {
    radiusKm: 24764, polarKm: 24341, massKg: 1.024e26, densityGcm3: 1.638,
    gravity: 11.15, escapeKms: 23.5, rotationHours: 16.11, tiltDeg: 28.32,
    poleRaDeg: 299.36, poleDecDeg: 43.46, poleRaDotDegPerCty: 0.0, poleDecDotDegPerCty: 0.0, w0Deg: 253.18, wDotDegPerDay: 536.3128492,
    magDipoleEarth: 27, magnetosphere: true,
    atmosphere: { pressureBar: NaN, composition: "80% H₂, 19% He, 1.5% CH₄" },
    albedo: 0.442, meanTempK: 72, style: "neptune", color: [0.26, 0.40, 0.84],
    rings: { innerKm: 41900, outerKm: 62930 },
    blurb: "Deepest blue of the giants, with the strongest winds in the solar system (~2,000 km/h) and transient dark storms. A field tilted 47° and offset.",
  },
  Moon: {
    radiusKm: 1737.4, polarKm: 1736.0, massKg: 7.342e22, densityGcm3: 3.344,
    gravity: 1.62, escapeKms: 2.38, rotationHours: 655.72 /* synchronous, 27.322 d */, tiltDeg: 6.68,
    poleRaDeg: 269.9949, poleDecDeg: 66.5392, poleRaDotDegPerCty: 0.0031, poleDecDotDegPerCty: 0.013, w0Deg: 38.3213, wDotDegPerDay: 13.17635815,
    magDipoleEarth: 0, magnetosphere: false,
    // Synchronous rotation: the spin period above EQUALS the orbital period, which is what
    // "tidally locked" means — the same hemisphere faces Earth. It does not mean the Moon is
    // motionless: it still turns once per orbit in an inertial frame, which is why it visibly
    // rotates in this view. The libration figures are the real monthly wobble (eccentric orbit
    // -> longitude; 6.68° axial tilt -> latitude) that exposes 59% of the surface over time.
    tidalLock: { orbitalPeriodDays: 27.322, librationLonDeg: 7.9, librationLatDeg: 6.7, visibleFraction: 0.59 },
    atmosphere: { pressureBar: 3e-15, composition: "tenuous exosphere (He, Ar, Na)" },
    albedo: 0.136, meanTempK: 250, style: "moon", color: [0.55, 0.54, 0.52],
    blurb: "Earth's tidally-locked companion: dark basaltic maria, bright cratered highlands, no atmosphere or global field.",
  },
};

export const PLANET_ORDER = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

// Integer style id passed to the GPU shader (one switch branch per surface type).
export const STYLE_ID = {
  sun: 0, cratered: 1, venus: 2, earth: 3, mars: 4,
  jupiter: 5, saturn: 6, uranus: 7, neptune: 8, moon: 9,
  // Moon styles that modulate the body's own colour rather than replacing it (orreryShaders).
  moonRock: 10, moonHaze: 11,
};

const D2R = Math.PI / 180;
const OBLIQUITY_J2000 = 23.43928 * D2R;

// Equatorial (ICRS / J2000) unit direction → ecliptic-J2000 unit vector (the renderer's world
// frame). Rotation by −ε about the x-axis (vernal-equinox) axis.
export function equToEcl(raDeg, decDeg) {
  const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
  const ex = Math.cos(dec) * Math.cos(ra);
  const ey = Math.cos(dec) * Math.sin(ra);
  const ez = Math.sin(dec);
  const c = Math.cos(OBLIQUITY_J2000), s = Math.sin(OBLIQUITY_J2000);
  return [ex, ey * c + ez * s, -ey * s + ez * c];
}

// Days (TT) from J2000.0 for a Unix time. Used for the IAU rotation phase W(d).
export function daysFromJ2000(unixSeconds) {
  const jdUtc = unixSeconds / 86400 + 2440587.5;
  const jdTt = jdUtc + 69.2 / 86400; // ΔT ≈ 69 s near the present; immaterial to the spin phase
  return jdTt - 2451545.0;
}

/**
 * The IAU pole (α0, δ0) in degrees at a given time.
 *
 * The WGCCRE elements are not constants: α0 and δ0 carry secular rates in T, Julian centuries
 * from J2000. For Earth those rates ARE axial precession — −0.641°/cty in RA and −0.557°/cty in
 * declination — so pinning the pole at its J2000 value quietly costs ~0.6° per century. The
 * 3-D view's date slider spans ±5000 years, where that reaches ~32°: the axis, the seasons it
 * implies, and every surface feature's lighting would all be visibly wrong.
 *
 * These linear rates are themselves an approximation the IAU states is intended for use near
 * J2000; real precession carries the pole around a ~23.4° circle over ~26,000 years, so a
 * straight line diverges from it at the far ends of the slider. Applying them is strictly
 * better than holding the pole fixed, and honest about being a first-order term, not a
 * precession model.
 */
export function poleAt(phys, unixSeconds) {
  const days = unixSeconds == null ? 0 : daysFromJ2000(unixSeconds);
  const pr = phys.precession;
  if (pr) {
    // Walk the pole around the ecliptic pole, then convert back to the equatorial J2000 frame the
    // rest of the IAU machinery speaks. Ecliptic longitude DECREASES with time (the equinoxes
    // precess westward) — the sign that puts the pole on Thuban in the third millennium BCE.
    const eps = pr.obliquityDeg * D2R;
    const lon = (pr.lon0Deg - (pr.rateArcsecPerYear / 3600) * (days / 365.25)) * D2R;
    const lat = Math.PI / 2 - eps;
    const cl = Math.cos(lat);
    const v = [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
    const c = Math.cos(eps), s = Math.sin(eps);
    const e = [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
    let ra = Math.atan2(e[1], e[0]) / D2R;
    if (ra < 0) ra += 360;
    return [ra, Math.asin(Math.max(-1, Math.min(1, e[2]))) / D2R];
  }
  // Everyone else: the IAU linear rates. Their magnitudes are small enough (Mars, the largest at
  // −0.061°/cty in declination, moves 3° over the slider's full range) that the tangent stays a
  // good approximation and δ0 never leaves range.
  const T = days / 36525;
  return [
    phys.poleRaDeg + (phys.poleRaDotDegPerCty || 0) * T,
    phys.poleDecDeg + (phys.poleDecDotDegPerCty || 0) * T,
  ];
}

// The body's spin-axis (north-pole) direction in the world (ecliptic-J2000) frame. Pass a time
// to include the secular drift above; omit it for the J2000 direction.
export function poleVector(phys, unixSeconds) {
  const [ra, dec] = poleAt(phys, unixSeconds);
  return equToEcl(ra, dec);
}

// The IAU prime-meridian rotation angle W (radians) at a Unix time — drives the visible spin.
export function rotationPhase(phys, unixSeconds) {
  const d = daysFromJ2000(unixSeconds);
  return ((phys.w0Deg + phys.wDotDegPerDay * d) % 360) * Math.PI / 180;
}
