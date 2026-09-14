import assert from 'node:assert/strict';
import test from 'node:test';
import * as shaders from '../../apps/web/js/orreryShaders.js';
import {ATMOSPHERE_RENDER_GLSL} from '../../apps/web/js/atmosphereColumnField.js';
import {ATMOSPHERE_SCATTERING_GLSL} from '../../apps/web/js/atmosphereScattering.js';
import fs from 'node:fs';

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

test('bounded physical material admits only the observable runtime mode and neutral style',()=>{
  const consumer=shaders.SCATTERING_SPHERE_FS;
  assert.match(consumer,/if\(u_mode!=0\|\|u_style!=-1\) discard;/);
  assert.doesNotMatch(consumer,/if\(u_mode==[12]\)/);
  assert.doesNotMatch(consumer,/else if\(u_style==/);
  for(const reference of [shaders.SPHERE_FS,shaders.BASE_SPHERE_FS]){
    assert.match(reference,/if\(u_mode==2\)/);
    assert.match(reference,/if\(u_mode==1\)/);
    for(let style=1;style<=12;style++)assert.ok(reference.includes(`else if(u_style==${style})`));
    assert.doesNotMatch(reference,/if\(u_mode!=0\|\|u_style!=-1\) discard;/);
  }
});

test('material specialization preserves every source lookup and the complete lighting tail verbatim',()=>{
  const reference=shaders.SPHERE_FS.replace(ATMOSPHERE_RENDER_GLSL,ATMOSPHERE_SCATTERING_GLSL)
    .replace('uniform float u_bodyRadiusKm;','uniform float u_bodyRadiusKm;\nuniform float u_scatteringReferenceHeightKm;')
    .replace('atmosphereSurfaceColor(col,surfaceBodyKm)',
      'atmosphereSurfaceColor(col,surfaceBodyKm,(v_surfaceScale-1.0)*u_bodyRadiusKm+u_scatteringReferenceHeightKm)');
  const slice=(source,begin,end)=>source.slice(source.indexOf(begin),end?source.indexOf(end):undefined);
  assert.equal(slice(shaders.SCATTERING_SPHERE_FS,'  // Equirectangular lookup:','  // Real IAU albedo units'),
    slice(reference,'  // Equirectangular lookup:','  else if(u_style==1){'));
  assert.equal(slice(shaders.SCATTERING_SPHERE_FS,'  // Real IAU albedo units'),slice(reference,'  // Real IAU albedo units'));
  assert.equal(slice(shaders.SCATTERING_SPHERE_FS,'#version','void main(){'),slice(reference,'#version','void main(){'));
});

test('runtime uploads mode and neutral style before the admitted physical body submission',()=>{
  const renderer=fs.readFileSync(new URL('../../apps/web/js/orrery.js',import.meta.url),'utf8');
  const draw=renderer.slice(renderer.indexOf('function drawBody('),renderer.indexOf('function drawMoons('));
  const style=draw.indexOf('gl.uniform1i(sphereUniforms.u_style, -1);');
  const mode=draw.indexOf('gl.uniform1i(sphereUniforms.u_mode, b.name === "Sun" ? 1 : 0);');
  assert.ok(style>=0&&mode>style);
  assert.match(draw,/profile\?P\.physicalSphere:P\.sphere/);
  assert.match(draw,/getAtmosphereProfile\(b.name\)/);
});

test('source specialization refuses missing, duplicated, and reversed section boundaries',()=>{
  const moduleSource=fs.readFileSync(new URL('../../apps/web/js/orreryShaders.js',import.meta.url),'utf8');
  const start=moduleSource.indexOf('function physicalMaterialSource('),end=moduleSource.indexOf('export const SCATTERING_SPHERE_VS');
  assert.ok(start>=0&&end>start);
  const specialize=Function(`${moduleSource.slice(start,end)};return physicalMaterialSource;`)();
  for(const boundary of ['  if(u_mode==2){','  // Equirectangular lookup:','  else if(u_style==1){','  // Real IAU albedo units']){
    assert.throws(()=>specialize(shaders.SPHERE_FS.replace(boundary,'')),/boundary changed/);
    assert.throws(()=>specialize(shaders.SPHERE_FS+boundary),/boundary changed/);
  }
  assert.throws(()=>specialize('  // Equirectangular lookup:\n  if(u_mode==2){\n  else if(u_style==1){\n  // Real IAU albedo units'),/order changed/);
});
