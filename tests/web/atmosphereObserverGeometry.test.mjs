import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ATMOSPHERE_GLSL,ATMOSPHERE_FS} from '../../apps/web/js/atmosphereShaders.js';
import {ATMOSPHERE_RENDER_GLSL} from '../../apps/web/js/atmosphereColumnField.js';
import {ATMOSPHERE_LIGHT_GLSL,SCATTERING_GENERATOR_FS,ATMOSPHERE_SCATTERING_GLSL,
  ATMOSPHERE_SCATTERING_FS} from '../../apps/web/js/atmosphereScattering.js';
import {geometryInterpreter} from './fixtures/glslFloat32Geometry.mjs';

const helpers=ATMOSPHERE_GLSL.slice(ATMOSPHERE_GLSL.indexOf('vec2 atmosphereExactProduct('),
  ATMOSPHERE_GLSL.indexOf('float atmosphereHeight('));
const interpreter=geometryInterpreter(helpers);
const globals=(radius=2,top=1,q=1)=>({u_atmosphereRadiusKm:Math.fround(radius),
  u_atmosphereTopKm:Math.fround(top),u_atmospherePolarRatio:Math.fround(q)});
const roots=(origin,direction,radius=2,q=1)=>interpreter.run('atmosphereObserverInterval',
  [origin,direction,radius],globals(radius,1,q)).value;
const prepared=(camera,point,g=globals())=>interpreter.run('atmosphereSurfaceSegment',
  [camera,point,undefined,undefined,undefined],g).locals;
const clipped=(segment,g=globals())=>interpreter.run('atmosphereObserverSegment',
  [segment.entry,segment.ray,segment.distance,undefined,undefined,undefined],g).locals;
const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const vectorClose=(a,b,tol=1e-6)=>a.forEach((v,i)=>close(v,b[i],tol));

test('observer precision helpers survive both direct and bounded source routes',()=>{
  for(const source of [ATMOSPHERE_GLSL,ATMOSPHERE_RENDER_GLSL,ATMOSPHERE_LIGHT_GLSL]){
    assert.ok(source.includes('vec2 atmosphereObserverInterval('));
    assert.ok(source.includes('void atmosphereObserverSegment('));
    assert.ok(source.includes('void atmosphereSurfaceSegment('));
  }
  const sun=ATMOSPHERE_GLSL.slice(ATMOSPHERE_GLSL.indexOf('vec3 atmosphereSunTransmission('),
    ATMOSPHERE_GLSL.indexOf('vec2 atmosphereShadowInterval('));
  assert.ok(sun.includes('atmosphereRayInterval(point,light,'));
  assert.ok(!sun.includes('atmosphereObserverInterval('));
});

test('generator source and conditioning share a locally constructed surface segment',()=>{
  assert.ok(SCATTERING_GENERATOR_FS.includes('vec3 scatteringSurfacePoint('));
  assert.ok(SCATTERING_GENERATOR_FS.includes('atmosphereSurfaceSegment(u_atmosphereCameraKm,scatteringSurfacePoint('));
  assert.ok(SCATTERING_GENERATOR_FS.includes('integrateAtmosphere(origin,direction,maximum)'));
  assert.ok(SCATTERING_GENERATOR_FS.includes('scatteringReferenceWeight(origin,direction,maximum)'));
});

test('surface consumer source and transmission use endpoint geometry without adding direct quadrature',()=>{
  assert.ok(ATMOSPHERE_SCATTERING_GLSL.includes('atmosphereSurfaceSegment(u_atmosphereCameraKm,surfaceBodyKm,'));
  assert.ok(ATMOSPHERE_SCATTERING_GLSL.includes('scatteringReferenceWeight(entry,ray,distance)'));
  assert.ok(ATMOSPHERE_SCATTERING_GLSL.includes('atmosphereViewTransmission(entry,ray,distance)'));
  assert.ok(!ATMOSPHERE_SCATTERING_GLSL.includes('AtmosphereResult integrateAtmosphere('));
});

test('shell and fixture observer domain checks route through the compensated root',()=>{
  for(const source of [ATMOSPHERE_FS,ATMOSPHERE_SCATTERING_FS])
    assert.ok(source.includes('atmosphereObserverInterval(u_atmosphereCameraKm,direction,u_atmosphereRadiusKm)'));
  const fixture=fs.readFileSync(new URL('../../tools/scattering_validation.mjs',import.meta.url),'utf8');
  assert.ok(fixture.includes('atmosphereSurfaceSegment(u_atmosphereCameraKm,a.xyz,'));
  assert.ok(fixture.includes('atmosphereObserverInterval('));
  assert.ok(fixture.includes('integrateAtmosphere(traceOrigin,traceRay,traceDistance)'));
});

test('actual compensated helper preserves analytic roots, scaling, tangency and miss semantics',()=>{
  assert.deepEqual(roots([6,0,0],[-2,0,0]),[2,4]);
  assert.deepEqual(roots([6,0,0],[2,0,0]),[-4,-2]);
  assert.deepEqual(roots([0,0,3],[0,0,-2],2,.5),[1,2]);
  assert.deepEqual(roots([0,0,0],[1,0,0]),[-2,2]);
  assert.deepEqual(roots([-6,2,0],[2,0,0]),[3,3]);
  assert.deepEqual(roots([-6,2+2**-12,0],[2,0,0]),[1,-1]);
  const hit=roots([-6,2-2**-12,0],[2,0,0]);assert.ok(hit[1]>hit[0]);
});

test('surface preparation and subsequent clipping preserve inside/outside and far-side geometry',()=>{
  for(const q of [1,.5])for(const [camera,point,entry,distance]of [
    [[10,0,0],[2,0,0],[3,0,0],1],[[10,0,0],[-2,0,0],[3,0,0],5],
    [[1,0,0],[2,0,0],[1,0,0],1],[[-10,0,0],[10,0,0],[-3,0,0],6],
    [[10,0,0],[0,0,0],[3,0,0],3],[[3,0,0],[1,0,0],[3,0,0],2],
  ]){
    // Rotate onto the polar axis and flatten it; this independently checks q.
    const polar=a=>[a[1],a[2],a[0]*q],g=globals(2,1,q);
    const result=clipped(prepared(polar(camera),polar(point),g),g);
    vectorClose(result.entry,polar(entry));close(result.distance,distance*q);
  }
  for(const [camera,point]of [[[10,0,0],[8,0,0]],[[1,0,0],[1,0,0]],
    [[-10,4,0],[10,4,0]],[[3,0,0],[4,0,0]],[[-10,3,0],[10,3,0]]])
    assert.equal(clipped(prepared(camera,point)).distance,0);
});

test('once-uploaded Mars top miss is preserved by actual binary32 helper arithmetic',()=>{
  const camera=[54246.359375,0,-40636.83984375];
  const ray=[-.7684627771377563,3.159423794271802e-18,.6398944854736328];
  assert.deepEqual(roots(camera,ray,3496.18994140625,.9941110610961914),[1,-1]);
  // Independent binary64 cross-product distance, including exact uploaded q.
  const q=.9941110610961914,p=[camera[0],camera[1],camera[2]/q],d=[ray[0],ray[1],ray[2]/q];
  const cross=[p[1]*d[2]-p[2]*d[1],p[2]*d[0]-p[0]*d[2],p[0]*d[1]-p[1]*d[0]];
  close(Math.hypot(...cross)/Math.hypot(...d)-3496.18994140625,.0012235648296154977,1e-8);
});

test('endpoint preparation keeps the observed Earth grazing path above its actual datum',()=>{
  const camera=[73135.3671875,0,67967.953125],surface=[4336.2568359375,-2333.6845703125,-4039.7919921875];
  const q=.9965999722480774,R=6378.13720703125,g=globals(R,100,q),segment=clipped(prepared(camera,surface,g),g);
  const endpoint=segment.entry.map((v,i)=>v+segment.ray[i]*segment.distance);
  vectorClose(endpoint,surface,.001);
  const p=[segment.entry[0],segment.entry[1],segment.entry[2]/q],d=[segment.ray[0],segment.ray[1],segment.ray[2]/q];
  const center=-p.reduce((sum,v,i)=>sum+v*d[i],0)/d.reduce((sum,v)=>sum+v*v,0);
  const height=Math.hypot(...p.map((v,i)=>v+center*d[i]))-R;
  assert.ok(height>0);close(height,.0029042558626315445,.001);
});

test('actual local generator endpoint obeys independent radius and signed ray-angle identities',()=>{
  const start=SCATTERING_GENERATOR_FS.indexOf('vec3 scatteringSurfacePoint(');
  const end=SCATTERING_GENERATOR_FS.indexOf('float scatteringAzimuth(',start);
  const local=geometryInterpreter(SCATTERING_GENERATOR_FS.slice(start,end));
  for(const q of [1,.5,.9941110610961914])for(const cameraRadius of [10,1e5])
    for(const mu of [-1,-.7,0,.3,1])for(const azimuth of [0,.73,Math.PI]){
      const radius=3,components=[Math.fround(Math.cos(azimuth)),Math.fround(Math.sin(azimuth))];
      const uniforms={u_atmospherePolarRatio:q,u_scatteringCameraRadius:cameraRadius,
        u_scatteringAxis:[0,0,1],u_scatteringU:[1,0,0],u_scatteringV:[0,1,0]};
      const point=local.run('scatteringSurfacePoint',[components,radius,mu],uniforms).value;
      const metric=[point[0],point[1],point[2]/q],delta=[metric[0],metric[1],metric[2]-cameraRadius];
      close(Math.hypot(...metric),radius,1e-6);
      close(metric.reduce((sum,v,i)=>sum+v*delta[i],0)/(radius*Math.hypot(...delta)),mu,2e-7);
    }
});
