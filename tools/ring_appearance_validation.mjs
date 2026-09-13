#!/usr/bin/env node
// Bounded real-WebGL regression for production ring shaders and the exact sphere
// ring-shadow block. Synthetic patches isolate display math, not photometry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { closeOwnedBrowser } from './worker_coverage.mjs';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.resolve(process.argv.find(x => x.startsWith('--web-root='))?.slice(11) || path.join(root, 'apps/web'));
const releaseFile = path.join(webRoot, 'web-release-manifest.json');
const release = fs.existsSync(releaseFile) ? JSON.parse(fs.readFileSync(releaseFile, 'utf8')) : null;
if (release) assert.equal(release.schema_version, 'web-release-manifest.v1');
const pageRoot = release ? path.resolve(webRoot, release.namespace) : webRoot;
assert.ok(pageRoot === webRoot || pageRoot.startsWith(webRoot + path.sep), 'release namespace escapes web root');
const sourceSha256 = {};
async function loadModule(name) {
  const file = path.join(pageRoot, 'js', name);
  const sha = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (release) {
    const asset = release.assets.find(a => a.path === path.relative(webRoot, file).split(path.sep).join('/'));
    assert.ok(asset, `${name} is absent from selected release`);
    assert.equal(sha, asset.sha256, `${name} differs from selected release`);
  }
  sourceSha256[name] = sha;
  return import(pathToFileURL(file).href);
}
const { RING_VS, RING_FS, SPHERE_FS } = await loadModule('orreryShaders.js');
const { BODY } = await loadModule('bodyData.js');
const { ringOpacityProfile } = await loadModule('orreryMath.js');
const out = path.resolve(root, process.argv.find(x => x.startsWith('--out='))?.slice(6) || 'coverage/rings-gpu');
assert.ok(out.startsWith(path.join(root, 'coverage') + path.sep), 'output must stay below coverage');
assert.ok(!fs.existsSync(out), 'retain previous evidence; choose a new output directory');
fs.mkdirSync(out, { recursive: true });
const start = SPHERE_FS.indexOf('  if(u_ringRad.y>0.0){');
const end = SPHERE_FS.indexOf('\n  if(reference){', start);
assert.ok(start > 0 && end > start, 'actual ring shadow block is identifiable');
const shadowBlock = SPHERE_FS.slice(start, end);
const evidence = { startedAt: new Date().toISOString(), checks: [],
  scope: 'Actual RING_VS/RING_FS and exact sphere ring-shadow block; synthetic one-pixel patches; no radiometric calibration',
  sourceSha256, releaseId: release?.release_id || null };
let browser, timer;
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'),
    headless: true, timeout: 20000, protocolTimeout: 15000,
    args: ['--no-sandbox', '--disable-background-networking', '--disable-extensions', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  timer = setTimeout(() => { void closeOwnedBrowser(browser); }, 45000);
  evidence.browser = await browser.version();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>Ring GPU regression</title><canvas width="1" height="1"></canvas>');
  const profiles = Object.fromEntries(['Saturn', 'Uranus', 'Neptune'].map(name => [name, {
    radii: [BODY[name].rings.innerKm, BODY[name].rings.outerKm], data: [...ringOpacityProfile(BODY[name].rings)],
  }]));
  evidence.samples = await page.evaluate(({ vertex, fragment, block, profiles }) => {
    const gl = document.querySelector('canvas').getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = (vs, fs) => {
      const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    };
    gl.disable(gl.BLEND); gl.disable(gl.DITHER); gl.viewport(0, 0, 1, 1);
    const ring = program(vertex, fragment);
    const shadow = program('#version 300 es\nlayout(location=0) in vec3 a_pos; void main(){gl_Position=vec4(a_pos,1);}',
      '#version 300 es\nprecision highp float; uniform vec3 p; uniform vec3 u_lightObj; uniform vec2 u_ringRad; uniform float u_oblate; uniform sampler2D u_ringTex; out vec4 o; void main(){vec3 col=vec3(1);\n' + block + '\no=vec4(col,1); }');
    const I = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
    const R = [1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1];
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const vertices = [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]];
    const pixels = () => { const out = new Uint8Array(4); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out); return [...out]; };
    const loc = (p, n) => gl.getUniformLocation(p, n);
    const patch = ({ light = [0,0,1], alpha = .5, model = I, position = [2,0,0] } = {}) => {
      gl.useProgram(ring); const e = .0001;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices.flatMap(([x,y]) => [position[0]+x*e,position[1]+y*e,position[2]])), gl.STATIC_DRAW);
      const mvp = [...I]; mvp[0]=1/e; mvp[5]=1/e; mvp[10]=0; mvp[12]=-position[0]/e; mvp[13]=-position[1]/e;
      gl.uniformMatrix4fv(loc(ring,'u_mvp'),false,mvp); gl.uniformMatrix4fv(loc(ring,'u_model'),false,model);
      gl.vertexAttrib4f(1,.55,.55,.55,alpha); gl.vertexAttrib1f(2,.5);
      gl.uniform1i(loc(ring,'u_useTex'),0); gl.uniform3fv(loc(ring,'u_center'),[0,0,0]);
      gl.uniform3fv(loc(ring,'u_light'),light); gl.uniform1f(loc(ring,'u_prad'),1);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES,0,6); return pixels();
    };
    const samples = { face: patch(), grazing: patch({light:[1,0,0]}), back: patch({light:[0,0,-1]}),
      rotated: patch({model:R}), transparent: patch({alpha:.01}), shadowed: patch({light:[-.8,0,.6], position:[1,0,0]}),
      litOblique: patch({light:[.8,0,.6], position:[1,0,0]}) };
    const shadowAt = (name, km) => {
      gl.useProgram(shadow);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices.flatMap(([x,y])=>[x,y,0])),gl.STATIC_DRAW);
      const profile = profiles[name], texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,profile.data.length,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array(profile.data));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      // p starts above the equatorial plane. A downward ray hits exactly the chosen radius.
      gl.uniform3fv(loc(shadow,'p'),[km,0,1]); gl.uniform3fv(loc(shadow,'u_lightObj'),[0,0,-1]);
      gl.uniform2fv(loc(shadow,'u_ringRad'),profile.radii); gl.uniform1f(loc(shadow,'u_oblate'),1);
      gl.uniform1i(loc(shadow,'u_ringTex'),0); gl.drawArrays(gl.TRIANGLES,0,6);
      const out=pixels(); gl.deleteTexture(texture); return out;
    };
    samples.epsilon = shadowAt('Uranus',51140); samples.uranusGap = shadowAt('Uranus',50500);
    samples.adams = shadowAt('Neptune',62930); samples.neptuneGap = shadowAt('Neptune',60000);
    samples.keeler = shadowAt('Saturn',136505); samples.aRing = shadowAt('Saturn',136450);
    samples.glError=gl.getError(); return samples;
  }, { vertex:RING_VS, fragment:RING_FS, block:shadowBlock, profiles });
  const s=evidence.samples;
  const check = (name, condition) => { evidence.checks.push({name,passed:Boolean(condition)}); };
  const encode = x => x<=.0031308 ? 12.92*x : 1.055*Math.pow(x,1/2.4)-.055;
  const linear = Math.pow((.55+.055)/1.055,2.4);
  const gray = shade => Math.round(255*encode(linear*shade));
  check('normal incidence retains reference gray',Math.abs(s.face[0]-gray(1))<=2);
  check('grazing incidence uses bounded diffuse illumination in linear light',Math.abs(s.grazing[0]-gray(.08))<=2 && s.face[0]-s.grazing[0]>70);
  check('both sides and rotated world normal receive consistent illumination',s.back[0]===s.face[0] && s.rotated[0]===s.grazing[0]);
  check('lighting never changes transmission alpha',s.face[3]===128 && s.grazing[3]===128 && s.shadowed[3]===128);
  check('below-threshold transparent patch is discarded',s.transparent.every(x=>x===0));
  check('planet shadow removes direct light with ambient floor retained',Math.abs(s.shadowed[0]-gray(.08+.92*.6*.18))<=2 && s.litOblique[0]>s.shadowed[0]+30);
  check('outer narrow Epsilon and Adams rings cast sampled shadows',s.epsilon[0]<235 && s.adams[0]<235);
  check('unsupported ice-giant gaps cast no shadow',s.uranusGap[0]===255 && s.neptuneGap[0]===255);
  check('Keeler gap remains transparent beside A-ring shadow',s.keeler[0]>s.aRing[0]+35 && s.aRing[0]<200);
  check('WebGL reports no errors',s.glError===0);
  assert.ok(evidence.checks.every(c=>c.passed),JSON.stringify(evidence.checks.filter(c=>!c.passed)));
  evidence.result='PASS';
} catch(error) { evidence.result='FAIL'; evidence.error=String(error.stack||error); process.exitCode=1; }
finally { clearTimeout(timer); if(browser) await closeOwnedBrowser(browser); evidence.completedAt=new Date().toISOString(); fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n'); }
console.log(JSON.stringify({result:evidence.result,checks:evidence.checks,out,error:evidence.error}));
