// "3-D View": a hardened, cross-platform 3-D solar-system orrery. Dependency-free.
//
// Primary backend is the browser's native WebGPU API, which maps straight onto the
// platform's low-level GPU stack — Direct3D 12 on Windows (arm64 + x86_64), Metal on
// macOS (Apple-silicon M-series + Intel), and Vulkan on Linux (arm64 + x86_64). A WebGL2
// backend (ANGLE → D3D/GL/Metal/Vulkan, hardware-accelerated) is the fallback wherever
// WebGPU is unavailable or fails to initialise. Both reuse the VSOP2013 system_snapshot.
//
// Hardening: high-performance adapter selection with a fallback adapter, validation
// error-scoping around pipeline creation, uncaptured-error logging, automatic recovery
// from GPU device loss (driver reset / TDR / sleep-wake), defensive getCurrentTexture,
// resize via ResizeObserver, and on-demand rendering (no perpetual rAF loop).

import { loadSkyEngine, systemSnapshot } from "./skyEngine.js?v=ce663a8e7f";

const COLORS = {
  Sun: [1.0, 0.82, 0.29],
  Mercury: [0.70, 0.64, 0.53], Venus: [0.96, 0.94, 0.81], Earth: [0.36, 0.61, 1.0],
  Mars: [1.0, 0.42, 0.30], Jupiter: [0.88, 0.78, 0.61], Saturn: [0.94, 0.85, 0.54],
  Uranus: [0.66, 0.88, 0.90], Neptune: [0.49, 0.65, 1.0]
};
// On-screen marker DIAMETER in CSS px (constant size, ranked by real body size so the gas giants
// read bigger than the terrestrials). Physical sizes are invisible at AU scale, so these are
// perceptual — but always visible regardless of zoom (unlike the old world-space AU billboards).
const BODY_SIZE_PX = {
  Sun: 24, Mercury: 9, Venus: 11, Earth: 11, Mars: 9,
  Jupiter: 18, Saturn: 16, Uranus: 13, Neptune: 13
};
const ORDER = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
const FOVY = (45 * Math.PI) / 180;

const state = { az: 0.7, el: 0.5, radius: 26, offsetYears: 0, active: false, backend: "", initing: false };

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
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
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

// ---- backend-agnostic geometry ----
// geom = { orbit: Float32Array[x,y,z,r,g,b], ranges:[{first,count}], body: Float32Array[cx,cy,cz,radius,r,g,b], bodyCount }
let geom = null;
function buildGeometry(snap) {
  const orbit = [];
  const ranges = [];
  for (const name of ORDER) {
    const b = (snap.bodies || []).find((x) => x.name === name);
    if (!b || b.a_au == null) continue;
    const col = COLORS[name];
    const pts = ellipse3d(b);
    ranges.push({ first: orbit.length / 6, count: pts.length });
    for (const p of pts) orbit.push(p[0], p[1], p[2], col[0] * 0.7, col[1] * 0.7, col[2] * 0.7);
  }
  // Ecliptic reference plane (z = 0): faint concentric rings + radial spokes give a flat datum
  // so each orbit's TRUE inclination is visible as it rises above / dips below the plane.
  const GRID = [0.20, 0.24, 0.32];
  for (const rad of [1, 5, 10, 20, 30]) {
    const first = orbit.length / 6;
    const seg = 96;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * 2 * Math.PI;
      orbit.push(Math.cos(a) * rad, Math.sin(a) * rad, 0, GRID[0], GRID[1], GRID[2]);
    }
    ranges.push({ first, count: seg + 1 });
  }
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * 2 * Math.PI;
    const first = orbit.length / 6;
    orbit.push(0, 0, 0, GRID[0], GRID[1], GRID[2]);
    orbit.push(Math.cos(a) * 31, Math.sin(a) * 31, 0, GRID[0], GRID[1], GRID[2]);
    ranges.push({ first, count: 2 });
  }
  // Drop-lines: each planet to its projection on the ecliptic — shows height above/below the plane.
  const DROP = [0.45, 0.50, 0.60];
  for (const b of snap.bodies || []) {
    if (b.x_au == null) continue;
    const first = orbit.length / 6;
    orbit.push(b.x_au, b.y_au, b.z_au, DROP[0], DROP[1], DROP[2]);
    orbit.push(b.x_au, b.y_au, 0, DROP[0], DROP[1], DROP[2]);
    ranges.push({ first, count: 2 });
  }

  // Marker size is constant on screen (CSS px → backing-store px via dpr); the size attribute
  // holds the on-screen diameter, used directly by both backends.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const body = [0, 0, 0, BODY_SIZE_PX.Sun * dpr, ...COLORS.Sun];
  const labels = [{ name: "Sun", x: 0, y: 0, z: 0 }];
  for (const b of snap.bodies || []) {
    const col = COLORS[b.name] || [1, 1, 1];
    body.push(b.x_au, b.y_au, b.z_au, (BODY_SIZE_PX[b.name] || 9) * dpr, col[0], col[1], col[2]);
    labels.push({ name: b.name, x: b.x_au, y: b.y_au, z: b.z_au });
  }
  geom = { orbit: new Float32Array(orbit), ranges, body: new Float32Array(body), bodyCount: body.length / 7, labels };
}

function currentUnix() {
  return Date.now() / 1000 + state.offsetYears * 365.25 * 86400;
}

function camera(w, h) {
  const eye = [
    state.radius * Math.cos(state.el) * Math.cos(state.az),
    state.radius * Math.cos(state.el) * Math.sin(state.az),
    state.radius * Math.sin(state.el)
  ];
  const view = lookAt(eye, [0, 0, 0], [0, 0, 1]);
  const proj = perspective(FOVY, w / h, 0.05, 400);
  return { vp: mul(proj, view) };
}

// =====================================================================
//  WebGPU backend (native D3D12 / Metal / Vulkan via the browser)
// =====================================================================
const ORBIT_WGSL = `
struct Cam { vp: mat4x4<f32>, viewport: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
struct VO { @builtin(position) pos: vec4<f32>, @location(0) col: vec3<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) c: vec3<f32>) -> VO {
  var o: VO; o.pos = cam.vp * vec4<f32>(p, 1.0); o.col = c; return o;
}
@fragment fn fs(@location(0) c: vec3<f32>) -> @location(0) vec4<f32> { return vec4<f32>(c, 0.5); }
`;
const BODY_WGSL = `
struct Cam { vp: mat4x4<f32>, viewport: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
struct VO { @builtin(position) pos: vec4<f32>, @location(0) corner: vec2<f32>, @location(1) col: vec3<f32> };
@vertex fn vs(@location(0) corner: vec2<f32>, @location(1) center: vec3<f32>,
              @location(2) diam: f32, @location(3) col: vec3<f32>) -> VO {
  // Constant on-screen size: offset the quad corner in clip space by a pixel diameter.
  var clip = cam.vp * vec4<f32>(center, 1.0);
  clip.x = clip.x + corner.x * (diam / cam.viewport.x) * clip.w;
  clip.y = clip.y + corner.y * (diam / cam.viewport.y) * clip.w;
  var o: VO; o.pos = clip; o.corner = corner; o.col = col; return o;
}
@fragment fn fs(@location(0) corner: vec2<f32>, @location(1) col: vec3<f32>) -> @location(0) vec4<f32> {
  let d = length(corner);
  if (d > 1.0) { discard; }
  // Near-opaque disc (AA only at the rim) so the depth buffer resolves overlapping bodies
  // correctly without back-to-front sorting.
  return vec4<f32>(col, smoothstep(1.0, 0.9, d));
}
`;

function makeWebGPU(onLost) {
  let device, ctx, format, pipelines, quadBuf, uni, bind, depthTex, dw = 0, dh = 0;
  let orbitBuf, instBuf, ranges = [], instCount = 0;

  async function adapterLabel(adapter) {
    let i = adapter.info;
    if (!i && adapter.requestAdapterInfo) { try { i = await adapter.requestAdapterInfo(); } catch (_) { i = null; } }
    i = i || {};
    const parts = [i.vendor, i.architecture, i.device, i.description].filter(Boolean);
    return "WebGPU" + (parts.length ? " · " + parts.join(" ") : "");
  }

  async function init(canvas) {
    if (!navigator.gpu) return null;
    let adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" }).catch(() => null);
    if (!adapter) adapter = await navigator.gpu.requestAdapter().catch(() => null);
    if (!adapter) adapter = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true }).catch(() => null);
    if (!adapter) return null;
    let dev;
    try { dev = await adapter.requestDevice(); } catch (_) { return null; }
    if (!dev) return null;

    // Build all GPU objects under a validation error scope; bail to WebGL2 on any error.
    dev.pushErrorScope("validation");
    format = navigator.gpu.getPreferredCanvasFormat();
    uni = dev.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bgl = dev.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }]
    });
    bind = dev.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: uni } }] });
    const layout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
    const blend = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
    };
    const depthStencil = { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" };
    const om = dev.createShaderModule({ code: ORBIT_WGSL });
    const orbitPipeline = dev.createRenderPipeline({
      layout,
      vertex: { module: om, entryPoint: "vs", buffers: [{ arrayStride: 24, attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }] }] },
      fragment: { module: om, entryPoint: "fs", targets: [{ format, blend }] },
      primitive: { topology: "line-strip" }, depthStencil
    });
    const bm = dev.createShaderModule({ code: BODY_WGSL });
    const bodyPipeline = dev.createRenderPipeline({
      layout,
      vertex: { module: bm, entryPoint: "vs", buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
        { arrayStride: 32, stepMode: "instance", attributes: [
          { shaderLocation: 1, offset: 0, format: "float32x3" },
          { shaderLocation: 2, offset: 12, format: "float32" },
          { shaderLocation: 3, offset: 16, format: "float32x3" }] }] },
      fragment: { module: bm, entryPoint: "fs", targets: [{ format, blend }] },
      primitive: { topology: "triangle-list" }, depthStencil
    });
    const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
    quadBuf = dev.createBuffer({ size: quad.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(quadBuf, 0, quad);
    const err = await dev.popErrorScope();
    if (err) { console.error("WebGPU pipeline validation failed:", err.message); try { dev.destroy(); } catch (_) {} return null; }

    // Commit: only now touch the canvas context so a failure above leaves it free for WebGL2.
    ctx = canvas.getContext("webgpu");
    if (!ctx) { try { dev.destroy(); } catch (_) {} return null; }
    ctx.configure({ device: dev, format, alphaMode: "opaque" });
    device = dev;
    pipelines = { orbit: orbitPipeline, body: bodyPipeline };
    device.onuncapturederror = (e) => console.error("WebGPU runtime error:", e.error && e.error.message);
    device.lost.then((info) => { if (info.reason !== "destroyed" && onLost) onLost(info); });
    return { label: await adapterLabel(adapter) };
  }

  function upload(g) {
    if (orbitBuf) orbitBuf.destroy();
    if (instBuf) instBuf.destroy();
    orbitBuf = device.createBuffer({ size: g.orbit.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(orbitBuf, 0, g.orbit);
    // Pad each body (28 B) to the 32 B instance stride.
    const inst = new Float32Array(g.bodyCount * 8);
    for (let i = 0; i < g.bodyCount; i++) inst.set(g.body.subarray(i * 7, i * 7 + 7), i * 8);
    instBuf = device.createBuffer({ size: inst.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(instBuf, 0, inst);
    ranges = g.ranges; instCount = g.bodyCount;
  }

  function draw(w, h, cam) {
    if (!device || !orbitBuf) return;
    if (!depthTex || dw !== w || dh !== h) {
      if (depthTex) depthTex.destroy();
      depthTex = device.createTexture({ size: [w, h], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
      dw = w; dh = h;
    }
    const u = new Float32Array(24);
    u.set(cam.vp, 0);
    u.set([w, h, 0, 0], 16); // viewport (backing-store px) for constant-size markers
    device.queue.writeBuffer(uni, 0, u);
    let tex;
    try { tex = ctx.getCurrentTexture(); } catch (_) { return; }
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: tex.createView(), clearValue: { r: 0.015, g: 0.02, b: 0.05, a: 1 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: depthTex.createView(), depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" }
    });
    pass.setBindGroup(0, bind);
    pass.setPipeline(pipelines.orbit); pass.setVertexBuffer(0, orbitBuf);
    for (const r of ranges) pass.draw(r.count, 1, r.first);
    pass.setPipeline(pipelines.body); pass.setVertexBuffer(0, quadBuf); pass.setVertexBuffer(1, instBuf);
    pass.draw(6, instCount);
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  function destroy() { try { device && device.destroy(); } catch (_) {} device = null; }
  return { name: "webgpu", init, upload, draw, destroy };
}

// =====================================================================
//  WebGL2 fallback (ANGLE → D3D11 / GL / Metal / Vulkan, hardware-accelerated)
// =====================================================================
const GL_ORBIT_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_col;
uniform mat4 u_vp; out vec3 v_col;
void main(){ gl_Position = u_vp * vec4(a_pos,1.0); v_col = a_col; }`;
const GL_ORBIT_FS = `#version 300 es
precision highp float; in vec3 v_col; out vec4 o;
void main(){ o = vec4(v_col, 0.5); }`;
const GL_BODY_VS = `#version 300 es
layout(location=0) in vec3 a_center; layout(location=1) in float a_diam; layout(location=2) in vec3 a_col;
uniform mat4 u_vp; out vec3 v_col;
void main(){
  gl_Position = u_vp * vec4(a_center,1.0);
  gl_PointSize = clamp(a_diam, 2.0, 256.0); // constant on-screen size (already in px)
  v_col = a_col;
}`;
const GL_BODY_FS = `#version 300 es
precision highp float; in vec3 v_col; out vec4 o;
void main(){ vec2 d = gl_PointCoord - vec2(0.5); float r = length(d)*2.0; if(r>1.0) discard; o = vec4(v_col, smoothstep(1.0,0.9,r)); }`;

function makeWebGL2() {
  let gl, orbitProg, bodyProg, orbitVbo, bodyVbo, orbitVao, bodyVao;
  let ranges = [], bodyCount = 0;
  let uOrbitVp, uBodyVp;

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "program link failed");
    return p;
  }

  function init(canvas) {
    gl = canvas.getContext("webgl2", { antialias: true, depth: true, alpha: false });
    if (!gl) return null;
    try {
      orbitProg = program(GL_ORBIT_VS, GL_ORBIT_FS);
      bodyProg = program(GL_BODY_VS, GL_BODY_FS);
    } catch (e) { console.error("WebGL2 shader error:", e.message); return null; }
    uOrbitVp = gl.getUniformLocation(orbitProg, "u_vp");
    uBodyVp = gl.getUniformLocation(bodyProg, "u_vp");
    orbitVbo = gl.createBuffer(); bodyVbo = gl.createBuffer();
    orbitVao = gl.createVertexArray(); bodyVao = gl.createVertexArray();

    gl.bindVertexArray(orbitVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, orbitVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

    gl.bindVertexArray(bodyVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, bodyVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
    gl.bindVertexArray(null);

    let label = "WebGL2";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) { const r = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL); if (r) label += " · " + r; }
    return { label };
  }

  function upload(g) {
    gl.bindBuffer(gl.ARRAY_BUFFER, orbitVbo); gl.bufferData(gl.ARRAY_BUFFER, g.orbit, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bodyVbo); gl.bufferData(gl.ARRAY_BUFFER, g.body, gl.DYNAMIC_DRAW);
    ranges = g.ranges; bodyCount = g.bodyCount;
  }

  function draw(w, h, cam) {
    if (!gl || gl.isContextLost()) return;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.015, 0.02, 0.05, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const vp = new Float32Array(cam.vp);

    gl.useProgram(orbitProg);
    gl.uniformMatrix4fv(uOrbitVp, false, vp);
    gl.bindVertexArray(orbitVao);
    for (const r of ranges) gl.drawArrays(gl.LINE_STRIP, r.first, r.count);

    gl.useProgram(bodyProg);
    gl.uniformMatrix4fv(uBodyVp, false, vp);
    gl.bindVertexArray(bodyVao);
    gl.drawArrays(gl.POINTS, 0, bodyCount);
    gl.bindVertexArray(null);
  }

  function destroy() { try { gl && gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch (_) {} gl = null; }
  return { name: "webgl2", init, upload, draw, destroy };
}

// =====================================================================
//  Controller
// =====================================================================
let backend = null;

function ensureSized(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return [w, h];
}

function setBackendLabel() {
  const node = document.getElementById("orreryBackend");
  if (node) node.textContent = state.backend ? "Rendering on " + state.backend : "";
}

function paint() {
  if (!state.active || !backend || !geom) return;
  const canvas = document.getElementById("orreryCanvas");
  if (!canvas || canvas.clientWidth === 0) return;
  const [w, h] = ensureSized(canvas);
  const cam = camera(w, h);
  backend.draw(w, h, cam);
  updateLabels(canvas, cam.vp);
}

const labelEls = [];
// Project each body's world position through the view-projection and place a DOM label there.
function updateLabels(canvas, vp) {
  const host = document.getElementById("orreryLabels");
  if (!host || !geom) return;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  // Track the centred canvas box within the (relative) viewport.
  host.style.left = canvas.offsetLeft + "px";
  host.style.top = canvas.offsetTop + "px";
  host.style.width = cw + "px";
  host.style.height = ch + "px";
  const items = geom.labels;
  while (labelEls.length < items.length) {
    const s = document.createElement("span");
    s.className = "orrery-label";
    host.appendChild(s);
    labelEls.push(s);
  }
  for (let i = 0; i < labelEls.length; i++) {
    const el = labelEls[i];
    if (i >= items.length) { el.style.display = "none"; continue; }
    const it = items[i];
    const x = vp[0] * it.x + vp[4] * it.y + vp[8] * it.z + vp[12];
    const y = vp[1] * it.x + vp[5] * it.y + vp[9] * it.z + vp[13];
    const wv = vp[3] * it.x + vp[7] * it.y + vp[11] * it.z + vp[15];
    if (wv <= 0.0001) { el.style.display = "none"; continue; } // behind the camera
    const sx = (x / wv * 0.5 + 0.5) * cw;
    const sy = (1 - (y / wv * 0.5 + 0.5)) * ch;
    if (sx < 0 || sx > cw || sy < 0 || sy > ch) { el.style.display = "none"; continue; } // off-screen
    el.style.display = "block";
    el.style.left = sx + "px";
    el.style.top = sy + "px";
    if (el.textContent !== it.name) el.textContent = it.name;
  }
}

function onDeviceLost(info) {
  console.warn("GPU device lost:", info && info.message, "— recovering.");
  backend = null;
  state.backend = "";
  if (state.active) selectBackend();
}

async function selectBackend() {
  if (backend || state.initing) return;
  state.initing = true;
  const canvas = document.getElementById("orreryCanvas");
  try {
    if (!canvas) return;
    const candidates = [];
    // `?gl` or window.__orreryForceGL forces the WebGL2 path (diagnostics / unsupported WebGPU).
    const forceGl = (typeof window !== "undefined" && window.__orreryForceGL) ||
      (typeof location !== "undefined" && location.search.includes("gl"));
    if (navigator.gpu && !forceGl) candidates.push(makeWebGPU(onDeviceLost));
    candidates.push(makeWebGL2());
    for (const cand of candidates) {
      let res = null;
      try { res = await cand.init(canvas); } catch (e) { console.error(cand.name, "init failed:", e.message); }
      if (res) {
        backend = cand;
        state.backend = res.label;
        setBackendLabel();
        if (geom) backend.upload(geom);
        paint();
        return;
      }
    }
    showFallback("No hardware-accelerated 3-D backend is available (neither WebGPU nor WebGL2). Try a recent Chrome, Edge, Firefox, or Safari.");
  } finally {
    state.initing = false;
  }
}

function refreshData() {
  try {
    buildGeometry(systemSnapshot(currentUnix()));
    if (backend) { backend.upload(geom); paint(); }
  } catch (e) {
    console.error("orrery data refresh failed:", e);
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
  canvas.style.display = "block";
  try {
    await loadSkyEngine();
    buildGeometry(systemSnapshot(currentUnix()));
    await selectBackend();
    // A couple of deferred repaints in case layout settles after the first paint.
    requestAnimationFrame(paint);
    setTimeout(paint, 80);
  } catch (e) {
    showFallback("3-D view failed to initialise: " + e.message);
  }
}

export function leaveOrrery() {
  state.active = false;
}

// ---- interaction ----
(function attach() {
  const canvas = document.getElementById("orreryCanvas");
  if (!canvas) return;
  canvas.tabIndex = 0; // keyboard-focusable for accessibility
  const clampRadius = (r) => Math.max(1.2, Math.min(120, r));
  const pointers = new Map();
  let lx = 0, ly = 0, pinchDist = 0;
  const spread = () => {
    const p = [...pointers.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  };

  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lx = e.clientX; ly = e.clientY;
    if (pointers.size === 2) pinchDist = spread();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const drop = (e) => { pointers.delete(e.pointerId); try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} };
  canvas.addEventListener("pointerup", drop);
  canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) { // pinch-zoom (touch)
      const d = spread();
      if (pinchDist > 0 && d > 0) { state.radius = clampRadius(state.radius * (pinchDist / d)); pinchDist = d; paint(); }
      return;
    }
    state.az -= (e.clientX - lx) * 0.008;
    state.el = Math.max(-1.45, Math.min(1.45, state.el + (e.clientY - ly) * 0.008));
    lx = e.clientX; ly = e.clientY;
    paint();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.radius = clampRadius(state.radius * (1 + Math.sign(e.deltaY) * 0.12));
    paint();
  }, { passive: false });

  // Keyboard camera (accessibility): arrows orbit, +/− or [ ] zoom.
  canvas.addEventListener("keydown", (e) => {
    let used = true;
    if (e.key === "ArrowLeft") state.az -= 0.1;
    else if (e.key === "ArrowRight") state.az += 0.1;
    else if (e.key === "ArrowUp") state.el = Math.min(1.45, state.el + 0.1);
    else if (e.key === "ArrowDown") state.el = Math.max(-1.45, state.el - 0.1);
    else if (e.key === "+" || e.key === "=" || e.key === "]") state.radius = clampRadius(state.radius * 0.88);
    else if (e.key === "-" || e.key === "_" || e.key === "[") state.radius = clampRadius(state.radius * 1.13);
    else used = false;
    if (used) { e.preventDefault(); paint(); }
  });

  document.getElementById("orreryTime")?.addEventListener("input", (e) => { state.offsetYears = Number(e.target.value); refreshData(); });
  document.getElementById("orreryNow")?.addEventListener("click", () => {
    state.offsetYears = 0;
    const s = document.getElementById("orreryTime"); if (s) s.value = "0";
    refreshData();
  });

  // Repaint on resize (handles DPI / window changes) without a perpetual loop.
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (state.active) paint(); }).observe(canvas);
})();
