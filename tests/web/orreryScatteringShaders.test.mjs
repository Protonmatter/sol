import assert from 'node:assert/strict';
import test from 'node:test';
import * as shaders from '../../apps/web/js/orreryShaders.js';
import {ATMOSPHERE_RENDER_GLSL} from '../../apps/web/js/atmosphereColumnField.js';

test('physical consumer specializations retain the original shader oracle without final scattering quadrature',()=>{
  assert.ok(shaders.SPHERE_FS.includes(ATMOSPHERE_RENDER_GLSL),'original reference shader remains available');
  for(const source of [shaders.SCATTERING_SPHERE_VS,shaders.SCATTERING_SPHERE_FS]){
    assert.equal(typeof source,'string');
    assert.ok(!source.includes('vec3 atmosphereScatteredMonotonic('));
    assert.ok(!source.includes('AtmosphereResult integrateAtmosphere('));
  }
  assert.match(shaders.SCATTERING_SPHERE_VS,/atmosphereIncidentLookup\(/);
  assert.match(shaders.SCATTERING_SPHERE_FS,/atmosphereSurfaceScattering\(/);
});

test('consumer uses the unchanged displaced endpoint and a separately bound optical datum',()=>{
  const endpoint='vec3 surfaceBodyKm=vec3(surfaceObject.xy,surfaceObject.z*u_oblate)*u_bodyRadiusKm;';
  assert.ok(shaders.SPHERE_FS.includes(endpoint));
  assert.ok(shaders.SCATTERING_SPHERE_FS?.includes(endpoint));
  assert.match(shaders.SCATTERING_SPHERE_FS,/uniform float u_scatteringReferenceHeightKm;/);
  assert.match(shaders.SCATTERING_SPHERE_FS,/atmosphereSurfaceColor\(col,surfaceBodyKm,\(v_surfaceScale-1\.0\)\*u_bodyRadiusKm\+u_scatteringReferenceHeightKm\)/);
});
