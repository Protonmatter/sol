// Appearance gates: the parts of "what a body looks like" that are supposed to be MEASURED
// rather than chosen — moon albedo, which moons have a real published mosaic and which
// honestly cannot, the shader branches those feed, and whether Earth's committed permanent-ice
// polygons actually survive to visible pixels.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MOON_ALBEDO, MOON_ALBEDO_REFERENCE, MOON_TEXTURE_FILES, moonAlbedoGain, moonBaseColor,
} from "../../apps/web/js/moonAppearance.js";
import { MOONS } from "../../apps/web/js/moons.js";
import { STYLE_ID } from "../../apps/web/js/bodyData.js";
import { SPHERE_FS } from "../../apps/web/js/orreryShaders.js";
import { buildEarthMap } from "../../apps/web/js/surfacemap.js";

const repoFile = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

// ---------------------------------------------------------------- albedo

test("every catalogued moon carries a published geometric albedo", () => {
  for (const m of MOONS) {
    assert.ok(MOON_ALBEDO[m.n] > 0, `${m.n} has no albedo`);
  }
  // And nothing extra: a stale row would be a number with no body to attach to.
  assert.deepEqual(Object.keys(MOON_ALBEDO).sort(), MOONS.map((m) => m.n).sort());
});

test("albedo values match the JPL Horizons physical-data block", () => {
  // Spot-pins, not a re-transcription of the table: these are the rows whose value the
  // rendering argument actually rests on.
  assert.equal(MOON_ALBEDO.Enceladus, 1.04);  // most reflective body known
  assert.equal(MOON_ALBEDO.Europa, 0.67);
  assert.equal(MOON_ALBEDO.Ganymede, 0.43);
  assert.equal(MOON_ALBEDO.Callisto, 0.17);
  assert.equal(MOON_ALBEDO.Phobos, 0.06);
  assert.equal(MOON_ALBEDO_REFERENCE, 1.04);
});

test("Ganymede is drawn DIMMER than Europa — it is the largest moon, not the brightest", () => {
  // The regression this file exists for. Ganymede's radius is the largest in the solar system
  // and its albedo is 0.43 against Europa's 0.67, so size must not leak into brightness.
  const ganymede = MOONS.find((m) => m.n === "Ganymede");
  const europa = MOONS.find((m) => m.n === "Europa");
  assert.ok(ganymede.r > europa.r, "Ganymede should still be the bigger sphere");
  assert.ok(moonAlbedoGain("Ganymede") < moonAlbedoGain("Europa"));
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  assert.ok(lum(moonBaseColor(ganymede)) < lum(moonBaseColor(europa)));
});

test("display brightness is monotonic in albedo and reproduces published ratios", () => {
  const names = Object.keys(MOON_ALBEDO)
    .sort((a, b) => MOON_ALBEDO[a] - MOON_ALBEDO[b]);
  for (let i = 1; i < names.length; i++) {
    assert.ok(
      moonAlbedoGain(names[i]) >= moonAlbedoGain(names[i - 1]),
      `${names[i]} must not be dimmer than ${names[i - 1]}`,
    );
  }
  // The canvas is sRGB-encoded, so a DISPLAYED luminance ratio is the written ratio ^2.2.
  // Raising the gains back through that transfer must give the published albedo ratio.
  const displayed = (n) => moonAlbedoGain(n) ** 2.2;
  const ratio = displayed("Callisto") / displayed("Europa");
  assert.ok(Math.abs(ratio - MOON_ALBEDO.Callisto / MOON_ALBEDO.Europa) < 1e-6);
  // Enceladus is the reference, so nothing is asked to be brighter than white.
  assert.equal(moonAlbedoGain("Enceladus"), 1);
  for (const n of Object.keys(MOON_ALBEDO)) assert.ok(moonAlbedoGain(n) <= 1);
  // ...and the darkest bodies stay visible rather than collapsing to black.
  assert.ok(moonAlbedoGain("Phobos") > 0.2);
});

test("moonBaseColor keeps the catalogue HUE and takes brightness from the albedo", () => {
  const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  for (const m of MOONS) {
    const base = moonBaseColor(m);
    // Hue preserved: channel ratios unchanged from the catalogue colour.
    assert.ok(Math.abs(base[1] / base[0] - m.col[1] / m.col[0]) < 1e-9, `${m.n} hue`);
    assert.ok(Math.abs(base[2] / base[0] - m.col[2] / m.col[0]) < 1e-9, `${m.n} hue`);
    // Luminance — not the peak channel — carries the albedo, so a strongly tinted moon is not
    // quietly dimmer than a grey one at the same reflectance (this is the Io-vs-Ganymede trap).
    assert.ok(Math.abs(luma(base) - moonAlbedoGain(m.n)) < 1e-9, `${m.n} luminance`);
  }
});

// ---------------------------------------------------------------- textures

test("every moon either has a real global mosaic or a written reason it cannot", () => {
  const fetcher = repoFile("tools/fetch_textures.py");
  const noMosaic = fetcher.split("NO_MOSAIC = {")[1].split("\n}")[0];
  for (const m of MOONS) {
    const textured = Object.prototype.hasOwnProperty.call(MOON_TEXTURE_FILES, m.n);
    const excused = noMosaic.includes(`"${m.n}":`);
    assert.ok(textured !== excused, `${m.n} must be either textured or excused, not both/neither`);
  }
});

test("each moon texture file is declared in the fetcher and credited", () => {
  const fetcher = repoFile("tools/fetch_textures.py");
  for (const [moon, file] of Object.entries(MOON_TEXTURE_FILES)) {
    const key = file.replace(/\.jpg$/, "");
    const line = fetcher.split("\n").find((l) => l.trimStart().startsWith(`"${key}": (`));
    assert.ok(line, `tools/fetch_textures.py has no "${key}" entry for ${moon}`);
    assert.match(line, /https:\/\/astrogeology\.usgs\.gov\//, `${moon} must come from USGS`);
    assert.match(line, /public domain/, `${moon} needs a licence in its credit string`);
    // Partial coverage must say so in the credit, not just in a commit message.
    if (moon === "Callisto") assert.match(line, /±87\.6° latitude/);
  }
});

test("the renderer loads moon maps through the same path and toggle as the planets", () => {
  const orrery = repoFile("apps/web/js/orrery.js");
  assert.match(orrery, /\.\.\.MOON_TEXTURE_FILES/);          // one TEXTURE_FILES table
  assert.match(orrery, /state\.useTextures && textures\[m\.n\]/); // same Photo-textures toggle
  assert.match(orrery, /u_texMode, moonTex \? 2 : 0/);       // mosaic mode, else procedural
  assert.match(orrery, /u_useTex, moonTex \? 1 : 0/);        // graceful fallback when absent
});

// ---------------------------------------------------------------- shader branches

test("Europa gets its own low-crater ice style rather than the shared cratered one", () => {
  assert.equal(STYLE_ID.moonIce, 12);
  assert.match(repoFile("apps/web/js/orrery.js"), /m\.n === "Europa" \? STYLE_ID\.moonIce/);
  const branch = SPHERE_FS.split("u_style==12")[1].split("else if(u_style==")[0];
  assert.match(branch, /Bierhaus/, "the crater-count claim needs its citation in place");
  assert.match(branch, /ILLUSTRATIVE/, "the procedural lineae must be labelled, not implied real");
  // Crater amplitude has to be a small fraction of the shared rocky style's.
  const rocky = Number(/\(craters\(p,7\.0\)-[\d.]+\)\*([\d.]+)\*relief/.exec(SPHERE_FS)[1]);
  const ice = Number(/\(craters\(p,9\.0\)-[\d.]+\)\*([\d.]+)\*relief/.exec(branch)[1]);
  assert.ok(ice < rocky * 0.25, `Europa crater amplitude ${ice} is not low against ${rocky}`);
});

test("procedural moon relief is scaled by the albedo, not applied at a fixed amplitude", () => {
  assert.match(SPHERE_FS, /float relief=dot\(u_base,vec3\(0\.299,0\.587,0\.114\)\)/);
  // And the crater field is mean-corrected, so relief adds contrast without adding light.
  assert.match(SPHERE_FS, /\(craters\(p,7\.0\)-0\.127\)\*[\d.]+\*relief/);
  assert.match(SPHERE_FS, /\(craters\(p,9\.0\)-0\.121\)\*[\d.]+\*relief/);
});

test("the moon-mosaic texture mode normalises the map instead of trusting its level", () => {
  const branch = SPHERE_FS.split("u_texMode==2")[1].split("else if(u_style==")[0];
  assert.match(branch, /textureLod\(u_tex,vec2\(0\.5,0\.5\),20\.0\)/, "needs the 1x1 mip average");
  assert.match(branch, /col=u_base\*min\(pow\(clamp\(here\/mean/, "map supplies structure, u_base brightness");
  // pow() must leave 1.0 fixed, i.e. the disk MEAN has to land exactly on the albedo — a
  // multiplicative fudge in front of it would quietly detach brightness from the source.
  const exponent = Number(/pow\(clamp\(here\/mean,0\.0,[\d.]+\),([\d.]+)\)/.exec(branch)[1]);
  assert.ok(exponent > 0 && exponent < 1, "contrast exponent must damp, not invert or amplify");
});

// A JS port of the shader's own noise library, so the claim "a moon's disc average is its
// published albedo" can be CHECKED rather than asserted. The two magic constants subtracted
// from craters() in SPHERE_FS were measured this way; without this test they would be numbers
// nobody could reproduce, and any future tweak to the noise would silently detune them.
const fract = (x) => x - Math.floor(x);
function h31(px, py, pz) {
  let x = fract(px * 0.3183099 + 0.1) * 17;
  let y = fract(py * 0.3183099 + 0.1) * 17;
  let z = fract(pz * 0.3183099 + 0.1) * 17;
  return fract(x * y * z * (x + y + z));
}
const lerp = (a, b, t) => a + (b - a) * t;
function vn(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c = (dx, dy, dz) => h31(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
function fbm(x, y, z) {
  let a = 0.5, s = 0;
  for (let i = 0; i < 5; i++) { s += a * vn(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s;
}
const ss = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
function craters(px, py, pz, sc) {
  const x = px * sc, y = py * sc, z = pz * sc;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = 1e9, rnd = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        const ox = h31(cx, cy, cz);
        const oy = h31(cx + 11, cy + 11, cz + 11);
        const oz = h31(cx + 23, cy + 23, cz + 23);
        const rad = 0.32 + 0.5 * h31(cx + 37, cy + 37, cz + 37);
        const d = Math.hypot(x - (cx + ox), y - (cy + oy), z - (cz + oz)) / rad;
        if (d < best) { best = d; rnd = h31(cx + 53, cy + 53, cz + 53); }
      }
    }
  }
  return (ss(0.6, 0.92, best) - ss(0.92, 1.05, best)) * 0.5 - (1 - ss(0, 0.9, best)) * 0.28 * rnd;
}

test("each procedural moon style averages to exactly the brightness its albedo asked for", () => {
  // The shader's numeric literals, read out of the source so the test cannot drift from it.
  const rockyBias = Number(/craters\(p,7\.0\)-([\d.]+)\)/.exec(SPHERE_FS)[1]);
  const rockyAmp = Number(/\(craters\(p,7\.0\)-[\d.]+\)\*([\d.]+)\*relief/.exec(SPHERE_FS)[1]);
  const iceBias = Number(/craters\(p,9\.0\)-([\d.]+)\)/.exec(SPHERE_FS)[1]);
  const iceAmp = Number(/\(craters\(p,9\.0\)-[\d.]+\)\*([\d.]+)\*relief/.exec(SPHERE_FS)[1]);

  // Deterministic uniform directions on the sphere (a fixed LCG, so the gate never flickers).
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const N = 20000;
  let rocky = 0, ice = 0, haze = 0;
  for (let i = 0; i < N; i++) {
    const u = 2 * rand() - 1, th = 2 * Math.PI * rand(), r = Math.sqrt(1 - u * u);
    const x = r * Math.cos(th), y = r * Math.sin(th), z = u;
    // style 10 — rocky/icy moon. relief == luma(u_base) == the gain, so with u_base scaled out
    // the whole branch has to average to 1.
    rocky += 0.78 + 0.44 * fbm(x * 6, y * 6, z * 6)
      + (craters(x, y, z, 7) - rockyBias) * rockyAmp;
    // style 12 — Europa. mix(col, u_base*0.72, band) with col = u_base*(0.995 + 0.10*mott).
    const k = 0.995 + 0.10 * fbm(x * 5, y * 5, z * 5);
    const band = 1 - ss(0.004, 0.028, Math.abs(fbm(x * 2, y * 9, z * 2) - 0.5));
    ice += k * (1 - band) + 0.72 * band + (craters(x, y, z, 9) - iceBias) * iceAmp;
    // style 11 — Titan's haze.
    haze += 0.82 + 0.36 * fbm(x * 4, y * 4, z * 4);
  }
  for (const [name, mean] of [["rocky", rocky / N], ["ice", ice / N], ["haze", haze / N]]) {
    assert.ok(Math.abs(mean - 1) < 0.015,
      `${name} style averages ${mean.toFixed(4)}x u_base — brightness must come from the albedo`);
  }
});

test("Mars's procedural polar caps use the gazetteer's own bounding latitudes", () => {
  const mars = SPHERE_FS.split("u_style==4")[1].split("else if(u_style==5")[0];
  assert.match(mars, /Planum Boreum/);
  assert.match(mars, /Planum Australe/);
  assert.match(mars, /Gazetteer of Planetary Nomenclature/);
  // Boundary latitudes: Planum Boreum 80.59°N, Planum Australe 71.73°S, each feathered ±2°.
  const north = /float capN=smoothstep\(([\d.]+),([\d.]+),lat\)/.exec(mars);
  const south = /float capS=smoothstep\(([\d.]+),([\d.]+),-lat\)/.exec(mars);
  const mid = (m) => Math.asin((Number(m[1]) + Number(m[2])) / 2) * 180 / Math.PI;
  assert.ok(Math.abs(mid(north) - 80.59) < 0.35, `north cap edge at ${mid(north)}°`);
  assert.ok(Math.abs(mid(south) - 71.73) < 0.35, `south cap edge at ${mid(south)}°`);
  // Asymmetric on purpose — the southern plateau is four times the northern one.
  assert.ok(Number(south[1]) < Number(north[1]), "the caps must not be a symmetric guess again");
});

// ---------------------------------------------------------------- Earth's permanent ice

// A minimal software 2-D canvas: enough of the API for buildEarthMap, with a real scanline
// fill so the committed ice polygons are exercised the way a browser would rasterise them.
// The existing surfacemap suite checks the CALL SEQUENCE with a recording stub; this one
// checks the PIXELS, which is the only way to answer "is the ice actually visible".
function softwareCanvas() {
  class Gradient {
    constructor() { this.stops = []; }
    addColorStop(at, css) { this.stops.push([at, css]); }
    at(t) {
      let lo = this.stops[0], hi = this.stops[this.stops.length - 1];
      for (let i = 1; i < this.stops.length; i++) {
        if (this.stops[i][0] >= t) { lo = this.stops[i - 1]; hi = this.stops[i]; break; }
      }
      return rgb(t <= lo[0] ? lo[1] : hi[1]);
    }
  }
  const rgb = (css) => [
    parseInt(css.slice(1, 3), 16), parseInt(css.slice(3, 5), 16), parseInt(css.slice(5, 7), 16)];

  class Ctx {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.data = new Uint8ClampedArray(w * h * 4);
      this.subpaths = []; this.cur = null; this.fillStyle = "#000000";
    }
    createLinearGradient() { return new Gradient(); }
    createRadialGradient() { return new Gradient(); }
    beginPath() { this.subpaths = []; this.cur = null; }
    moveTo(x, y) { this.cur = [[x, y]]; this.subpaths.push(this.cur); }
    lineTo(x, y) { if (this.cur) this.cur.push([x, y]); }
    closePath() { this.cur = null; }
    save() {} restore() {} clip() {} ellipse() {}
    paint(x, y, c) {
      const i = (y * this.w + x) * 4;
      this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255;
    }
    fillRect(x0, y0, w, h) {
      const grad = this.fillStyle instanceof Gradient ? this.fillStyle : null;
      for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, y0 + h); y++) {
        const c = grad ? grad.at((y + 0.5) / this.h) : rgb(this.fillStyle);
        for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, x0 + w); x++) this.paint(x, y, c);
      }
    }
    fill(rule) {
      const c = rgb(this.fillStyle);
      for (let y = 0; y < this.h; y++) {
        const py = y + 0.5;
        const xs = [];
        for (const sp of this.subpaths) {
          for (let i = 0; i < sp.length; i++) {
            const [x1, y1] = sp[i], [x2, y2] = sp[(i + 1) % sp.length];
            if ((y1 > py) !== (y2 > py)) xs.push(x1 + (py - y1) * (x2 - x1) / (y2 - y1));
          }
        }
        if (!xs.length) continue;
        xs.sort((a, b) => a - b);
        // even-odd, which is the rule buildEarthMap asks for so holes subtract
        assert.equal(rule, "evenodd");
        for (let k = 0; k + 1 < xs.length; k += 2) {
          for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5)); x++) {
            this.paint(x, y, c);
          }
        }
      }
    }
    getImageData() { return { data: this.data }; }
    putImageData() {}
  }
  class Canvas {
    constructor(w, h) { this.width = w; this.height = h; this.ctx = new Ctx(w, h); }
    getContext() { return this.ctx; }
  }
  return Canvas;
}

test("Earth's committed permanent-ice polygons reach the surface map as visible ice", async () => {
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = softwareCanvas();
  try {
    const geo = await import("../../apps/web/js/geography.js");
    assert.ok(geo.EARTH.ice.length > 0, "the ice polygons must still be committed");
    const size = { w: 512, h: 256 }; // same rasteriser, a quarter the pixels — this is a test
    const cv = buildEarthMap(geo.EARTH, geo.decodeRing, size);
    const d = cv.getContext("2d").data;
    const at = (lonDeg, latDeg) => {
      const x = Math.min(size.w - 1, Math.floor((((lonDeg + 180) % 360 + 360) % 360) / 360 * size.w));
      const y = Math.min(size.h - 1, Math.floor((90 - latDeg) / 180 * size.h));
      const i = (y * size.w + x) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    };
    // #eef3f7 is the ice fill. "Visible" here means near-white AND clearly brighter than the
    // land tint it is painted over — the failure mode worth catching is ice drawn first and
    // then buried, or drawn in a colour indistinguishable from its surroundings.
    const white = (c) => c[0] > 210 && c[1] > 210 && c[2] > 210;
    for (const [name, lon, lat] of [["Antarctica 0°E", 0, -85], ["Antarctica 90°E", 90, -80],
      ["Greenland", -42, 72]]) {
      assert.ok(white(at(lon, lat)), `${name} should be ice, got ${at(lon, lat)}`);
    }
    for (const [name, lon, lat] of [["Atlantic", -30, 0], ["Sahara", 15, 22],
      ["Amazon", -60, -5]]) {
      assert.ok(!white(at(lon, lat)), `${name} must not be ice, got ${at(lon, lat)}`);
    }
    // And it must be a CAP, not a stray polygon: south of ~81°S the ice sheet reaches every
    // longitude, so essentially the whole band has to come out white. (Natural Earth's 1:110m
    // glaciated_areas layer stops short of the coast in places, which is why the band is taken
    // deep rather than at the Antarctic Circle.)
    let icy = 0, polar = 0;
    for (let y = Math.floor(size.h * 0.95); y < size.h; y++) {
      for (let x = 0; x < size.w; x++) {
        polar++;
        const i = (y * size.w + x) * 4;
        if (white([d[i], d[i + 1], d[i + 2]])) icy++;
      }
    }
    assert.ok(icy / polar > 0.85, `only ${(100 * icy / polar).toFixed(1)}% of the deep south is ice`);
  } finally {
    if (previous === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous;
  }
});
