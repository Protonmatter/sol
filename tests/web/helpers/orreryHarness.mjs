import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadSourceModules } from "./sourceModuleHarness.mjs";
import { createPanelDocument } from "./panelDomHost.mjs";
import { SYSTEM_ORDER, assertSystemSnapshot, validateSystemRequest } from "../../../apps/web/js/systemContract.js";
import { LatestWorkerClient } from "../../../apps/web/js/workerClient.js";

const moduleUrl = new URL("../../../apps/web/js/orrery.js", import.meta.url);
const source = fs.readFileSync(moduleUrl, "utf8");

// Execute the whole production module, including attach(), entry, fallback, Retry,
// metadata refresh, paint and the frame loop. Only browser/GPU and engine I/O are
// doubled; no lifecycle or rendering function is replaced with a test implementation.
export async function orreryHarness(t, options = {}) {
  const frames = new Map(), requests = [], errors = [], warnings = [], positionEpochs = [], presentations = [];
  const images = [], textureUploads = [], drawCalls = [], optionalLoads = [], canvasCommands = [];
  const idleTasks = new Map(); let idleId = 0;
  const documentHandlers = new Map(), snapshotReplies = new Map();
  let frameId = 0, draws = 0, contexts = 0, workerFailure = false, monotonicNow = 100;
  let wallUnix = 1800000000, snapshotsHeld = false, engineLoad = Promise.resolve();
  let graphicsFailure = options.graphicsFailure || "", resizeCallback;
  let optionalMode = options.catalogues || "pending";
  const gl = new Proxy({
    isContextLost: () => false,
    getExtension: () => options.renderer ? { UNMASKED_RENDERER_WEBGL: 1 } : null,
    getParameter: () => options.renderer,
    getShaderParameter: () => graphicsFailure !== "shader",
    getProgramParameter: () => graphicsFailure !== "link",
    getShaderInfoLog: () => "test GPU shader compile failure",
    getProgramInfoLog: () => "test GPU program link failure",
    getAttribLocation: () => 0,
    drawElements: (...args) => { draws++; drawCalls.push(["elements", ...args]); },
    drawArrays: (...args) => { draws++; drawCalls.push(["arrays", ...args]); },
    texImage2D: (...args) => { textureUploads.push(args); },
  }, { get(target, name) {
    if (name in target) return target[name];
    if (/^[A-Z_0-9]+$/.test(name)) return 1;
    return () => ({});
  } });
  const panel = createPanelDocument(), document = panel.document;
  const createElement = document.createElement;
  document.createElement = tag => {
    const element = createElement(tag);
    // Extend the shared text DOM boundary only for the selectors/APIs used here.
    const queryAll = element.querySelectorAll.bind(element);
    element.querySelectorAll = selector => {
      if (selector === ".system-detail > strong") return queryAll(".system-detail").flatMap(card => card.children.filter(child => child.tagName === "STRONG"));
      const data = /^(button)?\[data-(dps|metric)\]$/.exec(selector);
      if (data) return queryAll("*").filter(child => (!data[1] || child.tagName === "BUTTON") && Object.hasOwn(child.dataset, data[2]));
      return queryAll(selector);
    };
    const getAttribute = element.getAttribute.bind(element);
    element.getAttribute = name => name.startsWith("data-") ? element.dataset[name.slice(5)] ?? null : getAttribute(name);
    element.toggleAttribute = (name, force) => { if (force) element.setAttribute(name, ""); else element.removeAttribute(name); element[name] = !!force; };
    element.closest = selector => {
      assert.equal(selector, "button[data-dps]");
      for (let current = element; current; current = current.parentElement) if (current.tagName === "BUTTON" && Object.hasOwn(current.dataset, "dps")) return current;
      return null;
    };
    const append = element.append.bind(element);
    element.append = (...children) => append(...children.map(child => typeof child === "string" ? document.createTextNode(child) : child));
    element.offsetWidth = 70; element.offsetHeight = 16;
    if (tag === "canvas") {
      const context2d = {};
      // Command-recording canvas boundary, not a rasterizer. Pixel/visual correctness
      // remains the responsibility of the browser suite; tests here assert the
      // real generator's work ordering, yielding and upload/cancellation contract.
      for (const method of ["fillRect", "moveTo", "lineTo", "closePath", "beginPath", "fill", "putImageData", "save", "ellipse", "clip", "restore", "drawImage"]) {
        context2d[method] = (...args) => canvasCommands.push({ canvas: element, method, args });
      }
      for (const method of ["createLinearGradient", "createRadialGradient"]) context2d[method] = (...args) => {
        canvasCommands.push({ canvas: element, method, args }); return { addColorStop() {} };
      };
      context2d.getImageData = (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) });
      element.getContext = type => { assert.equal(type, "2d"); return context2d; };
    }
    return element;
  };
  function node(extra = {}, tag = "div") {
    const element = document.createElement(tag), addListener = element.addEventListener.bind(element);
    element.handlers = new Map();
    element.addEventListener = (event, fn) => { element.handlers.set(event, fn); addListener(event, fn); };
    return Object.assign(element, extra);
  }
  const nodes = {
    orreryCanvas: node({ clientWidth: 800, clientHeight: 600, width: 800, height: 600,
      offsetLeft: 0, offsetTop: 0, rect: { left: 0, top: 0, width: 800, height: 600 },
      setPointerCapture() {}, releasePointerCapture() {},
      getContext(type) { assert.equal(type, "webgl2"); contexts++; return graphicsFailure === "unavailable" ? null : gl; } }),
    orreryRetry: node({ hidden: true }), orreryAccuracy: node(), orreryInsight: node(),
    orreryAnimate: node({ checked: true }), orreryNow: node(),
  };
  if (options.controls) {
    for (const id of ["Backend", "MetadataEpoch", "ScaleStatus", "SelectedEpoch", "SelectionStatus", "Detail", "Labels", "Positions", "Search", "ObjectGroup", "FocusSelected", "Time", "Size", "TrueScale", "Speed", "SpeedLabel", "SpeedExtras", "SpeedEntry", "SpeedUnit", "SpeedPresets", "ShowOrbits", "ShowSky", "ShowConst", "ShowLabels", "ShowSunEq", "ShowSmall", "ShowMoons", "DeepSky", "Textures", "TopDown", "Anchor", "FreeFly", "Galaxy", "Local"]) {
      nodes[`orrery${id}`] = node();
    }
    nodes.orrerySpeedUnit.value = "1";
    for (const dps of ["0.041666666666666664", "1", "30", "365.25"]) {
      const button = node({}, "button"); button.dataset.dps = dps; nodes.orrerySpeedPresets.appendChild(button);
    }
  }
  document.hidden = false;
  document.getElementById = id => nodes[id] ?? null;
  document.addEventListener = (event, fn) => documentHandlers.set(event, fn);
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
  const bindings = {}, namespaces = new Map();
  for (const [, names, path] of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+"([^"]+)";/gm)) {
    const namespace = /\/(skyEngine|systemWorkerClient)\.js\?/.test(path)
      ? boundary : await import(new URL(path, moduleUrl));
    namespaces.set(path, namespace);
    if (namespace.MOONS) {
      const original = namespace.MOONS.map(moon => [moon, Object.getOwnPropertyDescriptors(moon)]);
      // The real optional loader enriches shared moon identity objects. Undo that
      // enrichment after each test so a pending/failed transfer never inherits
      // an earlier test's ready orbital-element state.
      t.after(() => { for (const [moon, descriptors] of original) {
        for (const key of Object.keys(moon)) if (!Object.hasOwn(descriptors, key)) delete moon[key];
        Object.defineProperties(moon, descriptors);
      } });
    }
    if (names.startsWith("* as ")) bindings[names.slice(5).trim()] = namespace;
    else for (const name of names.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean)) {
      bindings[name] = namespace[name];
    }
  }
  const context = vm.createContext({ ...bindings, Event,
    Date: class extends Date { static now() { return wallUnix * 1000; } },
    console: { error: (...args) => errors.push(args), warn: (...args) => warnings.push(args) },
    document,
    window: { devicePixelRatio: options.dpr || 1, addEventListener() {},
      dispatchEvent() { presentations.push(bindings.store.orrery.presentation); },
      matchMedia: () => ({ matches: false }) },
    performance: { now: () => monotonicNow },
    requestAnimationFrame(fn) { const id = ++frameId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    Image: class { constructor() { images.push(this); } },
    fetch: async () => options.sunMetadata === undefined ? { ok: false } : { ok: true, json: async () => options.sunMetadata },
    ...(options.reducedMotion === undefined ? {} : { matchMedia: () => ({ matches: options.reducedMotion }) }),
    ...(options.controls ? { ResizeObserver: class { constructor(callback) { resizeCallback = callback; } observe() {} } } : {}),
    ...(options.geography ? { [options.idleScheduler === "timeout" ? "setTimeout" : "requestIdleCallback"]: callback => { const id = ++idleId; idleTasks.set(id, callback); return id; } } : {}),
  });
  // Real imported DOM presenters execute in Node's realm, not the VM's realm.
  for (const name of ["document", "window"]) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value: context[name], configurable: true });
    t.after(() => prior ? Object.defineProperty(globalThis, name, prior) : delete globalThis[name]);
  }
  const [lifecycle] = await loadSourceModules(context, [moduleUrl], {
    resolveImport: specifier => namespaces.get(specifier),
    // Optional catalogue downloads remain pending, as they can during first paint.
    importModuleDynamically: specifier => {
      const mode = specifier.includes("geography") ? options.geography || "pending" : optionalMode;
      if (mode === "pending") return new Promise(() => {});
      const promise = mode === "failed" ? Promise.reject(new Error("test catalogue transfer failed")) : import(new URL(specifier, moduleUrl));
      optionalLoads.push(promise);
      return promise;
    },
  });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { nodes, frames, requests, errors, warnings, images, textureUploads, drawCalls, canvasCommands, idleTasks, positionEpochs, presentations, state: bindings.store.orrery,
    ...lifecycle, settle,
    event(id, type, properties = {}) { return nodes[id].dispatch(type, { currentTarget: nodes[id], ...properties }); },
    input(id, value, type = "input") { nodes[id].value = value; return this.event(id, type); },
    check(id, checked) { nodes[id].checked = checked; return this.event(id, "change"); },
    resize(width, height, dpr = context.window.devicePixelRatio) { Object.assign(nodes.orreryCanvas, { clientWidth: width, clientHeight: height }); context.window.devicePixelRatio = dpr; resizeCallback(); },
    async settleCatalogues() { await Promise.allSettled(optionalLoads); await settle(); },
    async flushIdleTasks() {
      for (let i = 0; idleTasks.size; i++) {
        assert.ok(i < 100, "bounded idle queue did not settle");
        const [id, callback] = idleTasks.entries().next().value; idleTasks.delete(id); callback(); await settle();
      }
    },
    get idleScheduled() { return idleId; },
    setCatalogueMode(value) { optionalMode = value; },
    setGraphicsFailure(value) { graphicsFailure = value; },
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
