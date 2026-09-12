import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { SYSTEM_ORDER, assertSystemSnapshot, validateSystemRequest } from "../../apps/web/js/systemContract.js";
import { LatestWorkerClient } from "../../apps/web/js/workerClient.js";

const moduleUrl = new URL("../../apps/web/js/orrery.js", import.meta.url);
const source = fs.readFileSync(moduleUrl, "utf8");

// Execute the whole production module, including attach(), entry, fallback, Retry,
// metadata refresh, paint and the frame loop. Only browser/GPU and engine I/O are
// doubled; no lifecycle or rendering function is replaced with a test implementation.
async function harness(t) {
  const frames = new Map(), requests = [], errors = [], positionEpochs = [], presentations = [];
  const documentHandlers = new Map(), snapshotReplies = new Map();
  let frameId = 0, draws = 0, contexts = 0, workerFailure = false, monotonicNow = 100;
  let wallUnix = 1800000000, snapshotsHeld = false, engineLoad = Promise.resolve();
  const gl = new Proxy({
    isContextLost: () => false,
    getExtension: () => null,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    drawElements: () => { draws++; },
    drawArrays: () => { draws++; },
  }, { get(target, name) {
    if (name in target) return target[name];
    if (/^[A-Z_0-9]+$/.test(name)) return 1;
    return () => ({});
  } });
  function node(extra = {}) {
    const handlers = new Map();
    return { style: {}, hidden: false, textContent: "", handlers,
      addEventListener: (event, fn) => handlers.set(event, fn), ...extra };
  }
  const nodes = {
    orreryCanvas: node({ clientWidth: 800, clientHeight: 600, width: 800, height: 600,
      getContext(type) { assert.equal(type, "webgl2"); contexts++; return gl; } }),
    orreryRetry: node({ hidden: true }), orreryAccuracy: node(), orreryInsight: node(),
    orreryAnimate: node({ checked: true }), orreryNow: node(),
  };
  const snapshot = unix => ({ schema_version: "system-snapshot.v1", jd_utc: unix / 86400 + 2440587.5,
    bodies: SYSTEM_ORDER.map((name, i) => ({ name, x_au: i + 1, y_au: 0, z_au: 0,
      dist_au: i + 1, geo_dist_au: Math.abs(i - 2), speed_kms: 1,
      phase_angle_deg: 0, illuminated_fraction: 1, magnitude: 0,
      equilibrium_temp_k: 250, mean_temp_k: 250, a_au: i + 1, ecc: 0,
      inc_deg: 0, node_deg: 0, argp_deg: 0 })) });
  // Keep the real request scheduler/cancellation behavior; replace only Worker I/O.
  const client = new LatestWorkerClient({ engine: "system", schema: "system-snapshot.v1",
    release: "test", validateRequest: validateSystemRequest,
    createWorker() {
      const worker = { terminate() {}, postMessage(request) {
        const reply = () => worker.onmessage({ data: { ...request,
          type: workerFailure ? "error" : "result", value: snapshot(request.payload.unix),
          error: { code: "engine_failed", message: "test worker unavailable" } } });
        snapshotReplies.set(requests.length - 1, reply);
        if (!snapshotsHeld) queueMicrotask(reply);
      } };
      return worker;
    } });
  t.after(() => client.dispose());
  const boundary = {
    loadSkyEngine: () => engineLoad,
    SYSTEM_POSITIONS_ORDER: SYSTEM_ORDER,
    systemPositions(unix) {
      positionEpochs.push(unix);
      return Float64Array.from({ length: 27 }, (_, i) => i % 3 === 0 ? 1 + i / 3 : 0);
    },
    cancelSystemSnapshot: () => client.cancel(),
    async requestSystemSnapshot(unix) {
      requests.push(unix);
      return assertSystemSnapshot(await client.request({ unix }), unix);
    },
  };
  const bindings = {};
  for (const [, names, path] of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+"([^"]+)";/gm)) {
    const namespace = /\/(skyEngine|systemWorkerClient)\.js\?/.test(path)
      ? boundary : await import(new URL(path, moduleUrl));
    if (names.startsWith("* as ")) bindings[names.slice(5).trim()] = namespace;
    else for (const name of names.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean)) {
      bindings[name] = namespace[name];
    }
  }
  const context = vm.createContext({ ...bindings, Event,
    Date: class extends Date { static now() { return wallUnix * 1000; } },
    console: { error: (...args) => errors.push(args), warn: () => {} },
    document: { hidden: false, getElementById: id => nodes[id] ?? null,
      addEventListener: (event, fn) => documentHandlers.set(event, fn) },
    window: { devicePixelRatio: 1, addEventListener() {},
      dispatchEvent() { presentations.push(bindings.store.orrery.presentation); },
      matchMedia: () => ({ matches: false }) },
    performance: { now: () => monotonicNow },
    requestAnimationFrame(fn) { const id = ++frameId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    Image: class {}, fetch: async () => ({ ok: false }),
    // Optional catalogue downloads remain pending, as they can during first paint.
    loadOptionalModule: () => new Promise(() => {}),
  });
  // Real imported DOM presenters execute in Node's realm, not the VM's realm.
  for (const name of ["document", "window"]) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value: context[name], configurable: true });
    t.after(() => prior ? Object.defineProperty(globalThis, name, prior) : delete globalThis[name]);
  }
  const executable = source.replace(/^import\s+[\s\S]*?\s+from\s+"[^"]+";/gm, "")
    .replace(/export function /g, "function ").replace(/\bimport\(/g, "loadOptionalModule(");
  vm.runInContext(executable + "\nglobalThis.lifecycle = { enterOrrery, leaveOrrery };", context,
    { filename: moduleUrl.pathname });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { nodes, frames, requests, errors, positionEpochs, presentations, state: bindings.store.orrery,
    ...context.lifecycle, settle,
    advanceMonotonicTime(value) { monotonicNow = value; },
    failWorker(value) { workerFailure = value; },
    setWallUnix(value) { wallUnix = value; },
    holdSnapshots(value = true) { snapshotsHeld = value; },
    completeSnapshot(index = requests.length - 1) { snapshotReplies.get(index)(); },
    holdEngine() { let resolve; engineLoad = new Promise(done => { resolve = done; }); return resolve; },
    setHidden(value) { context.document.hidden = value; documentHandlers.get("visibilitychange")(); },
    setAnimate(value) {
      nodes.orreryAnimate.checked = value;
      nodes.orreryAnimate.handlers.get("change")({ currentTarget: nodes.orreryAnimate });
    },
    now() { nodes.orreryNow.handlers.get("click")(); },
    get draws() { return draws; }, get contexts() { return contexts; },
    async retry() { nodes.orreryRetry.handlers.get("click")(); await settle(); },
    frame(now) { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(now); },
  };
}

test("Retry after failed System re-entry restores the retained canvas and animation loop", async t => {
  const h = await harness(t);
  await h.enterOrrery();
  assert.equal(h.state.engineError, "");
  assert.equal(h.state.bodies.length, 9);
  assert.equal(h.contexts, 1);
  assert.ok(h.draws > 0, "first entry reaches real paint and GPU draw calls");
  assert.equal(h.frames.size, 1);
  h.leaveOrrery();
  assert.equal(h.frames.size, 0);
  h.failWorker(true);
  await h.enterOrrery(); await h.settle();
  assert.equal(h.state.bodies.length, 9, "last valid metadata survives failure");
  assert.equal(h.nodes.orreryCanvas.style.display, "none");
  assert.equal(h.nodes.orreryRetry.hidden, false);
  assert.equal(h.frames.size, 0);
  await h.retry();
  assert.match(h.state.engineError, /test worker unavailable/);
  assert.equal(h.nodes.orreryCanvas.style.display, "none", "failed Retry retains fallback");
  assert.equal(h.nodes.orreryRetry.hidden, false);
  assert.equal(h.frames.size, 0, "failed Retry cannot start animation with invalid entry data");
  h.failWorker(false);
  const before = h.draws;
  await h.retry();
  assert.equal(h.state.engineError, "");
  assert.equal(h.nodes.orreryCanvas.style.display, "", "successful Retry must restore canvas visibility");
  assert.equal(h.nodes.orreryRetry.hidden, true);
  assert.equal(h.contexts, 1, "reuse the initialized WebGL context");
  assert.ok(h.draws > before, "recovery repaints immediately");
  assert.equal(h.frames.size, 1, "recovery restarts exactly one frame loop");
  const unix = h.state.renderUnix;
  h.frame(1000);
  assert.ok(h.state.renderUnix > unix, "recovered loop advances the actual simulation clock");
  assert.equal(h.frames.size, 1);
  h.leaveOrrery();
});

test("reentrant Retry handler cannot cancel the full System recovery already entering", async t => {
  const h = await harness(t);
  await h.enterOrrery();
  h.leaveOrrery();
  h.failWorker(true);
  await h.enterOrrery(); await h.settle();
  assert.equal(h.nodes.orreryCanvas.style.display, "none");
  assert.equal(h.nodes.orreryRetry.hidden, false);
  assert.equal(h.frames.size, 0);
  h.failWorker(false);
  const before = h.draws, requestCount = h.requests.length;
  const first = h.retry();
  assert.equal(h.state.entering, true, "second invocation precedes entry's worker result publication");
  // Boundary-injected reentrancy, not proof of a user double-click: the first
  // handler synchronously hides Retry, so a browser may not dispatch another click.
  const second = h.retry();
  await Promise.all([first, second]);
  assert.equal(h.state.engineError, "");
  assert.equal(h.nodes.orreryCanvas.style.display, "");
  assert.equal(h.frames.size, 1, "reentrant Retry must complete one full rendering recovery");
  assert.ok(h.draws > before, "recovery paints the retained canvas");
  assert.equal(h.requests.length, requestCount + 1, "invocations coalesce into the pending entry request");
  assert.equal(h.state.entering, false);
  assert.equal(h.nodes.orreryRetry.hidden, true);
  const unix = h.state.renderUnix;
  h.frame(1000);
  assert.ok(h.state.renderUnix > unix);
  assert.equal(h.frames.size, 1);
  h.leaveOrrery();
});

test("paused System recovery repaints but does not turn animation on", async t => {
  const h = await harness(t);
  h.state.animate = false;
  await h.enterOrrery();
  h.frame(1000);
  assert.equal(h.frames.size, 0, "paused view idles after its entry frame");
  h.leaveOrrery();
  h.failWorker(true);
  await h.enterOrrery(); await h.settle();
  assert.equal(h.nodes.orreryCanvas.style.display, "none");
  h.failWorker(false);
  const before = h.draws;
  await h.retry();
  assert.equal(h.nodes.orreryCanvas.style.display, "");
  assert.equal(h.state.engineError, "");
  assert.ok(h.draws > before);
  assert.equal(h.state.animate, false);
  assert.equal(h.frames.size, 1);
  const unix = h.state.renderUnix;
  h.frame(2000);
  assert.equal(h.state.renderUnix, unix);
  assert.equal(h.frames.size, 0, "recovered paused view returns to idle");
  h.leaveOrrery();
});

test("metadata-only Retry preserves the running System epoch and single animation loop", async t => {
  const h = await harness(t);
  await h.enterOrrery();
  h.failWorker(true);
  h.advanceMonotonicTime(1000);
  h.frame(1000);
  await h.settle();
  assert.match(h.state.engineError, /Orbital metadata unavailable/);
  assert.equal(h.nodes.orreryCanvas.style.display, "");
  assert.equal(h.frames.size, 1);
  const unix = h.state.renderUnix;
  const requestCount = h.requests.length;
  h.failWorker(false);
  await h.retry();
  assert.equal(h.state.engineError, "");
  assert.equal(h.state.renderUnix, unix, "metadata recovery must not reset the rendered clock");
  assert.equal(h.requests.length, requestCount + 1);
  assert.equal(h.requests.at(-1), unix, "metadata request is bound to the current rendered epoch");
  assert.equal(h.frames.size, 1);
  assert.equal(h.contexts, 1);
  h.leaveOrrery();
});

for (const { edge, start, direction } of [
  { edge: "upper", start: "9999-12-31T23:59:00Z", direction: 1 },
  // Reverse rate is adversarial state injection; the current speed controls only
  // advance time. Admission must still protect the lower computational boundary.
  { edge: "lower", start: "-009999-01-01T00:01:00Z", direction: -1 },
]) test(`System animation retains its last valid epoch at the ${edge} bound and recovers through Now`, async t => {
  const h = await harness(t);
  const initialUnix = Date.parse(start) / 1000;
  h.setWallUnix(initialUnix);
  await h.enterOrrery();
  h.state.yearsPerSec = direction / (24 * 365.25);
  h.holdSnapshots();
  h.advanceMonotonicTime(1000);
  h.frame(1000);
  assert.equal(h.state.renderUnix, initialUnix + direction * 57.6, "first frame remains admitted");
  assert.equal(h.requests.length, 2, "hold a valid metadata refresh across the next frame");
  const validUnix = h.state.renderUnix, validBodies = h.state.bodies;
  const validElapsed = h.state.simElapsed, validMetadataUnix = h.state.metadataUnix;
  const positionsBefore = h.positionEpochs.length, drawsBefore = h.draws;
  h.frame(1050);
  assert.equal(h.positionEpochs.length, positionsBefore, "unsupported epoch must not reach raw WASM positions");
  assert.equal(h.state.renderUnix, validUnix);
  assert.equal(h.state.simElapsed, validElapsed);
  assert.equal(h.state.bodies, validBodies, "rejected frame keeps the complete coordinate set");
  assert.equal(h.state.metadataUnix, validMetadataUnix);
  assert.equal(h.state.simStepSeconds, 0);
  assert.equal(h.state.animate, false);
  assert.equal(h.nodes.orreryAnimate.checked, false);
  assert.equal(h.frames.size, 0, "a rejected frame must not keep rescheduling animation");
  assert.ok(h.draws > drawsBefore, "the retained epoch is still painted");
  assert.match(h.state.engineError, /epoch.*outside.*retained/i);
  assert.match(h.nodes.orreryAccuracy.textContent, /choose.*time|Now/i);
  assert.equal(h.nodes.orreryRetry.hidden, false);
  assert.equal(h.state.presentation.availability, "last_valid");
  assert.ok(h.presentations.every(p => p.availability !== "unavailable"));
  const boundaryError = h.state.engineError;
  h.completeSnapshot(1);
  await h.settle();
  assert.equal(h.state.engineError, boundaryError, "a delayed pre-stop reply must not erase the boundary notice");
  assert.equal(h.state.bodies, validBodies);
  assert.equal(h.frames.size, 0);

  h.holdSnapshots(false);
  h.setWallUnix(1800000000);
  h.now();
  await h.settle();
  assert.equal(h.state.renderUnix, 1800000000);
  assert.equal(h.state.simElapsed, 0);
  assert.equal(h.state.engineError, "");
  assert.equal(h.nodes.orreryRetry.hidden, true);
  assert.equal(h.state.animate, false, "choosing a valid time preserves the user's paused state");
  assert.equal(h.frames.size, 0);
  h.state.yearsPerSec = 1 / (24 * 365.25);
  h.setAnimate(true);
  assert.equal(h.frames.size, 1);
  h.frame(1100);
  assert.equal(h.state.renderUnix, 1800000057.6);
  assert.equal(h.frames.size, 1, "explicit resume starts only one loop");
  h.leaveOrrery();
});

for (const epoch of ["-009999-01-01T00:00:00Z", "9999-12-31T23:59:59Z"])
  test(`paused System entry at ${epoch} preserves its valid epoch`, async t => {
    const h = await harness(t), unix = Date.parse(epoch) / 1000;
    h.setWallUnix(unix);
    h.setAnimate(false);
    await h.enterOrrery();
    const positionsBefore = h.positionEpochs.length;
    h.frame(1000);
    assert.equal(h.state.renderUnix, unix);
    assert.equal(h.state.simElapsed, 0);
    assert.equal(h.state.simStepSeconds, 0);
    assert.equal(h.state.engineError, "");
    assert.equal(h.state.animate, false);
    assert.equal(h.positionEpochs.length, positionsBefore);
    assert.equal(h.frames.size, 0);
    h.leaveOrrery();
  });

for (const settlesBeforeShow of [false, true]) for (const animate of [true, false])
  test(`first System entry resumes ${settlesBeforeShow ? "after" : "before"} cancellation settles (${animate ? "animated" : "paused"})`, async t => {
    const h = await harness(t);
    h.setAnimate(animate);
    h.holdSnapshots();
    const obsolete = h.enterOrrery();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.bodies.length, 0);
    h.setHidden(true);
    if (settlesBeforeShow) await obsolete;
    h.setHidden(false);
    const current = h.enterOrrery();
    assert.equal(h.requests.length, 2, "visible recovery must request a fresh generation");
    h.completeSnapshot(0); // A terminated worker may still have an already queued event.
    await obsolete;
    await h.settle();
    assert.equal(h.state.entering, true, "obsolete completion must not release the current entry");
    assert.equal(h.state.bodies.length, 0);
    assert.equal(h.frames.size, 0);
    assert.equal(h.contexts, 0);
    assert.equal(h.enterOrrery(), current, "only current-generation entry calls coalesce");
    assert.equal(h.requests.length, 2);
    h.completeSnapshot(1);
    await current;
    assert.equal(h.state.entering, false);
    assert.equal(h.state.bodies.length, 9);
    assert.equal(h.state.engineError, "");
    assert.equal(h.nodes.orreryCanvas.style.display, "");
    assert.equal(h.nodes.orreryRetry.hidden, true);
    assert.ok(h.draws > 0);
    assert.equal(h.contexts, 1);
    assert.equal(h.frames.size, 1);
    h.setHidden(false);
    assert.equal(h.frames.size, 1, "repeated visible events cannot duplicate the loop");
    const unix = h.state.renderUnix;
    h.frame(1000);
    assert.equal(h.state.renderUnix, animate ? unix + 57.6 : unix);
    assert.equal(h.frames.size, animate ? 1 : 0);
    assert.deepEqual(h.errors, [], "cancelled entry is not a current initialization failure");
    h.leaveOrrery();
  });

test("late engine loading from a cancelled entry cannot clear or publish over its replacement", async t => {
  const h = await harness(t), releaseEngine = h.holdEngine();
  const obsolete = h.enterOrrery();
  await h.settle(); // First worker reply is ready, but shared WASM loading is still pending.
  h.setHidden(true);
  h.holdSnapshots();
  h.setWallUnix(1800000100);
  h.setHidden(false);
  const current = h.enterOrrery();
  assert.equal(h.requests.length, 2);
  releaseEngine();
  await obsolete;
  await h.settle();
  assert.equal(h.state.entering, true);
  assert.equal(h.state.bodies.length, 0, "cancelled entry's successful data must not publish");
  assert.equal(h.frames.size, 0);
  assert.equal(h.enterOrrery(), current);
  h.completeSnapshot(1);
  await current;
  assert.equal(h.state.renderUnix, 1800000100);
  assert.equal(h.state.metadataUnix, 1800000100);
  assert.equal(h.state.bodies.length, 9);
  assert.equal(h.state.entering, false);
  assert.equal(h.state.engineError, "");
  assert.equal(h.contexts, 1);
  assert.equal(h.frames.size, 1);
  h.leaveOrrery();
});
