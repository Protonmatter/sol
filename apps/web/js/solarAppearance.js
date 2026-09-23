// Pure reference-display geometry. No DOM, GPU, wall clock or engine mutations.
// Source coordinates and modeled emission are qualified separately in the manifest.
import { solarAppearanceManifest } from './solarAppearanceManifest.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const SOLAR_APPEARANCE = deepFreeze(solarAppearanceManifest);
export const SOLAR_VOLUME_EXTENT = SOLAR_APPEARANCE.geometry.extent_solar_radii;
// Presentation only. 0 keeps the admitted 1x gold map used by probes. The live EUV
// view lifts that map through a normalized soft shoulder of this strength, about 4x
// near black and exactly 1 at full scale, so the quiet disk is a luminous star and
// bright observed structure compresses instead of clipping.
export const SOLAR_EUV_DISPLAY_GAIN = 4;
// Educational compression: one displayed second stands for two solar hours.
// Equator then drifts about 14 degrees per 12 displayed seconds.
export const SOLAR_ACTIVITY_SECONDS_PER_DAY = 12;
export const SOLAR_SOURCE_UNIX = Date.parse(SOLAR_APPEARANCE.frames[0].observed_at)/1000;
const DEG = Math.PI/180, RAD_TO_ARCSEC = 180*3600/Math.PI;
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length = a => Math.hypot(a[0],a[1],a[2]);
const scale = (a,b) => a.map(v=>v*b);
const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
const smooth = (lo,hi,x) => {const t=clamp((x-lo)/(hi-lo),0,1);return t*t*(3-2*t);};

function finiteVector(value,name) {
  if (!Array.isArray(value) || value.length!==3 || !value.every(Number.isFinite)) {
    throw new TypeError(`${name} must be a finite three-vector`);
  }
}
function unit(value,name) {
  finiteVector(value,name);
  const n=length(value);
  if(n<1e-12) throw new RangeError(`${name} cannot be zero`);
  return scale(value,1/n);
}

function carringtonBasis(wcs) {
  const longitude=wcs.longitude_deg*DEG,latitude=wcs.latitude_deg*DEG;
  const cl=Math.cos(longitude),sl=Math.sin(longitude),cb=Math.cos(latitude),sb=Math.sin(latitude);
  return {right:[-sl,cl,0],up:[-sb*cl,-sb*sl,cb],axis:[cb*cl,cb*sl,sb]};
}
const referenceBasis=carringtonBasis(SOLAR_APPEARANCE.frames[0].wcs);
function toReference(vector) {
  return [dot(vector,referenceBasis.right),dot(vector,referenceBasis.up),dot(vector,referenceBasis.axis)];
}

/** A fixed image-observer frame, not the rotating IAU Sun frame. */
export function solarFrameUniforms(frame=SOLAR_APPEARANCE.frames[0]) {
  const wcs=frame.wcs, original=carringtonBasis(wcs);
  const right=toReference(original.right),up=toReference(original.up),axis=toReference(original.axis);
  return {right,up,axis,basis:[...right,...up,...axis],
    projection:[(wcs.crpix[0]-.5)/wcs.dimensions[0],(wcs.crpix[1]-.5)/wcs.dimensions[1],
      RAD_TO_ARCSEC/wcs.cdelt_arcsec[0]/wcs.dimensions[0],RAD_TO_ARCSEC/wcs.cdelt_arcsec[1]/wcs.dimensions[1]],
    observerRadius:wcs.observer_distance_m/wcs.solar_reference_radius_m};
}

/** Reference frame -> world rotation. Caller supplies fixed source-epoch vectors. */
export function solarReferenceRotation(observerDirection,solarNorthDirection) {
  const axis=unit(observerDirection,'source observer'),north=unit(solarNorthDirection,'solar north');
  const right=unit(cross(north,axis),'source horizontal');
  const up=unit(cross(axis,right),'source vertical');
  return [right[0],right[1],right[2],0,up[0],up[1],up[2],0,axis[0],axis[1],axis[2],0,0,0,0,1];
}

/** Finite-distance TAN projection; source north is up in unflipped browser pixels. */
export function projectSolarSurface(point,frame=SOLAR_APPEARANCE.frames[0]) {
  finiteVector(point,'surface point');
  if(Math.abs(length(point)-1)>1e-8) throw new RangeError('surface point must be unit length');
  const {axis,right,up,projection,observerRadius}=solarFrameUniforms(frame);
  const z=dot(point,axis),denom=observerRadius-z;
  const uv=[projection[0]+dot(point,right)/denom*projection[2],
    1-projection[1]-dot(point,up)/denom*projection[3]];
  const mu=(observerRadius*z-1)/Math.sqrt(observerRadius*observerRadius+1-2*observerRadius*z);
  const coverage=uv.some(v=>v<0||v>1)?0:smooth(SOLAR_APPEARANCE.surface_min_mu,SOLAR_APPEARANCE.surface_full_mu,mu);
  return {uv,coverage,mu};
}

/** Traveling brightness along the arches. Independent of the source-frame scrub.
 * One brightness cycle takes four seconds. Reduced motion holds the phase at zero. */
export function solarFlowPhase(seconds,{reducedMotion=false}={}) {
  if(!Number.isFinite(seconds)) throw new TypeError('corona flow time must be finite');
  // Wrapped so a long session keeps float32 precision in the shader; cos() is unchanged.
  return reducedMotion?0:(seconds%400)*Math.PI/2;
}

/** Twenty seconds maps to the fixed source interval; callers pause/reset explicitly. */
export function solarPlayback(seconds,{reducedMotion=false}={}) {
  if(!Number.isFinite(seconds)) throw new TypeError('source playback must be finite');
  const elapsed=clamp(seconds,0,SOLAR_APPEARANCE.playback.duration_seconds);
  const mix=elapsed/SOLAR_APPEARANCE.playback.duration_seconds;
  const start=Date.parse(SOLAR_APPEARANCE.frames[0].observed_at),end=Date.parse(SOLAR_APPEARANCE.frames[1].observed_at);
  return {mix,phase:reducedMotion?0:elapsed*Math.PI/6,elapsed,ended:elapsed===SOLAR_APPEARANCE.playback.duration_seconds,
    sourceTime:new Date(Math.round(start+mix*(end-start))).toISOString(),
    sourceStatus:mix===0||mix===1?'source-frame':'interpolated-reference'};
}

/** Stable analytic ray/sphere roots in solar-radius coordinates. */
export function raySphereInterval(origin,direction,radius=1) {
  finiteVector(origin,'ray origin');finiteVector(direction,'ray direction');
  if(Math.abs(length(direction)-1)>1e-8) throw new RangeError('ray direction must be unit length');
  if(!Number.isFinite(radius)||radius<=0) throw new RangeError('sphere radius must be finite and positive');
  const perpendicular=cross(origin,direction),discriminant=radius*radius-dot(perpendicular,perpendicular);
  if(discriminant<0) return null;
  const middle=-dot(origin,direction),span=Math.sqrt(discriminant);
  if(middle+span<0) return null;
  return [middle-span,middle+span];
}

/** Visible volume ends at the first opaque photosphere intersection. */
export function solarVisibleInterval(origin,direction,extent=SOLAR_VOLUME_EXTENT) {
  if(length(origin)<=1) return null;
  const outer=raySphereInterval(origin,direction,extent);
  if(!outer) return null;
  const inner=raySphereInterval(origin,direction,1);
  const start=Math.max(0,outer[0]),end=inner&&inner[0]>0?Math.min(outer[1],inner[0]):outer[1];
  return end>start?[start,end]:null;
}

/** Local Gaussian arcade emissivity. This is modeled display emission, not plasma density. */
export function solarLoopDensity(point,loops=SOLAR_APPEARANCE.geometry.loops,phase=0) {
  finiteVector(point,'volume point');
  if(!Number.isFinite(phase)) throw new TypeError('model phase must be finite');
  const r=length(point);
  if(r<1||r>SOLAR_VOLUME_EXTENT) return 0;
  let density=0;
  for(let i=0;i<loops.length;i++) {
    const loop=loops[i],normal=loop.normal,tangent=loop.tangent,binormal=cross(normal,tangent);
    const x=dot(point,tangent),y=dot(point,normal)-Math.sqrt(1-loop.radius*loop.radius),z=dot(point,binormal);
    if(y<0) continue;
    const radial=Math.hypot(x,y)-loop.radius;
    const d2=(radial*radial+z*z)/(loop.width*loop.width);
    if(d2>16) continue;
    const theta=Math.atan2(y,x);
    // Traveling brightness is an educational flow cue, independent of source-frame intensity.
    const flow=.7+.3*Math.cos(4*theta-phase+(loop.phaseOffset??i*.47));
    density+=Math.exp(-.5*d2)*loop.gain*flow;
  }
  return density;
}

/** Float64 midpoint reference for the fragment shader's optically thin line integral. */
export function integrateSolarEmission(origin,direction,loops=SOLAR_APPEARANCE.geometry.loops,phase=0,samples=128) {
  if(!Number.isInteger(samples)||samples<1||samples>4096) throw new RangeError('sample count must be 1..4096');
  const interval=solarVisibleInterval(origin,direction);
  if(!interval) return 0;
  let total=0;
  // Integrate each finite-support arcade only where the ray can meet it. A
  // broad whole-Sun step grid undersamples thin arcs at the limb. Per-arc
  // clipping keeps the same bounded work while resolving the cross-section.
  for(let j=0;j<loops.length;j++) {
    const loop=loops[j],center=scale(loop.normal,Math.sqrt(1-loop.radius*loop.radius));
    const local=raySphereInterval(origin.map((v,i)=>v-center[i]),direction,loop.radius+4*loop.width);
    if(!local) continue;
    const start=Math.max(interval[0],local[0]),end=Math.min(interval[1],local[1]);
    if(end<=start) continue;
    const dt=(end-start)/samples;
    const single=[{...loop,phaseOffset:loop.phaseOffset??j*.47}];
    for(let i=0;i<samples;i++) {
      const t=start+(i+.5)*dt;
      total+=solarLoopDensity(origin.map((v,k)=>v+t*direction[k]),single,phase)*dt;
    }
  }
  return total;
}

/** Monotonic, explicitly false-color display transform; input is a stretched JP2 value. */
export function solarDisplayColor(intensity) {
  if(!Number.isFinite(intensity)) throw new TypeError('display intensity must be finite');
  const v=clamp(intensity,0,1);
  return [Math.pow(v,.7),.76*Math.pow(v,1.25),.22*Math.pow(v,2.1)];
}

// One sample per mu bin. The far hemisphere is this radial curve, not a night side
// and not a copy of active-region structure.
export const SOLAR_QUIET_BINS = 32;
const QUIET_AZIMUTH = 64;
const QUIET_MIN_SAMPLES = 8;

function median(values) {
  const sorted=Float64Array.from(values).sort();
  const n=sorted.length,mid=n>>1;
  return n&1 ? sorted[mid] : (sorted[mid-1]+sorted[mid])*0.5;
}

/** Unit-sphere ring whose finite-distance foreshortening cosine is mu. */
function ringAtMu(mu,distance) {
  if(!Number.isFinite(mu)||mu<0||mu>1) throw new RangeError('quiet mu must be within 0..1');
  if(!Number.isFinite(distance)||distance<=1) throw new RangeError('observer distance must exceed one solar radius');
  const m2=mu*mu,A=distance*distance,B=2*distance*(m2-1),C=1-m2*(A+1),disc=B*B-4*A*C;
  if(disc<0) throw new RangeError('quiet mu has no photosphere ring');
  const z=Math.min(1,(-B+Math.sqrt(disc))/(2*A));
  if(!(z>=0)) throw new RangeError('quiet ring left the photosphere');
  return {z,radial:Math.sqrt(Math.max(0,1-z*z))};
}

function bilinearRed(rgba,width,height,x,y) {
  const x0=Math.max(0,Math.floor(x)),y0=Math.max(0,Math.floor(y));
  const x1=Math.min(x0+1,width-1),y1=Math.min(y0+1,height-1);
  const tx=x-Math.floor(x),ty=y-Math.floor(y);
  const at=(xx,yy)=>rgba[(yy*width+xx)*4]/255;
  return (1-ty)*((1-tx)*at(x0,y0)+tx*at(x1,y0))+ty*((1-tx)*at(x0,y1)+tx*at(x1,y1));
}

/** Frame-local UV to atlas red, matching the shader's half-texel clamp. */
export function sampleAtlasIntensity(rgba,width,height,frame,uv) {
  if(!rgba||rgba.length!==width*height*4||typeof rgba[0]!=='number') {
    throw new TypeError('atlas samples must be tightly packed RGBA');
  }
  if(!Number.isInteger(frame)||frame<0||frame>1||width<2||width%2||height<1) throw new RangeError('atlas frame is outside the two-tile image');
  const frameW=width/2;
  const u=clamp(uv[0],.5/frameW,1-.5/frameW),v=clamp(uv[1],.5/height,1-.5/height);
  return bilinearRed(rgba,width,height,(u+frame)*frameW-.5,v*height-.5);
}

/**
 * Azimuthal median of one observed disk, indexed by foreshortening cosine.
 * A bright loop cannot set the fill used where that longitude was not observed.
 */
export function solarQuietProfile(sample,frame=SOLAR_APPEARANCE.frames[0],bins=SOLAR_QUIET_BINS) {
  if(typeof sample!=='function') throw new TypeError('quiet profile sample must be a function');
  if(!Number.isInteger(bins)||bins<2||bins>256) throw new RangeError('quiet profile bins must be 2..256');
  const basis=solarFrameUniforms(frame),distance=basis.observerRadius;
  const buckets=Array.from({length:bins},()=>[]);
  for(let i=0;i<bins;i++) {
    const {z,radial}=ringAtMu((i+.5)/bins,distance);
    for(let k=0;k<QUIET_AZIMUTH;k++) {
      const phi=(k+.5)*2*Math.PI/QUIET_AZIMUTH,c=Math.cos(phi),s=Math.sin(phi);
      const point=[0,1,2].map(axis=>basis.right[axis]*radial*c+basis.up[axis]*radial*s+basis.axis[axis]*z);
      const projected=projectSolarSurface(point,frame);
      if(projected.mu<=0||projected.uv.some(value=>value<0||value>1)) continue;
      const intensity=sample(projected.uv);
      if(!Number.isFinite(intensity)) throw new TypeError('quiet sample must be finite');
      buckets[i].push(clamp(intensity,0,1));
    }
  }
  const values=Array.from({length:bins},(_,i)=>buckets[i].length>=QUIET_MIN_SAMPLES?median(buckets[i]):null);
  let carry=null;
  for(let i=bins-1;i>=0;i--) {
    if(values[i]!==null) carry=values[i];
    else if(carry!==null) values[i]=carry;
  }
  if(values.some(value=>value===null)) throw new RangeError('quiet profile has no on-disk samples');
  return values;
}

/** Both atlas tiles, in shader row order. Values stay in display intensity, 0..1. */
export function solarAtlasQuietProfiles(rgba,width,height) {
  return SOLAR_APPEARANCE.frames.map((frame,index)=>solarQuietProfile(
    uv=>sampleAtlasIntensity(rgba,width,height,index,uv),frame));
}

/** R8 rows, one per source frame. Linear sampling at mu reconstructs the curve. */
export function solarQuietBytes(profiles) {
  if(!Array.isArray(profiles)||profiles.length!==2) throw new TypeError('quiet upload needs both source frames');
  const bytes=new Uint8Array(SOLAR_QUIET_BINS*2);
  profiles.forEach((profile,row)=>{
    if(!Array.isArray(profile)||profile.length!==SOLAR_QUIET_BINS) throw new RangeError('quiet profile width changed');
    for(let i=0;i<profile.length;i++) {
      const value=profile[i];
      if(!Number.isFinite(value)||value<0||value>1) throw new RangeError('quiet profile sample left 0..1');
      bytes[row*SOLAR_QUIET_BINS+i]=Math.round(value*255);
    }
  });
  return bytes;
}

// The manifest keeps 12 source-anchored arches. These quieter ones continue the
// same circular-arcade emissivity around the star. Their footpoints follow the
// NASA/NSSDC latitude law, compressed onto the display clock. They are not
// fluid dynamics, a magnetogram, or a far-side observation.
const SOLAR_SOURCE_ARCS = SOLAR_APPEARANCE.geometry.loops.length;
export const SOLAR_ARCADE_COUNT = SOLAR_SOURCE_ARCS+12;
const GLOBAL_GAIN = 0.42;
const CME_PERIOD = 22;
const CME_DURATION = 8;
// Three tilted bipoles. Trailing footpoint sits at higher latitude, so differential
// rotation shears the pair. Radii are angular size on the visible photosphere.
const SOLAR_BIPOLES = [
  {lat:18*DEG,lon:0.55,dLat:8*DEG,dLon:0.34,radius:0.09},
  {lat:-20*DEG,lon:2.4,dLat:-7*DEG,dLon:0.30,radius:0.07},
  {lat:14*DEG,lon:-1.15,dLat:9*DEG,dLon:0.28,radius:0.06},
];

/** Sidereal degrees per day: 14.37 - 2.33 sin^2 L - 1.56 sin^4 L. */
export function solarSiderealDegPerDay(latitudeRad) {
  if(!Number.isFinite(latitudeRad)) throw new TypeError('latitude must be finite');
  const s2=Math.sin(latitudeRad)**2;
  return 14.37-2.33*s2-1.56*s2*s2;
}

function activityDays(seconds) {
  return (Number.isFinite(seconds)?seconds:0)/SOLAR_ACTIVITY_SECONDS_PER_DAY;
}

function spunLongitude(lon,lat,seconds) {
  return lon+solarSiderealDegPerDay(lat)*DEG*activityDays(seconds);
}

function surfacePoint(lat,lon,northAxis) {
  const c=Math.cos(lat),s=Math.sin(lat);
  if(northAxis==='z') return [c*Math.cos(lon),c*Math.sin(lon),s];
  return [c*Math.cos(lon),s,c*Math.sin(lon)];
}

export function solarActiveRegions(seconds=0,northAxis='y') {
  return SOLAR_BIPOLES.map(group=>{
    const trailLat=group.lat+group.dLat;
    // Equatorward footpoint leads. It rotates faster, so the pair shears open.
    const lead=surfacePoint(group.lat,spunLongitude(group.lon+group.dLon,group.lat,seconds),northAxis);
    const trail=surfacePoint(trailLat,spunLongitude(group.lon,trailLat,seconds),northAxis);
    return {lead,trail,radius:group.radius};
  });
}

/** Days on the compressed activity clock. The photosphere shader uses the same law. */
export function solarActivityDays(seconds=0) {
  return activityDays(seconds);
}

/**
 * Spot discs in the same frame-0 source basis as the EUV bipoles (+Y north). The
 * photosphere receives a body-to-source matrix, so both modes show one set of groups.
 */
export function solarPhotosphereSpots(seconds=0) {
  return solarActiveRegions(seconds,'y').map(region=>({
    lead:[...region.lead,region.radius],
    trail:[...region.trail,region.radius*0.72],
  }));
}

export function solarCme(seconds=0) {
  const idle={progress:0,axis:[0,1,0]};
  if(!Number.isFinite(seconds)||seconds<0) return idle;
  const regions=solarActiveRegions(seconds);
  const axis=regions[0].lead;
  const t=seconds%CME_PERIOD;
  if(t>=CME_DURATION) return {progress:0,axis};
  return {progress:t/CME_DURATION,axis};
}

function arcadeTangent(normal,angle) {
  const north=[0,1,0];
  let tangent=cross(north,normal);
  const span=length(tangent);
  if(span<1e-8) throw new RangeError('corona footpoint is too close to the pole');
  tangent=scale(tangent,1/span);
  const binormal=cross(normal,tangent);
  const c=Math.cos(angle),s=Math.sin(angle);
  return tangent.map((value,axis)=>value*c+binormal[axis]*s);
}

function leanTangent(foot,toward) {
  const horiz=toward.map((value,axis)=>value-foot[axis]*dot(toward,foot));
  const span=length(horiz);
  if(span<1e-4) return arcadeTangent(foot,0.35);
  return scale(horiz,1/span);
}

/** Three bipolar pairs, two strands on each footpoint. Time shears and rotates them. */
export function solarGlobalLoops(seconds=0) {
  const rise=solarCme(seconds).progress;
  const loops=[];
  solarActiveRegions(seconds).forEach((region,regionIndex)=>{
    [region.lead,region.trail].forEach((foot,footIndex)=>{
      const toward=footIndex===0?region.trail:region.lead;
      const tangent=leanTangent(foot,toward);
      for(let strand=0;strand<2;strand++) {
        // Zero at both ends of the window, so the arch settles instead of snapping back.
        const opening=regionIndex===0?0.12*Math.sin(Math.PI*rise):0;
        loops.push({normal:foot,tangent,radius:.16+.05*strand+opening,width:.01+.002*strand,gain:GLOBAL_GAIN,
          phaseOffset:(SOLAR_SOURCE_ARCS+loops.length)*.47,role:'whole-sphere-model'});
      }
    });
  });
  if(loops.length!==12) throw new RangeError('whole-sphere arcade must stay at 12');
  return loops;
}

/** Packed immutable-reference uniforms; viewport/camera matrices are supplied by the caller. */
export function solarRenderUniforms(seconds=0,options={}) {
  const frame0=solarFrameUniforms(SOLAR_APPEARANCE.frames[0]),frame1=solarFrameUniforms(SOLAR_APPEARANCE.frames[1]);
  const playback=solarPlayback(seconds,options);
  const activitySeconds=options.flowSeconds??0;
  const loops=[...SOLAR_APPEARANCE.geometry.loops,...solarGlobalLoops(activitySeconds)];
  if(loops.length!==SOLAR_ARCADE_COUNT) throw new RangeError('solar arcade count left the shader contract');
  const loopNormal=[],loopTangent=[];
  for(const loop of loops) {
    loopNormal.push(...loop.normal,loop.radius);
    loopTangent.push(...loop.tangent,loop.width);
  }
  const phase=options.flowSeconds==null?playback.phase:solarFlowPhase(options.flowSeconds,options);
  return {extent:SOLAR_VOLUME_EXTENT,frameMix:playback.mix,phase,
    sourceBasis0:frame0.basis,sourceBasis1:frame1.basis,
    projection0:frame0.projection,projection1:frame1.projection,
    observerRadii:[frame0.observerRadius,frame1.observerRadius],
    loopNormal,loopTangent,loopGain:loops.map(loop=>loop.gain),playback,cme:solarCme(activitySeconds)};
}
