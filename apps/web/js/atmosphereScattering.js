// Camera-specific bounded scattering only. Scientific profiles and the original
// transfer integrator remain authoritative; interpolation admission is separate.
import {ATMOSPHERE_RENDER_GLSL,ATMOSPHERE_RENDER_FS} from './atmosphereColumnField.js';
import {ATMOSPHERE_UNIFORMS,setAtmosphereUniforms} from './atmosphereOptics.js';

export const SCATTERING_MAX_EVALUATIONS=65536;
export const SCATTERING_MAX_RESIDENT=2;
export const SCATTERING_MAX_BYTES=SCATTERING_MAX_EVALUATIONS*4*4;

/** Recompute allocation limits from the dimensions, not caller summaries.
 * @param {ScatteringPlan} plan */
export function validScatteringPlanBudget(plan){
  if(!plan||plan.status!=='ready'||!Array.isArray(plan.surfaceSize)||!Array.isArray(plan.limbSize)
    ||plan.surfaceSize.length!==3||plan.limbSize.length!==2
    ||![...plan.surfaceSize,...plan.limbSize].every(v=>Number.isInteger(v)&&v>=1)
    ||![1,9,17].includes(plan.surfaceSize[2])||plan.surfaceSize[0]<2||plan.surfaceSize[1]<2||plan.limbSize.some(v=>v<2))return false;
  const count=plan.surfaceSize.reduce((a,b)=>a*b,1)+plan.limbSize[0]*plan.limbSize[1];
  return Number.isSafeInteger(count)&&count<=SCATTERING_MAX_EVALUATIONS&&count===plan.evaluations&&count*16===plan.bytes;
}
const PI=Math.PI;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=v=>{const r=Math.hypot(...v);return v.map(x=>x/r);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
/** @param {string} reason @returns {{status:'unavailable',reason:string}} */
const unavailable=reason=>({status:'unavailable',reason});

/** @typedef {import('./atmosphereOptics.js').AtmosphereProfile} AtmosphereProfile */
/** @typedef {{status:'ready',singleScale:boolean,body:string,radiusKm:number,topKm:number,polarRatio:number,cameraBodyKm:number[],cameraRadius:number,axis:number[],u:number[],v:number[],heightRange:number[],surfaceSize:number[],limbSize:number[],evaluations:number,bytes:number}} ScatteringPlan */

/** Camera-domain admission; physical radial terrain bounds are NOT optical heights.
 * @param {AtmosphereProfile} profile
 * @param {{cameraBodyKm:readonly number[],sunDirectionBody:readonly number[],polarRatio:number,referenceRadiusKm?:number,minRadiusKm?:number,maxRadiusKm?:number}} options
 * @returns {ScatteringPlan|{status:'unavailable',reason:string}} */
export function planAtmosphereScattering(profile,options){
  if(!profile||!['Earth','Mars'].includes(profile.body)||!options||!finiteVector(options.cameraBodyKm))return unavailable('Unsupported scattering profile or camera');
  const {radiusKm:R,topKm:T}=profile,q=options.polarRatio;
  if(![R,T,q].every(Number.isFinite)||R<=0||T<=0||q<.5||q>1)return unavailable('Unsupported scattering radius or polar ratio');
  const referenceRadius=options.referenceRadiusKm??R;
  if(!Number.isFinite(referenceRadius)||referenceRadius<=0)return unavailable('Invalid physical reference radius');
  const terrain=options.minRadiusKm!==undefined||options.maxRadiusKm!==undefined;
  const min=terrain?options.minRadiusKm:R,max=terrain?options.maxRadiusKm:R;
  if(!Number.isFinite(min)||!Number.isFinite(max)||min<=0||max<min)return unavailable('Invalid physical terrain bounds');
  // The smooth body's catalogue datum can differ from the optical profile datum
  // (Earth by 3 m). Retain that physical endpoint in its single-height plane.
  // A radial DEM's transformed norm is in [rMin,rMax/q] at every latitude; include
  // the smooth catalogue datum so loading/toggling relief cannot change the grid.
  const datum=referenceRadius-R;
  const heights=terrain?[Math.min(0,datum,min-R),Math.max(0,datum,max/q-R)]:[datum,datum];
  if(heights[0]<-R*.1||heights[1]>T)return unavailable('Terrain is outside the scattering height envelope');
  const c=[options.cameraBodyKm[0],options.cameraBodyKm[1],options.cameraBodyKm[2]/q],cameraRadius=Math.hypot(...c);
  // All uniforms are binary32. Two enclosing radii bound a through-body path;
  // dividing by q bounds the direction's unflattened metric. Its square also
  // bounds the generator's camera/impact squares and shadow discriminant terms.
  // Reject overflow before allocating, rather than producing invalid field texels.
  const arithmeticExtent=2*Math.max(cameraRadius,R+T,R+heights[1])/q;
  if(![...c,cameraRadius,R,T,...heights,arithmeticExtent*arithmeticExtent].every(value=>Number.isFinite(Math.fround(value))))return unavailable('Scattering camera exceeds the binary32 precision envelope');
  // A metric margin prevents binary32 endpoint reconstruction at the domain edge
  // from changing the outside/inside ray topology. No out-of-domain clamping.
  if(cameraRadius<=Math.max(R+T,R+heights[1])+.01)return unavailable('Scattering field requires an outside-atmosphere camera');
  const axis=unit(c),singleScale=profile.rayleighScaleHeightKm===profile.aerosolScaleHeightKm;
  if(!finiteVector(options.sunDirectionBody)||Math.hypot(...options.sunDirectionBody)===0)return unavailable('Finite solar direction required');
  const light=unit([options.sunDirectionBody[0],options.sunDirectionBody[1],options.sunDirectionBody[2]/q]);
  const projected=light.map((x,i)=>x-axis[i]*dot(light,axis));
  const u=singleScale&&Math.hypot(...projected)>1e-8?unit(projected):unit(cross(Math.abs(axis[2])<.9?[0,0,1]:[1,0,0],axis)),v=cross(axis,u);
  const volume=heights[0]!==heights[1];
  // Normalizing a visible raster triangle's chord can put its endpoint just
  // beyond closest approach even on the smooth Earth sphere. Both signs are
  // required independently of whether a radial DEM is present.
  const surfaceSize=volume?(singleScale?[80,41,17]:[128,49,9]):[128,193,1],limbSize=[128,64];
  const evaluations=surfaceSize.reduce((a,b)=>a*b,1)+limbSize[0]*limbSize[1];
  if(evaluations>SCATTERING_MAX_EVALUATIONS)return unavailable('Scattering evaluation budget exceeded');
  return {status:'ready',singleScale,body:profile.body,radiusKm:R,topKm:T,polarRatio:q,cameraBodyKm:[...options.cameraBodyKm],cameraRadius,axis,u,v,heightRange:heights,surfaceSize,limbSize,evaluations,bytes:evaluations*16};
}

/** Exact signed knots; zero and closest approach are explicit grid nodes.
 * @param {ScatteringPlan} plan @param {number} y */
export function scatteringMuAt(plan,y){
  const count=plan.surfaceSize[1];
  const signed=2*y/(count-1)-1;return Math.sin(PI*.5*signed*Math.abs(signed));
}
/** @param {ScatteringPlan} plan @param {number} z @param {number} [mu] */
export function scatteringHeightAt(plan,z,mu=0){
  if(plan.surfaceSize[2]===1)return plan.heightRange[0];
  const last=plan.surfaceSize[2]-1,halfGrid=last/2;
  if(plan.singleScale){
    const base=plan.heightRange[0]<0?halfGrid:0,span=last-base;
    if(z<base)return plan.heightRange[0]*(1-z/base)**2;
    const critical=Math.min(plan.heightRange[1],plan.radiusKm*(1/Math.sqrt(Math.max(1e-15,1-mu*mu))-1));
    const t=(z-base)/span;
    return t<=.5?critical*(2*t)**2:critical+(plan.heightRange[1]-critical)*(2*t-1)**2;
  }
  if(plan.heightRange[0]>=0)return plan.heightRange[1]*(z/last)**2;
  if(plan.heightRange[1]<=0)return plan.heightRange[0]*(1-z/last)**2;
  const signed=z/halfGrid-1;return signed<0?plan.heightRange[0]*signed*signed:plan.heightRange[1]*signed*signed;
}
/** @param {ScatteringPlan} plan @param {number} azimuth @param {number} impact */
function rayAtImpact(plan,azimuth,impact){
  if(!Number.isFinite(azimuth)||!Number.isFinite(impact)||impact<0||impact>=plan.cameraRadius)throw new RangeError('Scattering ray outside camera domain');
  const s=impact/plan.cameraRadius,c=-Math.sqrt(1-s*s);
  const transverse=unit(plan.u.map((x,i)=>x*Math.cos(azimuth)+plan.v[i]*Math.sin(azimuth)));
  const d=plan.axis.map((x,i)=>x*c+s*transverse[i]);
  const physical=[d[0],d[1],d[2]*plan.polarRatio],jacobian=Math.hypot(...physical);
  return {transformedDirection:d,direction:physical.map(x=>x/jacobian),jacobian};
}
/** Exact original-integrator input for a surface field node or arbitrary query.
 * @param {ScatteringPlan} plan @param {number} azimuth @param {number} mu @param {number} heightKm */
export function scatteringSurfaceRay(plan,azimuth,mu,heightKm){
  if(![mu,heightKm].every(Number.isFinite)||Math.abs(mu)>1||heightKm<plan.heightRange[0]||heightKm>plan.heightRange[1])throw new RangeError('Surface scattering coordinate outside domain');
  const r=plan.radiusKm+heightKm,impact=r*Math.sqrt(Math.max(0,1-mu*mu));
  const ray=rayAtImpact(plan,azimuth,impact),distance=(Math.sqrt(plan.cameraRadius**2-impact**2)+r*mu)*ray.jacobian;
  return {origin:[...plan.cameraBodyKm],direction:ray.direction,maxDistance:distance,surface:plan.cameraBodyKm.map((x,i)=>x+ray.direction[i]*distance)};
}
/** @param {ScatteringPlan} plan @param {number} azimuth @param {number} impactHeightKm */
export function scatteringLimbRay(plan,azimuth,impactHeightKm){
  if(!Number.isFinite(impactHeightKm)||impactHeightKm<0||impactHeightKm>plan.topKm)throw new RangeError('Limb scattering coordinate outside domain');
  return {origin:[...plan.cameraBodyKm],direction:rayAtImpact(plan,azimuth,plan.radiusKm+impactHeightKm).direction,maxDistance:1e20};
}
/** @param {ScatteringPlan} plan @param {number[]} transformedDirection @param {number} [power] */
function rayAzimuth(plan,transformedDirection,power=3){
  const x=dot(transformedDirection,plan.u),y=dot(transformedDirection,plan.v);
  if(Math.hypot(x,y)<1e-12)return 0;
  if(!plan.singleScale)return ((Math.atan2(y,x)/(2*PI))%1+1)%1;
  // Select a quadrant before atan; retain a tiny angle to either bounding axis.
  const quadrant=x>=0?(y>=0?0:3):(y>=0?1:2);
  const a=quadrant%2===0?Math.abs(x):Math.abs(y),b=quadrant%2===0?Math.abs(y):Math.abs(x);
  const near=Math.atan2(Math.min(a,b),Math.max(a,b))*2/PI;
  const left=near**(1/power),right=(1-near)**(1/power),fraction=left/(left+right);
  return .25*(quadrant+(a>=b?fraction:1-fraction));
}
/** Float64 coordinate oracle. Out-of-domain inputs return null, never edge samples.
 * @param {ScatteringPlan} plan @param {readonly number[]} surface */
export function scatteringSurfaceCoordinates(plan,surface){
  if(!finiteVector(surface))return null;
  const p=[surface[0],surface[1],surface[2]/plan.polarRatio],r=Math.hypot(...p);
  const delta=surface.map((x,i)=>x-plan.cameraBodyKm[i]),d=unit([delta[0],delta[1],delta[2]/plan.polarRatio]);
  if(!(r>0)||!d.every(Number.isFinite))return null;
  const h=r-plan.radiusKm,mu=dot(p,d)/r,volume=plan.surfaceSize[2]>1;
  // CPU reference round trips admit only binary64 arithmetic residue. GPU uses
  // an explicit binary32 envelope; neither is a physical-domain extension.
  const eps=1e-8;
  if(h<plan.heightRange[0]-eps||h>plan.heightRange[1]+eps||Math.abs(mu)>1+eps)return null;
  const clipped=Math.max(-1,Math.min(1,mu));
  const y=(Math.sign(clipped)*Math.sqrt(Math.asin(Math.abs(clipped))*2/PI)+1)*(plan.surfaceSize[1]-1)/2;
  const last=plan.surfaceSize[2]-1,halfGrid=last/2;
  let z=!volume?0:plan.heightRange[0]>=0?last*Math.sqrt(Math.max(0,h/plan.heightRange[1]))
    :plan.heightRange[1]<=0?last*(1-Math.sqrt(Math.max(0,h/plan.heightRange[0])))
    :h<0?halfGrid*(1-Math.sqrt(Math.max(0,h/plan.heightRange[0]))):h>0?halfGrid*(1+Math.sqrt(h/plan.heightRange[1])):halfGrid;
  if(volume&&plan.singleScale&&h>=0){
    const base=plan.heightRange[0]<0?halfGrid:0,span=last-base;
    const critical=Math.min(plan.heightRange[1],plan.radiusKm*(1/Math.sqrt(Math.max(1e-15,1-mu*mu))-1));
    z=critical>0&&h<=critical?base+span*.5*Math.sqrt(h/critical)
      :plan.heightRange[1]>critical?base+span*.5+span*.5*Math.sqrt(Math.max(0,(h-critical)/(plan.heightRange[1]-critical))):last;
  }
  return [rayAzimuth(plan,d,5)*plan.surfaceSize[0],y,Math.max(0,Math.min(plan.surfaceSize[2]-1,z))];
}
/** @param {ScatteringPlan} plan @param {readonly number[]} direction */
export function scatteringLimbCoordinates(plan,direction){
  if(!finiteVector(direction))return null;
  const d=unit([direction[0],direction[1],direction[2]/plan.polarRatio]);
  if(!d.every(Number.isFinite)||dot(d,plan.axis)>=0)return null;
  const c=plan.axis.map(x=>x*plan.cameraRadius),a=dot(c,d),impact=Math.hypot(...c.map((x,i)=>x-a*d[i]));
  const h=impact-plan.radiusKm;if(h< -1e-8||h>plan.topKm+1e-8)return null;
  return [rayAzimuth(plan,d)*plan.limbSize[0],(plan.singleScale?Math.cbrt(Math.max(0,h)/plan.topKm):Math.sqrt(Math.max(0,h)/plan.topKm))*(plan.limbSize[1]-1)];
}

export const SCATTERING_UNIFORMS=['u_scatteringReady','u_scatteringSurface','u_scatteringLimb','u_scatteringAxis','u_scatteringU','u_scatteringV','u_scatteringCameraRadius','u_scatteringHeightRange','u_scatteringSurfaceSize','u_scatteringLimbSize'];

const shadowBoundary=ATMOSPHERE_RENDER_GLSL.indexOf('// Intersection with the planet');
if(shadowBoundary<0||ATMOSPHERE_RENDER_GLSL.indexOf('// Intersection with the planet',shadowBoundary+1)!==-1)throw new Error('Scattering light-helper boundary changed');
const scatteringBoundary=ATMOSPHERE_RENDER_GLSL.indexOf('vec3 atmosphereScatteredMonotonic(',shadowBoundary);
if(scatteringBoundary<0||ATMOSPHERE_RENDER_GLSL.indexOf('vec3 atmosphereScatteredMonotonic(',scatteringBoundary+1)!==-1)throw new Error('Scattering integral boundary changed');
export const ATMOSPHERE_LIGHT_GLSL=ATMOSPHERE_RENDER_GLSL.slice(0,scatteringBoundary);

// Normalize the prepass by analytically delimited, view-attenuated lit mass.
// The residual is interpolated; phase, physical endpoint, ground and shadow
// support are evaluated at the actual consumer ray. No final-fragment quadrature.
const SOURCE_WEIGHT_GLSL=`
vec2 scatteringViewColumns(AtmosphereColumnRay ray,float distance){
  if(distance<=0.0)return vec2(0);
  float end=ray.begin+distance*ray.scale;
  vec2 tail=atmosphereColumnTail(ray.impact,abs(end));
  vec2 initial=ray.initial.xy,closest=ray.twiceClosest.xy;
  vec2 raw=ray.begin>=0.0?initial-tail:end<=0.0?tail-initial:closest-initial-tail;
  return max(vec2(0),raw/ray.scale);
}
vec3 scatteringTransmissionMass(AtmosphereColumnRay ray,vec2 interval){
  if(interval.y<=interval.x)return vec3(0);
  vec3 a=atmosphereCachedOpticalDepth(ray,interval.x),b=atmosphereCachedOpticalDepth(ray,interval.y),x=b-a;
  // A non-monotone cached optical depth is not a valid mass normalization.
  if(any(lessThan(x,vec3(0))))return vec3(-1);
  vec3 series=x*(1.0+x*(-.5+x*(1.0/6.0+x*(-1.0/24.0+x/120.0))));
  return exp(-a)*mix(1.0-exp(-x),series,lessThan(x,vec3(.1)));
}
vec2 scatteringRadialMoment(float radius){
  float h=radius-u_atmosphereRadiusKm;
  if(h<=0.0)return vec2(u_atmosphereRadiusKm*h+.5*h*h);
  vec2 H=u_atmosphereDensityScaleKm,e=exp(-h/H);
  return u_atmosphereRadiusKm*H*(1.0-e)+H*H*(1.0-e*(1.0+h/H));
}
vec2 scatteringReferenceMoments(AtmosphereColumnRay columnRay,vec2 interval){
  if(interval.y<=interval.x)return vec2(0);
  float column=max(0.0,scatteringViewColumns(columnRay,interval.y).x-scatteringViewColumns(columnRay,interval.x).x);
  float a=columnRay.begin+interval.x*columnRay.scale,b=columnRay.begin+interval.y*columnRay.scale;
  float radial=scatteringRadialMoment(length(vec2(columnRay.impact,b))).x-scatteringRadialMoment(length(vec2(columnRay.impact,a))).x;
  return vec2(column,radial/(columnRay.scale*columnRay.scale)-columnRay.begin/columnRay.scale*column);
}
// Fixed ray partitions preserve continuity as a shadow gap opens or closes.
// Each partition combines all its lit support before choosing one centroid.
vec3 scatteringReferencePartition(vec3 entry,vec3 ray,AtmosphereColumnRay columnRay,
    vec2 band,vec2 shadow,vec3 ratio){
  if(band.y<=band.x)return vec3(0);
  vec3 mass;vec2 moments;
  if(shadow.y<=shadow.x||shadow.y<=band.x||shadow.x>=band.y){
    mass=scatteringTransmissionMass(columnRay,band);
    moments=scatteringReferenceMoments(columnRay,band);
  }else{
    vec2 first=vec2(band.x,max(band.x,shadow.x)),last=vec2(min(band.y,shadow.y),band.y);
    vec3 a=scatteringTransmissionMass(columnRay,first),b=scatteringTransmissionMass(columnRay,last);
    if(any(lessThan(a,vec3(0)))||any(lessThan(b,vec3(0))))return vec3(-1);
    mass=a+b;moments=scatteringReferenceMoments(columnRay,first)+scatteringReferenceMoments(columnRay,last);
  }
  if(any(lessThan(mass,vec3(0))))return vec3(-1);
  float centerT=moments.x>1e-8?moments.y/moments.x:(band.x+band.y)*.5;
  centerT=clamp(centerT,band.x,band.y);
  // Opacity is a positive conditioning scale, including for a dark-gap centroid.
  vec3 solar=exp(-atmosphereSunOpticalDepthToTop(entry+ray*centerT,normalize(u_atmosphereSunDirection)));
  return ratio*mass*solar;
}
vec3 scatteringReferenceWeightPrepared(AtmospherePath path){
  if(u_atmosphereEnabled==0)return vec3(0);
  vec3 entry=path.entry,ray=path.ray;float distance=path.distance;
  if(distance<=0.0)return vec3(0);
  AtmosphereColumnRay columnRay=atmosphereColumnRay(entry,ray,distance);
  float mu=clamp(dot(ray,normalize(u_atmosphereSunDirection)),-1.0,1.0),g=u_atmosphereG;
  float phaseR=3.0*(1.0+mu*mu)/(16.0*ATM_PI);
  float phaseA=(1.0-g*g)/(4.0*ATM_PI*pow(1.0+g*g-2.0*g*mu,1.5));
  vec2 shadow=path.shadow;
  // Use fixed density pieces: ground entry, metric closest, and ground exit.
  // Each aggregates its lit support before one opacity evaluation. At ground
  // tangency the two interior pieces shrink to zero, preserving continuity.
  if(u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y){
    vec3 metricEntry=atmosphereUnflatten(entry),metricRay=atmosphereUnflatten(ray);
    float closest=clamp(-dot(metricEntry,metricRay)/dot(metricRay,metricRay),0.0,distance);
    vec3 beta=u_atmosphereRayleighKm+u_atmosphereAerosolKm;
    vec3 ratio=(u_atmosphereRayleighKm*phaseR+u_atmosphereAerosolKm*u_atmosphereAerosolSSA*phaseA)/max(beta,vec3(1e-30));
    vec2 ground=atmosphereRayInterval(entry,ray,u_atmosphereRadiusKm);
    if(ground.y<ground.x)ground=vec2(closest);
    float cuts[5]=float[5](0.0,clamp(ground.x,0.0,distance),closest,
      clamp(ground.y,0.0,distance),distance);
    vec3 source=vec3(0);
    for(int i=0;i<4;i++){
      vec3 part=scatteringReferencePartition(entry,ray,columnRay,vec2(cuts[i],cuts[i+1]),shadow,ratio);
      if(any(lessThan(part,vec3(0))))return vec3(-1);
      source+=part;
    }
    return source*ATM_PI*u_atmosphereSolarScale*u_atmosphereExposure;
  }
  vec3 mass;float litLength;
  if(shadow.y<=shadow.x||shadow.y<=0.0||shadow.x>=distance){
    mass=scatteringTransmissionMass(columnRay,vec2(0,distance));litLength=distance;
  }else{
    float first=max(0.0,shadow.x),last=min(distance,shadow.y);
    vec3 a=scatteringTransmissionMass(columnRay,vec2(0,first)),b=scatteringTransmissionMass(columnRay,vec2(last,distance));
    if(any(lessThan(a,vec3(0)))||any(lessThan(b,vec3(0))))return vec3(-1);
    mass=a+b;litLength=first+distance-last;
  }
  if(any(lessThan(mass,vec3(0))))return vec3(-1);
  // Equal scale heights give an exact constant source/extinction ratio (Mars).
  // Otherwise use the per-channel component maximum. No residual clamp hides
  // cached-column or quadrature error; the full independent domain admits it.
  vec3 q=max(vec3(phaseR),u_atmosphereAerosolSSA*phaseA);
  if(u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y){
    vec3 beta=u_atmosphereRayleighKm+u_atmosphereAerosolKm;
    q=(u_atmosphereRayleighKm*phaseR+u_atmosphereAerosolKm*u_atmosphereAerosolSSA*phaseA)/max(beta,vec3(1e-30));
  }
  // The cached extinction omits densities above 12H; the source does not.
  // A conservative omitted-source bound prevents zero mass at nonzero source.
  vec3 tail=vec3(0);
  if(12.0*u_atmosphereDensityScaleKm.x<u_atmosphereTopKm)tail+=u_atmosphereRayleighKm*phaseR;
  if(12.0*u_atmosphereDensityScaleKm.y<u_atmosphereTopKm)tail+=u_atmosphereAerosolKm*u_atmosphereAerosolSSA*phaseA;
  return (q*mass+tail*exp(-12.0)*litLength)*ATM_PI*u_atmosphereSolarScale*u_atmosphereExposure;
}
vec3 scatteringReferenceWeight(vec3 origin,vec3 direction,float maximum){
  return scatteringReferenceWeightPrepared(atmospherePrepareObserver(origin,direction,maximum));
}
`;

const COORDINATES_GLSL=`
uniform int u_scatteringReady;
uniform vec3 u_scatteringAxis,u_scatteringU,u_scatteringV;
uniform float u_scatteringCameraRadius;
uniform vec2 u_scatteringHeightRange;
uniform ivec3 u_scatteringSurfaceSize;
uniform ivec2 u_scatteringLimbSize;
vec2 scatteringAzimuthComponentsAt(float u,bool surface){
  if(u_atmosphereDensityScaleKm.x!=u_atmosphereDensityScaleKm.y){
    float azimuth=2.0*ATM_PI*u;return vec2(cos(azimuth),sin(azimuth));
  }
  float x=4.0*u,t=fract(x),near=min(t,1.0-t),far=1.0-near;
  float a=near*near*near,b=far*far*far;
  if(surface){a*=near*near;b*=far*far;}
  float angle=.5*ATM_PI*a/(a+b);
  vec2 local=vec2(cos(angle),sin(angle));
  if(t>.5)local=local.yx;
  // Rotate a small local angle; no trig residue is introduced at cardinal axes.
  int quadrant=int(floor(x))%4;
  return quadrant==0?local:quadrant==1?vec2(-local.y,local.x)
    :quadrant==2?-local:vec2(local.y,-local.x);
}
float scatteringMu(float y){
  float s=2.0*y/float(u_scatteringSurfaceSize.y-1)-1.0;return sin(ATM_PI*.5*s*abs(s));
}
float scatteringHeight(float z,float mu){
  if(u_scatteringSurfaceSize.z==1)return u_scatteringHeightRange.x;
  float last=float(u_scatteringSurfaceSize.z-1),halfGrid=last*.5;
  if(u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y){
    float base=u_scatteringHeightRange.x<0.0?halfGrid:0.0,span=last-base;
    if(z<base)return u_scatteringHeightRange.x*pow(1.0-z/base,2.0);
    float critical=min(u_scatteringHeightRange.y,u_atmosphereRadiusKm*(inversesqrt(max(1e-15,1.0-mu*mu))-1.0));
    float t=(z-base)/span;
    return t<=.5?critical*pow(2.0*t,2.0):critical+(u_scatteringHeightRange.y-critical)*pow(2.0*t-1.0,2.0);
  }
  if(u_scatteringHeightRange.x>=0.0)return u_scatteringHeightRange.y*pow(z/last,2.0);
  if(u_scatteringHeightRange.y<=0.0)return u_scatteringHeightRange.x*pow(1.0-z/last,2.0);
  float s=z/halfGrid-1.0;return (s<0.0?u_scatteringHeightRange.x:u_scatteringHeightRange.y)*s*s;
}
vec3 scatteringRay(vec2 azimuthComponents,float impact,out float jacobian){
  float s=impact/u_scatteringCameraRadius;
  // Preserve the prescribed impact even if highp sin/cos approximations do not
  // satisfy the unit-circle identity. Final ray normalization cannot repair a
  // transverse amplitude error: it changes the cone angle and physical height.
  vec3 transverse=normalize(azimuthComponents.x*u_scatteringU+azimuthComponents.y*u_scatteringV);
  vec3 d=-sqrt(max(0.0,1.0-s*s))*u_scatteringAxis+s*transverse;
  d.z*=u_atmospherePolarRatio;jacobian=length(d);return d/jacobian;
}
// Algebraically the same atlas node, formed entirely at body-scale distances.
// The actual uploaded camera then determines one shared S/W observer segment.
vec3 scatteringSurfacePoint(vec2 azimuthComponents,float radius,float mu){
  float impact=radius*sqrt(max(0.0,1.0-mu*mu));
  float s=impact/u_scatteringCameraRadius,c=sqrt(max(0.0,1.0-s*s));
  vec3 transverse=normalize(azimuthComponents.x*u_scatteringU+azimuthComponents.y*u_scatteringV);
  vec3 closest=impact*(s*u_scatteringAxis+c*transverse);
  vec3 point=closest+(radius*mu)*(-c*u_scatteringAxis+s*transverse);
  point.z*=u_atmospherePolarRatio;return point;
}
float scatteringAzimuth(vec3 d,bool surface){
  vec2 p=vec2(dot(d,u_scatteringU),dot(d,u_scatteringV));
  if(dot(p,p)<1e-16)return 0.0;
  if(u_atmosphereDensityScaleKm.x!=u_atmosphereDensityScaleKm.y)return fract(atan(p.y,p.x)/(2.0*ATM_PI)+1.0);
  // A global atan followed by fract loses tiny offsets near a quadrant axis.
  // Apply the inverse power to a local small angle before restoring quadrant.
  int quadrant=p.x>=0.0?(p.y>=0.0?0:3):(p.y>=0.0?1:2);
  vec2 local=quadrant==0||quadrant==2?abs(p):abs(p.yx);
  float near=atan(min(local.x,local.y),max(local.x,local.y))*2.0/ATM_PI;
  float power=surface?.2:1.0/3.0;
  float a=pow(near,power),b=pow(1.0-near,power),fraction=a/(a+b);
  return .25*(float(quadrant)+(local.x>=local.y?fraction:1.0-fraction));
}
`;

export const SCATTERING_GENERATOR_VS=`#version 300 es
void main(){vec2 p=gl_VertexID==0?vec2(-1,-1):gl_VertexID==1?vec2(3,-1):vec2(-1,3);gl_Position=vec4(p,0,1);}`;
export const SCATTERING_GENERATOR_FS=`#version 300 es
precision highp float;precision highp int;
out vec4 o;
${ATMOSPHERE_RENDER_GLSL}
${SOURCE_WEIGHT_GLSL}
${COORDINATES_GLSL}
uniform int u_scatteringPass;
void main(){
  // Decode packed atlas rows as integers: reciprocal-based float division can
  // put an exact layer boundary in the preceding layer on native GPUs.
  ivec2 cell=ivec2(gl_FragCoord.xy);vec2 azimuth;float jacobian;AtmospherePath path;bool complete;
  if(u_scatteringPass==0){
    float y=float(cell.y%u_scatteringSurfaceSize.y),z=float(cell.y/u_scatteringSurfaceSize.y);
    float mu=scatteringMu(y),r=u_atmosphereRadiusKm+scatteringHeight(z,mu),impact=r*sqrt(max(0.0,1.0-mu*mu));
    azimuth=scatteringAzimuthComponentsAt(float(cell.x)/float(u_scatteringSurfaceSize.x),true);
    path=atmosphereSurfaceGeometry(u_atmosphereCameraKm,scatteringSurfacePoint(azimuth,r,mu),complete);
  }else{
    float v=float(cell.y)/float(u_scatteringLimbSize.y-1),impact=u_atmosphereRadiusKm+u_atmosphereTopKm*v*v*(u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y?v:1.0);
    azimuth=scatteringAzimuthComponentsAt(float(cell.x)/float(u_scatteringLimbSize.x),false);
    path=atmosphereObserverGeometry(u_atmosphereCameraKm,scatteringRay(azimuth,impact,jacobian),1e20,complete);
  }
  path=atmosphereCompletePath(path,complete);
  AtmosphereResult result=integrateAtmospherePrepared(path);
  vec3 weight=scatteringReferenceWeightPrepared(path);
  vec3 residual=vec3(weight.x>0.0?result.scattering.x/weight.x:0.0,
    weight.y>0.0?result.scattering.y/weight.y:0.0,weight.z>0.0?result.scattering.z/weight.z:0.0);
  bool valid=all(greaterThanEqual(weight,vec3(0)))&&!any(isnan(residual))&&!any(isinf(residual))&&all(greaterThanEqual(residual,vec3(0)));
  o=valid?vec4(residual,1):vec4(0);
}`;

const SAMPLE_GLSL=`
uniform highp sampler2D u_scatteringSurface,u_scatteringLimb;
bool atmosphereScatteringIsZeroPrepared(AtmospherePath path){
  // Preserve the original integrator's exact vacuum and fully shadowed branches.
  // Interpolation may not introduce light into a ray whose whole bounded segment
  // is analytically absent or occulted by the reference body's own shadow.
  vec3 entry=path.entry,ray=path.ray;float distance=path.distance;
  if(distance<=0.0)return true;
  vec2 shadow=path.shadow;
  return shadow.y>shadow.x&&shadow.x<=0.0&&shadow.y>=distance;
}
vec4 scatteringSurfaceTexel(ivec3 p){
  p.x=((p.x%u_scatteringSurfaceSize.x)+u_scatteringSurfaceSize.x)%u_scatteringSurfaceSize.x;
  p.yz=clamp(p.yz,ivec2(0),u_scatteringSurfaceSize.yz-1);
  return texelFetch(u_scatteringSurface,ivec2(p.x,p.y+p.z*u_scatteringSurfaceSize.y),0);
}
vec4 scatteringSurfaceLayer(vec2 p,int z){
  ivec2 lo=ivec2(floor(p));vec2 f=fract(p);
  return mix(mix(scatteringSurfaceTexel(ivec3(lo,z)),scatteringSurfaceTexel(ivec3(lo+ivec2(1,0),z)),f.x),
    mix(scatteringSurfaceTexel(ivec3(lo+ivec2(0,1),z)),scatteringSurfaceTexel(ivec3(lo+ivec2(1),z)),f.x),f.y);
}
vec4 scatteringResidualLinear(vec3 p){
  ivec3 lo=ivec3(floor(p));vec3 f=fract(p),sum=vec3(0);float weight=0.0;
  // A zero source has no defined attenuation residual. Extend from lit knots;
  // actual analytic source support is applied only after this interpolation.
  // Log interpolation matches multiplicative attenuation rather than radiance.
  for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec4 value=scatteringSurfaceTexel(lo+ivec3(x,y,z));
    float w=(x==0?1.0-f.x:f.x)*(y==0?1.0-f.y:f.y)*(z==0?1.0-f.z:f.z);
    if(value.a<0.999999)return vec4(0);
    if(any(greaterThan(value.rgb,vec3(0)))){sum+=w*log(max(value.rgb,vec3(1e-30)));weight+=w;}
  }
  return vec4(weight>0.0?exp(sum/weight):vec3(0),1);
}
float scatteringSlope(float a,float b){
  return a*b<=0.0?0.0:2.0/(1.0/a+1.0/b);
}
vec3 scatteringCubic(vec3 a,vec3 b,vec3 c,vec3 d,float t){
  vec3 left=b-a,delta=c-b,right=d-c;
  vec3 m0=vec3(scatteringSlope(left.x,delta.x),scatteringSlope(left.y,delta.y),scatteringSlope(left.z,delta.z));
  vec3 m1=vec3(scatteringSlope(delta.x,right.x),scatteringSlope(delta.y,right.y),scatteringSlope(delta.z,right.z));
  float t2=t*t,t3=t2*t;
  return (2.0*t3-3.0*t2+1.0)*b+(t3-2.0*t2+t)*m0+(-2.0*t3+3.0*t2)*c+(t3-t2)*m1;
}
vec4 scatteringResidual(vec3 p){
  ivec3 lo=ivec3(floor(p));vec3 f=fract(p),planes[4];
  // Uniform-grid monotone cubic Hermite interpolation in log residual space.
  // Harmonic slopes retain each interval's bounds. Undefined zero-source knots
  // use the original normalized linear extension, not an invented log floor.
  // The first invalid or zero-source knot decides the result, as the early returns
  // did. Recording it keeps the one linear fallback call outside the stencil loops,
  // so a backend that evaluates both branch arms does not run it for every knot.
  int stencilEvent=0;
  for(int z=0;z<4;z++){
    vec3 rows[4];
    for(int y=0;y<4;y++){
      vec3 values[4];
      for(int x=0;x<4;x++){
        vec4 sampleValue=scatteringSurfaceTexel(lo+ivec3(x-1,y-1,z-1));
        if(sampleValue.a<0.999999){stencilEvent=1;break;}
        if(any(lessThanEqual(sampleValue.rgb,vec3(0)))){stencilEvent=2;break;}
        values[x]=log(sampleValue.rgb);
      }
      if(stencilEvent!=0)break;
      rows[y]=scatteringCubic(values[0],values[1],values[2],values[3],f.x);
    }
    if(stencilEvent!=0)break;
    if(lo.y==0)rows[0]=2.0*rows[1]-rows[2];
    if(lo.y>=u_scatteringSurfaceSize.y-2)rows[3]=2.0*rows[2]-rows[1];
    planes[z]=scatteringCubic(rows[0],rows[1],rows[2],rows[3],f.y);
    // A one-layer field clamps every z stencil to this same computed plane.
    if(u_scatteringSurfaceSize.z==1){
      planes[1]=planes[0];planes[2]=planes[0];planes[3]=planes[0];
      break;
    }
  }
  if(stencilEvent==1)return vec4(0);
  if(stencilEvent==2)return scatteringResidualLinear(p);
  if(lo.z==0)planes[0]=2.0*planes[1]-planes[2];
  if(lo.z>=u_scatteringSurfaceSize.z-2)planes[3]=2.0*planes[2]-planes[1];
  return vec4(exp(scatteringCubic(planes[0],planes[1],planes[2],planes[3],f.z)),1);
}
vec4 atmosphereSurfaceScatteringPrepared(vec3 surfaceBodyKm,float physicalHeightKm,AtmospherePath path){
  if(u_scatteringReady!=1)return vec4(0);
  if(atmosphereScatteringIsZeroPrepared(path))return vec4(0,0,0,1);
  vec3 p=atmosphereUnflatten(surfaceBodyKm),d=normalize(atmosphereUnflatten(path.ray));
  float r=length(p),height=physicalHeightKm,mu=dot(p,d)/r;
  // Three binary32 ULPs at the reference radius cover coordinate roundoff only;
  // physical endpoints beyond that envelope are invalid, never edge-clamped.
  float residue=u_atmosphereRadiusKm*3.5762786865234375e-7;
  if(height<u_scatteringHeightRange.x-residue||height>u_scatteringHeightRange.y+residue||abs(mu)>1.000001)return vec4(0);
  float y=(sign(mu)*sqrt(asin(min(1.0,abs(mu)))*2.0/ATM_PI)+1.0)*float(u_scatteringSurfaceSize.y-1)*.5,z=0.0;
  if(u_scatteringSurfaceSize.z>1){
    height=clamp(height,u_scatteringHeightRange.x,u_scatteringHeightRange.y);
    float last=float(u_scatteringSurfaceSize.z-1),halfGrid=last*.5;
    z=u_scatteringHeightRange.x>=0.0?last*sqrt(max(0.0,height/u_scatteringHeightRange.y))
      :u_scatteringHeightRange.y<=0.0?last*(1.0-sqrt(max(0.0,height/u_scatteringHeightRange.x)))
      :height<0.0?halfGrid*(1.0-sqrt(height/u_scatteringHeightRange.x)):height>0.0?halfGrid*(1.0+sqrt(height/u_scatteringHeightRange.y)):halfGrid;
    if(u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y&&height>=0.0){
      float base=u_scatteringHeightRange.x<0.0?halfGrid:0.0,span=last-base;
      float critical=min(u_scatteringHeightRange.y,u_atmosphereRadiusKm*(inversesqrt(max(1e-15,1.0-mu*mu))-1.0));
      z=critical>0.0&&height<=critical?base+span*.5*sqrt(height/critical)
        :u_scatteringHeightRange.y>critical?base+span*.5+span*.5*sqrt(max(0.0,(height-critical)/(u_scatteringHeightRange.y-critical))):last;
    }
  }
  vec2 xy=vec2(scatteringAzimuth(d,true)*float(u_scatteringSurfaceSize.x),y);
  vec4 residual=scatteringResidual(vec3(xy,z));
  return vec4(residual.rgb*scatteringReferenceWeightPrepared(path),residual.a);
}
vec4 atmosphereSurfaceScattering(vec3 surfaceBodyKm,float physicalHeightKm){
  return atmosphereSurfaceScatteringPrepared(surfaceBodyKm,physicalHeightKm,atmospherePrepareSurface(u_atmosphereCameraKm,surfaceBodyKm));
}
vec4 atmosphereSurfaceScattering(vec3 surfaceBodyKm){
  return atmosphereSurfaceScattering(surfaceBodyKm,length(atmosphereUnflatten(surfaceBodyKm))-u_atmosphereRadiusKm);
}
vec4 scatteringLimbTexel(ivec2 p){
  p.x=((p.x%u_scatteringLimbSize.x)+u_scatteringLimbSize.x)%u_scatteringLimbSize.x;
  p.y=clamp(p.y,0,u_scatteringLimbSize.y-1);return texelFetch(u_scatteringLimb,p,0);
}
vec4 scatteringLimbResidual(vec2 p){
  ivec2 lo=ivec2(floor(p));vec2 f=fract(p);vec3 rows[4];bool defined=true;
  for(int y=0;y<4;y++){
    vec3 values[4];
    for(int x=0;x<4;x++){
      vec4 v=scatteringLimbTexel(lo+ivec2(x-1,y-1));
      if(v.a<0.999999)return vec4(0);
      if(any(lessThanEqual(v.rgb,vec3(0))))defined=false;
      values[x]=log(max(v.rgb,vec3(1e-30)));
    }
    rows[y]=scatteringCubic(values[0],values[1],values[2],values[3],f.x);
  }
  if(!defined)return mix(mix(scatteringLimbTexel(lo),scatteringLimbTexel(lo+ivec2(1,0)),f.x),mix(scatteringLimbTexel(lo+ivec2(0,1)),scatteringLimbTexel(lo+ivec2(1)),f.x),f.y);
  if(lo.y==0)rows[0]=2.0*rows[1]-rows[2];
  if(lo.y>=u_scatteringLimbSize.y-2)rows[3]=2.0*rows[2]-rows[1];
  return vec4(exp(scatteringCubic(rows[0],rows[1],rows[2],rows[3],f.y)),1);
}
vec4 atmosphereLimbScatteringPrepared(AtmospherePath path){
  if(u_scatteringReady!=1)return vec4(0);
  if(atmosphereScatteringIsZeroPrepared(path))return vec4(0,0,0,1);
  // Height and hit classification use the same original raw-ray metric.
  vec3 d=atmosphereUnflatten(path.ray),c=atmosphereUnflatten(u_atmosphereCameraKm);
  if(dot(d,c)>=0.0)return vec4(0);
  float height=path.height;
  float residue=u_atmosphereRadiusKm*3.5762786865234375e-7;
  if(height< -residue||height>u_atmosphereTopKm+residue)return vec4(0);
  vec2 p=vec2(scatteringAzimuth(d,false)*float(u_scatteringLimbSize.x),pow(clamp(height/u_atmosphereTopKm,0.0,1.0),u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y?1.0/3.0:.5)*float(u_scatteringLimbSize.y-1));
  vec4 residual=scatteringLimbResidual(p);
  return vec4(residual.rgb*scatteringReferenceWeightPrepared(path),residual.a);
}
vec4 atmosphereLimbScattering(vec3 direction){
  return atmosphereLimbScatteringPrepared(atmospherePrepareObserver(u_atmosphereCameraKm,direction,1e20));
}
vec3 atmosphereViewTransmissionPrepared(AtmospherePath path){
  return path.distance<=0.0?vec3(1):exp(-atmosphereOpticalDepth(path.entry,path.ray,path.distance));
}
vec3 atmosphereViewTransmission(vec3 origin,vec3 direction,float maxDistance){
  return atmosphereViewTransmissionPrepared(atmospherePrepareObserver(origin,direction,maxDistance));
}
vec3 atmosphereSurfaceColorPrepared(vec3 linearSurfaceColor,vec3 surfaceBodyKm,float physicalHeightKm,AtmospherePath path){
  // The raster material already knows its interpolated radial scale and physical
  // datum. Use that height instead of recovering it through normalized direction,
  // oblate scaling/unflattening and a large-radius length subtraction.
  vec4 s=atmosphereSurfaceScatteringPrepared(surfaceBodyKm,physicalHeightKm,path);
  // Defensive shader failure preserves an opaque pre-transfer material. It is
  // not qualified optical transport; full-domain validity is an admission gate.
  if(s.a<0.999999)return linearSurfaceColor;
  return linearSurfaceColor*atmosphereViewTransmissionPrepared(path)+s.rgb;
}
vec3 atmosphereSurfaceColor(vec3 linearSurfaceColor,vec3 surfaceBodyKm,float physicalHeightKm){
  return atmosphereSurfaceColorPrepared(linearSurfaceColor,surfaceBodyKm,physicalHeightKm,atmospherePrepareSurface(u_atmosphereCameraKm,surfaceBodyKm));
}
vec3 atmosphereSurfaceColor(vec3 linearSurfaceColor,vec3 surfaceBodyKm){
  return atmosphereSurfaceColor(linearSurfaceColor,surfaceBodyKm,length(atmosphereUnflatten(surfaceBodyKm))-u_atmosphereRadiusKm);
}
`;
export const ATMOSPHERE_SCATTERING_GLSL=ATMOSPHERE_LIGHT_GLSL+SOURCE_WEIGHT_GLSL+COORDINATES_GLSL+SAMPLE_GLSL;
const shellCall='AtmosphereResult optics=integrateAtmospherePrepared(path);';
// Fragments over the planet disc are discarded. The ground interval comes from the
// geometry alone, so test it before completing the path: the shadow interval is the
// costly part and surviving limb fragments still build the identical prepared path.
const shellPrepare='AtmospherePath path=atmospherePrepareObserver(u_atmosphereCameraKm,direction,1e20);\n  vec2 ground=path.ground;\n  if(ground.y>0.0&&ground.x>=0.0) discard;';
const shellEarlyDiscard='bool complete;AtmospherePath path=atmosphereObserverGeometry(u_atmosphereCameraKm,direction,1e20,complete);\n  vec2 ground=path.ground;\n  if(ground.y>0.0&&ground.x>=0.0) discard;\n  path=atmosphereCompletePath(path,complete);';
if(ATMOSPHERE_RENDER_FS.split(ATMOSPHERE_RENDER_GLSL).length!==2||ATMOSPHERE_RENDER_FS.split(shellCall).length!==2
  ||ATMOSPHERE_RENDER_FS.split(shellPrepare).length!==2)throw new Error('Scattering shell binding changed');
export const ATMOSPHERE_SCATTERING_FS=ATMOSPHERE_RENDER_FS.replace(ATMOSPHERE_RENDER_GLSL,ATMOSPHERE_SCATTERING_GLSL)
  .replace(shellPrepare,shellEarlyDiscard)
  .replace(shellCall,'vec4 field=atmosphereLimbScatteringPrepared(path);if(field.a<0.999999)discard;\n  AtmosphereResult optics=AtmosphereResult(atmosphereViewTransmissionPrepared(path),field.rgb);');

/** @param {WebGL2RenderingContext} gl @param {Record<string,WebGLUniformLocation|null>} locations @param {ScatteringPlan} plan @param {number} [ready] */
export function setScatteringUniforms(gl,locations,plan,ready=1){
  gl.uniform1i(locations.u_scatteringReady,ready);
  gl.uniform3fv(locations.u_scatteringAxis,plan.axis);gl.uniform3fv(locations.u_scatteringU,plan.u);gl.uniform3fv(locations.u_scatteringV,plan.v);
  gl.uniform1f(locations.u_scatteringCameraRadius,plan.cameraRadius);
  gl.uniform2fv(locations.u_scatteringHeightRange,plan.heightRange);
  gl.uniform3iv(locations.u_scatteringSurfaceSize,plan.surfaceSize);gl.uniform2iv(locations.u_scatteringLimbSize,plan.limbSize);
  gl.uniform1i(locations.u_scatteringSurface,8);gl.uniform1i(locations.u_scatteringLimb,9);
}
