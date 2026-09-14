// Qualification-only candidate. No production module imports this file.
import assert from 'node:assert/strict';

const ORIGINAL_SEGMENT=`vec3 atmosphereScatteredSegment(vec3 origin,vec3 direction,vec2 interval,AtmosphereColumnRay columnRay){
  vec3 p=atmosphereUnflatten(origin), d=atmosphereUnflatten(direction);
  float closest=-dot(p,d)/dot(d,d);
  if(closest>interval.x&&closest<interval.y)
    return atmosphereScatteredMonotonic(origin,direction,vec2(interval.x,closest),columnRay)
      +atmosphereScatteredMonotonic(origin,direction,vec2(closest,interval.y),columnRay);
  return atmosphereScatteredMonotonic(origin,direction,interval,columnRay);
}`;

const SEGMENTED=`vec3 atmosphereScatteredSegment(vec3 origin,vec3 direction,vec2 interval,AtmosphereColumnRay columnRay){
  if(interval.y<=interval.x) return vec3(0.0);
  vec3 p=atmosphereUnflatten(origin), d=atmosphereUnflatten(direction);
  float closest=-dot(p,d)/dot(d,d);
  vec2 ground=atmosphereRayInterval(origin,direction,u_atmosphereRadiusKm);
  if(ground.y<ground.x) ground=vec2(closest);
  // Sorted in ray-distance order before clamping. Duplicate/tangent cuts have
  // zero width; unchanged monotonic quadrature returns zero for those pieces.
  float cuts[5]=float[5](interval.x,clamp(ground.x,interval.x,interval.y),
    clamp(closest,interval.x,interval.y),clamp(ground.y,interval.x,interval.y),interval.y);
  vec3 result=vec3(0.0);
  for(int i=0;i<4;i++)
    result+=atmosphereScatteredMonotonic(origin,direction,vec2(cuts[i],cuts[i+1]),columnRay);
  return result;
}`;

export const TERRAIN_CANDIDATE_VERSION='ground-crossing-segments.v1';
export const TERRAIN_CANDIDATE_MAX_NODES=60;

/** Preserve the integrand, fields, profiles, visibility and endpoint equations. */
export function withTerrainGroundCuts(source){
  assert.equal(typeof source,'string');
  assert.equal(source.split(ORIGINAL_SEGMENT).length,2,'Ground-cut candidate source boundary changed');
  return source.replace(ORIGINAL_SEGMENT,SEGMENTED);
}

/** Diagnostic invocation count, never included in shipped materials. */
export function withIntegrationNodeCounter(source){
  const marker='vec3 atmosphereScatteredMonotonic(vec3 origin,vec3 direction,vec2 interval,AtmosphereColumnRay columnRay){\n  if(interval.y<=interval.x) return vec3(0.0);';
  assert.equal(source.split(marker).length,2,'Integration counter source boundary changed');
  return 'float qualificationNodes=0.0;\n'+source.replace(marker,marker+'\n  qualificationNodes+=12.0;');
}

/** Synthetic fixtures, not observations or a claim about underground atmosphere. */
export function terrainEndpointFixtures(getProfile,uniformValues){
  const cases=[];
  function add(name,body,origin,direction,sun,q,maximum,steps=512){
    const profile=getProfile(body);
    assert.ok(profile,'Missing admitted profile');
    assert.ok(Number.isFinite(maximum)&&maximum>=0);
    assert.ok([origin,direction,sun].every(v=>v.length===3&&v.every(Number.isFinite)));
    cases.push({name,body,profile,origin,direction,sun,q,au:1,maximum,
      terrainEndpoint:true,viewSteps:steps,solarSteps:steps,
      uniforms:uniformValues(profile,{cameraBodyKm:origin,sunDirectionBody:sun,
        polarRatio:q,solarDistanceAu:1,exposure:1})});
  }
  for(const body of ['Earth','Mars']){
    const p=getProfile(body),R=p.radiusKm,q=body==='Earth'?.9966:.9941;
    for(const height of [-22.37,0,10]){
      // Radial poles exercise the physical-distance Jacobian as well as crossing.
      add(`${body} terrain polar h=${height}`,body,[0,0,(R+150)*q],[0,0,-1],[0,0,1],q,(150-height)*q);
    }
    add(`${body} terrain night`,body,[0,0,R+150],[0,0,-1],[0,0,-1],1,172.37);
    add(`${body} grazing through closest`,body,[R+.1,0,1000],[0,0,-1],[1,0,0],1,2000,1024);
    add(`${body} shadow crossing`,body,[R+2,0,1000],[0,0,-1],[-.05,0,1],1,2000,1024);
    add(`${body} camera below top`,body,[0,0,R+10],[0,0,-1],[0,0,1],1,11);
  }
  // Preserve the two independently diagnosed synthetic rays from the earlier
  // 5,592-point qualification corpus, not their old GPU results as an oracle.
  const origin=[2394.1410032796816,0,6539.0390402629];
  const sun=[-.00018001886262473198,.9999998629221643,-.0004916796333525442];
  add('Mars prior subdatum 135','Mars',origin,[-.3009215382148213,.4836644389582557,-.821897157998263],sun,.9941,6216.418594925416,2048);
  add('Mars prior subdatum 137','Mars',origin,[-.3120631334322441,.483499722498832,-.8178292114469878],sun,.9941,6216.663468898525,2048);
  return cases;
}
