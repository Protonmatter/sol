#!/usr/bin/env node
// Real material/presentation shader readback. Synthetic display fixtures, not calibration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
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
  source_sha256:{},tool_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),checks:[]};
assert.ok(!fs.existsSync(path.join(out,'evidence.json')),'Evidence directory already contains a receipt');
fs.mkdirSync(out,{recursive:true});
let browser,server,timer;
const controller=new AbortController();
const close=async()=>{if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
try{
  const {getAtmosphereProfile,atmosphereUniformValues}=await import(pathToFileURL(path.join(pageRoot,'js/atmosphereOptics.js')).href);
  const opticalCases=[];
  for(const body of ['Earth','Mars']){
    const profile=getAtmosphereProfile(body),height=body==='Earth'?8000:5000;
    for(const kind of ['shell','day','night']){
      const origin=kind==='shell'?[profile.radiusKm+10,0,height]:[0,0,height];
      const sun=kind==='shell'?[1,0,0]:[0,0,kind==='night'?-1:1];
      opticalCases.push({name:`${body} ${kind}`,kind,profile,origin,sun,direction:[0,0,-1],
        maximum:kind==='shell'?1e20:height-profile.radiusKm,
        uniforms:atmosphereUniformValues(profile,{cameraBodyKm:origin,sunDirectionBody:sun,polarRatio:1,solarDistanceAu:1,exposure:1})});
    }
  }
  const referenceFile=path.join(root,'tools/atmosphere_reference.py');
  evidence.source_sha256['tools/atmosphere_reference.py']=hash(fs.readFileSync(referenceFile));
  const referenceScript=`import json,sys
sys.path.insert(0,'tools')
from atmosphere_reference import trace_single_scattering
results=[]
for c in json.loads(sys.stdin.read()):
 p=c['profile']
 results.append(trace_single_scattering(c['origin'],c['direction'],c['sun'],radius_km=p['radiusKm'],top_km=p['topKm'],rayleigh_h_km=p['rayleighScaleHeightKm'],aerosol_h_km=p['aerosolScaleHeightKm'],beta_rayleigh=p['betaRayleighKm'],beta_extinction=p['betaAerosolExtinctionKm'],aerosol_ssa=p['aerosolSingleScatteringAlbedo'],g=p['aerosolG'],polar_ratio=1,solar_distance_au=1,view_steps=512,solar_steps=512,max_distance_km=c['maximum']))
print(json.dumps(results))`;
  const opticalExpected=JSON.parse(execFileSync(arg('python',process.env.PYTHON||'python'),['-c',referenceScript],
    {cwd:root,input:JSON.stringify(opticalCases),encoding:'utf8',timeout:60000,windowsHide:true}));
  evidence.optical_domain=opticalCases.map((c,i)=>({...c,reference:opticalExpected[i]}));
  server=http.createServer((req,res)=>{
    const route=new URL(req.url,'http://127.0.0.1').pathname;
    if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<canvas width="5" height="1"></canvas>');return;}
    const binary=/^\/data\/optics\/(earth|mars)-columns-v1\.f32$/.test(route);
    if(!binary&&!/^\/js\/[a-zA-Z0-9]+\.js$/.test(route)){res.writeHead(404);res.end();return;}
    const file=path.join(pageRoot,route.slice(1));
    try{
      const bytes=fs.readFileSync(file),sha=hash(bytes);
      if(release){const rel=path.relative(webRoot,file).split(path.sep).join('/');
        assert.equal(release.assets.find(x=>x.path===rel)?.sha256,sha,'Release module hash mismatch');}
      evidence.source_sha256[route]=sha;
      res.setHeader('Content-Type',binary?'application/octet-stream':'text/javascript');res.end(bytes);
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
    const result=await page.evaluate(async({opticalCases,opticalExpected})=>{
      const {createHdrPresentation}=await import('./js/hdrPresentation.js');
      const shaders=await import('./js/orreryShaders.js');
      const {SOLAR_FS}=await import('./js/solarVolumeShaders.js');
      const {ATMOSPHERE_RENDER_FS,loadAtmosphereColumns}=await import('./js/atmosphereColumnField.js');
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
        {name:'visible Sun approximation',fragment:shaders.BASE_SPHERE_FS,
          v:'out vec3 v_obj,v_world,v_nrm;out float v_surfaceScale;out vec3 v_incidentSunBody,v_incidentSunWorld,v_incidentTransmission;',
          a:'v_obj=vec3(0,0,1);v_world=vec3(0);v_nrm=vec3(0,0,1);v_surfaceScale=1.0;v_incidentSunBody=vec3(0,0,1);v_incidentSunWorld=vec3(0,0,1);v_incidentTransmission=vec3(1);',
          color:[1,.98,.94],alpha:1,linearScale:2,uniforms:{u_cam:[0,0,3],u_base:[1,.98,.94],u_mode:1,u_style:-1}},
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
            if(Array.isArray(value))gl[`uniform${value.length}fv`](loc(name),value);
            else if(['u_mode','u_style'].includes(name))gl.uniform1i(loc(name),value);else gl.uniform1f(loc(name),value);
          }
          gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(loc('u_atlas'),0);gl.uniform1i(loc('u_pass'),1);
          const matrix=[1,0,0,0,1,0,0,0,1];
          for(const name of ['u_sourceBasis0','u_sourceBasis1'])gl.uniformMatrix3fv(loc(name),false,matrix);
          gl.uniformMatrix4fv(loc('u_mvp'),false,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
          gl.drawArrays(material.point?gl.POINTS:gl.TRIANGLES,0,material.point?1:3);
          return readFloat().slice(0,4);
        };
        check(`${material.name} reference display`,execute(0),[...material.color,material.alpha],.001);
        const linear=execute(1),expected=[...material.color.map(x=>D(x)*(material.linearScale??1)),material.alpha];
        check(`${material.name} actual linear composition`,linear,expected,.001);
        if(material.linearScale){
          manager.present({exposure:1,frameIdentity:id(serial)});
          check('visible Sun fixed scale final pixel',readBytes().slice(0,4),
            [...expected.slice(0,3).map(x=>Math.round(255*E(x/(1+x)))),255]);
        }
        negative(`negative control ${material.name} encoded output`,execute(0),expected);
        // Compose two copies with alpha in the actual float target.
        execute(1);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(material.point?gl.POINTS:gl.TRIANGLES,0,material.point?1:3);gl.disable(gl.BLEND);
        check(`${material.name} alpha remains data`,readFloat().slice(0,3),expected.slice(0,3),.001);
        const background=[.1,.25,.7];
        gl.clearBufferfv(gl.COLOR,0,new Float32Array([...background,1]));gl.enable(gl.BLEND);
        gl.drawArrays(material.point?gl.POINTS:gl.TRIANGLES,0,material.point?1:3);gl.disable(gl.BLEND);
        check(`${material.name} alpha over distinct linear background`,readFloat().slice(0,3),
          expected.slice(0,3).map((x,i)=>x*material.alpha+background[i]*(1-material.alpha)),.001);
        gl.clearBufferfv(gl.COLOR,0,new Float32Array([...background,1]));gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
        gl.drawArrays(material.point?gl.POINTS:gl.TRIANGLES,0,material.point?1:3);gl.disable(gl.BLEND);
        check(`${material.name} additive linear composition`,readFloat().slice(0,3),
          expected.slice(0,3).map((x,i)=>x+background[i]),.002);
        gl.deleteProgram(program);
      }
      gl.deleteTexture(texture);
      // Actual physical surface and shell fragments, admitted numerical columns,
      // and independent Python float64 S/T. RGBA16F contributes its declared
      // binary16 quantization bound in addition to the unchanged optics tolerance.
      const opticalCheck=(name,actual,expected)=>{
        const tolerances=expected.map(x=>1e-4+(.002+1/1024)*Math.abs(x));
        checks.push({name,actual,expected,tolerances,
          passed:actual.length===expected.length&&actual.every((x,i)=>Number.isFinite(x)&&Math.abs(x-expected[i])<=tolerances[i])});
      };
      const opticalTextures=[];
      const imageTexture=(unit,rgba)=>{
        gl.activeTexture(gl.TEXTURE0+unit);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        opticalTextures.push(t);return t;
      };
      const dayTexture=imageTexture(0,[64,96,128,255]),nightTexture=imageTexture(1,[32,128,224,255]);
      imageTexture(2,[0,0,0,0]);
      const columns={};
      for(const body of ['Earth','Mars']){
        const field=await loadAtmosphereColumns(body),t=gl.createTexture();opticalTextures.push(t);columns[body]=t;
        gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,t);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,field.width,field.height,0,gl.RG,gl.FLOAT,field.values);
        for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
        for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      }
      const sphere=link(shaders.SPHERE_FS,
        'out vec3 v_obj,v_world,v_nrm;out float v_surfaceScale;out vec3 v_incidentSunBody,v_incidentSunWorld,v_incidentTransmission;',
        'v_obj=vec3(0,0,1);v_world=vec3(0,0,1);v_nrm=vec3(0,0,1);v_surfaceScale=1.0;v_incidentSunBody=vec3(0,0,1);v_incidentSunWorld=vec3(0,0,1);v_incidentTransmission=vec3(1);');
      const shell=link(ATMOSPHERE_RENDER_FS,'uniform vec3 u_probePoint;out vec3 v_atmosphereBodyKm;','v_atmosphereBodyKm=u_probePoint;');
      const integers=new Set(['u_linearOutput','u_atmosphereEnabled','u_atmosphereRefractionEnabled','u_atmosphereColumnField',
        'u_style','u_mode','u_useTex','u_texMode','u_earthNight','u_tex','u_nightTex','u_weatherTex','u_iceTex','u_ringTex','u_terrainHeight']);
      const uniform=(program,name,value)=>{
        const location=gl.getUniformLocation(program,name);
        if(Array.isArray(value))gl[`uniform${value.length}fv`](location,value);
        else if(integers.has(name))gl.uniform1i(location,value);else gl.uniform1f(location,value);
      };
      const produce=(c,{linear=1,au=1}={})=>{
        manager.beginFrame(id(++serial));gl.viewport(0,0,1,1);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
        gl.clearBufferfv(gl.COLOR,0,new Float32Array([0,0,0,0]));
        const program=c.kind==='shell'?shell:sphere;gl.useProgram(program);
        for(const [name,value]of Object.entries(c.uniforms))uniform(program,name,value);
        uniform(program,'u_linearOutput',linear);uniform(program,'u_atmosphereRefractionEnabled',0);
        uniform(program,'u_atmosphereSolarScale',1/(au*au));
        gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,columns[c.profile.body]);uniform(program,'u_atmosphereColumnField',7);
        if(c.kind==='shell')uniform(program,'u_probePoint',[c.origin[0],0,0]);
        else{
          const state={u_style:-1,u_mode:0,u_useTex:1,u_texMode:3,u_earthNight:c.kind==='night'?1:0,
            u_tex:0,u_nightTex:1,u_weatherTex:2,u_iceTex:2,u_ringTex:2,u_terrainHeight:2,
            u_light:c.sun,u_lightObj:c.sun,u_cam:c.origin,u_base:[64/255,96/255,128/255],u_oblate:1,u_bodyRadiusKm:c.profile.radiusKm,
            u_ringRad:[0,0],u_map:[.5,1,0,0],u_mapLat:[-Math.PI/2,Math.PI/2,-Math.PI/2,Math.PI/2],u_mapWindow:[1,1,0,0]};
          for(const [name,value]of Object.entries(state))uniform(program,name,value);
          gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,dayTexture);
          gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,nightTexture);
        }
        gl.drawArrays(gl.TRIANGLES,0,3);return readFloat().slice(0,4);
      };
      for(let index=0;index<opticalCases.length;index++){
        const c=opticalCases[index],r=opticalExpected[index],S=r.scattering,T=r.transmittance;
        const rgb=c.kind==='shell'?S:c.kind==='night'?[32,128,224].map((x,j)=>D(x/255)*T[j]):
          [64,96,128].map((x,j)=>D(x/255)*T[j]*T[j]+S[j]);
        const alpha=c.kind==='shell'?1-T.reduce((sum,x,j)=>sum+x*[.2126,.7152,.0722][j],0):1;
        opticalCheck(`${c.name} actual linear S/T material output`,produce(c),[...rgb,alpha]);
        manager.present({exposure:1,frameIdentity:id(serial)});
        check(`${c.name} final exposure and transfer once`,readBytes().slice(0,4),[...rgb.map(x=>Math.round(255*E(x/(1+x)))),255]);
        negative(`negative control ${c.name} encoded producer`,produce(c,{linear:0}).slice(0,3),rgb,.005);
        if(c.kind==='shell'){
          produce(c);const background=[.1,.25,.7];
          gl.clearBufferfv(gl.COLOR,0,new Float32Array([...background,1]));gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
          gl.drawArrays(gl.TRIANGLES,0,3);gl.disable(gl.BLEND);
          opticalCheck(`${c.name} S plus scalar-alpha background approximation`,readFloat().slice(0,3),S.map((x,j)=>x+background[j]*(1-alpha)));
        }else if(c.kind==='day'){
          opticalCheck(`${c.name} inverse-square flux before exposure`,produce(c,{au:2}).slice(0,3),rgb.map(x=>x/4));
        }
      }
      gl.deleteProgram(sphere);gl.deleteProgram(shell);for(const t of opticalTextures)gl.deleteTexture(t);manager.dispose();
      check('all scene allocations released',[manager.status().estimatedBytes],[0],0);
      if(gl.getError()!==gl.NO_ERROR)throw new Error('HDR fixture generated a GL error');
      return {checks,gpu};
    },{opticalCases,opticalExpected});
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
