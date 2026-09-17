// Dimensioned, immutable optical reference parameters. These do not evolve engine
// state or represent current weather. Qualification: OPTICS_SOURCES.md / RFC 0005.

/** @typedef {{body:string,version:string,classification:string,radiusKm:number,topKm:number,rayleighScaleHeightKm:number,aerosolScaleHeightKm:number,betaRayleighKm:readonly number[],betaAerosolExtinctionKm:readonly number[],aerosolSingleScatteringAlbedo:readonly number[],aerosolG:number,surfaceRefractivity:number,sourceRefs:readonly string[],limitations:string}} AtmosphereProfile */
/** @typedef {{cameraBodyKm:readonly number[],sunDirectionBody:readonly number[],polarRatio:number,solarDistanceAu:number,exposure:number}} AtmosphereOptions */

const WAVELENGTHS_NM = [680, 550, 440];
const KB = 1.380649e-23;
/** NASA PSG handbook CO2 dispersion at standard pressure/temperature. @param {number} wavelengthNm */
function co2Refractivity(wavelengthNm) {
  const inverseLambda2 = (wavelengthNm / 1000) ** -2;
  return .06991 / (166.175 - inverseLambda2) + .0014472 / (79.609 - inverseLambda2)
    + .0000642941 / (56.3064 - inverseLambda2) + .0000521306 / (46.0196 - inverseLambda2);
}
/** @param {number} wavelengthNm */
function co2ScatteringKm(wavelengthNm) {
  const refractivity = co2Refractivity(wavelengthNm);
  const n2 = (1 + refractivity) ** 2, referenceDensity = 101325 / (KB * 288.15);
  const crossSectionM2 = 24 * Math.PI ** 3 / ((wavelengthNm * 1e-9) ** 4 * referenceDensity ** 2)
    * ((n2 - 1) / (n2 + 2)) ** 2;
  return crossSectionM2 * (610 / (KB * 210)) * 1000;
}

/** @param {AtmosphereProfile} profile @returns {Readonly<AtmosphereProfile>} */
function immutableProfile(profile) {
  for (const value of Object.values(profile)) if (Array.isArray(value)) Object.freeze(value);
  return Object.freeze(profile);
}

const PROFILES = Object.freeze({
  Earth: immutableProfile({
    body: 'Earth', version: 'earth-clear-reference.v1', classification: 'reference-single-scattering',
    radiusKm: 6378.137, topKm: 100, rayleighScaleHeightKm: 8, aerosolScaleHeightKm: 1.2,
    betaRayleighKm: WAVELENGTHS_NM.map(nm => .00124062 * (nm / 1000) ** -4),
    betaAerosolExtinctionKm: [1, 1, 1].map(() => .005328 / 1.2),
    aerosolSingleScatteringAlbedo: [.9, .9, .9], aerosolG: .8,
    surfaceRefractivity: .0000806051 + .0248099 / (132.274 - .55 ** -2) + .000174557 / (39.32957 - .55 ** -2),
    sourceRefs: ['https://ebruneton.github.io/precomputed_atmospheric_scattering/',
      'https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/demo/demo.cc',
      'https://psg.gsfc.nasa.gov/images/help/handbook.pdf'],
    limitations: 'Clear reference atmosphere; three wavelength display approximation, no ozone, clouds, multiple scattering or current weather.',
  }),
  Mars: immutableProfile({
    body: 'Mars', version: 'mars-thin-dust-reference.v1', classification: 'reference-single-scattering',
    radiusKm: 3396.19, topKm: 100, rayleighScaleHeightKm: 11.1, aerosolScaleHeightKm: 11.1,
    betaRayleighKm: WAVELENGTHS_NM.map(co2ScatteringKm),
    betaAerosolExtinctionKm: [1, 1, 1].map(() => .05 / 11.1),
    aerosolSingleScatteringAlbedo: [.94, .94, .94], aerosolG: .65,
    surfaceRefractivity: co2Refractivity(550) * (610 / 101325) * (288.15 / 210),
    sourceRefs: ['https://psg.gsfc.nasa.gov/helpatm.php', 'https://psg.gsfc.nasa.gov/images/help/handbook.pdf',
      'https://doi.org/10.1029/2009JE003350', 'https://descanso.jpl.nasa.gov/propagation/mars/MarsPub_sec4.pdf'],
    limitations: 'Thin grey-dust scenario, tau=0.05 and g=0.65 are model choices; no retrieved dust spectrum, sunset-color qualification, multiple scattering or current weather.',
  }),
});

/** @param {string} name @returns {Readonly<AtmosphereProfile>|null} */
export function getAtmosphereProfile(name) {
  return Object.hasOwn(PROFILES, name) ? PROFILES[name] : null;
}

export const ATMOSPHERE_PROFILE_ENCODING = 'atmosphere-profile-binary32-v1';

/** Identity only: retain the original physical profile and uniform upload path.
 * ECMAScript transcendental results can differ by a float64 ULP across runtimes.
 * Bind the binary32 values consumed by WebGL, including signed zero, instead.
 * Typed nodes prevent numbers, strings, arrays and objects sharing an encoding;
 * sorted object keys and big-endian hex words make the UTF-8 JSON deterministic.
 * @param {unknown} profile @returns {string} */
export function serializeAtmosphereProfile(profile) {
  const word = new DataView(new ArrayBuffer(4));
  /** @param {unknown} value @returns {unknown} */
  function encode(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new RangeError('Profile identity requires finite binary32 values');
      const rounded = Math.fround(value);
      if (!Number.isFinite(rounded)) throw new RangeError('Profile identity requires finite binary32 values');
      word.setFloat32(0, rounded, false);
      return ['binary32', word.getUint32(0, false).toString(16).padStart(8, '0')];
    }
    if (value === null) return ['null'];
    if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
    if (Array.isArray(value)) return ['array', Array.from(value, encode)];
    if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return ['object', Object.keys(value).sort().map(key => [key, encode(value[key])])];
    }
    throw new TypeError('Unsupported profile identity value');
  }
  return JSON.stringify({encoding: ATMOSPHERE_PROFILE_ENCODING, profile: encode(profile)});
}

/** @param {number} value @param {string} name @param {boolean} [zero] */
function positive(value, name, zero = false) {
  if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0)) throw new RangeError(`${name} must be finite and ${zero ? 'nonnegative' : 'positive'}`);
  return value;
}
/** @param {readonly number[]} v @param {string} name */
function vector(v, name) {
  if (v.length !== 3 || !v.every(Number.isFinite)) throw new RangeError(`${name} must be a finite 3-vector`);
  return [...v];
}
/** @param {readonly number[]} v */
function unit(v) {
  const copy = vector(v, 'direction'), length = positive(Math.hypot(...copy), 'direction length');
  return copy.map(x => x / length);
}
/** Beer-Lambert, coefficients km^-1 and distance km. @param {readonly number[]} coefficients @param {number} distanceKm */
export function atmosphericTransmission(coefficients, distanceKm) {
  positive(distanceKm, 'distance', true);
  return vector(coefficients, 'extinction').map(beta => Math.exp(-positive(beta, 'extinction', true) * distanceKm));
}
/** @param {number} mu */
export function rayleighPhase(mu) {
  if (!Number.isFinite(mu)) throw new RangeError('phase cosine must be finite');
  return 3 * (1 + Math.min(1, Math.max(-1, mu)) ** 2) / (16 * Math.PI);
}
/** Normalized HG particle phase approximation, not a Mie particle solver. @param {number} mu @param {number} g */
export function henyeyGreensteinPhase(mu, g) {
  if (!Number.isFinite(mu) || !Number.isFinite(g) || Math.abs(g) >= 1) throw new RangeError('finite cosine and |g| < 1 required');
  return (1 - g * g) / (4 * Math.PI * (1 + g * g - 2 * g * Math.min(1, Math.max(-1, mu))) ** 1.5);
}
/** @param {number} distanceAu */
export function solarIrradianceScale(distanceAu) { return 1 / positive(distanceAu, 'physical solar distance') ** 2; }

/** Exact unpolarized dielectric interface reference. No material inferred from RGB. @param {number} cosine @param {number} n1 @param {number} n2 */
export function dielectricFresnel(cosine, n1, n2) {
  positive(n1, 'incident index'); positive(n2, 'transmitted index');
  if (!Number.isFinite(cosine) || cosine < 0 || cosine > 1) throw new RangeError('incidence cosine must be in [0,1]');
  if (n1 === n2) return 0;
  const sin2 = (n1 / n2) ** 2 * (1 - cosine * cosine);
  if (sin2 >= 1) return 1;
  const transmittedCosine = Math.sqrt(1 - sin2);
  const rs = (n1 * cosine - n2 * transmittedCosine) / (n1 * cosine + n2 * transmittedCosine);
  const rp = (n2 * cosine - n1 * transmittedCosine) / (n2 * cosine + n1 * transmittedCosine);
  return .5 * (rs * rs + rp * rp);
}

/** Snell interface reference; normal points toward incident medium. Null is total internal reflection.
 * @param {readonly number[]} incident @param {readonly number[]} normal @param {number} n1 @param {number} n2 */
export function refractDirection(incident, normal, n1, n2) {
  const d = unit(incident), n = unit(normal), eta = positive(n1, 'incident index') / positive(n2, 'transmitted index');
  const cosine = -(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]);
  if (cosine < 0) throw new RangeError('normal must point toward incident medium');
  const discriminant = 1 - eta * eta * (1 - cosine * cosine);
  if (discriminant < 0) return null;
  return d.map((v, i) => eta * v + (eta * cosine - Math.sqrt(discriminant)) * n[i]);
}

export const ATMOSPHERE_UNIFORMS = Object.freeze(['u_atmosphereEnabled', 'u_atmosphereRadiusKm', 'u_atmosphereTopKm',
  'u_atmospherePolarRatio', 'u_atmosphereDensityScaleKm', 'u_atmosphereRayleighKm', 'u_atmosphereAerosolKm',
  'u_atmosphereAerosolSSA', 'u_atmosphereG', 'u_atmosphereCameraKm', 'u_atmosphereSunDirection',
  'u_atmosphereSolarScale', 'u_atmosphereExposure', 'u_atmosphereRefractionEnabled', 'u_atmosphereRefractivity']);

/** No displayed radius enters this API. Camera is inverse-rotated and uniformly converted to physical km, with no z-unflattening.
 * @param {Readonly<AtmosphereProfile>|null} profile @param {AtmosphereOptions} [options] */
export function atmosphereUniformValues(profile, options) {
  if (!profile) return {u_atmosphereEnabled: 0, u_atmosphereRefractionEnabled: 0};
  if (!options) throw new RangeError('enabled atmosphere requires geometry');
  const q = positive(options.polarRatio, 'polar ratio');
  if (q > 1.1 || q < .5) throw new RangeError('polar ratio outside admitted envelope');
  return {
    u_atmosphereEnabled: 1, u_atmosphereRadiusKm: profile.radiusKm, u_atmosphereTopKm: profile.topKm,
    u_atmospherePolarRatio: q, u_atmosphereDensityScaleKm: [profile.rayleighScaleHeightKm, profile.aerosolScaleHeightKm],
    u_atmosphereRayleighKm: [...profile.betaRayleighKm], u_atmosphereAerosolKm: [...profile.betaAerosolExtinctionKm],
    u_atmosphereAerosolSSA: [...profile.aerosolSingleScatteringAlbedo], u_atmosphereG: profile.aerosolG,
    u_atmosphereCameraKm: vector(options.cameraBodyKm, 'camera'), u_atmosphereSunDirection: unit(options.sunDirectionBody),
    u_atmosphereSolarScale: solarIrradianceScale(options.solarDistanceAu), u_atmosphereExposure: positive(options.exposure, 'display exposure', true),
    u_atmosphereRefractionEnabled: 1, u_atmosphereRefractivity: profile.surfaceRefractivity,
  };
}

/** @param {WebGL2RenderingContext} gl @param {Record<string,WebGLUniformLocation|null>} locations
 * @param {Readonly<AtmosphereProfile>|null} profile @param {AtmosphereOptions} [options] */
export function setAtmosphereUniforms(gl, locations, profile, options) {
  for (const [name, value] of Object.entries(atmosphereUniformValues(profile, options))) {
    const location = locations[name];
    if (location == null) continue;
    if (name === 'u_atmosphereEnabled' || name === 'u_atmosphereRefractionEnabled') gl.uniform1i(location, /** @type {number} */ (value));
    else if (Array.isArray(value)) {
      if (value.length === 2) gl.uniform2fv(location, value);
      else gl.uniform3fv(location, value);
    } else gl.uniform1f(location, value);
  }
}
