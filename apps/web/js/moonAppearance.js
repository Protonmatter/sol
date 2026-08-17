// How the 21 catalogued moons are SHADED — the measured half of their appearance.
//
// moons.js is generated from JPL Horizons and says so itself: its `col` is illustrative,
// because Horizons publishes GM, radius and density but never colour. That left one real
// problem. Relative BRIGHTNESS was being carried by those illustrative colours too, so the
// view asserted things nobody measured: Ganymede came out brighter than Europa (it is the
// LARGEST moon, not the brightest — its geometric albedo is 0.43 against Europa's 0.67), and
// Enceladus, the most reflective body in the solar system, was merely pale.
//
// This module separates the two. `col` keeps only its HUE; the published geometric albedo
// decides how bright each moon is drawn. Nothing here is generated — it is a hand-pinned
// table with one source per row, deliberately kept out of the generated files so that
// regenerating them (float rounding is platform-dependent) is never needed to change a look.

/**
 * Geometric albedo, per moon.
 *
 * SOURCE: the JPL Horizons physical-data block for each satellite's NAIF ID
 *   https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='502'&OBJ_DATA='YES'&MAKE_EPHEM='NO'
 * which prints a "Geometric Albedo" line for every body below (values read 2026-08-16). The
 * same service already supplies this catalogue's orbital elements, so the whole moon layer
 * cites one authority rather than a scrapbook.
 *
 * Why Horizons and not JPL SSD's satellite table: the "Planetary Satellite Physical
 * Parameters" page (ssd.jpl.nasa.gov/sats/phys_par/) no longer carries an albedo column — it
 * now publishes GM, mean radius and density only — and the NSSDC satellite fact sheets that
 * used to carry one now redirect to nasa.gov. Horizons is where the number still lives.
 *
 * Two rows deserve a caveat rather than a footnote:
 *   • Enceladus 1.04 — a geometric albedo above 1 is physical (strong backscatter from fresh,
 *     fine-grained ice), and it makes Enceladus the most reflective body known. Verbiscer et
 *     al. 2007 (Science 315, 815) derive a still higher ~1.375 at 0.55 µm; this table keeps
 *     the Horizons value so every row comes from one source, and the ranking is the same
 *     either way.
 *   • Iapetus 0.6 — a single number cannot describe Iapetus. Its trailing hemisphere is snow
 *     (~0.6) and its leading hemisphere is nearly as dark as coal (~0.05). Horizons publishes
 *     the bright figure. The real Cassini/Voyager mosaic (see MOON_TEXTURE_FILES) is what
 *     actually shows the two-tone surface; the albedo here only sets the overall level.
 *
 * @type {Record<string, number>}
 */
export const MOON_ALBEDO = {
  Phobos: 0.06, Deimos: 0.06,
  Io: 0.63, Europa: 0.67, Ganymede: 0.43, Callisto: 0.17,
  Mimas: 0.6, Enceladus: 1.04, Tethys: 0.80, Dione: 0.6, Rhea: 0.6, Titan: 0.2, Iapetus: 0.6,
  Ariel: 0.34, Umbriel: 0.18, Titania: 0.27, Oberon: 0.24, Miranda: 0.27,
  Triton: 0.7, Nereid: 0.2, Proteus: 0.06,
};

/**
 * The reference albedo the display scale is normalised to: the brightest moon in the
 * catalogue. Deriving it rather than typing a constant means the scale cannot drift away from
 * the table — whatever the most reflective catalogued body is, it is the one drawn at full
 * brightness, and nothing is asked to be brighter than white.
 */
export const MOON_ALBEDO_REFERENCE = Math.max(...Object.values(MOON_ALBEDO));

// The canvas is sRGB-encoded and this renderer writes shading values straight into it without
// a linear→sRGB conversion pass, so displayed luminance ≈ (written value)^2.2. To make the
// DISPLAYED brightness ratio between two moons equal their published reflectance ratio, the
// written values must therefore be in the ratio (p1/p2)^(1/2.2). That is the whole reason for
// the exponent — it is the sRGB transfer function, not a taste knob.
const SRGB_ENCODE = 1 / 2.2;

// Safety rails only. With the table above the computed gains span 0.27 (Phobos) to 1.00
// (Enceladus), so neither clamp binds; they exist so that a future row with an extreme or
// mistyped albedo degrades into a dim/bright moon rather than an invisible or blown-out one.
const GAIN_MIN = 0.22;
const GAIN_MAX = 1.15;

/**
 * Display brightness multiplier for a moon, from its published geometric albedo.
 * Returns 1 for anything not in the table, so an unknown body is drawn unchanged rather than
 * silently blacked out.
 */
export function moonAlbedoGain(name) {
  const p = MOON_ALBEDO[name];
  if (!(p > 0)) return 1;
  const g = (p / MOON_ALBEDO_REFERENCE) ** SRGB_ENCODE;
  return Math.min(GAIN_MAX, Math.max(GAIN_MIN, g));
}

/** Rec. 709 luma weights — the same ones the shader uses, so JS and GLSL agree on "brightness". */
const LUMA = [0.299, 0.587, 0.114];

/**
 * The colour actually uploaded as u_base for a moon: the catalogue's HUE at the albedo's
 * brightness.
 *
 * The catalogue colour is first normalised to unit LUMINANCE, not to its largest channel.
 * That distinction is not pedantry — it is what makes the albedo scale actually mean
 * something. Normalising by the peak channel leaves a strongly tinted body dimmer than a grey
 * one at the same albedo (sulphur-yellow Io's blue channel is under half its red, so its
 * luminance came out 12% below Ganymede's share even after both were albedo-scaled). Dividing
 * by luma instead makes u_base's luminance EQUAL the gain, so two moons' displayed brightness
 * ratio is their published albedo ratio and nothing else.
 */
export function moonBaseColor(moon) {
  const luma = Math.max(
    LUMA[0] * moon.col[0] + LUMA[1] * moon.col[1] + LUMA[2] * moon.col[2], 1e-6);
  const g = moonAlbedoGain(moon.n) / luma;
  return [moon.col[0] * g, moon.col[1] * g, moon.col[2] * g];
}

/**
 * Real photographic surface maps for the moons, downloaded by tools/fetch_textures.py into
 * apps/web/textures/ (keys match that script's TEXTURES keys). Absent file ⇒ the moon falls
 * back to its procedural style, exactly as the planets do.
 *
 * Every entry is a USGS Astrogeology global mosaic in SIMPLE CYLINDRICAL (equirectangular)
 * projection, which is the projection the sphere shader samples. Moons whose only published
 * global products are sinusoidal airbrush charts, printed map sheets, partial-latitude strips
 * or nothing at all are deliberately absent — see the NO_MOSAIC table in fetch_textures.py
 * for the per-moon reason.
 *
 * ORIENTATION IS NOT A CLAIM. drawMoons draws these spheres with no rotation model at all
 * (the catalogue carries orbits, not spin axes or prime meridians), so a map's features land
 * at the renderer's own frame, not at their true planetographic longitudes. What these
 * textures buy is a real SURFACE — Iapetus's two-tone hemispheres, Europa's lineae, Callisto's
 * saturation of craters — not the position of any one feature. The panel text and this
 * comment are the only places that can say so, so they do.
 *
 * @type {Record<string, string>}
 */
export const MOON_TEXTURE_FILES = {
  Io: "io.jpg",
  Europa: "europa.jpg",
  Ganymede: "ganymede.jpg",
  Callisto: "callisto.jpg",
  Enceladus: "enceladus.jpg",
  Tethys: "tethys.jpg",
  Dione: "dione.jpg",
  Rhea: "rhea.jpg",
  Iapetus: "iapetus.jpg",
  Phobos: "phobos.jpg",
};
