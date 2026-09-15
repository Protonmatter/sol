// Incident transport is an immutable numerical field, not a frame-time ray solver.
// The generator retains the bounded RK4 equations; rendering reads eight texels.
import {INCIDENT_FIELDS} from './atmosphereIncidentManifest.js';
import {ATMOSPHERE_PROFILE_ENCODING,getAtmosphereProfile,serializeAtmosphereProfile} from './atmosphereOptics.js';

export const INCIDENT_FIELD_SIZE=Object.freeze([385,65,3]);
export const INCIDENT_FIELD_UNIFORMS=Object.freeze(['u_incidentField','u_incidentFieldReady','u_incidentFieldHeight']);

/** @param {string} body */
export function incidentFieldDomain(body){
  if(body==='Earth')return {minHeightKm:0,maxHeightKm:16,quadratic:true};
  if(body==='Mars')return {minHeightKm:-24,maxHeightKm:24,quadratic:false};
  throw new RangeError('Incident field profile unavailable');
}
/** @param {string} body @param {number} zenithDegrees @param {number} heightKm */
export function incidentFieldCoordinate(body,zenithDegrees,heightKm){
  const d=incidentFieldDomain(body);
  if(!Number.isFinite(zenithDegrees)||zenithDegrees<0||zenithDegrees>93||!Number.isFinite(heightKm)||heightKm<d.minHeightKm||heightKm>d.maxHeightKm)throw new RangeError('Outside admitted incident field');
  const h=(heightKm-d.minHeightKm)/(d.maxHeightKm-d.minHeightKm);
  const mu=Math.cos(zenithDegrees*Math.PI/180);
  const x=mu<-.02?32*(mu+.05233595624294384)/.03233595624294384:mu<.02?32+256*(mu+.02)/.04:mu<.15?288+32*(mu-.02)/.13:320+64*(mu-.15)/.85;
  return [Math.max(0,Math.min(1,x/384)),d.quadratic?Math.sqrt(h):h];
}
/** Local exponential-density gradient and normal-curvature reduction.
 * @param {number[]} point @param {number[]} sun @param {number} radiusKm @param {number} q */
export function incidentFieldGeometry(point,sun,radiusKm,q){
  if(point.length!==3||sun.length!==3||![...point,...sun,radiusKm,q].every(Number.isFinite)||radiusKm<=0||q<=0||Math.hypot(...sun)===0)throw new RangeError('Invalid physical field geometry');
  const rho=Math.hypot(point[0],point[1],point[2]/q);
  if(rho===0)throw new RangeError('No incident field at body center');
  const gradient=[point[0]/rho,point[1]/rho,point[2]/(rho*q*q)],g=Math.hypot(...gradient),normal=gradient.map(v=>v/g);
  const sn=Math.hypot(...sun),target=sun.map(v=>v/sn),mu=Math.max(-1,Math.min(1,normal.reduce((s,n,i)=>s+n*target[i],0)));
  let tangent=target.map((v,i)=>v-mu*normal[i]),tl=Math.hypot(...tangent);
  if(tl<1e-10){tangent=Math.abs(normal[2])>.9?[1,0,0]:[-normal[1],normal[0],0];tl=Math.hypot(...tangent);}
  tangent=tangent.map(v=>v/tl);
  const curvature=(tangent[0]**2+tangent[1]**2+(tangent[2]/q)**2)/rho,heightKm=rho-radiusKm;
  return {radiusKm:g*g/curvature-heightKm,heightKm,columnScale:1/g,normal,tangent,zenithDegrees:Math.acos(mu)*180/Math.PI};
}
/** Fixed operation admission for the normal frame path; no integration grows with LOD.
 * @param {number} vertices @param {number} frames */
export function incidentFieldWork(vertices,frames){
  if(!Number.isSafeInteger(vertices)||vertices<0||!Number.isSafeInteger(frames)||frames<0)throw new RangeError('Invalid draw work');
  return {raySolves:0,textureFetches:vertices*frames*8};
}

/** Float64 reference for the runtime trilinear lookup, independent of GPU filtering.
 * The physical ODE reference remains tools/atmosphere_reference.py.
 * @param {Float32Array} values @param {string} body @param {number[]} point @param {number[]} sun
 * @param {number} radiusKm @param {number} q */
export function sampleIncidentField(values,body,point,sun,radiusKm,q){
  if(values.length!==INCIDENT_FIELD_SIZE.reduce((a,b)=>a*b,4))throw new RangeError('Incorrect field length');
  const geometry=incidentFieldGeometry(point,sun,radiusKm,q),profile=getAtmosphereProfile(body);
  if(!profile)throw new RangeError('Unknown optical field');
  if(Math.cos(geometry.zenithDegrees*Math.PI/180)<-.04)return {direction:sun.map(v=>v/Math.hypot(...sun)),transmission:[0,0,0]};
  const coordinate=incidentFieldCoordinate(body,geometry.zenithDegrees,Math.max(incidentFieldDomain(body).minHeightKm,geometry.heightKm));
  const r=(geometry.radiusKm/radiusKm-.98)/.04;
  if(r<0||r>1)throw new RangeError('Curvature outside incident field');
  const p=[coordinate[0]*384,coordinate[1]*64,r*2],lo=p.map(Math.floor),hi=lo.map((v,i)=>Math.min(v+1,INCIDENT_FIELD_SIZE[i]-1)),f=p.map((v,i)=>v-lo[i]);
  const result=[0,0,0,0];
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    const ix=x?hi[0]:lo[0],iy=y?hi[1]:lo[1],iz=z?hi[2]:lo[2],weight=(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);
    for(let c=0;c<4;c++)result[c]+=values[((iz*65+iy)*385+ix)*4+c]*weight;
  }
  const zenith=geometry.zenithDegrees*Math.PI/180,resultAngle=zenith-result[0];
  return {direction:geometry.normal.map((v,i)=>v*Math.cos(resultAngle)+geometry.tangent[i]*Math.sin(resultAngle)),
    transmission:profile.betaRayleighKm.map((b,i)=>resultAngle<Math.PI/2?Math.exp(-(b*result[1]+profile.betaAerosolExtinctionKm[i]*result[2])*geometry.columnScale):0)};
}
/** @param {ArrayBuffer} bytes */
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}

/** Hash-bound same-origin numerical field; full transfer/decode has one deadline.
 * @param {string} body @param {{signal?:AbortSignal,fetcher?:typeof fetch,timeoutMs?:number}} [options] */
export async function loadIncidentField(body,{signal,fetcher=fetch,timeoutMs=20000}={}){
  const reference=INCIDENT_FIELDS[body],profile=getAtmosphereProfile(body);
  if(!reference||!profile)throw new RangeError('Incident field is not admitted');
  if(reference.profile_encoding!==ATMOSPHERE_PROFILE_ENCODING)throw new Error('Incident field optical profile encoding changed');
  if(JSON.stringify(reference.domain)!==JSON.stringify(incidentFieldDomain(body))||JSON.stringify(reference.dimensions)!==JSON.stringify(INCIDENT_FIELD_SIZE)
    ||reference.format!=='little-endian-rgba32f-bend-columns-v1'||reference.bytes!==INCIDENT_FIELD_SIZE.reduce((a,b)=>a*b,16))throw new Error('Incident field domain or format changed');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw new RangeError('Invalid field deadline');
  const controller=new AbortController();
  let reader;
  let rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
  const abort=()=>{controller.abort();void reader?.cancel().catch(()=>{});rejectAbort(new DOMException('Incident field cancelled or deadline exceeded','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeoutMs);
  try{
    if(signal?.aborted)abort();
    const identity=await Promise.race([digest(new TextEncoder().encode(serializeAtmosphereProfile(profile)).buffer),aborted]);
    if(identity!==reference.profile_sha256)throw new Error('Incident field optical profile changed');
    const response=await Promise.race([fetcher(new URL(reference.path,import.meta.url),{signal:controller.signal,credentials:'same-origin',cache:'force-cache'}),aborted]);
    if(!response.ok||!response.body)throw new Error('Incident field transfer unavailable');
    reader=response.body.getReader();const chunks=[];let length=0;
    while(true){const part=await Promise.race([reader.read(),aborted]);if(controller.signal.aborted)throw new DOMException('Incident field cancelled','AbortError');if(part.done)break;
      length+=part.value.byteLength;if(length>reference.bytes)throw new Error('Incident field exceeded byte budget');chunks.push(part.value);}
    if(length!==reference.bytes)throw new Error('Incident field length mismatch');
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(await Promise.race([digest(bytes.buffer),aborted])!==reference.sha256)throw new Error('Incident field hash mismatch');
    if(controller.signal.aborted)throw new DOMException('Incident field cancelled','AbortError');
    const view=new DataView(bytes.buffer),values=new Float32Array(length/4);
    for(let i=0;i<values.length;i++){values[i]=view.getFloat32(i*4,true);if(!Number.isFinite(values[i]))throw new Error('Nonfinite incident field');}
    return {values,width:INCIDENT_FIELD_SIZE[0],height:INCIDENT_FIELD_SIZE[1]*INCIDENT_FIELD_SIZE[2],domain:incidentFieldDomain(body)};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);void reader?.cancel().catch(()=>{});}
}

// The fourth channel is retained for format/version diagnostics. All interpolation
// is explicit nearest texelFetch, independent of float filtering extensions.
export const INCIDENT_FIELD_GLSL=`
uniform highp sampler2D u_incidentField;
uniform int u_incidentFieldReady;
uniform vec3 u_incidentFieldHeight;
struct AtmosphereSolarRay {vec3 direction;vec3 transmission;};
vec4 incidentFieldTexel(ivec3 p){return texelFetch(u_incidentField,ivec2(p.x,p.y+65*p.z),0);}
vec4 incidentFieldSample(vec3 coordinate){
  vec3 p=clamp(coordinate,vec3(0),vec3(1))*vec3(384,64,2);
  ivec3 lo=ivec3(floor(p)),hi=min(lo+ivec3(1),ivec3(384,64,2));vec3 f=fract(p);
  return mix(mix(mix(incidentFieldTexel(lo),incidentFieldTexel(ivec3(hi.x,lo.yz)),f.x),
    mix(incidentFieldTexel(ivec3(lo.x,hi.y,lo.z)),incidentFieldTexel(ivec3(hi.xy,lo.z)),f.x),f.y),
    mix(mix(incidentFieldTexel(ivec3(lo.xy,hi.z)),incidentFieldTexel(ivec3(hi.x,lo.y,hi.z)),f.x),
    mix(incidentFieldTexel(ivec3(lo.x,hi.yz)),incidentFieldTexel(hi),f.x),f.y),f.z);
}
AtmosphereSolarRay atmosphereIncidentLookup(vec3 surface){
  vec3 target=normalize(u_atmosphereSunDirection);
  float q=u_atmospherePolarRatio,rho=length(atmosphereUnflatten(surface));
  vec3 gradient=vec3(surface.xy,surface.z/(q*q))/rho;float g=length(gradient);vec3 normal=gradient/g;
  float mu=clamp(dot(target,normal),-1.0,1.0),height=rho-u_atmosphereRadiusKm;
  if(mu<-.04)return AtmosphereSolarRay(target,vec3(0));
  vec3 tangent=target-normal*mu;float tangentLength=length(tangent);
  tangent=tangentLength>1e-6?tangent/tangentLength:(abs(normal.z)>.9?vec3(1,0,0):normalize(vec3(-normal.y,normal.x,0)));
  float curvature=dot(vec3(tangent.xy,tangent.z/q),vec3(tangent.xy,tangent.z/q))/rho;
  float referenceRadius=g*g/curvature-height,scaledRadius=referenceRadius/u_atmosphereRadiusKm;
  if(u_incidentFieldReady==0||u_atmosphereRefractivity==0.0||height<u_incidentFieldHeight.x-.002||height>u_incidentFieldHeight.y+.002||scaledRadius<.98||scaledRadius>1.02)
    return AtmosphereSolarRay(target,atmosphereSunTransmission(surface));
  float h=clamp((height-u_incidentFieldHeight.x)/(u_incidentFieldHeight.y-u_incidentFieldHeight.x),0.0,1.0);
  if(u_incidentFieldHeight.z>.5)h=sqrt(h);
  float x=mu<-.02?32.0*(mu+.05233595624294384)/.03233595624294384:mu<.02?32.0+256.0*(mu+.02)/.04:mu<.15?288.0+32.0*(mu-.02)/.13:320.0+64.0*(mu-.15)/.85;
  vec4 field=incidentFieldSample(vec3(x/384.0,h,(scaledRadius-.98)/.04));
  vec3 direction=tangentLength>1e-6?normalize(target*cos(field.x)+(normal-target*mu)/tangentLength*sin(field.x)):target;
  vec3 transmission=dot(direction,normal)>0.0?exp(-(u_atmosphereRayleighKm*field.y+u_atmosphereAerosolKm*field.z)/g):vec3(0);
  return AtmosphereSolarRay(direction,transmission);
}
`;
