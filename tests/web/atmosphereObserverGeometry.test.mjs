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
  u_atmosphereTopKm:Math.fround(top),u_atmospherePolarRatio:Math.fround(q),u_atmosphereSunDirection:[1,0,0]});
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
    ATMOSPHERE_GLSL.indexOf('// Exact exponential optical-coordinate'));
  assert.ok(sun.includes('atmosphereRayInterval(point,light,'));
  assert.ok(!sun.includes('atmosphereObserverInterval('));
});

test('generator source and conditioning share exactly one prepared path',()=>{
  const main=SCATTERING_GENERATOR_FS.slice(SCATTERING_GENERATOR_FS.lastIndexOf('void main(){'));
  assert.ok(main.includes('atmosphereSurfaceGeometry(u_atmosphereCameraKm,scatteringSurfacePoint('));
  assert.equal((main.match(/atmosphereCompletePath\(/g)||[]).length,1);
  assert.ok(main.includes('integrateAtmospherePrepared(path)'));
  assert.ok(main.includes('scatteringReferenceWeightPrepared(path)'));
  assert.equal((main.match(/integrateAtmospherePrepared\(/g)||[]).length,1);
});

test('prepared kernels cannot renormalize or reclip the observer path',()=>{
  const kernel=(source,name)=>{const start=source.indexOf(name+'('),brace=source.indexOf('{',start);let depth=1,end=brace+1;
    for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
    return source.slice(brace,end);};
  for(const [source,name]of [[ATMOSPHERE_GLSL,'integrateAtmospherePrepared'],
    [ATMOSPHERE_SCATTERING_GLSL,'scatteringReferenceWeightPrepared'],
    [ATMOSPHERE_SCATTERING_GLSL,'atmosphereScatteringIsZeroPrepared'],
    [ATMOSPHERE_SCATTERING_GLSL,'atmosphereViewTransmissionPrepared']]){
    const body=kernel(source,name);
    assert.doesNotMatch(body,/atmospherePrepare|atmosphereObserver(?:Segment|Interval)|normalize\((?:path\.ray|direction|ray)\)/);
  }
  for(const source of [ATMOSPHERE_SCATTERING_GLSL,ATMOSPHERE_SCATTERING_FS])
    assert.doesNotMatch(source,/AtmosphereResult integrateAtmosphere|atmosphereScatteredMonotonic|ATM_X12\[i\]/);
  assert.ok(ATMOSPHERE_SCATTERING_GLSL.includes('float height=path.height;'));
  assert.ok(ATMOSPHERE_SCATTERING_GLSL.includes('scatteringReferenceWeightPrepared(path)'));
});

test('shell and fixture source, transfer and domain use one original camera path',()=>{
  for(const source of [ATMOSPHERE_FS,ATMOSPHERE_SCATTERING_FS]){
    const main=source.slice(source.lastIndexOf('void main(){'));
    // One camera path per fragment: either prepared in one call, or built from geometry
    // and completed once after the disc discard.
    assert.equal((main.match(/atmospherePrepareObserver\(|atmosphereObserverGeometry\(/g)||[]).length,1);
    assert.ok((main.match(/atmosphereCompletePath\(/g)||[]).length<=1);
    assert.ok(main.includes('vec2 ground=path.ground;'));
    assert.doesNotMatch(main,/normalize\(/);
  }
  // The production scattering shell rejects disc fragments before the shadow interval.
  const shellMain=ATMOSPHERE_SCATTERING_FS.slice(ATMOSPHERE_SCATTERING_FS.lastIndexOf('void main(){'));
  assert.ok(shellMain.indexOf('discard;')<shellMain.indexOf('atmosphereCompletePath('));
  assert.ok(shellMain.indexOf('atmosphereCompletePath(')<shellMain.indexOf('atmosphereLimbScatteringPrepared(path)'));
  const fixture=fs.readFileSync(new URL('../../tools/scattering_validation.mjs',import.meta.url),'utf8');
  assert.ok(fixture.includes('outDomain=vec4(path.ground,path.outer)'));
  assert.ok(fixture.includes('integrateAtmospherePrepared(path)'));
  assert.ok(fixture.includes('atmosphereSurfaceScatteringPrepared('));
  assert.ok(fixture.includes('atmosphereViewTransmissionPrepared(path)'));
  assert.doesNotMatch(fixture,/vec3 ray=normalize\(delta\)/);
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

test('surface preparation alone preserves complete inside/outside and far-side geometry',()=>{
  for(const q of [1,.5])for(const [camera,point,entry,distance]of [
    [[10,0,0],[2,0,0],[3,0,0],1],[[10,0,0],[-2,0,0],[3,0,0],5],
    [[1,0,0],[2,0,0],[1,0,0],1],[[-10,0,0],[10,0,0],[-3,0,0],6],
    [[10,0,0],[0,0,0],[3,0,0],3],[[3,0,0],[1,0,0],[3,0,0],2],
  ]){
    // Rotate onto the polar axis and flatten it; this independently checks q.
    const polar=a=>[a[1],a[2],a[0]*q],g=globals(2,1,q);
    const result=prepared(polar(camera),polar(point),g);
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

const observerPath=(camera,direction,maximum,g=globals())=>interpreter.run('atmospherePrepareObserver',[camera,direction,maximum],g).value;
const surfacePath=(camera,point,g=globals())=>interpreter.run('atmospherePrepareSurface',[camera,point],g).value;

test('raw nonunit direction parameters convert to physical kilometres exactly once',()=>{
  for(const scale of [.25,1,2,8]){
    const path=observerPath([6,0,0],[-scale,0,0],3.5);
    vectorClose(path.entry,[3,0,0]);vectorClose(path.ray,[-1,0,0]);close(path.distance,.5);
    vectorClose(path.ground,[4,8]);vectorClose(path.outer,[3,9]);close(path.height,-2);
  }
  assert.equal(observerPath([6,0,0],[2,0,0],20).distance,0);
  assert.equal(observerPath([6,0,0],[0,0,0],20).distance,0);
});

test('surface paths keep camera-relative intervals and remove exterior suffixes',()=>{
  for(const sign of [-1,1]){
    const path=surfacePath([6*sign,0,0],[-6*sign,0,0]);
    vectorClose(path.entry,[3*sign,0,0]);vectorClose(path.ray,[-sign,0,0]);close(path.distance,6);
    vectorClose(path.ground,[4,8]);vectorClose(path.outer,[3,9]);
  }
  const front=surfacePath([6,0,0],[2,0,0]);close(front.distance,1);vectorClose(front.entry,[3,0,0]);
  assert.equal(surfacePath([6,0,0],[4,0,0]).distance,0);
  const inside=surfacePath([1,0,0],[2,0,0]);vectorClose(inside.entry,[1,0,0]);close(inside.distance,1);
  vectorClose(inside.ground,[-3,1]);
});

function independentHeight(camera,direction,q,radius){
  const [x,y,z]=camera,[a,b,c]=direction;
  const cross=[y*c-z*b,z*a-x*c,x*b-y*a];
  const squared=(cross[0]**2+cross[1]**2+q*q*cross[2]**2)/(q*q*(a*a+b*b)+c*c);
  return (squared-radius*radius)/(Math.sqrt(squared)+radius);
}

test('all ten retained grazing rays preserve raw input topology and stable limb height',()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/observerGrazingRays.json',import.meta.url),'utf8'));
  assert.equal(fixture.rays.length,10);
  for(const item of fixture.rays){
    const camera=item.camera.map(Math.fround),direction=item.direction.map(Math.fround),g=globals(item.radius,item.top,item.polarRatio);
    const path=observerPath(camera,direction,Math.fround(item.maximum),g);
    const height=independentHeight(camera,direction,g.u_atmospherePolarRatio,g.u_atmosphereRadiusKm);
    close(path.height,height,.0001);
    assert.equal(path.distance>0,height<g.u_atmosphereTopKm,item.name);
    const parametric=roots(camera,direction,Math.fround(item.radius+item.top),g.u_atmospherePolarRatio);
    const norm=Math.fround(Math.sqrt(direction.reduce((a,v)=>Math.fround(a+Math.fround(v*v)),0)));
    assert.deepEqual(path.outer,parametric[1]<parametric[0]?[1,-1]:parametric.map(v=>Math.fround(v*norm)));
  }
});

test('reciprocal normalization regression demonstrates why raw topology precedes normalization',()=>{
  const item=JSON.parse(fs.readFileSync(new URL('./fixtures/observerGrazingRays.json',import.meta.url),'utf8')).rays.find(r=>r.name==='Earth-forward-oblique/limb/130');
  const f=Math.fround,norm=v=>{const d=v.reduce((a,b)=>f(a+f(b*b)),0),inv=f(1/f(Math.sqrt(d)));return v.map(x=>f(x*inv));};
  const camera=item.camera.map(f),once=norm(item.direction.map(f)),twice=norm(once),g=globals(item.radius,item.top,item.polarRatio);
  assert.notDeepEqual(once,twice);
  assert.ok(independentHeight(camera,once,g.u_atmospherePolarRatio,g.u_atmosphereRadiusKm)>item.top);
  assert.ok(independentHeight(camera,twice,g.u_atmospherePolarRatio,g.u_atmosphereRadiusKm)<item.top);
  assert.equal(observerPath(camera,once,f(item.maximum),g).distance,0);
});
