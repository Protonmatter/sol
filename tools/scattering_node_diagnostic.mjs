#!/usr/bin/env node
// Read-only, source-pinned diagnosis; never changes a qualification gate/corpus.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {browserBackendFromArgs,browserBackendArgs,assertBrowserBackend} from './browser_backend.mjs';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const once=(source,text)=>assert.equal(source.split(text).length,2,`Diagnostic source boundary changed: ${text}`);
export function buildScatteringNodeDiagnostic(source){
  const output='out vec4 o;',centerStart='  vec2 columns=max(vec2(0),scatteringViewColumns(columnRay,interval.y)-scatteringViewColumns(columnRay,interval.x));';
  const centerEnd='  // Closed-form density centroids condition the residual at actual endpoints.';
  for(const boundary of [output,centerStart,centerEnd,'void main(){','  o=valid?vec4(residual,1):vec4(0);'])once(source,boundary);
  assert.ok(source.endsWith('\n}'),'Generator final main boundary changed');
  const center=source.slice(source.indexOf(centerStart),source.indexOf(centerEnd));
  assert.ok(center.includes('centerT=clamp('),'Conditioning center body changed');
  const declarations='layout(location=0) out vec4 o;\nlayout(location=1) out vec4 d1;\nlayout(location=2) out vec4 d2;\nlayout(location=3) out vec4 d3;\nuniform int u_diagnosticMode;';
  const helper=`vec2 diagnosticCenter(AtmosphereColumnRay columnRay,vec2 interval){\n${center}  return centerT;\n}\n`;
  const additions=`
  // Added readback outputs; original generator main expressions above unchanged.
  vec3 ray=normalize(direction),p=atmosphereUnflatten(u_atmosphereCameraKm),d=atmosphereUnflatten(ray);
  float a=dot(d,d),closestT=-dot(p,d)/a;vec3 closest=p+closestT*d;
  float metricImpact=length(closest),delta=(u_atmosphereRadiusKm*u_atmosphereRadiusKm-dot(closest,closest))/a;
  vec2 ground=atmosphereRayInterval(u_atmosphereCameraKm,ray,u_atmosphereRadiusKm);
  vec2 outer=atmosphereRayInterval(u_atmosphereCameraKm,ray,u_atmosphereRadiusKm+u_atmosphereTopKm);
  float begin=max(0.0,outer.x),distance=min(maximum,outer.y)-begin;
  vec3 entry=u_atmosphereCameraKm+ray*begin;
  AtmosphereColumnRay columnRay=atmosphereColumnRay(entry,ray,distance);
  vec2 shadow=atmosphereShadowInterval(entry,ray);
  bool split=!(shadow.y<=shadow.x||shadow.y<=0.0||shadow.x>=distance);
  vec2 whole=vec2(0,distance),first=vec2(0,max(0.0,shadow.x)),last=vec2(min(distance,shadow.y),distance);
  float phaseMu=clamp(dot(ray,normalize(u_atmosphereSunDirection)),-1.0,1.0),g=u_atmosphereG;
  vec2 phase=vec2(3.0*(1.0+phaseMu*phaseMu)/(16.0*ATM_PI),(1.0-g*g)/(4.0*ATM_PI*pow(1.0+g*g-2.0*g*phaseMu,1.5)));
  float factor=ATM_PI*u_atmosphereSolarScale*u_atmosphereExposure;
  if(u_diagnosticMode==0){d1=vec4(result.scattering,1);d2=vec4(weight,1);d3=vec4(direction,maximum);}
  else if(u_diagnosticMode==1){
    float y=mod(cell.y,float(u_scatteringSurfaceSize.y)),z=floor(cell.y/float(u_scatteringSurfaceSize.y));
    float mu=scatteringMu(y),h=scatteringHeight(z,mu),r=u_atmosphereRadiusKm+h;
    d1=vec4(metricImpact,delta,ground);d2=vec4(outer,closestT,maximum);
    d3=vec4(mu,h,r*sqrt(max(0.0,1.0-mu*mu)),azimuth);
  }else if(u_diagnosticMode==2){
    d1=vec4(shadow,begin,distance);d2=vec4(columnRay.impact,columnRay.begin,columnRay.scale,split?1:0);
    d3=vec4(entry,length(atmosphereUnflatten(entry+ray*distance))-u_atmosphereRadiusKm);
  }else if(u_diagnosticMode==3){
    d1=vec4(scatteringReferenceSegment(entry,ray,columnRay,whole,phase)*factor,1);
    d2=vec4(scatteringReferenceSegment(entry,ray,columnRay,first,phase)*factor,1);
    d3=vec4(scatteringReferenceSegment(entry,ray,columnRay,last,phase)*factor,1);
  }else{
    vec2 interval=u_diagnosticMode==4?whole:u_diagnosticMode==5?first:last;
    if(interval.y<=interval.x){d1=vec4(0,0,interval);d2=vec4(0);d3=vec4(0);}
    else{vec2 centerT=diagnosticCenter(columnRay,interval);d1=vec4(centerT,interval);
      d2=vec4(atmosphereSunOpticalDepthToTop(entry+ray*centerT.x,normalize(u_atmosphereSunDirection)),1);
      d3=vec4(scatteringTransmissionMass(columnRay,interval),1);}
  }
`;
  const changed=source.replace(output,declarations).replace('void main(){',helper+'void main(){');
  return {source:changed.slice(0,-2)+additions+'\n}',centerSource:center,declarations,helper,additions};
}

async function main(){
  const argument=(key,fallback)=>process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
  const receiptRoot=path.resolve(argument('receipt-root','')),out=path.resolve(argument('out',''));
  assert.ok(argument('receipt-root')&&argument('out'),'--receipt-root and --out required');
  const backend=browserBackendFromArgs(process.argv.slice(2)),caseName=argument('case','Mars-terminator-terrain');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(caseName));assert.ok(!fs.existsSync(out),'Immutable output directory already exists');
  const originalEvidence=JSON.parse(fs.readFileSync(path.join(receiptRoot,'evidence.json'),'utf8'));
  const caseBytes=fs.readFileSync(path.join(receiptRoot,caseName+'.json'));
  const input=JSON.parse(caseBytes),snapshot=path.join(out,'snapshot');fs.mkdirSync(snapshot,{recursive:true});
  const files={};for(const [relative,expected]of Object.entries(originalEvidence.hashes)){
    const source=path.resolve(receiptRoot,'snapshot',relative),target=path.resolve(snapshot,relative);
    assert.ok(target.startsWith(snapshot+path.sep));const bytes=fs.readFileSync(source);assert.equal(hash(bytes),expected,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});files[relative]=expected;
  }
  fs.writeFileSync(path.join(snapshot,'package.json'),'{"type":"module"}\n',{flag:'wx'});
  fs.writeFileSync(path.join(snapshot,'index.html'),'<!doctype html><title>Scattering node diagnosis</title><canvas width="16" height="16"></canvas>',{flag:'wx'});
  const scattering=await import(pathToFileURL(path.join(snapshot,'js/atmosphereScattering.js')).href);
  const generated=buildScatteringNodeDiagnostic(scattering.SCATTERING_GENERATOR_FS);
  fs.writeFileSync(path.join(out,'original-generator.frag'),scattering.SCATTERING_GENERATOR_FS,{flag:'wx'});
  fs.writeFileSync(path.join(out,'diagnostic-generator.frag'),generated.source,{flag:'wx'});
  fs.writeFileSync(path.join(out,'conditioning-center-source.glsl'),generated.centerSource,{flag:'wx'});
  const nodes=[];for(let z=11;z<=14;z++)for(let y=26;y<=29;y++)for(let x=15;x<=18;x++)nodes.push({x,y,z});
  const evidence={schema_version:'scattering-node-diagnostic.v1',started_at:new Date().toISOString(),requested_backend:backend,
    source_receipt:receiptRoot,source_evidence_sha256:hash(fs.readFileSync(path.join(receiptRoot,'evidence.json'))),case_sha256:hash(caseBytes),
    source_hashes:files,tool_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    shaders:{original:hash(scattering.SCATTERING_GENERATOR_FS),diagnostic:hash(generated.source),vertex:hash(scattering.SCATTERING_GENERATOR_VS)},
    scope:'64 Mars nodes only, original unmodified generator followed by diagnostic MRT outputs. No gate, corpus, or solver change.',
    modes:{0:['directS','conditioningW','direction_maximum'],1:['metricImpact_delta_groundRoots','outerRoots_closestT_maximum','mu_height_plannedImpact_azimuth'],
      2:['shadowRoots_entryDistance_segmentLength','columnImpact_begin_scale_split','entry_xyz_endpointHeight'],
      3:['wholeWeight','leftWeight','rightWeight'],4:['wholeCenters_interval','wholeSolarDepth','wholeTransmissionMass'],
      5:['leftCenters_interval','leftSolarDepth','leftTransmissionMass'],6:['rightCenters_interval','rightSolarDepth','rightTransmissionMass']},
    nodes,errors:[]};
  fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify({evidence,inputs:input.inputs,plan:input.summary.plan},null,2),{flag:'wx'});
  const allowed=new Set(['/index.html',...Object.keys(files).map(p=>'/'+p)]);
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');if(!allowed.has(url.pathname)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.html')?'text/html':'application/octet-stream');
    res.end(fs.readFileSync(path.join(snapshot,url.pathname.slice(1))));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
    browser=await puppeteer.launch({executablePath:argument('browser','C:/Program Files/Google/Chrome/Application/chrome.exe'),headless:true,
      args:['--no-sandbox','--disable-background-networking',...browserBackendArgs(backend)],timeout:20000,protocolTimeout:180000});
    const page=await browser.newPage();await page.setRequestInterception(true);
    page.on('request',request=>request.url().startsWith(base+'/')?request.continue():request.abort());
    page.on('pageerror',error=>evidence.errors.push(String(error)));await page.goto(base+'/index.html');
    const result=await page.evaluate(async({item,plan,nodes,diagnosticSource})=>{
      const scattering=await import('./js/atmosphereScattering.js'),optics=await import('./js/atmosphereOptics.js');
      const {ATMOSPHERE_COLUMN_FIELDS}=await import('./js/atmosphereColumnManifest.js');
      const gl=document.querySelector('canvas').getContext('webgl2',{antialias:false});
      if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Float WebGL2 unavailable');
      const debug=gl.getExtension('WEBGL_debug_renderer_info'),gpu={renderer:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER),version:gl.getParameter(gl.VERSION),maxDrawBuffers:gl.getParameter(gl.MAX_DRAW_BUFFERS)};
      const owned={programs:[],shaders:[],textures:[],framebuffers:[],vaos:[]},compileTimes=[];
      function compile(source){
        const started=performance.now(),program=gl.createProgram();owned.programs.push(program);
        for(const [type,code]of [[gl.VERTEX_SHADER,scattering.SCATTERING_GENERATOR_VS],[gl.FRAGMENT_SHADER,source]]){
          const shader=gl.createShader(type);owned.shaders.push(shader);gl.shaderSource(shader,code);gl.compileShader(shader);gl.attachShader(program,shader);
        }
        gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
        compileTimes.push(performance.now()-started);const locations={};
        for(const key of [...optics.ATMOSPHERE_UNIFORMS,...scattering.SCATTERING_UNIFORMS,'u_scatteringPass','u_atmosphereColumnField','u_diagnosticMode'])locations[key]=gl.getUniformLocation(program,key);
        return {program,locations};
      }
      const texture=(width,height,internal=gl.RGBA32F,format=gl.RGBA,data=null)=>{
        const value=gl.createTexture();owned.textures.push(value);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,value);
        gl.texImage2D(gl.TEXTURE_2D,0,internal,width,height,0,format,gl.FLOAT,data);
        for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
        for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);return value;
      };
      try{
        const original=compile(scattering.SCATTERING_GENERATOR_FS),diagnostic=compile(diagnosticSource);
        const record=ATMOSPHERE_COLUMN_FIELDS[item.body],bytes=await(await fetch(new URL(record.path,new URL('./js/atmosphereColumnManifest.js',location.href)))).arrayBuffer();
        const column=texture(...record.dimensions.slice(0,2),gl.RG32F,gl.RG,new Float32Array(bytes));
        const framebuffer=gl.createFramebuffer();owned.framebuffers.push(framebuffer);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
        const vao=gl.createVertexArray();owned.vaos.push(vao);gl.bindVertexArray(vao);
        const width=plan.surfaceSize[0],height=plan.surfaceSize[1]*plan.surfaceSize[2];
        for(let i=0;i<4;i++){const t=texture(width,height);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0);}
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete diagnostic framebuffer');
        gl.viewport(0,0,width,height);for(const cap of [gl.BLEND,gl.DEPTH_TEST,gl.CULL_FACE,gl.STENCIL_TEST,gl.RASTERIZER_DISCARD,gl.DITHER])gl.disable(cap);
        gl.enable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.depthMask(false);
        const draw=(probe,mode)=>{
          gl.useProgram(probe.program);optics.setAtmosphereUniforms(gl,probe.locations,item.profile,item.options);scattering.setScatteringUniforms(gl,probe.locations,plan);
          gl.uniform1i(probe.locations.u_scatteringPass,0);gl.uniform1i(probe.locations.u_diagnosticMode,mode);
          gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,column);gl.uniform1i(probe.locations.u_atmosphereColumnField,7);
          gl.drawBuffers((mode<0?[0]:[0,1,2,3]).map(i=>gl.COLOR_ATTACHMENT0+i));
          for(let z=11;z<=14;z++){gl.scissor(15,26+z*plan.surfaceSize[1],4,4);gl.drawArrays(gl.TRIANGLES,0,3);}
          const outputs=nodes.map(node=>{
            const channels=[];for(let attachment=0;attachment<(mode<0?1:4);attachment++){
              gl.readBuffer(gl.COLOR_ATTACHMENT0+attachment);const values=new Float32Array(4);
              gl.readPixels(node.x,node.y+node.z*plan.surfaceSize[1],1,1,gl.RGBA,gl.FLOAT,values);channels.push(Array.from(values));
            }return channels;
          });const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Diagnostic GL error ${error}`);return outputs;
        };
        const originalValues=draw(original,-1),modes=[];for(let mode=0;mode<=6;mode++)modes.push(draw(diagnostic,mode));
        return {gpu,compileTimes,uniforms:optics.atmosphereUniformValues(item.profile,item.options),
          results:nodes.map((node,i)=>({...node,original:originalValues[i][0],modes:modes.map(values=>values[i])}))};
      }finally{
        for(const [key,method]of [['vaos','deleteVertexArray'],['framebuffers','deleteFramebuffer'],['textures','deleteTexture'],['programs','deleteProgram'],['shaders','deleteShader']])for(const value of owned[key])gl[method](value);
      }
    },{item:input.inputs,plan:input.summary.plan,nodes,diagnosticSource:generated.source});
    evidence.observed_backend=assertBrowserBackend(backend,result.gpu);Object.assign(evidence,result);
    evidence.max_instrumentation_residual_delta=Math.max(...result.results.flatMap(node=>node.modes.flatMap(mode=>mode[0].map((value,i)=>Math.abs(value-node.original[i])))));
    const historical=input.samples.flatMap(sample=>sample.corner_diagnostic?.values??[]);
    evidence.prior_corner_comparisons=result.results.flatMap(node=>{
      const prior=historical.find(p=>p.x===node.x&&p.y===node.y&&p.z===node.z);return prior?[{x:node.x,y:node.y,z:node.z,prior:prior.rgba,actual:node.original,max_delta:Math.max(...prior.rgba.map((v,i)=>Math.abs(v-node.original[i])))}]:[];
    });
  }catch(error){evidence.errors.push(error.stack??String(error));}
  finally{
    if(browser)await closeOwnedBrowser(browser);await new Promise(resolve=>server.close(resolve));
    for(const [relative,expected]of Object.entries(files))assert.equal(hash(fs.readFileSync(path.join(snapshot,relative))),expected);
    evidence.completed_at=new Date().toISOString();evidence.completed=evidence.errors.length===0;
    fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
    console.log(JSON.stringify({completed:evidence.completed,backend,gpu:evidence.gpu,compileTimes:evidence.compileTimes,max_instrumentation_residual_delta:evidence.max_instrumentation_residual_delta,errors:evidence.errors,out},null,2));
    if(!evidence.completed)process.exitCode=1;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
