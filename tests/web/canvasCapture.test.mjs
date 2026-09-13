import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { waitForCanvasGeometry } from '../../tools/canvas_capture.mjs';

// Exercise the actual serialized browser callback, with deterministic browser
// scheduling, including late delivery on a busy main thread.
const waitSource = waitForCanvasGeometry.toString();

async function runWait({ frames = [], rectangle: initialRectangle, node: initialNode, viewport,
  mutations = [], defaultFrame = now => ({ at: now + 16.7 }) } = {}) {
  let now = 0, nextId = 0, frameCount = 0, canceledFrames = 0, outcome;
  const tasks = new Map();
  const rectangle = { x: 125.796875, y: 144.0625, width: 731.609375, height: 612.140625 };
  const node = { width: 732, height: 612, clientWidth: 732, clientHeight: 612,
    getBoundingClientRect() { return { ...rectangle, left: rectangle.x, top: rectangle.y,
      right: rectangle.x + rectangle.width, bottom: rectangle.y + rectangle.height }; } };
  Object.assign(rectangle, initialRectangle); Object.assign(node, initialNode);
  const schedule = (fn, at, kind) => { const id = ++nextId; tasks.set(id, { fn, at, kind }); return id; };
  const context = { document: { fonts: { ready: Promise.resolve() } }, performance: { now: () => now },
    visualViewport: { pageLeft: 0, pageTop: 69 }, innerWidth: 1280, innerHeight: 900, devicePixelRatio: 1,
    requestAnimationFrame(fn) {
      const event = frames[frameCount++] || defaultFrame(now, frameCount);
      if (!event) return ++nextId;
      return schedule(() => { now = event.deliveredAt ?? now;
        Object.assign(rectangle, event.rectangle); Object.assign(node, event.node);
        Object.assign(context.visualViewport, event.viewport); fn(now); }, event.at, 'frame');
    },
    cancelAnimationFrame(id) { canceledFrames += 1; tasks.delete(id); },
    setTimeout(fn, delay) { return schedule(fn, now + delay, 'timer'); },
    clearTimeout(id) { tasks.delete(id); },
  };
  Object.assign(context, viewport);
  for (const mutation of mutations) schedule(() => {
    Object.assign(rectangle, mutation.rectangle); Object.assign(node, mutation.node);
    Object.assign(context.visualViewport, mutation.viewport);
  }, mutation.at, 'mutation');
  vm.runInNewContext(`(${waitSource})`, context)(node).then(
    value => { outcome = { value }; }, error => { outcome = { error }; });
  for (let step = 0; step < 2_000 && !outcome; step += 1) {
    for (let microtask = 0; microtask < 8; microtask += 1) await Promise.resolve();
    if (outcome) break;
    const task = [...tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!task) throw new Error('Geometry wait has no scheduled delivery or deadline');
    tasks.delete(task[0]); now = task[1].at; task[1].fn();
  }
  assert.ok(outcome, 'geometry wait must terminate');
  return { ...outcome, now, frameCount, canceledFrames,
    pending: [...tasks.values()].filter(task => task.kind !== 'mutation').length };
}

test('stable geometry survives a first animation frame near the ten-second deadline', async () => {
  const result = await runWait({ frames: [{ at: 9_900 }] });
  assert.ifError(result.error);
  assert.deepEqual(Array.from(result.value), [125.796875, 144.0625, 731.609375, 612.140625, 0, 69, 732, 612]);
  assert.equal(result.now, 9_900);
  assert.equal(result.pending, 0);
});

test('stable layout remains capturable when only the first animation frame is delivered', async () => {
  const result = await runWait({ frames: [{ at: 150 }], defaultFrame: () => null });
  assert.ifError(result.error);
  assert.equal(result.now, 200);
  assert.equal(result.frameCount, 1);
  assert.equal(result.pending, 0);
});

test('a genuine geometry change restarts the 200ms stability interval', async () => {
  const result = await runWait({ frames: [
    { at: 150, rectangle: { height: 628.140625 }, node: { height: 628, clientHeight: 628 } },
    { at: 250 }, { at: 350 },
  ] });
  assert.ifError(result.error);
  assert.equal(result.now, 350);
  assert.equal(result.value[3], 628.140625);
  assert.equal(result.pending, 0);
});

test('continuous layout movement fails with bounded change and frame diagnostics', async () => {
  const result = await runWait({ frames: [{ at: 50 }], defaultFrame: () => null,
    mutations: Array.from({ length: 199 }, (_, i) => ({ at: (i + 1) * 50,
      rectangle: { x: 125.796875 + (i + 1) % 2 } })) });
  assert.match(result.error.message, /^canvas capture did not settle:/);
  const detail = JSON.parse(result.error.message.split(': ').slice(1).join(': '));
  assert.equal(result.now, 10_000);
  assert.equal(detail.frames, 1);
  assert.equal(detail.firstFrameMs, 50);
  assert.equal(detail.samples, 200);
  assert.equal(detail.initial[0], 125.796875);
  assert.equal(detail.changes.length, 32);
  assert.ok(detail.changes[0].elapsedMs > 0);
  assert.equal(result.pending, 0);
});

test('a missing animation frame times out and cancels its pending request', async () => {
  const result = await runWait({ defaultFrame: () => null });
  assert.match(result.error.message, /^canvas capture did not settle:/);
  const detail = JSON.parse(result.error.message.split(': ').slice(1).join(': '));
  assert.equal(result.now, 10_000);
  assert.equal(detail.frames, 0);
  assert.equal(detail.firstFrameMs, null);
  assert.equal(detail.changes.length, 1);
  assert.equal(result.canceledFrames, 1);
  assert.equal(result.pending, 0);
});

test('a late frame cannot pass the deadline when a busy main thread also delays timers', async () => {
  const result = await runWait({ frames: [{ at: 9_900, deliveredAt: 10_050 }] });
  assert.match(result.error.message, /^canvas capture did not settle:/);
  assert.equal(result.now, 10_050);
  const detail = JSON.parse(result.error.message.split(': ').slice(1).join(': '));
  assert.equal(detail.frames, 1);
  assert.equal(detail.firstFrameMs, 10_050);
  assert.equal(result.pending, 0);
});

test('backing dimensions must align and settle after the first delivered correction', async () => {
  const result = await runWait({ node: { width: 300, height: 150 }, frames: [
    { at: 150, node: { width: 732, height: 612 } }, { at: 250 }, { at: 350 },
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
  assert.deepEqual(Array.from(result.value), [125.796875, 144.0625, 731.609375, 612.140625, 0, 69, 1464, 1224]);
  const stale = await runWait({ viewport: { devicePixelRatio: 2 } });
  assert.match(stale.error.message, /^canvas capture geometry is not visible\/aligned:/);
});

test('page scrolling restarts stability even when the canvas viewport rectangle is unchanged', async () => {
  const result = await runWait({ frames: [{ at: 50 }], defaultFrame: () => null,
    mutations: [{ at: 150, viewport: { pageTop: 85 } }] });
  assert.ifError(result.error);
  assert.equal(result.now, 350);
  assert.equal(result.value[5], 85);
});

test('timer polling detects a layout change after the only delivered animation frame', async () => {
  const result = await runWait({ frames: [{ at: 50 }], defaultFrame: () => null,
    mutations: [{ at: 150, rectangle: { height: 628.140625 }, node: { height: 628, clientHeight: 628 } }] });
  assert.ifError(result.error);
  assert.equal(result.now, 350);
  assert.equal(result.value[3], 628.140625);
  assert.equal(result.frameCount, 1);
  assert.equal(result.pending, 0);
});
