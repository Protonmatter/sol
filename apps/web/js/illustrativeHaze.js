/** Illustrative atmospheric haze columns for the distant, non-physical sphere path.
 *
 * That path has no numerical transfer, so a body with an atmosphere would render
 * as its surface map alone: Earth's ocean comes out almost black because none of
 * the skylight that dominates its real appearance from space is present. These
 * are the column optical depths the display haze needs, taken from the same
 * admitted profile the qualified transport uses, so the illustrative view cannot
 * drift from the atmosphere description. Nothing here enters that transport, and
 * this module is deliberately separate from the pinned optics source.
 */

/** @typedef {import('./atmosphereOptics.js').AtmosphereProfile} AtmosphereProfile */

/** @param {unknown} value @param {string} name @returns {number} */
function positive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite non-negative number`);
  return value;
}

export const HAZE_UNIFORMS = Object.freeze(['u_hazeRayleighTau', 'u_hazeAerosol']);

/** Rayleigh column per display wavelength, then the aerosol column, its single-scattering
 * albedo and its asymmetry. Each column is the profile's sea-level coefficient times its own
 * scale height, which is the vertical column of an exponential atmosphere. A body with no
 * admitted profile returns zeros, which disables the haze rather than inventing one.
 * @param {Readonly<AtmosphereProfile>|null} profile
 * @returns {{u_hazeRayleighTau: number[], u_hazeAerosol: number[]}} */
export function hazeUniformValues(profile) {
  if (!profile) return {u_hazeRayleighTau: [0, 0, 0], u_hazeAerosol: [0, 0, 0]};
  const scale = positive(profile.rayleighScaleHeightKm, 'Rayleigh scale height');
  const rayleigh = [...profile.betaRayleighKm].map(beta => positive(beta, 'Rayleigh extinction') * scale);
  if (rayleigh.length !== 3) throw new RangeError('Rayleigh extinction requires three display wavelengths');
  const aerosol = positive(profile.betaAerosolExtinctionKm[0], 'aerosol extinction')
    * positive(profile.aerosolScaleHeightKm, 'aerosol scale height');
  const albedo = positive(profile.aerosolSingleScatteringAlbedo[0], 'aerosol single-scattering albedo');
  const asymmetry = profile.aerosolG;
  if (!Number.isFinite(asymmetry) || Math.abs(asymmetry) >= 1) throw new RangeError('aerosol asymmetry outside admitted envelope');
  return {u_hazeRayleighTau: rayleigh, u_hazeAerosol: [aerosol, albedo, asymmetry]};
}

/** @param {WebGL2RenderingContext} gl @param {Record<string,WebGLUniformLocation|null>} locations
 * @param {Readonly<AtmosphereProfile>|null} profile */
export function setHazeUniforms(gl, locations, profile) {
  const values = hazeUniformValues(profile);
  for (const [name, value] of Object.entries(values)) {
    const location = locations[name];
    if (location) gl.uniform3fv(location, new Float32Array(value));
  }
  return values;
}
