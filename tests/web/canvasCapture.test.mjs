import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import pngjs from 'pngjs';
import { waitForCanvasGeometry } from '../../tools/canvas_capture.mjs';
import { assertBlueEarth, assertWarmWhiteSun } from '../../tools/visual_assertions.mjs';

// Exercise the actual serialized callback with independent DOM mutations and
// timer delivery. RAF deliberately throws: geometry sampling must not use it.
async function runWait({ rectangle: initialRectangle, node: initialNode, viewport,
  mutations = [], timerDelivery = [] } = {}) {
  let now = 0, nextId = 0, rafCalls = 0, outcome;
  const tasks = new Map();
  const rectangle = { x: 125.796875, y: 144.0625, width: 731.609375, height: 612.140625 };
  const node = { width: 732, height: 612, clientWidth: 732, clientHeight: 612,
    getBoundingClientRect() { return { ...rectangle, left: rectangle.x, top: rectangle.y,
      right: rectangle.x + rectangle.width, bottom: rectangle.y + rectangle.height }; } };
  Object.assign(rectangle, initialRectangle); Object.assign(node, initialNode);
  const schedule = (fn, at, kind) => { const id = ++nextId; tasks.set(id, { fn, at, kind }); return id; };
  const context = { document: { fonts: { ready: Promise.resolve() } }, performance: { now: () => now },
    visualViewport: { pageLeft: 0, pageTop: 69 }, innerWidth: 1280, innerHeight: 900, devicePixelRatio: 1,
    requestAnimationFrame() { rafCalls += 1; throw new Error('Compositor frame delivery is unavailable'); },
    setTimeout(fn, delay) { return schedule(() => { now = timerDelivery.shift() ?? now; fn(); }, now + delay, 'timer'); },
    clearTimeout(id) { tasks.delete(id); },
  };
  Object.assign(context, viewport);
  for (const mutation of mutations) schedule(() => {
    Object.assign(rectangle, mutation.rectangle); Object.assign(node, mutation.node);
    Object.assign(context.visualViewport, mutation.viewport);
  }, mutation.at, 'mutation');
  vm.runInNewContext(`(${waitForCanvasGeometry.toString()})`, context)(node).then(
    value => { outcome = { value }; }, error => { outcome = { error }; });
  for (let step = 0; step < 2_000 && !outcome; step += 1) {
    for (let microtask = 0; microtask < 8; microtask += 1) await Promise.resolve();
    if (outcome) break;
    const task = [...tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!task) throw new Error('Geometry wait has no scheduled poll or deadline');
    tasks.delete(task[0]); now = Math.max(now, task[1].at); task[1].fn();
  }
  assert.ok(outcome, 'geometry wait must terminate');
  assert.equal(rafCalls, 0, 'layout readiness must not depend on compositor callbacks');
  return { ...outcome, now, pending: [...tasks.values()].filter(task => task.kind === 'timer').length };
}

test('stable geometry remains capturable without any animation frame delivery', async () => {
  const result = await runWait();
  assert.ifError(result.error);
  assert.equal(result.now, 200);
  assert.deepEqual(Array.from(result.value), [125.796875, 144.0625, 731.609375, 612.140625, 0, 69, 732, 612]);
  assert.equal(result.pending, 0);
});

test('stable geometry can pass a delayed layout poll still inside the deadline', async () => {
  const result = await runWait({ timerDelivery: [9_900] });
  assert.ifError(result.error);
  assert.equal(result.now, 9_900);
  assert.equal(result.pending, 0);
});

test('a genuine geometry change restarts the full 200ms stability interval', async () => {
  const result = await runWait({ mutations: [
    { at: 150, rectangle: { height: 628.140625 }, node: { height: 628, clientHeight: 628 } },
  ] });
  assert.ifError(result.error);
  assert.equal(result.now, 350);
  assert.equal(result.value[3], 628.140625);
  assert.equal(result.pending, 0);
});

test('continuous layout movement fails with bounded sample and change diagnostics', async () => {
  const result = await runWait({ mutations: Array.from({ length: 199 }, (_, i) => ({ at: (i + 1) * 50,
    rectangle: { x: 125.796875 + (i + 1) % 2 } })) });
  assert.match(result.error.message, /^canvas capture did not settle:/);
  const detail = JSON.parse(result.error.message.split(': ').slice(1).join(': '));
  assert.equal(result.now, 10_000);
  assert.equal(detail.samples, 201);
  assert.equal(detail.initial[0], 125.796875);
  assert.equal(detail.changes.length, 32);
  assert.ok(detail.changes[0].elapsedMs > 0);
  assert.equal(result.pending, 0);
});

test('timer delivery at or beyond the deadline cannot qualify unchanged geometry', async () => {
  for (const delivery of [10_000, 10_050]) {
    const result = await runWait({ timerDelivery: [delivery] });
    assert.match(result.error.message, /^canvas capture did not settle:/);
    assert.equal(result.now, delivery);
    const detail = JSON.parse(result.error.message.split(': ').slice(1).join(': '));
    assert.equal(detail.samples, 2);
    assert.equal(result.pending, 0);
  }
});

test('backing dimensions must align and settle after correction', async () => {
  const result = await runWait({ node: { width: 300, height: 150 }, mutations: [
    { at: 150, node: { width: 732, height: 612 } },
  ] });
  assert.ifError(result.error);
  assert.equal(result.now, 350);
  assert.deepEqual(Array.from(result.value.slice(6)), [732, 612]);
  const stale = await runWait({ node: { width: 300, height: 150 } });
  assert.match(stale.error.message, /^canvas capture geometry is not visible\/aligned:/);
});

test('stable canvases crossing any viewport edge are rejected', async () => {
  for (const rectangle of [{ x: -1 }, { y: -1 }, { x: 600 }, { y: 400 }]) {
    const result = await runWait({ rectangle });
    assert.match(result.error.message, /^canvas capture geometry is not visible\/aligned:/);
  }
});

test('backing alignment uses device pixel ratio', async () => {
  const result = await runWait({ viewport: { devicePixelRatio: 2 }, node: { width: 1464, height: 1224 } });
  assert.ifError(result.error);
  assert.deepEqual(Array.from(result.value.slice(6)), [1464, 1224]);
  const stale = await runWait({ viewport: { devicePixelRatio: 2 } });
  assert.match(stale.error.message, /^canvas capture geometry is not visible\/aligned:/);
});

test('page scrolling restarts stability even when the canvas viewport rectangle is unchanged', async () => {
  const result = await runWait({ mutations: [{ at: 150, viewport: { pageTop: 85 } }] });
  assert.ifError(result.error);
  assert.equal(result.now, 350);
  assert.equal(result.value[5], 85);
});

test('stable geometry cannot qualify blank or incorrectly colored Sun and Earth screenshots', async () => {
  assert.ifError((await runWait()).error);
  const { PNG } = pngjs;
  const disc = rgb => {
    const image = new PNG({ width: 160, height: 120 });
    for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
      const inside = (x - 80) ** 2 + (y - 60) ** 2 <= 32 ** 2;
      const offset = (y * image.width + x) * 4;
      image.data.set([...(inside ? rgb : [0, 0, 0]), 255], offset);
    }
    return PNG.sync.write(image);
  };
  const blank = disc([0, 0, 0]);
  assert.throws(() => assertWarmWhiteSun(blank), /Sun is missing or too dark/);
  assert.throws(() => assertBlueEarth(blank), /Earth is missing or lacks visible blue oceans/);
  assert.throws(() => assertWarmWhiteSun(disc([240, 130, 35])), /Sun is materially orange\/discoloured/);
  assert.throws(() => assertBlueEarth(disc([230, 55, 25])), /Earth is missing or lacks visible blue oceans/);
});
