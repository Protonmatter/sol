#!/usr/bin/env node
// Actual solar fragment shader against deterministic 1-pixel rays and Float64
// reference. No external resources; optional staged artifact identity is checked.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {PNG} from 'pngjs';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const webRoot=path.resolve(arg('web-root',path.join(root,'apps/web')));
const out=path.resolve(arg('out',path.join(root,'coverage/solar-appearance')));
const chrome=arg('browser',process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const releaseFile=path.join(webRoot,'web-release-manifest.json');
const release=fs.existsSync(releaseFile)?JSON.parse(fs.readFileSync(releaseFile,'utf8')):null;
const pageRoot=release?path.resolve(webRoot,release.namespace):webRoot;
assert.ok(pageRoot===webRoot||pageRoot.startsWith(webRoot+path.sep));
const input=relative=>{
  const file=path.join(pageRoot,relative),bytes=fs.readFileSync(file);
  if(release){
    const record=release.assets.find(a=>a.path===path.relative(webRoot,file).split(path.sep).join('/'));
    assert.ok(record,`${relative} missing from selected release`);assert.equal(hash(bytes),record.sha256);
  }
  return {file,bytes};
};
const source=input('js/solarVolumeShaders.js'),reference=input('js/solarAppearance.js');
input('js/solarAppearanceManifest.js');
const {SOLAR_VS,SOLAR_FS}=await import(pathToFileURL(source.file).href);
const {SOLAR_APPEARANCE,solarRenderUniforms,solarDisplayColor,solarFrameUniforms,projectSolarSurface,
  integrateSolarEmission,solarAtlasQuietProfiles,solarQuietBytes,solarGlobalLoops,solarLoopDensity,SOLAR_EUV_DISPLAY_GAIN}=await import(pathToFileURL(reference.file).href);
const atlas=input(SOLAR_APPEARANCE.atlas.path);
assert.equal(hash(atlas.bytes),SOLAR_APPEARANCE.atlas.sha256);
const uniforms=solarRenderUniforms(0);
const evidence={schema_version:'solar-appearance-validation.v1',scope:'Actual shader projection, bounded modeled emission, quadrature parity and occlusion; not plasma calibration',
  web_root:webRoot,release_namespace:release?.namespace??null,source_hashes:{shader:hash(source.bytes),reference:hash(reference.bytes),atlas:hash(atlas.bytes)},checks:[]};
const checks=evidence.checks,errors=[];
let browser,server,deadline;
fs.mkdirSync(out,{recursive:true});
const almost=(name,actual,expected,tolerance=2)=>checks.push({name,actual,expected,tolerance,passed:actual.every((v,i)=>Math.abs(v-expected[i])<=tolerance)});
const fixture=new PNG({width:2048,height:1024});
for(let y=0;y<1024;y++)for(let x=0;x<2048;x++){
  const value=x<1024?(y<512?200:64):128;
  fixture.data.set([value,value,value,255],(y*2048+x)*4);
}
const fixtureBytes=PNG.sync.write(fixture);
const quietBytes=png=>{const image=PNG.sync.read(png);return [...solarQuietBytes(solarAtlasQuietProfiles(image.data,image.width,image.height))];};
const quiet={fixture:quietBytes(fixtureBytes),atlas:quietBytes(atlas.bytes)};
const probeVS=`#version 300 es
layout(location=0) in vec2 a_pos;uniform vec3 u_probe;out vec3 v_obj;
void main(){v_obj=u_probe;gl_Position=vec4(a_pos,0,1);}`;

async function run(){
  server=http.createServer((req,res)=>{
    if(req.url==='/fixture.png'){res.writeHead(200,{'Content-Type':'image/png'});res.end(fixtureBytes);}
    else if(req.url==='/atlas.png'){res.writeHead(200,{'Content-Type':'image/png'});res.end(atlas.bytes);}
    else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Solar optical shader reference</title><canvas width="1" height="1"></canvas>');}
    else{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await puppeteer.launch({executablePath:chrome,headless:true,timeout:20000,protocolTimeout:20000,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  evidence.gpu=await page.evaluate(async({vs,fs,probeVS,uniforms,quiet,displayGain})=>{
    const gl=document.querySelector('canvas').getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw Error('WebGL2 unavailable');
    const shader=(type,text)=>{const sh=gl.createShader(type);gl.shaderSource(sh,text);gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
    const program=(vertex,fragment=fs)=>{const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
    program(vs); // Actual vertex/fragment interface must also compile and link.
    const flat=program(`#version 300 es
layout(location=0) in vec2 a_pos;uniform float depth;
void main(){gl_Position=vec4(a_pos,2.0*depth-1.0,1.0);}`,`#version 300 es
precision highp float;uniform vec4 color;out vec4 o;void main(){o=color;}`);
    const p=program(probeVS);gl.useProgram(p);
    const loc=name=>gl.getUniformLocation(p,name);
    const v3=(name,value)=>gl.uniform3fv(loc(name),value),v4=(name,value)=>gl.uniform4fv(loc(name),value);
    const f=(name,value)=>gl.uniform1f(loc(name),value);
    gl.uniformMatrix4fv(loc('u_mvp'),false,[1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1]);
    gl.uniformMatrix3fv(loc('u_sourceBasis0'),false,uniforms.sourceBasis0);gl.uniformMatrix3fv(loc('u_sourceBasis1'),false,uniforms.sourceBasis1);
    v4('u_projection0',uniforms.projection0);v4('u_projection1',uniforms.projection1);gl.uniform2fv(loc('u_observerRadii'),uniforms.observerRadii);
    f('u_extent',uniforms.extent);f('u_phase',0);f('u_frameMix',0);
    gl.uniform1i(loc('u_atlas'),0);
    const textures={};
    for(const name of ['fixture','atlas']){
      const img=new Image();img.src=`/${name}.png`;await img.decode();
      const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      textures[name]=tex;
      const profile=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,profile);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,32,2,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array(quiet[name]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      textures[name+'Quiet']=profile;
    }
    gl.activeTexture(gl.TEXTURE0);
    const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.disable(gl.DITHER);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.viewport(0,0,1,1);
    const drawSolar=(options={},pass=0)=>{
      gl.useProgram(p);gl.uniform1i(loc('u_pass'),pass);
      v3('u_camObj',options.camera||[0,0,3]);v3('u_probe',options.target||[0,0,1.35]);
      f('u_frameMix',options.mix||0);f('u_phase',options.phase||0);
      f('u_displayGain',options.displayGain||0);f('u_coronaGlow',options.coronaGlow||0);
      v4('u_loopNormal[0]',options.normals||uniforms.loopNormal);v4('u_loopTangent[0]',options.tangents||uniforms.loopTangent);
      const gainUpload=new Array(24).fill(0);
      if(options.gains)for(let i=0;i<options.gains.length&&i<24;i++)gainUpload[i]=options.gains[i];
      gl.uniform1fv(loc('u_loopGain[0]'),gainUpload);
      const textureName=options.texture||'fixture';
      gl.bindTexture(gl.TEXTURE_2D,textures[textureName]);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures[textureName+'Quiet']);gl.uniform1i(loc('u_quiet'),1);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.TRIANGLES,0,3);
    };
    const read=()=>{
      const pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`GL error ${error}`);
      return [...pixel];
    };
    window.probe=(options={})=>{
      gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.depthMask(true);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      drawSolar(options,options.pass||0);return read();
    };
    const drawFlat=(color,depth)=>{
      gl.useProgram(flat);gl.uniform4fv(gl.getUniformLocation(flat,'color'),color);gl.uniform1f(gl.getUniformLocation(flat,'depth'),depth);
      gl.drawArrays(gl.TRIANGLES,0,3);
    };
    // All intervals use the same test camera. Background/foreground depths lie outside
    // the disjoint solar envelope; this deliberately tests actual depth and blend state.
    window.composite=(options={})=>{
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.depthMask(true);
      gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      drawFlat([.1,.2,.35,1],.75);drawSolar(options,1);
      if(options.foregroundOpaque)drawFlat([.06,.38,.16,1],.25);
      gl.enable(gl.BLEND);gl.depthMask(false);gl.blendFunc(gl.ONE,gl.ONE);drawSolar(options,2);
      if(options.foregroundRing){gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);drawFlat([.1,.6,.2,.5],.25);}
      return read();
    };
    const viewVS=`#version 300 es
layout(location=0) in vec2 a_pos;
uniform vec3 u_cam;uniform vec3 u_forward;uniform vec3 u_right;uniform vec3 u_up;uniform float u_span;
out vec3 v_obj;
void main(){vec3 dir=normalize(u_forward+u_right*a_pos.x*u_span+u_up*a_pos.y*u_span);v_obj=u_cam+dir*8.0;gl_Position=vec4(a_pos,0,1);}`;
    const legacy=fs.replace('color=gold(mix(quiet,value,coverage))*presentation;','color=mix(vec3(.065,.039,.015),gold(value),coverage)*presentation;');
    const programs={current:program(viewVS,fs),legacy:program(viewVS,legacy)};
    window.renderDisk=({camera,forward,right,up,span,texture,shader,size,phase})=>{
      const target=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,target);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,size,size);
      const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
      gl.viewport(0,0,size,size);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
      gl.clearColor(8/255,12/255,20/255,1);gl.clear(gl.COLOR_BUFFER_BIT);
      const view=programs[shader];gl.useProgram(view);
      const at=name=>gl.getUniformLocation(view,name);
      gl.uniformMatrix4fv(at('u_mvp'),false,[1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1]);
      gl.uniformMatrix3fv(at('u_sourceBasis0'),false,uniforms.sourceBasis0);gl.uniformMatrix3fv(at('u_sourceBasis1'),false,uniforms.sourceBasis1);
      gl.uniform4fv(at('u_projection0'),uniforms.projection0);gl.uniform4fv(at('u_projection1'),uniforms.projection1);
      gl.uniform2fv(at('u_observerRadii'),uniforms.observerRadii);
      gl.uniform1f(at('u_extent'),uniforms.extent);gl.uniform1f(at('u_phase'),phase||0);gl.uniform1f(at('u_frameMix'),0);gl.uniform1i(at('u_pass'),0);
      gl.uniform1f(at('u_displayGain'),displayGain);gl.uniform1f(at('u_coronaGlow'),1);
      gl.uniform4fv(at('u_loopNormal[0]'),uniforms.loopNormal);gl.uniform4fv(at('u_loopTangent[0]'),uniforms.loopTangent);
      gl.uniform1fv(at('u_loopGain[0]'),uniforms.loopGain);
      gl.uniform3fv(at('u_cam'),camera);gl.uniform3fv(at('u_camObj'),camera);
      gl.uniform3fv(at('u_forward'),forward);gl.uniform3fv(at('u_right'),right);gl.uniform3fv(at('u_up'),up);gl.uniform1f(at('u_span'),span);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[texture]);gl.uniform1i(at('u_atlas'),0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures[texture+'Quiet']);gl.uniform1i(at('u_quiet'),1);
      gl.drawArrays(gl.TRIANGLES,0,3);
      const pixel=new Uint8Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`GL error ${error}`);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fbo);gl.deleteRenderbuffer(depth);gl.deleteTexture(target);
      gl.viewport(0,0,1,1);
      return [...pixel];
    };
    return {renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};
  },{vs:SOLAR_VS,fs:SOLAR_FS,probeVS,uniforms,quiet,displayGain:SOLAR_EUV_DISPLAY_GAIN});
  const probe=options=>page.evaluate(options=>window.probe(options),options);
  const rgba=value=>[...solarDisplayColor(value).map(c=>255*c),255];
  almost('source north remains up',await probe({target:[0,.35,1]}),rgba(200/255));
  almost('source south remains down',await probe({target:[0,-.35,1]}),rgba(64/255));
  almost('second source frame is sampled from independent atlas tile',await probe({target:[0,.35,1],mix:1}),rgba(128/255));
  almost('source interpolation is display intensity, not wall clock',await probe({target:[0,.35,1],mix:.5}),rgba(164/255));
  const farQuiet=quiet.fixture[31]/255;
  almost('unobserved hemisphere keeps the observed radial median',await probe({camera:[0,0,-3],target:[0,0,-1.35]}),rgba(farQuiet));
  almost('pinned atlas far side is the observed radial median',await probe({texture:'atlas',camera:[0,0,-3],target:[0,0,-1.35]}),rgba(quiet.atlas[31]/255),4);
  const dark=[.065*255,.039*255,.015*255];
  const farPixel=await probe({texture:'atlas',camera:[0,0,-3],target:[0,0,-1.35]});
  checks.push({name:'far side is not the old dark material',actual:farPixel,passed:farPixel[0]>dark[0]+40});
  const lifted=await probe({texture:'atlas',camera:[0,0,-3],target:[0,0,-1.35],displayGain:SOLAR_EUV_DISPLAY_GAIN});
  checks.push({name:'EUV presentation lifts the quiet disk well above the 1x gold map',actual:lifted,baseline:farPixel,passed:lifted[0]>farPixel[0]+80&&lifted[0]>180});
  const shellOn={camera:[0,0,-4],target:[1.15,0,0],coronaGlow:1,gains:new Array(24).fill(0)};
  const shellBright=await probe({...shellOn,phase:0});
  const shellDim=await probe({...shellOn,phase:Math.PI});
  checks.push({name:'whole-limb shell is bright off the disk',actual:shellBright,passed:shellBright[0]>160&&shellBright[3]>180});
  checks.push({name:'limb shell stays bright and breathes between flow phases',actual:shellDim,reference:shellBright,passed:Math.abs(shellBright[0]-shellDim[0])>40&&shellDim[0]>70});
  const noVolume=await probe({camera:[0,0,3],target:[1.2,0,0]});
  almost('empty off-limb volume is transparent',noVolume,[0,0,0,0]);
  const loop={normal:[0,0,1],tangent:[1,0,0],radius:.2,width:.01,gain:1};
  const normals=new Array(48).fill(0),tangents=new Array(48).fill(0),gains=new Array(12).fill(0);
  for(let i=0;i<12;i++){normals.splice(i*4,4,...loop.normal,loop.radius);tangents.splice(i*4,4,...loop.tangent,loop.width);}
  gains[0]=1;
  const emitted=await probe({normals,tangents,gains});
  const base=await probe({});
  checks.push({name:'elevated model emits above foreground disk',actual:emitted,baseline:base,passed:emitted[0]>base[0]+10});
  const hidden=[...normals];hidden[2]=-1;
  almost('far-side loop cannot shine through opaque disk',await probe({normals:hidden,tangents,gains}),base);
  const limbNormals=[...normals],limbTangents=[...tangents];
  limbNormals.splice(0,4,1,0,0,.2);limbTangents.splice(0,4,0,1,0,.02);
  const limbTarget=[Math.sqrt(.96)+.2,0,0];
  const limb=await probe({normals:limbNormals,tangents:limbTangents,gains,target:limbTarget});
  checks.push({name:'modeled arcade extends beyond the solar silhouette',actual:limb,passed:limb[3]>20&&limb[0]>100});
  const faintGains=[...gains];faintGains[0]=.12;
  const compositeOptions={normals:limbNormals,tangents:limbTangents,gains:faintGains,target:limbTarget};
  const emissionPixel=await probe({...compositeOptions,pass:2});
  const background=[.1,.2,.35].map(v=>Math.round(v*255));
  const additive=background.map((v,i)=>Math.min(255,v+emissionPixel[i]));
  const composite=options=>page.evaluate(options=>window.composite(options),options);
  almost('split corona preserves farther opaque geometry through the off-limb volume',await composite(compositeOptions),[...additive,255],2);
  almost('foreground opaque body rejects solar emission',await composite({...compositeOptions,foregroundOpaque:true}),[.06*255,.38*255,.16*255,255],2);
  // Normal SRC_ALPHA blending also blends alpha; compare RGB because the canvas is opaque in production.
  almost('nearer translucent ring attenuates the already-composited solar emission',
    (await composite({...compositeOptions,foregroundRing:true})).slice(0,3),additive.map((v,i)=>(v+[.1,.6,.2][i]*255)*.5),2);
  almost('split opaque source disk hides background and matches the combined source/emission ray',
    await composite({normals,tangents,gains}),emitted,2);
  const phase=await probe({normals,tangents,gains,phase:Math.PI});
  checks.push({name:'explicit model phase changes emitted brightness',actual:phase,reference:emitted,passed:phase.some((v,i)=>i<3&&Math.abs(v-emitted[i])>2)});
  const farLoop=solarGlobalLoops().find(loop=>loop.normal[2]<-0.5);
  const apex=farLoop.normal.map(v=>v*(Math.sqrt(1-farLoop.radius*farLoop.radius)+farLoop.radius));
  const wholeGains=uniforms.loopGain.map((gain,index)=>index<12?0:gain);
  const brightPhase=[0,Math.PI/2,Math.PI,3*Math.PI/2].reduce((best,phase)=>solarLoopDensity(apex,[farLoop],phase)>solarLoopDensity(apex,[farLoop],best)?phase:best,0);
  const farView={camera:[0,0,-4],target:apex,normals:uniforms.loopNormal,tangents:uniforms.loopTangent,gains:wholeGains,phase:brightPhase};
  const farGlow=await probe(farView);
  checks.push({name:'whole-sphere arch emits on the far side',actual:farGlow,passed:farGlow[3]>20&&farGlow[0]>40});
  const farMoved=await probe({...farView,phase:brightPhase+Math.PI});
  checks.push({name:'whole-sphere flow changes far-side brightness',actual:farMoved,reference:farGlow,passed:farMoved.slice(0,3).some((v,i)=>Math.abs(v-farGlow[i])>2)});
  const frontDisk=await probe({camera:[0,0,4],target:apex});
  almost('far-side arch cannot shine through the opaque disk',await probe({camera:[0,0,4],target:apex,normals:uniforms.loopNormal,tangents:uniforms.loopTangent,gains:wholeGains}),frontDisk);
  almost('repeated source/model phase reproduces pixels',await probe({normals,tangents,gains}),emitted,0);
  // Numerical reference at exactly the shader's midpoint samples, separate implementation.
  const emission=integrateSolarEmission([0,0,3],[0,0,-1],[loop],0,32);
  const glow=1-Math.exp(-35*emission);
  const expected=base.slice(0,3).map((c,i)=>Math.min(255,c+[1,.58,.12][i]*glow*255));expected.push(255);
  almost('Float64 midpoint emission matches GPU',emitted,expected,3);
  // Pixel-check admitted NASA atlas against independent PNG decode and projection.
  const decoded=PNG.sync.read(atlas.bytes),frame=SOLAR_APPEARANCE.frames[0];
  const uv=projectSolarSurface([0,0,1],frame).uv;
  const x=uv[0]*1024-.5,y=uv[1]*1024-.5,x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
  const get=(xx,yy)=>decoded.data[(yy*decoded.width+xx)*4]/255;
  const value=(1-ty)*((1-tx)*get(x0,y0)+tx*get(x0+1,y0))+ty*((1-tx)*get(x0,y0+1)+tx*get(x0+1,y0+1));
  almost('pinned NASA atlas source-center intensity matches decoded pixels',await probe({texture:'atlas'}),rgba(value),3);
  assert.match(SOLAR_FS,/color=presentGold\(gold\(mix\(quiet,value,coverage\)\)\);/);
  if(checks.every(check=>check.passed)){
    const size=256;
    const side={camera:[4,0,0],forward:[-1,0,0],right:[0,0,-1],up:[0,1,0],span:.42,texture:'atlas',size};
    const far={camera:[0,0,-4],forward:[0,0,1],right:[-1,0,0],up:[0,1,0],span:.42,texture:'atlas',size};
    const shots=[['sun-euv-side-before',{...side,shader:'legacy'}],['sun-euv-side-after',{...side,shader:'current'}],['sun-euv-far-after',{...far,shader:'current'}],['sun-euv-far-flow',{...far,shader:'current',phase:Math.PI}]];
    const written=[];
    for(const [name,options] of shots){
      const raw=await page.evaluate(view=>window.renderDisk(view),options);
      const png=new PNG({width:size,height:size});
      for(let y=0;y<size;y++)png.data.set(raw.slice((size-1-y)*size*4,(size-y)*size*4),y*size*4);
      const file=path.join(out,`${name}.png`);
      fs.writeFileSync(file,PNG.sync.write(png));
      written.push(png);
    }
    const gap=8,compare=new PNG({width:size*2+gap,height:size});
    for(let i=0;i<compare.data.length;i+=4){compare.data[i]=8;compare.data[i+1]=12;compare.data[i+2]=20;compare.data[i+3]=255;}
    for(const [index,png] of written.slice(0,2).entries()){
      for(let y=0;y<size;y++)compare.data.set(png.data.subarray(y*size*4,(y+1)*size*4),(y*compare.width+index*(size+gap))*4);
    }
    fs.writeFileSync(path.join(out,'sun-euv-side-compare.png'),PNG.sync.write(compare));
    const flowCompare=new PNG({width:size*2+gap,height:size});
    for(let i=0;i<flowCompare.data.length;i+=4){flowCompare.data[i]=8;flowCompare.data[i+1]=12;flowCompare.data[i+2]=20;flowCompare.data[i+3]=255;}
    for(const [index,png] of [written[2],written[3]].entries()){
      for(let y=0;y<size;y++)flowCompare.data.set(png.data.subarray(y*size*4,(y+1)*size*4),(y*flowCompare.width+index*(size+gap))*4);
    }
    fs.writeFileSync(path.join(out,'sun-euv-far-flow-compare.png'),PNG.sync.write(flowCompare));
    const offLimb=png=>{
      let count=0;
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const radiusPx=Math.hypot(x-127.5,y-127.5);
        if(radiusPx<86||radiusPx>120)continue;
        const i=(y*size+x)*4;
        if(png.data[i]!==8||png.data[i+1]!==12||png.data[i+2]!==20)count++;
      }
      return count;
    };
    const changed=()=>{
      let count=0;
      for(let i=0;i<written[2].data.length;i+=4){
        const delta=Math.abs(written[2].data[i]-written[3].data[i])+Math.abs(written[2].data[i+1]-written[3].data[i+1])+Math.abs(written[2].data[i+2]-written[3].data[i+2]);
        if(delta>12)count++;
      }
      return count;
    };
    checks.push({name:'far view shows arches beyond the disk',actual:offLimb(written[2]),passed:offLimb(written[2])>20});
    checks.push({name:'side view shows arches beyond the disk',actual:offLimb(written[1]),passed:offLimb(written[1])>20});
    checks.push({name:'far-side flow moves visible pixels',actual:changed(),passed:changed()>15});
    if(fs.existsSync('/opt/cursor')){
      const artifacts='/opt/cursor/artifacts';
      fs.mkdirSync(artifacts,{recursive:true});
      for(const name of [...shots.map(([shot])=>shot),'sun-euv-side-compare','sun-euv-far-flow-compare']){
        fs.copyFileSync(path.join(out,`${name}.png`),path.join(artifacts,`${name}.png`));
      }
    }
  }
  assert.deepEqual(errors,[]);
  const failed=checks.filter(c=>!c.passed);if(failed.length)throw Error(failed.map(c=>c.name).join('; '));
}

try{
  await Promise.race([run(),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Solar GPU gate exceeded 60 seconds')),60000);})]);
  evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.message;process.exitCode=1;}
finally{
  clearTimeout(deadline);if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  evidence.runtime_errors=errors;fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(`Solar GPU ${evidence.status}: ${checks.filter(c=>c.passed).length}/${checks.length} checks. ${path.join(out,'evidence.json')}`);
  if(evidence.error)console.error(evidence.error);
}
