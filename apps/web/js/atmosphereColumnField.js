// Immutable density-column lookup. The offline quadrature remains the reference;
// the production shader retains its scattering nodes, shadow splits and physics.
import {ATMOSPHERE_GLSL,ATMOSPHERE_FS} from './atmosphereShaders.js';
import {ATMOSPHERE_PROFILE_ENCODING,getAtmosphereProfile,serializeAtmosphereProfile} from './atmosphereOptics.js';
import {ATMOSPHERE_COLUMN_FIELDS} from './atmosphereColumnManifest.js';
import {loadIncidentField} from './atmosphereIncident.js';

export const ATMOSPHERE_COLUMN_SIZE=512;
export const ATMOSPHERE_COLUMN_BYTES=512*512*2*4;
const X=[-.9602898565,-.7966664774,-.5255324099,-.1834346425,.1834346425,.5255324099,.7966664774,.9602898565];
const W=[.1012285363,.2223810345,.3137066459,.3626837834,.3626837834,.3137066459,.2223810345,.1012285363];

/** Offline eight-node monotonic column, same support and nodes as the reference shader. */
export function outwardDensityColumn(radiusKm,heightKm,mu,scaleHeightKm,topKm){
  if(![radiusKm,heightKm,mu,scaleHeightKm,topKm].every(Number.isFinite)||radiusKm<=0||heightKm<0||mu<0||mu>1||scaleHeightKm<=0||topKm<=0)throw new RangeError('Invalid density-column geometry');
  const support=Math.min(topKm,12*scaleHeightKm);
  if(heightKm>=support)return 0;
  const radius=radiusKm+heightKm,impact=radius*Math.sqrt(Math.max(0,1-mu*mu));
  const end=Math.sqrt(Math.max(0,(radiusKm+support)**2-impact**2))-radius*mu;
  let sum=0;
  for(let i=0;i<8;i++){
    const distance=end*(1+X[i])*.5;
    sum+=W[i]*Math.exp(-Math.max(0,Math.hypot(impact,radius*mu+distance)-radiusKm)/scaleHeightKm);
  }
  return sum*end*.5;
}

/** Offline only. Quadratic height and cosine axes resolve the low aerosol layer and limb. */
export function generateAtmosphereColumns(profile){
  const n=ATMOSPHERE_COLUMN_SIZE,values=new Float32Array(n*n*2);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const height=profile.topKm*(y/(n-1))**2,mu=(x/(n-1))**2;
    for(const [c,h]of [profile.rayleighScaleHeightKm,profile.aerosolScaleHeightKm].entries())
      values[(y*n+x)*2+c]=outwardDensityColumn(profile.radiusKm,height,mu,h,profile.topKm);
  }
  return values;
}

function ozoneDensity(heightKm,peakKm,widthKm){
  return widthKm<=0?0:Math.exp(-Math.abs(heightKm-peakKm)/widthKm);
}

function ozoneGauss(impact,x0,x1,radiusKm,peakKm,widthKm){
  const span=x1-x0;if(span<=0)return 0;
  const half=span*.5,middle=(x0+x1)*.5;let column=0;
  for(let i=0;i<8;i++){
    const x=middle+half*X[i];
    column+=W[i]*ozoneDensity(Math.max(0,Math.hypot(impact,x)-radiusKm),peakKm,widthKm);
  }
  return column*half;
}

function ozoneColumnOnAxis(impact,x0,x1,radiusKm,peakKm,widthKm){
  if(x1<=x0||widthKm<=0)return 0;
  const peakR=radiusKm+Math.max(0,peakKm),disc=peakR*peakR-impact*impact;
  let column=0,prev=x0;
  if(disc>0){
    const peakX=Math.sqrt(disc);
    if(-peakX>x0+1e-4&&-peakX<x1-1e-4){column+=ozoneGauss(impact,prev,-peakX,radiusKm,peakKm,widthKm);prev=-peakX;}
    if(0>x0+1e-4&&0<x1-1e-4){column+=ozoneGauss(impact,prev,0,radiusKm,peakKm,widthKm);prev=0;}
    if(peakX>x0+1e-4&&peakX<x1-1e-4){column+=ozoneGauss(impact,prev,peakX,radiusKm,peakKm,widthKm);prev=peakX;}
  }else if(0>x0+1e-4&&0<x1-1e-4){
    column+=ozoneGauss(impact,prev,0,radiusKm,peakKm,widthKm);prev=0;
  }
  return column+ozoneGauss(impact,prev,x1,radiusKm,peakKm,widthKm);
}

/** Outward Chappuis column on the same (height, mu) grid as the shipped RG field. */
export function outwardOzoneColumn(radiusKm,heightKm,mu,peakKm,widthKm,topKm){
  if(![radiusKm,heightKm,mu,peakKm,widthKm,topKm].every(Number.isFinite)||radiusKm<=0||heightKm<0||mu<0||mu>1||widthKm<0||topKm<=0)
    throw new RangeError('Invalid ozone-column geometry');
  if(widthKm===0||heightKm>=topKm)return 0;
  const radius=radiusKm+heightKm,impact=radius*Math.sqrt(Math.max(0,1-mu*mu));
  const x0=radius*mu,x1=Math.sqrt(Math.max(0,(radiusKm+topKm)**2-impact**2));
  return ozoneColumnOnAxis(impact,x0,x1,radiusKm,peakKm,widthKm);
}

export function generateAtmosphereOzoneColumns(profile){
  const n=ATMOSPHERE_COLUMN_SIZE,values=new Float32Array(n*n);
  if(profile.ozoneWidthKm<=0)return values;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const height=profile.topKm*(y/(n-1))**2,mu=(x/(n-1))**2;
    values[y*n+x]=outwardOzoneColumn(profile.radiusKm,height,mu,profile.ozonePeakKm,profile.ozoneWidthKm,profile.topKm);
  }
  return values;
}

/** Runtime RGBA32F: admitted RG columns plus baked ozone. Unit 7 stays RG32F. */
export function packAtmosphereOpticalField(columns,ozone){
  const cells=ozone.length;
  if(!Number.isInteger(cells)||cells<1||columns.length!==cells*2)throw new RangeError('Invalid packed optical field');
  const packed=new Float32Array(cells*4);
  for(let i=0;i<cells;i++){
    packed[i*4]=columns[i*2];
    packed[i*4+1]=columns[i*2+1];
    packed[i*4+2]=ozone[i];
    packed[i*4+3]=1;
  }
  return packed;
}

const ozoneTables=new Map();
const ozoneLoads=new Map();
function ozoneTableKey(profile){
  return [profile.body,profile.version,profile.radiusKm,profile.topKm,profile.ozonePeakKm,profile.ozoneWidthKm].join('|');
}
/** Chunked copy of the outward ozone table. A retained table is not rebuilt.
 * @param {object} profile
 * @param {{signal?:AbortSignal,rowsPerSlice?:number}} [options]
 */
export async function loadAtmosphereOzoneColumns(profile,options={}){
  const {signal,rowsPerSlice=16}=options;
  if(!profile)throw new RangeError('Ozone table profile unavailable');
  const key=ozoneTableKey(profile);
  const ready=ozoneTables.get(key);
  if(ready)return ready;
  const pending=ozoneLoads.get(key);
  if(pending)return pending;
  const job=(async()=>{
    const n=ATMOSPHERE_COLUMN_SIZE,values=new Float32Array(n*n);
    if(!(profile.ozoneWidthKm>0)){ozoneTables.set(key,values);return values;}
    if(!Number.isInteger(rowsPerSlice)||rowsPerSlice<1)throw new RangeError('Invalid ozone table slice');
    for(let y=0;y<n;y++){
      if(signal?.aborted)throw new DOMException('Ozone table cancelled','AbortError');
      for(let x=0;x<n;x++){
        const height=profile.topKm*(y/(n-1))**2,mu=(x/(n-1))**2;
        values[y*n+x]=outwardOzoneColumn(profile.radiusKm,height,mu,profile.ozonePeakKm,profile.ozoneWidthKm,profile.topKm);
      }
      if((y+1)%rowsPerSlice===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    ozoneTables.set(key,values);
    return values;
  })();
  ozoneLoads.set(key,job);
  try{return await job;}finally{if(ozoneLoads.get(key)===job)ozoneLoads.delete(key);}
}
/** Bilinear sample of the baked ozone table, matching atmosphereOutwardPacked. */
export function sampleOutwardOzone(values,profile,heightKm,mu){
  if(values.length!==ATMOSPHERE_COLUMN_SIZE**2||![heightKm,mu].every(Number.isFinite))throw new RangeError('Invalid ozone field sample');
  if(!(profile.ozoneWidthKm>0)||heightKm>=profile.topKm)return 0;
  const n=ATMOSPHERE_COLUMN_SIZE-1;
  const p=[Math.sqrt(Math.min(1,Math.max(0,mu)))*n,Math.sqrt(Math.min(1,Math.max(0,heightKm/profile.topKm)))*n];
  const lo=p.map(Math.floor),hi=lo.map(value=>Math.min(value+1,n)),f=p.map((value,i)=>value-lo[i]);
  const texel=(x,y)=>values[y*ATMOSPHERE_COLUMN_SIZE+x];
  return (texel(lo[0],lo[1])*(1-f[0])+texel(hi[0],lo[1])*f[0])*(1-f[1])+(texel(lo[0],hi[1])*(1-f[0])+texel(hi[0],hi[1])*f[0])*f[1];
}
/** Sun-to-surface ozone column at height and solar cosine. Width 0 stays zero. */
export function incidentOzoneColumn(profile,heightKm,mu){
  if(!profile||!(profile.ozoneWidthKm>0))return 0;
  if(![heightKm,mu].every(Number.isFinite))throw new RangeError('Invalid ozone-column geometry');
  const key=ozoneTableKey(profile);
  let table=ozoneTables.get(key);
  if(!table){table=generateAtmosphereOzoneColumns(profile);ozoneTables.set(key,table);}
  return sampleOutwardOzone(table,profile,heightKm,mu);
}

/** Float64 interpolation reference; GPU uses explicit texelFetch, not float filtering. */
export function sampleOutwardColumns(values,profile,heightKm,mu){
  if(values.length!==ATMOSPHERE_COLUMN_SIZE**2*2||![heightKm,mu].every(Number.isFinite)||heightKm<0||mu<0||mu>1)throw new RangeError('Invalid column field sample');
  if(heightKm>=profile.topKm)return [0,0];
  const n=ATMOSPHERE_COLUMN_SIZE,x=Math.sqrt(mu)*(n-1),y=Math.sqrt(heightKm/profile.topKm)*(n-1);
  const ix=Math.min(n-2,Math.floor(x)),iy=Math.min(n-2,Math.floor(y)),fx=x-ix,fy=y-iy;
  return [0,1].map(c=>{
    const v=(xx,yy)=>values[(yy*n+xx)*2+c];
    return (v(ix,iy)*(1-fx)+v(ix+1,iy)*fx)*(1-fy)+(v(ix,iy+1)*(1-fx)+v(ix+1,iy+1)*fx)*fy;
  });
}

/** Exact ellipsoid-to-sphere coordinate reduction and physical path-length Jacobian. */
export function sampleDensityColumns(values,profile,origin,direction,distance,polarRatio=1){
  if(origin.length!==3||direction.length!==3||![...origin,...direction,distance,polarRatio].every(Number.isFinite)||distance<0||polarRatio<=0)throw new RangeError('Invalid column segment');
  const p=[origin[0],origin[1],origin[2]/polarRatio],d=[direction[0],direction[1],direction[2]/polarRatio];
  const scale=Math.hypot(...d);if(scale===0)throw new RangeError('Zero column direction');
  const axis=d.map(v=>v/scale),start=p.reduce((sum,v,i)=>sum+v*axis[i],0),end=start+distance*scale;
  const impact=Math.hypot(...p.map((v,i)=>v-start*axis[i]));
  const tail=x=>{
    const radius=Math.hypot(impact,x),h=radius-profile.radiusKm;
    if(h>=profile.topKm)return [0,0];
    if(h<0){const ground=Math.sqrt(Math.max(0,profile.radiusKm**2-impact**2));return sampleOutwardColumns(values,profile,0,ground/profile.radiusKm).map(v=>v+ground-x);}
    return sampleOutwardColumns(values,profile,h,radius?x/radius:0);
  };
  const a=tail(Math.abs(start)),b=tail(Math.abs(end));
  const raw=start>=0?a.map((v,i)=>v-b[i]):end<=0?b.map((v,i)=>v-a[i]):tail(0).map((v,i)=>2*v-a[i]-b[i]);
  return raw.map(v=>Math.max(0,v/scale));
}

const COLUMN_GLSL=`
uniform highp sampler2D u_atmosphereColumnField;
uniform float u_atmosphereColumnKeep;
uniform highp sampler2D u_atmosphereOzoneField;
uniform vec3 u_atmosphereOzoneKm;
uniform vec2 u_atmosphereOzoneLayerKm;
float atmosphereOzoneDensity(float height){
  float width=u_atmosphereOzoneLayerKm.y;
  if(width<=0.0) return 0.0;
  return exp(-abs(height-u_atmosphereOzoneLayerKm.x)/width);
}
vec2 atmosphereOutwardLookup(highp sampler2D field,float height,float mu){
  if(height>=u_atmosphereTopKm)return vec2(0);
  vec2 p=sqrt(clamp(vec2(mu,height/u_atmosphereTopKm),vec2(0),vec2(1)))*511.0;
  ivec2 lo=ivec2(floor(p)),hi=min(lo+ivec2(1),ivec2(511));vec2 f=fract(p);
  return mix(mix(texelFetch(field,lo,0).rg,texelFetch(field,ivec2(hi.x,lo.y),0).rg,f.x),
    mix(texelFetch(field,ivec2(lo.x,hi.y),0).rg,texelFetch(field,hi,0).rg,f.x),f.y);
}
vec3 atmosphereOutwardPacked(float height,float mu){
  if(height>=u_atmosphereTopKm)return vec3(0);
  vec2 p=sqrt(clamp(vec2(mu,height/u_atmosphereTopKm),vec2(0),vec2(1)))*511.0;
  ivec2 lo=ivec2(floor(p)),hi=min(lo+ivec2(1),ivec2(511));vec2 f=fract(p);
  return mix(mix(texelFetch(u_atmosphereOzoneField,lo,0).rgb,texelFetch(u_atmosphereOzoneField,ivec2(hi.x,lo.y),0).rgb,f.x),
    mix(texelFetch(u_atmosphereOzoneField,ivec2(lo.x,hi.y),0).rgb,texelFetch(u_atmosphereOzoneField,hi,0).rgb,f.x),f.y);
}
vec3 atmosphereCombinedTail(float impact,float x){
  // Rationalize altitude before lookup: subtracting a rounded body-sized radius
  // quantizes a short interval's height increment and corrupts its column mass.
  float radius=length(vec2(impact,x)),height=((impact-u_atmosphereRadiusKm)*(impact+u_atmosphereRadiusKm)+x*x)/(radius+u_atmosphereRadiusKm);
  vec3 packed;
  if(height<0.0){
    float ground=sqrt(max(0.0,u_atmosphereRadiusKm*u_atmosphereRadiusKm-impact*impact));
    float below=max(0.0,ground-x);
    packed=atmosphereOutwardPacked(0.0,ground/u_atmosphereRadiusKm)+vec3(below,below,below*atmosphereOzoneDensity(0.0));
  }else packed=atmosphereOutwardPacked(height,x/max(radius,1e-9));
  // A uniform scale, not a literal zero, keeps the admitted sampler from being
  // constant-folded out of the generator. The runtime value stays 0.
  packed.xy+=texelFetch(u_atmosphereColumnField,ivec2(0),0).rg*u_atmosphereColumnKeep;
  return packed;
}
vec2 atmosphereOutwardColumns(float height,float mu){return atmosphereOutwardPacked(height,mu).rg;}
float atmosphereOzoneOutward(float height,float mu){return atmosphereOutwardPacked(height,mu).b;}
float atmosphereOzoneTail(float impact,float x){return atmosphereCombinedTail(impact,x).z;}
float atmosphereOzoneColumnOnAxis(float impact,float x0,float x1){
  if(x1<=x0||u_atmosphereOzoneLayerKm.y<=0.0) return 0.0;
  float a=atmosphereOzoneTail(impact,abs(x0)),b=atmosphereOzoneTail(impact,abs(x1));
  float raw=x0>=0.0?a-b:x1<=0.0?b-a:2.0*atmosphereOzoneTail(impact,0.0)-a-b;
  return max(0.0,raw);
}
float atmosphereOzoneToTop(float impact,float begin){
  float outer=sqrt(max(0.0,(u_atmosphereRadiusKm+u_atmosphereTopKm)*(u_atmosphereRadiusKm+u_atmosphereTopKm)-impact*impact));
  return begin>outer?0.0:atmosphereOzoneColumnOnAxis(impact,begin,outer);
}
vec2 atmosphereColumnTail(float impact,float x){return atmosphereCombinedTail(impact,x).rg;}
vec3 atmosphereOpticalDepth(vec3 origin,vec3 direction,float distance){
  if(distance<=0.0)return vec3(0);
  vec3 p=atmosphereUnflatten(origin),d=atmosphereUnflatten(direction);
  float scale=length(d);vec3 axis=d/scale;
  float begin=dot(p,axis),end=begin+distance*scale;
  float impact=length(p-begin*axis);
  vec3 a=atmosphereCombinedTail(impact,abs(begin)),b=atmosphereCombinedTail(impact,abs(end));
  vec3 columns=begin>=0.0?a-b:end<=0.0?b-a:2.0*atmosphereCombinedTail(impact,0.0)-a-b;
  columns=max(vec3(0),columns/scale);
  return u_atmosphereRayleighKm*columns.x+u_atmosphereAerosolKm*columns.y+u_atmosphereOzoneKm*columns.z;
}
// All view samples share one physical ray. Cache only its invariant geometry
// and tails; retain the generic evaluator for direct comparison.
struct AtmosphereColumnRay { float scale; float begin; float impact; vec3 initial; vec3 twiceClosest; };
AtmosphereColumnRay atmosphereColumnRay(vec3 origin,vec3 direction,float maxDistance){
  vec3 p=atmosphereUnflatten(origin),d=atmosphereUnflatten(direction);
  float scale=length(d);vec3 axis=d/scale;
  float begin=dot(p,axis),end=begin+maxDistance*scale;
  float impact=length(p-begin*axis);
  vec3 initial=atmosphereCombinedTail(impact,abs(begin));
  vec3 twiceClosest=begin<0.0&&end>0.0?2.0*atmosphereCombinedTail(impact,0.0):vec3(0);
  return AtmosphereColumnRay(scale,begin,impact,initial,twiceClosest);
}
vec3 atmosphereCachedOpticalDepth(AtmosphereColumnRay ray,float distance){
  if(distance<=0.0)return vec3(0);
  float end=ray.begin+distance*ray.scale;
  vec3 b=atmosphereCombinedTail(ray.impact,abs(end));
  vec3 columns=ray.begin>=0.0?ray.initial-b:end<=0.0?b-ray.initial:ray.twiceClosest-ray.initial-b;
  columns=max(vec3(0),columns/ray.scale);
  return u_atmosphereRayleighKm*columns.x+u_atmosphereAerosolKm*columns.y+u_atmosphereOzoneKm*columns.z;
}
// Called after public Sun visibility or prepared lit support, and a positive
// outer-exit check (conditioning may intentionally evaluate a dark centroid).
// At that exit the outward column is zero: retain the initial tail and, for
// an inward unblocked ray, the two outward halves through closest approach.
vec3 atmosphereSunOpticalDepthToTop(vec3 origin,vec3 direction){
  vec3 p=atmosphereUnflatten(origin),d=atmosphereUnflatten(direction);
  float scale=length(d);vec3 axis=d/scale;
  float begin=dot(p,axis);
  float impact=length(p-begin*axis);
  vec3 initial=atmosphereCombinedTail(impact,abs(begin));
  vec3 closest=begin<0.0?atmosphereCombinedTail(impact,0.0):vec3(0);
  vec3 columns=begin>=0.0?initial:2.0*closest-initial;
  columns=max(vec3(0),columns/scale);
  // Ozone keeps the outer TOA sample; interpolated table height at the top is
  // not identically zero the way a support-clipped molecular column is.
  return u_atmosphereRayleighKm*columns.x+u_atmosphereAerosolKm*columns.y
    +u_atmosphereOzoneKm*(atmosphereOzoneToTop(impact,begin)/scale);
}
`;

/** Guarded call routing only: no node, phase, density, shadow or composition change.
 * @param {string} source */
export function cacheAtmosphereViewRay(source){
  const edits=[
    ['vec3 atmosphereScatteredMonotonic(vec3 origin,vec3 direction,vec2 interval){',
     'vec3 atmosphereScatteredMonotonic(vec3 origin,vec3 direction,vec2 interval,AtmosphereColumnRay columnRay){'],
    ['exp(-atmosphereOpticalDepth(origin,direction,distance))*atmosphereLitSunTransmission(p)',
     'exp(-atmosphereCachedOpticalDepth(columnRay,distance))*atmosphereLitSunTransmission(p)'],
    ['vec3 atmosphereScatteredSegment(vec3 origin,vec3 direction,vec2 interval){',
     'vec3 atmosphereScatteredSegment(vec3 origin,vec3 direction,vec2 interval,AtmosphereColumnRay columnRay){'],
    ...['vec2(cuts[i],cuts[i+1])'].map(interval=>[
      `atmosphereScatteredMonotonic(origin,direction,${interval})`,
      `atmosphereScatteredMonotonic(origin,direction,${interval},columnRay)`]),
    ['  result.transmittance=exp(-atmosphereOpticalDepth(entry,ray,distance));',
     '  AtmosphereColumnRay columnRay=atmosphereColumnRay(entry,ray,distance);\n  result.transmittance=exp(-atmosphereCachedOpticalDepth(columnRay,distance));'],
    ['atmosphereScatteredSegment(entry,ray,interval)',
     'atmosphereScatteredSegment(entry,ray,interval,columnRay)'],
  ];
  for(const [before,after]of edits){
    if(source.split(before).length!==2)throw new Error('Atmospheric view-ray cache binding changed');
    source=source.replace(before,after);
  }
  return source;
}

/** Keep public visibility and private lit support separate; replace only their
 * separately guarded depth calls, retaining each positive outer-exit check.
 * @param {string} source */
export function specializeAtmosphereSunDepth(source){
  for(const point of ['point','samplePoint']){
    const before=`exp(-atmosphereOpticalDepth(${point},light,sky.y))`;
    if(source.split(before).length!==2)throw new Error('Atmospheric Sun-to-top binding changed');
    source=source.replace(before,`exp(-atmosphereSunOpticalDepthToTop(${point},light))`);
  }
  return source;
}

// Fail closed if the reference decomposition changes. All remaining expressions
// are retained verbatim except the guarded depth-call routing above.
const start=ATMOSPHERE_GLSL.indexOf('float atmosphereColumnSegment('),end=ATMOSPHERE_GLSL.indexOf('vec3 atmosphereSunTransmission(');
if(start<0||end<=start||ATMOSPHERE_GLSL.indexOf('float atmosphereColumnSegment(',start+1)!==-1)throw new Error('Atmospheric column reference boundary changed');
export const ATMOSPHERE_RENDER_GLSL=specializeAtmosphereSunDepth(cacheAtmosphereViewRay(ATMOSPHERE_GLSL.slice(0,start)+COLUMN_GLSL+ATMOSPHERE_GLSL.slice(end)));
export const ATMOSPHERE_RENDER_FS=ATMOSPHERE_FS.replace(ATMOSPHERE_GLSL,ATMOSPHERE_RENDER_GLSL);

const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
/** Strict same-origin immutable columns. The caller owns the returned array.
 * @param {string} body
 * @param {{signal?:AbortSignal,fetcher?:typeof fetch,timeoutMs?:number}} [options] */
export async function loadAtmosphereColumns(body,{signal,fetcher=fetch,timeoutMs=20000}={}){
  const reference=ATMOSPHERE_COLUMN_FIELDS[body],profile=getAtmosphereProfile(body);
  if(!reference||!profile||reference.dimensions?.join(',')!=='512,512,2'||reference.bytes!==ATMOSPHERE_COLUMN_BYTES
    ||reference.path!==`../data/optics/${body.toLowerCase()}-columns-v1.f32`||reference.format!=='little-endian-rg32f-outward-columns-v1'
    ||reference.profile_encoding!==ATMOSPHERE_PROFILE_ENCODING)throw new Error('Atmospheric column field is not admitted');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw new RangeError('Invalid column deadline');
  const controller=new AbortController();let reader,rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
  const abort=()=>{controller.abort();void reader?.cancel().catch(()=>{});rejectAbort(new DOMException('Atmospheric columns cancelled or deadline exceeded','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,timeoutMs);
  try{
    if(signal?.aborted)abort();
    if(await Promise.race([hash(new TextEncoder().encode(serializeAtmosphereProfile(profile))),aborted])!==reference.profile_sha256)throw new Error('Atmospheric column profile changed');
    const response=await Promise.race([fetcher(new URL(reference.path,import.meta.url),{signal:controller.signal,credentials:'same-origin',cache:'force-cache'}),aborted]);
    if(!response.ok||!response.body)throw new Error('Atmospheric column transfer unavailable');
    reader=response.body.getReader();const bytes=new Uint8Array(reference.bytes);let length=0;
    for(;;){const part=await Promise.race([reader.read(),aborted]);if(part.done)break;if(length+part.value.byteLength>bytes.length)throw new Error('Atmospheric columns exceeded byte budget');bytes.set(part.value,length);length+=part.value.byteLength;}
    if(length!==bytes.length||await Promise.race([hash(bytes),aborted])!==reference.sha256)throw new Error('Atmospheric column size or hash mismatch');
    const view=new DataView(bytes.buffer),values=new Float32Array(bytes.length/4);
    for(let i=0;i<values.length;i++){const v=view.getFloat32(i*4,true);if(!Number.isFinite(v)||v<0||v>2000)throw new Error('Invalid density column');values[i]=v;}
    if(controller.signal.aborted)throw new DOMException('Atmospheric columns cancelled','AbortError');
    return {values,width:512,height:512};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
}

/** One failure promptly cancels the companion transfer; caller cancellation owns both.
 * @param {string} body
 * @param {{signal?:AbortSignal,incidentLoader?:typeof loadIncidentField,columnLoader?:typeof loadAtmosphereColumns}} [options] */
export async function loadAtmosphereFields(body,{signal,incidentLoader=loadIncidentField,columnLoader=loadAtmosphereColumns}={}){
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  try{
    const result=await Promise.all([incidentLoader(body,{signal:controller.signal}),columnLoader(body,{signal:controller.signal})]);
    if(controller.signal.aborted)throw new DOMException('Optical field demand cancelled','AbortError');
    return result;
  }catch(error){controller.abort();throw error;}
  finally{signal?.removeEventListener('abort',abort);}
}
