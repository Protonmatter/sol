import test from 'node:test';
import assert from 'node:assert/strict';
import {nearGroundVisibilityFixtures} from '../../tools/atmosphere_visibility_fixtures.mjs';
import {getAtmosphereProfile,atmosphereUniformValues} from '../../apps/web/js/atmosphereOptics.js';
import {terrainEndpointFixtures} from '../../tools/atmosphere_terrain_candidate.mjs';

test('new visibility fixtures retain the existing corpus and exact uploaded inputs',()=>{
  const before=JSON.stringify(['Earth','Mars'].map(getAtmosphereProfile));
  const legacy=terrainEndpointFixtures(getAtmosphereProfile,atmosphereUniformValues);
  const cases=nearGroundVisibilityFixtures(getAtmosphereProfile,atmosphereUniformValues);
  assert.equal(cases.length,16);assert.equal(new Set(cases.map(c=>c.name)).size,16);
  assert.equal(legacy.length,16);
  assert.deepEqual(terrainEndpointFixtures(getAtmosphereProfile,atmosphereUniformValues),legacy);
  assert.equal(JSON.stringify(['Earth','Mars'].map(getAtmosphereProfile)),before);
  for(const c of cases){
    assert.equal(c.maximum,4);assert.equal(c.terrainEndpoint,true);
    assert.equal(c.inputScope,'float32-uploaded-inputs-float64-geometry');
    for(const value of [c.q,...c.origin,...c.sun,...Object.values(c.uniforms).flat()])
      assert.equal(value,Math.fround(value));
    assert.deepEqual(c.origin,c.uniforms.u_atmosphereCameraKm);
    assert.deepEqual(c.sun,c.uniforms.u_atmosphereSunDirection);
    assert.equal(c.profile.radiusKm,c.uniforms.u_atmosphereRadiusKm);
  }
});

test('clear inward rays have negative normal dot but a strictly positive planet clearance',()=>{
  for(const c of nearGroundVisibilityFixtures(getAtmosphereProfile,atmosphereUniformValues)){
    const R=c.profile.radiusKm,s=[c.sun[0],c.sun[1],c.sun[2]/c.q];
    const a=s.reduce((sum,v)=>sum+v*v,0);
    for(const y of [-2,0,2]){
      const p=[c.origin[0],y,0],dot=p.reduce((sum,v,j)=>sum+v*s[j],0);
      const closest=p.map((v,j)=>v-dot/a*s[j]);
      const clearance=Math.hypot(...closest)-R;
      if(c.visibilityKind==='clear-inward'){
        assert.ok(Math.hypot(...p)-R<.002);
        assert.ok(dot<0);assert.ok(clearance>.0009,`${c.name}: ${clearance}`);
      }else if(c.visibilityKind==='clear-outward')assert.ok(dot>0);
      else {assert.ok(dot<0);assert.ok(clearance<0);}
    }
  }
});
