// Additive synthetic solver qualification, separate from the frozen terrain and
// scattering-atlas corpora. These are geometric cases, not observed atmospheres.
import assert from 'node:assert/strict';

export const NEAR_GROUND_VISIBILITY_VERSION='near-ground-forward-intersection.v1';

/** Compare float64 truth for once-uploaded binary32 inputs with the real shader. */
export function nearGroundVisibilityFixtures(getProfile,uniformValues){
  const f32=value=>Array.isArray(value)?value.map(f32):typeof value==='number'?Math.fround(value):value;
  const cases=[];
  for(const body of ['Earth','Mars']){
    const admitted=getProfile(body);
    assert.ok(admitted,'Missing reference profile');
    const profile=Object.fromEntries(Object.entries(admitted).map(([key,value])=>[key,f32(value)]));
    for(const rawQ of [1,body==='Earth'?.9966:.9941]){
      const q=Math.fround(rawQ);
      for(const [kind,height,mu]of [['clear-inward',.001,-.0001],['ground-hit',.001,-.01],
        ['clear-outward',.001,.01],['subdatum-inward',-.001,-.0001]]){
        const origin=[Math.fround(profile.radiusKm+height),-2,0];
        const rawSun=[mu,0,q*Math.sqrt(1-mu*mu)];
        const uniforms=Object.fromEntries(Object.entries(uniformValues(profile,{cameraBodyKm:origin,
          sunDirectionBody:rawSun,polarRatio:q,solarDistanceAu:1,exposure:1}))
          .map(([key,value])=>[key,f32(value)]));
        cases.push({name:`${body} near-ground ${kind} q=${rawQ}`,body,profile,origin,
          direction:[0,1,0],sun:uniforms.u_atmosphereSunDirection,q,au:1,maximum:4,
          terrainEndpoint:true,viewSteps:128,solarSteps:512,uniforms,
          visibilityKind:kind,inputScope:'float32-uploaded-inputs-float64-geometry'});
      }
    }
  }
  return cases;
}
