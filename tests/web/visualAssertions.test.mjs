import assert from "node:assert/strict";
import test from "node:test";
import pngjs from "pngjs";
import {
  assertBlueEarth,
  assertFrameChanged,
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
