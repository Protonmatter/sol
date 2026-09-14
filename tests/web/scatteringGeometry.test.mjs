import test from 'node:test';
import assert from 'node:assert/strict';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';
import {BODY} from '../../apps/web/js/bodyData.js';
import {planAtmosphereScattering,scatteringMuAt,scatteringHeightAt,scatteringSurfaceRay,
  scatteringSurfaceCoordinates,scatteringLimbRay,validScatteringPlanBudget,
  SCATTERING_MAX_EVALUATIONS,SCATTERING_MAX_BYTES} from '../../apps/web/js/atmosphereScattering.js';
import {scatteringQualificationCases} from '../../tools/scattering_validation_cases.mjs';

const fixtures=scatteringQualificationCases(getAtmosphereProfile,BODY);
const close=(actual,expected,eps=1e-8)=>assert.ok(Math.abs(actual-expected)<=eps,`${actual} != ${expected}`);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const unflatten=(v,q)=>[v[0],v[1],v[2]/q];
const norm=v=>Math.hypot(...v);
const planFor=item=>planAtmosphereScattering(item.profile,{...item.options,...item.bounds});

test('original qualification matrix remains exactly 5592 independently constructed queries',()=>{
  assert.equal(fixtures.length,13);
  assert.equal(fixtures.reduce((sum,item)=>sum+item.queries.length,0),5592);
});

for(const item of fixtures)test(`${item.name}: endpoints, signed closest approach and finite allocation`,()=>{
  const plan=planFor(item);assert.equal(plan.status,'ready');assert.equal(validScatteringPlanBudget(plan),true);
  assert.ok(plan.evaluations<=SCATTERING_MAX_EVALUATIONS);assert.ok(plan.bytes<=SCATTERING_MAX_BYTES);
  const [nx,ny,nz]=plan.surfaceSize;
  assert.equal(plan.evaluations,nx*ny*nz+plan.limbSize[0]*plan.limbSize[1]);
  for(const y of [0,ny*.173,(ny-1)/2,ny*.873,ny-1])for(const z of [0,(nz-1)*.37,nz-1]){
    const mu=scatteringMuAt(plan,y),height=scatteringHeightAt(plan,z,mu);
    for(const azimuth of [.137,1.569,4.281]){
      const ray=scatteringSurfaceRay(plan,azimuth,mu,height),p=unflatten(ray.surface,plan.polarRatio);
      const d=unflatten(ray.direction,plan.polarRatio);
      close(norm(ray.direction),1,1e-12);assert.ok(ray.maxDistance>0);
      close(norm(p),plan.radiusKm+height,2e-8);
      close(dot(p,d)/(norm(p)*norm(d)),mu,2e-9);
      const mapped=scatteringSurfaceCoordinates(plan,ray.surface);assert.ok(mapped);
      // The inverse sine is ill-conditioned at |mu|=1. Compare the physical
      // direction cosine, not an arbitrary inverse-coordinate error there.
      close(scatteringMuAt(plan,mapped[1]),mu,2e-9);
      // Duplicate tangency knots can have more than one z coordinate. Geometry
      // is the contract; requiring identical z would test an arbitrary inverse.
      close(scatteringHeightAt(plan,mapped[2],mu),height,3e-8);
    }
  }
});

test('ground-aligned terrain knot lies on the physical reference tangent',()=>{
  const plan=planFor(fixtures.find(item=>item.name==='Mars-terminator-terrain'));
  const midpoint=(plan.surfaceSize[2]-1)*.75;
  for(const mu of [-.07,-.025,-.003,0,.003,.025,.07]){
    const height=scatteringHeightAt(plan,midpoint,mu);
    const impact=(plan.radiusKm+height)*Math.sqrt(1-mu*mu);
    if(height<plan.heightRange[1])close(impact,plan.radiusKm,1e-9);
    else assert.ok(impact<=plan.radiusKm+1e-9);
  }
});

test('limb rays retain prescribed oblate closest height in physical kilometres',()=>{
  for(const item of fixtures){
    const plan=planFor(item),camera=unflatten(plan.cameraBodyKm,plan.polarRatio);
    for(const height of [0,.001,3.37,plan.topKm])for(const azimuth of [.1,Math.PI/2,4.5]){
      const ray=scatteringLimbRay(plan,azimuth,height),d=unflatten(ray.direction,plan.polarRatio);
      const t=-dot(camera,d)/dot(d,d),closest=camera.map((v,i)=>v+t*d[i]);
      close(norm(closest)-plan.radiusKm,height,3e-8);assert.ok(t>0);
    }
  }
});

test('plan rejects unsupported and inside-atmosphere camera domains before allocation',()=>{
  const profile=getAtmosphereProfile('Earth');
  const base={cameraBodyKm:[8000,0,0],sunDirectionBody:[1,0,0],polarRatio:1};
  for(const options of [{...base,cameraBodyKm:[6400,0,0]}, {...base,cameraBodyKm:[Infinity,0,0]},
    {...base,cameraBodyKm:[1e25,0,0]}, {...base,sunDirectionBody:[0,0,0]},
    {...base,polarRatio:.49},{...base,minRadiusKm:1},{...base,minRadiusKm:6370,maxRadiusKm:7000}])
    assert.equal(planAtmosphereScattering(profile,options).status,'unavailable');
  assert.equal(planAtmosphereScattering({...profile,body:'Jupiter'},base).status,'unavailable');
});

test('allocation gate independently rejects forged dimensions, counts and byte summaries',()=>{
  const plan=planFor(fixtures[0]);
  for(const changed of [{bytes:0},{evaluations:1},{surfaceSize:[256,256,17]},
    {surfaceSize:[128,193,2]},{surfaceSize:[128,193,NaN]},{limbSize:[128,0]}])
    assert.equal(validScatteringPlanBudget({...plan,...changed}),false);
});
