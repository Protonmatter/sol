import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const root=process.cwd();
const server=http.createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+req.url);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type','text/javascript');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle']});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/package.json`);
 const result=await page.evaluate(async()=>{
  const {createSolarStrandRenderer}=await import('/apps/web/js/solarStrandRenderer.js');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=65;const gl=canvas.getContext('webgl2');
  if(!gl.getExtension('EXT_color_buffer_float'))throw Error('float render unavailable');
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,65,65,0,gl.RGBA,gl.FLOAT,null);
  const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  const depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,65,65);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('incomplete');gl.viewport(0,0,65,65);
  const renderer=createSolarStrandRenderer(gl),mvp=[1,0,0,0,0,1,0,0,0,0,-1.002002,-1,0,0,4.8098098,5];
  const packet=z=>({strands:[{classification:'closed',emission_relative:1,points:[[-.1,0,z,.02],[.1,0,z,.02]],pulse:{onset_s:0,duration_s:1800,speed_R_per_s:.0002,amplitude:.3,width_R:.04}}]});
  let camera=[0,0,5];
  function sample(seconds,depthValue=1){gl.clearColor(0,0,0,0);gl.clearDepth(depthValue);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.depthMask(false);
   renderer.draw({mvp,camera,seconds,outputMode:'transfer'});const p=new Float32Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.FLOAT,p);if(gl.getError())throw Error('GL error');return p[0];}
  if(!await renderer.prepare(packet(1.2)))throw Error(JSON.stringify(renderer.status()));
  const front=sample(0),pulse=sample(500),ended=sample(1800),external=sample(0,.5);
  await renderer.prepare(packet(-1.2));const back=sample(0);
  const parallel=packet(1.2);parallel.strands[0].points=[[1.2,0,-.1,.02],[1.2,0,.1,.02]];
  camera=[1.2,0,5];mvp[12]=-1.2;await renderer.prepare(parallel);const axial=sample(0);
  renderer.dispose();return {front,pulse,ended,external,back,axial,status:renderer.status()};
 });
 const exact=Math.sqrt(2*Math.PI)*.02*Math.exp(-.2/.3);
 assert.ok(Math.abs(result.front-exact)/exact<.003,JSON.stringify(result));assert.ok(result.pulse>result.front*1.1);assert.ok(Math.abs(result.ended/result.front-1)<.01);assert.equal(result.back,0);assert.equal(result.external,0);assert.ok(Math.abs(result.axial-.2*Math.exp(-.2/.3))<1e-5);assert.equal(result.status.state,'disposed');
 console.log(JSON.stringify({passed:true,analyticExpected:exact,...result},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
