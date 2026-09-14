#!/usr/bin/env node
// Bounded actual-GPU field qualification. The separate interpolation limit is
// frozen before measuring results; the existing solver tolerances are unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {closeOwnedBrowser} from './worker_coverage.mjs';
import {browserBackendFromArgs,browserBackendArgs,assertBrowserBackend} from './browser_backend.mjs';
import {scatteringQualificationCases,assessScatteringQuery,SCATTERING_QUALIFICATION_LIMITS} from './scattering_validation_cases.mjs';
import {scatteringSupplementalCases,assessExplicitHeightRejection} from './scattering_validation_supplement.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=(key,fallback)=>process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
const webRoot=path.resolve(argument('web-root',path.join(ROOT,'apps/web')));
const out=path.resolve(argument('out',path.join(ROOT,'coverage',`scattering-${Date.now()}`)));
const chrome=argument('browser',process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'));
const caseFilter=argument('cases',''),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const backend=browserBackendFromArgs(process.argv.slice(2));
const qualifyTerrain=process.argv.includes('--terrain-v2-explicit-height');
assert.ok(!fs.existsSync(out),'Evidence directory already exists; select a new output path');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);
const snapshot=path.join(out,'snapshot');fs.mkdirSync(snapshot);
const releaseFile=path.join(webRoot,'web-release-manifest.json');
const release=fs.existsSync(releaseFile)?JSON.parse(fs.readFileSync(releaseFile,'utf8')):null;
if(release)assert.equal(release.schema_version,'web-release-manifest.v1');
const pageRoot=release?path.resolve(webRoot,release.namespace):webRoot;
assert.ok(pageRoot===webRoot||pageRoot.startsWith(webRoot+path.sep));
const hashes={},allowlisted=new Set(['/index.html']);
function copy(relative){
  relative=relative.split(path.sep).join('/');
  if(hashes[relative])return;
  const source=path.resolve(pageRoot,relative),target=path.resolve(snapshot,relative);
  assert.ok(source.startsWith(pageRoot+path.sep)&&target.startsWith(snapshot+path.sep),'Snapshot path escapes namespace');
  const bytes=fs.readFileSync(source);hashes[relative]=hash(bytes);
  if(release){
    const record=release.assets.find(a=>a.path===path.relative(webRoot,source).split(path.sep).join('/'));
    assert.equal(record?.sha256,hashes[relative],`Release identity mismatch: ${relative}`);
  }
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});allowlisted.add('/'+relative);
  if(relative.endsWith('.js'))for(const match of bytes.toString('utf8').matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)){
    assert.ok(match[1].startsWith('.'),'Snapshot module must use local relative imports');
    copy(path.posix.normalize(path.posix.join(path.posix.dirname(relative),match[1])));
  }
}
for(const entry of ['js/atmosphereScattering.js','js/atmosphereColumnManifest.js','js/bodyData.js'])copy(entry);
fs.writeFileSync(path.join(snapshot,'package.json'),'{"type":"module"}\n',{flag:'wx'});
fs.writeFileSync(path.join(snapshot,'index.html'),'<!doctype html><meta charset="utf-8"><title>SOL scattering qualification</title><canvas width="16" height="16"></canvas>',{flag:'wx'});
const fixtureBytes=fs.readFileSync(path.join(ROOT,'tools/scattering_target_fixture.mjs'));
fs.mkdirSync(path.join(snapshot,'tools'));fs.writeFileSync(path.join(snapshot,'tools/scattering_target_fixture.mjs'),fixtureBytes,{flag:'wx'});
allowlisted.add('/tools/scattering_target_fixture.mjs');
const {getAtmosphereProfile}=await import(pathToFileURL(path.join(snapshot,'js/atmosphereOptics.js')).href);
const {BODY}=await import(pathToFileURL(path.join(snapshot,'js/bodyData.js')).href);
const {ATMOSPHERE_COLUMN_FIELDS}=await import(pathToFileURL(path.join(snapshot,'js/atmosphereColumnManifest.js')).href);
const columns={};
for(const [body,record]of Object.entries(ATMOSPHERE_COLUMN_FIELDS)){
  const relative=path.posix.normalize('js/'+record.path);copy(relative);
  const bytes=fs.readFileSync(path.join(snapshot,relative));assert.equal(bytes.length,record.bytes);assert.equal(hash(bytes),record.sha256);
  columns[body]={url:'/'+relative,width:record.dimensions[0],height:record.dimensions[1],sha256:record.sha256};
}
const originalDatasets=scatteringQualificationCases(getAtmosphereProfile,BODY);
const originalDatasetHash=hash(Buffer.from(JSON.stringify(originalDatasets)));
let supplemental=[],terrainSource=null;
if(qualifyTerrain){
  for(const relative of ['terrain-assets.v1.json','js/terrainAssets.js','js/terrainGeometry.js'])copy(relative);
  const {terrainReference,decodeTerrain}=await import(pathToFileURL(path.join(snapshot,'js/terrainAssets.js')).href);
  const {buildTerrainMesh}=await import(pathToFileURL(path.join(snapshot,'js/terrainGeometry.js')).href);
  const reference=terrainReference('Mars');
  const manifest=JSON.parse(fs.readFileSync(path.join(snapshot,'terrain-assets.v1.json'),'utf8'));
  assert.equal(manifest.schema_version,'terrain-assets.v1');
  assert.deepEqual(manifest.references.find(item=>item.id===reference.id),reference);
  copy(reference.path);const bytes=fs.readFileSync(path.join(snapshot,reference.path));
  assert.equal(bytes.length,reference.bytes);assert.equal(hash(bytes),reference.sha256);
  const grid=decodeTerrain(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),reference);
  const mesh=buildTerrainMesh(grid,{latSegments:256,lonSegments:512,equatorialRadiusKm:BODY.Mars.radiusKm,polarRadiusKm:BODY.Mars.polarKm});
  supplemental=scatteringSupplementalCases(originalDatasets,{terrainReference:reference,terrainMesh:mesh,bodyCatalogue:BODY});
  terrainSource={id:reference.id,sha256:reference.sha256,bytes:reference.bytes,bounds:[reference.minRadiusKm,reference.maxRadiusKm]};
  assert.equal(hash(Buffer.from(JSON.stringify(originalDatasets))),originalDatasetHash,'Original fixture inputs changed');
}
const datasets=[...originalDatasets,...supplemental].filter(item=>!caseFilter||new RegExp(caseFilter).test(item.name));
assert.ok(datasets.length,'Case filter selected no fixtures');
const evidence={schema_version:'scattering-qualification.v1',started_at:new Date().toISOString(),web_root:webRoot,
  snapshot,release_id:release?.release_id??null,hashes,tool_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  fixtures_sha256:hash(fs.readFileSync(path.join(ROOT,'tools/scattering_validation_cases.mjs'))),
  fixture_adapter_sha256:hash(fixtureBytes),
  requested_backend:backend,backend_helpers:Object.fromEntries(['browser_backend.mjs','texture_device_telemetry.mjs'].map(name=>[name,hash(fs.readFileSync(path.join(ROOT,'tools',name)))])),
  terrain_v2_explicit_height:qualifyTerrain,terrain_source:terrainSource,original_dataset_sha256:originalDatasetHash,
  original_queries:originalDatasets.reduce((n,item)=>n+item.queries.length,0),supplemental_queries:supplemental.reduce((n,item)=>n+item.queries.length,0),
  negative_controls:supplemental.flatMap(item=>item.queries).filter(query=>query.expectedHeightRejection).length,
  supplement_sha256:hash(fs.readFileSync(path.join(ROOT,'tools/scattering_validation_supplement.mjs'))),
  reference:'Actual retained direct GPU integrator (12-node Gauss-Legendre quadrature per split segment) and column evaluator, separately qualified by the original float64 solver gate. This measures added interpolation error, not physical calibration.',
  limits:SCATTERING_QUALIFICATION_LIMITS,case_filter:caseFilter,complete_matrix:!caseFilter,cases:[],errors:[]};
fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify({evidence,datasets},null,2),{flag:'wx'});

const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://127.0.0.1').pathname;
  if(!allowlisted.has(pathname)){response.writeHead(404).end();return;}
  response.setHeader('Content-Type',(pathname.endsWith('.js')||pathname.endsWith('.mjs'))?'text/javascript':pathname.endsWith('.html')?'text/html':'application/octet-stream');
  response.setHeader('Cache-Control','no-store');response.end(fs.readFileSync(path.join(snapshot,pathname.slice(1))));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await puppeteer.launch({executablePath:chrome,headless:true,
    args:['--no-sandbox','--disable-background-networking',...browserBackendArgs(backend)],timeout:20000,protocolTimeout:120000});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',request=>request.url().startsWith(base+'/')?request.continue():request.abort());
  page.on('pageerror',error=>evidence.errors.push(String(error)));
  await page.goto(base+'/index.html');
  evidence.gpu=await page.evaluate(async({columns,qualifyTerrain})=>{
    const scattering=await import('./js/atmosphereScattering.js'),optics=await import('./js/atmosphereOptics.js');
    const legacy=await import('./js/atmosphereColumnField.js');
    const {createValidationTargetFactory}=await import('./tools/scattering_target_fixture.mjs');
    const createTarget=createValidationTargetFactory(scattering,optics);
    const gl=document.querySelector('canvas').getContext('webgl2',{antialias:false});
    if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Float WebGL2 unavailable');
    function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    function program(source){
      const p=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,scattering.SCATTERING_GENERATOR_VS),fs=compile(gl.FRAGMENT_SHADER,source);
      gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
      const uniforms={};for(const name of [...optics.ATMOSPHERE_UNIFORMS,...scattering.SCATTERING_UNIFORMS,'u_atmosphereColumnField','u_queries'])uniforms[name]=gl.getUniformLocation(p,name);
      return {p,uniforms};
    }
    const prefix='#version 300 es\nprecision highp float;\nprecision highp int;\n';
    const declarations='uniform highp sampler2D u_queries;\nlayout(location=0)out vec4 outS;\nlayout(location=1)out vec4 outT;\nlayout(location=2)out vec4 outColor;\nlayout(location=3)out vec4 outDomain;\n';
    const begin='void main(){int x=int(gl_FragCoord.x);vec4 a=texelFetch(u_queries,ivec2(x,0),0);vec4 b=texelFetch(u_queries,ivec2(x,1),0);bool limb=a.a>0.5;vec3 delta=limb?b.xyz:a.xyz-u_atmosphereCameraKm;float maximum=limb?b.a:length(delta);vec3 ray=normalize(delta),traceOrigin=u_atmosphereCameraKm,traceRay=ray;float traceDistance=maximum;if(!limb)atmosphereSurfaceSegment(u_atmosphereCameraKm,a.xyz,traceOrigin,traceRay,traceDistance);outDomain=vec4(atmosphereObserverInterval(traceOrigin,traceRay,u_atmosphereRadiusKm),atmosphereObserverInterval(traceOrigin,traceRay,u_atmosphereRadiusKm+u_atmosphereTopKm));';
    const reference=program(prefix+legacy.ATMOSPHERE_RENDER_GLSL+declarations+begin+'AtmosphereResult r=integrateAtmosphere(traceOrigin,traceRay,traceDistance);outS=vec4(r.scattering,1);outT=vec4(r.transmittance,1);outColor=vec4(vec3(.18)*r.transmittance+r.scattering,1);}');
    const actual=program(prefix+scattering.ATMOSPHERE_SCATTERING_GLSL+declarations+begin+'vec4 s=limb?atmosphereLimbScattering(ray):atmosphereSurfaceScattering(a.xyz);vec3 t=atmosphereViewTransmission(traceOrigin,traceRay,traceDistance);outS=s;outT=vec4(t,1);outColor=vec4(limb?vec3(.18)*t+s.rgb:atmosphereSurfaceColor(vec3(.18),a.xyz),1);}');
    const actualExplicit=qualifyTerrain?program(prefix+scattering.ATMOSPHERE_SCATTERING_GLSL+declarations+begin+'vec4 h=texelFetch(u_queries,ivec2(x,2),0);vec4 s=limb?atmosphereLimbScattering(ray):atmosphereSurfaceScattering(a.xyz,h.x);vec3 t=atmosphereViewTransmission(traceOrigin,traceRay,traceDistance);outS=s;outT=vec4(t,1);outColor=vec4(limb?vec3(.18)*t+s.rgb:atmosphereSurfaceColor(vec3(.18),a.xyz,h.x),1);}'):null;
    function shellProgram(source){
      const declaration='in vec3 v_atmosphereBodyKm;',ray='normalize(v_atmosphereBodyKm-u_atmosphereCameraKm)';
      if(source.split(declaration).length!==2||source.split(ray).length!==2)throw Error('Actual shell ray-input binding changed');
      // The complete fragment body, including discard and output encoding, is
      // unchanged. Only the input ray comes from the same immutable query row.
      return program(source.replace(declaration,'uniform highp sampler2D u_queries;')
        .replace(ray,'normalize(texelFetch(u_queries,ivec2(int(gl_FragCoord.x),1),0).xyz)'));
    }
    const referenceShell=shellProgram(legacy.ATMOSPHERE_RENDER_FS),actualShell=shellProgram(scattering.ATMOSPHERE_SCATTERING_FS);
    function texture(width,height,internal=gl.RGBA32F,format=gl.RGBA,data=null){
      const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,internal,width,height,0,format,gl.FLOAT,data);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      return t;
    }
    const columnTextures={};for(const [body,record]of Object.entries(columns)){
      const data=await(await fetch(record.url)).arrayBuffer();columnTextures[body]=texture(record.width,record.height,gl.RG32F,gl.RG,new Float32Array(data));
    }
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    globalThis.scatteringValidation={gl,scattering,optics,createTarget,reference,actual,actualExplicit,referenceShell,actualShell,texture,columnTextures};
    return {vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmasked_renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,max_texture_size:gl.getParameter(gl.MAX_TEXTURE_SIZE),version:gl.getParameter(gl.VERSION)};
  },{columns,qualifyTerrain});
  evidence.observed_backend=assertBrowserBackend(backend,{renderer:evidence.gpu.unmasked_renderer??evidence.gpu.renderer});
  for(const dataset of datasets){
    console.log(`Scattering qualification: ${dataset.name}, ${dataset.queries.length} physical queries`);
    const result=await page.evaluate(item=>{
      const {gl,scattering,optics,createTarget,reference,actual,actualExplicit,referenceShell,actualShell,texture,columnTextures}=globalThis.scatteringValidation;
      const plan=scattering.planAtmosphereScattering(item.profile,{...item.options,...item.bounds});
      if(plan.status!=='ready')return {plan,error:plan.reason};
      const target=createTarget(gl,plan);
      if(target.status!=='ready')return {plan,error:target.reason};
      const owned=[],framebuffer=gl.createFramebuffer();
      try{
        if(!target.generate({plan,profile:item.profile,opticalOptions:item.options,columnTexture:columnTextures[item.body],restoreViewport:[16,16]}))throw Error(target.reason);
        gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
        const atlas=[],atlasPixels={};
        for(const [name,t,width,height]of [['surface',target.surfaceTexture,plan.surfaceSize[0],plan.surfaceSize[1]*plan.surfaceSize[2]],['limb',target.limbTexture,...plan.limbSize]]){
          gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);gl.readBuffer(gl.COLOR_ATTACHMENT0);
          if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Atlas read framebuffer incomplete');
          const pixels=new Float32Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,pixels);
          atlasPixels[name]=pixels;
          let invalidAlpha=0,nonFinite=0,negative=0,minAlpha=1,maxAlpha=0,maxValue=0;
          const invalidExamples=[];
          for(let i=0;i<pixels.length;i+=4){
            if(pixels[i+3]!==1){invalidAlpha++;if(invalidExamples.length<10)invalidExamples.push({x:(i/4)%width,y:Math.floor(i/4/width),rgba:Array.from(pixels.slice(i,i+4))});}
            minAlpha=Math.min(minAlpha,pixels[i+3]);maxAlpha=Math.max(maxAlpha,pixels[i+3]);
            for(let c=0;c<3;c++){if(!Number.isFinite(pixels[i+c]))nonFinite++;if(pixels[i+c]<0)negative++;maxValue=Math.max(maxValue,pixels[i+c]);}
          }
          atlas.push({name,width,height,texels:width*height,invalidAlpha,nonFinite,negative,minAlpha,maxAlpha,maxValue,invalidExamples});
        }
        const n=item.queries.length,rows=item.supplement?.explicitHeight?3:2,queries=new Float32Array(n*rows*4);
        item.queries.forEach((query,i)=>{queries.set([...query.surface,query.kind==='limb'?1:0],i*4);queries.set([...query.direction,query.maximum],(n+i)*4);});
        if(rows===3)item.queries.forEach((query,i)=>queries.set([query.explicitHeightKm??0,0,0,0],(2*n+i)*4));
        const queryTexture=texture(n,rows,gl.RGBA32F,gl.RGBA,queries);owned.push(queryTexture);
        const outputs=[0,1,2,3].map(index=>{
          const t=texture(n,1);owned.push(t);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+index,gl.TEXTURE_2D,t,0);return gl.COLOR_ATTACHMENT0+index;
        });
        gl.drawBuffers(outputs);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Probe framebuffer incomplete');
        gl.viewport(0,0,n,1);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
        const draw=(probe,bindField)=>{
          gl.useProgram(probe.p);optics.setAtmosphereUniforms(gl,probe.uniforms,item.profile,item.options);
          gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,columnTextures[item.body]);gl.uniform1i(probe.uniforms.u_atmosphereColumnField,7);
          if(bindField&&!target.bind(probe.uniforms))throw Error('Actual target bind rejected');
          gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,queryTexture);gl.uniform1i(probe.uniforms.u_queries,0);
          gl.drawArrays(gl.TRIANGLES,0,3);
          const channels=outputs.map(attachment=>{gl.readBuffer(attachment);const data=new Float32Array(n*4);gl.readPixels(0,0,n,1,gl.RGBA,gl.FLOAT,data);return data;});
          const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`GPU probe error ${error}`);
          return Array.from({length:n},(_,i)=>({scattering:Array.from(channels[0].slice(i*4,i*4+4)),transmission:Array.from(channels[1].slice(i*4,i*4+4)),color:Array.from(channels[2].slice(i*4,i*4+4)),domain:Array.from(channels[3].slice(i*4,i*4+4))}));
        };
        const referenceResults=draw(reference,false),measuredResults=draw(rows===3?actualExplicit:actual,true);
        const drawShell=(probe,bindField)=>{
          gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(probe.p);optics.setAtmosphereUniforms(gl,probe.uniforms,item.profile,item.options);
          gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,columnTextures[item.body]);gl.uniform1i(probe.uniforms.u_atmosphereColumnField,7);
          if(bindField&&!target.bind(probe.uniforms))throw Error('Actual shell target bind rejected');
          gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,queryTexture);gl.uniform1i(probe.uniforms.u_queries,0);
          gl.drawArrays(gl.TRIANGLES,0,3);gl.readBuffer(gl.COLOR_ATTACHMENT0);
          const data=new Float32Array(n*4);gl.readPixels(0,0,n,1,gl.RGBA,gl.FLOAT,data);
          const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Actual shell probe error ${error}`);
          return data;
        };
        const referenceShellPixels=drawShell(referenceShell,false),actualShellPixels=drawShell(actualShell,true);
        for(let i=0;i<n;i++){
          referenceResults[i].shell=Array.from(referenceShellPixels.slice(i*4,i*4+4));
          measuredResults[i].shell=Array.from(actualShellPixels.slice(i*4,i*4+4));
        }
        // Diagnostic corner readback uses the public float64 mapper only to
        // locate nearby cells. It is not an oracle for the actual consumer.
        const debugIndices=item.queries.map((query,index)=>({index,error:Math.max(...referenceResults[index].scattering.slice(0,3).map((value,c)=>Math.abs(value-measuredResults[index].scattering[c])))}))
          .sort((a,b)=>b.error-a.error).slice(0,20).map(value=>value.index);
        const corners={};
        for(const index of debugIndices){
          const query=item.queries[index],limb=query.kind==='limb';
          const p=limb?scattering.scatteringLimbCoordinates(plan,query.direction):scattering.scatteringSurfaceCoordinates(plan,query.surface);
          if(!p){corners[index]={cpu_coordinates:null};continue;}
          const size=limb?[...plan.limbSize,1]:plan.surfaceSize,values=[];
          for(let dz=0;dz<(size[2]>1?2:1);dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
            const x=((Math.floor(p[0])+dx)%size[0]+size[0])%size[0],y=Math.min(size[1]-1,Math.max(0,Math.floor(p[1])+dy));
            const z=Math.min(size[2]-1,Math.max(0,Math.floor(p[2]??0)+dz)),offset=(x+(y+z*size[1])*size[0])*4;
            values.push({x,y,z,rgba:Array.from(atlasPixels[limb?'limb':'surface'].slice(offset,offset+4))});
          }
          corners[index]={cpu_coordinates:p,values};
        }
        return {plan,atlas,reference:referenceResults,measured:measuredResults,corners,generation:target.generation};
      }finally{target.dispose();for(const t of owned)gl.deleteTexture(t);gl.deleteFramebuffer(framebuffer);gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
    },dataset);
    const samples=result.error?[]:dataset.queries.map((query,i)=>({...query,reference:result.reference[i],measured:result.measured[i],assessment:query.expectedHeightRejection?assessExplicitHeightRejection(query,result.measured[i]):assessScatteringQuery(query,result.measured[i],result.reference[i]),...(result.corners?.[i]?{corner_diagnostic:result.corners[i]}:{})}));
    const atlasPassed=!result.error&&result.atlas.every(a=>a.invalidAlpha===0&&a.nonFinite===0&&a.negative===0);
    const domainCounts={};for(const sample of samples)domainCounts[sample.assessment.domain]=(domainCounts[sample.assessment.domain]??0)+1;
    const nonzeroVisibleShells=samples.filter(s=>s.assessment.domain==='visible-limb'&&s.reference.shell.some(value=>Math.abs(value)>SCATTERING_QUALIFICATION_LIMITS.zeroLeak)).length;
    const domainCoveragePassed=nonzeroVisibleShells>0;
    const inside=samples.filter(s=>s.assessment.domain==='surface'||s.assessment.domain==='visible-limb');
    const summary={name:dataset.name,body:dataset.body,plan:result.plan,error:result.error??null,atlas:result.atlas??[],atlas_passed:atlasPassed,
      domain_counts:domainCounts,nonzero_visible_shells:nonzeroVisibleShells,domain_coverage_passed:domainCoveragePassed,
      total:samples.length,failed:samples.filter(s=>!s.assessment.passed).length,raw_failed:samples.filter(s=>!s.assessment.raw_assessment.passed).length,passed:!result.error&&atlasPassed&&domainCoveragePassed&&samples.every(s=>s.assessment.passed),
      max_inside_scattering_error:Math.max(0,...inside.map(s=>s.assessment.maxScatteringError??Infinity)),
      max_inside_display_error:Math.max(0,...inside.map(s=>s.assessment.maxDisplayError??Infinity)),
      max_scattering_error:Math.max(0,...samples.map(s=>s.assessment.maxScatteringError??Infinity)),max_display_error:Math.max(0,...samples.map(s=>s.assessment.maxDisplayError??Infinity))};
    fs.writeFileSync(path.join(out,dataset.name+'.json'),JSON.stringify({summary,inputs:dataset,samples},null,2),{flag:'wx'});
    evidence.cases.push(summary);console.log(`${summary.passed?'PASS':'FAIL'} ${dataset.name}: ${summary.failed}/${summary.total} rejected; atlas valid ${atlasPassed}; max inside delta S ${summary.max_inside_scattering_error}; max inside display ${summary.max_inside_display_error}`);
  }
}catch(error){evidence.errors.push(error.stack??String(error));console.error(error.stack??String(error));}
finally{
  if(browser)await closeOwnedBrowser(browser);
  await new Promise(resolve=>server.close(resolve));
  for(const [relative,expected]of Object.entries(hashes))assert.equal(hash(fs.readFileSync(path.join(snapshot,relative))),expected,`Snapshot changed: ${relative}`);
  evidence.completed_at=new Date().toISOString();evidence.passed=evidence.errors.length===0&&evidence.cases.length===datasets.length&&evidence.cases.every(c=>c.passed);
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
  console.log(`Scattering interpolation ${evidence.passed?'PASSED':'FAILED'}: ${path.join(out,'evidence.json')}`);
  if(!evidence.passed)process.exitCode=1;
}
