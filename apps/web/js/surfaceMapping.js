// Pure reference-map math. These conventions describe a renderer transform;
// they never establish source coverage, registration or scientific qualification.

/** @typedef {{primeMeridianU?:number, longitudeDirection?:"east"|"west",
 * latitudeType?:"planetocentric"|"planetographic"|"parametric",
 * latitudeBounds?:ReadonlyArray<number>, uvScale?:ReadonlyArray<number>,
 * uvOffset?:ReadonlyArray<number>}} SurfaceMappingOptions */

/** @type {Readonly<Required<SurfaceMappingOptions>>} */
export const DEFAULT_SURFACE_MAPPING = Object.freeze({
  primeMeridianU: 0.5,
  longitudeDirection: "east",
  latitudeType: "planetocentric",
  latitudeBounds: Object.freeze([-90, 90]),
  uvScale: Object.freeze([1, 1]),
  uvOffset: Object.freeze([0, 0]),
});

const MAPPING_FIELDS = Object.keys(DEFAULT_SURFACE_MAPPING);
/** @param {unknown} value @returns {value is number} */
const finiteNumber = value => typeof value === "number" && Number.isFinite(value);

/**
 * Map the unit-sphere mesh position before its ellipsoid scale to a north-top
 * source grid. axisRatio is polar/equatorial radius. Positive longitude in the
 * mesh is +x toward +y; the source can use either longitude direction.
 *
 * Bounds describe source latitude coverage, not a stretch to the entire globe.
 * Outside coverage, v remains outside [0,1] and inCoverage is false: callers must
 * use an explicit fallback/mask, never clamp that sample into an observed cap.
 * Longitude is indeterminate at a pole; use the prime-meridian column there.
 *
 * @param {ArrayLike<number>} position
 * @param {SurfaceMappingOptions} [mapping]
 * @param {number} [axisRatio]
 * @returns {{u:number,v:number,inCoverage:boolean}}
 */
export function surfaceUv(position, mapping = DEFAULT_SURFACE_MAPPING, axisRatio = 1) {
  if (!position || typeof position !== "object" || position.length !== 3
      || !Array.from(position).every(finiteNumber)) throw new RangeError("position requires three finite coordinates");
  const magnitude = Math.max(...Array.from(position, Math.abs));
  if (magnitude === 0) throw new RangeError("position must have a nonzero direction");
  if (!finiteNumber(axisRatio) || axisRatio <= 0) throw new RangeError("axisRatio must be finite and positive");
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)
      || Object.keys(mapping).some(key => !MAPPING_FIELDS.includes(key))) throw new TypeError("invalid surface mapping configuration");
  const { primeMeridianU, longitudeDirection, latitudeType, latitudeBounds, uvScale, uvOffset } = { ...DEFAULT_SURFACE_MAPPING, ...mapping };
  if (!finiteNumber(primeMeridianU) || primeMeridianU < 0 || primeMeridianU > 1) throw new RangeError("primeMeridianU must lie in [0, 1]");
  if (!["east", "west"].includes(longitudeDirection)) throw new RangeError("invalid longitudeDirection");
  if (!["parametric", "planetocentric", "planetographic"].includes(latitudeType)) throw new RangeError("invalid latitudeType");
  if (!Array.isArray(latitudeBounds) || latitudeBounds.length !== 2 || !latitudeBounds.every(finiteNumber)
      || latitudeBounds[0] < -90 || latitudeBounds[1] > 90 || latitudeBounds[0] >= latitudeBounds[1]) throw new RangeError("invalid latitudeBounds");
  if (![uvScale, uvOffset].every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(finiteNumber))
      || uvScale.some((scale, axis) => scale <= 0 || !Number.isFinite(scale + uvOffset[axis])
        || uvOffset[axis] >= 1 || scale + uvOffset[axis] <= 0)) throw new RangeError("invalid UV image window");
  // Scaling first avoids overflow/underflow without changing the direction.
  const [x, y, z] = Array.from(position, value => value / magnitude);
  const radial = Math.hypot(x, y);
  const longitude = radial === 0 ? 0 : Math.atan2(y, x);
  const unwrappedU = primeMeridianU + (longitudeDirection === "east" ? 1 : -1) * longitude / (2 * Math.PI);
  const latitude = (latitudeType === "planetographic" ? Math.atan2(z, axisRatio * radial)
    : latitudeType === "planetocentric" ? Math.atan2(axisRatio * z, radial)
      : Math.atan2(z, radial)) * 180 / Math.PI;
  const [south, north] = latitudeBounds;
  const u = (unwrappedU - Math.floor(unwrappedU)) * uvScale[0] + uvOffset[0];
  const v = (north - latitude) / (north - south) * uvScale[1] + uvOffset[1];
  return { u, v, inCoverage: latitude >= south && latitude <= north && u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

/** @param {number} value */
function unitChannel(value) {
  if (!finiteNumber(value) || value < 0 || value > 1) throw new RangeError("color channel must lie in [0, 1]");
  return value;
}

/** Decode a normalized sRGB channel; does not decode alpha or measured data. @param {number} value */
export function srgbToLinear(value) {
  const channel = unitChannel(value);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Encode a normalized linear-light channel once, after shading/composition. @param {number} value */
export function linearToSrgb(value) {
  const channel = unitChannel(value);
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

// Visual twilight transition ending at solar altitude -6 degrees. This is a
// display mask for a reference composite, not a street-light or weather forecast.
export const NIGHT_LIGHT_FULL_COSINE = -Math.sin(6 * Math.PI / 180);

/** @param {number} cosZenith */
export function nightLightWeight(cosZenith) {
  if (!finiteNumber(cosZenith) || cosZenith < -1 || cosZenith > 1) throw new RangeError("cosZenith must lie in [-1, 1]");
  const t = Math.max(0, Math.min(1, cosZenith / NIGHT_LIGHT_FULL_COSINE));
  return t * t * (3 - 2 * t);
}
