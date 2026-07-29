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

export { decodePng };
