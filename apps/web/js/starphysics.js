// Derived stellar physics for the star catalogue — the one place these formulas live.
// Inputs are the measured Hipparcos quantities in starcatalog.js (V mag, B−V, distance);
// everything here is DERIVED and labelled so in the UI:
//   • absolute magnitude / luminosity — from V + distance (well-founded)
//   • effective temperature — from B−V via Ballesteros (2012), ~±5 % for normal stars
//   • radius — Stefan–Boltzmann from L and Teff (well-founded given those)
//   • mass — main-sequence mass–luminosity ESTIMATE only; giants/dwarfs deviate.
// tools/validate_star_catalog.py mirrors these formulas and spot-checks them against
// literature values, so the two implementations cannot drift silently.

const LY_PER_PC = 3.2615637772;
const SUN_TEFF_K = 5772;
const SUN_MBOL = 4.74;

// Bolometric correction BC_V as a function of B−V (piecewise linear through standard
// values; adequate for catalogue display, not for stellar-interior work).
const BC_TABLE = [
  [-0.30, -2.9], [-0.20, -1.9], [-0.10, -0.85], [0.00, -0.21], [0.30, -0.09],
  [0.65, -0.07], [0.82, -0.19], [1.10, -0.45], [1.42, -1.24], [1.70, -2.30], [2.00, -3.30],
];

export function bolometricCorrection(bv) {
  if (bv == null || !Number.isFinite(bv)) return null;
  const t = Math.max(BC_TABLE[0][0], Math.min(BC_TABLE[BC_TABLE.length - 1][0], bv));
  for (let i = 1; i < BC_TABLE.length; i++) {
    const [x0, y0] = BC_TABLE[i - 1], [x1, y1] = BC_TABLE[i];
    if (t <= x1) return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
  }
  return BC_TABLE[BC_TABLE.length - 1][1];
}

// Ballesteros (2012): Teff from B−V, valid for roughly the whole catalogue range.
export function teffK(bv) {
  if (bv == null || !Number.isFinite(bv)) return null;
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

export function absoluteMagV(vmag, distLy) {
  if (distLy == null || !(distLy > 0)) return null;
  return vmag - 5 * Math.log10(distLy / LY_PER_PC / 10);
}

// Bolometric luminosity in L☉ (V + BC route). Null when distance is unknown.
export function luminositySun(vmag, bv, distLy) {
  const mv = absoluteMagV(vmag, distLy);
  if (mv == null) return null;
  const bc = bolometricCorrection(bv) ?? 0;
  return Math.pow(10, (SUN_MBOL - (mv + bc)) / 2.5);
}

// Stefan–Boltzmann radius in R☉ from L and Teff.
export function radiusSun(lumSun, teff) {
  if (lumSun == null || teff == null || !(teff > 0)) return null;
  return Math.sqrt(lumSun) * Math.pow(SUN_TEFF_K / teff, 2);
}

// Main-sequence mass–luminosity ESTIMATE (M☉). Honest limits: real per-star masses are
// only measured in binaries; for giants/supergiants/white dwarfs this relation is wrong,
// so callers must present it as "≈ (main-sequence estimate)".
export function massEstimateSun(lumSun) {
  if (lumSun == null || !(lumSun > 0)) return null;
  if (lumSun < 0.033) return Math.pow(lumSun / 0.23, 1 / 2.3);
  if (lumSun < 16) return Math.pow(lumSun, 1 / 4);
  if (lumSun < 1.7e5) return Math.pow(lumSun / 1.4, 1 / 3.5);
  return lumSun / 3.2e4;
}

// B−V → display RGB (blackbody-ish tint, normalized so no channel exceeds 1).
export function bvToRGB(bv) {
  const t = bv == null ? 0.65 : Math.max(-0.4, Math.min(2.0, bv));
  let r, g, b;
  if (t < 0.0) { r = 0.68 + 0.4 * (t + 0.4); g = 0.78 + 0.3 * (t + 0.4); b = 1.0; }
  else if (t < 0.4) { r = 0.84 + 0.4 * t; g = 0.90 + 0.18 * t; b = 1.0; }
  else if (t < 0.8) { r = 1.0; g = 0.97 - 0.2 * (t - 0.4); b = 1.0 - 0.55 * (t - 0.4); }
  else if (t < 1.4) { r = 1.0; g = 0.89 - 0.35 * (t - 0.8); b = 0.78 - 0.6 * (t - 0.8); }
  else { r = 1.0; g = 0.68 - 0.25 * (t - 1.4); b = 0.42 - 0.2 * (t - 1.4); }
  return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];
}

// Equatorial (J2000 deg) → galactic (l, b, deg). Standard IAU rotation (same constants
// as celestial.js's inverse galToEqu).
const NGP_RA = 192.85948 * Math.PI / 180;
const NGP_DEC = 27.12825 * Math.PI / 180;
const L_NCP = 122.93192 * Math.PI / 180;

export function equToGal(raDeg, decDeg) {
  const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
  const sinB =
    Math.sin(NGP_DEC) * Math.sin(dec) +
    Math.cos(NGP_DEC) * Math.cos(dec) * Math.cos(ra - NGP_RA);
  const b = Math.asin(Math.max(-1, Math.min(1, sinB)));
  const y = Math.cos(dec) * Math.sin(ra - NGP_RA);
  const x =
    Math.cos(NGP_DEC) * Math.sin(dec) -
    Math.sin(NGP_DEC) * Math.cos(dec) * Math.cos(ra - NGP_RA);
  const l = (L_NCP - Math.atan2(y, x)) * 180 / Math.PI;
  return [((l % 360) + 360) % 360, b * 180 / Math.PI];
}
