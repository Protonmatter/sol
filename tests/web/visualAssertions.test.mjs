import assert from "node:assert/strict";
import test from "node:test";
import pngjs from "pngjs";
import {
  TOTAL_ECLIPSE_MARKER_FACTOR,
  assertBlueEarth,
  assertEclipsedMoonMarker,
  assertFrameChanged,
  assertMoonTransitShadow,
  assertNoMoonTransitShadow,
  assertOrbitRoundTrip,
  assertWarmWhiteSun,
} from "../../tools/visual_assertions.mjs";

const { PNG } = pngjs;

function disc({ color, background = [3, 5, 12], offsetX = 0 }) {
  const image = new PNG({ width: 160, height: 120 });
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const inside = (x - (80 + offsetX)) ** 2 + (y - 60) ** 2 <= 32 ** 2;
      const rgb = inside ? color : background;
      const offset = (y * image.width + x) * 4;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
      image.data[offset + 3] = 255;
    }
  }
  return PNG.sync.write(image);
}

test("visual Sun assertion accepts warm white and rejects the former orange palette", () => {
  const stats = assertWarmWhiteSun(disc({ color: [238, 226, 205] }));
  assert.ok(stats.blueRed > 0.8);
  assert.throws(
    () => assertWarmWhiteSun(disc({ color: [240, 130, 35] })),
    /orange\/discoloured/
  );
});

test("visual Earth assertion requires a material blue component", () => {
  assert.ok(assertBlueEarth(disc({ color: [35, 92, 168] })).bluePixels > 100);
  assert.throws(
    () => assertBlueEarth(disc({ color: [95, 84, 70] })),
    /lacks visible blue oceans/
  );
});

test("visual camera assertion accepts a round trip and catches a flipped frame", () => {
  const initial = disc({ color: [35, 92, 168] });
  const same = disc({ color: [35, 92, 168] });
  const shifted = disc({ color: [35, 92, 168], offsetX: 24 });
  assert.equal(assertOrbitRoundTrip(initial, same).meanDifference, 0);
  assert.throws(() => assertOrbitRoundTrip(initial, shifted), /did not return/);
});

test("visual animation assertion rejects a frozen frame and accepts material motion", () => {
  const initial = disc({ color: [35, 92, 168] });
  const same = disc({ color: [35, 92, 168] });
  const shifted = disc({ color: [35, 92, 168], offsetX: 24 });
  assert.throws(() => assertFrameChanged(initial, same), /appears frozen/);
  assert.ok(assertFrameChanged(initial, shifted).meanDifference > 1.5);
});

// ---------------------------------------------------------------------------------------------
// Moon transit shadows and moon eclipses. The assertions themselves are exercised against the
// real renderer by tools/browser_validation.mjs; what is checked here is that they actually
// discriminate — that an honest frame passes and each way of getting the shadow wrong fails —
// without needing a GPU. The synthetic scene is the simplest one the pixel maths accepts: a unit
// sphere at the origin, an unrotated body frame, and the camera parked on the Sun-planet line six
// radii out, so the sub-solar point is the middle of the image and its Lambert term is exactly 1.
const SYNTHETIC_WIDTH = 400;
const SYNTHETIC_HEIGHT = 300;
const SYNTHETIC_EYE_RADII = 6;
const SYNTHETIC_UMBRA_PX = 10;
const SYNTHETIC_PENUMBRA_PX = 14;

function syntheticPlan(overrides = {}) {
  const step = 8;
  const clearW = Math.ceil(SYNTHETIC_WIDTH / step);
  const clearH = Math.ceil(SYNTHETIC_HEIGHT / step);
  return {
    cw: SYNTHETIC_WIDTH,
    ch: SYNTHETIC_HEIGHT,
    aspect: SYNTHETIC_WIDTH / SYNTHETIC_HEIGHT,
    tanHalf: Math.tan((21 * Math.PI) / 180),
    eye: [SYNTHETIC_EYE_RADII, 0, 0],
    fwd: [-1, 0, 0],
    right: [0, 1, 0],
    up: [0, 0, 1],
    P: [0, 0, 0],
    rEq: 1,
    oblate: 1,
    rot: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    sunward: [1, 0, 0],
    markers: [],
    sunlit: {},
    shadows: [],
    labelResidual: 0,
    clearStep: step,
    clearW,
    clearH,
    clear: "1".repeat(clearW * clearH),
    ...overrides,
  };
}

/** The same ray/sphere solve the assertions use, so the synthetic frame and they agree. */
function syntheticLambert(plan, px, py) {
  const ndx = ((2 * (px + 0.5)) / plan.cw - 1) * plan.aspect * plan.tanHalf;
  const ndy = (1 - (2 * (py + 0.5)) / plan.ch) * plan.tanHalf;
  const d = [-1, ndx, ndy];
  const length = Math.hypot(d[0], d[1], d[2]);
  const dir = [d[0] / length, d[1] / length, d[2] / length];
  const o = plan.eye;
  const b = 2 * (o[0] * dir[0] + o[1] * dir[1] + o[2] * dir[2]);
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1;
  const disc = b * b - 4 * c;
  if (!(disc > 0)) return null;
  const t = (-b - Math.sqrt(disc)) / 2;
  if (!(t > 0)) return null;
  return o[0] + t * dir[0]; // the hit's x component is its Lambert term for a +x Sun
}

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * A Jupiter-like disc with a gentle banded albedo, shaded exactly as SPHERE_FS does, with an
 * optional shadow at the centre of the image. `sunVis` is the renderer's own term, so passing
 * "inverted" reproduces the mutation that turns shadows into bright spots.
 */
function syntheticDisc({ shadow = "none", ambient = 0.05 } = {}) {
  const plan = syntheticPlan();
  const image = new PNG({ width: SYNTHETIC_WIDTH, height: SYNTHETIC_HEIGHT });
  const cx = (SYNTHETIC_WIDTH - 1) / 2, cy = (SYNTHETIC_HEIGHT - 1) / 2;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.data[offset + 3] = 255;
      const lambert = syntheticLambert(plan, x, y);
      if (lambert === null || lambert <= 0) continue;
      const cone = smoothstep(
        SYNTHETIC_UMBRA_PX, SYNTHETIC_PENUMBRA_PX, Math.hypot(x - cx, y - cy)
      );
      const sunVis = shadow === "none" ? 1 : shadow === "inverted" ? 1 - cone : cone;
      const albedo = 0.72 + 0.1 * Math.sin(y * 0.09);
      const level = Math.round(255 * albedo * (ambient + (1 - ambient) * lambert * sunVis));
      image.data[offset] = Math.min(255, level);
      image.data[offset + 1] = Math.min(255, level);
      image.data[offset + 2] = Math.min(255, level);
    }
  }
  return PNG.sync.write(image);
}

function transitPlan() {
  return syntheticPlan({
    shadows: [{
      name: "Io",
      umbra: 0.021,
      penumbra: 0.030,
      at: [(SYNTHETIC_WIDTH - 1) / 2, (SYNTHETIC_HEIGHT - 1) / 2],
      lambert: 1,
      cosNV: 1,
      umbraPx: SYNTHETIC_UMBRA_PX,
      penumbraPx: SYNTHETIC_PENUMBRA_PX,
    }],
  });
}

test("moon transit assertion accepts an honest umbra and rejects an inverted or absent one", () => {
  const stats = assertMoonTransitShadow(syntheticDisc({ shadow: "cast" }), transitPlan());
  assert.equal(stats.blobs, 1);
  // The umbral core keeps only the ambient floor: 0.05 / (0.05 + 0.95 * 1).
  assert.ok(Math.abs(stats.shadows[0].depth - 0.05) < 0.01, `depth ${stats.shadows[0].depth}`);
  assert.ok(stats.shadows[0].offset < 1, `offset ${stats.shadows[0].offset}`);
  assert.throws(
    () => assertMoonTransitShadow(syntheticDisc({ shadow: "inverted" }), transitPlan()),
    /removes the wrong amount of light/
  );
  assert.throws(
    () => assertMoonTransitShadow(syntheticDisc({ shadow: "none" }), transitPlan()),
    /removes the wrong amount of light/
  );
  // A shadow painted as a hole in the planet rather than as unlit-but-ambient surface is just as
  // wrong as no shadow at all, and is the reason the depth band has a lower bound.
  assert.throws(
    () => assertMoonTransitShadow(syntheticDisc({ shadow: "cast", ambient: 0 }), transitPlan()),
    /removes the wrong amount of light/
  );
});

test("moon transit assertion rejects a plan whose camera no longer matches the renderer", () => {
  assert.throws(
    () => assertMoonTransitShadow(
      syntheticDisc({ shadow: "cast" }),
      { ...transitPlan(), labelResidual: 3.2 }
    ),
    /no longer reproduces the renderer's own projection/
  );
});

test("no-transit control assertion passes on a clean disc and catches a stray shadow", () => {
  const clean = assertNoMoonTransitShadow(
    syntheticDisc({ shadow: "none" }), syntheticPlan(), SYNTHETIC_UMBRA_PX
  );
  assert.ok(clean.darkest > 0.6, `darkest local contrast ${clean.darkest}`);
  assert.throws(
    () => assertNoMoonTransitShadow(
      syntheticDisc({ shadow: "cast" }), syntheticPlan(), SYNTHETIC_UMBRA_PX
    ),
    /shadow-like dark blob/
  );
});

function markerFrame(brightness) {
  const image = new PNG({ width: SYNTHETIC_WIDTH, height: SYNTHETIC_HEIGHT });
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.data[offset + 3] = 255;
      const r = Math.hypot(x - 120, y - 150);
      if (r > 12) continue;
      // A half-lit sphere, which is what the eclipse pair sees from over the planet's pole.
      const shade = Math.max(0, (120 - x) / 12 + 0.6);
      const level = Math.round(Math.min(255, 210 * brightness * Math.min(1, shade)));
      image.data[offset] = level;
      image.data[offset + 1] = level;
      image.data[offset + 2] = level;
    }
  }
  return PNG.sync.write(image);
}

test("moon eclipse assertion measures the shipped ramp and catches a deleted one", () => {
  const marker = { name: "Io", at: [120, 150], radiusPx: 12 };
  const eclipsedPlan = syntheticPlan({ markers: [marker], sunlit: { Io: 0 } });
  const sunlitPlan = syntheticPlan({ markers: [marker], sunlit: { Io: 1 } });
  const stats = assertEclipsedMoonMarker(
    markerFrame(TOTAL_ECLIPSE_MARKER_FACTOR), markerFrame(1), eclipsedPlan, sunlitPlan, "Io"
  );
  assert.ok(Math.abs(stats.ratio - TOTAL_ECLIPSE_MARKER_FACTOR) < 0.02, `ratio ${stats.ratio}`);
  // `const eclipsed = 1.0` — the moon never dims.
  assert.throws(
    () => assertEclipsedMoonMarker(markerFrame(1), markerFrame(1), eclipsedPlan, sunlitPlan, "Io"),
    /keeps 1\.\d+ of its unshadowed light/
  );
  // A ramp without the 1/2.2 transfer would leave only the linear 0.06 floor.
  assert.throws(
    () => assertEclipsedMoonMarker(markerFrame(0.06), markerFrame(1), eclipsedPlan, sunlitPlan, "Io"),
    /outside the .* band around the shipped ramp/
  );
  // And an instant where the shipped geometry says the moon is not eclipsed at all is refused
  // before any pixel is read, so the gate can never quietly measure the wrong moment.
  assert.throws(
    () => assertEclipsedMoonMarker(
      markerFrame(TOTAL_ECLIPSE_MARKER_FACTOR), markerFrame(1),
      syntheticPlan({ markers: [marker], sunlit: { Io: 0.4 } }), sunlitPlan, "Io"
    ),
    /not in total umbra/
  );
});
