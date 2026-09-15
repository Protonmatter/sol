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
  const events = [];
  const frames = new Map(), requests = [], errors = [], warnings = [], positionEpochs = [], presentations = [];
  const images = [], textureUploads = [], bufferUploads = [], drawCalls = [], optionalLoads = [], canvasCommands = [];
  const textureRecords = [], textureParameters = [], mipmapTextures = [], deletedTextures = [], gpuDraws = [], gpuSubmissions=[];
  let depthWrites=true,blend=[];
  const pixelStoreCalls = [], pixelStore = new Map();
  const textureBindings = new Map(); let activeTextureUnit = 0, textureId = 0, pendingTextureError = 0;
  const samplerBindings=new Map(),enabledCapabilities=new Set([3024]);
  let drawFramebuffer=null,readFramebuffer=null,vertexArray=null,viewport=[0,0,800,600],colorMask=[true,true,true,true],framebufferId=0;
  let textureUploadError = options.textureUploadError || 0;
  const uniformDraws = [], uniforms = new Map(); let currentProgram;
  const recordUniform = (location, value) => {
    assert.equal(location.program,currentProgram,'Uniform map must belong to the active program');
    if (!uniforms.has(location.program)) uniforms.set(location.program, {});
    uniforms.get(location.program)[location.name] = typeof value === "number" ? value : Array.from(value);
  };
  const idleTasks = new Map(); let idleId = 0;
  const documentHandlers = new Map(), snapshotReplies = new Map();
  let frameId = 0, draws = 0, contexts = 0, workerFailure = false, monotonicNow = 100;
  let wallUnix = 1800000000, snapshotsHeld = false, engineLoad = Promise.resolve();
  let graphicsFailure = options.graphicsFailure || "", resizeCallback;
  const shaderQueries=[],programs=[],deletedPrograms=[],deletedShaders=[],completedPrograms=new Set();
  const parallelComplete=program=>completedPrograms.has(program);
  let optionalMode = options.catalogues || "pending";
  // Distinct WebGL enum values make sampler-unit and scientific-filter regressions
  // observable; a generic constant value would make LINEAR and NEAREST identical.
  const graphicsConstants = {
    NO_ERROR: 0, INVALID_VALUE: 1281, OUT_OF_MEMORY: 1285, MAX_TEXTURE_SIZE: 3379,
    TEXTURE_2D: 3553, TEXTURE0: 33984, TEXTURE1: 33985,
    TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243,
    NEAREST: 9728, LINEAR: 9729, LINEAR_MIPMAP_LINEAR: 9987,
    REPEAT: 10497, CLAMP_TO_EDGE: 33071,
    UNPACK_FLIP_Y_WEBGL: 37440, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
    ZERO:0,ONE:1,SRC_ALPHA:770,ONE_MINUS_SRC_ALPHA:771,TRIANGLES:4,LINES:1,LINE_STRIP:3,POINTS:0,
    COMPILE_STATUS:35713,LINK_STATUS:35714,VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,
    MAX_TEXTURE_IMAGE_UNITS:34930,MAX_COMBINED_TEXTURE_IMAGE_UNITS:35661,ACTIVE_TEXTURE:34016,
    TEXTURE_BINDING_2D:32873,SAMPLER_BINDING:35097,CURRENT_PROGRAM:35725,VERTEX_ARRAY_BINDING:34229,
    FRAMEBUFFER:36160,DRAW_FRAMEBUFFER:36009,READ_FRAMEBUFFER:36008,DRAW_FRAMEBUFFER_BINDING:36006,READ_FRAMEBUFFER_BINDING:36010,
    FRAMEBUFFER_COMPLETE:36053,COLOR_ATTACHMENT0:36064,VIEWPORT:2978,COLOR_WRITEMASK:3107,DEPTH_WRITEMASK:2930,
    BLEND:3042,DEPTH_TEST:2929,CULL_FACE:2884,SCISSOR_TEST:3089,STENCIL_TEST:2960,RASTERIZER_DISCARD:35977,
    SAMPLE_COVERAGE:32928,SAMPLE_ALPHA_TO_COVERAGE:32926,DITHER:3024,RGBA32F:34836,
  };
  const gl = new Proxy({
    ...graphicsConstants,
    isContextLost: () => false,
    getExtension: name => name==='KHR_parallel_shader_compile' ? options.parallelPrograms ? {COMPLETION_STATUS_KHR:37297} : null
      : name==='EXT_color_buffer_float'&&options.floatTargets!==false ? {}
      : name==='WEBGL_debug_renderer_info'&&options.renderer ? { UNMASKED_RENDERER_WEBGL: 37446 } : null,
    getParameter: name => {
      const values=new Map([[3379,options.maxTextureSize??16384],[34930,16],[35661,32],[34016,graphicsConstants.TEXTURE0+activeTextureUnit],
        [32873,textureBindings.get(activeTextureUnit)??null],[35097,samplerBindings.get(activeTextureUnit)??null],
        [35725,currentProgram??null],[34229,vertexArray],[36006,drawFramebuffer],[36010,readFramebuffer],
        [2978,[...viewport]],[3107,[...colorMask]],[2930,depthWrites]]);
      return values.has(name)?values.get(name):options.renderer;
    },
    enable:capability=>enabledCapabilities.add(capability),disable:capability=>enabledCapabilities.delete(capability),
    isEnabled:capability=>enabledCapabilities.has(capability),
    viewport:(...value)=>{viewport=value;},colorMask:(...value)=>{colorMask=value;},
    createFramebuffer:()=>({framebufferId:++framebufferId}),
    bindFramebuffer:(target,value)=>{if(target!==36008)drawFramebuffer=value;if(target!==36009)readFramebuffer=value;},
    bindVertexArray:value=>{vertexArray=value;},bindSampler:(unit,value)=>samplerBindings.set(unit,value),
    checkFramebufferStatus:()=>options.scatteringFramebufferFailure?0:36053,
    getError: () => { const error = pendingTextureError; pendingTextureError = 0; return error; },
    getShaderParameter: (shader,parameter) => {
      shaderQueries.push({method:'getShaderParameter',shader,parameter});
      assert.ok(!options.parallelPrograms||parallelComplete(shader.program),'COMPILE_STATUS queried before KHR completion');
      return graphicsFailure !== "shader";
    },
    getProgramParameter: (program,parameter) => {
      shaderQueries.push({method:'getProgramParameter',program,parameter});
      if(parameter===37297)return parallelComplete(program);
      assert.ok(!options.parallelPrograms||parallelComplete(program),'LINK_STATUS queried before KHR completion');
      return graphicsFailure !== "link";
    },
    getShaderInfoLog: () => "test GPU shader compile failure",
    getProgramInfoLog: () => "test GPU program link failure",
    getAttribLocation: () => 0,
    shaderSource: (shader,source) => { shader.source=source; },
    createProgram:()=>{const program={sources:[]};programs.push(program);return program;},
    deleteProgram:program=>deletedPrograms.push(program),
    deleteShader:shader=>deletedShaders.push(shader),
    attachShader: (program,shader) => { (program.sources??=[]).push(shader.source);shader.program=program; },
    getUniformLocation: (program, name) => {
      shaderQueries.push({method:'getUniformLocation',program,name});
      assert.ok(!options.parallelPrograms||parallelComplete(program),'Uniform queried before KHR completion');
      return { program, name };
    },
    useProgram: program => { currentProgram = program; },
    uniform1i: recordUniform,
    uniform1f: recordUniform,
    uniform1fv: recordUniform,
    uniform2fv: recordUniform,
    uniform2iv: recordUniform,
    uniform3fv: recordUniform,
    uniform3iv: recordUniform,
    uniform4fv: recordUniform,
    uniformMatrix3fv: (location, _transpose, value) => recordUniform(location, value),
    uniformMatrix4fv: (location, _transpose, value) => recordUniform(location, value),
    depthMask: value=>{depthWrites=value;},
    blendFunc:(...values)=>{blend=values;},
    drawElements: (...args) => {
      draws++; drawCalls.push(["elements", ...args]);
      const drawUniforms = { ...uniforms.get(currentProgram) };
      uniformDraws.push(drawUniforms);
      gpuDraws.push({ program: currentProgram, uniforms: drawUniforms, textures: new Map(textureBindings) });
      gpuSubmissions.push({kind:'elements',uniforms:drawUniforms,depthWrites,blend:[...blend],framebuffer:drawFramebuffer,
        viewport:[...viewport],vertexArray,textures:new Map(textureBindings),enabled:new Set(enabledCapabilities)});
    },
    drawArrays: (...args) => { draws++; drawCalls.push(["arrays", ...args]);gpuSubmissions.push({kind:'arrays',uniforms:{...uniforms.get(currentProgram)},
      depthWrites,blend:[...blend],framebuffer:drawFramebuffer,viewport:[...viewport],vertexArray,textures:new Map(textureBindings),enabled:new Set(enabledCapabilities)}); },
    createTexture: () => ({ textureId: ++textureId }),
    activeTexture: unit => { activeTextureUnit = unit - graphicsConstants.TEXTURE0; },
    bindTexture: (_target, texture) => { textureBindings.set(activeTextureUnit, texture); },
    pixelStorei: (name, value) => { pixelStore.set(name, value); pixelStoreCalls.push({ name, value }); },
    texImage2D: (...args) => {
      textureUploads.push(args);
      const pixels = args.at(-1);
      textureRecords.push({ texture: textureBindings.get(activeTextureUnit), pixels, args, pixelStore: new Map(pixelStore) });
      pendingTextureError = typeof textureUploadError === "function" ? textureUploadError(pixels) : textureUploadError;
    },
    bufferData: (...args) => { bufferUploads.push(args); },
    texParameteri: (_target, name, value) => { textureParameters.push({ texture: textureBindings.get(activeTextureUnit), name, value }); },
    generateMipmap: () => { mipmapTextures.push(textureBindings.get(activeTextureUnit)); },
    deleteTexture: texture => { deletedTextures.push(texture); },
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
    element.replaceChildren = (...children) => { element.textContent='';element.append(...children); };
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
      element.getContext = type => { assert.equal(type, "2d"); return options.canvas2dUnavailable ? null : context2d; };
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
    for(const id of ['InspectSun','PhysicalStatus','SolarControls','SolarMode','SolarPlay','SolarRestart','SolarTime','SolarEpoch','Terrain','Optics'])nodes[`orrery${id}`]=node();
    if(options.phenomenonImage)nodes.orreryPlanetPhenomena=node();
    for (const id of ["Backend", "MetadataEpoch", "ScaleStatus", "SelectedEpoch", "SelectionStatus", "Detail", "Labels", "Positions", "Search", "ObjectGroup", "FocusSelected", "Time", "Size", "TrueScale", "Speed", "SpeedLabel", "SpeedExtras", "SpeedEntry", "SpeedUnit", "SpeedPresets", "ShowOrbits", "ShowSky", "ShowConst", "ShowLabels", "ShowSunEq", "ShowSmall", "ShowMoons", "DeepSky", "Textures", "EarthNight", "EarthWeather", "EarthIce", "EarthLayerStatus", "IceLegend", "IceLegendCaption", "TopDown", "Anchor", "FreeFly", "Galaxy", "Local"]) {
      nodes[`orrery${id}`] = node();
    }
    for (const id of ["Textures", "EarthNight", "EarthWeather"]) nodes[`orrery${id}`].checked = true;
    nodes.orreryEarthIce.checked = false;
    nodes.orreryVenusRadar = node({ checked: false });
    nodes.orreryEarthCloudSource = node({ value: "composite" }, "select");
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
      if(options.systemPositions)return options.systemPositions(unix);
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
  const context = vm.createContext({ ...bindings, Event, CustomEvent,
    AbortController,queueMicrotask:options.queueMicrotask||queueMicrotask,
    Date: class extends Date { static now() { return wallUnix * 1000; } },
    console: { error: (...args) => errors.push(args), warn: (...args) => warnings.push(args) },
    document,
    window: { devicePixelRatio: options.dpr || 1, addEventListener() {},
      dispatchEvent(event) { events.push(event); presentations.push(bindings.store.orrery.presentation); },
      matchMedia: () => ({ matches: false }) },
    performance: { now: () => monotonicNow },
    requestAnimationFrame(fn) { const id = ++frameId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    Image: class { constructor() { this.width = 0; this.height = 0; images.push(this); } },
    ...(options.terrainMesh ? {Worker:class {}} : {}),
    ...(options.solarAtlas ? {createImageBitmap:()=>{throw Error('The solar loader boundary owns this test decode');}} : {}),
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
  const incidentBoundary={...await import('../../../apps/web/js/atmosphereIncident.js'),
    loadIncidentField:options.incidentField||(async()=>{throw Error('Incident field unavailable at the test I/O boundary');})};
  const columnModule=await import('../../../apps/web/js/atmosphereColumnField.js');
  const columnBoundary={...columnModule,loadAtmosphereFields:(body,{signal})=>columnModule.loadAtmosphereFields(body,{signal,
    incidentLoader:incidentBoundary.loadIncidentField,
    columnLoader:options.atmosphereColumns||(async()=>({values:new Float32Array([8,1.2]),width:1,height:1}))})};
  const phenomenaModule=await import('../../../apps/web/js/planetPhenomena.js');
  const phenomenaBoundary={...phenomenaModule,renderPlanetPhenomena:(container,body)=>
    phenomenaModule.renderPlanetPhenomena(container,body,{loadImage:options.phenomenonImage})};
  const [lifecycle] = await loadSourceModules(context, [moduleUrl], {
    resolveImport: (specifier,url) => options.solarAtlas && url.pathname.endsWith('/solarAssetLoader.js')
      ? {loadSolarAtlas:typeof options.solarAtlas==='function'?options.solarAtlas:async()=>({width:2048,height:1024,close(){}})}
      : options.terrainMesh && url.pathname.endsWith('/terrainWorkerClient.js')
        ? {requestTerrainMesh:options.terrainMesh}
        : options.phenomenonImage && url.pathname.endsWith('/planetPhenomena.js')?phenomenaBoundary
        : url.pathname.endsWith('/atmosphereIncident.js')?incidentBoundary
          :url.pathname.endsWith('/atmosphereColumnField.js')?columnBoundary:namespaces.get(specifier),
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
  return { events, nodes, frames, requests, errors, warnings, images, textureUploads, bufferUploads, textureRecords, textureParameters, pixelStoreCalls, mipmapTextures, deletedTextures, gpuDraws, gpuSubmissions, gl, drawCalls, uniformDraws, canvasCommands, idleTasks, positionEpochs, presentations,shaderQueries,programs,deletedPrograms,deletedShaders,
    completePrograms: (predicate=()=>true)=>{for(const program of programs)if(predicate(program))completedPrograms.add(program);},
    state: bindings.store.orrery, moons: bindings.moonCatalogue.MOONS,
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
    setTextureUploadError(value) { textureUploadError = value; },
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
