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

import { loadSkyEngine, systemSnapshot } from "./skyEngine.js?v=a2360b7fc1";
import { BODY, PLANET_ORDER, STYLE_ID, AU_KM, poleVector, rotationPhase } from "./bodyData.js?v=a2360b7fc1";
import { buildCelestial } from "./celestial.js?v=a2360b7fc1";
import { DWARFS, COMETS, PROBES, asOrbit, bodyXYZ, probeXYZ, buildBelts } from "./smallbodies.js?v=a2360b7fc1";
import { GAL_OBJECTS, GAL_TYPES } from "./galacticobjects.js?v=a2360b7fc1";
import { epochAccuracy, epochLabel } from "./accuracy.js?v=a2360b7fc1";

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

const state = {
  az: 0.7, el: 0.45, radius: 26, savedRadius: 26, offsetYears: 0,
  active: false, exaggeration: 1, trueScale: false, animate: true,
  yearsPerSec: 0.5, // solar-system animation rate (sim years per real second) — fast enough to see the giants orbit
  galSpeed: 2,      // galaxy-view rate (millions of years per real second), decoupled from the planetary rate
  showOrbits: true, showSky: true, showConst: true, showLabels: true, showSunEq: true, useTextures: true, galaxy: false,
  showSmall: true, // belts + dwarf planets + comets + spacecraft (the illustrative small-body layer)
  galDeepSky: true, // nebulae / pulsars / black holes / nearby stars in the Milky-Way view
  topDown: false, preTopRadius: 0, // "Top-down map" view — folds in the former standalone 2-D Solar System surface
  // Camera: orbit around `anchor` (a body name; "Sun" = origin) or a free-fly camera (WASD + look).
  anchor: "Sun", freeFly: false, freePos: [18, 18, 12], yaw: -2.3, pitch: -0.4, flySpeed: 4, keys: new Set(),
  renderUnix: Date.now() / 1000, simElapsed: 0, galYears: 0, selected: null, backend: "",
  bodies: [], lastTick: 0,
};

const DRAW_LIST = ["Sun", ...PLANET_ORDER, "Moon"];

// ---------------------------------------------------------------- mat/vec helpers (column-major)
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye, c, up) {
  const z = norm(sub(eye, c)), x = norm(cross(up, z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const translate = (t) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
const scaleM = (s) => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1];
function normalMat3(m) { return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]; }

const D2R = Math.PI / 180, ECL_J2000 = 23.43928 * D2R;
// Equatorial-J2000 (ICRS) unit vector → ecliptic-J2000 world frame (rotate −ε about x).
function eclFromEqu(v) {
  const c = Math.cos(ECL_J2000), s = Math.sin(ECL_J2000);
  return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c];
}

// Physically-correct body orientation per the IAU WGCCRE 2015 convention, as a column-major mat4
// (rotation only). The spin axis is the IAU pole (α0, δ0); the prime meridian is measured by the
// rotation angle W = W0 + Ẇ·d from the ascending node of the body's equator on the ICRS equator
// (RA = α0 + 90°). This fixes the ABSOLUTE phase — so the right meridian/hemisphere faces the Sun at
// any time t — rather than spinning from an arbitrary reference. Ẇ<0 (Venus, Uranus) → retrograde.
function iauRotation(phys, unixSeconds) {
  const a0 = phys.poleRaDeg * D2R, d0 = phys.poleDecDeg * D2R, w = rotationPhase(phys, unixSeconds);
  const pole = norm(eclFromEqu([Math.cos(d0) * Math.cos(a0), Math.cos(d0) * Math.sin(a0), Math.sin(d0)]));
  const node = norm(eclFromEqu([-Math.sin(a0), Math.cos(a0), 0])); // ascending node of the equator (RA=α0+90°)
  const pxn = cross(pole, node);                                    // node rotated +90° about the pole (eastward)
  const cw = Math.cos(w), sw = Math.sin(w);
  const x = norm([node[0] * cw + pxn[0] * sw, node[1] * cw + pxn[1] * sw, node[2] * cw + pxn[2] * sw]); // prime meridian
  const y = cross(pole, x);                                         // +90° east longitude
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, pole[0], pole[1], pole[2], 0, 0, 0, 0, 1];
}

// ---------------------------------------------------------------- sphere + ring + quad geometry
function buildSphere(stacks, slices) {
  const pos = [], idx = [];
  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks, phi = v * Math.PI;       // 0..π, pole at +z
    const z = Math.cos(phi), r = Math.sin(phi);
    for (let j = 0; j <= slices; j++) {
      const u = j / slices, th = u * 2 * Math.PI;
      pos.push(r * Math.cos(th), r * Math.sin(th), z);  // unit sphere; normal == position
    }
  }
  const row = slices + 1;
  for (let i = 0; i < stacks; i++) for (let j = 0; j < slices; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
}

// A ring annulus in the body's equatorial (xy) plane, radii in AU, vertex-coloured from the real
// km structure (C/B/A brightness + the Cassini Division gap). Returns interleaved [x,y,z,r,g,b,a].
function buildRing(rings, rEqAU, radiusKm) {
  const inner = (rings.innerKm / radiusKm) * rEqAU;
  const outer = (rings.outerKm / radiusKm) * rEqAU;
  const RAD = 56, ANG = 120, v = [];
  const colorAt = (rAU) => {
    const km = (rAU / rEqAU) * radiusKm;
    if (rings.gaps) for (const [g0, g1] of rings.gaps) if (km > g0 && km < g1) return [0, 0, 0, 0];
    if (!rings.gaps) return [0.62, 0.64, 0.66, 0.16]; // faint Uranus/Neptune rings
    let a, tint;
    if (km < 92000) { a = 0.18; tint = [0.55, 0.50, 0.42]; }        // C ring (dim)
    else if (km < 117580) { a = 0.78; tint = [0.86, 0.78, 0.60]; }  // B ring (bright)
    else { a = 0.5; tint = [0.78, 0.72, 0.56]; }                    // A ring
    return [tint[0], tint[1], tint[2], a];
  };
  for (let i = 0; i < RAD; i++) {
    const f0 = i / RAD, f1 = (i + 1) / RAD;
    const r0 = inner + (outer - inner) * f0;
    const r1 = inner + (outer - inner) * f1;
    const c0 = colorAt(r0), c1 = colorAt(r1);
    for (let j = 0; j < ANG; j++) {
      const t0 = (j / ANG) * 2 * Math.PI, t1 = ((j + 1) / ANG) * 2 * Math.PI;
      const p = (r, t, c, f) => v.push(r * Math.cos(t), r * Math.sin(t), 0, c[0], c[1], c[2], c[3], f);
      p(r0, t0, c0, f0); p(r1, t0, c1, f1); p(r1, t1, c1, f1);
      p(r0, t0, c0, f0); p(r1, t1, c1, f1); p(r0, t1, c0, f0);
    }
  }
  return new Float32Array(v);
}

function ellipse3d(b) {
  const a = b.a_au, e = b.ecc;
  const inc = b.inc_deg * Math.PI / 180, node = b.node_deg * Math.PI / 180, argp = b.argp_deg * Math.PI / 180;
  const co = Math.cos(argp), so = Math.sin(argp), cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc), bm = a * Math.sqrt(1 - e * e), pts = [];
  for (let k = 0; k <= 160; k++) {
    const ea = (k / 160) * 2 * Math.PI, xp = a * (Math.cos(ea) - e), yp = bm * Math.sin(ea);
    pts.push([(co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
      (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp, (so * si) * xp + (co * si) * yp]);
  }
  return pts;
}

// ---------------------------------------------------------------- GLSL
const NOISE = `
float h31(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
float craters(vec3 p,float sc){ p*=sc; vec3 ip=floor(p); float best=1e9,rnd=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){ vec3 c=ip+vec3(x,y,z);
    vec3 o=vec3(h31(c),h31(c+11.0),h31(c+23.0)); float rad=0.32+0.5*h31(c+37.0);
    float d=length(p-(c+o))/rad; if(d<best){ best=d; rnd=h31(c+53.0);} }
  float rim=smoothstep(1.05,0.92,best)-smoothstep(0.92,0.6,best); // bright rim, dark floor
  float floor_=smoothstep(0.9,0.0,best); return rim*0.5 - floor_*0.28*rnd; }
`;

const SPHERE_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm;
uniform mat4 u_mvp; uniform mat4 u_model; uniform mat3 u_nmat;
out vec3 v_obj; out vec3 v_world; out vec3 v_nrm;
void main(){ v_obj=a_pos; v_world=(u_model*vec4(a_pos,1.0)).xyz; v_nrm=normalize(u_nmat*a_nrm); gl_Position=u_mvp*vec4(a_pos,1.0); }`;

const SPHERE_FS = `#version 300 es
precision highp float;
in vec3 v_obj; in vec3 v_world; in vec3 v_nrm; out vec4 o;
uniform int u_style; uniform int u_mode; uniform float u_time;
uniform vec3 u_base; uniform vec3 u_light; uniform vec3 u_cam; uniform vec3 u_atmo; uniform float u_atmoStr;
uniform int u_useTex; uniform sampler2D u_tex;
${NOISE}
void main(){
  vec3 N=normalize(v_nrm); vec3 V=normalize(u_cam-v_world); vec3 p=normalize(v_obj);
  float lat=p.z; float fres=pow(1.0-clamp(dot(N,V),0.0,1.0),3.0);
  if(u_mode==2){ // atmosphere limb halo (additive shell)
    o=vec4(u_atmo*pow(1.0-clamp(dot(N,V),0.0,1.0),2.2)*u_atmoStr*1.4, 1.0); return; }
  if(u_mode==1){ // Sun
    if(u_useTex==1){ // the real, latest SDO disk — projected orthographically toward the camera so the
      // visible hemisphere always shows the genuine solar disk (sunspots, granulation) from any angle.
      vec3 ax=normalize(u_cam);
      vec3 R=normalize(cross(vec3(0.0,0.0,1.0),ax));
      vec3 U=cross(ax,R);
      vec2 d=vec2(dot(N,R),dot(N,U))*0.4565;                 // 0.4565 = disk radius / SDO frame width
      vec3 sc=texture(u_tex, vec2(0.5+d.x, 0.5-d.y)).rgb;
      float lb=pow(clamp(dot(N,ax),0.0,1.0),0.45);           // gentle limb darkening to read as a sphere
      o=vec4(sc*(0.65+0.5*lb), 1.0); return; }
    // procedural fallback: emissive granulation + sunspots + limb darkening
    float g=fbm(p*9.0+vec3(u_time*0.06)); float fac=fbm(p*22.0+vec3(u_time*0.1));
    float spot=smoothstep(0.60,0.55,fbm(p*3.2+vec3(5.0)));
    vec3 c=mix(vec3(1.0,0.50,0.10),vec3(1.0,0.92,0.55),0.45+0.6*g);
    c+=vec3(0.25,0.18,0.05)*smoothstep(0.6,0.95,fac); // faculae
    c=mix(c,vec3(0.30,0.13,0.05),spot*0.9);
    float limb=pow(clamp(dot(N,V),0.0,1.0),0.45); c*=0.55+0.7*limb;
    o=vec4(c,1.0); return; }
  vec3 col=u_base;
  if(u_useTex==1){ float uu=0.5+atan(p.y,p.x)*0.1591549431; float vv=acos(clamp(p.z,-1.0,1.0))*0.3183098862; col=texture(u_tex,vec2(uu,vv)).rgb; }
  else if(u_style==1){ col=vec3(0.55,0.51,0.46)*(0.75+0.5*fbm(p*6.0)); col+=craters(p,7.0); }       // Mercury
  else if(u_style==9){ float mare=smoothstep(0.52,0.46,fbm(p*2.4+vec3(3.0)));                   // Moon
        col=mix(vec3(0.62,0.61,0.58),vec3(0.30,0.30,0.31),mare); col+=craters(p,8.0); }
  else if(u_style==2){ float c=fbm(p*4.0+vec3(u_time*0.03,0,0));                                // Venus
        col=mix(vec3(0.86,0.78,0.55),vec3(0.97,0.93,0.78),c); }
  else if(u_style==3){ float cont=fbm(p*2.3+vec3(11.0));                                        // Earth
        float land=smoothstep(0.50,0.54,cont); float ice=smoothstep(0.80,0.90,abs(lat));
        vec3 ground=mix(vec3(0.16,0.40,0.15),vec3(0.50,0.42,0.25),smoothstep(0.25,0.6,fbm(p*5.0)));
        ground=mix(ground,vec3(0.22,0.34,0.13),smoothstep(0.0,0.4,abs(lat))*0.4);
        vec3 surf=mix(vec3(0.04,0.20,0.42),ground,land); surf=mix(surf,vec3(0.95,0.96,0.98),ice);
        float cl=smoothstep(0.58,0.78,fbm(p*3.2+vec3(u_time*0.02,0.0,0.0))); col=mix(surf,vec3(1.0),cl*0.55); }
  else if(u_style==4){ float a=fbm(p*3.4+vec3(7.0));                                            // Mars
        col=mix(vec3(0.78,0.36,0.22),vec3(0.55,0.26,0.16),a); col+=craters(p,6.0)*0.6;
        col=mix(col,vec3(0.95,0.95,0.97),smoothstep(0.86,0.95,abs(lat))); }
  else if(u_style==5){ float warp=fbm(p*vec3(3.0,8.0,3.0));                                     // Jupiter
        float b=sin(lat*22.0+1.6*warp); vec3 zone=vec3(0.92,0.85,0.70),belt=vec3(0.72,0.52,0.36);
        col=mix(belt,zone,smoothstep(-0.3,0.3,b)); col*=0.9+0.2*fbm(p*vec3(10.0,3.0,10.0));
        float lon=atan(p.y,p.x); float grs=smoothstep(0.16,0.0,length(vec2((lon-2.2),(lat+0.34)*2.0)));
        col=mix(col,vec3(0.80,0.34,0.22),grs); }
  else if(u_style==6){ float warp=fbm(p*vec3(3.0,7.0,3.0));                                     // Saturn
        float b=sin(lat*18.0+1.4*warp); col=mix(vec3(0.80,0.72,0.52),vec3(0.95,0.90,0.72),smoothstep(-0.3,0.3,b)); }
  else if(u_style==7){ float b=sin(lat*10.0+fbm(p*4.0));                                        // Uranus
        col=mix(vec3(0.58,0.83,0.86),vec3(0.72,0.92,0.93),0.5+0.5*b); }
  else if(u_style==8){ float warp=fbm(p*vec3(3.0,6.0,3.0));                                     // Neptune
        float b=sin(lat*9.0+1.2*warp); col=mix(vec3(0.18,0.34,0.78),vec3(0.30,0.46,0.88),0.5+0.5*b);
        float lon=atan(p.y,p.x); col=mix(col,vec3(0.10,0.16,0.40),smoothstep(0.14,0.0,length(vec2(lon+1.0,(lat-0.3)*2.0)))); }
  float lambert=max(dot(N,normalize(u_light)),0.0);
  float shade=0.05+0.95*lambert;
  col*=shade;
  col+=u_atmo*fres*u_atmoStr*(0.25+0.75*lambert); // atmospheric scattering on the disc rim
  o=vec4(col,1.0);
}`;

const LINE_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_col;
uniform mat4 u_vp; out vec3 v_col; void main(){ v_col=a_col; gl_Position=u_vp*vec4(a_pos,1.0); }`;
const LINE_FS = `#version 300 es
precision highp float; in vec3 v_col; out vec4 o; uniform float u_alpha;
void main(){ o=vec4(v_col,u_alpha); }`;

const RING_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec4 a_col; layout(location=2) in float a_frac;
uniform mat4 u_mvp; out vec4 v_col; out float v_frac;
void main(){ v_col=a_col; v_frac=a_frac; gl_Position=u_mvp*vec4(a_pos,1.0); }`;
const RING_FS = `#version 300 es
precision highp float; in vec4 v_col; in float v_frac; out vec4 o; uniform int u_useTex; uniform sampler2D u_tex;
void main(){ vec4 c=v_col; if(u_useTex==1){ vec4 t=texture(u_tex, vec2(v_frac,0.5)); c=vec4(t.rgb*1.05, t.a); } if(c.a<0.02) discard; o=c; }`;

const PT_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in float a_size; layout(location=2) in vec4 a_col;
uniform mat4 u_vp; uniform float u_dpr; uniform float u_shearT; uniform float u_shearK; uniform float u_shearRc;
out vec4 v_col;
void main(){
  v_col=a_col;
  vec3 p=a_pos;
  // Differential (galactic) rotation: a flat rotation curve gives angular speed Ω(r)=K/r, so inner
  // stars lap outer ones and any spiral feature shears/winds up over time (the "winding problem").
  // Inside Rc the disc turns rigidly (Ω=K/Rc), which both matches a real galaxy's rising inner curve
  // and avoids the r→0 singularity. u_shearT=0 (every non-galaxy draw) ⇒ no rotation.
  if(u_shearT!=0.0){
    float r=max(length(p.xy),u_shearRc);
    float ang=u_shearK/r*u_shearT;
    float c=cos(ang), s=sin(ang);
    p.xy=vec2(c*p.x - s*p.y, s*p.x + c*p.y);
  }
  gl_Position=u_vp*vec4(p,1.0); gl_PointSize=a_size*u_dpr;
}`;
const PT_FS = `#version 300 es
precision highp float; in vec4 v_col; out vec4 o; uniform float u_soft;
void main(){ float d=length(gl_PointCoord-vec2(0.5))*2.0; if(d>1.0) discard;
  float a=mix(step(d,1.0), smoothstep(1.0,0.0,d), u_soft); o=vec4(v_col.rgb, v_col.a*a); }`;

const GLOW_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform mat4 u_vp; uniform vec3 u_center; uniform vec3 u_right; uniform vec3 u_up; uniform float u_size;
out vec2 v_uv; void main(){ v_uv=a_corner; vec3 w=u_center+(a_corner.x*u_right+a_corner.y*u_up)*u_size;
  gl_Position=u_vp*vec4(w,1.0); }`;
const GLOW_FS = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o; uniform vec3 u_color; uniform float u_pow;
void main(){ float r=length(v_uv); if(r>1.0) discard; float a=pow(1.0-r,u_pow); o=vec4(u_color*a,a); }`;

// ---------------------------------------------------------------- WebGL2 renderer
let gl, P = {}, sphere, quadBuf, cel, celBufs = {}, particles = null;
let bodyBuf, ringBufs = {}, sceneLineBuf, sceneRanges = [];
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
    img.src = "textures/" + file;
  }
  const ring = new Image();
  ring.onload = () => { try { ringTex = { tex: makeTexture(ring, false), ready: true }; repaint(); } catch (e) {} };
  ring.onerror = () => {};
  ring.src = "textures/saturn_ring.png";
  // The real, latest Sun (NASA SDO HMI continuum) for the 3-D Sun's surface — served same-origin from
  // textures/ (sdo.gsfc.nasa.gov sends no CORS header, so a remote image can't be a WebGL texture).
  // tools/fetch_textures.py downloads the latest disk to textures/sun.jpg; absent → procedural shader.
  const sun = new Image();
  sun.onload = () => { try { sunTex = { tex: makeTexture(sun, false), ready: true }; repaint(); } catch (e) { console.warn("sun texture", e.message); } };
  sun.onerror = () => {};
  sun.src = "textures/sun.jpg";
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
  gl = canvas.getContext("webgl2", { antialias: true, depth: true, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  try {
    P.sphere = program(SPHERE_VS, SPHERE_FS);
    P.line = program(LINE_VS, LINE_FS);
    P.ring = program(RING_VS, RING_FS);
    P.pt = program(PT_VS, PT_FS);
    P.glow = program(GLOW_VS, GLOW_FS);
  } catch (e) { console.error("orrery shader error:", e.message); return null; }
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
  bodyBuf = gl.createBuffer();
  for (const name of ["bg", "mw", "bright", "marker", "wind", "galaxy", "galGuide", "galTrail", "beltA", "beltK", "smallMark", "galObj"]) celBufs[name] = gl.createBuffer();

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
  cel = buildCelestial();
  // background stars → [x,y,z,size,r,g,b,a]. (buildCelestial reports the count as `.count`.)
  const pack = (items, color) => {
    const n = items.count;
    const a = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      a.set([items.pos[i * 3], items.pos[i * 3 + 1], items.pos[i * 3 + 2], items.size[i],
        color[0], color[1], color[2], items.bright[i]], i * 8);
    }
    return a;
  };
  const bg = pack(cel.bgStars, [0.86, 0.90, 1.0]);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.bg); gl.bufferData(gl.ARRAY_BUFFER, bg, gl.STATIC_DRAW);
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
// A face-on model of our Galaxy showing where the Sun sits: the Sun orbits ~8.18 kpc (≈26,700 ly)
// from the centre, in the Orion Spur between the Sagittarius and Perseus arms. Scale: 1 world unit
// ≈ 0.326 kpc (≈1,063 ly); disc radius ~15 kpc. Logarithmic spiral arms + a central bar/bulge.
const GAL_UNIT_KPC = 0.326;           // kpc per world unit
const GAL_SUN_R = 8.178 / GAL_UNIT_KPC; // Sun's galactocentric distance (GRAVITY Collab. 2019)

// --- The Sun's galactic orbit, so the Milky-Way view carries the transit of time ---
// A "galactic year" is the time for one lap: T = 2π·R0 / Θ0, with R0 = 8.178 kpc and the local
// circular speed Θ0 ≈ 230 km/s → ≈ 2.18×10^8 yr. The Sun's azimuth advances at ω = 2π/T. NOTE the
// scale: over the ±5000-yr orbit scrubber the Sun moves only ω·5000 ≈ 0.008° here (sub-pixel), so the
// *visible* motion comes from animating — the Time-speed slider, scaled to millions of years per second.
const GAL_THETA0 = 2.4;                                          // the Sun's current galactocentric azimuth (rad)
const GAL_SPEED_KMS = 230;                                       // local circular speed Θ0
const GAL_PERIOD_YR = (2 * Math.PI * 8.178 * 3.0856776e16) / GAL_SPEED_KMS / 3.15576e7; // ≈ 2.18e8 yr
const GAL_OMEGA = (2 * Math.PI) / GAL_PERIOD_YR;                 // rad per year
// Differential rotation (flat curve): Ω(r) = GAL_SHEAR_K / max(r, Rc), in world units. Negative ⇒ the
// disc turns the same (clockwise) sense as the Sun, and at the Sun's radius Ω = GAL_OMEGA exactly, so
// the Sun stays embedded in its neighbourhood while the inner disc laps it and the arms wind up.
const GAL_SHEAR_K = -(GAL_OMEGA * GAL_SUN_R);                    // V_circ in world·rad/yr (Ω·r is constant)
const GAL_SHEAR_RC = 6.0;                                        // ≈2 kpc: rigid inner rotation below this
// CPU twin of the point shader's differential rotation — so discrete objects (deep-sky landmarks) and
// their text labels orbit the galactic centre in lockstep with the sheared disc.
function galShear(p, galYears) {
  if (!galYears) return p;
  const r = Math.max(Math.hypot(p[0], p[1]), GAL_SHEAR_RC);
  const ang = (GAL_SHEAR_K / r) * galYears, c = Math.cos(ang), s = Math.sin(ang);
  return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
}
function sunGalacticPos(years) {
  const th = GAL_THETA0 - GAL_OMEGA * years;                     // azimuth at this galactic time
  return [GAL_SUN_R * Math.cos(th), GAL_SUN_R * Math.sin(th), 0];
}
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

function buildGalaxyBuffers() {
  const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(99173);
  const pts = [];
  const ARMS = 4, PITCH = 12.5 * Math.PI / 180, B = 1 / Math.tan(PITCH), RMAX = 46;
  // Spiral-arm stars
  for (let i = 0; i < 5200; i++) {
    const arm = i % ARMS;
    const t = Math.pow(rng(), 0.5);
    const r = 3 + t * (RMAX - 3);
    const theta = arm * (2 * Math.PI / ARMS) + Math.log(r / 3) * B + (rng() - 0.5) * 0.5;
    const spread = 1.2 + r * 0.10;
    const rx = (rng() - 0.5) * spread, ry = (rng() - 0.5) * spread;
    const x = r * Math.cos(theta) + rx, y = r * Math.sin(theta) + ry;
    const z = (rng() - 0.5) * (1.4 - 0.9 * Math.min(1, r / RMAX)) * 1.6;
    const hii = rng() > 0.93;
    const col = hii ? [1.0, 0.5, 0.6] : (rng() > 0.5 ? [0.8, 0.86, 1.0] : [0.95, 0.95, 0.92]);
    const a = 0.5 + 0.5 * rng();
    pts.push(x, y, z, hii ? 2.6 : 1.5 + rng(), col[0], col[1], col[2], a);
  }
  // Central bulge / bar
  for (let i = 0; i < 2000; i++) {
    const u = rng(), r = Math.pow(u, 1.6) * 9;
    const th = rng() * 2 * Math.PI;
    const bar = 1 + 0.8 * Math.abs(Math.cos(th)); // slight bar elongation
    const x = r * bar * Math.cos(th), y = r * Math.sin(th), z = (rng() - 0.5) * (3.2 - r * 0.2);
    pts.push(x, y, z, 1.4 + rng() * 1.2, 1.0, 0.86, 0.62, 0.5 + 0.5 * rng());
  }
  // Diffuse disc haze
  for (let i = 0; i < 1400; i++) {
    const r = Math.sqrt(rng()) * RMAX, th = rng() * 2 * Math.PI;
    pts.push(r * Math.cos(th), r * Math.sin(th), (rng() - 0.5) * 2.0, 0.9, 0.7, 0.75, 0.95, 0.18 + 0.2 * rng());
  }
  const sunPos = sunGalacticPos(0);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galaxy);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
  celBufs.galaxyCount = pts.length / 8;

  // Reference rings at the Sun's orbit + galactocentric radii (with kly labels), as line strips.
  const guide = [], ranges = [];
  const ring = (rad, col) => {
    const first = guide.length / 6;
    for (let k = 0; k <= 128; k++) { const a = k / 128 * 2 * Math.PI; guide.push(Math.cos(a) * rad, Math.sin(a) * rad, 0, col[0], col[1], col[2]); }
    ranges.push({ first, count: 129 });
  };
  for (const kpc of [4, 8.178, 12, 16]) ring(kpc / GAL_UNIT_KPC, kpc === 8.178 ? [0.95, 0.78, 0.30] : [0.25, 0.3, 0.42]);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galGuide);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(guide), gl.STATIC_DRAW);
  galaxy = {
    sunPos, ranges,
    labels: [
      { name: "◎ Galactic Centre (Sgr A*)", p: [0, 0, 0] },
      { name: "☉ Sun — you are here (~26,700 ly out)", p: sunPos, sun: true },
      { name: "Perseus Arm", p: [-30, 14, 0] },
      { name: "Sagittarius Arm", p: [18, -22, 0] },
      { name: "Sun's orbit ≈ 26,700 ly", p: [GAL_SUN_R * Math.cos(-0.5), GAL_SUN_R * Math.sin(-0.5), 0] },
    ],
  };
  buildGalObjects();
}

// Galactic (l, b, distance-kpc) → the galaxy view's world frame: l=0 points from the Sun to the
// galactic centre, l=90° along the Sun's direction of rotation, b toward the north galactic pole.
function galacticToWorld(lDeg, bDeg, dKpc) {
  const S = sunGalacticPos(0), th = GAL_THETA0;
  const gc = [-Math.cos(th), -Math.sin(th)];   // toward the galactic centre (l = 0)
  const rot = [Math.sin(th), -Math.cos(th)];   // direction of galactic rotation (l = 90°)
  const l = lDeg * D2R, b = bDeg * D2R, d = dKpc / GAL_UNIT_KPC, cb = Math.cos(b);
  const e0 = cb * Math.cos(l), e1 = cb * Math.sin(l);
  return [S[0] + d * (e0 * gc[0] + e1 * rot[0]), S[1] + d * (e0 * gc[1] + e1 * rot[1]), S[2] + d * Math.sin(b)];
}

// Place the deep-sky landmark objects (nebulae, pulsars, black holes, nearby stars…) at their true
// positions relative to the Sun, and upload them as one colour-coded point buffer.
let galObjects = [];
function buildGalObjects() {
  galObjects = GAL_OBJECTS.map((o) => {
    const t = GAL_TYPES[o.type] || GAL_TYPES.star;
    return { name: o.n, pos: galacticToWorld(o.l, o.b, o.d), type: o.type, note: o.note, col: t.col, size: t.size, tag: t.tag };
  });
  const a = new Float32Array(galObjects.length * 8);
  galObjects.forEach((o, i) => a.set([o.pos[0], o.pos[1], o.pos[2], o.size, o.col[0], o.col[1], o.col[2], 1.0], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galObj); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
  celBufs.galObjCount = galObjects.length;
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
  if (!particles) return;
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
function rebuildPositions() {
  try {
    const snap = systemSnapshot(state.renderUnix);
    state.bodies = snap.bodies || [];
  } catch (e) { console.error("orrery snapshot failed:", e); }
  buildSceneLines();
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

function buildSceneLines() {
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
  // drop-lines from each planet to the ecliptic
  for (const b of state.bodies) { if (b.x_au == null) continue; push([[b.x_au, b.y_au, b.z_au], [b.x_au, b.y_au, 0]], [0.42, 0.47, 0.58], "lines"); }

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

  gl.bindBuffer(gl.ARRAY_BUFFER, sceneLineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
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

// ---------------------------------------------------------------- DOM labels
const labelEls = [];
function updateLabels(canvas, vp, skyVp) {
  const host = document.getElementById("orreryLabels"); if (!host) return;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  host.style.left = canvas.offsetLeft + "px"; host.style.top = canvas.offsetTop + "px";
  host.style.width = cw + "px"; host.style.height = ch + "px";
  const items = [];
  if (state.galaxy) {
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
function fmt(n, d = 0) { return n == null || !isFinite(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }); }
function showDetail(name) {
  const host = document.getElementById("orreryDetail"); if (!host) return;
  const phys = BODY[name]; const live = state.bodies.find((b) => b.name === name);
  host.textContent = "";
  if (!phys) { host.innerHTML = '<div class="sky-row">Click the Sun or a planet to inspect its facts.</div>'; return; }
  const card = document.createElement("div"); card.className = "sky-row system-detail";
  const h = document.createElement("strong"); h.textContent = name; card.appendChild(h);
  const blurb = document.createElement("p"); blurb.className = "time-frame-label"; blurb.textContent = phys.blurb; card.appendChild(blurb);
  const dl = document.createElement("dl"); dl.className = "detail-grid";
  const add = (k, v) => { if (v == null) return; const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd); };
  add("Equatorial radius", `${fmt(phys.radiusKm)} km${phys.polarKm !== phys.radiusKm ? ` · oblate (polar ${fmt(phys.polarKm)} km)` : ""}`);
  add("Surface gravity", `${phys.gravity.toFixed(2)} m/s² · escape ${phys.escapeKms.toFixed(1)} km/s`);
  add("Mean density", `${phys.densityGcm3.toFixed(3)} g/cm³`);
  const rh = phys.rotationHours, retro = rh < 0;
  add("Rotation (sidereal)", `${fmt(Math.abs(rh), 2)} h${Math.abs(rh) > 48 ? ` (${(Math.abs(rh) / 24).toFixed(2)} d)` : ""}${retro ? " · retrograde" : ""}`);
  add("Axial tilt", `${phys.tiltDeg.toFixed(2)}°`);
  add("Magnetic field", phys.magnetosphere ? (phys.magDipoleEarth >= 1 ? `global dipole ~${fmt(phys.magDipoleEarth)}× Earth` : phys.magDipoleEarth > 0 ? `weak dipole (~${(phys.magDipoleEarth).toExponential(1)}× Earth)` : "intrinsic field") : "no global field");
  add("Atmosphere", isFinite(phys.atmosphere.pressureBar) && phys.atmosphere.pressureBar > 0 ? `${phys.atmosphere.pressureBar < 0.001 ? phys.atmosphere.pressureBar.toExponential(1) : fmt(phys.atmosphere.pressureBar, 3)} bar — ${phys.atmosphere.composition}` : phys.atmosphere.composition);
  add("Mean temperature", `${fmt(phys.meanTempK)} K (${fmt(phys.meanTempK - 273)} °C)`);
  if (phys.rings) add("Rings", `${fmt(phys.rings.innerKm)}–${fmt(phys.rings.outerKm)} km from centre${phys.rings.gaps ? " · Cassini Division" : ""}`);
  if (live) {
    add("Distance from Sun", `${live.dist_au.toFixed(3)} AU`);
    add("Distance from Earth", `${live.geo_dist_au.toFixed(3)} AU · light ${(live.geo_dist_au * 8.317).toFixed(1)} min`);
    add("Orbital speed", `${live.speed_kms.toFixed(2)} km/s`);
    if (live.illuminated_fraction != null) add("Illuminated", `${(live.illuminated_fraction * 100).toFixed(1)}% · phase ${live.phase_angle_deg.toFixed(1)}°`);
    if (live.magnitude != null) add("Apparent magnitude", live.magnitude.toFixed(1));
  } else if (name === "Sun") {
    add("Luminosity", "3.828×10²⁶ W");
    add("Composition", "73% H, 25% He (by mass)");
  }
  card.appendChild(dl); host.appendChild(card);
}

// ---------------------------------------------------------------- animation loop
let rafId = 0;
function tick(now) {
  if (!state.active) { rafId = 0; return; }
  const dt = state.lastTick ? Math.min(0.05, (now - state.lastTick) / 1000) : 0.016;
  state.lastTick = now;
  if (state.animate) {
    if (state.galaxy) {
      state.galYears += dt * galYearsPerSec(); // the Sun travels its galactic orbit as time runs
      updateGalaxySun();
    } else {
      state.simElapsed += dt * state.yearsPerSec * YR; // YR seconds per sim-year ⇒ visible outer-planet motion
      state.renderUnix = effectiveBaseUnix() + state.simElapsed;
      rebuildPositions();
      stepParticles(dt);
    }
  }
  if (state.freeFly) flyStep(dt);
  paint();
  rafId = requestAnimationFrame(tick);
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
    if (lbl) lbl.textContent = "Galactic time (Myr / sec)";
  } else {
    s.min = "0.02"; s.max = "5"; s.step = "0.02"; s.value = String(state.yearsPerSec);
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
    if (hint) hint.textContent = "Free-fly camera: click the view, then W/A/S/D to move, R/F (or E/Q) for up/down, Shift to boost, drag to look, scroll to thrust forward. Untick Free fly to return to orbit.";
  } else if (hint) {
    hint.textContent = "Lit, textured worlds at their true VSOP2013 positions — real NASA surface maps, correct sizes, axial tilts, sidereal spin, rings, the Moon beside Earth, an animated Sun, and the real sky behind them. Drag to orbit, scroll to zoom, click a body to inspect it.";
  }
  paint();
}

// ---------------------------------------------------------------- lifecycle
export async function enterOrrery() {
  state.active = true;
  const canvas = document.getElementById("orreryCanvas"); if (!canvas) return;
  canvas.style.display = "block";
  try {
    await loadSkyEngine();
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
}

// ---------------------------------------------------------------- interaction
(function attach() {
  const canvas = document.getElementById("orreryCanvas"); if (!canvas) return;
  canvas.tabIndex = 0;
  const clampR = (r) => Math.max(0.6, Math.min(160, r));
  const pointers = new Map(); let lx = 0, ly = 0, pinch = 0, downX = 0, downY = 0, moved = false;
  const spread = () => { const p = [...pointers.values()]; return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0; };

  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); lx = e.clientX; ly = e.clientY;
    downX = e.clientX; downY = e.clientY; moved = false;
    if (pointers.size === 2) pinch = spread();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const drop = (e) => { pointers.delete(e.pointerId); try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} };
  canvas.addEventListener("pointerup", (e) => { if (!moved) pick(e); drop(e); });
  canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) { const d = spread(); if (pinch > 0 && d > 0) { state.radius = clampR(state.radius * (pinch / d)); pinch = d; if (!state.animate) paint(); } return; }
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
  bind("orrerySize", "input", (e) => { state.exaggeration = Number(e.target.value); ringBufs = {}; paint(); });
  bind("orreryTrueScale", "change", (e) => { state.trueScale = e.target.checked; ringBufs = {}; paint(); });
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
      if (insight) insight.textContent = "Lit, textured worlds at their true VSOP2013 positions — real NASA surface maps, correct sizes, axial tilts, sidereal spin, rings, the Moon beside Earth, an animated Sun, and the real sky behind them. Drag to orbit, scroll to zoom, click a body to inspect it.";
      rebuildPositions();
    }
    paint();
  });

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); gl = null; P = {}; });
  canvas.addEventListener("webglcontextrestored", () => { if (state.active) { const c = document.getElementById("orreryCanvas"); initGL(c); initParticles(); rebuildPositions(); paint(); } });
  // Repaint on any size change (DPI / window / layout) so ensureSized rebuilds the backing store at
  // full resolution — fires even when rAF is throttled (background tab), unlike the animation loop.
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (state.active) paint(); }).observe(canvas);
})();
