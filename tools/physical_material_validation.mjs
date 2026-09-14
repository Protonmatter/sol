#!/usr/bin/env node
// Actual fragment parity for the bounded material specialization. Synthetic
// registered pixels and residual fields isolate material control flow; this is
// not a numerical atlas, terrain source, whole-app, or radiometric qualification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {closeOwnedBrowser} from './worker_coverage.mjs';
import {browserBackendFromArgs,browserBackendArgs,assertBrowserBackend,captureBrowserCapabilities} from './browser_backend.mjs';
import {evaluatePhysicalMaterialPixel,physicalMaterialMapping,evaluatePhysicalPresentation} from './physical_material_checks.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const webRoot=path.resolve(arg('web-root',path.join(root,'apps/web'))),backend=browserBackendFromArgs(process.argv.slice(2));
const referenceMode=arg('reference-mode','uniform');
assert.ok(['uniform','fixed-domain'].includes(referenceMode),'Reference mode must be uniform or fixed-domain');
const out=path.resolve(arg('out',path.join(root,'coverage/physical-material-'+backend)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=path.join(webRoot,'web-release-manifest.json');
const release=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest,'utf8')):null;
const pageRoot=release?path.resolve(webRoot,release.namespace):webRoot;
assert.ok(pageRoot===webRoot||pageRoot.startsWith(webRoot+path.sep));
assert.ok(!fs.existsSync(path.join(out,'evidence.json')),'Refuse receipt overwrite');fs.mkdirSync(out,{recursive:true});
const evidence={schema:'physical-material-parity.v1',started_at:new Date().toISOString(),backend,reference_mode:referenceMode,web_root:webRoot,
  scope:'Exact bounded fragment versus full bounded reference with identical synthetic material/field inputs. Fixed-domain reference, when explicitly selected, substitutes only mode/style declarations with const0/-1. No source-data, numerical scattering, full-mesh, runtime timing or radiometric admission.',
  tool_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),source_sha256:{},checks:[],compile_limit_ms:30000};
const helperPath=fileURLToPath(new URL('./physical_material_checks.mjs',import.meta.url));
evidence.helper_sha256=hash(fs.readFileSync(helperPath));
const save=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
let server,browser,timer;const controller=new AbortController();
try{
  server=http.createServer((req,res)=>{
    const route=new URL(req.url,'http://127.0.0.1').pathname;
    if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<canvas id="orreryCanvas" width="1" height="1"></canvas>');return;}
    const numeric=/^\/data\/optics\/(earth|mars)-columns-v1\.f32$/.test(route);
    if(!numeric&&!/^\/js\/[a-zA-Z0-9]+\.js$/.test(route)){res.writeHead(404);res.end();return;}
    try{
      const file=path.join(pageRoot,route.slice(1)),bytes=fs.readFileSync(file),digest=hash(bytes);
      if(release){const relative=path.relative(webRoot,file).split(path.sep).join('/');
        assert.equal(release.assets.find(x=>x.path===relative)?.sha256,digest,'Staged source hash mismatch');}
      if(evidence.source_sha256[route])assert.equal(evidence.source_sha256[route],digest,'Source changed during run');
      evidence.source_sha256[route]=digest;
      res.setHeader('Content-Type',numeric?'application/octet-stream':'text/javascript');res.end(bytes);
    }catch(error){evidence.source_error=error.message;res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const run=async()=>{
    browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless:true,timeout:20000,protocolTimeout:90000,signal:controller.signal,args:['--no-sandbox','--disable-dev-shm-usage',
        ...browserBackendArgs(backend),'--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
    evidence.browser_version=await browser.version();const page=await browser.newPage();
    await page.exposeFunction('recordMaterialProgress',entry=>{(evidence.progress??=[]).push(entry);save();});
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>document.getElementById('orreryCanvas').getContext('webgl2',{antialias:false,preserveDrawingBuffer:true}));
    evidence.capabilities=await page.evaluate(captureBrowserCapabilities);assertBrowserBackend(backend,evidence.capabilities);save();
    const result=await page.evaluate(async({referenceMode,pixelPredicate,mappingPredicate,presentationPredicate})=>{
      const comparePixel=Function(`return (${pixelPredicate})`)(),fixtureMapping=Function(`return (${mappingPredicate})`)();
      const comparePresentation=Function(`return (${presentationPredicate})`)();
      const shaders=await import('/js/orreryShaders.js');
      const {appearanceReference,appearanceUniforms}=await import('/js/planetAppearance.js');
      const {ATMOSPHERE_RENDER_GLSL,loadAtmosphereColumns}=await import('/js/atmosphereColumnField.js');
      const {ATMOSPHERE_SCATTERING_GLSL,planAtmosphereScattering,setScatteringUniforms}=await import('/js/atmosphereScattering.js');
      const {getAtmosphereProfile,atmosphereUniformValues}=await import('/js/atmosphereOptics.js');
      const {createShaderPrograms}=await import('/js/shaderPrograms.js');
      const {createHdrPresentation}=await import('/js/hdrPresentation.js');
      const gl=document.getElementById('orreryCanvas').getContext('webgl2');
      if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float render targets unavailable');
      gl.disable(gl.DITHER);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
      const checks=[],compilation=[],allocations=[];
      const check=(name,passed,detail={})=>checks.push({name,passed,...detail});
      const sha=async source=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))))
        .map(x=>x.toString(16).padStart(2,'0')).join('');
      if(shaders.SPHERE_FS.split(ATMOSPHERE_RENDER_GLSL).length!==2)throw new Error('Reference optical boundary changed');
      const fullReference=shaders.SPHERE_FS.replace(ATMOSPHERE_RENDER_GLSL,ATMOSPHERE_SCATTERING_GLSL)
        .replace('uniform float u_bodyRadiusKm;','uniform float u_bodyRadiusKm;\nuniform float u_scatteringReferenceHeightKm;')
        .replace('atmosphereSurfaceColor(col,surfaceBodyKm)',
          'atmosphereSurfaceColor(col,surfaceBodyKm,(v_surfaceScale-1.0)*u_bodyRadiusKm+u_scatteringReferenceHeightKm)');
      const declarations='uniform int u_style; uniform int u_mode;';
      if(fullReference.split(declarations).length!==2)throw new Error('Reference mode/style declaration boundary changed');
      const reference=referenceMode==='uniform'?fullReference:
        fullReference.replace(declarations,'const int u_style=-1; const int u_mode=0;');
      const vertex=`#version 300 es
        precision highp float;
        uniform vec3 u_probeObject,u_probeNormal,u_probeSun;
        uniform float u_probeScale;
        out vec3 v_obj,v_world,v_nrm,v_incidentSunBody,v_incidentSunWorld,v_incidentTransmission;
        out float v_surfaceScale;
        void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);
          v_obj=u_probeObject;v_world=u_probeObject;v_nrm=u_probeNormal;v_surfaceScale=u_probeScale;
          v_incidentSunBody=u_probeSun;v_incidentSunWorld=u_probeSun;v_incidentTransmission=vec3(.61,.72,.83);}`;
      const owner=createShaderPrograms(gl,{generation:1,capacity:2,timeoutMs:30000,
        onChange:(key,status)=>compilation.push({key,status,at_ms:performance.now()})});
      const programs={};
      try{
        await globalThis.recordMaterialProgress({source:{vertex:await sha(vertex),full_reference:await sha(fullReference),reference:await sha(reference),consumer:await sha(shaders.SCATTERING_SPHERE_FS)}});
        // Each exact fragment receives its own unchanged compiler deadline.
        for(const [key,fragment] of [['reference',reference],['consumer',shaders.SCATTERING_SPHERE_FS]]){
          const start=performance.now();await owner.request(key,vertex,fragment).done;
          programs[key]=owner.get(key);compilation.push({key,elapsed_ms:performance.now()-start,diagnostic:owner.diagnostic(key)});
          await globalThis.recordMaterialProgress(compilation.at(-1));
          if(!programs[key])throw new Error(`${key}: ${owner.diagnostic(key)?.error||'program unavailable'}`);
        }
        const target=gl.createTexture();allocations.push(target);gl.bindTexture(gl.TEXTURE_2D,target);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,null);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('RGBA32F target incomplete');
        const locations=new Map();
        for(const p of Object.values(programs)){
          const map={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){
            const u=gl.getActiveUniform(p,i);map[u.name.replace(/\[0\]$/,'')]={location:gl.getUniformLocation(p,u.name),type:u.type};}
          locations.set(p,map);
          for(const name of ['u_mode','u_style','u_atmosphereEnabled','u_scatteringReady','u_linearOutput'])
            if(!map[name]&&!(p===programs.reference&&referenceMode==='fixed-domain'&&['u_mode','u_style'].includes(name)))
              throw new Error(`Required observable uniform absent: ${name}`);
        }
        const uniform=(p,name,value)=>{
          const u=locations.get(p)[name];if(!u)return;
          const {location:l,type:t}=u;
          if(t===gl.INT||t===gl.SAMPLER_2D||t===gl.BOOL)gl.uniform1i(l,value);
          else if(t===gl.INT_VEC2)gl.uniform2iv(l,value);else if(t===gl.INT_VEC3)gl.uniform3iv(l,value);
          else if(t===gl.FLOAT_VEC2)gl.uniform2fv(l,value);else if(t===gl.FLOAT_VEC3)gl.uniform3fv(l,value);
          else if(t===gl.FLOAT_VEC4)gl.uniform4fv(l,value);else if(t===gl.FLOAT)gl.uniform1f(l,value);
          else throw new Error('Unexpected material uniform type: '+name);
        };
        const texture=(unit,width,height,internal,format,type,pixels)=>{
          const t=gl.createTexture();allocations.push(t);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);
          gl.texImage2D(gl.TEXTURE_2D,0,internal,width,height,0,format,type,pixels);
          for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
          for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
          return t;
        };
        const image=(unit,color,internal=gl.RGBA8)=>texture(unit,2,2,internal,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([
          ...color,...color.map((x,i)=>i===3?x:Math.floor(x*.6)),...color,...color]));
        const materialTextures=[image(0,[60,95,130,180]),image(1,[30,125,220,255]),image(2,[130,110,70,160]),image(3,[180,35,110,175]),image(4,[0,0,0,255])];
        const earthDay=image(0,[60,95,130,255],gl.SRGB8_ALPHA8);
        for(const filter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,filter,gl.LINEAR);
        const object=[.3,.4,Math.sqrt(.75)],normal=[.2,.45,Math.sqrt(1-.2**2-.45**2)];
        const cases=[],outputs=new Map(),columns={};
        for(const body of ['Earth','Mars']){
          const f=await loadAtmosphereColumns(body);columns[body]=texture(7,f.width,f.height,gl.RG32F,gl.RG,gl.FLOAT,f.values);
          const profile=getAtmosphereProfile(body),q=body==='Earth'?.9966471893:.99411;
          const mapping=fixtureMapping(body,appearanceUniforms(appearanceReference(body)));
          const camera=object.map((x,i)=>x*(profile.radiusKm+2000)*(i===2?q:1));
          const options={cameraBodyKm:camera,polarRatio:q,solarDistanceAu:body==='Earth'?1:1.52,exposure:1,
            sunDirectionBody:object,referenceRadiusKm:profile.radiusKm,minRadiusKm:profile.radiusKm-2,maxRadiusKm:profile.radiusKm+2};
          const plan=planAtmosphereScattering(profile,options);if(plan.status!=='ready')throw new Error(plan.reason);
          const atlas=new Float32Array(plan.surfaceSize[0]*plan.surfaceSize[1]*plan.surfaceSize[2]*4);
          for(let i=0;i<atlas.length;i+=4)atlas.set([.8,.9,1.1,1],i);
          const surface=texture(8,plan.surfaceSize[0],plan.surfaceSize[1]*plan.surfaceSize[2],gl.RGBA32F,gl.RGBA,gl.FLOAT,atlas);
          const limb=texture(9,plan.limbSize[0],plan.limbSize[1],gl.RGBA32F,gl.RGBA,gl.FLOAT,new Float32Array(plan.limbSize[0]*plan.limbSize[1]*4));
          const heights=new Float32Array(8*4).fill(1),terrain=texture(5,8,4,gl.R32F,gl.RED,gl.FLOAT,heights);
          for(const useTex of [0,1])for(const linear of [0,1])for(const refracted of [0,1])
          for(const night of [0,1])for(const weather of body==='Earth'?[0,1]:[0])for(const ice of body==='Earth'?[0,1]:[0])
          for(const height of body==='Mars'?[-2,0,2]:[0])for(const shadow of body==='Mars'?[0,1]:[0]){
            const sun=object.map(x=>x*(night?-1:1));
            const framePlan=planAtmosphereScattering(profile,{...options,sunDirectionBody:sun});
            if(framePlan.status!=='ready'||framePlan.surfaceSize.join()!==plan.surfaceSize.join())throw new Error('Frame plan changed fixture allocation');
            const name=[body,useTex,linear,refracted,night,weather,ice,height,shadow].join('/');
            cases.push({name,body,useTex,linear,refracted,night,weather,ice,height,shadow,profile,q,options,plan:framePlan,sun,surface,limb,terrain,mapping});
          }
        }
        const clear=[.125,.25,.5,.75];let frameSerial=0;const hdr=createHdrPresentation(gl,{generation:1});
        if(hdr.resize(1,1).state!=='ready')throw new Error('HDR fixture target unavailable');
        const execute=(p,c,{mode=0,style=-1,final=false,mutate=null}={})=>{
          let identity;if(final){identity={generation:1,epoch:1800000000,serial:++frameSerial};hdr.beginFrame(identity);}
          else gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
          gl.viewport(0,0,1,1);gl.clearBufferfv(gl.COLOR,0,new Float32Array(clear));gl.useProgram(p);
          const {profile,plan,q}=c;
          const values={...atmosphereUniformValues(profile,{...c.options,sunDirectionBody:c.sun}),
            u_mode:mode,u_style:style,u_linearOutput:c.linear,u_atmosphereRefractionEnabled:c.refracted,
            u_probeObject:object,u_probeNormal:normal,u_probeSun:c.sun,u_probeScale:1+c.height/profile.radiusKm,
            u_cam:c.options.cameraBodyKm,u_base:[.25,.36,.52],u_light:c.sun,u_lightObj:c.sun,u_oblate:q,u_bodyRadiusKm:profile.radiusKm,
            u_scatteringReferenceHeightKm:0,u_useTex:c.useTex,u_texMode:3,u_textureLinear:c.body==='Earth'?1:0,
            u_tex:0,u_nightTex:1,u_weatherTex:2,u_iceTex:3,u_ringTex:4,u_terrainHeight:5,u_atmosphereColumnField:7,
            u_map:c.mapping.map,u_mapLat:c.mapping.lat,u_mapWindow:c.mapping.window,u_mapNoData:c.mapping.nodata,
            u_earthNight:c.body==='Earth'?c.night:0,u_earthWeather:c.weather,u_earthIce:c.ice,
            u_terrainShadowEnabled:c.body==='Mars'?1:0,u_terrainShape:[profile.radiusKm,profile.radiusKm-2,profile.radiusKm+2,.5],u_terrainPoles:[1,1],
            u_moonShadowCount:c.shadow,u_moonShadowPos:[...object.map(x=>x*1.1),.03],
            u_moonShadowAxis:[...object.map(x=>-x),.01],u_ringRad:[0,0]};
          if(mutate)mutate(values);
          for(const [name,value]of Object.entries(values))uniform(p,name,value);
          const grid=Object.fromEntries(Object.entries(locations.get(p)).map(([n,u])=>[n,u.location]));setScatteringUniforms(gl,grid,plan);
          for(const [unit,t]of [...materialTextures.map((t,i)=>[i,t]),[0,c.body==='Earth'?earthDay:materialTextures[0]],[5,c.terrain],[7,columns[c.body]],[8,c.surface],[9,c.limb]]){
            gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);}
          gl.drawArrays(gl.TRIANGLES,0,3);
          if(final){if(!hdr.present({exposure:1,frameIdentity:identity}))throw new Error('HDR presentation rejected');
            const bytes=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return [...bytes];}
          const valuesOut=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,valuesOut);return [...valuesOut];
        };
        for(const c of cases){
          const referencePixel=execute(programs.reference,c),actual=execute(programs.consumer,c);
          const tolerance=1e-6,pixel=comparePixel(actual,referencePixel,tolerance);check(c.name,pixel.passed,
            {actual,reference:referencePixel,tolerance,...pixel,body:c.body,height_km:c.height,mapping:c.mapping});outputs.set(c.name,actual);
          if(c.linear){const a=execute(programs.consumer,c,{final:true}),b=execute(programs.reference,c,{final:true});
            const presented=comparePresentation(a,actual),referencePresented=comparePresentation(b,referencePixel);
            check(c.name+'/final',a.every((v,i)=>v===b[i])&&presented.passed&&referencePresented.passed,
              {actual:a,reference:b,tolerance:0,presented,referencePresented});}
        }
        const c=cases.find(x=>x.body==='Earth'&&x.useTex&&x.linear&&!x.night&&!x.weather&&!x.ice&&!x.refracted);
        for(const [mode,style]of [[1,-1],[2,-1],[-1,-1],[3,-1],...[-2,...Array.from({length:14},(_,i)=>i)].map(style=>[0,style])]){
          const actual=execute(programs.consumer,c,{mode,style});check(`reject mode ${mode} style ${style}`,
            actual.every((v,i)=>v===clear[i]),{actual,reference:clear,negative_control:true});}
        // Distinct inputs must affect actual output; a held draw or constant
        // image cannot satisfy these controls even if both programs agree.
        const changed=(name,a,b)=>check(name,Math.max(...a.map((v,i)=>Math.abs(v-b[i])))>1e-5,{actual:a,reference:b,negative_control:true});
        for(const feature of ['u_earthNight','u_earthWeather','u_earthIce','u_moonShadowCount']){
          const base={...c,night:feature==='u_earthNight'?1:0,sun:object.map(x=>x*(feature==='u_earthNight'?-1:1))};
          changed('active '+feature,execute(programs.consumer,base,{mutate:v=>{v[feature]=1;}}),execute(programs.consumer,base,{mutate:v=>{v[feature]=0;}}));
        }
        const good=execute(programs.consumer,c),originalDraw=gl.drawArrays;gl.drawArrays=()=>{};
        let held;try{held=execute(programs.consumer,c);}finally{gl.drawArrays=originalDraw;}
        changed('held draw is rejected',held,good);
        const invalid=execute(programs.consumer,c,{mutate:v=>{v.u_textureLinear=1-v.u_textureLinear;}});
        changed('incorrect material encoding is rejected',invalid,good);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearBufferfv(gl.COLOR,0,new Float32Array([.8,.1,.4,1]));
        gl.drawArrays=function(...args){if(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)!==null)originalDraw.apply(this,args);};
        let heldPresentation;try{heldPresentation=execute(programs.consumer,c,{final:true});}finally{gl.drawArrays=originalDraw;}
        const heldResult=comparePresentation(heldPresentation,good);
        check('held physical presentation is rejected',!heldResult.passed,{actual:heldPresentation,...heldResult,passed:!heldResult.passed,negative_control:true});
        if(gl.getError()!==gl.NO_ERROR)throw new Error('Material fixture produced a GL error');
        hdr.dispose();gl.deleteFramebuffer(framebuffer);
        return {checks,compilation,case_count:cases.length,source:{vertex:await sha(vertex),full_reference:await sha(fullReference),reference:await sha(reference),consumer:await sha(shaders.SCATTERING_SPHERE_FS),
          pixel_predicate:await sha(pixelPredicate),mapping_predicate:await sha(mappingPredicate),presentation_predicate:await sha(presentationPredicate)},
          fixture_limits:'Synthetic 2x2 display pixels, 8x4 height grid, constant positive residual field in admitted plan dimensions; actual production fragment and float/presentation output. Mesh and scientific field accuracy are separate gates.'};
      }finally{for(const t of allocations)gl.deleteTexture(t);owner.dispose();}
    },{referenceMode,pixelPredicate:evaluatePhysicalMaterialPixel.toString(),mappingPredicate:physicalMaterialMapping.toString(),presentationPredicate:evaluatePhysicalPresentation.toString()});
    Object.assign(evidence,result);assert.ok(result.checks.every(x=>x.passed),result.checks.filter(x=>!x.passed).map(x=>x.name).join('; '));
  };
  await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Material parity exceeded 120000 ms'));},120000);})]);
  evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.stack;process.exitCode=1;}
finally{clearTimeout(timer);if(browser){await closeOwnedBrowser(browser,{timeoutMs:8000});evidence.browser_closed=true;}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  evidence.post_run_integrity=Object.fromEntries(Object.entries(evidence.source_sha256).map(([route,digest])=>
    [route,hash(fs.readFileSync(path.join(pageRoot,route.slice(1))))===digest]));
  evidence.tool_unchanged=hash(fs.readFileSync(fileURLToPath(import.meta.url)))===evidence.tool_sha256;
  evidence.helper_unchanged=hash(fs.readFileSync(helperPath))===evidence.helper_sha256;
  if(!evidence.tool_unchanged||!evidence.helper_unchanged||Object.values(evidence.post_run_integrity).some(ok=>!ok)){
    evidence.status='failed';evidence.integrity_error='Source, tool or helper changed during run';process.exitCode=1;}
  evidence.completed_at=new Date().toISOString();save();console.log(`${evidence.status}: ${evidence.checks.filter(c=>c.passed).length}/${evidence.checks.length} ${out}`);
  if(evidence.error)console.error(evidence.error);}
