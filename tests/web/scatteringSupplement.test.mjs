import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {scatteringSupplementalCases,scatteringTerrainMeshSamples,assessExplicitHeightRejection} from '../../tools/scattering_validation_supplement.mjs';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';
import {BODY} from '../../apps/web/js/bodyData.js';
import {terrainReference,decodeTerrain} from '../../apps/web/js/terrainAssets.js';
import {buildTerrainMesh} from '../../apps/web/js/terrainGeometry.js';

const reference=terrainReference('Mars');
const bytes=fs.readFileSync(new URL('../../apps/web/'+reference.path,import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),reference.sha256);
const grid=decodeTerrain(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),reference);
const mesh=buildTerrainMesh(grid,{latSegments:256,lonSegments:512,
  equatorialRadiusKm:BODY.Mars.radiusKm,polarRadiusKm:BODY.Mars.polarKm});
function dataset(name,body,D,latitude=0){
  const profile=getAtmosphereProfile(body),q=name==='Mars-terminator-terrain'?.9941:BODY[body].polarKm/BODY[body].radiusKm,a=latitude*Math.PI/180;
  return {name,body,profile,radiusKm:profile.radiusKm,topKm:profile.topKm,cameraRadius:D,
    latitude,phase:0,polarRatio:q,bounds:body==='Mars'?{minRadiusKm:3373.069,maxRadiusKm:3417.241}:{referenceRadiusKm:BODY.Earth.radiusKm},
    options:{cameraBodyKm:[D*Math.cos(a),0,D*Math.sin(a)*q],sunDirectionBody:[1,0,0],polarRatio:q,solarDistanceAu:1,exposure:1},
    queries:[{name:'retained-original-sentinel',kind:'surface',surface:[1,2,3],heightKm:0}]};
}
const legacy=[dataset('Earth-day','Earth',8000),dataset('Earth-forward-oblique','Earth',100000,43),
  dataset('Earth-near-top','Earth',6478.237,17),dataset('Mars-day-terrain','Mars',5000),dataset('Mars-terminator-terrain','Mars',7000,70)];
const options={terrainReference:reference,terrainMesh:mesh,bodyCatalogue:BODY};
const cases=scatteringSupplementalCases(legacy,options);

test('supplement preserves every input and binds the actual source bounds and identity',()=>{
  const before=JSON.stringify(legacy),again=scatteringSupplementalCases(legacy,options);
  assert.equal(JSON.stringify(legacy),before);assert.deepEqual(cases,again);
  assert.equal(cases.length,5);assert.equal(new Set(cases.map(d=>d.name)).size,5);
  for(const d of cases){
    assert.ok(d.supplement.explicitHeight);assert.ok(d.queries.every(q=>q.kind==='limb'||Number.isFinite(q.explicitHeightKm)));
    if(d.body==='Mars'){
      assert.deepEqual(d.bounds,{referenceRadiusKm:3396.2,minRadiusKm:3372.941,maxRadiusKm:3417.272});
      assert.equal(d.supplement.source.sha256,reference.sha256);
      assert.equal(d.polarRatio,BODY.Mars.polarKm/BODY.Mars.radiusKm);
      assert.equal(d.options.polarRatio,d.polarRatio);
      assert.ok(Math.abs(Math.hypot(d.options.cameraBodyKm[0],d.options.cameraBodyKm[1],d.options.cameraBodyKm[2]/d.polarRatio)-d.cameraRadius)<1e-10);
      assert.equal(d.supplement.heightEnvelopeKm[0],3372.941-d.radiusKm);
      assert.equal(d.supplement.heightEnvelopeKm[1],3417.272/d.polarRatio-d.radiusKm);
    }else assert.ok(d.queries.filter(q=>q.kind==='surface'&&!q.expectedHeightRejection)
      .every(q=>q.explicitHeightKm===BODY.Earth.radiusKm-d.radiusKm));
  }
});

test('source-bound samples include extrema, poles, seam and actual triangle interpolation',()=>{
  const sampled=scatteringTerrainMeshSamples(mesh,BODY.Mars,getAtmosphereProfile('Mars'));
  assert.equal(sampled.vertexCount,131841);assert.ok(sampled.samples.length>=16);
  assert.ok(sampled.samples.some(s=>s.heightKm===sampled.minimumExplicitHeightKm));
  assert.ok(sampled.samples.some(s=>s.heightKm===sampled.maximumExplicitHeightKm));
  assert.equal(sampled.samples.filter(s=>s.vertexIndices.length===3).length,7);
  for(const s of sampled.samples){
    const q=BODY.Mars.polarKm/BODY.Mars.radiusKm;
    const reconstructed=Math.hypot(s.surface[0],s.surface[1],s.surface[2]/q)-getAtmosphereProfile('Mars').radiusKm;
    assert.ok(Math.abs(reconstructed-s.heightKm)<3e-12);
    assert.ok(Math.abs(s.weights.reduce((a,b)=>a+b,0)-1)<1e-15);
  }
});

test('independent Cartesian queries straddle true ground tangency and retain both endpoints',()=>{
  for(const d of cases.filter(d=>d.body==='Mars')){
    const rays=d.queries.filter(q=>q.coverage==='ground-tangency-topology');assert.equal(rays.length,54);
    assert.deepEqual(new Set(rays.map(q=>q.side)),new Set([-1,1]));
    for(const query of rays){
      const c=[...d.options.cameraBodyKm],ray=[...query.direction];c[2]/=d.polarRatio;ray[2]/=d.polarRatio;
      const t=-c.reduce((s,x,i)=>s+x*ray[i],0)/ray.reduce((s,x)=>s+x*x,0);
      const impact=Math.hypot(...c.map((x,i)=>x+t*ray[i]))-d.radiusKm;
      assert.ok(Math.abs(impact-query.impactHeightKm)<5e-10);
      const p=query.surface;
      assert.ok(Math.abs(Math.hypot(p[0],p[1],p[2]/d.polarRatio)-d.radiusKm-query.explicitHeightKm)<5e-10);
    }
  }
});

test('actual explicit-height overload is required by day-side rejection controls',()=>{
  const controls=cases.flatMap(d=>d.queries.filter(q=>q.expectedHeightRejection));assert.equal(controls.length,4);
  for(const q of controls){
    assert.equal(assessExplicitHeightRejection(q,{scattering:[0,0,0,0],color:[.18,.18,.18,1]}).passed,true);
    for(const measured of [{scattering:[0,0,0,1],color:[.18,.18,.18,1]},
      {scattering:[0,0,0,0],color:[.2,.18,.18,1]},{scattering:[NaN,0,0,0],color:[.18,.18,.18,1]},{}])
      assert.equal(assessExplicitHeightRejection(q,measured).passed,false);
  }
  assert.throws(()=>assessExplicitHeightRejection({expectedHeightRejection:false},{}));
});

test('supplement rejects stale source products, malformed bounds and incomplete meshes',()=>{
  for(const bad of [{...reference,id:'mars-radial-height-v1'},{...reference,sha256:'unverified'},
    {...reference,width:1440},{...reference,minRadiusKm:Infinity},{...reference,maxRadiusKm:1}])
    assert.throws(()=>scatteringSupplementalCases(legacy,{...options,terrainReference:bad}));
  assert.throws(()=>scatteringTerrainMeshSamples({...mesh,pos:mesh.pos.subarray(6)},BODY.Mars,getAtmosphereProfile('Mars')));
});
