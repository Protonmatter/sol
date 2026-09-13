#!/usr/bin/env node
// Isolated GPU regression gate using the actual shipped sphere shaders and image
// upload function. Synthetic fiducials test registration, not source calibration.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { PNG } from "pngjs";
import { closeOwnedBrowser } from "./worker_coverage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function argument(name, fallback) {
  const value = process.argv.find(value => value.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
}
const webRoot = path.resolve(argument("web-root", path.join(ROOT, "apps/web")));
const out = path.resolve(argument("out", path.join(ROOT, "coverage/planet-appearance")));
const chrome = argument("browser", process.env.CHROME_BIN || (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"));
const digest = value => createHash("sha256").update(value).digest("hex");
const releaseFile = path.join(webRoot, "web-release-manifest.json");
const release = fs.existsSync(releaseFile) ? JSON.parse(fs.readFileSync(releaseFile, "utf8")) : null;
if (release) assert.equal(release.schema_version, "web-release-manifest.v1");
const pageRoot = release ? path.resolve(webRoot, release.namespace) : webRoot;
assert.ok(pageRoot === webRoot || pageRoot.startsWith(webRoot + path.sep), "release namespace escapes web root");
function moduleFile(relative) {
  const file = path.join(pageRoot, relative), bytes = fs.readFileSync(file);
  if (release) {
    const asset = release.assets.find(asset => asset.path === path.relative(webRoot, file).split(path.sep).join("/"));
    assert.ok(asset, `${relative} is absent from the selected release`);
    assert.equal(digest(bytes), asset.sha256, `${relative} differs from selected release hash`);
  }
  return {file, bytes};
}
const shadersFile = moduleFile("js/orreryShaders.js"), mappingFile = moduleFile("js/surfaceMapping.js"), rendererFile = moduleFile("js/orrery.js");
const { SPHERE_VS, SPHERE_FS, BASE_SPHERE_VS, BASE_SPHERE_FS } = await import(pathToFileURL(shadersFile.file).href);
const { surfaceUv, srgbToLinear, linearToSrgb, nightLightWeight } = await import(pathToFileURL(mappingFile.file).href);
const upload = rendererFile.bytes.toString("utf8").match(/function makeTexture\(img, repeatS, nearest = false(?:, premultiplyAlpha = false)?\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(upload, "actual image upload function could not be isolated");

const fixture = (width, height, pixel) => {
  const image = new PNG({width, height});
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) image.data.set(pixel(x, y), (y * width + x) * 4);
  return PNG.sync.write(image);
};
const colors = [[232, 48, 24, 255], [24, 208, 72, 255], [32, 64, 232, 255], [240, 184, 32, 255]];
const fixtures = new Map([
  ["/quadrants.png", fixture(64, 32, (x, y) => colors[(y >= 16 ? 2 : 0) + (x >= 32 ? 1 : 0)])],
  ["/grid.png", fixture(256, 128, (x, y) => [x, 2 * y, 80, 255])],
  ["/seam.png", fixture(64, 32, x => x < 4 || x >= 60 ? [40, 120, 220, 255] : [220, 40, 30, 255])],
  // Matching dark edges and a bright interior: a false coarse mip at the
  // longitude wrap becomes a bright strip in the actual moon contrast mode.
  ["/spatial-seam.png", fixture(64, 32, x => x < 4 || x >= 60 ? [32,32,32,255] : [224,224,224,255])],
  // A geographically bounded dark-red deposit against brighter terrain tests
  // valid dark RGB and the uncompressed part of the relative-contrast display.
  ["/color-deposits.png", fixture(64, 32, x => x < 8 ? [48,12,6,255] : [192,192,192,255])],
  ["/black.png", fixture(4, 2, () => [0, 0, 0, 255])],
  ["/white.png", fixture(4, 2, () => [255, 255, 255, 255])],
  ["/transparent.png", fixture(4, 2, () => [255, 255, 255, 0])],
  ["/half-white.png", fixture(4, 2, () => [255, 255, 255, 128])],
  // Adjacent opaque white and missing transparent black. At u=.5 LINEAR
  // filtering has exactly half coverage, independent of image science/content.
  ["/alpha-edge.png", fixture(16, 8, x => x < 8 ? [255,255,255,255] : [0,0,0,0])],
  ["/color-alpha-edge.png", fixture(16, 8, x => x < 8 ? [64,128,224,255] : [0,0,0,0])],
  ["/ice.png", fixture(64, 32, (x, y) => colors[(y >= 16 ? 2 : 0) + (x >= 32 ? 1 : 0)])],
  ["/half-ice.png", fixture(4, 2, () => [200,80,120,128])],
]);
const evidence = {schema_version: "planet-appearance-validation.v1", web_root: webRoot,
  release_namespace: release?.namespace ?? null, started_at: new Date().toISOString(),
  scope: "Synthetic fiducials through actual SPHERE_VS/SPHERE_FS and makeTexture; not astronomical calibration or application qualification",
  source_sha256: {shaders: digest(shadersFile.bytes), surface_mapping: digest(mappingFile.bytes), renderer: digest(rendererFile.bytes)},
  compiled_shader_sha256: {physical_vertex:digest(SPHERE_VS),physical_fragment:digest(SPHERE_FS),
    base_vertex:digest(BASE_SPHERE_VS),base_fragment:digest(BASE_SPHERE_FS)},
  fixture_sha256: Object.fromEntries([...fixtures].map(([key, value]) => [key, digest(value)])), checks: [], disabled_material_parity: []};
fs.mkdirSync(out, {recursive: true});
let browser, server, launchPromise, deadlineTimer, expired = false;
const controller = new AbortController();
const errors = [];
function check(name, actual, expected, tolerance = 2) {
  const passed = actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
  evidence.checks.push({name, actual, expected, tolerance, passed});
}
function different(name, actual, expected) {
  const separation = Math.max(...actual.slice(0, 3).map((value, index) => Math.abs(value - expected[index])));
  evidence.checks.push({name, actual, reference: expected, minimum_separation: 20, passed: separation > 20, negative_control: true});
}

async function run() {
  // Serve only the declared fixtures; no application data or network source is fetched.
  server = http.createServer((req, res) => {
    if (req.url === "/fixture.html") {
      res.writeHead(200, {"Content-Type": "text/html", "Cache-Control": "no-store"});
      res.end('<!doctype html><title>Planet appearance GPU fixture</title><canvas width="1" height="1"></canvas>');
    } else if (fixtures.has(req.url)) {
      res.writeHead(200, {"Content-Type": "image/png", "Cache-Control": "no-store"}); res.end(fixtures.get(req.url));
    } else {res.writeHead(404); res.end();}
  });
  await new Promise((resolve, reject) => {server.once("error", reject); server.listen(0, "127.0.0.1", resolve);});
  launchPromise = puppeteer.launch({executablePath: chrome, headless: true, timeout: 20000, protocolTimeout: 20000,
    signal: controller.signal, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]}).then(async owned => {
    browser = owned;
    if (expired) {await closeOwnedBrowser(owned, {timeoutMs: 8000}); throw new Error("GPU fixture launch completed after deadline");}
    return owned;
  });
  await launchPromise;
  evidence.browser_version = await browser.version();
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const cdp = await page.createCDPSession(); await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", {urls: ["https://*", "http://localhost/*"]});
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`, {waitUntil: "domcontentloaded", timeout: 15000});
  evidence.gpu = await page.evaluate(async ({vertex, fragment, baseVertex, baseFragment, upload, images}) => {
    const gl = document.querySelector("canvas").getContext("webgl2", {antialias: false, preserveDrawingBuffer: true});
    if (!gl) throw new Error("WebGL2 unavailable for actual shader gate");
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const link = (vs, fs) => {
      const result = gl.createProgram(); gl.attachShader(result, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(result, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(result);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
      return result;
    };
    const programs = {physical:link(vertex, fragment), base:link(baseVertex, baseFragment)};
    let program = programs.physical;
    gl.useProgram(program); gl.disable(gl.DITHER); gl.disable(gl.BLEND); gl.viewport(0, 0, 1, 1);
    const textureFactory = new Function("gl", `${upload}; return makeTexture;`)(gl);
    const flippedFactory = new Function("gl", `${upload.replace("UNPACK_FLIP_Y_WEBGL, false", "UNPACK_FLIP_Y_WEBGL, true")}; return makeTexture;`)(gl);
    const textures = {}, uploadPremultiplyStates = [];
    for (const name of images) {
      const image = new Image(); image.src = name; await image.decode();
      // Coordinate-gradient probes use nearest to make source texel identity explicit.
      // Quadrants and seam exercise the renderer's actual linear/mipmap upload path.
      const maskedPhoto = ["/transparent.png", "/half-white.png", "/alpha-edge.png", "/color-alpha-edge.png"].includes(name);
      textures[name] = textureFactory(image, true, !["/quadrants.png", "/seam.png", "/spatial-seam.png", "/color-deposits.png", "/alpha-edge.png", "/color-alpha-edge.png"].includes(name), maskedPhoto);
      uploadPremultiplyStates.push({name, expected:maskedPhoto, actual:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)});
      if (name === "/quadrants.png") textures.flipped = flippedFactory(image, true, false);
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1); gl.vertexAttrib3f(1, 0, 0, 1);
    const location = name => gl.getUniformLocation(program, name);
    const i = (name, value) => gl.uniform1i(location(name), value);
    const f = (name, value) => gl.uniform1f(location(name), value);
    const v3 = (name, value) => gl.uniform3fv(location(name), value);
    const v4 = (name, value) => gl.uniform4fv(location(name), value);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const bind = (unit, sampler, name) => {gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[name]); i(sampler, unit);};
    window.probe = options => {
      program = programs[options.shaderVariant || 'physical'];
      if (!program) throw new Error('Unknown disabled-material shader variant');
      gl.useProgram(program); i('u_atmosphereEnabled', 0);
      const p = options.position || [0, 1, 1], e = .0001;
      const vertices = [[-1,-1], [1,-1], [-1,1], [-1,1], [1,-1], [1,1]];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices.flatMap(([x,y]) => [p[0]+e*x,p[1]+e*y,p[2]])), gl.STATIC_DRAW);
      // A tiny patch puts the chosen object coordinate at the sole pixel centre.
      // Independent fixed normals isolate mapping from sphere tessellation and camera.
      const mvp = [...identity]; mvp[0] = 1/e; mvp[5] = 1/e; mvp[10] = 0; mvp[12] = -p[0]/e; mvp[13] = -p[1]/e;
      gl.uniformMatrix4fv(location("u_mvp"), false, mvp); gl.uniformMatrix4fv(location("u_model"), false, identity);
      gl.uniformMatrix3fv(location("u_nmat"), false, options.normalMatrix || [1,0,0,0,1,0,0,0,1]);
      gl.vertexAttrib3fv(1, options.normal || [0,0,1]);
      i("u_style", -1); i("u_mode", options.mode ?? 0); i("u_useTex", options.useTexture === false ? 0 : 1); i("u_texMode", options.texMode ?? 3);
      const shadows = options.shadows || [];
      if (shadows.length > 4) throw new Error("GPU fixture exceeds the shader's four shadow slots");
      const shadowPositions = new Float32Array(16), shadowAxes = new Float32Array(16);
      shadows.forEach((shadow, index) => {shadowPositions.set(shadow.position, 4*index); shadowAxes.set(shadow.axis, 4*index);});
      i("u_moonShadowCount", shadows.length);
      v4("u_moonShadowPos[0]", shadowPositions); v4("u_moonShadowAxis[0]", shadowAxes);
      f("u_time", options.time || 0); f("u_atmoStr", options.atmosphereStrength || 0);
      gl.uniform2fv(location("u_ringRad"), [0, 0]); v3("u_atmo", options.atmosphereColor || [0,0,0]);
      v3("u_base", options.base || [.2,.3,.4]); v3("u_light", options.light || [0,0,1]);
      v3("u_cam", options.camera || [0,0,5]); f("u_oblate", options.axisRatio || 1);
      v4("u_map", options.map || [.5,1,1,0]);
      v4("u_mapLat", (options.latitudes || [-90,90,-90,90]).map(value => value*Math.PI/180));
      v4("u_mapWindow", options.window || [1,1,0,0]); i("u_mapNoData", options.nodata || 0);
      bind(0, "u_tex", options.texture || "/quadrants.png");
      bind(1, "u_ringTex", "/black.png"); bind(2, "u_nightTex", options.nightTexture || "/white.png");
      bind(3, "u_weatherTex", options.weatherTexture || "/transparent.png"); bind(4, "u_iceTex", options.iceTexture || "/ice.png");
      i("u_earthNight", options.night ? 1 : 0); i("u_earthWeather", options.weather ? 1 : 0); i("u_earthIce", options.ice ? 1 : 0);
      gl.clearColor(1,0,1,1); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6);
      const pixel = new Uint8Array(4); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`GPU fixture GL error ${error}`);
      return Array.from(pixel);
    };
    window.spatialSeamProbe = options => {
      const canvas = document.querySelector('canvas'), width = 8, height = 4, span = .05;
      canvas.width = width; canvas.height = height; gl.viewport(0,0,width,height);
      // Reuse the existing point probe only to bind the real shader's complete
      // uniform/texture state. Replace its geometry with a spatially varying
      // yz-plane patch. The seam crosses pixels 2/3 within one derivative quad.
      window.probe({...options,position:[-1,0,0]});
      const offset = options.crossing === false ? .12 : span*.25;
      const vertices = [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]];
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices.flatMap(([x,y]) => [-1,offset+span*x,span*y])),gl.STATIC_DRAW);
      const mvp = [0,0,0,0, 1/span,0,0,0, 0,1/span,0,0, -offset/span,0,0,1];
      gl.uniformMatrix4fv(location('u_mvp'),false,mvp);
      gl.clearColor(1,0,1,1); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES,0,6);
      const pixels = new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`Spatial seam GL error ${error}`);
      // Restore the existing point fixture exactly; subsequent checks retain
      // their original one-pixel geometry and assertion tolerances.
      canvas.width = 1; canvas.height = 1; gl.viewport(0,0,1,1);
      return {width,height,pixels:Array.from(pixels)};
    };
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION), uploadPremultiplyStates};
  }, {vertex: SPHERE_VS, fragment: SPHERE_FS, baseVertex: BASE_SPHERE_VS, baseFragment: BASE_SPHERE_FS, upload, images: [...fixtures.keys()]});
  // Every existing material/registration assertion still receives the physical
  // shader result. Independently execute the shipped constant-disabled program
  // with identical inputs, including spatial derivative patches, and retain both.
  const pairedProbe = async (method, options) => {
    const result = await page.evaluate(({method, options}) => ({
      physical:window[method]({...options,shaderVariant:'physical'}),
      base:window[method]({...options,shaderVariant:'base'}),
    }), {method, options});
    const physical = result.physical.pixels || result.physical, base = result.base.pixels || result.base;
    evidence.disabled_material_parity.push({method,options,physical,base,
      passed:physical.length === base.length && physical.every((value,index) => value === base[index])});
    return result.physical;
  };
  const probe = options => pairedProbe('probe', options);
  const rgba = rgb => [...rgb, 255];
  const fallback = [51, 77, 102, 255];
  check("each image upload sets its own alpha interpretation", evidence.gpu.uploadPremultiplyStates.map(state => Number(state.actual)),
    evidence.gpu.uploadPremultiplyStates.map(state => Number(state.expected)), 0);
  for (const [name, p, expected] of [
    ["north-west", [0,-1,1], colors[0]], ["north-east", [0,1,1], colors[1]],
    ["south-west", [0,-1,-1], colors[2]], ["south-east", [0,1,-1], colors[3]],
  ]) check(`asymmetric ${name} image landmark`, await probe({position:p}), expected);
  different("negative control: image upload vertical flip", await probe({texture:"flipped"}), colors[1]);
  different("negative control: reversed longitude", await probe({map:[.5,-1,1,0]}), colors[1]);
  different("negative control: prime meridian half-turn", await probe({map:[0,1,1,0]}), colors[1]);
  check("west-positive source registered intentionally", await probe({map:[.5,-1,1,0]}), colors[0]);

  const gridCases = [
    ["prime meridian", [1,0,0], {}, 1, [.5,.5]],
    ["90 east", [0,1,0], {}, 1, [.75,.5]], ["90 west", [0,-1,0], {}, 1, [.25,.5]],
    ["north pole", [0,0,1], {}, 1, [.5,0]], ["south pole", [0,0,-1], {}, 1, [.5,1]],
    ["geographic ellipsoid", [1,0,.5], {latitudeType:"planetographic"}, .5, [.5,.25]],
    ["centric ellipsoid", [1,0,.5], {latitudeType:"planetocentric"}, .5, [.5,(90-14.036243467926479)/180]],
    ["parametric ellipsoid", [1,0,.5], {latitudeType:"parametric"}, .5, [.5,(90-26.56505117707799)/180]],
    ["pixel-center grid", [0,1,1], {uvScale:[.8,.6],uvOffset:[.1,.2]}, 1, [.7,.35]],
  ];
  for (const [name, position, config, axisRatio, independent] of gridCases) {
    const cpu = surfaceUv(position, config, axisRatio);
    check(`${name}: CPU independent anchor`, [cpu.u,cpu.v], independent, 1e-12);
    const type = {parametric:0,planetocentric:1,planetographic:2}[config.latitudeType || "planetocentric"];
    const pixel = await probe({position, axisRatio, texture:"/grid.png", map:[.5,1,type,0],
      window:[...(config.uvScale || [1,1]), ...(config.uvOffset || [0,0])]});
    check(`${name}: GPU sampled source coordinates`, pixel, [Math.min(255,Math.floor(independent[0]*256)),
      Math.min(254,Math.floor(independent[1]*128)*2),80,255], 2);
  }
  for (const side of [-1,1]) check(`continuous source seam side ${side}`,
    await probe({position:[-1,side*.001,0],texture:"/seam.png"}), [40,120,220,255]);
  const spatialCases = [
    ['registered colour',3,'/seam.png',[40,120,220,255]],
    ['registered moon',4,'/spatial-seam.png',rgba([.2,.3,.4].map(c=>255*c*(32/200)**.6))],
    ['registered color moon',5,'/seam.png',rgba([40/220,120/220,1].map(c=>255*.6*c)),[.6,.6,.6]],
  ];
  for (const [name,texMode,texture,expected,base] of spatialCases) {
    for (const crossing of [false,true]) {
      const spatial = await pairedProbe('spatialSeamProbe',{texMode,texture,crossing,base});
      check(`${name} spatial ${crossing ? 'longitude-wrap' : 'non-wrapping'} patch retains edge texels`,
        spatial.pixels, Array.from({length:spatial.width*spatial.height},()=>expected).flat(), 2);
    }
  }
  check("uncovered affine source seam uses fallback", await probe({position:[-1,1e-6,0],window:[1.0000047158519485,1,0,0]}), fallback);
  check("negative affine source edge uses fallback", await probe({position:[-1,-1e-6,0],window:[1,1,-.01,0]}), fallback);
  for (const sign of [-1,1]) check(`missing cap ${sign} uses fallback`, await probe({position:[0,0,sign],latitudes:[-90,90,-60,60]}), fallback);
  check("partial latitude grid registers interior", await probe({position:[0,1,0],texture:"/grid.png",latitudes:[-30,90,-30,90]}), [192,192,80,255]);
  check("alpha no-data uses fallback", await probe({texture:"/transparent.png",nodata:2}), fallback);
  check("black no-data uses fallback", await probe({texture:"/black.png",nodata:1}), fallback);
  check("valid dark terrain is retained", await probe({texture:"/black.png",nodata:0}), [0,0,0,255]);
  // Registered moon mosaics retain their documented axes and coverage while their
  // relative display contrast is normalized independently of published albedo.
  const luma = c => .299*c[0]+.587*c[1]+.114*c[2];
  const meanLuma = colors.reduce((sum,c)=>sum+luma(c),0)/colors.length;
  for (const [name, position, index] of [["north-east",[0,1,1],1],["south-west",[0,-1,-1],2]]) {
    const contrast = Math.min((luma(colors[index])/meanLuma)**.6,1.8);
    check(`registered moon ${name} structure`, await probe({texMode:4,position}), rgba([.2,.3,.4].map(c=>255*c*contrast)), 3);
  }
  check("registered moon no-data stays simplified", await probe({texMode:4,texture:"/transparent.png",nodata:2}), fallback);
  check("registered moon missing latitude stays simplified", await probe({texMode:4,position:[0,0,1],latitudes:[-90,90,-60,60]}), fallback);
  check("registered moon coverage is excluded from mean brightness", await probe({texMode:4,texture:"/alpha-edge.png",nodata:2,position:[0,-1,0]}), fallback);
  check("registered moon umbra gain survives surface detail", await probe({texMode:4,texture:"/alpha-edge.png",nodata:2,position:[0,-1,0],base:[.04,.06,.08]}), [10,15,20,255]);
  // These saturated fiducials reach the color mode's common RGB gamut scale.
  // Their independently expected output is source RGB / peak channel, times
  // the neutral moon gain. They must not collapse into grayscale or a fixed hue.
  const colorMoon = {texMode:5,base:[.6,.6,.6]};
  for (const [name, position, index] of [
    ["north-west",[0,-1,1],0],["north-east",[0,1,1],1],
    ["south-west",[0,-1,-1],2],["south-east",[0,1,-1],3],
  ]) {
    const rgb = colors[index].slice(0,3), peak = Math.max(...rgb);
    check(`registered color moon ${name} retains geographic RGB ratios`,
      await probe({...colorMoon,position}),rgba(rgb.map(c=>255*.6*c/peak)),2);
  }
  const redDeposit = { ...colorMoon, texture:"/color-deposits.png", position:[-Math.cos(Math.PI/8),-Math.sin(Math.PI/8),0] };
  // 1/8 of the fixture is [48,12,6], the rest [192,192,192]. Its dark region
  // remains below the unit-RGB gamut ceiling: source-luma 22.08, mean 170.76,
  // scalar contrast (22.08 / 170.76)^0.6. Expected display bytes retain 8:2:1.
  const depositIntensity = 255*.6*(22.08/170.76)**.6/22.08;
  check("registered color moon preserves a valid dark red deposit",await probe(redDeposit),
    rgba([48,12,6].map(c=>c*depositIntensity)),2);
  check("registered color moon preserves valid black terrain",await probe({...colorMoon,texture:"/black.png"}),[0,0,0,255]);
  const colorFallback = [153,153,153,255];
  check("registered color moon alpha gap stays simplified",await probe({...colorMoon,texture:"/transparent.png",nodata:2}),colorFallback);
  check("registered color moon missing latitude stays simplified",await probe({...colorMoon,position:[0,0,1],latitudes:[-90,90,-60,60]}),colorFallback);
  const coveredColor = [64/224,128/224,1], colorEdgeOptions = {...colorMoon,texture:"/color-alpha-edge.png",nodata:2};
  check("registered color moon covered source excludes transparent pixels from mean",
    await probe({...colorEdgeOptions,position:[0,-1,1]}),rgba(coveredColor.map(c=>255*.6*c)),2);
  check("registered color moon missing side retains fallback",
    await probe({...colorEdgeOptions,position:[0,1,1]}),colorFallback);
  check("registered color moon filtered coverage edge has no black fringe",
    await probe({...colorEdgeOptions,position:[1,0,1]}),rgba(coveredColor.map(c=>255*.6*(.5+.5*c))),2);
  for (const gain of [.95,.3]) check(`registered color moon neutral albedo eclipse gain ${gain} preserves RGB ratios`,
    await probe({...colorMoon,base:[gain,gain,gain]}),rgba([24/208,1,72/208].map(c=>255*gain*c)),2);
  check("registered color moon source registration ignores camera and model time",
    await probe({...colorMoon,camera:[3,-4,2],time:50000}),rgba([24/208,1,72/208].map(c=>255*.6*c)),2);
  check("reference night-side ambient floor stays dim without emission", await probe({light:[0,0,-1]}),
    rgba(colors[1].slice(0,3).map(value => 255*linearToSrgb(srgbToLinear(value/255)*.001))));
  check("cloud mask gap leaves surface unchanged", await probe({weather:true}), colors[1]);
  check("cloud/surface image shares base registration", await probe({texture:"/black.png",weather:true,weatherTexture:"/quadrants.png"}), colors[1]);
  check("cloud/surface alpha composites in linear light", await probe({texture:"/black.png",weather:true,weatherTexture:"/half-white.png"}), rgba([1,1,1].map(() => 255*linearToSrgb(128/255))));
  const halfCoverageWhite = rgba([1,1,1].map(() => 255*linearToSrgb(.5)));
  const alphaEdge = {position:[1,0,1], texture:"/black.png",base:[0,0,0]};
  check("weather filtered validity edge retains source brightness at half coverage",
    await probe({...alphaEdge,weather:true,weatherTexture:"/alpha-edge.png"}), halfCoverageWhite);
  check("surface filtered validity edge retains source brightness at half coverage",
    await probe({...alphaEdge,texture:"/alpha-edge.png",nodata:2}), halfCoverageWhite);
  const nightEdge = rgba([1,1,1].map(() => 255*linearToSrgb(.001*.5)));
  check("weather filtered validity edge remains solar-lit material on night side",
    await probe({...alphaEdge,weather:true,weatherTexture:"/alpha-edge.png",light:[0,0,-1]}), nightEdge, .6);
  check("surface filtered validity edge remains solar-lit material on night side",
    await probe({...alphaEdge,texture:"/alpha-edge.png",nodata:2,light:[0,0,-1]}), nightEdge, .6);
  const colorBase = [.2,.3,.4], sourceRGB = [64,128,224];
  const colorEdge = rgba(sourceRGB.map((value,index) => 255*linearToSrgb(.5*srgbToLinear(value/255)+.5*srgbToLinear(colorBase[index]))));
  check("colored weather validity edge blends source and fallback in linear light",
    await probe({...alphaEdge,base:colorBase,weather:true,weatherTexture:"/color-alpha-edge.png",nodata:1}), colorEdge);
  check("colored surface validity edge blends source and fallback in linear light",
    await probe({...alphaEdge,base:colorBase,texture:"/color-alpha-edge.png",nodata:2}), colorEdge);
  for (const [name, position, expected] of [["valid",[0,-1,1],[255,255,255,255]],["missing",[0,1,1],[0,0,0,255]]]) {
    check(`weather ${name} side of validity edge`, await probe({...alphaEdge,position,weather:true,weatherTexture:"/alpha-edge.png"}), expected);
    check(`surface ${name} side of validity edge`, await probe({...alphaEdge,position,texture:"/alpha-edge.png",nodata:2}), expected);
  }
  for (const cosine of [1,.25,0,-.05226423163382673,-.10452846326765347,-1]) {
    const options = {texture:"/black.png", night:true, light:[Math.sqrt(1-cosine*cosine),0,cosine]};
    const expected = rgba([1,1,1].map(() => 255*linearToSrgb(nightLightWeight(cosine))));
    check(`night lights solar cosine ${cosine}`, await probe(options), expected);
  }
  check("night map shares body longitude registration", await probe({texture:"/black.png",night:true,nightTexture:"/quadrants.png",light:[0,0,-1]}), colors[1]);
  check("night lights do not follow camera or model time", await probe({texture:"/black.png",night:true,light:[0,0,-1],camera:[3,-4,2],time:50000}), [255,255,255,255]);
  // Independent physical-coordinate cone fixture, not a claimed celestial event.
  // At surface z=1, a radius .2 moon centred at z=3 is two equatorial radii
  // upstream. With solar angular radius .01 rad, its umbra/penumbra radii
  // are .18/.22 here; offset .20 is exactly the half-visible midpoint.
  const shadowProbe = {position:[0,0,1],texture:"/white.png",normal:[0,0,1],light:[0,0,1]};
  const umbra = [{position:[0,0,3,.2],axis:[0,0,-1,.01]}];
  const penumbra = [{position:[.2,0,3,.2],axis:[0,0,-1,.01]}];
  const umbraWhite = rgba([1,1,1].map(() => 255*linearToSrgb(.001)));
  check("reference material unshadowed direct-sun baseline", await probe(shadowProbe), [255,255,255,255]);
  check("reference material full moon umbra removes direct sunlight",
    await probe({...shadowProbe,shadows:umbra}), umbraWhite, .6);
  check("reference material midpoint penumbra retains half direct sunlight",
    await probe({...shadowProbe,shadows:penumbra}), rgba([1,1,1].map(() => 255*linearToSrgb(.001+.999*.5))));
  check("eclipsed day-side reference material does not activate night lights",
    await probe({...shadowProbe,shadows:umbra,night:true}), umbraWhite, .6);
  for (const cosine of [-1,1]) check(`sea-ice palette stays exact at solar cosine ${cosine}`,
    await probe({texture:"/black.png",ice:true,light:[0,0,cosine]}), colors[1]);
  check("palette alpha stays straight after masked photographic uploads",
    await probe({texture:"/black.png",ice:true,iceTexture:"/half-ice.png"}), rgba([200,80,120].map(value => value*128/255)));
  const normal = [Math.SQRT1_2,0,Math.SQRT1_2];
  const oblatePixel = await probe({normal,normalMatrix:[1,0,0,0,1,0,0,0,2]});
  check("ellipsoid inverse-transpose normal controls linear illumination", oblatePixel,
    rgba(colors[1].slice(0,3).map(value => 255*linearToSrgb(srgbToLinear(value/255)*(.001+.999*2/Math.sqrt(5))))));
  // Cover the two production non-surface modes, untextured surfaces, and view
  // dependence outside the original registered-material fixture cases.
  for (const options of [
    {mode:1,useTexture:false,base:[1,.98,.94],position:[0,0,1]},
    {mode:1,useTexture:false,base:[1,.98,.94],normal:[1,0,0],position:[0,0,1]},
    {mode:2,atmosphereColor:[.2,.5,1],atmosphereStrength:.8,normal:[1,0,0]},
    {mode:2,atmosphereColor:[.7,.4,.1],atmosphereStrength:.5,normal:[1,0,0],light:[-1,0,0]},
    {useTexture:false,base:[.4,.25,.1],normal:[0,0,1]},
    {useTexture:false,base:[.4,.25,.1],normal:[0,0,1],light:[0,0,-1]},
  ]) await probe(options);
  check('constant-disabled base sphere preserves every material pixel',
    evidence.disabled_material_parity.flatMap(item=>item.base),
    evidence.disabled_material_parity.flatMap(item=>item.physical), 0);
  const changedMaterial = await page.evaluate(() => ({
    physical:window.probe({shaderVariant:'physical',mode:1,useTexture:false,base:[1,1,1],position:[0,0,1]}),
    base:window.probe({shaderVariant:'base',mode:1,useTexture:false,base:[.1,.1,.1],position:[0,0,1]}),
  }));
  different('negative control: base material drift is visible to GPU parity',changedMaterial.base,changedMaterial.physical);
  if (errors.length) throw new Error(errors.join("; "));
  const failed = evidence.checks.filter(check => !check.passed);
  if (failed.length) throw new Error(`${failed.length} GPU/coordinate checks failed: ${failed.map(check => check.name).join(", ")}`);
}

try {
  await Promise.race([run(), new Promise((_, reject) => {
    deadlineTimer = setTimeout(() => {expired = true; controller.abort(); reject(new Error("Planet appearance GPU gate exceeded 75 seconds"));}, 75000);
  })]);
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed"; evidence.error = error.message; process.exitCode = 1;
} finally {
  clearTimeout(deadlineTimer);
  if (expired && launchPromise && !browser) {
    let timer; await Promise.race([launchPromise.catch(() => {}), new Promise(resolve => {timer = setTimeout(resolve, 2000);})]); clearTimeout(timer);
  }
  if (browser) await closeOwnedBrowser(browser, {timeoutMs:8000});
  if (server) {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
  evidence.completed_at = new Date().toISOString(); evidence.runtime_errors = errors;
  fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(`Planet appearance GPU gate ${evidence.status}: ${evidence.checks.filter(check => check.passed).length}/${evidence.checks.length} checks. ${path.join(out,"evidence.json")}`);
  if (evidence.error) console.error(evidence.error);
}
