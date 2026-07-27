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

import { store } from "./store.js?v=ebbe92e1cf";
import { loadSkyEngine, systemSnapshot, systemPositions, SYSTEM_POSITIONS_ORDER } from "./skyEngine.js?v=ebbe92e1cf";
import { BODY, PLANET_ORDER, STYLE_ID, AU_KM, poleVector, equToEcl } from "./bodyData.js?v=ebbe92e1cf";
import { buildCelestial } from "./celestial.js?v=ebbe92e1cf";
import { DWARFS, COMETS, PROBES, asOrbit, bodyXYZ, probeXYZ, buildBelts } from "./smallbodies.js?v=ebbe92e1cf";
import { epochAccuracy, epochLabel } from "./accuracy.js?v=ebbe92e1cf";
import {
  perspective, lookAt, mul, sub, add, cross, dot, norm, translate, scaleM, normalMat3,
  iauRotation, buildSphere, buildRing, ringOpacityProfile, ellipse3d,
} from "./orreryMath.js?v=ebbe92e1cf";
import {
  SPHERE_VS, SPHERE_FS, LINE_VS, LINE_FS, RING_VS, RING_FS, PT_VS, PT_FS, GLOW_VS, GLOW_FS,
} from "./orreryShaders.js?v=ebbe92e1cf";
import {
  GAL_SUN_R, GAL_THETA0, GAL_OMEGA, GAL_SHEAR_K, GAL_SHEAR_RC,
  galShear, sunGalacticPos, buildGalaxyModel, buildGalObjectList,
  buildCatalogStarsGalactic, buildNeighbourhoodModel, neighbourhoodPos,
} from "./orreryGalaxy.js?v=ebbe92e1cf";
import { renderDetail, renderMoonDetail, renderSmallDetail } from "./orreryDetail.js?v=ebbe92e1cf";
import { renderStarDetail } from "./starDetail.js?v=ebbe92e1cf";
import { buildEarthMapSliced, buildFeatureMap } from "./surfacemap.js?v=ebbe92e1cf";
import { moonOffsetAU, moonOrbitPath, systemScale, withinMoonValidity, aliasedByClock } from "./moonorbits.js?v=ebbe92e1cf";

// Update the heliocentric-accuracy readout for the current epoch offset.
function updateOrreryAccuracy() {
  const node = document.getElementById("orreryAccuracy"); if (!node) return;
  const a = epochAccuracy(state.offsetYears, "helio");
  node.className = "epoch-accuracy acc-" + a.level;
  // Append the moon layer's own caveat when it is declining to draw. The planets here stay
  // arcsecond-class across the whole slider; the moons do not, and silently vanishing moons
  // would read as a bug rather than as the honest answer.
  const moonNote = state.showMoons && state.moonsHiddenReason ? ` ${state.moonsHiddenReason}` : "";
  node.textContent = `${epochLabel(state.offsetYears)} — ${a.text}${moonNote}`;
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
  showMoons: true, // the 21 major moons of Mars, Jupiter, Saturn, Uranus and Neptune
  galDeepSky: true, // nebulae / pulsars / black holes / nearby stars in the Milky-Way view
  localView: false, // light-year-scale solar-neighbourhood sub-view of the galaxy mode
  selectedStar: null, // catalogue star pinned in the detail panel (null = show the body card)
  topDown: false, preTopRadius: 0, // "Top-down map" view — folds in the former standalone 2-D Solar System surface
  // Camera: orbit around `anchor` (a body name; "Sun" = origin) or a free-fly camera (WASD + look).
  anchor: "Sun", freeFly: false, freePos: [18, 18, 12], yaw: -2.3, pitch: -0.4, flySpeed: 4, keys: new Set(),
  renderUnix: Date.now() / 1000, simElapsed: 0, galYears: 0, selected: null, backend: "",
  simStepSeconds: 0, // simulated seconds covered by the last frame (0 when paused)
  moonsHiddenReason: "", // why the moon layer is suppressed, surfaced in the accuracy line
  sunImageUnix: null, // capture epoch of textures/sun.jpg (from sun.jpg.json); null = unknown/procedural
  moonsAliasedCount: 0, // accumulated across every visible parent system in one paint
  bodies: [], lastTick: 0,
});

const DRAW_LIST = ["Sun", ...PLANET_ORDER, "Moon"];

// (mat/vec helpers, the IAU orientation, and the sphere/ring/ellipse geometry builders
// live in orreryMath.js; GLSL sources in orreryShaders.js — both imported above.)

// ---------------------------------------------------------------- WebGL2 renderer
let gl, P = {}, sphere, quadBuf, cel, celBufs = {}, particles = null;
let bodyBuf, ringBufs = {}, sceneLineBuf, sceneRanges = [], dropLineBuf, dropRanges = [];
let textures = {}, ringTex = { ready: false, tex: null }, whiteTex = null, texturesStarted = false;
let ringShadowTex = {}; // per-planet 1-D radial ring-opacity profiles for the ring-shadow lookup
let sunTex = { ready: false, tex: null }; // the latest real SDO disk, for the 3-D Sun's surface
let galaxy = null;
let smallBodies = []; // per-frame small-body markers: {name, pos, col, kind, note}

// Surface maps rasterised from the committed geography (geography.js -> surfacemap.js). These
// are what ships: apps/web/textures/ is .gitignore'd, so without them every deployment fell back
// to the procedural shader and Earth's "continents" were value noise. A real fetched photo map
// still wins where one exists — see drawBody.
let genTex = {}, genStarted = false;

// The 21 major moons (apps/web/js/moons.js), lazy-loaded with the rest of the 3-D payload.
// `moonSet` is null until it arrives; every moon path below tolerates that.
let moonSet = null;
// Per-frame moon markers, rebuilt during the body pass so labels and picking agree with what
// was actually drawn — including the zoom cut-off, so you cannot click an invisible moon.
let moonMarkers = [];
let moonPathBuf = null; // GL buffer for the moon orbit polylines (rebuilt per frame; they move)

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
// A missing map used to vanish into an empty onerror while the UI kept promising photographic
// surfaces. Say so — once in the console per file, and once in the panel for the whole build.
let texNoteShown = false;
function texMissing(file) {
  console.warn(`textures/${file} missing — using the procedural fallback (run tools/fetch_textures.py for photographic maps)`);
  if (texNoteShown) return;
  texNoteShown = true;
  const insight = document.getElementById("orreryInsight");
  if (insight) {
    insight.textContent += " (Photographic surface maps aren't present in this build — surfaces"
      + " shown are procedural approximations.)";
  }
}

function loadTextures() {
  if (texturesStarted || !gl) return;
  texturesStarted = true;
  const repaint = () => { if (state.active && !state.animate) paint(); };
  for (const [name, file] of Object.entries(TEXTURE_FILES)) {
    const img = new Image();
    img.onload = () => { try { textures[name] = { tex: makeTexture(img, true), ready: true }; repaint(); } catch (e) { console.warn("texture", name, e.message); } };
    img.onerror = () => texMissing(file);
    img.src = "textures/" + file + "?v=ebbe92e1cf"; // ?v stamped by tools/build_web.py (busts cached textures)
  }
  const ring = new Image();
  // The alpha profile rides with the photo ring: when the textured ring is what's drawn, its
  // shadow must be cast from the SAME radial density, or toggling Photo textures would change
  // the ring without changing its shadow (and the photo's fine gaps would not shadow at all).
  ring.onload = () => { try { ringTex = { tex: makeTexture(ring, false), ready: true, alphaProfile: ringImageAlphaProfile(ring) }; repaint(); } catch (e) {} };
  ring.onerror = () => texMissing("saturn_ring.png");
  ring.src = "textures/saturn_ring.png?v=ebbe92e1cf";
  // The real Sun (NASA SDO HMI continuum) for the 3-D Sun's surface — served same-origin from
  // textures/ (sdo.gsfc.nasa.gov sends no CORS header, so a remote image can't be a WebGL texture).
  // tools/fetch_textures.py downloads the latest disk to textures/sun.jpg; absent → procedural shader.
  // Its capture-epoch metadata (sun.jpg.json, written by the same script) must resolve FIRST:
  // sunDiskBasis freezes the disk basis on first use, so the epoch has to be known before the
  // texture can render — a committed baseline frame may be days or months old, and mapping it
  // as if it were captured "now" would put its sunspots at the wrong solar longitudes.
  const sun = new Image();
  sun.onload = () => {
    try {
      sunTex = { tex: makeTexture(sun, false), ready: true, tint: sunDiscTint(sun) };
      repaint();
    } catch (e) { console.warn("sun texture", e.message); }
  };
  sun.onerror = () => texMissing("sun.jpg");
  fetch("textures/sun.jpg.json?v=ebbe92e1cf")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((meta) => {
      state.sunImageUnix = meta && Number.isFinite(meta.fetched_unix) ? meta.fetched_unix : null;
      sun.src = "textures/sun.jpg?v=ebbe92e1cf";
    });
}

// Build the generated surface maps from the committed geography. One body per idle slice: the
// Earth map is 2048x1024 with a per-pixel tint pass, and doing all four in one go would drop
// frames on the very first render of the view.
// Drive a slice-yielding generator to completion, returning to the event loop between slices
// so a long pixel pass cannot hold the frame.
function runSliced(it, idle) {
  return new Promise((resolve) => {
    const pump = () => {
      const r = it.next();
      if (r.done) { resolve(r.value); return; }
      idle(pump);
    };
    pump();
  });
}

async function buildGeneratedMaps() {
  if (genStarted || !gl) return;
  genStarted = true;
  try {
    const [geo, moons] = await Promise.all([
      import("./geography.js?v=ebbe92e1cf"),
      import("./moons.js?v=ebbe92e1cf"),
    ]);
    moonSet = moons;
    populateAnchorSelect(); // the Focus dropdown can now offer the 21 moons
    if (state.active && !state.animate) paint();
    // Only Earth and the Moon. Mars and Mercury have real, catalogued features too, but nothing
    // in that catalogue says which of them are dark — see tools/fetch_geography.py — so they
    // keep the procedural shader rather than a guess. fetch_textures.py still supplies real
    // photographic maps for every body to anyone who wants them locally.
    const jobs = [
      ["Earth", () => buildEarthMapSliced(geo.EARTH, geo.decodeRing), 0],
      ["Moon", () => buildFeatureMap(geo.FEATURES.Moon, BODY.Moon.radiusKm), 1],
    ];
    const idle = typeof requestIdleCallback === "function"
      ? (fn) => requestIdleCallback(fn, { timeout: 500 })
      : (fn) => setTimeout(fn, 0);
    for (const [name, build, texMode] of jobs) {
      await new Promise((resolve) => idle(() => {
        // The context can die (or the view close) between slices; bail rather than throw.
        if (!gl || gl.isContextLost()) { resolve(); return; }
        try {
          // Earth's builder is a generator that hands control back every few hundred rows;
          // the feature maps are cheap enough to return a canvas outright.
          const made = build();
          const canvas = made && typeof made.next === "function" ? runSliced(made, idle) : made;
          if (canvas && typeof canvas.then === "function") {
            canvas.then((cv) => {
              try { genTex[name] = { tex: makeTexture(cv, true), ready: true, texMode }; } catch (e) { console.warn("surface map", name, e.message); }
              if (state.active && !state.animate) paint();
              resolve();
            });
            return;
          }
          genTex[name] = { tex: makeTexture(canvas, true), ready: true, texMode };
          if (state.active && !state.animate) paint();
        } catch (e) { console.warn("surface map", name, e.message); }
        resolve();
      }));
    }
  } catch (e) { console.warn("geography unavailable:", e.message); }
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
  P.sphereU = uloc(P.sphere, ["u_mvp", "u_model", "u_nmat", "u_style", "u_mode", "u_time", "u_base", "u_light", "u_cam", "u_atmo", "u_atmoStr", "u_useTex", "u_texMode", "u_tex", "u_sunA", "u_sunTint", "u_lightObj", "u_ringRad", "u_oblate", "u_ringTex"]);
  P.lineU = uloc(P.line, ["u_vp", "u_alpha"]);
  P.ringU = uloc(P.ring, ["u_mvp", "u_model", "u_useTex", "u_tex", "u_center", "u_light", "u_prad"]);
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
  const jy2k = timeJy2k(state.renderUnix);
  // `el` carries the source record so the detail card can show the orbit (a, e, i, period).
  for (const b of DWARFS) smallBodies.push({ name: b.n, pos: bodyXYZ(b, jy2k), col: b.col, kind: "dwarf", note: b.note, el: b });
  for (const c of COMETS) smallBodies.push({ name: c.n, pos: bodyXYZ(c, jy2k), col: c.col, kind: "comet", note: c.note, el: c });
  for (const p of PROBES) smallBodies.push({ name: p.n, pos: probeXYZ(p), col: p.col, kind: "probe", note: p.note, el: p });
  // The CPU-side list above is ALWAYS built: the Focus dropdown and the detail panel resolve
  // small bodies through it even while the drawn layer is hidden. Only the GPU markers are
  // gated on the checkbox (drawSmallBodies/pick/labels each gate themselves).
  if (!state.showSmall) { celBufs.smallMarkCount = 0; return; }
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
  // Rows are BUTTONS, not text. This panel is the canvas's stated text alternative, so anything
  // you can click in the 3-D view has to be reachable here too — otherwise the moons would exist
  // only for pointer users, since the label overlay is aria-hidden and hit-testing is by cursor.
  const select = (name) => {
    state.selectedStar = null;
    state.selected = name;
    showDetail(name);
    if (!state.animate) paint();
  };
  const addRow = (name, text, indent) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = indent ? "sky-row orrery-pos-moon" : "sky-row";
    row.textContent = text;
    row.addEventListener("click", () => select(name));
    list.appendChild(row);
  };
  for (const b of state.bodies) {
    if (b.x_au == null || b.dist_au == null) continue;
    const lon = (((Math.atan2(b.y_au, b.x_au) * 180) / Math.PI) + 360) % 360;
    addRow(b.name, `${b.name}: ${b.dist_au.toFixed(2)} AU from the Sun, ecliptic longitude ${lon.toFixed(0)}°`, false);
    // Its moons directly beneath it, so the hierarchy is audible in reading order.
    if (!moonSet || !state.showMoons) continue;
    if (!withinMoonValidity(
      state.renderUnix, moonSet.MOON_VALID_MIN_JD, moonSet.MOON_VALID_MAX_JD,
    )) continue;
    for (const m of moonSet.moonsOf(b.name)) {
      const period = m.P < 1 ? `${(m.P * 24).toFixed(1)} h` : `${m.P.toFixed(2)} d`;
      addRow(m.n, `↳ ${m.n}: moon of ${b.name}, ${Math.round(m.a).toLocaleString()} km out, `
        + `orbit ${period}, radius ${Math.round(m.r).toLocaleString()} km`, true);
    }
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
    const pole = norm(poleVector(BODY.Sun, state.renderUnix));
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

// A moon's DISPLAYED world position — the same parent + offset·systemScale arithmetic drawMoons
// uses, so the camera can anchor a moon before (and regardless of whether) its markers were built
// this frame. Returns null when the catalogue hasn't loaded, the epoch is outside the validated
// window, or the parent is missing.
function moonWorldPos(name) {
  if (!moonSet) return null;
  const m = moonSet.MOONS.find((x) => x.n === name);
  if (!m) return null;
  if (!withinMoonValidity(state.renderUnix, moonSet.MOON_VALID_MIN_JD, moonSet.MOON_VALID_MAX_JD)) return null;
  const parent = state.bodies.find((x) => x.name === m.p);
  if (!parent || parent.x_au == null) return null;
  const phys = BODY[m.p];
  const parentDisplayAU = displayRadiusAU(m.p);
  const ringOuterAU = phys.rings ? (phys.rings.outerKm / phys.radiusKm) * parentDisplayAU : 0;
  const scale = systemScale(moonSet.moonsOf(m.p), parentDisplayAU, state.trueScale, ringOuterAU);
  const off = moonOffsetAU(m, state.renderUnix);
  return [parent.x_au + off[0] * scale, parent.y_au + off[1] * scale, parent.z_au + off[2] * scale];
}

// The point the orbit camera looks at: the Sun (origin), the selected anchor body — a planet,
// a moon, or a small-body marker — or the origin in galaxy mode, where solar anchors don't apply.
function anchorPos() {
  if (state.galaxy || state.anchor === "Sun" || !state.anchor) return [0, 0, 0];
  const b = state.bodies.find((x) => x.name === state.anchor);
  if (b) return bodyWorldPos(b);
  const mp = moonWorldPos(state.anchor);
  if (mp) return mp;
  // An anchored moon whose epoch has left the validated window (moonWorldPos → null): follow
  // its PARENT rather than snapping a tightly-zoomed camera to the Sun — the moon layer is
  // hidden at these epochs and the accuracy line already says why.
  const m = moonSet ? moonSet.MOONS.find((x) => x.n === state.anchor) : null;
  if (m) {
    const parent = state.bodies.find((x) => x.name === m.p);
    if (parent && parent.x_au != null) return [parent.x_au, parent.y_au, parent.z_au];
  }
  const sb = smallBodies.find((s) => s.name === state.anchor);
  return sb ? sb.pos : [0, 0, 0];
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
  moonMarkers = []; // rebuilt by drawMoons as each planet is drawn
  state.moonsHiddenReason = ""; // ...as is the explanation for any it declines to draw
  state.moonsAliasedCount = 0;
  for (const name of DRAW_LIST) {
    const b = name === "Sun" ? { name: "Sun" } : state.bodies.find((x) => x.name === name);
    if (!b) continue;
    drawBody(b, vp, eye);
  }
  if (!state.moonsHiddenReason && state.moonsAliasedCount) {
    const count = state.moonsAliasedCount;
    state.moonsHiddenReason = `${count} inner moon${count > 1 ? "s" : ""} hidden — the clock is `
      + "advancing faster than they orbit. Slow the speed or untick Animate to see them.";
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

// Average colour of the SDO disc (luminance-normalised), so the shader can tint the
// procedural far side to match the frame's palette: SDO colourises HMI continuum orange,
// while the procedural surface is cream — unmatched, the sphere read as an orange cap
// glued onto a pale ball, with a glaring seam at the hemisphere boundary.
function sunDiscTint(img) {
  try {
    const n = 64;
    const cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    const px = ctx.getImageData(0, 0, n, n).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // Central disc only: skip the black background and the limb-darkened rim.
        if (Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) > n * 0.3) continue;
        const i = (y * n + x) * 4;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; count++;
      }
    }
    if (!count) return null;
    r /= count * 255; g /= count * 255; b /= count * 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 0.05 ? [r / lum, g / lum, b / lum] : null;
  } catch (_) { return null; } // canvas readback blocked — keep the untinted fallback
}

// The SDO disk is the Earth-facing hemisphere at its CAPTURE EPOCH — sun.jpg.json records when
// fetch_textures.py actually downloaded the frame (a committed baseline may be months old, and
// the mapping is only correct for the moment the image was taken). Freeze that Sun→Earth
// direction ONCE, expressed in the Sun's rotating body frame, so the shader keeps the image
// glued to the surface: it co-rotates with the real IAU spin, and sunspots stay put as the
// camera orbits (the old camera-locked basis dragged them around, and its
// cross([0,0,1], camera) degenerated to NaN in the top-down view). Without metadata we fall
// back to "now" — right for a freshly fetched frame, the pre-metadata behaviour otherwise.
let sunBasisA = null;
function sunDiskBasis() {
  if (sunBasisA) return sunBasisA;
  const nowUnix = state.sunImageUnix || Date.now() / 1000; // the frame's capture epoch, never the scrubbed sim time
  let d = null;
  try {
    const positions = systemPositions(nowUnix);
    const i = SYSTEM_POSITIONS_ORDER.indexOf("Earth");
    if (positions && i >= 0 && positions.length >= (i + 1) * 3) {
      d = norm([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
    }
  } catch (_) { /* engine hiccup — fall back below */ }
  if (!d) {
    const earth = state.bodies.find((x) => x.name === "Earth");
    if (!earth || earth.x_au == null) return [1, 0, 0]; // no positions yet: harmless placeholder
    d = norm([earth.x_au, earth.y_au, earth.z_au]);
  }
  const rot = iauRotation(BODY.Sun, nowUnix);
  // Body-frame components are Rᵀ·d — rot's upper-left 3×3 is orthonormal, column-major.
  sunBasisA = [
    rot[0] * d[0] + rot[1] * d[1] + rot[2] * d[2],
    rot[4] * d[0] + rot[5] * d[1] + rot[6] * d[2],
    rot[8] * d[0] + rot[9] * d[1] + rot[10] * d[2],
  ];
  return sunBasisA;
}

// Radial alpha profile of the ring photometry PNG (the same axis drawRing samples it on:
// x = radial fraction inner→outer), for shadowing the photo ring by its own density.
function ringImageAlphaProfile(img, n = 160) {
  try {
    const cv = document.createElement("canvas");
    cv.width = n; cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, 1);
    const px = ctx.getImageData(0, 0, n, 1).data;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = px[i * 4 + 3];
    return out;
  } catch (_) { return null; } // canvas readback blocked — the model profile still applies
}

function makeProfileTex(data) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, data.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Lazily build (and cache) the 1-D ring-opacity texture the ring-shadow lookup samples —
// R8, LINEAR-filtered so the shadow edges come out softly antialiased for free. The source
// mirrors what drawRing actually renders: the photometry PNG's own alpha when the textured
// Saturn ring is showing, the ringColorAt model otherwise — so ring and shadow always agree,
// including when the Photo textures checkbox flips between them.
function ringShadowProfileTex(name, phys) {
  const photo = name === "Saturn" && state.useTextures && ringTex.ready && ringTex.alphaProfile;
  const key = photo ? name + "#photo" : name;
  if (ringShadowTex[key]) return ringShadowTex[key];
  const data = photo ? ringTex.alphaProfile : ringOpacityProfile(phys.rings);
  ringShadowTex[key] = makeProfileTex(data);
  return ringShadowTex[key];
}

// Bodies whose spin phase is currently frozen (name → the unix second it froze at).
let rotFreeze = {};

function drawBody(b, vp, eye) {
  const phys = BODY[b.name]; if (!phys) return;
  const pos = bodyWorldPos(b);
  const rEq = displayRadiusAU(b.name), rPol = rEq * (phys.polarKm / phys.radiusKm);
  // Rotation phase is unresolvable once one frame covers more than about a third of the spin
  // period — the moons' aliasedByClock Nyquist doctrine, applied to spin. A moon can be
  // hidden; a planet cannot, so its PHASE freezes while the clock outpaces it (orbital motion
  // continues; pause or slow down and the true IAU phase snaps back). Without this, at the
  // default 0.5 yr/s the Sun turns ~7 times per real second and its Earth-facing SDO
  // hemisphere strobed around the globe at ~45° per frame.
  let rotUnix = state.renderUnix;
  if (state.animate && state.simStepSeconds > (Math.abs(phys.rotationHours) * 3600) / 3) {
    if (rotFreeze[b.name] == null) rotFreeze[b.name] = state.renderUnix;
    rotUnix = rotFreeze[b.name];
  } else if (rotFreeze[b.name] != null) {
    delete rotFreeze[b.name];
  }
  const rot = iauRotation(phys, rotUnix);
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
  // Surface-map priority: a real fetched photographic map (fetch_textures.py) beats the map we
  // generate from the committed vectors, which in turn beats the procedural shader. Only the
  // generated maps can ask to MODULATE rather than replace.
  const isSun = b.name === "Sun";
  const sunTexd = isSun && state.useTextures && sunTex.ready;
  const photoTexd = !isSun && state.useTextures && textures[b.name] && textures[b.name].ready;
  // NOT gated on state.useTextures. That checkbox is labelled "NASA textures" and its job is the
  // OPTIONAL photographic downloads; the generated maps are committed public-domain geography that
  // ships with the app. Gating them too meant unticking it replaced real coastlines with the
  // procedural noise continents — the exact thing this release exists to remove.
  const gen = !isSun && !photoTexd && genTex[b.name] && genTex[b.name].ready
    ? genTex[b.name] : null;
  const useTex = sunTexd || photoTexd || !!gen;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sunTexd ? sunTex.tex : (photoTexd ? textures[b.name].tex : (gen ? gen.tex : whiteTex)));
  gl.uniform1i(P.sphereU.u_tex, 0);
  gl.uniform1i(P.sphereU.u_useTex, useTex ? 1 : 0);
  gl.uniform1i(P.sphereU.u_texMode, gen ? gen.texMode : 0);
  gl.uniform3fv(P.sphereU.u_sunA, new Float32Array(sunTexd ? sunDiskBasis() : [1, 0, 0]));
  gl.uniform3fv(P.sphereU.u_sunTint, new Float32Array(sunTexd && sunTex.tint ? sunTex.tint : [0, 0, 0]));
  // Ring-shadow inputs: the light direction expressed in the BODY frame (Rᵀ·light — rot's
  // upper 3×3 is orthonormal, column-major), the annulus radii in equatorial-radius units, the
  // oblateness ratio, and the radial opacity-profile texture on unit 1. Zeroed for ringless
  // bodies, and re-zeroed by drawMoons (same program, stale state).
  gl.uniform3fv(P.sphereU.u_lightObj, new Float32Array([
    rot[0] * light[0] + rot[1] * light[1] + rot[2] * light[2],
    rot[4] * light[0] + rot[5] * light[1] + rot[6] * light[2],
    rot[8] * light[0] + rot[9] * light[1] + rot[10] * light[2],
  ]));
  gl.uniform2fv(P.sphereU.u_ringRad, new Float32Array(
    phys.rings ? [phys.rings.innerKm / phys.radiusKm, phys.rings.outerKm / phys.radiusKm] : [0, 0],
  ));
  gl.uniform1f(P.sphereU.u_oblate, phys.polarKm / phys.radiusKm);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, phys.rings ? ringShadowProfileTex(b.name, phys) : whiteTex);
  gl.uniform1i(P.sphereU.u_ringTex, 1);
  gl.activeTexture(gl.TEXTURE0);

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

  // Opaque moons first, transparent rings second. drawRing disables depth writes, so drawing it
  // first left no ring depth for a later moon to test against and made moons behind a foreground
  // ring appear on top of it.
  drawMoons(b.name, pos, rEq, vp, eye);
  if (phys.rings) drawRing(b.name, phys, pos, rEq, rot, vp);
}

// A moon's drawn radius. Planets in this view are already enlarged so the small ones stay
// visible; moons need the same treatment or Phobos (11 km beside a 3,396 km Mars) is a
// sub-pixel speck. The ratio to the parent is preserved and then boosted, with a floor so the
// smallest are still findable — the same bargain the planet sizes already make, and the panel
// says so. True-scale mode gets the honest ratio.
function moonDisplayRadius(m, parentRadiusKm, parentDisplayAU) {
  const ratio = m.r / parentRadiusKm;
  if (state.trueScale) return parentDisplayAU * ratio;
  return Math.min(parentDisplayAU * 0.42, Math.max(parentDisplayAU * 0.055, parentDisplayAU * ratio * 4));
}

// Draw the moons of one planet. Returns quietly when the catalogue has not loaded, when the
// planet has none, or when the camera is too far out for them to be anything but clutter.
function drawMoons(parentName, parentPos, parentDisplayAU, vp, eye) {
  if (!moonSet || !state.showMoons) return;
  // Outside the window the committed elements were validated in, we do not know where these
  // moons are — the phase drifts without bound and the date slider reaches ±5000 years. Drawing
  // them anyway would put confident-looking dots at arbitrary points, which is worse than an
  // empty orbit. The reason is surfaced in the accuracy line rather than left as a mystery.
  if (!withinMoonValidity(
    state.renderUnix, moonSet.MOON_VALID_MIN_JD, moonSet.MOON_VALID_MAX_JD,
  )) {
    state.moonsHiddenReason = "Moons hidden — outside their March 2025–February 2027 "
      + "validated window. Press Now to bring them back.";
    return;
  }
  const moons = moonSet.moonsOf(parentName);
  if (!moons.length) return;
  const phys = BODY[parentName];
  // Rings are drawn out to (outerKm / radiusKm) x the planet's display radius; feed that in so
  // the moons are lifted clear of them rather than into them.
  const ringOuterAU = phys.rings ? (phys.rings.outerKm / phys.radiusKm) * parentDisplayAU : 0;
  const scale = systemScale(moons, parentDisplayAU, state.trueScale, ringOuterAU);
  // Beyond this the whole system is a few pixels wide; drawing it just speckles the planet.
  const outermost = (moons[moons.length - 1].a / AU_KM) * scale;
  const dist = Math.hypot(eye[0] - parentPos[0], eye[1] - parentPos[1], eye[2] - parentPos[2]);
  if (outermost / Math.max(dist, 1e-9) < 0.012) return;

  let aliased = 0;

  // Orbit paths, when the Orbits overlay is on. Same scale factor as the markers, so the moon
  // always sits ON its drawn path. Without these the markers float with none of the context the
  // overlay promises for every other body in the scene.
  if (state.showOrbits) {
    const pts = [];
    for (const m of moons) {
      if (aliasedByClock(m, state.simStepSeconds)) continue;
      const path = moonOrbitPath(m, state.renderUnix, 64);
      for (let i = 0; i + 1 < path.length; i++) {
        for (const q of [path[i], path[i + 1]]) {
          pts.push(parentPos[0] + q[0] * scale, parentPos[1] + q[1] * scale, parentPos[2] + q[2] * scale,
            m.col[0] * 0.55, m.col[1] * 0.55, m.col[2] * 0.55);
        }
      }
    }
    if (pts.length) {
      if (!moonPathBuf) moonPathBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, moonPathBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
      gl.useProgram(P.line);
      gl.uniformMatrix4fv(P.lineU.u_vp, false, new Float32Array(vp));
      gl.uniform1f(P.lineU.u_alpha, 0.55);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.depthMask(false);
      gl.drawArrays(gl.LINES, 0, pts.length / 6);
      gl.depthMask(true);
    }
  }

  for (const m of moons) {
    // A frame that samples this moon's orbit below the Nyquist rate (aliasedByClock: fewer
    // than ~3 samples per revolution) cannot draw its motion, only alias it — apparent travel
    // can even reverse. Fast-forwarding therefore thins the inner moons out first and keeps
    // the outer ones, which is exactly which of them the clock is still resolving.
    if (aliasedByClock(m, state.simStepSeconds)) { aliased++; continue; }
    const off = moonOffsetAU(m, state.renderUnix);
    const pos = [parentPos[0] + off[0] * scale, parentPos[1] + off[1] * scale, parentPos[2] + off[2] * scale];
    const r = moonDisplayRadius(m, phys.radiusKm, parentDisplayAU);
    const model = mul(translate(pos), scaleM([r, r, r]));
    // Draw with the inflated offset, but light from the physical position. Using `pos` here
    // moved an outer moon several rendered AU from its parent and rotated its terminator by
    // tens of degrees even though its real planetocentric offset is tiny on the solar scale.
    const physicalPos = [parentPos[0] + off[0], parentPos[1] + off[1], parentPos[2] + off[2]];
    const light = norm([-physicalPos[0], -physicalPos[1], -physicalPos[2]]);

    gl.useProgram(P.sphere);
    gl.uniformMatrix4fv(P.sphereU.u_mvp, false, new Float32Array(mul(vp, model)));
    gl.uniformMatrix4fv(P.sphereU.u_model, false, new Float32Array(model));
    gl.uniformMatrix3fv(P.sphereU.u_nmat, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
    // Titan is the one moon with a real atmosphere, so it gets the hazy shader rather than the
    // cratered one; everything else is a rock or an iceball. Both styles MODULATE u_base — the
    // planet styles would overwrite it and throw away the catalogue's per-moon colour.
    gl.uniform1i(P.sphereU.u_style, m.n === "Titan" ? STYLE_ID.moonHaze : STYLE_ID.moonRock);
    gl.uniform1i(P.sphereU.u_mode, 0);
    gl.uniform1f(P.sphereU.u_time, state.renderUnix * 0.0002);
    gl.uniform3fv(P.sphereU.u_base, new Float32Array(m.col));
    gl.uniform3fv(P.sphereU.u_light, new Float32Array(light));
    gl.uniform3fv(P.sphereU.u_cam, new Float32Array(eye));
    gl.uniform3fv(P.sphereU.u_atmo, new Float32Array(m.n === "Titan" ? [0.85, 0.6, 0.3] : [0, 0, 0]));
    gl.uniform1f(P.sphereU.u_atmoStr, m.n === "Titan" ? 0.5 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, whiteTex);
    gl.uniform1i(P.sphereU.u_tex, 0);
    gl.uniform1i(P.sphereU.u_useTex, 0);
    gl.uniform1i(P.sphereU.u_texMode, 0);
    gl.uniform2fv(P.sphereU.u_ringRad, new Float32Array([0, 0])); // no ring shadow on moons — clear the parent's state

    gl.bindBuffer(gl.ARRAY_BUFFER, sphere.pos);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.idx);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.CULL_FACE);

    moonMarkers.push({ name: m.n, pos, moon: m });
  }
  state.moonsAliasedCount += aliased;
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
  gl.uniformMatrix4fv(P.ringU.u_model, false, new Float32Array(model));
  // Planet-shadow inputs: world centre, unit direction toward the Sun, display radius.
  gl.uniform3fv(P.ringU.u_center, new Float32Array(pos));
  gl.uniform3fv(P.ringU.u_light, new Float32Array(norm([-pos[0], -pos[1], -pos[2]])));
  gl.uniform1f(P.ringU.u_prad, rEq);
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
  // Depth TEST stays ON (only writes are off): a planet nearer the camera must silhouette the
  // glow. Disabling the test painted the corona over Mercury and Venus from every angle — the
  // outer quad reached most of the way to Earth's orbit. The sizes are trimmed for the same
  // reason: this is the visual halo, not a physical corona extent.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  gl.uniform3fv(P.glowU.u_color, new Float32Array([1.0, 0.85, 0.5])); gl.uniform1f(P.glowU.u_size, rSun * 2.2); gl.uniform1f(P.glowU.u_pow, 2.8);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.uniform3fv(P.glowU.u_color, new Float32Array([1.0, 0.55, 0.2])); gl.uniform1f(P.glowU.u_size, rSun * 3.4); gl.uniform1f(P.glowU.u_pow, 4.2);
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
    // Disc-feature labels (arms, the bar, the spur) shear with the differentially-rotating
    // points they name — a static label detaches from its arm within a few hundred Myr of
    // animation. The Sun (updated by updateGalaxySun) and the static rings stay unsheared.
    for (const it of galaxy.labels) {
      items.push({
        name: it.name,
        p: it.shear ? galShear(it.p, state.galYears) : it.p,
        cls: it.name.startsWith("☉") ? "orrery-label sky-star" : "orrery-label sky-galaxy",
      });
    }
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
    // Only the moons actually drawn this frame — drawMoons drops whole systems that are too
    // small on screen to be worth it, and a label for an undrawn moon would be a lie.
    for (const mk of moonMarkers) items.push({ name: mk.name, p: mk.pos, cls: "orrery-label sky-star" });
    if (state.showSunEq) {
      const pole = norm(poleVector(BODY.Sun, state.renderUnix));
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
  // A picked star wins the panel until something else is picked; otherwise fall back to
  // the body card (which also renders the "click something" placeholder).
  if (state.selectedStar) { renderStarDetail(state.selectedStar); return; }
  const moon = moonSet && name ? moonSet.MOONS.find((m) => m.n === name) : null;
  if (moon) { renderMoonDetail(moon, state.renderUnix); return; }
  const small = name ? smallBodies.find((s) => s.name === name) : null;
  if (small) { renderSmallDetail(small); return; }
  renderDetail(name, state.bodies.find((b) => b.name === name));
}

// Screen-space nearest named star to (px, py). `m` is the matrix the stars were drawn
// with — skyVp on the unit sky sphere, plain vp for the neighbourhood's true 3-D places.
// Only NAMED_STARS are pickable: they are the ~500 with a proper name and the metadata
// the card needs, and it keeps the hit test to one short loop per click.
function pickStar(px, py, w, h, m, project) {
  if (!starCat) return null;
  let best = null;
  for (const s of starCat.NAMED_STARS) {
    const p = project(s);
    if (!p) continue;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const wv = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (wv <= 0) continue;
    const sx = (x / wv * 0.5 + 0.5) * w, sy = (1 - (y / wv * 0.5 + 0.5)) * h;
    const d = Math.hypot(sx - px, sy - py);
    // Brighter stars get a slightly larger hit radius so the recognisable ones win ties.
    const reach = Math.max(12, 26 - 2.2 * s.mag);
    if (d < reach && (!best || d < best.d)) best = { d, star: s };
  }
  return best ? best.star : null;
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
      // How much simulated time one frame covers. The moon layer needs it: at the default
      // 0.5 yr/s this is ~3 days per frame, which is more than a full orbit for several moons.
      state.simStepSeconds = dt * state.yearsPerSec * YR;
      state.simElapsed += dt * state.yearsPerSec * YR; // YR seconds per sim-year ⇒ visible outer-planet motion
      state.renderUnix = effectiveBaseUnix() + state.simElapsed;
      rebuildPositions();
      stepParticles(dt);
    }
  }
  if (state.freeFly) flyStep(dt);
  const moonNoteBefore = state.moonsHiddenReason;
  paint();
  if (state.moonsHiddenReason !== moonNoteBefore) updateOrreryAccuracy();
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

// Switch the orbit anchor (focus). Re-frames the camera at a distance suited to that body's
// size, and approaches from the SUNLIT side: the old camera kept its previous azimuth, which as
// often as not framed the night hemisphere — a black disc is a broken-looking first impression.
function setAnchor(name) {
  state.anchor = name;
  state.selectedStar = null; // an explicit body choice unpins any star card
  if (name === "Sun") { state.radius = 26; paint(); return; }
  const moon = moonSet ? moonSet.MOONS.find((m) => m.n === name) : null;
  const small = smallBodies.find((s) => s.name === name);
  if (moon) {
    if (moonWorldPos(name)) {
      const r = moonDisplayRadius(moon, BODY[moon.p].radiusKm, displayRadiusAU(moon.p));
      state.radius = Math.max(0.28, r * 16); // close enough that the moon reads, parent in frame
    } else {
      // Outside the moons' validated epoch window their positions are unknown and the layer
      // is hidden — frame the parent planet instead of zooming to nothing (anchorPos follows
      // the parent for the same reason). The moon's facts card still shows.
      state.radius = Math.max(1.2, displayRadiusAU(moon.p) * 14);
    }
  } else if (small) {
    state.radius = 4; // point markers have no display radius; 4 AU keeps the orbit in context
  } else if (BODY[name]) {
    state.radius = Math.max(1.2, displayRadiusAU(name) * 14);
  }
  state.selected = name;
  showDetail(name);
  const t = anchorPos();
  if (t[0] || t[1]) {
    state.az = Math.atan2(-t[1], -t[0]) + 0.5; // eye toward the Sun, offset for a gibbous phase
    state.el = 0.3;
  }
  paint();
}

// Fill the Focus dropdown from the data rather than hard-coding it: Sun + planets (+ Earth's
// Moon) first, then each planet's moons as a group, then the dwarf planets, comets and
// spacecraft from the small-body layer. Re-run when the lazy moon catalogue arrives.
function populateAnchorSelect() {
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById("orreryAnchor"));
  if (!sel) return;
  const cur = state.anchor;
  sel.textContent = "";
  const add = (parentEl, value, label) => {
    const o = document.createElement("option");
    o.value = value; o.textContent = label || value;
    parentEl.appendChild(o);
  };
  add(sel, "Sun");
  for (const p of PLANET_ORDER) {
    add(sel, p);
    if (p === "Earth") add(sel, "Moon", "  · Moon");
  }
  if (moonSet) {
    for (const parent of moonSet.MOON_PARENTS) {
      const og = document.createElement("optgroup");
      og.label = `${parent} — moons`;
      for (const m of moonSet.moonsOf(parent)) add(og, m.n);
      sel.appendChild(og);
    }
  }
  const groups = [
    ["Dwarf planets & asteroids", DWARFS],
    ["Comets", COMETS],
    ["Spacecraft", PROBES],
  ];
  for (const [label, list] of groups) {
    const og = document.createElement("optgroup");
    og.label = label;
    for (const b of list) add(og, b.n);
    sel.appendChild(og);
  }
  sel.value = cur;
  if (sel.value !== cur) sel.value = "Sun"; // the previous anchor no longer exists
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
    hint.textContent = "Lit, textured worlds at their true VSOP2013 positions — real photographic surface maps (NASA & CC-BY sources), correct sizes, axial tilts, sidereal spin, rings, the Moon beside Earth, an animated Sun, and the real sky behind them. Drag to orbit, scroll to zoom, click a body to inspect it. Keyboard: arrows orbit, +/− zoom.";
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
    const starCatPromise = starCat ? null : import("./starcatalog.js?v=ebbe92e1cf");
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
    buildGeneratedMaps(); // not awaited: the view paints immediately, maps appear as they build
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
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left), py = (e.clientY - rect.top);
    const [w, h] = [canvas.clientWidth, canvas.clientHeight];
    const { vp, skyVp } = cameraMatrices(canvas.width, canvas.height);

    // Solar neighbourhood: stars are the only thing to inspect, at true 3-D places.
    if (state.galaxy) {
      if (state.localView) {
        state.selectedStar = pickStar(px, py, w, h, vp,
          (s) => (s.dist == null ? null : neighbourhoodPos(s.ra, s.dec, s.dist)));
        showDetail(state.selected);
        if (!state.animate) paint();
      }
      return; // the galaxy disc has no per-object picking
    }

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
    // Moons compete on the same footing, with a tighter radius so a moon close to its planet
    // does not steal clicks aimed at the planet itself. Small-body markers (dwarf planets,
    // comets, spacecraft) join at the same tight radius — they used to be drawn and labelled
    // but unclickable, which left their facts unreachable.
    const extra = state.showSmall ? smallBodies : [];
    for (const mk of [...moonMarkers, ...extra]) {
      const p = mk.pos;
      const wv = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      if (wv <= 0) continue;
      const sx = ((vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12]) / wv * 0.5 + 0.5) * w;
      const sy = (1 - ((vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13]) / wv * 0.5 + 0.5)) * h;
      const d = Math.hypot(sx - px, sy - py);
      if (d < 18 && (!best || d < best.d)) best = { d, name: mk.name };
    }
    // Solar-system bodies win: they are the subject of this view, and a star behind one
    // must not steal the click. Only an empty patch of sky falls through to the stars,
    // which live on the backdrop sphere and so project with skyVp, not vp.
    state.selected = best ? best.name : null;
    state.selectedStar = best || !state.showSky
      ? null
      : pickStar(px, py, w, h, skyVp, (s) => equToEcl(s.ra, s.dec));
    showDetail(state.selected);
    if (!state.animate) paint();
  }

  const bind = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
  bind("orreryTime", "input", (e) => { state.offsetYears = Number(e.target.value); state.simElapsed = 0; state.renderUnix = effectiveBaseUnix(); rebuildPositions(); if (state.galaxy) updateGalaxySun(); showDetail(state.selected); paint(); updateOrreryAccuracy(); });
  bind("orreryNow", "click", () => { state.offsetYears = 0; state.simElapsed = 0; state.galYears = 0; const s = document.getElementById("orreryTime"); if (s) s.value = "0"; state.renderUnix = effectiveBaseUnix(); rebuildPositions(); updateGalaxySun(); showDetail(state.selected); paint(); updateOrreryAccuracy(); });
  // drawRing already detects a radius change and re-uploads into the SAME buffer, so no
  // ringBufs reset here — nuking the map on every slider input orphaned up to three ~1.3 MB
  // GPU buffers per event without gl.deleteBuffer.
  bind("orrerySize", "input", (e) => { state.exaggeration = Number(e.target.value); paint(); });
  bind("orreryTrueScale", "change", (e) => { state.trueScale = e.target.checked; paint(); });
  bind("orreryAnimate", "change", (e) => {
    state.animate = e.target.checked;
    if (state.animate) startLoop();
    else {
      state.simStepSeconds = 0;
      paint();
      updateOrreryAccuracy();
    }
  });
  bind("orrerySpeed", "input", (e) => { const v = Number(e.target.value); if (state.galaxy) state.galSpeed = v; else state.yearsPerSec = v; });
  bind("orreryShowOrbits", "change", (e) => { state.showOrbits = e.target.checked; buildSceneLines(); paint(); });
  bind("orreryShowSky", "change", (e) => { state.showSky = e.target.checked; paint(); });
  bind("orreryShowConst", "change", (e) => { state.showConst = e.target.checked; paint(); });
  bind("orreryShowLabels", "change", (e) => { state.showLabels = e.target.checked; paint(); });
  bind("orreryShowSunEq", "change", (e) => { state.showSunEq = e.target.checked; buildSceneLines(); paint(); });
  bind("orreryShowSmall", "change", (e) => { state.showSmall = e.target.checked; buildSceneLines(); rebuildSmallBodies(); paint(); });
  bind("orreryShowMoons", "change", (e) => { state.showMoons = e.target.checked; paint(); updateOrreryAccuracy(); });
  bind("orreryDeepSky", "change", (e) => { state.galDeepSky = e.target.checked; paint(); });
  bind("orreryTextures", "change", (e) => { state.useTextures = e.target.checked; paint(); });
  bind("orreryTopDown", "change", (e) => {
    state.topDown = e.target.checked;
    if (state.topDown) { state.preTopRadius = state.radius; state.radius = 78; } // frame the whole system from above
    else if (state.preTopRadius) { state.radius = state.preTopRadius; }
    paint();
  });
  bind("orreryAnchor", "change", (e) => { if (!state.freeFly) setAnchor(e.target.value); else state.anchor = e.target.value; });
  populateAnchorSelect(); // replace the static planet list with the full data-driven one
  bind("orreryFreeFly", "change", (e) => setFreeFly(e.target.checked));
  bind("orreryGalaxy", "click", () => {
    state.galaxy = !state.galaxy;
    state.selectedStar = null;
    if (state.localView) { state.localView = false; const lb = document.getElementById("orreryLocal"); if (lb) lb.textContent = "Solar neighbourhood (ly scale)"; }
    if (state.freeFly) { state.freeFly = false; const ff = document.getElementById("orreryFreeFly"); if (ff) ff.checked = false; }
    const btn = document.getElementById("orreryGalaxy");
    const insight = document.getElementById("orreryInsight");
    setSpeedSliderMode(state.galaxy);
    if (state.galaxy) {
      state.savedRadius = state.radius; state.radius = 118; state.el = 0.95;
      updateGalaxySun();
      if (btn) btn.textContent = "← Back to the Solar System";
      if (insight) insight.textContent = "The Milky Way, face-on. Two dominant stellar arms (Scutum–Centaurus and Perseus) spring from the ends of the central bar, tilted ~28° to our line to the centre, with the fainter Sagittarius–Carina and Norma–Outer arms between them. The Sun (cyan) sits INSIDE the short Orion Spur, ~8.2 kpc (26,700 ly) out — Sagittarius–Carina is the next arm inward, Perseus the next outward. One lap is a ~220-million-year “galactic year.” Press Animate: the disc rotates DIFFERENTIALLY — inner stars lap outer ones, so over a few hundred Myr the arms shear and wind up. That “winding problem” is exactly why real spiral arms must be density waves, not fixed clumps of stars. Drag to rotate, scroll to zoom.";
    } else {
      state.radius = state.savedRadius; state.el = 0.45;
      if (btn) btn.textContent = "Zoom out to the Milky Way";
      if (insight) insight.textContent = "Lit, textured worlds at their true VSOP2013 positions — real photographic surface maps (NASA & CC-BY sources), correct sizes, axial tilts, sidereal spin, rings, the Moon beside Earth, an animated Sun, and the real sky behind them. Drag to orbit, scroll to zoom, click a body to inspect it. Keyboard: arrows orbit, +/− zoom.";
      rebuildPositions();
    }
    paint();
  });
  bind("orreryLocal", "click", () => {
    state.localView = !state.localView;
    state.selectedStar = null;
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
    whiteTex = null; ringBufs = {}; ringShadowTex = {}; texturesStarted = false; particles = null;
    genTex = {}; genStarted = false; // generated surface maps died with the context too
    moonPathBuf = null;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (!state.active) return;
    const c = document.getElementById("orreryCanvas");
    if (!initGL(c)) return;
    initParticles();
    loadTextures();
    buildGeneratedMaps();
    rebuildPositions();
    buildSceneLines(); // the static geometry died with the old context
    paint();
    startLoop(); // the tick loop may have stopped while gl was null; re-arm it
  });
  // Repaint on any size change (DPI / window / layout) so ensureSized rebuilds the backing store at
  // full resolution — fires even when rAF is throttled (background tab), unlike the animation loop.
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (state.active) paint(); }).observe(canvas);
})();
