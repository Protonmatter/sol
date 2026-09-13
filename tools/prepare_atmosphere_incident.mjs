// Offline bounded field generation. Float32 replay is qualified against the CPU
// reference; byte-for-byte portability across GPU/browser versions is not claimed.
// No work from this tool runs in the app or implicitly in a build.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {ATMOSPHERE_GLSL,ATMOSPHERE_REFRACTION_GLSL} from '../apps/web/js/atmosphereShaders.js';
import {ATMOSPHERE_PROFILE_ENCODING,getAtmosphereProfile,serializeAtmosphereProfile,atmosphereUniformValues} from '../apps/web/js/atmosphereOptics.js';
import {INCIDENT_FIELD_SIZE,incidentFieldDomain} from '../apps/web/js/atmosphereIncident.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const chrome=process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [width,height,layers]=INCIDENT_FIELD_SIZE;
const fragment=`#version 300 es
precision highp float;
precision mediump int;
out vec4 outputField;
uniform vec3 u_domain;
uniform float u_layer;
${ATMOSPHERE_GLSL}
${ATMOSPHERE_REFRACTION_GLSL}
void main(){
 float x=gl_FragCoord.x-.5,v=(gl_FragCoord.y-.5)/64.0;
 float mu=x<32.0?mix(-.05233595624294384,-.02,x/32.0):x<288.0?mix(-.02,.02,(x-32.0)/256.0):x<320.0?mix(.02,.15,(x-288.0)/32.0):mix(.15,1.0,(x-320.0)/64.0);
 float altitude=mix(u_domain.x,u_domain.y,u_domain.z>.5?v*v:v);
 vec3 surface=vec3(u_atmosphereRadiusKm+altitude,0,0),target=vec3(mu,sqrt(max(0.0,1.0-mu*mu)),0),up=vec3(1,0,0);
 vec3 guess=atmosphereAboveHorizon(target,up),nextDirection=guess,outgoing;vec2 columns;
 bool ok=true;
 for(int i=0;i<6;i++){
   if(!atmosphereCurvedRay(surface,guess,outgoing,columns)){ok=false;break;}
   nextDirection=normalize(target-outgoing+guess);
   vec3 nextGuess=atmosphereAboveHorizon(nextDirection,up);
   if(length(nextGuess-guess)<.000001){guess=nextGuess;break;}
   guess=nextGuess;
 }
 if(!atmosphereCurvedRay(surface,guess,outgoing,columns))ok=false;
 // Retain the limiting tangent column on the hidden side. Runtime visibility
 // uses the interpolated apparent elevation, avoiding a discontinuous zero
 // column that would brighten/dim a still-visible ray near the horizon cell.
 vec3 apparent=dot(nextDirection,up)<0.0?nextDirection:guess;
 float bend=atan(target.y*apparent.x-target.x*apparent.y,dot(target,apparent));
 outputField=vec4(bend,columns,ok?1.0:0.0);
}`;
const generatorHash=sha(Buffer.from(fragment));
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-background-networking','--use-angle=swiftshader','--enable-unsafe-swiftshader'],protocolTimeout:180000});
const manifest={};
try{
 const page=await browser.newPage();await page.setContent('<canvas></canvas>');
 for(const body of ['Earth','Mars']){
  const profile=getAtmosphereProfile(body),domain=incidentFieldDomain(body);
  const uniforms=atmosphereUniformValues(profile,{cameraBodyKm:[0,0,8000],sunDirectionBody:[1,0,0],polarRatio:1,solarDistanceAu:1,exposure:1});
  const values=await page.evaluate(async({fragment,uniforms,domain,width,height,layers})=>{
   const gl=document.querySelector('canvas').getContext('webgl2');if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Float field generation unsupported');
   const shader=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){gl_Position=vec4(gl_VertexID==0?vec2(-1,-1):gl_VertexID==1?vec2(3,-1):vec2(-1,3),0,1);}'));
   gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,width,height);
   const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete float field');
   for(const [name,value]of Object.entries(uniforms)){const u=gl.getUniformLocation(p,name);
    if(Array.isArray(value)){if(value.length===2)gl.uniform2fv(u,value);else gl.uniform3fv(u,value);}
    else if(name.endsWith('Enabled'))gl.uniform1i(u,value);else gl.uniform1f(u,value);}
   gl.uniform3fv(gl.getUniformLocation(p,'u_domain'),[domain.minHeightKm,domain.maxHeightKm,Number(domain.quadratic)]);
   const output=new Float32Array(width*height*layers*4);gl.viewport(0,0,width,height);gl.enable(gl.SCISSOR_TEST);
   for(let layer=0;layer<layers;layer++){
    gl.uniform1f(gl.getUniformLocation(p,'u_atmosphereRadiusKm'),uniforms.u_atmosphereRadiusKm*(.98+.02*layer));
    // Bounded small batches avoid one long GPU watchdog submission. This is
    // offline only; no current frame invokes the integrator or this FBO pass.
    for(let row=0;row<height;row+=4){
      const rows=Math.min(4,height-row);gl.scissor(0,row,width,rows);gl.drawArrays(gl.TRIANGLES,0,3);
      const pixels=new Float32Array(width*rows*4);gl.readPixels(0,row,width,rows,gl.RGBA,gl.FLOAT,pixels);
      if(gl.getError()!==gl.NO_ERROR)throw Error('Field generation GPU error');
      output.set(pixels,(layer*height+row)*width*4);await new Promise(resolve=>setTimeout(resolve,0));
    }
   }
   gl.deleteFramebuffer(fbo);gl.deleteTexture(texture);gl.deleteProgram(p);
   return Array.from(output);
  },{fragment,uniforms,domain,width,height,layers});
  for(let i=0;i<values.length;i+=4){if(!values.slice(i,i+4).every(Number.isFinite)||values[i+3]!==1)throw Error(`${body} field sample ${i/4} failed integration admission`);}
  const bytes=Buffer.alloc(values.length*4);values.forEach((value,i)=>bytes.writeFloatLE(value,i*4));
  const relative=`../data/optics/${body.toLowerCase()}-incident-v1.f32`,destination=path.resolve(root,'apps/web/js',relative);
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
  const sourceHash=relative=>sha(Buffer.from(fs.readFileSync(path.join(root,relative),'utf8').replace(/\r\n/g,'\n')));
  manifest[body]={path:relative,bytes:bytes.length,sha256:sha(bytes),profile_encoding:ATMOSPHERE_PROFILE_ENCODING,profile_sha256:sha(Buffer.from(serializeAtmosphereProfile(profile))),domain,
    generator_sha256:generatorHash,generator_source_sha256:sourceHash('tools/prepare_atmosphere_incident.mjs'),solver_source_sha256:sourceHash('apps/web/js/atmosphereShaders.js'),
    profile_source_sha256:sourceHash('apps/web/js/atmosphereOptics.js'),field_source_sha256:sourceHash('apps/web/js/atmosphereIncident.js'),
    browser_version:await browser.version(),dimensions:[width,height,layers],format:'little-endian-rgba32f-bend-columns-v1'};
  process.stdout.write(`${body}: ${width*height*layers} bounded offline rays, ${bytes.length} bytes, ${manifest[body].sha256}\n`);
 }
 fs.writeFileSync(path.join(root,'apps/web/js/atmosphereIncidentManifest.js'),`// Generated by tools/prepare_atmosphere_incident.mjs. Numerical reference fields, not imagery.\nexport const INCIDENT_FIELDS=Object.freeze(${JSON.stringify(manifest,null,2)});\n`);
}finally{await browser.close();}
