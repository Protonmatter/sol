#!/usr/bin/env node
// Actual GLSL/R32F ray-shadow checks against a double-precision CPU reference.
// Synthetic ridges are test geometry, not any body's purported topography.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const webRoot=path.resolve(arg('web-root',path.join(root,'apps/web')));
const out=path.resolve(arg('out',path.join(root,'coverage/terrain-shadows')));
const chrome=arg('browser',process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const manifestPath=path.join(webRoot,'web-release-manifest.json');
const release=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
const pageRoot=release?path.resolve(webRoot,release.namespace):webRoot;
assert.ok(pageRoot===webRoot||pageRoot.startsWith(webRoot+path.sep));
const admitted=relative=>{
  const file=path.join(pageRoot,relative),bytes=fs.readFileSync(file);
  if(release){const item=release.assets.find(x=>x.path===path.relative(webRoot,file).split(path.sep).join('/'));assert.ok(item);assert.equal(hash(bytes),item.sha256);}
  return {file,bytes};
};
const source=admitted('js/terrainShadowShaders.js'),geometry=admitted('js/terrainGeometry.js'),assets=admitted('js/terrainAssets.js');
const {TERRAIN_SHADOW_GLSL}=await import(pathToFileURL(source.file).href);
const {terrainShadowUniforms,terrainShadowVisibility,sampleTerrainHeight}=await import(pathToFileURL(geometry.file).href);
const {terrainReference,decodeTerrain}=await import(pathToFileURL(assets.file).href);
const D=Math.PI/180;
const grids=new Map(),probes=[];
const fixture=(ridge,prime)=>({width:720,height:360,referenceRadiusKm:1000,primeMeridianU:prime,
  heightsKm:Float32Array.from({length:720*360},(_,i)=>{
    const lon=(((i%720+.5)/720-prime)*360+360)%360;return ridge&&lon>2&&lon<4?20:0;
  })});
grids.set('flat',fixture(false,0));grids.set('ridge',fixture(true,0));grids.set('ridge-seam',fixture(true,.5));
for(const body of ['Moon','Mars']) {
  const ref=terrainReference(body),raw=admitted(ref.path).bytes;
  assert.equal(hash(raw),ref.sha256);
  grids.set(body,decodeTerrain(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),ref));
}
function add(name,grid,lon,lat,altitude,{west=false,enabled=true}={}) {
  const g=grids.get(grid),r=g.referenceRadiusKm+sampleTerrainHeight(g,lon,lat),longitude=lon*D,latitude=lat*D;
  const radial=[Math.cos(latitude)*Math.cos(longitude),Math.cos(latitude)*Math.sin(longitude),Math.sin(latitude)];
  const east=[-Math.sin(longitude)*(west?-1:1),Math.cos(longitude)*(west?-1:1),0];
  const surface=radial.map(x=>x*r),light=radial.map((x,k)=>x*Math.sin(altitude*D)+east[k]*Math.cos(altitude*D));
  const reference=terrainShadowVisibility(g,surface,light);
  const dense=terrainShadowVisibility(g,surface,light,{maxSteps:4096});
  probes.push({name,grid,surface,light,enabled,expected:enabled?reference.visibility:1,reference,dense});
}
for(const alt of [0,.5,5,40,90])add(`flat daylight altitude ${alt}`,'flat',0,0,alt);
add('flat night globe occultation','flat',0,0,-10);
for(const alt of [0,5,10,40,90]){add(`ridge altitude ${alt}`,'ridge',0,0,alt);add(`equivalent prime mapping altitude ${alt}`,'ridge-seam',0,0,alt);}
add('ridge facing away from Sun','ridge',0,0,5,{west:true});
add('disabled shadow preserves direct light','ridge',0,0,5,{enabled:false});
for(const body of ['Moon','Mars']) {
  const [lon,lat]=body==='Moon'?[-11.36,-43.31]:[226.2,18.65];
  for(const alt of [.1,.5,2,10,60])add(`${body} native field altitude ${alt}`,body,lon,lat,alt);
  add(`${body} north pole tangent`,body,20,90,0);
  add(`${body} longitude seam`,body,180,10,1);
}
const payloads=new Map([...grids].map(([name,g])=>[`/${name}.f32`,Buffer.from(g.heightsKm.buffer)]));
const descriptions=[...grids].map(([name,g])=>({name,width:g.width,height:g.height,...terrainShadowUniforms(g)}));
const evidence={schema_version:'terrain-shadow-validation.v1',web_root:webRoot,release_namespace:release?.namespace??null,
  source_sha256:{shader:hash(source.bytes),geometry:hash(geometry.bytes),assets:hash(assets.bytes)},
  scope:'Actual R32F/manual-bilinear terrain shadow GLSL against double-precision CPU and synthetic ridge/flat references; source-scale approximation, not astronomical calibration or full app performance',
  checks:[],started_at:new Date().toISOString()};
let browser,server,timer,launchPromise,expired=false;
const controller=new AbortController();
const errors=[];
fs.mkdirSync(out,{recursive:true});
async function run(){
  server=http.createServer((req,res)=>{
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Terrain shadow GPU validation</title><canvas width="1" height="1"></canvas>');}
    else if(payloads.has(req.url)){res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end(payloads.get(req.url));}
    else{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  launchPromise=puppeteer.launch({executablePath:chrome,headless:true,timeout:20000,protocolTimeout:20000,signal:controller.signal,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']}).then(async owned=>{
      browser=owned;
      if(expired){await closeOwnedBrowser(owned,{timeoutMs:8000});throw new Error('Terrain GPU launch completed after deadline');}
      return owned;
    });
  await launchPromise;
  evidence.browser_version=await browser.version();
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  const session=await page.createCDPSession();await session.send('Network.enable');await session.send('Network.setBlockedURLs',{urls:['https://*','http://localhost/*']});
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:15000});
  const result=await page.evaluate(async({include,descriptions,probes})=>{
    const gl=document.querySelector('canvas').getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL2 unavailable');
    const compile=(kind,text)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,text);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
    const vertex='#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}';
    const fragment='#version 300 es\nprecision highp float;precision highp sampler2D;\n'+include+'\nuniform vec3 u_surface;uniform vec3 u_direction;out vec4 color;void main(){float v=terrainSunVisibility(u_surface,u_direction);color=vec4(v,v,v,1);}';
    const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());gl.disable(gl.DITHER);gl.disable(gl.BLEND);gl.viewport(0,0,1,1);
    const textures={};
    for(const descriptor of descriptions){
      const bytes=await(await fetch(`/${descriptor.name}.f32`)).arrayBuffer();
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,descriptor.width,descriptor.height,0,gl.RED,gl.FLOAT,new Float32Array(bytes));textures[descriptor.name]=texture;
    }
    const outputs=[];
    for(const probe of probes){
      const descriptor=descriptions.find(x=>x.name===probe.grid);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[probe.grid]);
      gl.uniform1i(gl.getUniformLocation(program,'u_terrainHeight'),0);
      gl.uniform1i(gl.getUniformLocation(program,'u_terrainShadowEnabled'),probe.enabled?1:0);
      gl.uniform4fv(gl.getUniformLocation(program,'u_terrainShape'),descriptor.shape);gl.uniform2fv(gl.getUniformLocation(program,'u_terrainPoles'),descriptor.poles);
      gl.uniform3fv(gl.getUniformLocation(program,'u_surface'),probe.surface);gl.uniform3fv(gl.getUniformLocation(program,'u_direction'),probe.light);
      gl.drawArrays(gl.TRIANGLES,0,3);const pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      outputs.push({name:probe.name,rgba:Array.from(pixel)});
    }
    const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`WebGL error ${error}`);
    return {outputs,renderer:gl.getParameter(gl.RENDERER)};
  },{include:TERRAIN_SHADOW_GLSL,descriptions,probes:probes.map(({reference,dense,...probe})=>probe)});
  evidence.renderer=result.renderer;
  evidence.checks=probes.map((probe,i)=>({...probe,rgba:result.outputs[i].rgba,passed:result.outputs[i].rgba[0]===probe.expected*255&&result.outputs[i].rgba[3]===255}));
  assert.equal(errors.length,0,errors.join('; '));
  assert.ok(evidence.checks.every(x=>x.passed),evidence.checks.filter(x=>!x.passed).map(x=>x.name).join(', '));
  assert.ok(evidence.checks.some(x=>x.expected===0)&&evidence.checks.some(x=>x.expected===1),'gate must exercise both shadow and lit output');
}
try{
  await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();reject(new Error('Terrain shadow gate exceeded 60 seconds'));},60000);})]);
  evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.message;process.exitCode=1;}
finally{
  clearTimeout(timer);
  if(expired&&launchPromise&&!browser){let lateTimer;await Promise.race([launchPromise.catch(()=>{}),new Promise(resolve=>{lateTimer=setTimeout(resolve,2000);})]);clearTimeout(lateTimer);}
  if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  evidence.runtime_errors=errors;evidence.completed_at=new Date().toISOString();
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(`Terrain shadow GPU gate ${evidence.status}: ${evidence.checks.filter(x=>x.passed).length}/${evidence.checks.length}. ${path.join(out,'evidence.json')}`);
  if(evidence.error)console.error(evidence.error);
}
