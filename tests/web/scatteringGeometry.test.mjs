import test from 'node:test';
import assert from 'node:assert/strict';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';
import {BODY} from '../../apps/web/js/bodyData.js';
import {planAtmosphereScattering,scatteringMuAt,scatteringHeightAt,scatteringSurfaceRay,
  scatteringSurfaceCoordinates,scatteringLimbRay,scatteringLimbCoordinates,validScatteringPlanBudget,
  SCATTERING_MAX_EVALUATIONS,SCATTERING_MAX_BYTES} from '../../apps/web/js/atmosphereScattering.js';
import {scatteringQualificationCases} from '../../tools/scattering_validation_cases.mjs';

const fixtures=scatteringQualificationCases(getAtmosphereProfile,BODY);
const close=(actual,expected,eps=1e-8)=>assert.ok(Math.abs(actual-expected)<=eps,`${actual} != ${expected}`);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const unflatten=(v,q)=>[v[0],v[1],v[2]/q];
const norm=v=>Math.hypot(...v);
const planFor=item=>planAtmosphereScattering(item.profile,{...item.options,...item.bounds});
const periodicClose=(actual,expected)=>close((actual-expected)-Math.round(actual-expected),0,2e-12);
const rotateQuadrant=([x,y],quadrant)=>[[x,y],[-y,x],[-x,-y],[y,-x]][((quadrant%4)+4)%4];

// Build Cartesian inputs independently of the production forward/inverse helpers.
// Local angles retain tiny components beside axes which a global atan can erase.
function warpedComponents(quarterFraction,power){
  const near=Math.min(quarterFraction,1-quarterFraction);
  const angle=Math.PI*.5*near**power/(near**power+(1-near)**power);
  const local=[Math.cos(angle),Math.sin(angle)];
  return quarterFraction>.5?[local[1],local[0]]:local;
}
function transverse(plan,components){return plan.u.map((value,i)=>value*components[0]+plan.v[i]*components[1]);}
function cartesianSurface(plan,components,height,angle=.73){
  const side=transverse(plan,components),radius=plan.radiusKm+height;
  const point=plan.axis.map((value,i)=>radius*(value*Math.cos(angle)+side[i]*Math.sin(angle)));
  return [point[0],point[1],point[2]*plan.polarRatio];
}
function cartesianLimb(plan,components,height){
  const side=transverse(plan,components),s=(plan.radiusKm+height)/plan.cameraRadius;
  const direction=plan.axis.map((value,i)=>-value*Math.sqrt(1-s*s)+side[i]*s);
  direction[2]*=plan.polarRatio;const length=norm(direction);
  return direction.map(value=>value/length);
}
function cardinalPlan(){
  const profile=getAtmosphereProfile('Mars'),q=BODY.Mars.polarKm/BODY.Mars.radiusKm;
  return planAtmosphereScattering(profile,{cameraBodyKm:[0,0,7000*q],sunDirectionBody:[1,0,0],polarRatio:q,
    minRadiusKm:profile.radiusKm-23.249,maxRadiusKm:profile.radiusKm+20});
}

test('current Earth and Mars terrain shapes preserve the fixed evaluation and storage budgets',()=>{
  for(const [name,shape,count] of [['Earth-elevated-10km',[128,49,9],64640],['Mars-terminator-terrain',[80,41,17],63952]]){
    const plan=planFor(fixtures.find(item=>item.name===name));
    assert.deepEqual(plan.surfaceSize,shape);assert.deepEqual(plan.limbSize,[128,64]);
    assert.equal(plan.evaluations,count);assert.equal(plan.bytes,count*16);
    assert.equal(validScatteringPlanBudget(plan),true);
  }
});

test('Mars surface quintic and limb cubic mappings retain every quadrant axis and periodic seam',()=>{
  const plan=cardinalPlan();assert.equal(plan.status,'ready');
  for(const [kind,power,size] of [['surface',5,plan.surfaceSize[0]],['limb',3,plan.limbSize[0]]]){
    for(let quadrant=0;quadrant<4;quadrant++)for(const fraction of [0,.001,.125,.37,.5,.73,.875,.999,1]){
      const components=rotateQuadrant(warpedComponents(fraction,power),quadrant);
      const coordinates=kind==='surface'?scatteringSurfaceCoordinates(plan,cartesianSurface(plan,components,4.1))
        :scatteringLimbCoordinates(plan,cartesianLimb(plan,components,37.13));
      assert.ok(coordinates);periodicClose(coordinates[0]/size,(quadrant+fraction)/4);
    }
  }
});

test('tiny angular offsets remain on the correct side of all four Mars quadrant axes',()=>{
  const plan=cardinalPlan();
  for(const [kind,power,size] of [['surface',5,plan.surfaceSize[0]],['limb',3,plan.limbSize[0]]]){
    for(let quadrant=0;quadrant<4;quadrant++)for(const magnitude of [1e-5,1e-8,1e-12,1e-16])for(const sign of [-1,1]){
      const components=rotateQuadrant([Math.cos(magnitude),sign*Math.sin(magnitude)],quadrant);
      const coordinates=kind==='surface'?scatteringSurfaceCoordinates(plan,cartesianSurface(plan,components,4.1))
        :scatteringLimbCoordinates(plan,cartesianLimb(plan,components,37.13));
      const angularFraction=magnitude/(Math.PI*.5);
      const a=angularFraction**(1/power),b=(1-angularFraction)**(1/power);
      const expected=quadrant/4+sign*.25*a/(a+b);
      assert.ok(coordinates);periodicClose(coordinates[0]/size,expected);
    }
  }
});

test('mapped off-grid surface endpoints reconstruct signed terrain and complete physical rays',()=>{
  for(const name of ['Mars-terminator-terrain','Mars-forward-terrain','Mars-near-top-terrain']){
    const plan=planFor(fixtures.find(item=>item.name===name));
    for(const height of [plan.heightRange[0]+.01,0,plan.heightRange[1]-.01])
      for(const fraction of [.173,.993,1,1.003,1.03])for(const u of [.03125,.24999,.25,.25001,.4991,.75,.99999]){
        const quarter=4*u,k=Math.floor(quarter);
        const components=rotateQuadrant(warpedComponents(quarter-k,5),k);
        const angle=Math.acos((plan.radiusKm+height)/plan.cameraRadius)*fraction;
        const surface=cartesianSurface(plan,components,height,angle);
        const mapped=scatteringSurfaceCoordinates(plan,surface);assert.ok(mapped);
        const mappedQuarter=4*mapped[0]/plan.surfaceSize[0],mappedK=Math.floor(mappedQuarter);
        const local=warpedComponents(mappedQuarter-mappedK,5);
        const azimuth=mappedK*Math.PI*.5+Math.atan2(local[1],local[0]);
        const mu=scatteringMuAt(plan,mapped[1]);
        const rebuilt=scatteringSurfaceRay(plan,azimuth,mu,scatteringHeightAt(plan,mapped[2],mu));
        const delta=surface.map((value,i)=>value-plan.cameraBodyKm[i]),distance=norm(delta);
        // Kilometre tolerance covers binary64 inverse/forward cancellation at the
        // retained distant camera; it is not a scattering or GPU solver tolerance.
        for(let i=0;i<3;i++){
          close(rebuilt.surface[i],surface[i],2e-8);
          close(rebuilt.direction[i],delta[i]/distance,1e-10);
        }
        close(rebuilt.maxDistance,distance,2e-8);
      }
  }
});

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
