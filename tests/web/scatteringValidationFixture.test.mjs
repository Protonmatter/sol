import {physicalProgramSources} from '../../apps/web/js/physicalProgramSources.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as scattering from '../../apps/web/js/atmosphereScattering.js';
import * as optics from '../../apps/web/js/atmosphereOptics.js';
import {createValidationTargetFactory} from '../../tools/scattering_target_fixture.mjs';

function fixture(units=16,paired=false){
  const draws=[],uniforms=new Map(),textures=new Map();let unit=0,allocations=0;
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,MAX_TEXTURE_SIZE:5,MAX_TEXTURE_IMAGE_UNITS:6,
    TEXTURE0:100,TEXTURE_2D:7,RGBA32F:8,RGBA:9,FLOAT:10,FRAMEBUFFER:11,FRAMEBUFFER_COMPLETE:12,
    COLOR_ATTACHMENT0:13,NO_ERROR:0,TRIANGLES:14,
    getExtension:()=>({}),getParameter:name=>name===5?16384:units,
    createShader:()=>{allocations++;return {};},shaderSource(){},compileShader(){},getShaderParameter:()=>true,
    createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,getUniformLocation:(_p,name)=>name,
    createFramebuffer:()=>({}),createTexture:()=>({}),bindFramebuffer(){},framebufferTexture2D(){},
    activeTexture:value=>{unit=value-100;},bindTexture:(_target,value)=>{textures.set(unit,value);},
    texImage2D(){},texParameteri(){},checkFramebufferStatus:()=>12,getError:()=>0,
    useProgram(){},uniform1i:(name,value)=>uniforms.set(name,value),uniform1f(){},uniform2fv(){},uniform3fv(){},uniform3iv(){},uniform2iv(){},
    disable(){},enable(){},depthMask(){},blendFunc(){},viewport(){},
    drawArrays(){draws.push({column:textures.get(7),ozone:textures.get(10),ozoneUnit:uniforms.get('u_atmosphereOzoneField')});},
    deleteTexture(){},deleteFramebuffer(){},deleteShader(){},deleteProgram(){},
  };
  const profile=optics.getAtmosphereProfile('Earth'),opticalOptions={cameraBodyKm:[0,0,14000],sunDirectionBody:[1,0,0],polarRatio:1,solarDistanceAu:1,exposure:1};
  const plan=scattering.planAtmosphereScattering(profile,opticalOptions);
  const shaders=physicalProgramSources('Earth');
  const source=paired?{...scattering,SCATTERING_TWO_STAGE:true,SCATTERING_NUMERATOR_FS:shaders.scatteringNumerator.fragment,SCATTERING_RESOLVE_FS:shaders.scatteringResolve.fragment}:scattering;
  const target=createValidationTargetFactory(source,optics)(gl,plan);
  return {target,draws,allocations,args:{plan,profile,opticalOptions,columnTexture:{column:true},ozoneTexture:{packed:true},restoreViewport:[16,16]}};
}

test('numerical fixture binds the packed optical companion at unit ten before both generator passes',()=>{
  const h=fixture();assert.equal(h.target.status,'ready');assert.equal(h.target.generate(h.args),true);
  assert.deepEqual(h.draws,Array.from({length:2},()=>({column:h.args.columnTexture,ozone:h.args.ozoneTexture,ozoneUnit:10})));
  h.target.dispose();
});

test('missing optical companion cannot submit an unbound sampler or claim successful generation',()=>{
  const h=fixture();assert.equal(h.target.generate({...h.args,ozoneTexture:null}),false);
  assert.deepEqual(h.draws,[]);assert.equal(h.target.status,'unavailable');assert.match(h.target.reason,/optical companion/i);
});

test('ten texture units cannot admit a fixture which requires unit ten',()=>{
  const h=fixture(10);assert.equal(h.target.status,'unavailable');assert.match(h.target.reason,/device limits/i);
  assert.equal(h.allocations,0,'reject the unsupported unit budget before shader allocation');
});

test('live numerical fixture explicitly opts into four draws and counts intermediate payload',()=>{
  const h=fixture(16,true);assert.equal(h.target.status,'ready');assert.equal(h.target.generate(h.args),true);
  assert.equal(h.draws.length,4);assert.equal(h.target.bytes,2*h.args.plan.bytes);assert.equal(h.target.scratchBytes,h.args.plan.bytes);
  assert.ok(h.target.bytes<=2097152);h.target.dispose();assert.deepEqual(h.target.cleanupErrors,[]);
});
