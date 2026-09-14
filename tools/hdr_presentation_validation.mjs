#!/usr/bin/env node
// Real material/presentation shader readback. Synthetic display fixtures, not calibration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const webRoot=path.resolve(arg('web-root',path.join(root,'apps/web')));
const out=path.resolve(arg('out',path.join(root,'coverage/hdr-presentation')));
const manifestPath=path.join(webRoot,'web-release-manifest.json');
const release=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
const pageRoot=release?path.resolve(webRoot,release.namespace):webRoot;
assert.ok(pageRoot===webRoot||pageRoot.startsWith(webRoot+path.sep));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence={schema_version:'hdr-presentation-validation.v1',started_at:new Date().toISOString(),
  web_root:webRoot,release_namespace:release?.namespace??null,
  scope:'Synthetic actual GPU material composition and SDR presentation. No HDR-monitor, radiometric, whole-application or native-device qualification.',
  source_sha256:{},checks:[]};
assert.ok(!fs.existsSync(path.join(out,'evidence.json')),'Evidence directory already contains a receipt');
fs.mkdirSync(out,{recursive:true});
let browser,server,timer;
const controller=new AbortController();
const close=async()=>{if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
try{
  server=http.createServer((req,res)=>{
    const route=new URL(req.url,'http://127.0.0.1').pathname;
    if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<canvas width="5" height="1"></canvas>');return;}
    if(!/^\/js\/[a-zA-Z0-9]+\.js$/.test(route)){res.writeHead(404);res.end();return;}
    const file=path.join(pageRoot,route.slice(1));
    try{
      const bytes=fs.readFileSync(file),sha=hash(bytes);
      if(release){const rel=path.relative(webRoot,file).split(path.sep).join('/');
        assert.equal(release.assets.find(x=>x.path===rel)?.sha256,sha,'Release module hash mismatch');}
      evidence.source_sha256[route]=sha;
      res.setHeader('Content-Type','text/javascript');res.end(bytes);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const run=async()=>{
    browser=await puppeteer.launch({executablePath:arg('browser',process.env.CHROME_BIN||
      (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome')),
      headless:true,timeout:20000,protocolTimeout:40000,signal:controller.signal,
      args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
    evidence.browser_version=await browser.version();
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    const result=await page.evaluate(async()=>{
      const {createHdrPresentation}=await import('./js/hdrPresentation.js');
      const shaders=await import('./js/orreryShaders.js');
      const {SOLAR_FS}=await import('./js/solarVolumeShaders.js');
      const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
      if(!gl)throw new Error('WebGL2 unavailable');
      const debug=gl.getExtension('WEBGL_debug_renderer_info'),gpu={renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
      gl.disable(gl.DITHER);
      const checks=[],D=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
      const E=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
      const check=(name,actual,expected,tolerance=2)=>checks.push({name,actual,expected,tolerance,
        passed:actual.length===expected.length&&actual.every((v,i)=>Number.isFinite(v)&&Math.abs(v-expected[i])<=tolerance)});
      const negative=(name,actual,expected,minimum=.05)=>checks.push({name,actual,expected,minimum,negative_control:true,
        passed:Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])))>minimum});
      const manager=createHdrPresentation(gl,{generation:1});
      if(manager.resize(5,1).state!=='ready')throw new Error(manager.status().reason);
      const id=serial=>({generation:1,epoch:1800000000.25+serial,serial});
      const readFloat=()=>{const p=new Float32Array(20);gl.readPixels(0,0,5,1,gl.RGBA,gl.FLOAT,p);return [...p];};
      const readBytes=()=>{const p=new Uint8Array(20);gl.readPixels(0,0,5,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
      manager.beginFrame(id(1));gl.enable(gl.SCISSOR_TEST);
      const values=[0,.18,1,4,16];
      values.forEach((v,i)=>{gl.scissor(i,0,1,1);gl.clearBufferfv(gl.COLOR,0,new Float32Array([v,v,v,1]));});
      gl.disable(gl.SCISSOR_TEST);
      check('RGBA16F retains values above one',readFloat(),values.flatMap(v=>[v,v,v,1]),.0002);
      check('present same producer identity',[Number(manager.present({exposure:1,frameIdentity:id(1)}))],[1],0);
      const expected=values.flatMap(v=>[...Array(3).fill(Math.round(255*E(v/(1+v)))),255]);
      check('single fixed exposure and SDR transfer',readBytes(),expected);
      const previous=readBytes();manager.beginFrame(id(2));gl.clearBufferfv(gl.COLOR,0,new Float32Array([4,.25,.5,1]));
      check('reject stale presentation identity',[Number(manager.present({exposure:1,frameIdentity:id(1)}))],[0],0);
      // Producers advance while the final draw is deliberately held. Read actual
      // default framebuffer pixels, not the manager's metadata or uniform stubs.
      const draw=gl.drawArrays;gl.drawArrays=()=>{};
      manager.present({exposure:1,frameIdentity:id(2)});gl.drawArrays=draw;
      check('held presentation retains prior pixels',readBytes(),previous,0);
      negative('negative control held final image fails current producer',readBytes(),
        Array.from({length:5},()=>[4,.25,.5].map(x=>Math.round(255*E(x/(1+x))))).flatMap(x=>[...x,255]),20);
      let serial=2;
      const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      const link=(fragment,varyings,assignments,point=false)=>{
        const vertex=`#version 300 es\nprecision highp float;${varyings}\nvoid main(){
          vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);
          ${point?'gl_Position=vec4(0,0,0,1);gl_PointSize=1.0;':''}${assignments}}`;
        const p=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
        gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
        if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
        gl.deleteShader(vs);gl.deleteShader(fs);return p;
      };
      const materials=[
        {name:'guide',fragment:shaders.LINE_FS,v:'out vec3 v_col;',a:'v_col=vec3(.4,.2,.8);',color:[.4,.2,.8],alpha:.5,uniforms:{u_alpha:.5}},
        {name:'point star',fragment:shaders.PT_FS,v:'out vec4 v_col;',a:'v_col=vec4(.4,.2,.8,.5);',point:true,color:[.4,.2,.8],alpha:.5,uniforms:{u_soft:0}},
        {name:'glow',fragment:shaders.GLOW_FS,v:'out vec2 v_uv;',a:'v_uv=vec2(.5,0);',color:[.1,.05,.2],alpha:.25,uniforms:{u_color:[.4,.2,.8],u_pow:2}},
        {name:'ring',fragment:shaders.RING_FS,v:'out vec4 v_col;out float v_frac;out vec3 v_world;out vec3 v_normal;',
          a:'v_col=vec4(.4,.2,.8,.5);v_frac=.5;v_world=vec3(2,0,0);v_normal=vec3(0,0,1);',color:[.4,.2,.8],alpha:.5,
          uniforms:{u_center:[0,0,0],u_light:[0,0,1],u_prad:1}},
        {name:'solar assigned display',fragment:SOLAR_FS,v:'out vec3 v_obj;',a:'v_obj=vec3(0,0,1);',
          color:[(128/255)**.7,.76*(128/255)**1.25,.22*(128/255)**2.1],alpha:1,
          uniforms:{u_camObj:[0,0,3],u_extent:1.35,u_frameMix:0,u_observerRadii:[215,215],u_projection0:[.5,.5,1,1],u_projection1:[.5,.5,1,1]}}
      ];
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      for(const material of materials){
        const program=link(material.fragment,material.v,material.a,material.point);
        const loc=n=>gl.getUniformLocation(program,n);
        const execute=linear=>{
          manager.beginFrame(id(++serial));gl.viewport(0,0,1,1);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
          gl.clearBufferfv(gl.COLOR,0,new Float32Array([0,0,0,0]));gl.useProgram(program);gl.uniform1i(loc('u_linearOutput'),linear);
          for(const [name,value] of Object.entries(material.uniforms)){
            if(Array.isArray(value))gl[`uniform${value.length}fv`](loc(name),value);else gl.uniform1f(loc(name),value);
          }
          gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(loc('u_atlas'),0);gl.uniform1i(loc('u_pass'),1);
          const matrix=[1,0,0,0,1,0,0,0,1];
          for(const name of ['u_sourceBasis0','u_sourceBasis1'])gl.uniformMatrix3fv(loc(name),false,matrix);
          gl.uniformMatrix4fv(loc('u_mvp'),false,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
          gl.drawArrays(material.point?gl.POINTS:gl.TRIANGLES,0,material.point?1:3);
          return readFloat().slice(0,4);
        };
        check(`${material.name} reference display`,execute(0),[...material.color,material.alpha],.001);
        const linear=execute(1),expected=[...material.color.map(D),material.alpha];
        check(`${material.name} actual linear composition`,linear,expected,.001);
        negative(`negative control ${material.name} encoded output`,execute(0),expected);
        // Compose two copies with alpha in the actual float target.
        execute(1);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(material.point?gl.POINTS:gl.TRIANGLES,0,material.point?1:3);gl.disable(gl.BLEND);
        check(`${material.name} alpha remains data`,readFloat().slice(0,3),expected.slice(0,3),.001);
        gl.deleteProgram(program);
      }
      gl.deleteTexture(texture);manager.dispose();
      check('all scene allocations released',[manager.status().estimatedBytes],[0],0);
      if(gl.getError()!==gl.NO_ERROR)throw new Error('HDR fixture generated a GL error');
      return {checks,gpu};
    });
    evidence.gpu=result.gpu;evidence.checks=result.checks;evidence.runtime_errors=errors;
    assert.equal(errors.length,0,errors.join('; '));
    assert.ok(result.checks.every(x=>x.passed),`${result.checks.filter(x=>!x.passed).map(x=>x.name).join('; ')}`);
  };
  await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('HDR GPU gate exceeded 90 seconds'));},90000);})]);
  evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.message;process.exitCode=1;}
finally{clearTimeout(timer);await close();evidence.completed_at=new Date().toISOString();
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(`HDR GPU gate ${evidence.status}: ${evidence.checks.filter(x=>x.passed).length}/${evidence.checks.length}. ${path.join(out,'evidence.json')}`);
  if(evidence.error)console.error(evidence.error);}
