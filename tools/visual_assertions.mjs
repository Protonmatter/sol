import pngjs from "pngjs";

const { PNG } = pngjs;

function decodePng(input) {
  const image = PNG.sync.read(input);
  if (image.width < 32 || image.height < 32) {
    throw new Error(`image is only ${image.width}x${image.height}`);
  }
  return image;
}

function centralPixels(image, radiusFraction) {
  const cx = (image.width - 1) / 2;
  const cy = (image.height - 1) / 2;
  const radius = Math.min(image.width, image.height) * radiusFraction;
  const radius2 = radius * radius;
  const pixels = [];
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(image.height - 1, Math.ceil(cy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(image.width - 1, Math.ceil(cx + radius)); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius2) continue;
      const offset = (y * image.width + x) * 4;
      pixels.push([
        image.data[offset],
        image.data[offset + 1],
        image.data[offset + 2],
        image.data[offset + 3],
      ]);
    }
  }
  return pixels;
}

function median(values) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

export function assertWarmWhiteSun(input) {
  const image = decodePng(input);
  const sample = centralPixels(image, 0.34);
  const bright = sample.filter(([r, g, b, a]) =>
    a > 240 && 0.299 * r + 0.587 * g + 0.114 * b >= 90
  );
  const minimumBright = Math.max(180, Math.floor(sample.length * 0.06));
  if (bright.length < minimumBright) {
    throw new Error(`Sun is missing or too dark: ${bright.length}/${sample.length} central pixels are bright`);
  }
  const greenRed = median(bright.map(([r, g]) => g / Math.max(1, r)));
  const blueRed = median(bright.map(([r, , b]) => b / Math.max(1, r)));
  if (greenRed < 0.78 || blueRed < 0.62) {
    throw new Error(
      `Sun is materially orange/discoloured: median G/R=${greenRed.toFixed(3)}, B/R=${blueRed.toFixed(3)}`
    );
  }
  if (greenRed > 1.18 || blueRed > 1.18) {
    throw new Error(
      `Sun has an unexpected cool tint: median G/R=${greenRed.toFixed(3)}, B/R=${blueRed.toFixed(3)}`
    );
  }
  return { brightPixels: bright.length, greenRed, blueRed };
}

export function assertBlueEarth(input) {
  const image = decodePng(input);
  const sample = centralPixels(image, 0.20);
  const blue = sample.filter(([r, g, b, a]) =>
    a > 240 && b >= 55 && b > r * 1.12 && b > g * 1.02
  );
  const minimumBlue = Math.max(45, Math.floor(sample.length * 0.003));
  if (blue.length < minimumBlue) {
    throw new Error(`Earth is missing or lacks visible blue oceans: ${blue.length}/${sample.length} blue pixels`);
  }
  return { bluePixels: blue.length, sampledPixels: sample.length };
}

export function assertOrbitRoundTrip(beforeInput, afterInput) {
  const before = decodePng(beforeInput);
  const after = decodePng(afterInput);
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error(
      `orbit frames differ in size: ${before.width}x${before.height} vs ${after.width}x${after.height}`
    );
  }
  let absoluteDifference = 0;
  let materiallyChanged = 0;
  let pixels = 0;
  const cx = (before.width - 1) / 2;
  const cy = (before.height - 1) / 2;
  const radius = Math.min(before.width, before.height) * 0.25;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(before.height - 1, Math.ceil(cy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(before.width - 1, Math.ceil(cx + radius)); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
      const offset = (y * before.width + x) * 4;
      const difference =
        Math.abs(before.data[offset] - after.data[offset])
        + Math.abs(before.data[offset + 1] - after.data[offset + 1])
        + Math.abs(before.data[offset + 2] - after.data[offset + 2]);
      absoluteDifference += difference / 3;
      if (difference / 3 > 32) materiallyChanged += 1;
      pixels += 1;
    }
  }
  const meanDifference = absoluteDifference / pixels;
  const changedFraction = materiallyChanged / pixels;
  if (meanDifference > 6 || changedFraction > 0.04) {
    throw new Error(
      `Earth did not return after a 360° camera orbit: mean pixel delta=${meanDifference.toFixed(3)}, `
      + `materially changed=${(changedFraction * 100).toFixed(2)}%`
    );
  }
  return { meanDifference, changedFraction };
}

export function assertFrameChanged(beforeInput, afterInput) {
  const before = decodePng(beforeInput);
  const after = decodePng(afterInput);
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error(
      `animation frames differ in size: ${before.width}x${before.height} vs ${after.width}x${after.height}`
    );
  }
  let absoluteDifference = 0;
  let materiallyChanged = 0;
  let pixels = 0;
  const cx = (before.width - 1) / 2;
  const cy = (before.height - 1) / 2;
  const radius = Math.min(before.width, before.height) * 0.25;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(before.height - 1, Math.ceil(cy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(before.width - 1, Math.ceil(cx + radius)); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
      const offset = (y * before.width + x) * 4;
      const difference =
        Math.abs(before.data[offset] - after.data[offset])
        + Math.abs(before.data[offset + 1] - after.data[offset + 1])
        + Math.abs(before.data[offset + 2] - after.data[offset + 2]);
      absoluteDifference += difference / 3;
      if (difference / 3 > 32) materiallyChanged += 1;
      pixels += 1;
    }
  }
  const meanDifference = absoluteDifference / pixels;
  const changedFraction = materiallyChanged / pixels;
  if (meanDifference < 1.5 || changedFraction < 0.005) {
    throw new Error(
      `high-speed body rotation appears frozen: mean pixel delta=${meanDifference.toFixed(3)}, `
      + `materially changed=${(changedFraction * 100).toFixed(2)}%`
    );
  }
  return { meanDifference, changedFraction };
}

// =============================================================================================
// Moon transit shadows and moon eclipses — the RENDERED half of the feature.
//
// WHY THIS EXISTS. apps/web/js/moonshadows.js is thoroughly tested as pure geometry, and
// tests/web/moonShadows.test.mjs also checks that orreryShaders.js CONTAINS the right lines.
// Neither of those notices if the renderer stops painting the result, paints it in the wrong
// place, or paints it inverted: an adversarial review inverted the shader's shadow term, deleted
// the moon-eclipse ramp and zeroed the u_moonShadowCount upload, and every one of the 157 node
// tests stayed green. The assertions below close that gap by measuring PIXELS at a pinned,
// deterministic transit instant against the numbers the shipped modules themselves predict for
// that instant. Everything geometric — where the shadow lands, how wide its umbra is, how much
// of the Sun a moon can still see — is computed in the page by importing moonshadows.js, so this
// file never re-implements the claim it is checking; it only compares light levels.
//
// THE ONE PIECE OF RENDERER ARITHMETIC REPRODUCED HERE, and why it has to be. SPHERE_FS shades
// a planet's surface with
//        float shade = 0.05 + 0.95 * lambert * sunVis;   (orreryShaders.js, SPHERE_FS)
// so the only way to turn a measured pixel back into "how much direct sunlight is reaching this
// point" is to divide out the 0.05 ambient floor and the Lambert term. The two constants are
// therefore duplicated below. That is deliberate: they are the numbers the honesty claim is made
// of ("the shadow reads as very dark grey rather than a hole in the planet"), so if either moves
// this gate must fail and be re-derived rather than silently track the change.
const SURFACE_AMBIENT = 0.05;   // SPHERE_FS: light the planet's own atmosphere scatters into shadow
const SURFACE_DIRECT = 0.95;    // SPHERE_FS: the Lambertian direct-sunlight term the shadow removes

// The moon-marker eclipse ramp, from drawMoons() in apps/web/js/orrery.js:
//        const eclipsed = (0.06 + 0.94 * sunlit) ** (1 / 2.2);
// `sunlit` is sunlightOnMoon()'s linear fraction of the solar disc and the 1/2.2 transfer matches
// the sRGB encoding moonAppearance.js writes the albedo through. Both constants are pinned here
// for the same reason as the two above: they ARE the claim. A moon in total umbra keeps
// 0.06 ** (1 / 2.2) = 0.2784 of its unshadowed brightness, and because `eclipsed` multiplies
// u_base — which every moon style modulates linearly, texture branch included — that factor
// applies to every pixel of the marker, not merely to its average.
const MOON_ECLIPSE_FLOOR = 0.06;
const MOON_ECLIPSE_GAMMA = 2.2;
export const TOTAL_ECLIPSE_MARKER_FACTOR = MOON_ECLIPSE_FLOOR ** (1 / MOON_ECLIPSE_GAMMA);

// A pixel counts as "in shadow" when its albedo-normalised brightness falls below this fraction
// of the surrounding disc. MEASURED, not guessed, at the instants pinned in browser_validation.mjs
// and under both backends: Io's umbral core reads 0.045 of its surroundings, while the darkest
// natural feature anywhere on the textured Jovian disc three hours later (no transit in progress)
// reads 0.60 on SwiftShader and 0.60 on a real GPU. 0.35 sits between the two with ~8x margin
// below and ~1.7x above, and a disc with no shadow term at all reads 1.0.
const SHADOW_PIXEL_RATIO = 0.35;

// Only the well-lit, well-faced part of the disc is scanned. Below these the surface is either
// near the terminator (where `shade` legitimately collapses to the ambient floor and every pixel
// would look like a shadow) or so close to the limb that the additive atmospheric halo
// SPHERE_FS's u_mode==2 shell paints there dominates the measurement.
const SCAN_MIN_LAMBERT = 0.55;
const SCAN_MIN_COS_NV = 0.35;

function luminanceAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
}

/**
 * Is this canvas pixel actually showing the canvas? The surface panel, the timeline and any
 * leftover tooltip float over the 3-D view, and an element screenshot includes whatever the
 * browser painted on top of the element. The page hands back a coarse grid of which cells are
 * unobstructed; a pixel is trusted only when its whole 3x3 neighbourhood of cells is, which keeps
 * every sampled region a comfortable margin clear of an overlay's edge.
 */
function pixelIsCanvas(plan, x, y) {
  const i = Math.min(plan.clearW - 1, Math.floor(x / plan.clearStep));
  const j = Math.min(plan.clearH - 1, Math.floor(y / plan.clearStep));
  for (let dj = -1; dj <= 1; dj += 1) {
    for (let di = -1; di <= 1; di += 1) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= plan.clearW || jj >= plan.clearH) return false;
      if (plan.clear[jj * plan.clearW + ii] !== "1") return false;
    }
  }
  return true;
}

/**
 * Where on the planet does this pixel look, and how is that point lit? A ray is cast from the
 * page's own camera (position and basis come from the plan, and the plan is only accepted after
 * the page has checked that same camera against the projected positions the renderer itself used
 * for its labels) and intersected with the drawn spheroid using the S = diag(1, 1, a/c) trick
 * moonshadows.js documents. Returns the Lambert term and the view-angle cosine at the hit, or
 * null when the ray misses the globe.
 */
function surfacePoint(plan, px, py) {
  const ndx = (2 * (px + 0.5) / plan.cw - 1) * plan.aspect * plan.tanHalf;
  const ndy = (1 - 2 * (py + 0.5) / plan.ch) * plan.tanHalf;
  const d = [
    plan.fwd[0] + ndx * plan.right[0] + ndy * plan.up[0],
    plan.fwd[1] + ndx * plan.right[1] + ndy * plan.up[1],
    plan.fwd[2] + ndx * plan.right[2] + ndy * plan.up[2],
  ];
  const r = plan.rot;
  const toBody = (v) => [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
    r[4] * v[0] + r[5] * v[1] + r[6] * v[2],
    r[8] * v[0] + r[9] * v[1] + r[10] * v[2],
  ];
  const o = toBody([plan.eye[0] - plan.P[0], plan.eye[1] - plan.P[1], plan.eye[2] - plan.P[2]]);
  const db = toBody(d);
  const zScale = 1 / plan.oblate;
  const ox = o[0], oy = o[1], oz = o[2] * zScale;
  const dx = db[0], dy = db[1], dz = db[2] * zScale;
  const A = dx * dx + dy * dy + dz * dz;
  const B = 2 * (ox * dx + oy * dy + oz * dz);
  const C = ox * ox + oy * oy + oz * oz - plan.rEq * plan.rEq;
  const disc = B * B - 4 * A * C;
  if (!(disc > 0)) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (!(t > 0)) return null;
  // The unit-sphere object coordinate, i.e. literally SPHERE_FS's `p`.
  const p = [(ox + t * dx) / plan.rEq, (oy + t * dy) / plan.rEq, (oz + t * dz) / plan.rEq];
  // SPHERE_FS is fed normal == position, so the shading normal is the rotated unit-sphere point.
  const n = [
    r[0] * p[0] + r[4] * p[1] + r[8] * p[2],
    r[1] * p[0] + r[5] * p[1] + r[9] * p[2],
    r[2] * p[0] + r[6] * p[1] + r[10] * p[2],
  ];
  const world = [
    plan.P[0] + plan.rEq * (r[0] * p[0] + r[4] * p[1] + r[8] * p[2] * plan.oblate),
    plan.P[1] + plan.rEq * (r[1] * p[0] + r[5] * p[1] + r[9] * p[2] * plan.oblate),
    plan.P[2] + plan.rEq * (r[2] * p[0] + r[6] * p[1] + r[10] * p[2] * plan.oblate),
  ];
  const vx = plan.eye[0] - world[0], vy = plan.eye[1] - world[1], vz = plan.eye[2] - world[2];
  const vl = Math.hypot(vx, vy, vz) || 1;
  return {
    lambert: n[0] * plan.sunward[0] + n[1] * plan.sunward[1] + n[2] * plan.sunward[2],
    cosNV: (n[0] * vx + n[1] * vy + n[2] * vz) / vl,
  };
}

/**
 * Per-pixel apparent albedo: measured luminance divided by the shade SPHERE_FS would apply to an
 * UNSHADOWED point looking that way. Dividing the Lambert gradient out is what lets a small dark
 * blob be compared with its surroundings without the disc's own curvature being mistaken for one.
 * Pixels off the globe, near the terminator, near the limb, behind a drawn moon marker, or behind
 * a floating DOM panel are left NaN and take no part in any statistic.
 */
function apparentAlbedoMap(image, plan) {
  const gain = new Float64Array(image.width * image.height).fill(NaN);
  let sampled = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!pixelIsCanvas(plan, x, y)) continue;
      const point = surfacePoint(plan, x, y);
      if (!point || point.lambert < SCAN_MIN_LAMBERT || point.cosNV < SCAN_MIN_COS_NV) continue;
      let behindMarker = false;
      for (const marker of plan.markers) {
        if (!marker.at || !(marker.radiusPx > 0)) continue;
        // The pad covers the marker's own soft limb and the atmospheric shell around Titan-like
        // moons; 8 px is comfortably wider than either at the framings used here.
        if (Math.hypot(x - marker.at[0], y - marker.at[1]) < marker.radiusPx + 8) {
          behindMarker = true;
          break;
        }
      }
      if (behindMarker) continue;
      gain[y * image.width + x] = luminanceAt(image, x, y)
        / (SURFACE_AMBIENT + SURFACE_DIRECT * point.lambert);
      sampled += 1;
    }
  }
  return { gain, sampled };
}

/**
 * Every pixel's apparent albedo as a fraction of the mean over a square annulus around it.
 *
 * Square rather than circular, and mean rather than median, so the whole map costs two summed-area
 * tables and O(1) per pixel: this runs over a million pixels per frame inside the web CI job's
 * budget, and an exact circular ring median cost minutes. Neither approximation weakens the
 * measurement — the annulus starts twice the penumbral radius out, so the shadow itself never
 * enters its own reference, and the disc's Lambert gradient has already been divided out.
 */
function localContrastMap(image, gain, innerRadius, outerRadius) {
  const width = image.width, height = image.height;
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  const counts = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0, rowCount = 0;
    for (let x = 0; x < width; x += 1) {
      const value = gain[y * width + x];
      // A genuinely black pixel is a measurement, not a gap; only the NaN-masked ones are skipped.
      if (Number.isFinite(value)) { rowSum += value; rowCount += 1; }
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + rowSum;
      counts[(y + 1) * stride + x + 1] = counts[y * stride + x + 1] + rowCount;
    }
  }
  const box = (table, x0, y0, x1, y1) => {
    const ax = Math.max(0, x0), ay = Math.max(0, y0);
    const bx = Math.min(width - 1, x1), by = Math.min(height - 1, y1);
    if (bx < ax || by < ay) return 0;
    return table[(by + 1) * stride + bx + 1] - table[ay * stride + bx + 1]
      - table[(by + 1) * stride + ax] + table[ay * stride + ax];
  };
  const ringCells = (2 * outerRadius + 1) ** 2 - (2 * innerRadius + 1) ** 2;
  const contrast = new Float64Array(width * height).fill(NaN);
  let minimum = Infinity;
  let minimumAt = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const here = gain[y * width + x];
      if (!Number.isFinite(here)) continue;
      const sum = box(sums, x - outerRadius, y - outerRadius, x + outerRadius, y + outerRadius)
        - box(sums, x - innerRadius, y - innerRadius, x + innerRadius, y + innerRadius);
      const count = box(counts, x - outerRadius, y - outerRadius, x + outerRadius, y + outerRadius)
        - box(counts, x - innerRadius, y - innerRadius, x + innerRadius, y + innerRadius);
      // A pixel whose annulus is mostly masked (disc edge, panel edge, marker) has no trustworthy
      // reference and is skipped rather than compared against a biased handful of neighbours.
      if (count < ringCells * 0.4) continue;
      const value = here / (sum / count);
      contrast[y * width + x] = value;
      if (value < minimum) { minimum = value; minimumAt = [x, y]; }
    }
  }
  return { contrast, minimum, minimumAt };
}

/** Connected runs of pixels darker than SHADOW_PIXEL_RATIO, with their centroid and extent. */
function darkBlobs(image, contrast, minimumPixels) {
  const seen = new Uint8Array(image.width * image.height);
  const blobs = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const start = y * image.width + x;
      if (seen[start] || !(contrast[start] < SHADOW_PIXEL_RATIO)) continue;
      const stack = [start];
      seen[start] = 1;
      const points = [];
      while (stack.length) {
        const index = stack.pop();
        const ix = index % image.width, iy = (index - ix) / image.width;
        points.push([ix, iy]);
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = ix + ax, ny = iy + ay;
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          const next = ny * image.width + nx;
          if (!seen[next] && contrast[next] < SHADOW_PIXEL_RATIO) { seen[next] = 1; stack.push(next); }
        }
      }
      if (points.length < minimumPixels) continue;
      const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
      blobs.push({
        pixels: points.length,
        cx,
        cy,
        radius: Math.max(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy))),
        darkest: Math.min(...points.map((p) => contrast[p[1] * image.width + p[0]])),
      });
    }
  }
  return blobs;
}

function sampleDisc(image, gain, cx, cy, outerRadius, innerRadius = 0) {
  const values = [];
  for (let dy = -Math.ceil(outerRadius); dy <= Math.ceil(outerRadius); dy += 1) {
    for (let dx = -Math.ceil(outerRadius); dx <= Math.ceil(outerRadius); dx += 1) {
      const d = Math.hypot(dx, dy);
      if (d > outerRadius || d < innerRadius) continue;
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const value = gain[y * image.width + x];
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

function checkPlan(image, plan) {
  if (image.width !== plan.cw || image.height !== plan.ch) {
    throw new Error(
      `moon-shadow frame is ${image.width}x${image.height} but the page reported a `
      + `${plan.cw}x${plan.ch} canvas; the pixel geometry cannot be trusted`
    );
  }
  // The page projects the planet and each drawn moon with a rebuilt copy of cameraMatrices() and
  // compares the result with the screen positions the renderer itself placed the DOM labels at.
  // Sub-pixel agreement is what licenses every predicted coordinate below; anything larger means
  // the camera replica has drifted from the renderer and the prediction is meaningless.
  if (!(plan.labelResidual < 0.5)) {
    throw new Error(
      `the harness camera no longer reproduces the renderer's own projection: worst label `
      + `residual ${plan.labelResidual.toFixed(3)} px`
    );
  }
}

/**
 * The transit gate. At the pinned instant the shipped modules say exactly which moons put a
 * shadow on the disc, where each one lands and how wide its umbra and penumbra are there; the
 * rendered frame must show exactly that many dark blobs, in those places, at those sizes, and
 * as deep as the shader's ambient floor says and no deeper.
 */
export function assertMoonTransitShadow(input, plan) {
  const image = decodePng(input);
  checkPlan(image, plan);
  if (!plan.shadows.length) {
    throw new Error("the transit plan predicts no shadow at all — the pinned instant has drifted");
  }
  const { gain, sampled } = apparentAlbedoMap(image, plan);
  // A loose sanity floor on the framing: at these zooms the well-lit disc covers about a quarter
  // of the canvas, so 2% only fires when the planet has fallen out of frame or been buried.
  if (sampled < 0.02 * image.width * image.height) {
    throw new Error(`only ${sampled} usable planet pixels in the transit frame`);
  }
  // HOW DARK. Inside the umbra SPHERE_FS's smoothstep(ru, rp, perp) is exactly 0, so the surface
  // keeps only its ambient floor and the core must read
  //     0.05 / (0.05 + 0.95 * lambert)
  // of the unshadowed disc around it — 0.0505 at this instant, since the shadow lands within a
  // degree of the sub-solar point. The core is sampled well inside the umbra and the reference
  // well outside the penumbra, so neither is contaminated by the soft edge between them. This
  // check comes first because it is the claim itself; the shape and count checks below corroborate
  // it. An inverted shadow term reads far ABOVE the band here, a missing one reads 1.
  const measured = [];
  for (const shadow of plan.shadows) {
    const core = sampleDisc(image, gain, shadow.at[0], shadow.at[1], 0.55 * shadow.umbraPx);
    const around = sampleDisc(
      image, gain, shadow.at[0], shadow.at[1], 3.4 * shadow.penumbraPx, 2.0 * shadow.penumbraPx
    );
    if (core.length < 20 || around.length < 400) {
      throw new Error(
        `${shadow.name}'s shadow could not be sampled: ${core.length} core / ${around.length} reference pixels`
      );
    }
    const depth = median(core) / median(around);
    const predicted = SURFACE_AMBIENT / (SURFACE_AMBIENT + SURFACE_DIRECT * shadow.lambert);
    // Half the predicted depth to three times it. The lower bound is the honesty half of the
    // claim: a shadow drawn as a hole in the planet rather than as unlit-but-ambient surface
    // reads ~0.005 here and fails. The upper bound leaves room for the additive atmospheric halo
    // and 8-bit quantisation while staying ~7x below the 1.0 an unshaded disc gives.
    if (depth < 0.5 * predicted || depth > 3.0 * predicted) {
      throw new Error(
        `${shadow.name}'s umbra removes the wrong amount of light: the disc keeps `
        + `${depth.toFixed(4)} of its surroundings where moonshadows.js puts the umbral core, but `
        + `the shipped 0.05 ambient floor predicts ${predicted.toFixed(4)} (band `
        + `${(0.5 * predicted).toFixed(4)}-${(3.0 * predicted).toFixed(4)})`
      );
    }
    measured.push({ name: shadow.name, depth, predicted, offset: NaN, radius: NaN });
  }

  // WHERE, HOW BIG, AND HOW MANY.
  const widest = Math.max(...plan.shadows.map((s) => s.penumbraPx));
  const { contrast, minimum } = localContrastMap(
    image, gain, Math.round(2.0 * widest), Math.round(3.4 * widest)
  );
  // Half the umbra's own area: large enough that texture noise cannot manufacture a blob, small
  // enough that a genuine umbra always clears it (Io's measures ~2.6x this).
  const smallestShadow = Math.min(...plan.shadows.map((s) => s.umbraPx));
  const blobs = darkBlobs(image, contrast, Math.round(0.5 * Math.PI * smallestShadow ** 2));
  if (blobs.length !== plan.shadows.length) {
    throw new Error(
      `expected ${plan.shadows.length} moon shadow(s) on the disc `
      + `(${plan.shadows.map((s) => s.name).join(", ")}) but found ${blobs.length} dark blob(s): `
      + `${JSON.stringify(blobs)}; darkest local contrast anywhere was ${minimum.toFixed(4)}`
    );
  }
  for (const entry of measured) {
    const shadow = plan.shadows.find((s) => s.name === entry.name);
    const blob = blobs.reduce((best, b) =>
      Math.hypot(b.cx - shadow.at[0], b.cy - shadow.at[1])
        < Math.hypot(best.cx - shadow.at[0], best.cy - shadow.at[1]) ? b : best);
    entry.offset = Math.hypot(blob.cx - shadow.at[0], blob.cy - shadow.at[1]);
    entry.radius = blob.radius;
    // 0.6 umbral radii. On these framings that is ~6 px out of a ~350 px disc radius, i.e. the
    // shadow has to land within 2% of the disc radius of where moonshadows.js puts it.
    if (entry.offset > 0.6 * shadow.umbraPx) {
      throw new Error(
        `${shadow.name}'s shadow is ${entry.offset.toFixed(1)} px from the predicted `
        + `(${shadow.at[0].toFixed(1)}, ${shadow.at[1].toFixed(1)}), more than the `
        + `${(0.6 * shadow.umbraPx).toFixed(1)} px tolerance`
      );
    }
    // The drawn blob is bounded by the umbra it must at least fill and the penumbra it cannot
    // meaningfully exceed; the 0.35 contrast cut lands the edge between the two.
    if (entry.radius < 0.8 * shadow.umbraPx || entry.radius > 1.7 * shadow.penumbraPx) {
      throw new Error(
        `${shadow.name}'s shadow is ${entry.radius.toFixed(1)} px across, outside the predicted `
        + `umbra ${shadow.umbraPx.toFixed(1)} px / penumbra ${shadow.penumbraPx.toFixed(1)} px`
      );
    }
  }
  return { blobs: blobs.length, sampled, darkestElsewhere: minimum, shadows: measured };
}

/**
 * The control gate, and the one that catches an inverted shadow term. Three hours after the
 * transit no moon of this planet has a shadow anywhere on its disc, so the same scan of the same
 * disc from the same camera must find nothing at all. An inverted sign turns the whole sunlit
 * hemisphere dark and the shadow itself bright, which this and the transit gate together pin
 * from both directions.
 */
export function assertNoMoonTransitShadow(input, plan, umbraPxHint) {
  const image = decodePng(input);
  checkPlan(image, plan);
  if (plan.shadows.length) {
    throw new Error(
      `the control instant is meant to have no transit in progress, but the shipped geometry `
      + `reports ${plan.shadows.map((s) => s.name).join(", ")}`
    );
  }
  const { gain, sampled } = apparentAlbedoMap(image, plan);
  if (sampled < 0.02 * image.width * image.height) {
    throw new Error(`only ${sampled} usable planet pixels in the control frame`);
  }
  const { contrast, minimum, minimumAt } = localContrastMap(
    image, gain, Math.round(2.0 * umbraPxHint * 1.42), Math.round(3.4 * umbraPxHint * 1.42)
  );
  const blobs = darkBlobs(image, contrast, Math.round(0.5 * Math.PI * umbraPxHint ** 2));
  if (blobs.length) {
    throw new Error(
      `the disc shows ${blobs.length} shadow-like dark blob(s) at an instant with no transit: `
      + `${JSON.stringify(blobs)}`
    );
  }
  return { sampled, darkest: minimum, darkestAt: minimumAt };
}

/**
 * The eclipse gate. `sunlit` is 0 for this moon at the eclipsed instant and 1 at the control one,
 * and the two frames are taken down the planet's rotation axis so every marker keeps the same
 * phase, the same drawn radius and the same object-space surface pattern between them: the only
 * thing that changes for this moon is the `eclipsed` factor multiplying u_base. Its total flux
 * must therefore fall by exactly 0.06 ** (1 / 2.2).
 */
export function assertEclipsedMoonMarker(eclipsedInput, sunlitInput, eclipsedPlan, sunlitPlan, moonName) {
  const dark = decodePng(eclipsedInput);
  const lit = decodePng(sunlitInput);
  checkPlan(dark, eclipsedPlan);
  checkPlan(lit, sunlitPlan);
  if (eclipsedPlan.sunlit[moonName] !== 0) {
    throw new Error(
      `${moonName} is not in total umbra at the pinned eclipse instant `
      + `(sunlightOnMoon = ${eclipsedPlan.sunlit[moonName]}); the instant has drifted`
    );
  }
  if (sunlitPlan.sunlit[moonName] !== 1) {
    throw new Error(
      `${moonName} is not in full sunlight at the eclipse control instant `
      + `(sunlightOnMoon = ${sunlitPlan.sunlit[moonName]}); the instant has drifted`
    );
  }
  const flux = (image, plan) => {
    const marker = plan.markers.find((m) => m.name === moonName);
    if (!marker || !marker.at || !(marker.radiusPx > 3)) {
      throw new Error(`${moonName}'s marker is not on screen in the eclipse pair`);
    }
    // 1.05 marker radii: the whole drawn sphere plus a sliver of the sky behind it, which is
    // black in both frames and so cancels out of the ratio.
    const radius = marker.radiusPx * 1.05;
    let total = 0;
    let pixels = 0;
    for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy += 1) {
      for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx += 1) {
        if (Math.hypot(dx, dy) > radius) continue;
        const x = Math.round(marker.at[0] + dx), y = Math.round(marker.at[1] + dy);
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
          throw new Error(`${moonName}'s marker runs off the canvas in the eclipse pair`);
        }
        if (!pixelIsCanvas(plan, x, y)) {
          throw new Error(`${moonName}'s marker is behind a floating panel in the eclipse pair`);
        }
        total += luminanceAt(image, x, y);
        pixels += 1;
      }
    }
    return { total, pixels };
  };
  const eclipsed = flux(dark, eclipsedPlan);
  const sunlit = flux(lit, sunlitPlan);
  if (!(sunlit.total > 5000)) {
    throw new Error(`${moonName}'s unshadowed marker carries almost no light: ${sunlit.total}`);
  }
  const ratio = eclipsed.total / sunlit.total;
  // 0.6x to 1.5x the exact factor. The scaling is linear per pixel, so the measured value lands
  // within a few percent; the band only covers the marker having moved along its orbit between
  // the two frames and 8-bit quantisation. It is deliberately tight enough that dropping the
  // ramp (ratio 1.0), dropping its 0.06 floor (0) or dropping the 1/2.2 transfer (0.06) all fail.
  const expected = TOTAL_ECLIPSE_MARKER_FACTOR;
  if (ratio < 0.6 * expected || ratio > 1.5 * expected) {
    throw new Error(
      `${moonName} in its planet's umbra keeps ${ratio.toFixed(4)} of its unshadowed light, `
      + `outside the ${(0.6 * expected).toFixed(4)}-${(1.5 * expected).toFixed(4)} band around the `
      + `shipped ramp's ${expected.toFixed(4)}`
    );
  }
  return { ratio, expected, eclipsedFlux: eclipsed.total, sunlitFlux: sunlit.total };
}

export { decodePng };
