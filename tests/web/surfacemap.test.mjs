import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEarthMapSliced, buildEarthMap, buildFeatureMap,
} from "../../apps/web/js/surfacemap.js";

class FakeGradient {
  stops = [];
  addColorStop(...args) { this.stops.push(args); }
}

class FakeContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this.fillStyle = null;
  }
  createLinearGradient(...args) { this.calls.push(["linear", ...args]); return new FakeGradient(); }
  createRadialGradient(...args) { this.calls.push(["radial", ...args]); return new FakeGradient(); }
  fillRect(...args) { this.calls.push(["fillRect", ...args]); }
  beginPath() { this.calls.push(["beginPath"]); }
  moveTo(...args) { this.calls.push(["moveTo", ...args]); }
  lineTo(...args) { this.calls.push(["lineTo", ...args]); }
  closePath() { this.calls.push(["closePath"]); }
  fill(...args) { this.calls.push(["fill", ...args]); }
  save() { this.calls.push(["save"]); }
  restore() { this.calls.push(["restore"]); }
  ellipse(...args) { this.calls.push(["ellipse", ...args]); }
  clip() { this.calls.push(["clip"]); }
  getImageData(_x, _y, w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    // Alternate land-colour and ocean pixels so both tint branches run.
    for (let i = 0; i < data.length; i += 8) {
      data[i] = 0x3f; data[i + 1] = 0x6b; data[i + 2] = 0x32; data[i + 3] = 255;
      if (i + 7 < data.length) {
        data[i + 4] = 0x0d; data[i + 5] = 0x3b; data[i + 6] = 0x66; data[i + 7] = 255;
      }
    }
    return { data };
  }
  putImageData(...args) { this.calls.push(["putImageData", ...args]); }
}

class FakeCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ctx = new FakeContext(this);
  }
  getContext(kind) {
    assert.equal(kind, "2d");
    return this.ctx;
  }
}

globalThis.OffscreenCanvas = FakeCanvas;

const identity = (ring) => ring;

test("Earth rasterizer preserves holes, seams, pole closure, and cooperative yields", () => {
  const ordinary = [[[-10, 10], [10, 10], [10, -10], [-10, -10], [-10, 10]]];
  const hole = [[-5, 5], [5, 5], [5, -5], [-5, -5], [-5, 5]];
  const dateline = [[[179, 10], [-179, 10], [-179, 0], [179, 0], [179, 10]]];
  const pole = [[[-180, -80], [-90, -82], [0, -85], [90, -82], [180, -80]]];
  const earth = {
    land: [[ordinary[0], hole], dateline, pole],
    lakes: [[ordinary[0]]],
    ice: [pole],
  };
  const it = buildEarthMapSliced(earth, identity, { w: 8, h: 256 });
  let yields = 0, result = it.next();
  while (!result.done) { yields++; result = it.next(); }
  const canvas = result.value;
  assert.ok(canvas instanceof FakeCanvas);
  assert.ok(yields >= 2, "large maps should yield between row bands and before ice");
  assert.ok(canvas.ctx.calls.some(([name, rule]) => name === "fill" && rule === "evenodd"));
  assert.ok(canvas.ctx.calls.some(([name]) => name === "putImageData"));
  assert.ok(canvas.ctx.calls.filter(([name]) => name === "lineTo").length > 10);
});

test("synchronous Earth wrapper drains the generator", () => {
  const ring = [[-20, 20], [20, 20], [20, -20], [-20, -20], [-20, 20]];
  const canvas = buildEarthMap({ land: [[[...ring]]], lakes: [], ice: [] }, identity, { w: 4, h: 4 });
  assert.ok(canvas.ctx.calls.some(([name]) => name === "putImageData"));
});

test("feature rasterizer sorts largest-first, skips invalid sizes, and wraps seams", () => {
  const features = [
    { n: "small", d: 10, lat: 0, lon: 0, c: -0.2 },
    { n: "large", d: 100, lat: 89, lon: 359, c: 2 },
    { n: "invalid", d: 0, lat: 0, lon: 0, c: 0 },
  ];
  const canvas = buildFeatureMap(features, 1000, { w: 64, h: 32 });
  const ellipses = canvas.ctx.calls.filter(([name]) => name === "ellipse");
  assert.ok(ellipses.length >= 2);
  assert.ok(canvas.ctx.calls.some(([name]) => name === "radial"));
  assert.ok(canvas.ctx.calls.some(([name]) => name === "clip"));
});
