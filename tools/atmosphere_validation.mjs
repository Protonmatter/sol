#!/usr/bin/env node
// Actual shipped optical shader vs independent Python float64 integration.
// No atmosphere is fetched; the only browser document is a local blank canvas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function argument(name,fallback){const flag=process.argv.find(value=>value.startsWith(`--${name}=`));return flag?flag.slice(name.length+3):fallback;}
const webRoot=path.resolve(argument('web-root',path.join(ROOT,'apps/web')));
const out=path.resolve(argument('out',path.join(ROOT,'coverage/atmosphere')));
const chrome=argument('browser',process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const releaseFile=path.join(webRoot,'web-release-manifest.json');
const release=fs.existsSync(releaseFile)?JSON.parse(fs.readFileSync(releaseFile,'utf8')):null;
if(release)assert.equal(release.schema_version,'web-release-manifest.v1');
const pageRoot=release?path.resolve(webRoot,release.namespace):webRoot;
assert.ok(pageRoot===webRoot||pageRoot.startsWith(webRoot+path.sep),'release namespace escapes web root');
const hashes={};
async function moduleFile(relative){
 const file=path.resolve(pageRoot,relative), bytes=fs.readFileSync(file);
 assert.ok(file.startsWith(pageRoot+path.sep),'module path escapes selected namespace');
 hashes[relative]=digest(bytes);
 if(release){const asset=release.assets.find(asset=>asset.path===path.relative(webRoot,file).split(path.sep).join('/'));
  assert.ok(asset,`${relative} absent from release`);assert.equal(hashes[relative],asset.sha256,`${relative} hash mismatch`);}
 return import(pathToFileURL(file).href);
}
const {ATMOSPHERE_VS}=await moduleFile('js/atmosphereShaders.js');
const {ATMOSPHERE_RENDER_GLSL:ATMOSPHERE_GLSL,ATMOSPHERE_RENDER_FS:ATMOSPHERE_FS}=await moduleFile('js/atmosphereColumnField.js');
const {ATMOSPHERE_COLUMN_FIELDS}=await moduleFile('js/atmosphereColumnManifest.js');
const {getAtmosphereProfile,atmosphereUniformValues}=await moduleFile('js/atmosphereOptics.js');
const {SPHERE_VS,SPHERE_FS}=await moduleFile('js/orreryShaders.js');
const {INCIDENT_FIELDS}=await moduleFile('js/atmosphereIncidentManifest.js');
const {sampleIncidentField}=await moduleFile('js/atmosphereIncident.js');
const fields={};
const columns={};
for(const [body,reference]of Object.entries(ATMOSPHERE_COLUMN_FIELDS)){
 const relative=path.posix.normalize(`js/${reference.path}`),file=path.join(pageRoot,relative),bytes=fs.readFileSync(file);
 assert.equal(bytes.length,reference.bytes);assert.equal(digest(bytes),reference.sha256);hashes[relative]=digest(bytes);
 if(release){const entry=release.assets.find(a=>a.path===path.relative(webRoot,file).split(path.sep).join('/'));assert.equal(entry?.sha256,reference.sha256);}
 columns[body]={values:Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4)),width:512,height:512};
}
for(const [body,reference]of Object.entries(INCIDENT_FIELDS)){
 const relative=path.posix.normalize(`js/${reference.path}`),file=path.join(pageRoot,relative),bytes=fs.readFileSync(file);
 assert.equal(bytes.length,reference.bytes);assert.equal(digest(bytes),reference.sha256);
 hashes[relative]=digest(bytes);
 if(release){const entry=release.assets.find(a=>a.path===path.relative(webRoot,file).split(path.sep).join('/'));assert.equal(entry?.sha256,reference.sha256);}
 fields[body]={values:Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4)),width:reference.dimensions[0],height:reference.dimensions[1]*reference.dimensions[2]};
}
assert.doesNotMatch(SPHERE_VS,/atmosphereCurvedRay|atmosphereRayDerivative/,'rendering must never integrate incident rays');
assert.doesNotMatch(SPHERE_FS+ATMOSPHERE_FS,/atmosphereColumnSegment|float atmosphereColumn\(/,'production fragments must not integrate density columns');
await moduleFile('js/terrainShadowShaders.js');
hashes.reference=digest(fs.readFileSync(path.join(ROOT,'tools/atmosphere_reference.py')));
// Fixed admission tolerances, separate from the measured errors in evidence.
const ABSOLUTE_TOLERANCE=1e-4, RELATIVE_TOLERANCE=.002, ZERO_TOLERANCE=1e-7;
const cases = [];
function fixture(name, body, origin, direction, sun, q=1, au=1, vacuum=false, altitude=0){
  let profile=getAtmosphereProfile(body);
  if(vacuum) profile={...profile,betaRayleighKm:[0,0,0],betaAerosolExtinctionKm:[0,0,0]};
  const a=direction[0]**2+direction[1]**2+(direction[2]/q)**2;
  const b=origin[0]*direction[0]+origin[1]*direction[1]+origin[2]*direction[2]/q**2;
  const c=origin[0]**2+origin[1]**2+(origin[2]/q)**2-profile.radiusKm**2;
  const disc=b*b-a*c;
  const maximum=disc>=0 ? Math.max(0,(-b-Math.sqrt(disc))/a-altitude) : 1e20;
  cases.push({name,origin,direction,sun,profile,q,au,maximum, uniforms:atmosphereUniformValues(profile,{cameraBodyKm:origin,sunDirectionBody:sun,polarRatio:q,solarDistanceAu:au,exposure:1})});
}
fixture('Earth day','Earth',[0,0,8000],[0,0,-1],[0,0,1]);
fixture('Earth night self-shadow','Earth',[0,0,8000],[0,0,-1],[0,0,-1]);
fixture('Earth limb 10km','Earth',[6388.137,0,8000],[0,0,-1],[1,0,0]);
fixture('Earth grazing 100m','Earth',[6378.237,0,8000],[0,0,-1],[1,0,0]);
fixture('Earth twilight','Earth',[6380.137,0,8000],[0,0,-1],[-1,0,.3]);
fixture('Earth partial twilight','Earth',[6380.137,0,8000],[0,0,-1],[-.05,0,1]);
fixture('Earth oblate polar','Earth',[0,0,8000],[0,0,-1],[0,0,1],.9966);
fixture('Earth inverse square','Earth',[0,0,8000],[0,0,-1],[0,0,1],1,2);
fixture('Earth vacuum','Earth',[0,0,8000],[0,0,-1],[0,0,1],1,1,true);
fixture('Mars day','Mars',[0,0,5000],[0,0,-1],[0,0,1]);
fixture('Mars limb','Mars',[3406.19,0,5000],[0,0,-1],[1,0,0]);
fixture('Earth elevated surface','Earth',[0,0,8000],[0,0,-1],[0,0,1],1,1,false,10);
const obliqueDirection=[-8000,0,6378.137-8000];
fixture('Earth oblique surface','Earth',[8000,0,8000],obliqueDirection.map(v=>v/Math.hypot(...obliqueDirection)),[0,0,1]);
const script=`import json,sys
sys.path.insert(0,'tools')
from atmosphere_reference import trace_single_scattering
result=[]
for c in json.loads(sys.stdin.read()):
 p=c['profile']
 result.append(trace_single_scattering(c['origin'],c['direction'],c['sun'],radius_km=p['radiusKm'],top_km=p['topKm'],rayleigh_h_km=p['rayleighScaleHeightKm'],aerosol_h_km=p['aerosolScaleHeightKm'],beta_rayleigh=p['betaRayleighKm'],beta_extinction=p['betaAerosolExtinctionKm'],aerosol_ssa=p['aerosolSingleScatteringAlbedo'],g=p['aerosolG'],polar_ratio=c['q'],solar_distance_au=c['au'],view_steps=512,solar_steps=512,max_distance_km=c['maximum']))
print(json.dumps(result))`;
const expected=JSON.parse(execFileSync(argument('python','python'),['-c',script],{cwd:ROOT,input:JSON.stringify(cases),encoding:'utf8',timeout:90000,windowsHide:true}));
// Independent fixed-step float64 shooting reference; actual production vertex
// outputs are captured below, rather than reimplementing the shader in a probe.
const refractionCases=[];
function refractiveFixture(body,zenithDegrees,{q=1,latitude=0,altitude=0,azimuth=0,vacuum=false}={}){
 const original=getAtmosphereProfile(body), profile=vacuum?{...original,surfaceRefractivity:0}:original;
 const lat=latitude*Math.PI/180, radius=profile.radiusKm+altitude;
 const point=[radius*Math.cos(lat),0,radius*q*Math.sin(lat)];
 let up=[Math.cos(lat),0,Math.sin(lat)/q];const length=Math.hypot(...up);up=up.map(v=>v/length);
 const z=zenithDegrees*Math.PI/180,az=azimuth*Math.PI/180,meridian=[up[2],0,-up[0]],tangent=meridian.map((v,j)=>v*Math.sin(az)+(j===1?Math.cos(az):0)),sun=up.map((value,j)=>value*Math.cos(z)+tangent[j]*Math.sin(z));
 refractionCases.push({name:`${body} incident ${zenithDegrees}deg q${q} lat${latitude} alt${altitude} az${azimuth}${vacuum?' vacuum-index':''}`,profile,q,point,sun,vacuum,
  uniforms:atmosphereUniformValues(profile,{cameraBodyKm:[0,0,8000],sunDirectionBody:sun,polarRatio:q,solarDistanceAu:1,exposure:1})});
}
for(const angle of [0,60,80,89,90.2,90.8,92.5])refractiveFixture('Earth',angle);
for(const angle of [80,89,90.01])refractiveFixture('Mars',angle);
refractiveFixture('Earth',89,{q:.9966,latitude:45});
refractiveFixture('Earth',80,{altitude:10});
refractiveFixture('Earth',80,{vacuum:true});
// Interior table cells, signed DEM heights, curvature layers and near-rise
// visibility boundaries. None of these geometries is a field-grid endpoint.
for(const angle of [88.713,90.31,90.51,90.55,90.57,90.59,90.61])refractiveFixture('Earth',angle,{q:.9966,latitude:45,azimuth:45});
for(const altitude of [.14,1.37,7.83,15.3])refractiveFixture('Earth',89.347,{altitude,q:.9966,latitude:80,azimuth:90});
for(const angle of [89.735,89.993,90.001,90.004,90.007,90.009])refractiveFixture('Mars',angle,{q:.9941,latitude:45,azimuth:45});
for(const altitude of [-22.37,-7.13,3.37,20.73])refractiveFixture('Mars',89.347,{altitude,q:.9941,latitude:80,azimuth:90});
refractiveFixture('Earth',89.5,{q:.9966,latitude:90,azimuth:90});
refractiveFixture('Mars',89.5,{q:.9941,latitude:90,azimuth:90});
const refractiveScript=`import json,sys,math
sys.path.insert(0,'tools')
from atmosphere_reference import incident_solar_refraction
results=[]
for c in json.loads(sys.stdin.read()):
 p=c['profile']
 r=incident_solar_refraction(c['point'],c['sun'],radius_km=p['radiusKm'],top_km=p['topKm'],refractivity=p['surfaceRefractivity'],scale_height_km=p['rayleighScaleHeightKm'],aerosol_scale_height_km=p['aerosolScaleHeightKm'],polar_ratio=c['q'],step_km=.2)
 r['transmission']=[math.exp(-b*r['columns'][0]-a*r['columns'][1]) if r['visible'] else 0 for b,a in zip(p['betaRayleighKm'],p['betaAerosolExtinctionKm'])]
 results.append(r)
print(json.dumps(results))`;
const refractiveExpected=JSON.parse(execFileSync(argument('python','python'),['-c',refractiveScript],{cwd:ROOT,input:JSON.stringify(refractionCases),encoding:'utf8',timeout:90000,windowsHide:true}));
const decode=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
const encode=value=>value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055;
const color=[64,96,128].map(value=>value/255), nightColor=[32,128,224].map(value=>value/255);
const ref=name=>expected[cases.findIndex(c=>c.name===name)];
const params=name=>cases.find(c=>c.name===name).uniforms;
const day=ref('Earth day'), night=ref('Earth night self-shadow'), distant=ref('Earth inverse square');
const elevated=ref('Earth elevated surface');
const oblique=ref('Earth oblique surface');
const dayColor=base=>base.map((value,j)=>encode(decode(value)*day.transmittance[j]**2+day.scattering[j]));
const materialCases=[
 {name:'combined registered incident and view transport',uniforms:params('Earth day'),expected:dayColor(color)},
 {name:'combined fallback display RGB is decoded',uniforms:params('Earth day'),reference:false,expected:dayColor(color)},
 {name:'combined old rim is disabled',uniforms:params('Earth day'),rim:true,expected:dayColor(color)},
 {name:'combined physical flux scales direct and scattered light',uniforms:params('Earth inverse square'),expected:color.map((v,j)=>encode(decode(v)*distant.transmittance[j]**2*.25+distant.scattering[j]))},
 {name:'combined night emission has view attenuation only',uniforms:params('Earth night self-shadow'),light:[0,0,-1],night:true,expected:nightColor.map((v,j)=>encode(decode(v)*night.transmittance[j]))},
 {name:'combined disabled profile preserves registered appearance',uniforms:{u_atmosphereEnabled:0},expected:color},
 {name:'combined displaced endpoint retains physical elevation',uniforms:params('Earth elevated surface'),point:[0,0,(6378.137+10)/6378.137],bodyRadius:6378.137,
  expected:color.map((value,j)=>encode(decode(value)*elevated.transmittance[j]**2+elevated.scattering[j]))},
 // The production 48x96 sphere's interpolated chords are several km below its
 // ellipsoid. Tessellation sag must never be interpreted as atmospheric altitude.
 {name:'combined sphere edge midpoint does not acquire false underground extinction',uniforms:params('Earth day'),point:[0,0,Math.cos(Math.PI/96)],surfaceScale:1,bodyRadius:6378.137,expected:dayColor(color)},
 {name:'combined sphere cell center does not acquire false underground extinction',uniforms:params('Earth day'),point:[0,0,Math.cos(Math.PI/96)**2],surfaceScale:1,bodyRadius:6378.137,expected:dayColor(color)},
 {name:'combined oblique limb view does not magnify tessellation sag',uniforms:params('Earth oblique surface'),point:[0,0,Math.cos(Math.PI/96)**2],surfaceScale:1,bodyRadius:6378.137,
  expected:color.map((value,j)=>encode(decode(value)*day.transmittance[j]*oblique.transmittance[j]+oblique.scattering[j]))},
 {name:'combined chord correction preserves displaced terrain elevation',uniforms:params('Earth elevated surface'),point:[0,0,Math.cos(Math.PI/96)**2*(6378.137+10)/6378.137],surfaceScale:(6378.137+10)/6378.137,bodyRadius:6378.137,
  expected:color.map((value,j)=>encode(decode(value)*elevated.transmittance[j]**2+elevated.scattering[j]))},
 {name:'combined refracted direction and curved extinction drive direct light',uniforms:params('Earth day'),refraction:true,apparent:[.6,0,.8],solarTransmission:[.2,.4,.6],
  expected:color.map((v,j)=>encode(decode(v)*.8*[.2,.4,.6][j]*day.transmittance[j]+day.scattering[j]))},
 {name:'combined refracted solar extinction does not suppress night emission',uniforms:params('Earth night self-shadow'),refraction:true,solarTransmission:[0,0,0],light:[0,0,-1],night:true,
  expected:nightColor.map((v,j)=>encode(decode(v)*night.transmittance[j]))},
];
const low=[Math.sin(5*Math.PI/180),Math.cos(5*Math.PI/180),0], high=[Math.sin(40*Math.PI/180),Math.cos(40*Math.PI/180),0];
const terrainColor=incidence=>color.map(value=>encode(decode(value)*(.001+.999*incidence)));
const terrainVacuum={...getAtmosphereProfile('Earth'),radiusKm:1000,betaRayleighKm:[0,0,0],betaAerosolExtinctionKm:[0,0,0]};
materialCases.push(
 {name:'combined ridge blocks low direct light',uniforms:{u_atmosphereEnabled:0},terrain:true,normal:[1,0,0],point:[1,0,0],light:low,expected:terrainColor(0)},
 {name:'combined ridge clears high direct light',uniforms:{u_atmosphereEnabled:0},terrain:true,normal:[1,0,0],point:[1,0,0],light:high,expected:terrainColor(high[0])},
 {name:'combined disabled terrain preserves direct light',uniforms:{u_atmosphereEnabled:0},normal:[1,0,0],point:[1,0,0],light:low,expected:terrainColor(low[0])},
 {name:'combined terrain preserves night emission',uniforms:{u_atmosphereEnabled:0},terrain:true,normal:[1,0,0],point:[1,0,0],light:[-1,0,0],night:true,
  expected:color.map((value,j)=>encode(.001*decode(value)+decode(nightColor[j])))},
 {name:'combined terrain shadow follows refracted apparent Sun',uniforms:atmosphereUniformValues(terrainVacuum,{cameraBodyKm:[8000,0,0],sunDirectionBody:low,polarRatio:1,solarDistanceAu:1,exposure:1}),terrain:true,refraction:true,apparent:high,normal:[1,0,0],point:[1,0,0],light:low,
  expected:color.map(value=>encode(decode(value)*high[0]))},
);
const evidence={schema_version:'atmosphere-validation.v1',scope:'Reference-model numerical GPU comparison; not observed atmospheric qualification or frame-rate qualification',
 web_root:webRoot,release_namespace:release?.namespace??null,source_sha256:hashes,started_at:new Date().toISOString(),checks:[],status:'failed'};
fs.mkdirSync(out,{recursive:true});
let browser;
try {
 browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-background-networking','--use-angle=swiftshader','--enable-unsafe-swiftshader'],timeout:20000,protocolTimeout:30000});
 evidence.browser_version=await browser.version();
 const page=await browser.newPage(); await page.setRequestInterception(true);page.on('request',request=>request.abort());
 await page.setContent('<canvas width=1 height=1></canvas>');
 const actual=await page.evaluate(({cases,materials,refractionCases,fields,columns,shared,shellVs,shellFs,sphereVs,sphereFs})=>{
  const gl=document.querySelector('canvas').getContext('webgl2',{antialias:false});
  if(!gl || !gl.getExtension('EXT_color_buffer_float')) throw Error('float WebGL2 unavailable');
  const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=(vs,fs,varyings)=>{const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));if(varyings)gl.transformFeedbackVaryings(p,varyings,gl.INTERLEAVED_ATTRIBS);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
  program(shellVs,shellFs);
  program(sphereVs,sphereFs);
  const p=program('#version 300 es\nvoid main(){vec2 p=gl_VertexID==0?vec2(-1,-1):gl_VertexID==1?vec2(3,-1):vec2(-1,3);gl_Position=vec4(p,0,1);}', '#version 300 es\nprecision highp float;out vec4 o;uniform vec3 u_probeOrigin,u_probeDir;uniform float u_probeMax;uniform int u_probeKind;'+shared+'\nvoid main(){AtmosphereResult r=integrateAtmosphere(u_probeOrigin,u_probeDir,u_probeMax);o=vec4(u_probeKind==0?r.transmittance:r.scattering,1.0);}');
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,1,1);
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('incomplete float target');
  const columnTextures={};
  for(const [body,field]of Object.entries(columns)){
    gl.activeTexture(gl.TEXTURE7);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,field.width,field.height,0,gl.RG,gl.FLOAT,new Float32Array(field.values));
    for(const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.NEAREST);
    for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);columnTextures[body]=texture;
  }
  const bindColumns=(program,body)=>{gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,columnTextures[body]);gl.uniform1i(gl.getUniformLocation(program,'u_atmosphereColumnField'),7);gl.activeTexture(gl.TEXTURE0);};
  gl.useProgram(p);
  const upload=(name,value)=>{const u=gl.getUniformLocation(p,name);if(Array.isArray(value)) {if(value.length===2)gl.uniform2fv(u,value);else gl.uniform3fv(u,value);} else if(name==='u_atmosphereEnabled'||name==='u_atmosphereRefractionEnabled'||name==='u_probeKind')gl.uniform1i(u,value);else gl.uniform1f(u,value);};
  const transfer=cases.map(c=>{bindColumns(p,c.profile.body);for(const [key,value]of Object.entries(c.uniforms))upload(key,value);upload('u_probeOrigin',c.origin);upload('u_probeDir',c.direction);upload('u_probeMax',c.maximum);
   const result={};for(const [kind,key]of [[0,'transmittance'],[1,'scattering']]){upload('u_probeKind',kind);gl.drawArrays(gl.TRIANGLES,0,3);const raw=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,raw);result[key]=Array.from(raw).slice(0,3);}if(gl.getError()!==gl.NO_ERROR)throw Error('GL readback error');return result;});
  const refractiveProgram=program(sphereVs,'#version 300 es\nprecision highp float;out vec4 o;void main(){o=vec4(0);}', ['v_incidentSunBody','v_incidentSunWorld','v_incidentTransmission']);
  gl.useProgram(refractiveProgram);
  const fieldTextures={};
  for(const [body,field]of Object.entries(fields)){
    gl.activeTexture(gl.TEXTURE6);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,field.width,field.height,0,gl.RGBA,gl.FLOAT,new Float32Array(field.values));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);fieldTextures[body]=texture;
  }
  const feedback=gl.createBuffer();gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,feedback);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,36,gl.DYNAMIC_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,feedback);
  const refractiveResults=refractionCases.map(c=>{
    bindColumns(refractiveProgram,c.profile.body);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,fieldTextures[c.profile.body]);
    gl.uniform1i(gl.getUniformLocation(refractiveProgram,'u_incidentField'),6);
    gl.uniform1i(gl.getUniformLocation(refractiveProgram,'u_incidentFieldReady'),1);
    gl.uniform3fv(gl.getUniformLocation(refractiveProgram,'u_incidentFieldHeight'),c.profile.body==='Earth'?[0,16,1]:[-24,24,0]);
    for(const [name,value] of Object.entries(c.uniforms)){
      const u=gl.getUniformLocation(refractiveProgram,name);
      if(Array.isArray(value)){if(value.length===2)gl.uniform2fv(u,value);else gl.uniform3fv(u,value);}
      else if(name==='u_atmosphereEnabled'||name==='u_atmosphereRefractionEnabled')gl.uniform1i(u,value);else gl.uniform1f(u,value);
    }
    gl.uniform1f(gl.getUniformLocation(refractiveProgram,'u_bodyRadiusKm'),c.profile.radiusKm);
    gl.uniform1f(gl.getUniformLocation(refractiveProgram,'u_oblate'),c.q);
    gl.uniformMatrix4fv(gl.getUniformLocation(refractiveProgram,'u_mvp'),false,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    gl.uniformMatrix4fv(gl.getUniformLocation(refractiveProgram,'u_model'),false,[0,1,0,0,-1,0,0,0,0,0,c.q,0,0,0,0,1]);
    gl.uniformMatrix3fv(gl.getUniformLocation(refractiveProgram,'u_nmat'),false,[1,0,0,0,1,0,0,0,1]);
    gl.vertexAttrib3fv(0,c.point.map((v,j)=>v/c.profile.radiusKm/(j===2?c.q:1)));gl.vertexAttrib3f(1,1,0,0);
    gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,1);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
    const raw=new Float32Array(9);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,raw);
    if(gl.getError()!==gl.NO_ERROR)throw Error('incident refraction vertex readback error');
    return {direction:Array.from(raw).slice(0,3),world:Array.from(raw).slice(3,6),transmission:Array.from(raw).slice(6,9)};
  });
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);
  const materialProgram=program('#version 300 es\nprecision highp float;uniform vec3 u_probePoint,u_probeNormal,u_probeApparent,u_probeTransmission;uniform float u_probeSurfaceScale;out float v_surfaceScale;out vec3 v_obj,v_world,v_nrm,v_incidentSunBody,v_incidentSunWorld,v_incidentTransmission;void main(){vec2 p=gl_VertexID==0?vec2(-1,-1):gl_VertexID==1?vec2(3,-1):vec2(-1,3);v_obj=u_probePoint;v_world=u_probePoint;v_nrm=u_probeNormal;v_surfaceScale=u_probeSurfaceScale;v_incidentSunBody=u_probeApparent;v_incidentSunWorld=u_probeApparent;v_incidentTransmission=u_probeTransmission;gl_Position=vec4(p,0,1);}',sphereFs);
  gl.useProgram(materialProgram);
  const integers=new Set(['u_style','u_mode','u_useTex','u_texMode','u_mapNoData','u_earthNight','u_earthWeather','u_earthIce','u_moonShadowCount','u_terrainShadowEnabled','u_atmosphereEnabled','u_atmosphereRefractionEnabled','u_tex','u_nightTex','u_weatherTex','u_iceTex','u_ringTex','u_terrainHeight']);
  const mat=(name,value)=>{const u=gl.getUniformLocation(materialProgram,name);if(Array.isArray(value)){if(value.length===2)gl.uniform2fv(u,value);else if(value.length===3)gl.uniform3fv(u,value);else gl.uniform4fv(u,value);}else if(integers.has(name))gl.uniform1i(u,value);else gl.uniform1f(u,value);};
  const image=(unit,rgba)=>{gl.activeTexture(gl.TEXTURE0+unit);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t;};
  image(0,[64,96,128,255]);image(1,[32,128,224,255]);image(2,[0,0,0,0]);
  const ridge=new Float32Array(720*360);
  for(let i=0;i<ridge.length;i++){const longitude=((i%720+.5)/720)*360;if(longitude>2&&longitude<4)ridge[i]=20;}
  gl.activeTexture(gl.TEXTURE3);const terrain=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,terrain);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,720,360,0,gl.RED,gl.FLOAT,ridge);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const materialResults=materials.map(c=>{
    bindColumns(materialProgram,'Earth');
    mat('u_style',-1);mat('u_mode',0);mat('u_useTex',c.reference===false?0:1);mat('u_texMode',3);mat('u_mapNoData',0);mat('u_moonShadowCount',0);
    mat('u_earthNight',c.night?1:0);mat('u_earthWeather',0);mat('u_earthIce',0);
    mat('u_tex',0);mat('u_nightTex',1);mat('u_weatherTex',2);mat('u_iceTex',2);mat('u_ringTex',2);mat('u_terrainHeight',3);
    mat('u_probePoint',c.point||[0,0,1]);mat('u_probeNormal',c.normal||[0,0,1]);mat('u_light',c.light||[0,0,1]);mat('u_lightObj',c.light||[0,0,1]);
    mat('u_probeSurfaceScale',c.surfaceScale??Math.hypot(...(c.point||[0,0,1])));
    mat('u_probeApparent',c.apparent||[0,0,1]);mat('u_probeTransmission',c.solarTransmission||[1,1,1]);
    mat('u_cam',c.rim?[100,0,1]:[0,0,8000]);mat('u_base',[64/255,96/255,128/255]);
    mat('u_atmo',[1,0,1]);mat('u_atmoStr',c.rim?5:0);mat('u_oblate',1);mat('u_bodyRadiusKm',c.bodyRadius||(c.terrain||c.point?1000:6378.137));
    mat('u_ringRad',[0,0]);mat('u_map',[.5,1,0,0]);mat('u_mapLat',[-Math.PI/2,Math.PI/2,-Math.PI/2,Math.PI/2]);mat('u_mapWindow',[1,1,0,0]);
    mat('u_terrainShadowEnabled',c.terrain?1:0);mat('u_terrainShape',[1000,1000,1020,0]);mat('u_terrainPoles',[80/720,80/720]);
    for(const [name,value]of Object.entries(c.uniforms))mat(name,value);
    mat('u_atmosphereRefractionEnabled',c.refraction?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);const raw=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,raw);
    if(gl.getError()!==gl.NO_ERROR)throw Error('combined material GL readback error');return Array.from(raw).slice(0,3);
  });
  return {transfer,materials:materialResults,refraction:refractiveResults};
 },{cases,materials:materialCases,refractionCases,fields,columns,shared:ATMOSPHERE_GLSL,shellVs:ATMOSPHERE_VS,shellFs:ATMOSPHERE_FS,sphereVs:SPHERE_VS,sphereFs:SPHERE_FS});
 evidence.checks=cases.flatMap((c,i)=>['transmittance','scattering'].map(key=>{
  const reference=expected[i][key], measured=actual.transfer[i][key];
  const tolerances=reference.map(value=>value===0?ZERO_TOLERANCE:ABSOLUTE_TOLERANCE+RELATIVE_TOLERANCE*Math.abs(value));
  return {name:`${c.name} ${key}`,expected:reference,actual:measured,tolerances,
   absolute_errors:measured.map((value,j)=>Math.abs(value-reference[j])),
   passed:measured.every((value,j)=>Number.isFinite(value)&&Math.abs(value-reference[j])<=tolerances[j])};
 }));
 evidence.checks.push(...materialCases.map((c,i)=>({name:c.name,expected:c.expected,actual:actual.materials[i],tolerances:[.0003,.0003,.0003],
  passed:actual.materials[i].every((value,j)=>Number.isFinite(value)&&Math.abs(value-c.expected[j])<=.0003)})));
 // 0.003 degrees for vertex direction; 0.2% + 0.0002 for curved-path
 // transmission. Lookup interpolation is compared below; triangle interpolation
 // and observer-ray refraction remain outside this point-sample qualification.
 evidence.checks.push(...refractionCases.flatMap((c,i)=>{
  const reference=refractiveExpected[i], measured=actual.refraction[i];
  const directionError=Math.hypot(...measured.direction.map((v,j)=>v-reference.direction[j]));
  const worldExpected=[-measured.direction[1],measured.direction[0],measured.direction[2]];
  const tolerances=reference.transmission.map(v=>.0002+.002*Math.abs(v));
  return [
   {name:`${c.name} apparent direction`,expected:reference.direction,actual:measured.direction,chord_error:directionError,tolerance_degrees:.003,
    passed:!reference.visible||directionError<=.003*Math.PI/180},
   {name:`${c.name} rotated physical direction`,expected:worldExpected,actual:measured.world,
    passed:measured.world.every((v,j)=>Number.isFinite(v)&&Math.abs(v-worldExpected[j])<1e-6)},
   {name:`${c.name} curved transmission`,expected:reference.transmission,actual:measured.transmission,tolerances,
    passed:measured.transmission.every((v,j)=>Number.isFinite(v)&&Math.abs(v-reference.transmission[j])<=tolerances[j])},
  ];
 }));
 evidence.checks.push(...refractionCases.filter(c=>!c.vacuum&&c.zenithDegrees!==0).map(c=>{
   const measured=actual.refraction[refractionCases.indexOf(c)];
   const reference=sampleIncidentField(new Float32Array(fields[c.profile.body].values),c.profile.body,c.point,c.sun,c.profile.radiusKm,c.q);
   return {name:`${c.name} CPU GPU field interpolation`,expected:reference,actual:measured,
     passed:reference.direction.every((v,j)=>Math.abs(v-measured.direction[j])<3e-6)&&reference.transmission.every((v,j)=>Math.abs(v-measured.transmission[j])<5e-5)};
 }));
 const failed=evidence.checks.filter(check=>!check.passed);
 assert.equal(failed.length,0,failed.map(check=>check.name).join('; '));
 evidence.status='passed';
} catch(error){evidence.error=error.message;process.exitCode=1;}
finally {
 if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});
 evidence.completed_at=new Date().toISOString();
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(`Atmosphere GPU gate ${evidence.status}: ${evidence.checks.filter(check=>check.passed).length}/${evidence.checks.length} checks. ${path.join(out,'evidence.json')}`);
 if(evidence.error)console.error(evidence.error);
}
