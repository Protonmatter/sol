// Rasterise the committed geography (apps/web/js/geography.js) into equirectangular canvases
// that the 3-D renderer uploads as WebGL textures. Pure drawing — no GL, no module state, and
// deliberately no import of the geography data itself: the caller passes it in, which keeps the
// 84 KB payload behind orrery.js's dynamic import() and lets these functions be unit-tested
// against synthetic rings.
//
// Projection contract, fixed by the sphere shader (orreryShaders.js SPHERE_FS):
//     uu = 0.5 + atan2(y, x) / 2π      ->  image CENTRE column is the prime meridian
//     vv = acos(z) / π                 ->  image TOP row is the north pole
// with UNPACK_FLIP_Y_WEBGL false. So x spans −180°…+180° east longitude left-to-right and y
// spans +90°…−90° latitude top-to-bottom. Every helper below obeys exactly that.

// Earth carries real coastlines and deserves the resolution; the others carry a few hundred
// feature ellipses, where more pixels buy nothing.
export const EARTH_SIZE = { w: 2048, h: 1024 };
export const FEATURE_SIZE = { w: 1024, h: 512 };

/** East longitude (any range) → image column. */
export function lonToX(lonDeg, w) {
  return (((lonDeg + 180) % 360 + 360) % 360) / 360 * w;
}
/** Latitude → image row. */
export function latToY(latDeg, h) {
  return (90 - latDeg) / 180 * h;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

// A deterministic value-noise field, seeded by integer lattice — the same idea as the shader's
// h31/vn, kept in JS so the generated maps carry mottling without a second texture fetch.
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm2(x, y, octaves = 4) {
  let amp = 0.5, sum = 0;
  for (let i = 0; i < octaves; i++) { sum += amp * valueNoise(x, y); x *= 2.03; y *= 2.03; amp *= 0.5; }
  return sum;
}

/**
 * Unwrap a ring's longitudes into a continuous sequence of image columns.
 *
 * Wrapping each vertex independently is wrong at the antimeridian: lonToX maps both −180 and
 * +180 to column 0, so a ring that merely touches the dateline gets one edge dragged the full
 * width of the map, painting a band of land across the ocean at that latitude. Instead the
 * per-vertex DELTA is wrapped to ±180 and accumulated, so such a ring simply runs off the edge
 * — where the ±w shifted copies below pick it up.
 */
export function unwrapColumns(pts, w) {
  const xs = new Array(pts.length);
  let lon = ((pts[0][0] + 180) % 360 + 360) % 360 - 180;
  xs[0] = (lon + 180) / 360 * w;
  for (let i = 1; i < pts.length; i++) {
    let d = pts[i][0] - pts[i - 1][0];
    d -= Math.round(d / 360) * 360; // shortest way round
    lon += d;
    xs[i] = (lon + 180) / 360 * w;
  }
  return xs;
}

// Append one decoded ring to the current path, three times at ±one full width so a polygon
// straddling the seam is continuous. Filling is left to the caller, which fills a whole
// polygon (outer + holes) at once with the even-odd rule.
function ringPath(ctx, pts, w, h) {
  if (pts.length < 3) return;
  let xs = unwrapColumns(pts, w);
  let n = pts.length;

  // A ring that ENCIRCLES a pole (Antarctica, the Antarctic/Greenland ice sheets) comes back to
  // its starting longitude exactly one turn later, so its first and last columns differ by a
  // full map width. Closing that directly draws a chord straight across the map and fills the
  // wrong side of it; it has to be closed through the pole instead.
  const encirclesPole = Math.abs(xs[n - 1] - xs[0]) > w * 0.99;
  let poleY = 0;
  if (encirclesPole) {
    // Re-index the (closed) ring to begin at its westernmost point. The two vertical closure
    // segments sit at the ring's start and end columns, so if it starts anywhere else those
    // segments slice through the cap's own interior — a self-intersection that nonzero winding
    // renders as a thin unfilled wedge (visible as a gash near 60°W on the Antarctic Peninsula).
    // Starting at the extreme west puts both segments on the boundary, where they cut nothing.
    let k = 0;
    for (let i = 1; i < n - 1; i++) if (xs[i] < xs[k]) k = i;
    if (k > 0) {
      pts = pts.slice(k, n - 1).concat(pts.slice(0, k), [pts[k]]);
      n = pts.length;
      xs = unwrapColumns(pts, w);
    }
    let sum = 0;
    for (const p of pts) sum += p[1];
    poleY = latToY(sum / n < 0 ? -90 : 90, h);
  }

  for (const shift of [-w, 0, w]) {
    for (let i = 0; i < n; i++) {
      const y = latToY(pts[i][1], h);
      if (i === 0) ctx.moveTo(xs[i] + shift, y); else ctx.lineTo(xs[i] + shift, y);
    }
    if (encirclesPole) {
      ctx.lineTo(xs[n - 1] + shift, poleY);
      ctx.lineTo(xs[0] + shift, poleY);
    }
    ctx.closePath();
  }
}

/**
 * Fill one polygon — [outerRing, ...holes] — with the even-odd rule.
 *
 * The holes matter: GeoJSON's inner rings are gaps, and filling every ring independently paints
 * them solid. Even-odd is what makes an enclosed ring subtract from its parent rather than add
 * to it, and it is why the rings are collected into ONE path before a single fill.
 */
function fillPolygon(ctx, poly, decodeRing, w, h) {
  ctx.beginPath();
  for (const ring of poly) ringPath(ctx, decodeRing(ring), w, h);
  ctx.fill("evenodd");
}

/**
 * Earth: real Natural Earth coastlines, lakes, and permanent ice.
 *
 * Land colouring is a latitude-banded tint plus value-noise mottling — a rendering choice, not
 * a dataset. What is real here is the SHAPE: every coastline, lake, and ice margin comes from
 * the committed vectors. Callers surface that distinction to the user.
 */
export function* buildEarthMapSliced(EARTH, decodeRing, size = EARTH_SIZE) {
  const { w, h } = size;
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext("2d", { willReadFrequently: false });

  // Ocean first, shaded by latitude so the poles read colder than the tropics.
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0.00, "#0b2a4a");
  ocean.addColorStop(0.25, "#0d3b66");
  ocean.addColorStop(0.50, "#0a4a7a");
  ocean.addColorStop(0.75, "#0d3b66");
  ocean.addColorStop(1.00, "#0b2a4a");
  ctx.fillStyle = ocean; ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#3f6b32";
  for (const poly of EARTH.land) fillPolygon(ctx, poly, decodeRing, w, h);
  ctx.fillStyle = "#0d3b66";
  for (const poly of EARTH.lakes) fillPolygon(ctx, poly, decodeRing, w, h);

  // Tint the land by latitude band (tropics green, subtropics arid, high latitudes taiga) and
  // mottle it, painting only where land was drawn.
  //
  // COST. This is the one genuinely expensive step here and it cannot yield once started, so it
  // is bounded rather than merely deferred: the noise is evaluated on a coarse lattice and
  // bilinearly interpolated across TINT_STEP-pixel blocks instead of per pixel. At 2048x1024
  // that is ~16x fewer fbm evaluations for mottling whose whole purpose is to be low-frequency,
  // and it takes the pass from the dominant cost of entering the 3-D view to a minor one.
  // The caller still runs it inside requestIdleCallback, but no longer relies on that alone.
  const TINT_STEP = 4;
  const noiseAt = new Float32Array(Math.ceil(w / TINT_STEP) + 2);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  // Yield every BAND rows. requestIdleCallback alone cannot help here: it defers the START of
  // the work, but once a single loop over two million pixels begins nothing can interrupt it,
  // so input and animation stall for the whole pass. Handing control back between bands is
  // what actually keeps the frame budget.
  const BAND = 128;
  for (let y = 0; y < h; y++) {
    if (y > 0 && y % BAND === 0) yield;
    const lat = 90 - (y + 0.5) / h * 180, alat = Math.abs(lat);
    // Bands chosen to read plausibly at a glance; not a biome dataset.
    const arid = Math.exp(-((alat - 24) ** 2) / 90);       // ~15–33°: desert belts
    const cold = Math.max(0, (alat - 48) / 42);            // toward the poles
    // One row of noise samples every TINT_STEP px, reused across the block below.
    if (y % TINT_STEP === 0) {
      for (let k = 0; k < noiseAt.length; k++) noiseAt[k] = fbm2((k * TINT_STEP) / w * 48, y / h * 24);
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i] !== 0x3f || d[i + 1] !== 0x6b || d[i + 2] !== 0x32) continue; // ocean/lake/ice
      const k = x / TINT_STEP, k0 = k | 0, f = k - k0;
      const n = noiseAt[k0] + (noiseAt[k0 + 1] - noiseAt[k0]) * f;
      let r = 0x3f + arid * 96 + n * 34 - 12;
      let g = 0x6b + arid * 28 + n * 30 - 14;
      let b = 0x32 + arid * 10 + n * 22 - 8;
      r += cold * 18; g += cold * 12; b += cold * 26;
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
    }
  }
  ctx.putImageData(img, 0, 0);
  yield;

  // Permanent ice last, so Antarctica and the Greenland sheet cover the land tint.
  ctx.fillStyle = "#eef3f7";
  for (const poly of EARTH.ice) fillPolygon(ctx, poly, decodeRing, w, h);

  return cv;
}

/**
 * Run buildEarthMapSliced to completion without yielding.
 *
 * For callers that are not on a frame budget — tests and offline harnesses. The renderer uses
 * the generator directly so it can hand control back between bands.
 */
export function buildEarthMap(EARTH, decodeRing, size = EARTH_SIZE) {
  const it = buildEarthMapSliced(EARTH, decodeRing, size);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/**
 * Moon / Mars / Mercury: an albedo-modulation map. Mid-grey (128) means "leave the procedural
 * surface alone"; darker and lighter patches are the IAU-catalogued units at their true
 * coordinates and true angular sizes.
 *
 * The renderer multiplies this over its procedural shading (u_texMode = 1) rather than
 * replacing it, so the shader's crater and granulation detail survives underneath real
 * macro-geography — flat ellipses alone would look like stickers.
 */
export function buildFeatureMap(features, bodyRadiusKm, size = FEATURE_SIZE) {
  const { w, h } = size;
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, w, h);

  // Largest first so small bright craters land on top of the dark plains they punctuate.
  const ordered = features.slice().sort((a, b) => b.d - a.d);
  for (const f of ordered) {
    // Angular radius on the sphere from the catalogued mean diameter.
    const radDeg = (f.d / 2) / bodyRadiusKm * (180 / Math.PI);
    if (!(radDeg > 0)) continue;
    const ry = radDeg / 180 * h;
    // Equirectangular stretches longitude by 1/cos(lat); clamp so polar features stay sane.
    const coslat = Math.max(0.18, Math.cos(f.lat * Math.PI / 180));
    const rx = (radDeg / coslat) / 360 * w;
    const cy = latToY(f.lat, h);

    const level = Math.max(0, Math.min(255, Math.round(128 * (1 + f.c))));
    for (const shift of [-w, 0, w]) {
      const cx = lonToX(f.lon, w) + shift;
      if (cx + rx < 0 || cx - rx > w) continue;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      // Soft margins: real albedo boundaries are gradational, and a hard ellipse edge reads
      // as a decal. Opaque core, feathered rim.
      g.addColorStop(0.00, `rgba(${level},${level},${level},0.95)`);
      g.addColorStop(0.62, `rgba(${level},${level},${level},0.78)`);
      g.addColorStop(1.00, `rgba(${level},${level},${level},0)`);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(cx - Math.max(rx, ry), cy - Math.max(rx, ry), Math.max(rx, ry) * 2, Math.max(rx, ry) * 2);
      ctx.restore();
    }
  }
  return cv;
}
