import test from 'node:test';
import assert from 'node:assert/strict';
import {LOOK_RECIPE,SOLAR_LOOK_GLSL,lookSettings} from '../../apps/web/js/solarLookShaders.js';
import {DYNAMIC_SOLAR_FS} from '../../apps/web/js/solarAtmosphereShaders.js';
import {strandWidthScale} from '../../apps/web/js/solarStrandRenderer.js';

test('look layer is EUV-only and opt-in',()=>{
  assert.deepEqual(lookSettings({look:true,channel:'euv'}),{look:1,strandWidthScale:LOOK_RECIPE.strandWidthScale});
  assert.deepEqual(lookSettings({look:true}),{look:1,strandWidthScale:LOOK_RECIPE.strandWidthScale});
  for(const args of [{look:true,channel:'visible'},{look:false,channel:'euv'},{look:1,channel:'euv'},{},undefined])
    assert.deepEqual(lookSettings(args),{look:0,strandWidthScale:1});
});

test('strand width factor accepts only (0,1]',()=>{
  assert.equal(strandWidthScale(.45),.45);assert.equal(strandWidthScale(1),1);
  for(const value of [0,-.5,1.5,NaN,Infinity,undefined,'0.5'])assert.equal(strandWidthScale(value),1);
});

test('recipe is frozen and fully substituted into the shader',()=>{
  assert.ok(Object.isFrozen(LOOK_RECIPE));
  assert.ok(LOOK_RECIPE.strandWidthScale>0&&LOOK_RECIPE.strandWidthScale<=1);
  assert.doesNotMatch(SOLAR_LOOK_GLSL,/\$\{|undefined|NaN/);
  assert.match(SOLAR_LOOK_GLSL,new RegExp(`k<${LOOK_RECIPE.loopPlanes};`));
  assert.match(SOLAR_LOOK_GLSL,new RegExp(LOOK_RECIPE.promWidthR.toFixed(6)));
  // GLSL ES reserves these words; an identifier using one fails to compile.
  for(const word of ['active','input','output','filter','common','partition'])
    assert.doesNotMatch(SOLAR_LOOK_GLSL,new RegExp(`\\b(float|vec3|int)\\s+${word}\\b`));
});

test('dynamic shader includes the layer once, after advection, gated by u_look',()=>{
  assert.equal(DYNAMIC_SOLAR_FS.split('float lookEmission(').length,2);
  assert.ok(DYNAMIC_SOLAR_FS.indexOf('vec3 advected(')<DYNAMIC_SOLAR_FS.indexOf('float lookFur('));
  assert.match(DYNAMIC_SOLAR_FS,/if\(u_look==0\)return 0\.;/);
  assert.match(DYNAMIC_SOLAR_FS,/u_pass!=1&&u_showCorona!=0\)emission\+=lookEmission\(/);
});

test('lab palette survives the presentation tone map at zero stops',async()=>{
  const {presentationColor}=await import('../../apps/web/js/hdrPresentation.js');
  const {lookPalette,lookPresentationLinear}=await import('../../apps/web/js/solarLookShaders.js');
  for(const intensity of [0,.1,.4,1,2.5]){
    const display=lookPalette(intensity),shown=presentationColor(lookPresentationLinear(display),1);
    // Channels at or below the .985 linear cap round-trip exactly; brighter ones clip.
    display.forEach((value,i)=>{if(value<.99)assert.ok(Math.abs(shown[i]-value)<1e-6,`${intensity}[${i}] ${shown[i]} vs ${value}`);});
  }
  assert.deepEqual(lookPalette(-1),[0,0,0]);
  assert.ok(lookPresentationLinear([2,-1,1]).every(Number.isFinite));
});

test('composition shader carries the look palette and bloom behind u_look',async()=>{
  const {LOOK_COMPOSE_GLSL}=await import('../../apps/web/js/solarLookShaders.js');
  assert.match(LOOK_COMPOSE_GLSL,/vec3 lookPalette\(float i\)/);
  assert.match(LOOK_COMPOSE_GLSL,/vec3 lookPresentationLinear\(vec3 d\)/);
});
