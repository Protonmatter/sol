import * as scattering from '../../apps/web/js/atmosphereScattering.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {physicalProgramSources,physicalProgramKey,specializeScatteringSource,PHYSICAL_PROGRAM_ROLES} from '../../apps/web/js/physicalProgramSources.js';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';
import {SCATTERING_GENERATOR_FS,ATMOSPHERE_SCATTERING_FS} from '../../apps/web/js/atmosphereScattering.js';
import {SCATTERING_SPHERE_FS} from '../../apps/web/js/orreryShaders.js';

test('profile variants replace only the admitted binary32 scale-height predicate',()=>{
  const source='if(u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y){same();}else{different();}\n'
    +'if(u_atmosphereDensityScaleKm.x!=u_atmosphereDensityScaleKm.y){different();}';
  for(const body of ['Earth','Mars']){
    const p=getAtmosphereProfile(body),equal=Math.fround(p.rayleighScaleHeightKm)===Math.fround(p.aerosolScaleHeightKm);
    assert.equal(specializeScatteringSource(source,body),`if(${equal}){same();}else{different();}\nif(${!equal}){different();}`);
  }
});

test('immutable body-specific sources retain every other formula and the generic oracle',()=>{
  const generic={physicalSphere:SCATTERING_SPHERE_FS,atmosphere:ATMOSPHERE_SCATTERING_FS,scatteringGenerator:SCATTERING_GENERATOR_FS};
  for(const body of ['Earth','Mars']){
    const programs=physicalProgramSources(body);
    assert.equal(physicalProgramSources(body),programs,'repeat selection must keep source object identity');
    assert.ok(Object.isFrozen(programs));
    for(const role of Object.keys(generic)){
      assert.ok(Object.isFrozen(programs[role]));
      assert.equal(programs[role].fragment,specializeScatteringSource(generic[role],body));
      assert.ok(programs[role].vertex.startsWith('#version 300 es'));
      assert.notEqual(programs[role].fragment,generic[role]);
    }
  }
  assert.ok(SCATTERING_GENERATOR_FS.includes('for(int i=0;i<12;i++)'));
  assert.ok(SCATTERING_GENERATOR_FS.includes('u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y'));
  assert.notEqual(physicalProgramSources('Earth').scatteringGenerator.fragment,physicalProgramSources('Mars').scatteringGenerator.fragment);
});

test('program keys cannot substitute a different body or admit an unsupported profile',()=>{
  const keys=new Set();
  for(const body of ['Earth','Mars'])for(const role of ['physicalSphere','atmosphere','scatteringGenerator']){
    keys.add(physicalProgramKey(body,role));
    assert.ok(physicalProgramKey(body,role).length<=80);
  }
  assert.equal(keys.size,6);
  for(const body of ['',null,'Venus','__proto__',{},'earth']){
    assert.throws(()=>physicalProgramSources(body),/profile|body/i);
    assert.throws(()=>physicalProgramKey(body,'atmosphere'),/profile|body/i);
  }
  for(const role of ['',null,'base','__proto__',{}])assert.throws(()=>physicalProgramKey('Earth',role),/role/i);
  assert.throws(()=>specializeScatteringSource('void main(){}','Earth'),/predicate|source/i);
});

test('live paired roles retain the legacy complete generator as an unchanged oracle',()=>{
  assert.deepEqual(PHYSICAL_PROGRAM_ROLES,['physicalSphere','atmosphere','scatteringNumerator','scatteringResolve']);
  for(const body of ['Earth','Mars']){
    const p=physicalProgramSources(body);
    assert.ok(p.scatteringNumerator,'numerator source required');assert.ok(p.scatteringResolve,'resolve source required');
    assert.equal(p.scatteringGenerator.fragment,specializeScatteringSource(SCATTERING_GENERATOR_FS,body));
    assert.equal(p.scatteringNumerator.fragment,specializeScatteringSource(scattering.SCATTERING_NUMERATOR_FS,body));
    assert.equal(p.scatteringResolve.fragment,specializeScatteringSource(scattering.SCATTERING_RESOLVE_FS,body));
    for(const role of [...PHYSICAL_PROGRAM_ROLES,'scatteringGenerator'])assert.equal(physicalProgramKey(body,role),body+':'+role);
    assert.ok(Object.isFrozen(p.scatteringNumerator)&&Object.isFrozen(p.scatteringResolve));
  }
});
