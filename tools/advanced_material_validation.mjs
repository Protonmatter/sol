#!/usr/bin/env node
// Isolated shader observables against independent Python references; no application/glint calibration.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const option=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const webRoot=path.resolve(option('web-root','apps/web'));
const out=path.resolve(option('out','coverage/advanced-materials'));
const chrome=option('browser',process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe');
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.ok(!fs.existsSync(out),'Evidence destination must be new');fs.mkdirSync(out,{recursive:true});
const releasePath=path.join(webRoot,'web-release-manifest.json');
const release=fs.existsSync(releasePath)?JSON.parse(fs.readFileSync(releasePath,'utf8')):null;
const root=release?path.resolve(webRoot,release.namespace):webRoot;
const admitted=async relative=>{
  const file=path.join(root,relative),bytes=fs.readFileSync(file);
  if(release){const asset=release.assets.find(x=>x.path===path.relative(webRoot,file).split(path.sep).join('/'));assert.ok(asset);assert.equal(hash(bytes),asset.sha256);}
  return {module:await import(pathToFileURL(file).href),sha256:hash(bytes)};
};
const reflection=await admitted('js/surfaceReflectionShaders.js'),ring=await admitted('js/ringTransportShaders.js');
const oracle=script=>{const result=spawnSync('python',[script,'--fixtures'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
const reflectionCases=oracle('tools/reflection_reference.py'),moonCases=oracle('tools/moon_photometry_reference.py');
const evidence={schema_version:'advanced-material-gpu-validation.v1',started_at:new Date().toISOString(),source_sha:release?.source_sha??null,
  release_namespace:release?.namespace??null,shader_sha256:{reflection:reflection.sha256,ring:ring.sha256},
  scope:'Synthetic GGX, fixed-footprint ring transmission and Lambert-sphere disk sums; excludes Earth glint, real ring occultation fitting and real moon calibration',checks:[]};
let browser,server,timer;const controller=new AbortController();
try{
  server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Advanced material shader reference</title><canvas width="256" height="256"></canvas>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  timer=setTimeout(()=>controller.abort(),60000);
  browser=await puppeteer.launch({executablePath:chrome,headless:true,timeout:20000,protocolTimeout:30000,signal:controller.signal,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:10000});
  evidence.browser=await browser.version();
  const outputs=await page.evaluate(({reflection,ring,reflectionCases,moonCases})=>{
    const gl=document.querySelector('canvas').getContext('webgl2',{antialias:false});
    if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float shader observables unavailable');
    const compile=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const vertex='#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}';
    const program=(include,body)=>{const p=gl.createProgram();const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;\n'+include+'\nout vec4 color;\n'+body);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;};
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,256,256);
    const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Float framebuffer incomplete');
    gl.bindVertexArray(gl.createVertexArray());gl.disable(gl.DITHER);gl.disable(gl.BLEND);
    const ggx=program(reflection,'uniform vec3 light;uniform vec3 view;uniform float alpha;void main(){color=vec4(surfaceReflection(vec3(0,0,1),light,view,alpha,1.0,1.5),0,0,1);}');
    gl.useProgram(ggx);gl.viewport(0,0,1,1);const pixel=new Float32Array(4),values=[];
    for(const row of reflectionCases){gl.uniform3fv(gl.getUniformLocation(ggx,'light'),row.input.incident);gl.uniform3fv(gl.getUniformLocation(ggx,'view'),row.input.view);gl.uniform1f(gl.getUniformLocation(ggx,'alpha'),row.input.alpha);gl.drawArrays(gl.TRIANGLES,0,3);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);values.push(pixel[0]);}
    const transmission=program(ring,'uniform float mu;void main(){float mixed=0.5*homogeneousRingTransmission(log(2.0),mu)+0.5; color=vec4(coveredRingTransmission(mixed,0.5),coveredRingTransmission(0.5,1.0),displayRingShadowTransmission(0.8,0.5),1);}');
    gl.useProgram(transmission);const ringValues=[];
    for(const mu of [1,.5,-.5,.02]){gl.uniform1f(gl.getUniformLocation(transmission,'mu'),mu);gl.drawArrays(gl.TRIANGLES,0,3);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);ringValues.push({mu,values:Array.from(pixel)});}
    const lambert=program('','uniform float rho;uniform vec3 light;void main(){vec2 xy=gl_FragCoord.xy/128.0-1.0;float r2=dot(xy,xy);if(r2>=1.0){color=vec4(0);return;}vec3 n=vec3(xy,sqrt(1.0-r2));color=vec4(rho*max(dot(n,light),0.0)/3.141592653589793,0,0,1);}');
    gl.useProgram(lambert);gl.viewport(0,0,256,256);const disk=new Float32Array(256*256*4),moonValues=[];
    for(const row of moonCases){const angle=row.phase_degrees*Math.PI/180;gl.uniform1f(gl.getUniformLocation(lambert,'rho'),row.rho);gl.uniform3fv(gl.getUniformLocation(lambert,'light'),[Math.sin(angle),0,Math.cos(angle)]);gl.drawArrays(gl.TRIANGLES,0,3);gl.readPixels(0,0,256,256,gl.RGBA,gl.FLOAT,disk);let sum=0,covered=0;for(let i=0;i<disk.length;i+=4){sum+=disk[i];covered+=disk[i+3];}moonValues.push({diskRatio:sum*4/(256*256),projectedArea:covered*4/(256*256)});}
    const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`GL error ${error}`);
    for(const p of [ggx,transmission,lambert])gl.deleteProgram(p);gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture);
    return {reflection:values,rings:ringValues,moons:moonValues,renderer:gl.getParameter(gl.RENDERER)};
  },{reflection:reflection.module.SURFACE_REFLECTION_GLSL,ring:ring.module.RING_TRANSPORT_GLSL,reflectionCases,moonCases});
  evidence.renderer=outputs.renderer;
  reflectionCases.forEach((row,i)=>{const error=Math.abs(outputs.reflection[i]-row.brdf),limit=1e-5+1e-3*Math.abs(row.brdf);evidence.checks.push({kind:'GGX',input:row.input,reference:row.brdf,actual:outputs.reflection[i],error,limit,passed:Number.isFinite(error)&&error<=limit});});
  outputs.rings.forEach(row=>{const expected=[.75+.25*Math.exp(-Math.log(2)/Math.abs(row.mu)),.5,.712,1];const error=Math.max(...row.values.map((v,i)=>Math.abs(v-expected[i])));evidence.checks.push({kind:'ring',...row,expected,error,limit:1e-4,passed:error<=1e-4});});
  moonCases.forEach((row,i)=>{const result=outputs.moons[i],error=Math.abs(result.diskRatio-row.analytic),limit=1e-5+1e-3*Math.abs(row.analytic);evidence.checks.push({kind:'Lambert disk',rho:row.rho,phase_degrees:row.phase_degrees,reference:row.analytic,...result,error,limit,projectedAreaRelativeError:(result.projectedArea-Math.PI)/Math.PI,passed:error<=limit});});
  assert.ok(evidence.checks.every(x=>x.passed),JSON.stringify(evidence.checks.filter(x=>!x.passed)));
  evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.message;process.exitCode=1;}
finally{
  clearTimeout(timer);if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  evidence.completed_at=new Date().toISOString();fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,out,error:evidence.error}));
}
