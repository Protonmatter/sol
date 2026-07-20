// "3-D View": a real, lit, textured 3-D solar system. Dependency-free, rendered with WebGL2
// (hardware-accelerated through ANGLE → Direct3D 11 on Windows, Metal on macOS, GL/Vulkan on
// Linux; arm64 + x86_64). Positions come from the same VSOP2013 system_snapshot as the other
// surfaces; the bodies are drawn as proper spheres with:
//   • correct size & oblateness, axial tilt and sidereal rotation (IAU WGCCRE 2015 pole + W),
//   • per-body procedural surfaces (continents/clouds, craters, gas-giant bands, the Great Red
//     Spot), Lambert lighting from the Sun so every body shows its true phase/terminator,
//   • Saturn / Uranus / Neptune ring systems with real radii and the Cassini Division,
//   • an animated Sun (granulation, sunspots, limb darkening) with a corona and solar wind,
//   • atmospheric limb halos for the worlds that have an atmosphere,
//   • the real sky as a backdrop: ~1700 catalogue-weighted stars, the Milky Way band, headline
//     constellation figures, and the true positions of seven pulsars + eight galaxies / the
//     galactic centre — the fixed reference points that orient the whole scene on the sky.
// Orbits are drawn at their true inclinations against the ecliptic reference plane.

import { store } from "./store.js?v=78434029fa";
import { loadSkyEngine, systemSnapshot, systemPositions, SYSTEM_POSITIONS_ORDER } from "./skyEngine.js?v=78434029fa";
import { BODY, PLANET_ORDER, STYLE_ID, AU_KM, poleVector } from "./bodyData.js?v=78434029fa";
import { buildCelestial } from "./celestial.js?v=78434029fa";
import { DWARFS, COMETS, PROBES, asOrbit, bodyXYZ, probeXYZ, buildBelts } from "./smallbodies.js?v=78434029fa";
import { epochAccuracy, epochLabel } from "./accuracy.js?v=78434029fa";
import {
  perspective, lookAt, mul, sub, add, cross, dot, norm, translate, scaleM, normalMat3,
  iauRotation, buildSphere, buildRing, ellipse3d,
} from "./orreryMath.js?v=78434029fa";
import {
  SPHERE_VS, SPHERE_FS, LINE_VS, LINE_FS, RING_VS, RING_FS, PT_VS, PT_FS, GLOW_VS, GLOW_FS,
} from "./orreryShaders.js?v=78434029fa";
import {
  GAL_SUN_R, GAL_THETA0, GAL_OMEGA, GAL_SHEAR_K, GAL_SHEAR_RC,
  galShear, sunGalacticPos, buildGalaxyModel, buildGalObjectList,
  buildCatalogStarsGalactic, buildNeighbourhoodModel,
} from "./orreryGalaxy.js?v=78434029fa";
import { renderDetail } from "./orreryDetail.js?v=78434029fa";

// Update the heliocentric-accuracy readout for the current epoch offset.
function updateOrreryAccuracy() {
  const node = document.getElementById("orreryAccuracy"); if (!node) return;
  const a = epochAccuracy(state.offsetYears, "helio");
  node.className = "epoch-accuracy acc-" + a.level;
  node.textContent = `${epochLabel(state.offsetYears)} — ${a.text}`;
}

const FOVY = (42 * Math.PI) / 180;
const YR = 365.25 * 86400;

// Perceptual display radii (AU) in "visible" mode — true radii are sub-pixel at AU scale, so the
// bodies are ranked by real size but enlarged to be legible (as in NASA's Eyes). "True scale"
// switches to the real radius/AU; an exaggeration slider scales the visible sizes.
const VIS_RADIUS_AU = {
  Sun: 0.20, Mercury: 0.045, Venus: 0.075, Earth: 0.080, Mars: 0.058,
  Jupiter: 0.170, Saturn: 0.140, Uranus: 0.100, Neptune: 0.100, Moon: 0.022,
};

// Real planetary surface maps (apps/web/textures/, fetched by tools/fetch_textures.py). Loaded
// same-origin so WebGL can use them; any that are missing fall back to the procedural shader.
const TEXTURE_FILES = {
  Mercury: "mercury.jpg", Venus: "venus.jpg", Earth: "earth.jpg", Mars: "mars.jpg",
  Jupiter: "jupiter.jpg", Saturn: "saturn.jpg", Uranus: "uranus.jpg", Neptune: "neptune.jpg", Moon: "moon.jpg",
};

// Registered on the shared store (store.orrery) so this surface's state is inspectable
// from one place like the rest of the app — the same object, no copies. Rendering-internal
// GL handles stay module-local below; this holds the user-facing/scene state.
const state = (store.orrery = {
  az: 0.7, el: 0.45, radius: 26, savedRadius: 26, offsetYears: 0,
  active: false, entering: false, exaggeration: 1, trueScale: false, animate: true,
  yearsPerSec: 0.5, // solar-system animation rate (sim years per real second) — fast enough to see the giants orbit
  galSpeed: 2,      // galaxy-view rate (millions of years per real second), decoupled from the planetary rate
  showOrbits: true, showSky: true, showConst: true, showLabels: true, showSunEq: true, useTextures: true, galaxy: false,
  showSmall: true, // belts + dwarf planets + comets + spacecraft (the illustrative small-body layer)
  galDeepSky: true, // nebulae / pulsars / black holes / nearby stars in the Milky-Way view
  localView: false, // light-year-scale solar-neighbourhood sub-view of the galaxy mode
  topDown: false, preTopRadius: 0, // "Top-down map" view — folds in the former standalone 2-D Solar System surface
  // Camera: orbit around `anchor` (a body name; "Sun" = origin) or a free-fly camera (WASD + look).
  anchor: "Sun", freeFly: false, freePos: [18, 18, 12], yaw: -2.3, pitch: -0.4, flySpeed: 4, keys: new Set(),
  renderUnix: Date.now() / 1000, simElapsed: 0, galYears: 0, selected: null, backend: "",
  bodies: [], lastTick: 0,
});

const DRAW_LIST = ["Sun", ...PLANET_ORDER, "Moon"];

// (mat/vec helpers, the IAU orientation, and the sphere/ring/ellipse geometry builders
// live in orreryMath.js; GLSL sources in orreryShaders.js — both imported above.)

// ---------------------------------------------------------------- WebGL2 renderer
let gl, P = {}, sphere, quadBuf, cel, celBufs = {}, particles = null;
let bodyBuf, ringBufs = {}, sceneLineBuf, sceneRanges = [], dropLineBuf, dropRanges = [];
let textures = {}, ringTex = { ready: false, tex: null }, whiteTex = null, texturesStarted = false;
let sunTex = { ready: false, tex: null }; // the latest real SDO disk, for the 3-D Sun's surface
let galaxy = null;
let smallBodies = []; // per-frame small-body markers: {name, pos, col, kind, note}

function makeTexture(img, repeatS) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatS ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

// Kick off async loads of the real surface maps; each appears as soon as it decodes. Missing files
// (fetch_textures.py not run) just leave the body on its procedural shader.
function loadTextures() {
  if (texturesStarted || !gl) return;
  texturesStarted = true;
  const repaint = () => { if (state.active && !state.animate) paint(); };
  for (const [name, file] of Object.entries(TEXTURE_FILES)) {
    const img = new Image();
    img.onload = () => { try { textures[name] = { tex: makeTexture(img, true), ready: true }; repaint(); } catch (e) { console.warn("texture", name, e.message); } };
    img.onerror = () => {};
    img.src = "textures/" + file + "?v=78434029fa"; // ?v stamped by tools/build_web.py (busts cached textures)
  }
  const ring = new Image();
  ring.onload = () => { try { ringTex = { tex: makeTexture(ring, false), ready: true }; repaint(); } catch (e) {} };
  ring.onerror = () => {};
  ring.src = "textures/saturn_ring.png?v=78434029fa";
  // The real, latest Sun (NASA SDO HMI continuum) for the 3-D Sun's surface — served same-origin from
  // textures/ (sdo.gsfc.nasa.gov sends no CORS header, so a remote image can't be a WebGL texture).
  // tools/fetch_textures.py downloads the latest disk to textures/sun.jpg; absent → procedural shader.
  const sun = new Image();
  sun.onload = () => { try { sunTex = { tex: makeTexture(sun, false), ready: true }; repaint(); } catch (e) { console.warn("sun texture", e.message); } };
  sun.onerror = () => {};
  sun.src = "textures/sun.jpg?v=78434029fa";
}

function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
function uloc(p, names) { const m = {}; for (const n of names) m[n] = gl.getUniformLocation(p, n); return m; }

function initGL(canvas) {
  // No preserveDrawingBuffer: nothing reads the framebuffer back, and keeping it costs
  // a full-framebuffer copy per composite on many GPUs.
  gl = canvas.getContext("webgl2", { antialias: true, depth: true, alpha: false, premultipliedAlpha: false });
  if (!gl) return null;
  try {
    P.sphere = program(SPHERE_VS, SPHERE_FS);
    P.line = program(LINE_VS, LINE_FS);
    P.ring = program(RING_VS, RING_FS);
    P.pt = program(PT_VS, PT_FS);
    P.glow = program(GLOW_VS, GLOW_FS);
  } catch (e) {
    console.error("orrery shader error:", e.message);
    // Leave no half-initialised context behind: a truthy `gl` with an empty program set
    // made the next enterOrrery skip init and crash in paint() with the wrong fallback text.
    gl = null; P = {};
    return null;
  }
  P.sphereU = uloc(P.sphere, ["u_mvp", "u_model", "u_nmat", "u_style", "u_mode", "u_time", "u_base", "u_light", "u_cam", "u_atmo", "u_atmoStr", "u_useTex", "u_tex"]);
  P.lineU = uloc(P.line, ["u_vp", "u_alpha"]);
  P.ringU = uloc(P.ring, ["u_mvp", "u_useTex", "u_tex"]);
  P.ptU = uloc(P.pt, ["u_vp", "u_dpr", "u_soft", "u_shearT", "u_shearK", "u_shearRc"]);
  P.glowU = uloc(P.glow, ["u_vp", "u_center", "u_right", "u_up", "u_size", "u_color", "u_pow"]);

  const s = buildSphere(48, 96);
  sphere = { pos: gl.createBuffer(), idx: gl.createBuffer(), count: s.idx.length };
  gl.bindBuffer(gl.ARRAY_BUFFER, sphere.pos); gl.bufferData(gl.ARRAY_BUFFER, s.pos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, s.idx, gl.STATIC_DRAW);

  quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

  sceneLineBuf = gl.createBuffer();
  dropLineBuf = gl.createBuffer();
  bodyBuf = gl.createBuffer();
  for (const name of ["bg", "mw", "bright", "marker", "wind", "galaxy", "galGuide", "galTrail", "beltA", "beltK", "smallMark", "galObj", "catStars", "nbhd", "nbhdGuide"]) celBufs[name] = gl.createBuffer();

  // 1×1 white fallback so the sphere/ring sampler always has a valid texture bound.
  whiteTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, whiteTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  buildCelestialBuffers();
  buildGalaxyBuffers();
  buildSmallBuffers();

  let label = "WebGL2";
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  if (dbg) { const r = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL); if (r) label += " · " + r; }
  return { label };
}

function buildCelestialBuffers() {
  cel = buildCelestial(starCat);
  // Background stars arrive pre-packed in the point-shader layout [x,y,z,size,r,g,b,a] —
  // the real Hipparcos naked-eye catalogue with per-star B−V colour (see celestial.js).
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.bg); gl.bufferData(gl.ARRAY_BUFFER, cel.bgStars.packed, gl.STATIC_DRAW);
  celBufs.bgCount = cel.bgStars.count;

  // Milky Way band points: cel.milkyWay = [x,y,z,w]*
  const mwN = cel.milkyWay.length / 4, mw = new Float32Array(mwN * 8);
  for (let i = 0; i < mwN; i++) {
    const w = cel.milkyWay[i * 4 + 3];
    mw.set([cel.milkyWay[i * 4], cel.milkyWay[i * 4 + 1], cel.milkyWay[i * 4 + 2], 1.6, 0.80, 0.84, 1.0, 0.10 * w], i * 8);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.mw); gl.bufferData(gl.ARRAY_BUFFER, mw, gl.STATIC_DRAW);
  celBufs.mwCount = mwN;

  // bright catalogue stars
  const bs = cel.brightStars, bsa = new Float32Array(bs.length * 8);
  bs.forEach((s, i) => bsa.set([s.pos[0], s.pos[1], s.pos[2], Math.max(2.2, 5.5 - 0.7 * s.m), 1.0, 0.98, 0.92, 1.0], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.bright); gl.bufferData(gl.ARRAY_BUFFER, bsa, gl.STATIC_DRAW);
  celBufs.brightCount = bs.length;

  // pulsars (cyan) + galaxies (violet) markers
  const marks = [];
  for (const p of cel.pulsars) marks.push([p.pos, 5.0, [0.45, 0.95, 1.0]]);
  for (const g of cel.deepsky) marks.push([g.pos, 4.5, g.kind === "gc" ? [1.0, 0.7, 0.3] : [0.85, 0.7, 1.0]]);
  const ma = new Float32Array(marks.length * 8);
  marks.forEach((m, i) => ma.set([m[0][0], m[0][1], m[0][2], m[1], m[2][0], m[2][1], m[2][2], 1.0], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.marker); gl.bufferData(gl.ARRAY_BUFFER, ma, gl.STATIC_DRAW);
  celBufs.markerCount = marks.length;

  // constellation + Milky-Way nothing; constellation lines → line buffer [x,y,z,r,g,b]
  const cl = cel.constLines, clp = new Float32Array(cl.length / 3 * 6);
  for (let i = 0; i < cl.length / 3; i++) clp.set([cl[i * 3], cl[i * 3 + 1], cl[i * 3 + 2], 0.40, 0.52, 0.78], i * 6);
  celBufs.constLine = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.constLine); gl.bufferData(gl.ARRAY_BUFFER, clp, gl.STATIC_DRAW);
  celBufs.constCount = cl.length / 3;
}

// ---------------------------------------------------------------- Milky Way (galactic-scale view)
// (The galaxy MODEL — constants, the Sun's orbit, differential-rotation shear, and the
// procedural point-cloud/guide-ring/label generation — lives in orreryGalaxy.js, imported
// above. This file only uploads the returned arrays and draws them.)
// Galactic years advanced per real second while animating (reuses the Time-speed slider, scaled to Myr).
function galYearsPerSec() { return state.galSpeed * 1e6; }       // galSpeed is in Myr/s; default 2 ⇒ a lap in ~110 s
// Move the Sun along its galactic orbit for the current galactic time, and update its travelling label.
function updateGalaxySun() {
  if (!galaxy) return;
  const yrs = state.offsetYears + state.galYears;
  galaxy.sunPos = sunGalacticPos(yrs);
  const lbl = galaxy.labels.find((l) => l.sun);
  if (lbl) {
    lbl.p = galaxy.sunPos;
    const orbits = (GAL_OMEGA * yrs) / (2 * Math.PI);
    lbl.name = Math.abs(state.galYears) < 1e4
      ? "☉ Sun — you are here (~26,700 ly out)"
      : `☉ Sun · ${yrs >= 0 ? "+" : "−"}${Math.abs(yrs / 1e6).toFixed(1)} Myr · ${Math.abs(orbits).toFixed(2)} galactic orbits`;
  }
}

// Upload the procedural galaxy model (points, guide rings, labels) and the deep-sky
// landmark objects — generation is pure and lives in orreryGalaxy.js.
let galObjects = [];
let nbhd = null; // solar-neighbourhood model (points + rings + named labels)
// The 370 KB star-catalogue data module, loaded ON DEMAND when this view first opens
// (in parallel with the WASM engine fetch) — deliberately NOT a static import, so the
// Sun / My Sky surfaces never pay for it at first paint. Cached for the session.
let starCat = null;
function buildGalaxyBuffers() {
  const model = buildGalaxyModel();
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galaxy);
  gl.bufferData(gl.ARRAY_BUFFER, model.points, gl.STATIC_DRAW);
  celBufs.galaxyCount = model.count;
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galGuide);
  gl.bufferData(gl.ARRAY_BUFFER, model.guide, gl.STATIC_DRAW);
  galaxy = { sunPos: model.sunPos, ranges: model.ranges, labels: model.labels };

  const list = buildGalObjectList();
  galObjects = list.objects;
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galObj); gl.bufferData(gl.ARRAY_BUFFER, list.packed, gl.STATIC_DRAW);
  celBufs.galObjCount = galObjects.length;

  // The real naked-eye catalogue at true galactic positions (clusters at the Sun — honest
  // scale), plus the light-year-scale solar-neighbourhood model where it resolves.
  const cat = buildCatalogStarsGalactic(starCat);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.catStars); gl.bufferData(gl.ARRAY_BUFFER, cat.points, gl.STATIC_DRAW);
  celBufs.catStarsCount = cat.count;
  nbhd = buildNeighbourhoodModel(starCat);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.nbhd); gl.bufferData(gl.ARRAY_BUFFER, nbhd.points, gl.STATIC_DRAW);
  celBufs.nbhdCount = nbhd.count;
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.nbhdGuide); gl.bufferData(gl.ARRAY_BUFFER, nbhd.guide, gl.STATIC_DRAW);
}

// ---------------------------------------------------------------- small bodies (belts, dwarfs, comets, probes)
let belts = null;
function buildSmallBuffers() {
  belts = buildBelts();
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.beltA); gl.bufferData(gl.ARRAY_BUFFER, belts.asteroid.data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.beltK); gl.bufferData(gl.ARRAY_BUFFER, belts.kuiper.data, gl.STATIC_DRAW);
}

// Recompute every small-body marker for the current `renderUnix`, and upload them as one point buffer.
function rebuildSmallBodies() {
  if (!gl) return; // context lost — keep the previous CPU-side list until restore
  smallBodies = [];
  if (!state.showSmall) { celBufs.smallMarkCount = 0; return; }
  const jy2k = timeJy2k(state.renderUnix);
  for (const b of DWARFS) smallBodies.push({ name: b.n, pos: bodyXYZ(b, jy2k), col: b.col, kind: "dwarf", note: b.note });
  for (const c of COMETS) smallBodies.push({ name: c.n, pos: bodyXYZ(c, jy2k), col: c.col, kind: "comet", note: c.note });
  for (const p of PROBES) smallBodies.push({ name: p.n, pos: probeXYZ(p), col: p.col, kind: "probe", note: p.note });
  const a = new Float32Array(smallBodies.length * 8);
  smallBodies.forEach((s, i) => a.set([s.pos[0], s.pos[1], s.pos[2], s.kind === "probe" ? 6 : 7, s.col[0], s.col[1], s.col[2], 1.0], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.smallMark); gl.bufferData(gl.ARRAY_BUFFER, a, gl.DYNAMIC_DRAW);
  celBufs.smallMarkCount = smallBodies.length;
}

// Julian years from J2000 for a Unix time (TT≈UTC at this precision — fine for the illustrative layer).
function timeJy2k(unixSeconds) { return (unixSeconds / 86400 + 2440587.5 - 2451545.0) / 365.25; }

// Solar-wind particle system (radial streamers from the Sun, Parker-spiral curl).
function initParticles() {
  const N = 520; particles = { N, p: new Float32Array(N * 3), v: new Float32Array(N * 3), age: new Float32Array(N), data: new Float32Array(N * 8) };
  for (let i = 0; i < N; i++) spawnParticle(i);
}
function spawnParticle(i) {
  const u = Math.random() * 2 - 1, th = Math.random() * 2 * Math.PI, r = Math.sqrt(1 - u * u);
  const dir = [r * Math.cos(th), r * Math.sin(th), u];
  const start = 0.22 + Math.random() * 0.05; // emanate from just outside the (capped) solar disc
  particles.p.set([dir[0] * start, dir[1] * start, dir[2] * start], i * 3);
  const speed = 0.18 + Math.random() * 0.12;
  particles.v.set([dir[0] * speed, dir[1] * speed, dir[2] * speed], i * 3);
  particles.age[i] = Math.random() * 60;
}
function stepParticles(dt) {
  if (!particles || !gl) return;
  for (let i = 0; i < particles.N; i++) {
    const x = particles.p[i * 3], y = particles.p[i * 3 + 1], z = particles.p[i * 3 + 2];
    const rr = Math.hypot(x, y, z) || 1e-6;
    // Parker-spiral curl: a small azimuthal nudge (rotation about z) growing with radius.
    const curl = 0.45 * dt;
    const nx = x - y * curl, ny = y + x * curl;
    particles.p[i * 3] = nx + particles.v[i * 3] * dt * 6;
    particles.p[i * 3 + 1] = ny + particles.v[i * 3 + 1] * dt * 6;
    particles.p[i * 3 + 2] = z + particles.v[i * 3 + 2] * dt * 6;
    particles.age[i] += dt;
    if (rr > 4.0 || particles.age[i] > 70) spawnParticle(i);
    const fade = Math.max(0, 1 - rr / 4.0);
    particles.data.set([particles.p[i * 3], particles.p[i * 3 + 1], particles.p[i * 3 + 2], 2.0, 1.0, 0.85, 0.55, 0.5 * fade], i * 8);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.wind); gl.bufferData(gl.ARRAY_BUFFER, particles.data, gl.DYNAMIC_DRAW);
}

// ---------------------------------------------------------------- per-frame data
function effectiveBaseUnix() { return Date.now() / 1000 + state.offsetYears * YR; }

let lastPosUpdate = 0;
let lastFullSnapshot = 0;

function rebuildPositions() {
  try {
    // Fast path for the 60 fps animation: raw positions from linear memory, updated
    // in place — the full JSON snapshot (phase/magnitude/speed for the detail panel)
    // refreshes at ≤~1 Hz, aligned with the DOM list's own throttle below. An older
    // deployed wasm without the export, a name-order mismatch, or an empty first call
    // all fall back to the JSON path, which also (re)seeds the body objects.
    const positions = systemPositions(state.renderUnix);
    const aligned = positions
      && positions.length === SYSTEM_POSITIONS_ORDER.length * 3
      && state.bodies.length === SYSTEM_POSITIONS_ORDER.length
      && state.bodies.every((b, i) => b.name === SYSTEM_POSITIONS_ORDER[i]);
    if (aligned && performance.now() - lastFullSnapshot <= 800) {
      for (let i = 0; i < state.bodies.length; i++) {
        const body = state.bodies[i];
        body.x_au = positions[i * 3];
        body.y_au = positions[i * 3 + 1];
        body.z_au = positions[i * 3 + 2];
        body.dist_au = Math.hypot(body.x_au, body.y_au, body.z_au);
      }
    } else {
      const snap = systemSnapshot(state.renderUnix);
      state.bodies = snap.bodies || [];
      lastFullSnapshot = performance.now();
      // Orbit ellipses depend on the osculating elements, which only refresh here.
      buildSceneLines();
    }
  } catch (e) { console.error("orrery snapshot failed:", e); }
  buildDropLines();
  rebuildSmallBodies();
  // Refresh the text "Positions" list (a11y), throttled so animation doesn't thrash the DOM.
  const now = performance.now();
  if (now - lastPosUpdate > 800) { updateOrreryPositions(); lastPosUpdate = now; }
}

// Text alternative to the canvas (accessibility): every body's heliocentric distance + ecliptic
// longitude — the content the standalone top-down "Solar System" surface used to provide.
function updateOrreryPositions() {
  const list = document.getElementById("orreryPositions");
  if (!list) return;
  list.textContent = "";
  for (const b of state.bodies) {
    if (b.x_au == null || b.dist_au == null) continue;
    const lon = (((Math.atan2(b.y_au, b.x_au) * 180) / Math.PI) + 360) % 360;
    const row = document.createElement("div");
    row.className = "sky-row";
    row.textContent = `${b.name}: ${b.dist_au.toFixed(2)} AU from the Sun, ecliptic longitude ${lon.toFixed(0)}°`;
    list.appendChild(row);
  }
}

// STATIC line geometry: orbit ellipses (fixed per element refresh, ~1 Hz at most),
// the ecliptic grid, and the Sun-equator rings. The per-frame animation path never
// re-tessellates any of this — see buildDropLines for the only true per-frame lines.
function buildSceneLines() {
  if (!gl) return; // context lost mid-animation — tick()/handlers survive until restore
  const v = []; sceneRanges = [];
  const push = (pts, col, mode) => {
    const first = v.length / 6; for (const p of pts) v.push(p[0], p[1], p[2], col[0], col[1], col[2]);
    sceneRanges.push({ first, count: pts.length, mode });
  };
  if (state.showOrbits) {
    for (const b of state.bodies) {
      if (b.a_au == null) continue;
      const c = BODY[b.name] ? BODY[b.name].color : [1, 1, 1];
      push(ellipse3d(b), [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], "strip");
    }
  }
  // Dwarf-planet + comet orbits — the illustrative small-body layer, drawn dimmer than the planets.
  if (state.showSmall && state.showOrbits) {
    for (const d of DWARFS) push(ellipse3d(asOrbit(d)), [d.col[0] * 0.4, d.col[1] * 0.4, d.col[2] * 0.45], "strip");
    for (const c of COMETS) push(ellipse3d(asOrbit(c)), [0.34, 0.5, 0.62], "strip");
  }
  // ecliptic reference plane: concentric rings + spokes
  const G = [0.18, 0.22, 0.30];
  for (const rad of [1, 5, 10, 20, 30]) {
    const ring = []; for (let k = 0; k <= 96; k++) { const a = (k / 96) * 2 * Math.PI; ring.push([Math.cos(a) * rad, Math.sin(a) * rad, 0]); }
    push(ring, G, "strip");
  }
  for (let s = 0; s < 12; s++) { const a = (s / 12) * 2 * Math.PI; push([[0, 0, 0], [Math.cos(a) * 31, Math.sin(a) * 31, 0]], G, "lines"); }

  // The Sun's equatorial plane — tilted 7.25° to the ecliptic (its spin axis is the real IAU pole).
  // Gold rings + the spin axis make the offset between the Sun's equator and the planets' plane explicit.
  if (state.showSunEq) {
    const pole = norm(poleVector(BODY.Sun));
    let u = norm(cross([0, 0, 1], pole)); if (!isFinite(u[0]) || u[0] * u[0] + u[1] * u[1] + u[2] * u[2] < 1e-9) u = [1, 0, 0];
    const vv = cross(pole, u);
    const GOLD = [0.52, 0.40, 0.13];
    for (const rad of [1, 5, 10, 20, 30]) {
      const ring = [];
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * 2 * Math.PI, cs = Math.cos(a) * rad, sn = Math.sin(a) * rad;
        ring.push([u[0] * cs + vv[0] * sn, u[1] * cs + vv[1] * sn, u[2] * cs + vv[2] * sn]);
      }
      push(ring, GOLD, "strip");
    }
    push([[-pole[0] * 1.7, -pole[1] * 1.7, -pole[2] * 1.7], [pole[0] * 1.7, pole[1] * 1.7, pole[2] * 1.7]], [0.85, 0.62, 0.22], "lines");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, sceneLineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
}

// The ONLY per-frame line geometry: one drop-line per body from its position to the
// ecliptic plane (2 points each — trivial next to the ~2k vertices the old combined
// rebuild re-tessellated and re-uploaded every animation frame).
function buildDropLines() {
  if (!gl) return;
  const v = []; dropRanges = [];
  let first = 0;
  for (const b of state.bodies) {
    if (b.x_au == null) continue;
    for (const pt of [[b.x_au, b.y_au, b.z_au], [b.x_au, b.y_au, 0]]) {
      v.push(pt[0], pt[1], pt[2], 0.42, 0.47, 0.58);
    }
    dropRanges.push({ first, count: 2, mode: "lines" });
    first += 2;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, dropLineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STREAM_DRAW);
}

function displayRadiusAU(name) {
  const phys = BODY[name];
  if (state.trueScale) return (phys.radiusKm / AU_KM) * state.exaggeration;
  let r = (VIS_RADIUS_AU[name] || 0.05) * state.exaggeration;
  // Keep the (exaggerated) Sun comfortably inside Mercury's perihelion (~0.31 AU) so no planet ever
  // renders inside the solar disc — the Sun is the one body whose true size dwarfs the inner orbits.
  if (name === "Sun") r = Math.min(r, 0.22);
  return r;
}

function bodyWorldPos(b) {
  if (b.name === "Sun") return [0, 0, 0];
  if (b.name === "Moon") return moonDisplayPos(b);
  return [b.x_au, b.y_au, b.z_au];
}

// The Moon sits ~0.0026 AU from Earth — invisible beside Earth's exaggerated "visible" disc. Keep
// its real direction & phase, but in visible mode push it just clear of Earth's enlarged sphere.
function moonDisplayPos(moon) {
  const earth = state.bodies.find((x) => x.name === "Earth");
  if (!earth) return [moon.x_au, moon.y_au, moon.z_au];
  const e = [earth.x_au, earth.y_au, earth.z_au];
  const off = [moon.x_au - e[0], moon.y_au - e[1], moon.z_au - e[2]];
  const len = Math.hypot(off[0], off[1], off[2]) || 1e-9;
  if (state.trueScale) return [moon.x_au, moon.y_au, moon.z_au];
  const sep = displayRadiusAU("Earth") * 2.4 + displayRadiusAU("Moon") * 1.5;
  const k = Math.max(len, sep) / len;
  return [e[0] + off[0] * k, e[1] + off[1] * k, e[2] + off[2] * k];
}

function ensureSized(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return [w, h];
}

// The point the orbit camera looks at: the Sun (origin), the selected anchor body, or the origin in
// galaxy mode. In galaxy mode the solar anchors don't apply.
function anchorPos() {
  if (state.galaxy || state.anchor === "Sun" || !state.anchor) return [0, 0, 0];
  const b = state.bodies.find((x) => x.name === state.anchor);
  return b ? bodyWorldPos(b) : [0, 0, 0];
}

// Free-fly forward direction from yaw (about world +z) and pitch.
function flyForward() {
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch), cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
  return [cp * cy, cp * sy, sp];
}

// The orbit camera's eye position (used to seed free-fly so toggling it never jumps).
function orbitEye() {
  const t = anchorPos();
  return [t[0] + state.radius * Math.cos(state.el) * Math.cos(state.az),
    t[1] + state.radius * Math.cos(state.el) * Math.sin(state.az),
    t[2] + state.radius * Math.sin(state.el)];
}

function cameraMatrices(w, h) {
  let eye, view;
  if (state.freeFly) {
    eye = state.freePos;
    const fwd = flyForward();
    view = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 0, 1]);
  } else if (state.topDown && !state.galaxy) {
    // Straight down onto the ecliptic — the top-down orbit map. Drag (az) spins the map; el is unused.
    const t = anchorPos();
    eye = [t[0], t[1], t[2] + state.radius];
    view = lookAt(eye, t, [Math.sin(state.az), Math.cos(state.az), 0]);
  } else {
    const t = anchorPos();
    eye = orbitEye();
    view = lookAt(eye, t, [0, 0, 1]);
  }
  const proj = perspective(FOVY, w / h, 0.008, 800);
  const vp = mul(proj, view);
  const skyView = view.slice(); skyView[12] = 0; skyView[13] = 0; skyView[14] = 0;
  const skyVp = mul(proj, skyView);
  return { eye, vp, skyVp };
}

// Draw the belts (additive dust) and the dwarf/comet/probe markers (alpha), depth-tested with the scene.
function drawSmallBodies(vp, dpr) {
  if (!state.showSmall || !belts) return;
  gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive — the belts read as faint dust
  drawPoints(celBufs.beltA, belts.asteroid.count, vp, dpr, 0.9);
  drawPoints(celBufs.beltK, belts.kuiper.count, vp, dpr, 0.9);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // solid markers so their colour reads
  drawPoints(celBufs.smallMark, celBufs.smallMarkCount || 0, vp, dpr, 0.85);
  gl.depthMask(true);
}

// ---------------------------------------------------------------- draw
function paint() {
  if (!state.active || !gl || gl.isContextLost()) return;
  const canvas = document.getElementById("orreryCanvas");
  if (!canvas || canvas.clientWidth === 0) return;
  const [w, h] = ensureSized(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { eye, vp, skyVp } = cameraMatrices(w, h);

  if (state.galaxy) { paintGalaxy(w, h, dpr, vp, eye); return; }

  gl.viewport(0, 0, w, h);
  gl.clearColor(0.004, 0.006, 0.016, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ---- sky backdrop (no depth) ----
  if (state.showSky) {
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
    drawPoints(celBufs.mw, celBufs.mwCount, skyVp, dpr, 1.0);
    drawPoints(celBufs.bg, celBufs.bgCount, skyVp, dpr, 0.7);
    if (state.showConst) {
      gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, new Float32Array(skyVp)); gl.uniform1f(P.lineU.u_alpha, 0.5);
      bindLine(celBufs.constLine); gl.drawArrays(gl.LINES, 0, celBufs.constCount);
    }
    drawPoints(celBufs.bright, celBufs.brightCount, skyVp, dpr, 0.8);
    drawPoints(celBufs.marker, celBufs.markerCount, skyVp, dpr, 0.85);
  }

  // ---- scene: orbits + grid ----
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, new Float32Array(vp)); gl.uniform1f(P.lineU.u_alpha, 0.55);
  bindLine(sceneLineBuf);
  for (const r of sceneRanges) gl.drawArrays(r.mode === "lines" ? gl.LINES : gl.LINE_STRIP, r.first, r.count);
  bindLine(dropLineBuf);
  for (const r of dropRanges) gl.drawArrays(gl.LINES, r.first, r.count);
  gl.depthMask(true);

  // ---- small bodies: the asteroid + Kuiper belts and the dwarf/comet/probe markers ----
  drawSmallBodies(vp, dpr);

  // ---- bodies (lit spheres) ----
  for (const name of DRAW_LIST) {
    const b = name === "Sun" ? { name: "Sun" } : state.bodies.find((x) => x.name === name);
    if (!b) continue;
    drawBody(b, vp, eye);
  }

  // ---- Sun corona + solar wind ----
  drawSun(vp, eye, w, h);

  updateLabels(canvas, vp, skyVp);
  gl.disable(gl.BLEND);
}

function bindLine(buf) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
}

function drawPoints(buf, count, vp, dpr, soft, shearT = 0) {
  if (!count) return;
  gl.useProgram(P.pt);
  gl.uniformMatrix4fv(P.ptU.u_vp, false, new Float32Array(vp));
  gl.uniform1f(P.ptU.u_dpr, dpr); gl.uniform1f(P.ptU.u_soft, soft);
  // Differential-rotation shear (galaxy disc only; shearT = galactic years). 0 ⇒ no rotation.
  gl.uniform1f(P.ptU.u_shearT, shearT); gl.uniform1f(P.ptU.u_shearK, GAL_SHEAR_K); gl.uniform1f(P.ptU.u_shearRc, GAL_SHEAR_RC);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.drawArrays(gl.POINTS, 0, count);
}

function drawBody(b, vp, eye) {
  const phys = BODY[b.name]; if (!phys) return;
  const pos = bodyWorldPos(b);
  const rEq = displayRadiusAU(b.name), rPol = rEq * (phys.polarKm / phys.radiusKm);
  const rot = iauRotation(phys, state.renderUnix);
  const model = mul(translate(pos), mul(rot, scaleM([rEq, rEq, rPol])));
  const mvp = mul(vp, model);
  const light = b.name === "Sun" ? [0, 0, 1] : norm([-pos[0], -pos[1], -pos[2]]);
  const atmo = atmoColor(b.name), atmoStr = atmoStrength(b.name);

  gl.useProgram(P.sphere);
  gl.uniformMatrix4fv(P.sphereU.u_mvp, false, new Float32Array(mvp));
  gl.uniformMatrix4fv(P.sphereU.u_model, false, new Float32Array(model));
  gl.uniformMatrix3fv(P.sphereU.u_nmat, false, new Float32Array(normalMat3(rot)));
  gl.uniform1i(P.sphereU.u_style, STYLE_ID[phys.style]);
  gl.uniform1i(P.sphereU.u_mode, b.name === "Sun" ? 1 : 0);
  gl.uniform1f(P.sphereU.u_time, state.renderUnix * 0.0002);
  gl.uniform3fv(P.sphereU.u_base, phys.color);
  gl.uniform3fv(P.sphereU.u_light, new Float32Array(light));
  gl.uniform3fv(P.sphereU.u_cam, new Float32Array(eye));
  gl.uniform3fv(P.sphereU.u_atmo, new Float32Array(atmo));
  gl.uniform1f(P.sphereU.u_atmoStr, atmoStr);
  const isSun = b.name === "Sun";
  const sunTexd = isSun && state.useTextures && sunTex.ready;
  const planetTexd = !isSun && state.useTextures && textures[b.name] && textures[b.name].ready;
  const useTex = sunTexd || planetTexd;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sunTexd ? sunTex.tex : (planetTexd ? textures[b.name].tex : whiteTex));
  gl.uniform1i(P.sphereU.u_tex, 0);
  gl.uniform1i(P.sphereU.u_useTex, useTex ? 1 : 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, sphere.pos);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); // normal == position
  gl.disableVertexAttribArray(2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.idx);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);
  gl.disable(gl.CULL_FACE);

  // atmosphere limb halo (additive shell, slightly larger, no depth write)
  if (atmoStr > 0 && b.name !== "Sun") {
    const sModel = mul(translate(pos), mul(rot, scaleM([rEq * 1.07, rEq * 1.07, rPol * 1.07])));
    gl.uniformMatrix4fv(P.sphereU.u_mvp, false, new Float32Array(mul(vp, sModel)));
    gl.uniformMatrix4fv(P.sphereU.u_model, false, new Float32Array(sModel));
    gl.uniform1i(P.sphereU.u_mode, 2);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.idx);
    gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // rings
  if (phys.rings) drawRing(b.name, phys, pos, rEq, rot, vp);
}

function drawRing(name, phys, pos, rEq, rot, vp) {
  if (!ringBufs[name] || Math.abs(ringBufs[name].rEq - rEq) > 1e-6) {
    const data = buildRing(phys.rings, rEq, phys.radiusKm);
    const buf = ringBufs[name] ? ringBufs[name].buf : gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    ringBufs[name] = { buf, count: data.length / 8, rEq };
  }
  // Only Saturn has a real ring photometry map; others use the vertex-coloured fallback.
  const useTex = state.useTextures && name === "Saturn" && ringTex.ready;
  const model = mul(translate(pos), rot);
  gl.useProgram(P.ring); gl.uniformMatrix4fv(P.ringU.u_mvp, false, new Float32Array(mul(vp, model)));
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, useTex ? ringTex.tex : whiteTex);
  gl.uniform1i(P.ringU.u_tex, 0); gl.uniform1i(P.ringU.u_useTex, useTex ? 1 : 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, ringBufs[name].buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
  gl.disable(gl.CULL_FACE);
  gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, ringBufs[name].count); gl.depthMask(true);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
}

function drawSun(vp, eye, w, h) {
  const rSun = displayRadiusAU("Sun");
  // corona: a camera-facing additive glow quad
  const fwd = norm(sub([0, 0, 0], eye));
  let right = norm(cross([0, 0, 1], fwd)); if (!isFinite(right[0])) right = [1, 0, 0];
  const up = cross(fwd, right);
  gl.useProgram(P.glow); gl.uniformMatrix4fv(P.glowU.u_vp, false, new Float32Array(vp));
  gl.uniform3fv(P.glowU.u_center, new Float32Array([0, 0, 0]));
  gl.uniform3fv(P.glowU.u_right, new Float32Array(right)); gl.uniform3fv(P.glowU.u_up, new Float32Array(up));
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  gl.uniform3fv(P.glowU.u_color, new Float32Array([1.0, 0.85, 0.5])); gl.uniform1f(P.glowU.u_size, rSun * 2.6); gl.uniform1f(P.glowU.u_pow, 2.8);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.uniform3fv(P.glowU.u_color, new Float32Array([1.0, 0.55, 0.2])); gl.uniform1f(P.glowU.u_size, rSun * 4.8); gl.uniform1f(P.glowU.u_pow, 4.2);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // solar wind particles
  if (particles) drawPoints(celBufs.wind, particles.N, vp, Math.min(window.devicePixelRatio || 1, 2), 0.9);

  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function atmoColor(name) {
  return ({ Venus: [0.95, 0.85, 0.55], Earth: [0.35, 0.6, 1.0], Mars: [0.7, 0.5, 0.4],
    Jupiter: [0.9, 0.8, 0.6], Saturn: [0.9, 0.85, 0.6], Uranus: [0.6, 0.9, 0.95], Neptune: [0.4, 0.6, 1.0] }[name]) || [0, 0, 0];
}
function atmoStrength(name) {
  return ({ Venus: 0.9, Earth: 0.7, Mars: 0.18, Jupiter: 0.5, Saturn: 0.45, Uranus: 0.5, Neptune: 0.5 }[name]) || 0;
}

// ---------------------------------------------------------------- galactic-scale view
function drawGalaxyMarker(vp, eye, center, color, size) {
  const fwd = norm(sub(center, eye));
  let right = norm(cross([0, 0, 1], fwd)); if (!isFinite(right[0])) right = [1, 0, 0];
  const up = cross(fwd, right);
  gl.useProgram(P.glow); gl.uniformMatrix4fv(P.glowU.u_vp, false, new Float32Array(vp));
  gl.uniform3fv(P.glowU.u_center, new Float32Array(center));
  gl.uniform3fv(P.glowU.u_right, new Float32Array(right)); gl.uniform3fv(P.glowU.u_up, new Float32Array(up));
  gl.uniform3fv(P.glowU.u_color, new Float32Array(color)); gl.uniform1f(P.glowU.u_size, size); gl.uniform1f(P.glowU.u_pow, 2.0);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// The arc of the Sun's galactic orbit traversed since "Now" — a gold trail behind the moving Sun
// (capped at one full lap). Built each frame on a dynamic line buffer.
function drawGalaxyTrail(vp) {
  const swept = GAL_OMEGA * state.galYears;
  if (Math.abs(swept) < 1e-4) return;
  const span = Math.min(Math.abs(swept), 2 * Math.PI);
  const sign = swept >= 0 ? 1 : -1;
  const base = GAL_THETA0 - GAL_OMEGA * state.offsetYears; // azimuth at galYears = 0
  const n = Math.max(2, Math.round((span / (2 * Math.PI)) * 160));
  const v = [];
  for (let i = 0; i <= n; i++) {
    const th = base - sign * span * (i / n); // i=0 at the start, i=n at the Sun's current azimuth
    v.push(GAL_SUN_R * Math.cos(th), GAL_SUN_R * Math.sin(th), 0, 0.95, 0.80, 0.35);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galTrail);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
  gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, new Float32Array(vp)); gl.uniform1f(P.lineU.u_alpha, 0.9);
  bindLine(celBufs.galTrail); gl.drawArrays(gl.LINE_STRIP, 0, n + 1);
}

function paintGalaxy(w, h, dpr, vp, eye) {
  if (state.localView) { paintNeighbourhood(w, h, dpr, vp, eye); return; }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.003, 0.004, 0.011, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
  // galactocentric reference rings (Sun's orbit highlighted)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, new Float32Array(vp)); gl.uniform1f(P.lineU.u_alpha, 0.5);
  bindLine(celBufs.galGuide);
  for (const r of galaxy.ranges) gl.drawArrays(gl.LINE_STRIP, r.first, r.count);
  drawGalaxyTrail(vp); // the arc of orbit the Sun has travelled since "Now"
  // ~8,600 disc/arm/bulge stars, additive — sheared by differential rotation over the galactic clock.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  drawPoints(celBufs.galaxy, celBufs.galaxyCount, vp, dpr, 0.9, state.galYears);
  // The REAL naked-eye catalogue at its true galactic positions: a compact bright halo
  // hugging the Sun's marker, because nearly every star you can see by eye is within
  // ~2,000 ly. It rides the sheared disc like everything else.
  drawPoints(celBufs.catStars, celBufs.catStarsCount || 0, vp, dpr, 0.85, state.galYears);
  // deep-sky landmarks (nebulae, pulsars, black holes, nearby stars…), colour-coded by type
  if (state.galDeepSky) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawPoints(celBufs.galObj, celBufs.galObjCount || 0, vp, dpr, 0.85, state.galYears); // co-rotate with the disc
  }
  // the galactic centre (gold) and the Sun (cyan-white "you are here")
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  drawGalaxyMarker(vp, eye, [0, 0, 0], [1.0, 0.78, 0.32], 1.2);
  drawGalaxyMarker(vp, eye, galaxy.sunPos, [0.55, 0.95, 1.0], 0.55);
  const canvas = document.getElementById("orreryCanvas");
  updateLabels(canvas, vp, vp);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
}

// The solar neighbourhood: the same real catalogue at light-year scale, Sun at the
// origin. Every star sits at its Hipparcos-parallax 3-D position (heliocentric galactic
// frame, +x toward the galactic centre); size encodes intrinsic luminosity, colour B−V.
// No differential-rotation shear here — at this scale the neighbourhood co-moves.
function paintNeighbourhood(w, h, dpr, vp, eye) {
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.003, 0.004, 0.011, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, new Float32Array(vp)); gl.uniform1f(P.lineU.u_alpha, 0.45);
  bindLine(celBufs.nbhdGuide);
  for (const r of nbhd.ranges) gl.drawArrays(gl.LINE_STRIP, r.first, r.count);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  drawPoints(celBufs.nbhd, celBufs.nbhdCount || 0, vp, dpr, 0.85);
  drawGalaxyMarker(vp, eye, [0, 0, 0], [0.55, 0.95, 1.0], 0.16);
  const canvas = document.getElementById("orreryCanvas");
  updateLabels(canvas, vp, vp);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
}

// ---------------------------------------------------------------- DOM labels
const labelEls = [];
function updateLabels(canvas, vp, skyVp) {
  const host = document.getElementById("orreryLabels"); if (!host) return;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  host.style.left = canvas.offsetLeft + "px"; host.style.top = canvas.offsetTop + "px";
  host.style.width = cw + "px"; host.style.height = ch + "px";
  const items = [];
  if (state.galaxy && state.localView) {
    items.push({ name: "☉ Sun — 0 ly", p: [0, 0, 0], cls: "orrery-label sky-star" });
    for (const r of nbhd.ringLabels) items.push({ name: r.name, p: r.p, cls: "orrery-label sky-galaxy" });
    // Named stars, nearest first; cap by zoom so close-in exploration stays readable.
    const maxLabels = state.radius < 4 ? 40 : state.radius < 12 ? 26 : 16;
    for (const s of nbhd.named.slice(0, maxLabels)) items.push({ name: s.name, p: s.p, cls: "orrery-label sky-star" });
  } else if (state.galaxy) {
    for (const it of galaxy.labels) items.push({ name: it.name, p: it.p, cls: it.name.startsWith("☉") ? "orrery-label sky-star" : "orrery-label sky-galaxy" });
    // Deep-sky landmark labels appear once you zoom in toward the Sun's region (they cluster near it).
    if (state.galDeepSky && state.radius < 70) {
      for (const o of galObjects) items.push({ name: o.name, p: galShear(o.pos, state.galYears), cls: "orrery-label sky-galaxy" });
    }
  } else {
    for (const name of DRAW_LIST) {
      const b = name === "Sun" ? { name: "Sun" } : state.bodies.find((x) => x.name === name);
      if (!b) continue;
      items.push({ name, p: bodyWorldPos(b), cls: "orrery-label" });
    }
    if (state.showSmall) {
      for (const s of smallBodies) items.push({ name: s.name, p: s.pos, cls: s.kind === "probe" ? "orrery-label sky-pulsar" : "orrery-label sky-galaxy" });
    }
    if (state.showSunEq) {
      const pole = norm(poleVector(BODY.Sun));
      items.push({ name: "Sun's axis · 7.25° tilt", p: [pole[0] * 1.7, pole[1] * 1.7, pole[2] * 1.7], cls: "orrery-label sky-galaxy" });
    }
    if (state.showLabels && state.showSky) {
      for (const pl of cel.pulsars) items.push({ name: "⊛ " + pl.name, p: pl.pos, cls: "orrery-label sky-pulsar", sky: true });
      for (const g of cel.deepsky) items.push({ name: g.name, p: g.pos, cls: "orrery-label sky-galaxy", sky: true });
      for (const s of cel.brightStars) if (s.m < 0.6) items.push({ name: s.name, p: s.pos, cls: "orrery-label sky-star", sky: true });
    }
  }
  while (labelEls.length < items.length) { const e = document.createElement("span"); host.appendChild(e); labelEls.push(e); }
  for (let i = 0; i < labelEls.length; i++) {
    const el = labelEls[i];
    if (i >= items.length) { el.style.display = "none"; continue; }
    const it = items[i], m = it.sky ? skyVp : vp;
    const x = m[0] * it.p[0] + m[4] * it.p[1] + m[8] * it.p[2] + m[12];
    const y = m[1] * it.p[0] + m[5] * it.p[1] + m[9] * it.p[2] + m[13];
    const wv = m[3] * it.p[0] + m[7] * it.p[1] + m[11] * it.p[2] + m[15];
    if (wv <= 0.0001) { el.style.display = "none"; continue; }
    const sx = (x / wv * 0.5 + 0.5) * cw, sy = (1 - (y / wv * 0.5 + 0.5)) * ch;
    if (sx < -40 || sx > cw + 40 || sy < 0 || sy > ch) { el.style.display = "none"; continue; }
    el.style.display = "block"; el.className = it.cls; el.style.left = sx + "px"; el.style.top = sy + "px";
    if (el.textContent !== it.name) el.textContent = it.name;
  }
}

// ---------------------------------------------------------------- detail panel
// (The facts card itself is built by orreryDetail.js; this wrapper just supplies the
// body's live snapshot row.)
function showDetail(name) {
  renderDetail(name, state.bodies.find((b) => b.name === name));
}

// ---------------------------------------------------------------- animation loop
let rafId = 0;
function tick(now) {
  if (!state.active) { rafId = 0; return; }
  const dt = state.lastTick ? Math.min(0.05, (now - state.lastTick) / 1000) : 0.016;
  state.lastTick = now;
  if (state.animate) {
    if (state.galaxy) {
      // The galactic clock only runs while the disc view is showing it. The Solar
      // neighbourhood is static (co-moving, J2000 epoch) and ignores galYears — letting
      // the clock tick invisibly there would jump the Sun/trail/disc by tens of Myr the
      // moment the user returns to the disc.
      if (!state.localView) {
        state.galYears += dt * galYearsPerSec(); // the Sun travels its galactic orbit as time runs
        updateGalaxySun();
      }
    } else {
      state.simElapsed += dt * state.yearsPerSec * YR; // YR seconds per sim-year ⇒ visible outer-planet motion
      state.renderUnix = effectiveBaseUnix() + state.simElapsed;
      rebuildPositions();
      stepParticles(dt);
    }
  }
  if (state.freeFly) flyStep(dt);
  paint();
  // Idle when nothing advances frame-to-frame: with Animate off (and no free-fly) the loop
  // used to keep re-tessellating and repainting the full scene at 60 fps forever. All the
  // input handlers already paint on demand in that state; they/startLoop re-arm the loop.
  if (state.animate || state.freeFly) {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = 0;
  }
}
function startLoop() { if (!rafId) { state.lastTick = 0; rafId = requestAnimationFrame(tick); } }

// Integrate free-fly movement from held keys (WASD = move, Q/E or R/F = down/up, Shift = boost).
function flyStep(dt) {
  const K = state.keys;
  const fwd = flyForward();
  const right = norm(cross(fwd, [0, 0, 1]));
  const up = [0, 0, 1];
  let v = [0, 0, 0], moving = false;
  if (K.has("w")) { v = add(v, fwd); moving = true; }
  if (K.has("s")) { v = sub(v, fwd); moving = true; }
  if (K.has("d")) { v = add(v, right); moving = true; }
  if (K.has("a")) { v = sub(v, right); moving = true; }
  if (K.has("e") || K.has("r")) { v = add(v, up); moving = true; }
  if (K.has("q") || K.has("f")) { v = sub(v, up); moving = true; }
  if (moving) {
    const s = state.flySpeed * (K.has("shift") ? 6 : 1) * dt;
    const n = norm(v);
    state.freePos = [state.freePos[0] + n[0] * s, state.freePos[1] + n[1] * s, state.freePos[2] + n[2] * s];
  }
}

// Switch the orbit anchor (focus). Re-frames the camera at a distance suited to that body's size.
function setAnchor(name) {
  state.anchor = name;
  if (name !== "Sun") { state.radius = Math.max(1.2, displayRadiusAU(name) * 14); state.selected = name; showDetail(name); }
  else state.radius = 26;
  paint();
}

// The Time-speed slider serves both views at very different scales, so reconfigure it per mode:
// solar-system = years/sec (orbital motion); galaxy = millions of years/sec (the galactic clock).
function setSpeedSliderMode(galaxy) {
  const s = /** @type {HTMLInputElement|null} */ (document.getElementById("orrerySpeed"));
  const lbl = document.getElementById("orrerySpeedLabel");
  if (!s) return;
  if (galaxy) {
    s.min = "0.1"; s.max = "50"; s.step = "0.1"; s.value = String(state.galSpeed);
    s.setAttribute("aria-label", "galactic time speed (millions of years per second)");
    if (lbl) lbl.textContent = "Galactic time (Myr / sec)";
  } else {
    s.min = "0.02"; s.max = "5"; s.step = "0.02"; s.value = String(state.yearsPerSec);
    s.setAttribute("aria-label", "animation time speed (years per second)");
    if (lbl) lbl.textContent = "Time speed (years / sec)";
  }
}

// Toggle the free-fly camera, seeding its position/orientation from the current orbit view so the
// transition is seamless, and back again.
function setFreeFly(on) {
  state.freeFly = on;
  const hint = document.getElementById("orreryInsight");
  if (on) {
    const eye = orbitEye(), t = anchorPos();
    state.freePos = eye.slice();
    const dir = norm(sub(t, eye));
    state.yaw = Math.atan2(dir[1], dir[0]);
    state.pitch = Math.max(-1.5, Math.min(1.5, Math.asin(dir[2])));
    const c = document.getElementById("orreryCanvas"); if (c) c.focus();
    startLoop(); // free-fly integrates held keys per frame, so the loop must run even with Animate off
    if (hint) hint.textContent = "Free-fly camera: click the view, then W/A/S/D to move, R/F (or E/Q) for up/down, Shift to boost, drag to look, scroll to thrust forward. Untick Free fly to return to orbit.";
  } else if (hint) {
    hint.textContent = "Lit, textured worlds at their true VSOP2013 positions — real NASA surface maps, correct sizes, axial tilts, sidereal spin, rings, the Moon beside Earth, an animated Sun, and the real sky behind them. Drag to orbit, scroll to zoom, click a body to inspect it. Keyboard: arrows orbit, +/− zoom.";
  }
  paint();
}

// ---------------------------------------------------------------- lifecycle
export async function enterOrrery() {
  // Idempotent against overlapping calls: enter is async (WASM load + GL init), so a
  // double-invocation could race two initGL passes. app.js always leaves before entering,
  // but the boot router and future callers shouldn't have to know that.
  if (state.entering) return;
  state.entering = true;
  try {
    await enterOrreryInner();
  } finally {
    state.entering = false;
  }
}

async function enterOrreryInner() {
  state.active = true;
  const canvas = document.getElementById("orreryCanvas"); if (!canvas) return;
  // Clear a possible showFallback() hide — but ONLY clear. Setting an inline
  // display:block here permanently overrode the CSS that hides this canvas on the other
  // surfaces (body[data-surface] rules), so one visit to the 3-D view left a stale WebGL
  // frame corrupting the Sun surface's layout for the rest of the session.
  canvas.style.display = "";
  try {
    // Fetch the star catalogue alongside the WASM engine — two parallel loads, both
    // needed only by this surface, neither on the app's first-paint path.
    const starCatPromise = starCat ? null : import("./starcatalog.js?v=78434029fa");
    await loadSkyEngine();
    if (starCatPromise) starCat = await starCatPromise;
    if (!gl) {
      const res = initGL(canvas);
      if (!res) { showFallback("WebGL2 is unavailable — try a recent Chrome, Edge, Firefox, or Safari."); return; }
      state.backend = "WebGL2/ANGLE" + res.label.replace("WebGL2", "");
      const node = document.getElementById("orreryBackend");
      if (node) node.textContent = "Rendering on " + res.label;
      initParticles();
    }
    loadTextures();
    setSpeedSliderMode(state.galaxy);
    state.renderUnix = effectiveBaseUnix() + state.simElapsed;
    rebuildPositions();
    showDetail(state.selected);
    updateOrreryAccuracy();
    paint();
    startLoop();
  } catch (e) { showFallback("3-D view failed to initialise: " + e.message); console.error(e); }
}
export function leaveOrrery() {
  state.active = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
}
function showFallback(msg) {
  const node = document.getElementById("orreryInsight"); if (node) node.textContent = msg;
  const canvas = document.getElementById("orreryCanvas"); if (canvas) canvas.style.display = "none";
  // Keep the text alternative alive: the "Positions" list needs only the ephemeris engine,
  // not WebGL — it used to stay empty after a GL failure, leaving a fully dead panel.
  try {
    const snap = systemSnapshot(Date.now() / 1000);
    state.bodies = snap.bodies || [];
    updateOrreryPositions();
  } catch (_) { /* engine unavailable too — nothing to show */ }
}

// ---------------------------------------------------------------- interaction
(function attach() {
  const canvas = document.getElementById("orreryCanvas"); if (!canvas) return;
  canvas.tabIndex = 0;
  // Respect the OS motion preference: the 3-D surface must not auto-animate full-viewport
  // for users who asked for reduced motion. The Animate checkbox re-enables it explicitly.
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    state.animate = false;
    const cb = /** @type {HTMLInputElement|null} */ (document.getElementById("orreryAnimate"));
    if (cb) cb.checked = false;
  }
  const clampR = (r) => Math.max(0.6, Math.min(160, r));
  const pointers = new Map(); let lx = 0, ly = 0, pinch = 0, downX = 0, downY = 0, moved = false;
  const spread = () => { const p = [...pointers.values()]; return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0; };

  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); lx = e.clientX; ly = e.clientY;
    downX = e.clientX; downY = e.clientY; moved = false;
    if (pointers.size === 2) pinch = spread();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const drop = (e) => {
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    // Ending a pinch: re-anchor the drag origin to the surviving finger, or its next
    // pointermove computed dx against a pre-pinch position and whipped the camera.
    if (pointers.size === 1) {
      const p = pointers.values().next().value;
      lx = p.x; ly = p.y;
      pinch = 0;
    }
  };
  canvas.addEventListener("pointerup", (e) => { if (!moved) pick(e); drop(e); });
  canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      moved = true; // a pinch is a gesture, not a tap — lifting a finger must not trigger pick()
      const d = spread(); if (pinch > 0 && d > 0) { state.radius = clampR(state.radius * (pinch / d)); pinch = d; if (!state.animate) paint(); }
      return;
    }
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    if (state.freeFly) { // drag = mouse-look
      state.yaw -= dx * 0.005;
      state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch - dy * 0.005));
    } else {
      state.az -= dx * 0.008;
      state.el = Math.max(-1.45, Math.min(1.45, state.el + dy * 0.008));
    }
    lx = e.clientX; ly = e.clientY; if (!state.animate) paint();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (state.freeFly) { const f = flyForward(); const s = Math.sign(e.deltaY) * -0.5 * (e.shiftKey ? 4 : 1); state.freePos = add(state.freePos, [f[0] * s, f[1] * s, f[2] * s]); }
    else state.radius = clampR(state.radius * (1 + Math.sign(e.deltaY) * 0.12));
    if (!state.animate) paint();
  }, { passive: false });
  canvas.addEventListener("keydown", (e) => {
    if (state.freeFly) {
      const k = e.key.toLowerCase();
      if ("wasdqerf".includes(k) || k === "shift") { state.keys.add(k); e.preventDefault(); return; }
      // arrows also steer the look in free-fly
      if (e.key === "ArrowLeft") state.yaw += 0.06; else if (e.key === "ArrowRight") state.yaw -= 0.06;
      else if (e.key === "ArrowUp") state.pitch = Math.min(1.5, state.pitch + 0.06); else if (e.key === "ArrowDown") state.pitch = Math.max(-1.5, state.pitch - 0.06);
      else return;
      e.preventDefault(); return;
    }
    let used = true;
    if (e.key === "ArrowLeft") state.az -= 0.1; else if (e.key === "ArrowRight") state.az += 0.1;
    else if (e.key === "ArrowUp") state.el = Math.min(1.45, state.el + 0.1); else if (e.key === "ArrowDown") state.el = Math.max(-1.45, state.el - 0.1);
    else if (e.key === "+" || e.key === "=" || e.key === "]") state.radius = clampR(state.radius * 0.88);
    else if (e.key === "-" || e.key === "_" || e.key === "[") state.radius = clampR(state.radius * 1.13);
    else used = false;
    if (used) { e.preventDefault(); if (!state.animate) paint(); }
  });
  canvas.addEventListener("keyup", (e) => { state.keys.delete(e.key.toLowerCase()); });
  canvas.addEventListener("blur", () => state.keys.clear());

  function pick(e) {
    if (state.galaxy) return;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left), py = (e.clientY - rect.top);
    const [w, h] = [canvas.clientWidth, canvas.clientHeight];
    const { vp } = cameraMatrices(canvas.width, canvas.height);
    let best = null;
    for (const name of DRAW_LIST) {
      const b = name === "Sun" ? { name: "Sun" } : state.bodies.find((x) => x.name === name);
      if (!b) continue;
      const p = bodyWorldPos(b);
      const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
      const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
      const wv = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      if (wv <= 0) continue;
      const sx = (x / wv * 0.5 + 0.5) * w, sy = (1 - (y / wv * 0.5 + 0.5)) * h;
      const d = Math.hypot(sx - px, sy - py);
      if (d < 34 && (!best || d < best.d)) best = { d, name };
    }
    state.selected = best ? best.name : null;
    showDetail(state.selected);
    if (!state.animate) paint();
  }

  const bind = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
  bind("orreryTime", "input", (e) => { state.offsetYears = Number(e.target.value); state.simElapsed = 0; state.renderUnix = effectiveBaseUnix(); rebuildPositions(); if (state.galaxy) updateGalaxySun(); showDetail(state.selected); updateOrreryAccuracy(); paint(); });
  bind("orreryNow", "click", () => { state.offsetYears = 0; state.simElapsed = 0; state.galYears = 0; const s = document.getElementById("orreryTime"); if (s) s.value = "0"; state.renderUnix = effectiveBaseUnix(); rebuildPositions(); updateGalaxySun(); showDetail(state.selected); updateOrreryAccuracy(); paint(); });
  // drawRing already detects a radius change and re-uploads into the SAME buffer, so no
  // ringBufs reset here — nuking the map on every slider input orphaned up to three ~1.3 MB
  // GPU buffers per event without gl.deleteBuffer.
  bind("orrerySize", "input", (e) => { state.exaggeration = Number(e.target.value); paint(); });
  bind("orreryTrueScale", "change", (e) => { state.trueScale = e.target.checked; paint(); });
  bind("orreryAnimate", "change", (e) => { state.animate = e.target.checked; if (state.animate) startLoop(); else paint(); });
  bind("orrerySpeed", "input", (e) => { const v = Number(e.target.value); if (state.galaxy) state.galSpeed = v; else state.yearsPerSec = v; });
  bind("orreryShowOrbits", "change", (e) => { state.showOrbits = e.target.checked; buildSceneLines(); paint(); });
  bind("orreryShowSky", "change", (e) => { state.showSky = e.target.checked; paint(); });
  bind("orreryShowConst", "change", (e) => { state.showConst = e.target.checked; paint(); });
  bind("orreryShowLabels", "change", (e) => { state.showLabels = e.target.checked; paint(); });
  bind("orreryShowSunEq", "change", (e) => { state.showSunEq = e.target.checked; buildSceneLines(); paint(); });
  bind("orreryShowSmall", "change", (e) => { state.showSmall = e.target.checked; buildSceneLines(); rebuildSmallBodies(); paint(); });
  bind("orreryDeepSky", "change", (e) => { state.galDeepSky = e.target.checked; paint(); });
  bind("orreryTextures", "change", (e) => { state.useTextures = e.target.checked; paint(); });
  bind("orreryTopDown", "change", (e) => {
    state.topDown = e.target.checked;
    if (state.topDown) { state.preTopRadius = state.radius; state.radius = 78; } // frame the whole system from above
    else if (state.preTopRadius) { state.radius = state.preTopRadius; }
    paint();
  });
  bind("orreryAnchor", "change", (e) => { if (!state.freeFly) setAnchor(e.target.value); else state.anchor = e.target.value; });
  bind("orreryFreeFly", "change", (e) => setFreeFly(e.target.checked));
  bind("orreryGalaxy", "click", () => {
    state.galaxy = !state.galaxy;
    if (state.localView) { state.localView = false; const lb = document.getElementById("orreryLocal"); if (lb) lb.textContent = "Solar neighbourhood (ly scale)"; }
    if (state.freeFly) { state.freeFly = false; const ff = document.getElementById("orreryFreeFly"); if (ff) ff.checked = false; }
    const btn = document.getElementById("orreryGalaxy");
    const insight = document.getElementById("orreryInsight");
    setSpeedSliderMode(state.galaxy);
    if (state.galaxy) {
      state.savedRadius = state.radius; state.radius = 118; state.el = 0.95;
      updateGalaxySun();
      if (btn) btn.textContent = "← Back to the Solar System";
      if (insight) insight.textContent = "The Milky Way, face-on. The Sun (cyan) orbits the galactic centre (gold) at ~8.2 kpc — about 26,700 light-years out, in the Orion Spur between the Sagittarius and Perseus arms. One lap is a ~220-million-year “galactic year.” Press Animate: the Time-speed slider runs galactic time, the gold trail marks the Sun's path, and the disc rotates DIFFERENTIALLY — inner stars orbit faster than outer ones, so over a few hundred Myr the arms shear and wind up. That “winding problem” is exactly why real spiral arms must be density waves, not fixed clumps of stars. (At this scale the ±5000-yr scrubber is a sub-pixel nudge.) Drag to rotate, scroll to zoom.";
    } else {
      state.radius = state.savedRadius; state.el = 0.45;
      if (btn) btn.textContent = "Zoom out to the Milky Way";
      if (insight) insight.textContent = "Lit, textured worlds at their true VSOP2013 positions — real NASA surface maps, correct sizes, axial tilts, sidereal spin, rings, the Moon beside Earth, an animated Sun, and the real sky behind them. Drag to orbit, scroll to zoom, click a body to inspect it. Keyboard: arrows orbit, +/− zoom.";
      rebuildPositions();
    }
    paint();
  });
  bind("orreryLocal", "click", () => {
    state.localView = !state.localView;
    if (state.freeFly) { state.freeFly = false; const ff = document.getElementById("orreryFreeFly"); if (ff) ff.checked = false; }
    const lb = document.getElementById("orreryLocal");
    const gb = document.getElementById("orreryGalaxy");
    const insight = document.getElementById("orreryInsight");
    if (state.localView) {
      if (!state.galaxy) { state.galaxy = true; state.savedRadius = state.radius; setSpeedSliderMode(true); if (gb) gb.textContent = "← Back to the Solar System"; }
      state.radius = 28; state.el = 0.5;
      if (lb) lb.textContent = "← Back to the Milky Way disc";
      if (insight) insight.textContent = "The solar neighbourhood at light-year scale — every naked-eye star (Hipparcos catalogue) at its REAL 3-D position from its measured parallax distance, Sun at the centre. +x points at the galactic centre; rings mark 10 / 25 / 50 / 100 / 250 light-years; size encodes intrinsic luminosity, colour the measured B−V temperature. Labels read “star · distance.” Positions are the J2000 epoch (proper motion is real but sub-pixel over the scrubber's ±5000 yr). Drag to rotate, scroll to zoom — Alpha Centauri is the label nearest the Sun.";
    } else {
      state.radius = 118; state.el = 0.95; // back out to the galaxy disc
      if (lb) lb.textContent = "Solar neighbourhood (ly scale)";
      updateGalaxySun();
      if (insight) insight.textContent = "The Milky Way, face-on — the Sun's real catalogued neighbours cluster in the bright halo around its marker (nearly everything you can see by eye is within ~2,000 ly). Zoom back into the Solar neighbourhood to resolve them, or press Animate to run galactic time.";
    }
    paint();
  });

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    // Everything GPU-side belongs to the dead context. The texture/ring caches MUST be
    // invalidated too: their `ready` flags used to survive the loss, so after a restore
    // drawBody bound dead textures (planets rendered flat, rings vanished) and
    // texturesStarted=true meant loadTextures() never re-fetched for the life of the tab.
    gl = null; P = {};
    textures = {}; sunTex = { ready: false, tex: null }; ringTex = { ready: false, tex: null };
    whiteTex = null; ringBufs = {}; texturesStarted = false; particles = null;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (!state.active) return;
    const c = document.getElementById("orreryCanvas");
    if (!initGL(c)) return;
    initParticles();
    loadTextures();
    rebuildPositions();
    buildSceneLines(); // the static geometry died with the old context
    paint();
    startLoop(); // the tick loop may have stopped while gl was null; re-arm it
  });
  // Repaint on any size change (DPI / window / layout) so ensureSized rebuilds the backing store at
  // full resolution — fires even when rAF is throttled (background tab), unlike the animation loop.
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (state.active) paint(); }).observe(canvas);
})();
