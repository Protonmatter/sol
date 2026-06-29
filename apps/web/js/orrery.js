// "3-D View": a WebGPU solar-system orrery. Dependency-free (browser WebGPU API, no wgpu),
// reusing the same VSOP2013 system_snapshot as the 2-D orbit view. Planets and the Sun are
// camera-facing billboards in real heliocentric 3-D space; orbits are their true ellipses.

import { loadSkyEngine, systemSnapshot } from "./skyEngine.js?v=22";

const COLORS = {
  Sun: [1.0, 0.82, 0.29],
  Mercury: [0.70, 0.64, 0.53], Venus: [0.96, 0.94, 0.81], Earth: [0.36, 0.61, 1.0],
  Mars: [1.0, 0.42, 0.30], Jupiter: [0.88, 0.78, 0.61], Saturn: [0.94, 0.85, 0.54],
  Uranus: [0.66, 0.88, 0.90], Neptune: [0.49, 0.65, 1.0]
};
// Visual (not physical) billboard radii in AU, so everything is visible.
const BODY_RADIUS = {
  Sun: 0.5, Mercury: 0.10, Venus: 0.14, Earth: 0.15, Mars: 0.12,
  Jupiter: 0.30, Saturn: 0.26, Uranus: 0.20, Neptune: 0.20
};

const state = { az: 0.7, el: 0.5, radius: 12, offsetYears: 0, active: false };
const gpu = { ready: false, device: null, ctx: null, format: null };

// ---- minimal column-major mat4 helpers ----
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye, center, up) {
  const z = norm(sub(eye, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const ORBIT_WGSL = `
struct Cam { vp: mat4x4<f32>, right: vec4<f32>, up: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
struct VO { @builtin(position) pos: vec4<f32>, @location(0) col: vec3<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) c: vec3<f32>) -> VO {
  var o: VO; o.pos = cam.vp * vec4<f32>(p, 1.0); o.col = c; return o;
}
@fragment fn fs(@location(0) c: vec3<f32>) -> @location(0) vec4<f32> { return vec4<f32>(c, 0.5); }
`;

const BODY_WGSL = `
struct Cam { vp: mat4x4<f32>, right: vec4<f32>, up: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
struct VO { @builtin(position) pos: vec4<f32>, @location(0) corner: vec2<f32>, @location(1) col: vec3<f32> };
@vertex fn vs(@location(0) corner: vec2<f32>, @location(1) center: vec3<f32>,
              @location(2) radius: f32, @location(3) col: vec3<f32>) -> VO {
  let world = center + (cam.right.xyz * corner.x + cam.up.xyz * corner.y) * radius;
  var o: VO; o.pos = cam.vp * vec4<f32>(world, 1.0); o.corner = corner; o.col = col; return o;
}
@fragment fn fs(@location(0) corner: vec2<f32>, @location(1) col: vec3<f32>) -> @location(0) vec4<f32> {
  let d = length(corner);
  if (d > 1.0) { discard; }
  let glow = smoothstep(1.0, 0.55, d);
  return vec4<f32>(col, glow);
}
`;

const ORDER = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

function ellipse3d(b) {
  const a = b.a_au, e = b.ecc;
  const inc = (b.inc_deg * Math.PI) / 180, node = (b.node_deg * Math.PI) / 180, argp = (b.argp_deg * Math.PI) / 180;
  const co = Math.cos(argp), so = Math.sin(argp), cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc), bm = a * Math.sqrt(1 - e * e);
  const pts = [];
  const n = 192;
  for (let k = 0; k <= n; k++) {
    const ea = (k / n) * 2 * Math.PI;
    const xp = a * (Math.cos(ea) - e), yp = bm * Math.sin(ea);
    pts.push([
      (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
      (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
      (so * si) * xp + (co * si) * yp
    ]);
  }
  return pts;
}

let buffers = null;
function buildGeometry(snap) {
  const device = gpu.device;
  // Orbit vertices: [x,y,z, r,g,b]; one line-strip per planet, recorded as draw ranges.
  const orbitVerts = [];
  const ranges = [];
  for (const name of ORDER) {
    const b = (snap.bodies || []).find((x) => x.name === name);
    if (!b || b.a_au == null) continue;
    const col = COLORS[name];
    const pts = ellipse3d(b);
    ranges.push({ first: orbitVerts.length / 6, count: pts.length });
    for (const p of pts) orbitVerts.push(p[0], p[1], p[2], col[0] * 0.7, col[1] * 0.7, col[2] * 0.7);
  }
  const orbitArr = new Float32Array(orbitVerts);
  // Body instances: [cx,cy,cz, radius, r,g,b, pad].
  const inst = [];
  inst.push(0, 0, 0, BODY_RADIUS.Sun, ...COLORS.Sun, 0);
  for (const b of snap.bodies || []) {
    const col = COLORS[b.name] || [1, 1, 1];
    inst.push(b.x_au, b.y_au, b.z_au, BODY_RADIUS[b.name] || 0.12, col[0], col[1], col[2], 0);
  }
  const instArr = new Float32Array(inst);

  if (buffers) { buffers.orbit.destroy(); buffers.inst.destroy(); }
  const orbit = device.createBuffer({ size: orbitArr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(orbit, 0, orbitArr);
  const instBuf = device.createBuffer({ size: instArr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(instBuf, 0, instArr);
  buffers = { orbit, ranges, inst: instBuf, instCount: instArr.length / 8 };
}

let pipelines = null;
let quadBuf = null;
let uniformBuf = null;
let bindGroup = null;
let depthTex = null;

async function init(canvas) {
  if (gpu.ready) return true;
  if (!navigator.gpu) return false;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return false;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });
  gpu.device = device;
  gpu.ctx = ctx;
  gpu.format = format;

  uniformBuf = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bgl = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }]
  });
  bindGroup = device.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: uniformBuf } }] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const blend = {
    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
  };
  const depthStencil = { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" };

  const orbitMod = device.createShaderModule({ code: ORBIT_WGSL });
  const orbitPipeline = device.createRenderPipeline({
    layout,
    vertex: {
      module: orbitMod, entryPoint: "vs",
      buffers: [{ arrayStride: 24, attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 12, format: "float32x3" }
      ] }]
    },
    fragment: { module: orbitMod, entryPoint: "fs", targets: [{ format, blend }] },
    primitive: { topology: "line-strip" },
    depthStencil
  });

  const bodyMod = device.createShaderModule({ code: BODY_WGSL });
  const bodyPipeline = device.createRenderPipeline({
    layout,
    vertex: {
      module: bodyMod, entryPoint: "vs",
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
        { arrayStride: 32, stepMode: "instance", attributes: [
          { shaderLocation: 1, offset: 0, format: "float32x3" },
          { shaderLocation: 2, offset: 12, format: "float32" },
          { shaderLocation: 3, offset: 16, format: "float32x3" }
        ] }
      ]
    },
    fragment: { module: bodyMod, entryPoint: "fs", targets: [{ format, blend }] },
    primitive: { topology: "triangle-list" },
    depthStencil
  });
  pipelines = { orbit: orbitPipeline, body: bodyPipeline };

  const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
  quadBuf = device.createBuffer({ size: quad.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(quadBuf, 0, quad);

  gpu.ready = true;
  return true;
}

function ensureSized(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h || !depthTex) {
    canvas.width = w;
    canvas.height = h;
    if (depthTex) depthTex.destroy();
    depthTex = gpu.device.createTexture({ size: [w, h], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }
  return [w, h];
}

function currentUnix() {
  return Date.now() / 1000 + state.offsetYears * 365.25 * 86400;
}

function drawFrame() {
  if (!state.active || !gpu.ready || !buffers) return;
  const canvas = document.getElementById("orreryCanvas");
  if (!canvas || canvas.clientWidth === 0) return;
  const [w, h] = ensureSized(canvas);
  const device = gpu.device;

  // Camera.
  const eye = [
    state.radius * Math.cos(state.el) * Math.cos(state.az),
    state.radius * Math.cos(state.el) * Math.sin(state.az),
    state.radius * Math.sin(state.el)
  ];
  const view = lookAt(eye, [0, 0, 0], [0, 0, 1]);
  const proj = perspective((45 * Math.PI) / 180, w / h, 0.05, 400);
  const vp = mul(proj, view);
  const fwd = norm(sub([0, 0, 0], eye));
  const right = norm(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  const uni = new Float32Array(24);
  uni.set(vp, 0);
  uni.set([right[0], right[1], right[2], 0], 16);
  uni.set([up[0], up[1], up[2], 0], 20);
  device.queue.writeBuffer(uniformBuf, 0, uni);

  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: gpu.ctx.getCurrentTexture().createView(),
      clearValue: { r: 0.015, g: 0.02, b: 0.05, a: 1 }, loadOp: "clear", storeOp: "store"
    }],
    depthStencilAttachment: { view: depthTex.createView(), depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" }
  });
  pass.setBindGroup(0, bindGroup);
  pass.setPipeline(pipelines.orbit);
  pass.setVertexBuffer(0, buffers.orbit);
  for (const r of buffers.ranges) pass.draw(r.count, 1, r.first);
  pass.setPipeline(pipelines.body);
  pass.setVertexBuffer(0, quadBuf);
  pass.setVertexBuffer(1, buffers.inst);
  pass.draw(6, buffers.instCount);
  pass.end();
  device.queue.submit([enc.finish()]);
}

// On-demand repaint (the scene is static between interactions, so no perpetual rAF loop).
function requestRender() {
  drawFrame();
}

function refreshData() {
  if (!gpu.ready) return;
  try {
    buildGeometry(systemSnapshot(currentUnix()));
  } catch (e) {
    console.error("orrery refreshData failed:", e);
  }
}

function showFallback(msg) {
  const node = document.getElementById("orreryInsight");
  if (node) node.textContent = msg;
  const canvas = document.getElementById("orreryCanvas");
  if (canvas) canvas.style.display = "none";
}

export async function enterOrrery() {
  state.active = true;
  const canvas = document.getElementById("orreryCanvas");
  if (!canvas) return;
  if (!navigator.gpu) {
    showFallback("WebGPU is not available in this browser — try a recent Chrome, Edge, or Firefox to see the 3-D view.");
    return;
  }
  try {
    await loadSkyEngine();
    const ok = await init(canvas);
    if (!ok) { showFallback("Could not initialise WebGPU on this device."); return; }
    refreshData();
    requestRender();
    // A couple of deferred repaints in case layout/size settles after the first paint.
    requestAnimationFrame(requestRender);
    setTimeout(requestRender, 80);
  } catch (e) {
    showFallback("WebGPU initialisation failed: " + e.message);
  }
}

export function leaveOrrery() {
  state.active = false;
}

// ---- interaction ----
function attach() {
  const canvas = document.getElementById("orreryCanvas");
  if (!canvas) return;
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", (e) => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    state.az -= (e.clientX - lx) * 0.008;
    state.el = Math.max(-1.45, Math.min(1.45, state.el + (e.clientY - ly) * 0.008));
    lx = e.clientX; ly = e.clientY;
    requestRender();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.radius = Math.max(1.2, Math.min(120, state.radius * (1 + Math.sign(e.deltaY) * 0.12)));
    requestRender();
  }, { passive: false });

  document.getElementById("orreryTime")?.addEventListener("input", (e) => {
    state.offsetYears = Number(e.target.value);
    refreshData();
    requestRender();
  });
  document.getElementById("orreryNow")?.addEventListener("click", () => {
    state.offsetYears = 0;
    const s = document.getElementById("orreryTime");
    if (s) s.value = "0";
    refreshData();
    requestRender();
  });
}
attach();
