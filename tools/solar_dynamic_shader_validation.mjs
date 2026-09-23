#!/usr/bin/env node
// Actual WebGL2 transfer shader, analytic uniform-volume rays, and local cellular
// evolution. This is numerical/rendering evidence, not solar-plasma calibration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(root,'build/solar-dynamic-shader');fs.mkdirSync(out,{recursive:true});
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const hierarchyPacket=option('packet')?JSON.parse(fs.readFileSync(path.resolve(option('packet')),'utf8')):null;
const hierarchyReference=option('reference')?JSON.parse(fs.readFileSync(path.resolve(option('reference')),'utf8')):null;
if(!!hierarchyPacket!==!!hierarchyReference)throw Error('R4 packet and reference must be supplied together');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'apps/web','.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(path.join(root,'apps/web')+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args:['--use-angle=d3d11','--use-gl=angle']});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async({packet,reference})=>{
    const {DYNAMIC_SOLAR_FS}=await import('./js/solarAtmosphereShaders.js');
    const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
    const gl=canvas.getContext('webgl2',{antialias:false});if(!gl)throw Error('WebGL2 unavailable');
    if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Float target unavailable');
    const vs=`#version 300 es\nprecision highp float;uniform vec3 u_target;out vec3 v_obj;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);v_obj=u_target;}`;
    const program=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,DYNAMIC_SOLAR_FS]]){
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);const u=name=>gl.getUniformLocation(program,name);
    const target=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,target);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,null);
    const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete target');
    gl.activeTexture(gl.TEXTURE0);const volume=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,volume);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.R16F,8,8,8,0,gl.RED,gl.FLOAT,new Float32Array(512).fill(.125));
    for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,p,gl.LINEAR);
    for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
    gl.uniform1i(u('u_volume'),0);
    gl.activeTexture(gl.TEXTURE1);const surface=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,surface);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R16F,8,4,0,gl.RED,gl.FLOAT,new Float32Array(32).fill(.2));
    for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
    gl.uniform1i(u('u_surface'),1);gl.uniform1i(u('u_pass'),2);gl.uniform1i(u('u_debug'),1);gl.uniform1i(u('u_channel'),0);
    gl.uniform1i(u('u_samples'),64);gl.uniform1i(u('u_hasPulse'),0);gl.uniform1i(u('u_regionCount'),0);gl.uniform1i(u('u_showCorona'),1);gl.uniform1i(u('u_showDiffuse'),1);
    gl.uniform1f(u('u_seconds'),0);gl.uniform1f(u('u_extent'),2.5);gl.uniform1ui(u('u_seed'),42);
    gl.uniform3fv(u('u_rotation'),[14.713,-2.396,-1.787]);
    gl.uniform4fv(u('u_surfaceRecipe'),[5772,.6,1000,150]);gl.uniform1f(u('u_pixelDiameter'),300);
    gl.uniformMatrix4fv(u('u_mvp'),false,new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
    const sample=(camera,target)=>{
      gl.uniform3fv(u('u_camObj'),camera);gl.uniform3fv(u('u_target'),target);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);
      const data=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,data);return [...data];
    };
    const center=sample([0,0,3],[0,0,0]);
    const limb=sample([1.5,0,3],[1.5,0,0]);
    gl.uniform1i(u('u_pass'),1);gl.uniform1i(u('u_debug'),2);gl.uniform1f(u('u_pixelDiameter'),10000);
    gl.uniform3fv(u('u_rotation'),[14.1844,0,0]); // zero relative drift: local deformation survives removal of bulk rotation
    const texture0=sample([3,0,0],[0,0,0]);gl.uniform1f(u('u_seconds'),600);
    const texture1=sample([3,0,0],[0,0,0]);
    gl.uniform1i(u('u_debug'),3);
    const euvProxy=[];
    for(const seconds of [0,600]){
      gl.uniform1f(u('u_seconds'),seconds);
      euvProxy.push([[3,0,0],[0,3,0],[0,0,3]].map(camera=>sample(camera,[0,0,0])[0]));
    }
    const hierarchy=[];
    if(packet){
      gl.uniform1ui(u('u_seed'),packet.seed);
      const centers=new Float32Array(30),axesU=new Float32Array(40),axesV=new Float32Array(40),cores=new Float32Array(160),gains=new Float32Array(40),coreAxes=new Float32Array(160);
      packet.emission_regions.forEach((r,i)=>{
        centers.set(r.center,i*3);axesU.set([...r.axis_u,r.extent_rad[0]],i*4);axesV.set([...r.axis_v,r.extent_rad[1]],i*4);
        r.cores.forEach((c,j)=>{cores.set([...c.center,c.radius_R],(4*i+j)*4);gains[4*i+j]=c.emission_relative;coreAxes.set([...c.axis_u,c.structure_relative],(4*i+j)*4);});
      });
      gl.uniform1i(u('u_emissionRegionCount'),packet.emission_regions.length);gl.uniform3fv(u('u_emissionCenters[0]'),centers);
      gl.uniform4fv(u('u_emissionAxesU[0]'),axesU);gl.uniform4fv(u('u_emissionAxesV[0]'),axesV);gl.uniform4fv(u('u_emissionCores[0]'),cores);gl.uniform4fv(u('u_emissionCoreGains[0]'),gains);
      gl.uniform4fv(u('u_emissionCoreAxes[0]'),coreAxes);
      for(const row of reference.samples){
        gl.uniform1f(u('u_seconds'),row.time_s);gl.uniform1i(u('u_debug'),4);
        const camera=row.point.map(n=>3*n),components=sample(camera,[0,0,0]).slice(0,3);
        gl.uniform1i(u('u_debug'),5);const intensity=sample(camera,[0,0,0])[0];
        hierarchy.push({point:row.point,time_s:row.time_s,components,intensity});
      }
    }
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {center,limb,texture0,texture1,euvProxy,hierarchy,error:gl.getError(),renderer:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};
  },{packet:hierarchyPacket,reference:hierarchyReference});
  assert.ok(Math.abs(result.center[0]-.1875)<1e-4,'foreground shell length1.5; rear hidden');
  assert.ok(Math.abs(result.limb[0]-.5)<1e-4,'off-limb chord length4');
  assert.ok(result.texture0.every(Number.isFinite)&&result.texture1.every(Number.isFinite));
  assert.ok(Math.abs(result.texture0[0]-result.texture1[0])>1e-3,'resolved local cellular structure evolves');
  // Independent Rust f64 values from appearance::euv_structure, seed42, unit axes.
  const cpuEuv=[[.63588413240608244,.30231412932171392,-.51434994742778972],[.44198772191505703,.15621509896154334,-.25299364053119766]];
  const proxyErrors=result.euvProxy.flatMap((row,t)=>row.map((value,i)=>Math.abs(value-cpuEuv[t][i])));
  assert.ok(proxyErrors.every(error=>error<1e-4),'R3 correlated emission must agree with independent Rust CPU evaluation');
  result.euv_cpu_max_absolute_error=Math.max(...proxyErrors);
  if(hierarchyReference){
    assert.equal(hierarchyReference.recipe_hash,hierarchyPacket.recipe_hash,'Reference recipe identity');
    const errors=result.hierarchy.flatMap((row,i)=>[...row.components.map((v,j)=>Math.abs(v-hierarchyReference.samples[i].components[j])),Math.abs(row.intensity-hierarchyReference.samples[i].intensity)]);
    assert.ok(errors.every(error=>Number.isFinite(error)&&error<1e-4),'R4 hierarchy must match independent Rust values');
    result.hierarchy_cpu_max_absolute_error=Math.max(...errors);
  }
  assert.equal(result.error,0);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
