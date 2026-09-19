// Catalogue solar photometry. These numbers label the Sun; they do not drive the globe.

export const L_SUN_W = 3.828e26;
export const SOLAR_CONSTANT_WM2 = 1361;
export const V_SUN_1AU = -26.74;

/** Irradiance at heliocentric distance r, S(r) = S0 / r². Null when r is not a usable AU. */
export function irradianceWm2(distanceAu) {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) return null;
  return SOLAR_CONSTANT_WM2 / (distanceAu * distanceAu);
}

/** Apparent V of the Sun as seen from Earth-Sun distance r. V☉(1 AU) = −26.74. */
export function apparentVSun(distanceAu) {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) return null;
  return V_SUN_1AU + 5 * Math.log10(distanceAu);
}

export function formatIrradiance(distanceAu) {
  const s = irradianceWm2(distanceAu);
  return s == null ? null : `${s.toLocaleString('en-US', { maximumFractionDigits: 0 })} W/m²`;
}

export function formatApparentV(distanceAu) {
  const v = apparentVSun(distanceAu);
  return v == null ? null : v.toFixed(2);
}
