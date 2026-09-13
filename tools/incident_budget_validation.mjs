#!/usr/bin/env node
// Actual production vertex shader at both admitted Mars mesh extremes. Timings
// are evidence for this device, never a replacement for whole-app deadlines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const webRoot=path.resolve(option('web-root',path.join(root,'apps/web')));
const out=path.resolve(option('out',path.join(root,'coverage/incident-budget')));
const chrome=option('browser',process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestPath=path.join(webRoot,'web-release-manifest.json');
const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
const pageRoot=manifest?path.resolve(webRoot,manifest.namespace):webRoot;
assert.ok(pageRoot===webRoot||pageRoot.startsWith(webRoot+path.sep));
const hashes={};
function bytes(relative){
  const file=path.resolve(pageRoot,relative);assert.ok(file.startsWith(pageRoot+path.sep));
  const content=fs.readFileSync(file);hashes[relative]=hash(content);
  if(manifest){const asset=manifest.assets.find(a=>a.path===path.relative(webRoot,file).split(path.sep).join('/'));
    assert.ok(asset,`Absent staged asset: ${relative}`);assert.equal(content.length,asset.size);assert.equal(hashes[relative],asset.sha256);}
  return content;
}
async function module(relative){bytes(relative);return import(pathToFileURL(path.resolve(pageRoot,relative)).href);}
const {SPHERE_VS}=await module('js/orreryShaders.js');
await module('js/atmosphereShaders.js');await module('js/terrainShadowShaders.js');
const {INCIDENT_FIELDS}=await module('js/atmosphereIncidentManifest.js');
const {INCIDENT_FIELD_SIZE,incidentFieldDomain,incidentFieldGeometry}=await module('js/atmosphereIncident.js');
const {ATMOSPHERE_PROFILE_ENCODING,getAtmosphereProfile,serializeAtmosphereProfile,atmosphereUniformValues}=await module('js/atmosphereOptics.js');
const {terrainReference,decodeTerrain}=await module('js/terrainAssets.js');
const {buildTerrainMesh}=await module('js/terrainGeometry.js');
const {BODY}=await module('js/bodyData.js');
assert.doesNotMatch(SPHERE_VS,/atmosphereCurvedRay|atmosphereRayDerivative|atmosphereIncidentSolarRay/,'Production shader must contain no iterative shooting path');
assert.match(SPHERE_VS,/atmosphereIncidentLookup/);
const profile=getAtmosphereProfile('Mars'),reference=terrainReference('Mars'),field=INCIDENT_FIELDS.Mars;
assert.equal(field.profile_encoding,ATMOSPHERE_PROFILE_ENCODING,'Field uses the admitted profile encoding');
assert.equal(hash(Buffer.from(serializeAtmosphereProfile(profile))),field.profile_sha256,'Field belongs to this exact GPU profile');
const terrainBytes=bytes(reference.path);assert.equal(hash(terrainBytes),reference.sha256);
const grid=decodeTerrain(terrainBytes.buffer.slice(terrainBytes.byteOffset,terrainBytes.byteOffset+terrainBytes.byteLength),reference);
const fieldBytes=bytes(path.posix.normalize('js/'+field.path));assert.equal(fieldBytes.length,field.bytes);assert.equal(hash(fieldBytes),field.sha256);
const view=new DataView(fieldBytes.buffer,fieldBytes.byteOffset,fieldBytes.byteLength),fieldValues=[];
for(let i=0;i<fieldBytes.length;i+=4){const value=view.getFloat32(i,true);assert.ok(Number.isFinite(value));fieldValues.push(value);}
const radii={equatorialRadiusKm:BODY.Mars.radiusKm,polarRadiusKm:BODY.Mars.polarKm};
const low=buildTerrainMesh(grid,{...radii,latSegments:48,lonSegments:96});
const high=buildTerrainMesh(grid,{...radii,latSegments:192,lonSegments:384});
assert.equal(low.vertexCount,4753);assert.equal(high.vertexCount,74305);
const q=radii.polarRadiusKm/radii.equatorialRadiusKm,domain=incidentFieldDomain('Mars');
const sun=[1,0,0];let minHeight=Infinity,maxHeight=-Infinity;
for(let i=0;i<high.pos.length;i+=6){const p=Array.from(high.pos.subarray(i,i+3)).map((v,j)=>v*profile.radiusKm*(j===2?q:1));
  const g=incidentFieldGeometry(p,sun,profile.radiusKm,q);
  minHeight=Math.min(minHeight,g.heightKm);maxHeight=Math.max(maxHeight,g.heightKm);
  assert.ok(g.heightKm>=domain.minHeightKm-.002&&g.heightKm<=domain.maxHeightKm+.002,'Actual terrain must fit field altitude domain');
  assert.ok(g.radiusKm/profile.radiusKm>=.98&&g.radiusKm/profile.radiusKm<=1.02,'Actual oblate terrain must fit field curvature domain');}
const evidence={schema_version:'incident-budget-validation.v1',web_root:webRoot,release_namespace:manifest?.namespace??null,
  release_manifest_sha256:manifest?hash(fs.readFileSync(manifestPath)):null,source_sha256:hashes,
  scope:'Actual production vertex shader and admitted MOLA meshes; software WebGL2. Vertex timings do not qualify native GPU frame rate or the complete scene.',
  min_height_km:minHeight,max_height_km:maxHeight,field_bytes:field.bytes,field_dimensions:INCIDENT_FIELD_SIZE,
  ray_shooting_passes_per_frame:0,texture_fetches_per_eligible_vertex:8,status:'failed'};
fs.mkdirSync(out,{recursive:true});let browser;
try{
  browser=await puppeteer.launch({executablePath:chrome,headless:true,timeout:20000,protocolTimeout:30000,
    args:['--no-sandbox','--disable-background-networking','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  evidence.browser_version=await browser.version();const page=await browser.newPage();
  await page.setRequestInterception(true);page.on('request',r=>r.abort());await page.setContent('<canvas width="1" height="1"></canvas>');
  evidence.result=await page.evaluate(({source,fieldValues,size,domain,uniforms,radius,q,meshes})=>{
    const gl=document.querySelector('canvas').getContext('webgl2',{antialias:false});if(!gl)throw Error('WebGL2 unavailable');
    const shader=(kind,src)=>{const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,source));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;out vec4 o;void main(){o=vec4(0);}'));
    gl.transformFeedbackVaryings(program,['v_incidentSunBody','v_incidentSunWorld','v_incidentTransmission'],gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const loc=name=>gl.getUniformLocation(program,name);
    for(const [name,value]of Object.entries(uniforms)){if(Array.isArray(value)){if(value.length===2)gl.uniform2fv(loc(name),value);else gl.uniform3fv(loc(name),value);}
      else if(name==='u_atmosphereEnabled'||name==='u_atmosphereRefractionEnabled')gl.uniform1i(loc(name),value);else gl.uniform1f(loc(name),value);}
    gl.uniform1f(loc('u_bodyRadiusKm'),radius);gl.uniform1f(loc('u_oblate'),q);
    gl.uniformMatrix4fv(loc('u_mvp'),false,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    gl.uniformMatrix4fv(loc('u_model'),false,[1,0,0,0,0,1,0,0,0,0,q,0,0,0,0,1]);
    gl.uniformMatrix3fv(loc('u_nmat'),false,[1,0,0,0,1,0,0,0,1]);
    gl.activeTexture(gl.TEXTURE6);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,size[0],size[1]*size[2],0,gl.RGBA,gl.FLOAT,new Float32Array(fieldValues));
    for(const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.NEAREST);
    gl.uniform1i(loc('u_incidentField'),6);gl.uniform1i(loc('u_incidentFieldReady'),1);
    gl.uniform3fv(loc('u_incidentFieldHeight'),[domain.minHeightKm,domain.maxHeightKm,domain.quadratic?1:0]);
    if(gl.getUniform(program,loc('u_incidentFieldReady'))!==1)throw Error('Field lookup is not enabled');
    const arrays=[],results=[];
    for(const input of meshes){
      const geometry=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,geometry);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(input.pos),gl.STATIC_DRAW);
      for(let a=0;a<2;a++){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,a*12);}
      const feedback=gl.createBuffer();gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,feedback);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,input.count*9*4,gl.DYNAMIC_READ);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,feedback);const raw=new Float32Array(input.count*9);
      const draw=()=>{gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,input.count);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,raw);};
      draw();const durations=[];for(let repeat=0;repeat<3;repeat++){const start=performance.now();draw();durations.push(performance.now()-start);}
      if(gl.getError()!==gl.NO_ERROR)throw Error('Production vertex readback GL error');
      let lit=0,blocked=0,maxNormError=0;
      for(let i=0;i<raw.length;i+=9){for(let c=0;c<9;c++)if(!Number.isFinite(raw[i+c]))throw Error('Nonfinite production field output');
        for(let c=6;c<9;c++)if(raw[i+c]<0||raw[i+c]>1.000001)throw Error('Invalid incident transmission');
        for(const offset of [0,3])maxNormError=Math.max(maxNormError,Math.abs(Math.hypot(raw[i+offset],raw[i+offset+1],raw[i+offset+2])-1));
        if(raw[i+6]>0)lit++;else blocked++;}
      if(!lit||!blocked||maxNormError>1e-5)throw Error('Incident field day/night or unit-vector contract failed');
      results.push({vertices:input.count,samples:raw.length,lit_vertices:lit,blocked_vertices:blocked,max_direction_norm_error:maxNormError,warm_draw_and_readback_ms:durations});arrays.push(raw);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.deleteBuffer(feedback);gl.deleteBuffer(geometry);
    }
    let sharedMaxError=0;
    for(let i=0;i<=48;i++)for(let j=0;j<=96;j++)for(let c=0;c<9;c++)sharedMaxError=Math.max(sharedMaxError,Math.abs(arrays[0][(i*97+j)*9+c]-arrays[1][(i*4*385+j*4)*9+c]));
    if(sharedMaxError>1e-5)throw Error(`Shared terrain points changed illumination with mesh LOD: ${sharedMaxError}`);
    return {meshes:results,shared_points:4753,max_shared_point_error:sharedMaxError,field_ready:true};
  },{source:SPHERE_VS,fieldValues,size:INCIDENT_FIELD_SIZE,domain,radius:profile.radiusKm,q,
    uniforms:atmosphereUniformValues(profile,{cameraBodyKm:[5000,0,0],sunDirectionBody:sun,polarRatio:q,solarDistanceAu:1.52,exposure:1}),
    meshes:[{pos:Array.from(low.pos),count:low.vertexCount},{pos:Array.from(high.pos),count:high.vertexCount}]});
  evidence.status='passed';console.log(JSON.stringify(evidence.result));
}catch(error){evidence.error=String(error?.stack||error);throw error;}
finally{fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});}
