// Moon transit shadows and moon eclipses — the geometry only. Pure math: no GL, no DOM, no
// module state, no import of the moon table, so node can test it exactly as moonorbits.js is
// tested. orrery.js does the uniform plumbing; orreryShaders.js paints the result.
//
// WHY THIS FILE EXISTS AT ALL, RATHER THAN A FEW LINES IN THE RENDERER
// -------------------------------------------------------------------
// The 3-D view draws planets far larger than life and then INFLATES each satellite system by
// systemScale() so the inner moons clear the exaggerated disc (moonorbits.js explains that
// bargain). Io really sits 5.90 Jupiter radii out; on screen it is pushed to ~1.7 display radii.
// A shadow computed from those DISPLAY positions would appear at the wrong dates, cross the disc
// at the wrong rate, and land at the wrong latitude — a picture that looks like a telescope view
// and is not one. drawMoons already draws this distinction ("draw with the inflated offset, but
// light from the physical position"); everything here works from the PHYSICAL planetocentric
// offsets, and the results come back in FRACTIONS OF THE PLANET'S EQUATORIAL RADIUS, which are
// scale-invariant. The renderer can then paint them onto the exaggerated disc and the shadow
// lands exactly where it physically lands on the real one. In true-scale mode the display radius
// IS the physical radius and the same arithmetic is exact without any special case.
//
// FRAME. Everything here is in the planet's BODY frame — the frame the renderer's iauRotation()
// maps to, in which the spin axis is +z and the surface is the oblate spheroid
// (x² + y²)/a² + z²/c² = 1. Lengths may be in any single unit (the renderer passes AU); only
// ratios leave this module.
//
// THE OBLATENESS TRICK, used twice below. Let S = diag(1, 1, a/c). S maps the spheroid onto the
// sphere of radius a, and being linear it maps lines to lines and preserves incidence, so:
//   • "where does this ray strike the spheroid" becomes a sphere/ray quadratic under S, and
//   • "is this point inside the spheroid's shadow cylinder along â" becomes "is Sp within a of
//     the line through the origin along Sâ" — because the cylinder {x + tâ : x ∈ spheroid} maps
//     to {Sx + t·Sâ : Sx ∈ sphere}, a circular cylinder of radius a.
// Both are exact, not approximations. Jupiter is flattened 6.5%; treating it as a sphere put
// every off-equatorial shadow at a visibly wrong latitude, which is the whole point of drawing
// one from real geometry.

/**
 * The uniform budget — four simultaneous casters per planet. The shader carries two vec4 arrays
 * of this length, evaluated for every sphere in the scene, so the number is not free.
 *
 * MEASURED, not guessed. Sweeping the whole validated window (JD 2459219 → 2462859, i.e.
 * 2021-01 → 2030-12) at 15-minute steps for all five parent systems, the peak number of shadows
 * on one disc at one instant is:
 *
 *     Mars 2 · Jupiter 2 · Saturn 4 · Uranus 0 · Neptune 0
 *
 * and the busiest system is NOT the obvious one. Jupiter's famous triple transits do not fall in
 * this decade; Saturn's does, because the 2025 ring-plane crossing put the Sun in its equatorial
 * plane, and its inner moons then transit in bursts. A 2-minute re-scan of 2024-06 → 2026-06
 * confirms the peak: Enceladus, Tethys, Dione and Rhea are all on the disc together at
 * 2025-05-10T05:38Z, and five never occur. Uranus and Neptune contribute nothing at all — the
 * Uranian system is tipped ~98° so its moons' shadows sail past the poles at these epochs, and
 * Triton's steeply inclined orbit does the same at Neptune.
 *
 * Four is therefore exactly the observed maximum, not a margin over it. If a fifth ever does
 * arrive, moonShadowsOnPlanet drops the SMALLEST umbra rather than an arbitrary caster.
 */
export const MAX_MOON_SHADOWS = 4;

/**
 * @typedef {Object} MoonShadow
 * @property {string} name          Which moon casts it.
 * @property {[number,number,number]} center  Unit vector: where the shadow AXIS strikes the
 *   surface, in the renderer's unit-sphere object frame (so it is literally the fragment
 *   shader's `p` at the shadow's centre). Scale-invariant.
 * @property {[number,number,number]} moonPos Moon's physical planetocentric position, body
 *   frame, in equatorial radii.
 * @property {[number,number,number]} axis    Unit Sun→moon direction, body frame: the shadow's
 *   own axis, NOT the planet→Sun direction (see below).
 * @property {number} moonRadius    Moon radius in planet equatorial radii.
 * @property {number} sunAngularRadius  The Sun's angular radius seen from the moon, radians.
 * @property {number} distance      Moon centre to the struck surface point, in equatorial radii.
 * @property {number} umbra         Umbral radius there, in equatorial radii (0 if the cone has
 *   already closed — an annular transit; none of these moons do that from these distances).
 * @property {number} penumbra      Penumbral radius there, in equatorial radii.
 */

/**
 * Does this moon's shadow fall on its planet, and where?
 *
 * GEOMETRY, in full.
 *
 * Let d be the moon's physical planetocentric position and s the planet→Sun vector, both in the
 * body frame. The shadow travels along û = normalise(d − s): the Sun→moon direction, which is
 * NOT the planet→Sun direction. While a transit is in progress the moon is within about one
 * planet radius of that line, so the two differ by up to Rj/D = 9.2e−5 rad, and over the ~4.9 Rj
 * from Io down to Jupiter's cloud tops that is a ~30 km displacement — only 2% of the umbral
 * radius, but a SYSTEMATIC one, always directed away from the sub-solar point, and one extra
 * vec4 in the uniform block removes it entirely.
 *
 * The shadow's centre is where the ray d + tû first meets the surface. Under S (see the header)
 * that is the smaller root of |S d + t·S û|² = a². Requiring t > 0 is exactly the "moon between
 * Sun and planet" condition: with the moon behind the planet both roots are negative. The near
 * root is on the hemisphere facing the ray's origin, i.e. always the SUNLIT face. Because S is
 * linear and û is a unit vector, the same t is the true distance from the moon to that point,
 * so no unscaling is needed to get it.
 *
 * SHADOW SIZE. Let α = R_sun / |Sun→moon| be the Sun's angular radius seen from the moon
 * (3.08′ at Jupiter — the reason a Galilean shadow has a soft edge at all). The umbral cone
 * closes at half-angle (R_sun − R_moon)/D and the penumbral cone opens at (R_sun + R_moon)/D,
 * so at distance t behind the moon:
 *      r_umbra    = R_moon − t·(R_sun − R_moon)/D = R_moon·(1 + t/D) − t·α
 *      r_penumbra = R_moon + t·(R_sun + R_moon)/D = R_moon·(1 + t/D) + t·α
 * The shared (1 + t/D) factor is 1.00045 for Io on Jupiter, so it is dropped and the pair
 * reduces to R_moon ∓ t·α — the form the shader evaluates. For Io that gives a 1508 km umbral
 * radius and a 2135 km penumbral radius on Jupiter's cloud tops, i.e. a ~3000 km black core
 * inside a ~4300 km soft disc, on a globe of 71,492 km equatorial radius.
 *
 * Returns null when no shadow lands. NOTE the one omission: the test is that the shadow AXIS
 * strikes the planet, so the first and last moments of a transit — when only the penumbra
 * overlaps the extreme limb — are not drawn. That sliver is ~3% of the disc radius wide, lasts
 * seconds of a hours-long transit, and falls where the surface is edge-on to the eye.
 *
 * @param {[number,number,number]} moonOffset  Physical planetocentric moon position, body frame.
 * @param {[number,number,number]} sunOffset   Planet→Sun vector, body frame, same unit.
 * @param {{eqRadius:number, polarRadius:number, moonRadius:number, sunRadius:number}} geom
 * @returns {Omit<MoonShadow,"name">|null}
 */
export function moonShadowOnPlanet(moonOffset, sunOffset, geom) {
  const { eqRadius, polarRadius, moonRadius, sunRadius } = geom;
  if (!(eqRadius > 0) || !(polarRadius > 0) || !(sunRadius > 0)) return null;
  // Cheap rejection first: this runs for every catalogued moon of every drawn planet, every
  // frame (21 tests worst case). A moon at or behind the planet's terminator plane cannot put
  // a shadow on the sunlit face, and that is one dot product.
  if (moonOffset[0] * sunOffset[0] + moonOffset[1] * sunOffset[1] + moonOffset[2] * sunOffset[2] <= 0) {
    return null;
  }
  const sunDist = Math.hypot(sunOffset[0], sunOffset[1], sunOffset[2]);
  if (!(sunDist > 0)) return null;

  // Sun→moon: the shadow's own axis.
  const ax = moonOffset[0] - sunOffset[0];
  const ay = moonOffset[1] - sunOffset[1];
  const az = moonOffset[2] - sunOffset[2];
  const aLen = Math.hypot(ax, ay, az);
  if (!(aLen > 0)) return null;
  const axis = /** @type {[number,number,number]} */ ([ax / aLen, ay / aLen, az / aLen]);

  // Ray/spheroid intersection, done as ray/sphere in the S-scaled frame.
  const zScale = eqRadius / polarRadius;              // S = diag(1, 1, a/c)
  const dx = moonOffset[0], dy = moonOffset[1], dz = moonOffset[2] * zScale;
  const ux = axis[0], uy = axis[1], uz = axis[2] * zScale;
  const A = ux * ux + uy * uy + uz * uz;
  const B = 2 * (dx * ux + dy * uy + dz * uz);
  const C = dx * dx + dy * dy + dz * dz - eqRadius * eqRadius;
  const disc = B * B - 4 * A * C;
  if (!(disc > 0)) return null;                        // axis misses the globe
  const t = (-B - Math.sqrt(disc)) / (2 * A);          // near root = sunlit face
  if (!(t > 0)) return null;                           // moon is not between Sun and planet

  // The struck point in the scaled frame lies on the sphere of radius a, so dividing by a gives
  // a unit vector — and that is precisely the renderer's unit-sphere object coordinate, because
  // the model matrix scales that sphere by (a, a, c). No further conversion.
  const center = /** @type {[number,number,number]} */ ([
    (dx + t * ux) / eqRadius, (dy + t * uy) / eqRadius, (dz + t * uz) / eqRadius,
  ]);

  const alpha = sunRadius / aLen;                      // Sun's angular radius AT THE MOON
  const umbra = moonRadius - t * alpha;
  const penumbra = moonRadius + t * alpha;
  if (!(penumbra > 0)) return null;
  return {
    center,
    moonPos: [moonOffset[0] / eqRadius, moonOffset[1] / eqRadius, moonOffset[2] / eqRadius],
    axis,
    moonRadius: moonRadius / eqRadius,
    sunAngularRadius: alpha,
    distance: t / eqRadius,
    umbra: Math.max(umbra, 0) / eqRadius,
    penumbra: penumbra / eqRadius,
  };
}

/**
 * Every shadow currently on one planet's disc, strongest first, capped at MAX_MOON_SHADOWS.
 *
 * Ranked by umbral radius, so when a fifth caster ever appears it is the faintest smudge that is
 * dropped rather than an arbitrary one. `casters` carries only the moons the renderer is ACTUALLY
 * DRAWING this frame — see drawnMoonsFor() in orrery.js for why that set, not the full catalogue.
 *
 * @param {Array<{name:string, offset:[number,number,number], radius:number}>} casters
 * @param {[number,number,number]} sunOffset
 * @param {{eqRadius:number, polarRadius:number, sunRadius:number}} planet
 * @param {number} [max]
 * @returns {MoonShadow[]}
 */
export function moonShadowsOnPlanet(casters, sunOffset, planet, max = MAX_MOON_SHADOWS) {
  /** @type {MoonShadow[]} */
  const out = [];
  for (const c of casters) {
    const s = moonShadowOnPlanet(c.offset, sunOffset, {
      eqRadius: planet.eqRadius, polarRadius: planet.polarRadius,
      sunRadius: planet.sunRadius, moonRadius: c.radius,
    });
    if (s) out.push({ name: c.name, ...s });
  }
  out.sort((p, q) => q.umbra - p.umbra || q.penumbra - p.penumbra);
  return out.length > max ? out.slice(0, max) : out;
}

/**
 * Pack shadows into the two vec4 arrays SPHERE_FS declares, so the layout is decided once, here,
 * next to the geometry that fills it — and node can assert on it without a GL context.
 *
 *   pos[i]  = (moon position in equatorial radii, body frame ; moon radius in equatorial radii)
 *   axis[i] = (unit Sun→moon direction, body frame          ; the Sun's angular radius, radians)
 *
 * Unused slots are left zero. The shader never reads past u_moonShadowCount, but a NaN or stale
 * value in an unread slot is the kind of thing that surfaces later as a driver-specific bug.
 *
 * @param {MoonShadow[]} shadows
 * @param {number} [max]
 * @returns {{count:number, pos:Float32Array, axis:Float32Array}}
 */
export function packMoonShadows(shadows, max = MAX_MOON_SHADOWS) {
  const count = Math.min(shadows.length, max);
  const pos = new Float32Array(max * 4);
  const axis = new Float32Array(max * 4);
  for (let i = 0; i < count; i++) {
    const s = shadows[i];
    pos[i * 4] = s.moonPos[0]; pos[i * 4 + 1] = s.moonPos[1]; pos[i * 4 + 2] = s.moonPos[2];
    pos[i * 4 + 3] = s.moonRadius;
    axis[i * 4] = s.axis[0]; axis[i * 4 + 1] = s.axis[1]; axis[i * 4 + 2] = s.axis[2];
    axis[i * 4 + 3] = s.sunAngularRadius;
  }
  return { count, pos, axis };
}

/**
 * The other half of the same event: how much of the Sun a moon can still see when it passes
 * into its planet's shadow. 1 = full sunlight, 0 = deep umbra.
 *
 * This is the eclipse Rømer timed in 1676 to get the first finite speed of light, and it is the
 * same cone geometry as above with the roles swapped — the planet is now the occulter. The moon
 * is treated as a point (its centre either sees a given part of the Sun or does not); over the
 * ~3.4 minutes an eclipse ingress takes, resolving the moon's own disc would move the curve by
 * well under a minute, and nothing in this view is timed to that.
 *
 * OBLATENESS. The planet's shadow cylinder is elliptical in cross-section, which matters: the
 * Galilean orbits lie within ~0.5° of Jupiter's equator, where the shadow is at its WIDEST, so
 * a circular equatorial-radius approximation would keep them eclipsed too long whenever they
 * ride above or below the plane. The S trick from the header handles it exactly — the ellipse
 * becomes a circle of radius a in the scaled frame. The umbral convergence is then applied as a
 * uniform t·α shrink of that circle, which is the one approximation left here (an oblate body's
 * umbra is not a right circular cone; the residual is a fraction of a percent of the width).
 *
 * @param {[number,number,number]} moonOffset  Physical planetocentric moon position, body frame.
 * @param {[number,number,number]} sunOffset   Planet→Sun vector, body frame, same unit.
 * @param {{eqRadius:number, polarRadius:number, sunRadius:number}} planet
 * @returns {number} Fraction of the solar disc still reaching the moon, 0…1.
 */
export function sunlightOnMoon(moonOffset, sunOffset, planet) {
  const { eqRadius, polarRadius, sunRadius } = planet;
  if (!(eqRadius > 0) || !(polarRadius > 0) || !(sunRadius > 0)) return 1;
  const sunDist = Math.hypot(sunOffset[0], sunOffset[1], sunOffset[2]);
  if (!(sunDist > 0)) return 1;
  // Shadow axis: planet→antisolar. The planet is ~1e-4 of the way to the Sun compared with the
  // moon's own offset, so unlike the transit case there is no second point to measure from.
  const nx = -sunOffset[0] / sunDist, ny = -sunOffset[1] / sunDist, nz = -sunOffset[2] / sunDist;
  const along = moonOffset[0] * nx + moonOffset[1] * ny + moonOffset[2] * nz;
  if (!(along > 0)) return 1;                          // moon is on the sunward side

  // Perpendicular offset, measured in the S-scaled frame where the planet's shadow cylinder is
  // a circle of radius a (header). The axis must be scaled and renormalised with it.
  const zScale = eqRadius / polarRadius;
  const sx = nx, sy = ny, sz = nz * zScale;
  const sLen = Math.hypot(sx, sy, sz) || 1;
  const kx = sx / sLen, ky = sy / sLen, kz = sz / sLen;
  const mx = moonOffset[0], my = moonOffset[1], mz = moonOffset[2] * zScale;
  const proj = mx * kx + my * ky + mz * kz;
  const perp = Math.hypot(mx - proj * kx, my - proj * ky, mz - proj * kz);

  const alpha = sunRadius / sunDist;                   // Sun's angular radius at the planet
  const umbra = eqRadius - along * alpha;
  const penumbra = eqRadius + along * alpha;
  if (perp >= penumbra) return 1;
  if (perp <= umbra) return 0;
  return smoothstep(umbra, penumbra, perp);
}

/**
 * The same S-curve GLSL's smoothstep() evaluates, so the JS-side eclipse and the GPU-side
 * transit shade a partial phase identically. It stands in for the fraction of the solar disc
 * still clear of the occulter, which for two overlapping circles is a lens area — close enough
 * to this curve that the difference never reaches a display level, and it costs one line.
 * edge0 < edge1 is guaranteed by the caller (penumbra − umbra = 2·t·α > 0).
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
