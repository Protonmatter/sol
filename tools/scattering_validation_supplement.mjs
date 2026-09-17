// Additive physical queries. No production coordinates, interpolation, source
// weights or admission tolerances are used to construct their Cartesian rays.
import assert from 'node:assert/strict';

export const SCATTERING_SUPPLEMENT_VERSION='v2-terrain-explicit-height.v1';
const unit=v=>{const length=Math.hypot(...v);assert.ok(length>0&&Number.isFinite(length));return v.map(x=>x/length);};
const physical=(v,q)=>[v[0],v[1],v[2]*q];
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function basis(dataset){
  const angle=dataset.latitude*Math.PI/180;
  return {axis:[Math.cos(angle),0,Math.sin(angle)],u:[0,1,0],v:[-Math.sin(angle),0,Math.cos(angle)]};
}
function surfaceQuery(dataset,surface,heightKm,details={}){
  const delta=surface.map((x,i)=>x-dataset.options.cameraBodyKm[i]);
  return {kind:'surface',surface,direction:unit(delta),maximum:Math.hypot(...delta),
    heightKm,explicitHeightKm:heightKm,...details};
}
function angularSurface(dataset,height,fraction,azimuth){
  const f=basis(dataset),r=dataset.radiusKm+height,theta=Math.acos(r/dataset.cameraRadius)*fraction;
  const p=f.axis.map((x,i)=>r*(x*Math.cos(theta)+(f.u[i]*Math.cos(azimuth)+f.v[i]*Math.sin(azimuth))*Math.sin(theta)));
  return surfaceQuery(dataset,physical(p,dataset.polarRatio),height,{angularFraction:fraction,azimuth,coverage:'height-angle-envelope'});
}
function impactQuery(dataset,impactHeight,azimuth,height=null,side=-1){
  const f=basis(dataset),impact=dataset.radiusKm+impactHeight,s=impact/dataset.cameraRadius;
  const metric=f.axis.map((x,i)=>-x*Math.sqrt(1-s*s)+s*(f.u[i]*Math.cos(azimuth)+f.v[i]*Math.sin(azimuth)));
  const raw=physical(metric,dataset.polarRatio),jacobian=Math.hypot(...raw),direction=unit(raw);
  if(height===null)return {kind:'limb',surface:[0,0,0],direction,maximum:1e20,heightKm:impactHeight,azimuth,coverage:'visible-limb-domain'};
  const radius=dataset.radiusKm+height;
  assert.ok(radius>=impact,'Endpoint precedes prescribed closest approach');
  const maximum=(Math.sqrt(dataset.cameraRadius**2-impact**2)+side*Math.sqrt(Math.max(0,radius**2-impact**2)))*jacobian;
  return surfaceQuery(dataset,dataset.options.cameraBodyKm.map((x,i)=>x+direction[i]*maximum),height,
    {impactHeightKm:impactHeight,azimuth,side,coverage:'ground-tangency-topology'});
}

/** Actual level4 object vertices and triangle interpolation, with known scale.
 * The caller must build this mesh from the hash-admitted v2 terrain payload. */
export function scatteringTerrainMeshSamples(mesh,catalogue,profile){
  assert.ok(mesh?.pos instanceof Float32Array&&mesh?.idx instanceof Uint32Array);
  assert.equal(mesh.pos.length,131841*6,'Expected256x512 source terrain mesh');
  assert.equal(mesh.idx.length,783360,'Expected full level4 triangle indices');
  assert.ok(mesh.pos.every(Number.isFinite));
  const eq=catalogue.radiusKm,pol=catalogue.polarKm,R=profile.radiusKm;
  assert.ok([eq,pol,R].every(v=>Number.isFinite(v)&&v>0));
  let min=0,max=0,low=Infinity,high=-Infinity;
  for(let i=0;i<mesh.pos.length/6;i++){
    const h=Math.hypot(...mesh.pos.subarray(i*6,i*6+3))*eq-R;
    if(h<low){low=h;min=i;}if(h>high){high=h;max=i;}
  }
  const indices=[...new Set([min,max,0,256*513,128*513,128*513+512,64*513,192*513,128*513+128,128*513+256,128*513+384])];
  const sample=(vertices,weights,label)=>{
    const points=vertices.map(i=>Array.from(mesh.pos.subarray(i*6,i*6+3)));
    const chord=[0,1,2].map(k=>points.reduce((sum,p,i)=>sum+weights[i]*p[k],0));
    const scale=points.reduce((sum,p,i)=>sum+weights[i]*Math.hypot(...p),0);
    const p=unit(chord).map(x=>x*scale);
    return {surface:[p[0]*eq,p[1]*eq,p[2]*pol],heightKm:scale*eq-R,
      coverage:'source-level4-mesh',meshSample:label,vertexIndices:vertices,weights};
  };
  const result=indices.map(i=>sample([i],[1],`vertex-${i}`));
  // Deterministic triangles at poles, seam, midlatitude and equator. Chord
  // position and radial scale are interpolated separately, as in the material.
  for(const triangle of [0,511,512,32768,65536,130047,261119]){
    const vertices=Array.from(mesh.idx.subarray(triangle*3,triangle*3+3));
    assert.ok(vertices.length===3&&vertices.every(i=>i<mesh.pos.length/6));
    result.push(sample(vertices,[1/3,1/3,1/3],`triangle-${triangle}-centroid`));
  }
  return {samples:result,minimumExplicitHeightKm:low,maximumExplicitHeightKm:high,vertexCount:mesh.pos.length/6};
}

/** Extend immutable existing datasets; return only separately named new cases. */
export function scatteringSupplementalCases(legacyDatasets,{terrainReference,terrainMesh,bodyCatalogue}){
  assert.ok(Array.isArray(legacyDatasets)&&legacyDatasets.length>0);
  assert.equal(terrainReference?.id,'mars-radial-height-v2');
  assert.equal(terrainReference.body,'Mars');
  assert.equal(terrainReference.width,2880);assert.equal(terrainReference.height,1440);
  assert.match(terrainReference.sha256,/^[0-9a-f]{64}$/);
  assert.ok([terrainReference.minRadiusKm,terrainReference.maxRadiusKm].every(v=>Number.isFinite(v)&&v>0));
  assert.ok(terrainReference.minRadiusKm<terrainReference.maxRadiusKm);
  const mars=legacyDatasets.find(d=>d.body==='Mars');assert.ok(mars,'Mars reference dataset required');
  const sampled=scatteringTerrainMeshSamples(terrainMesh,bodyCatalogue.Mars,mars.profile);
  const result=[];
  for(const original of legacyDatasets){
    const terrain=original.body==='Mars'&&Number.isFinite(original.bounds?.minRadiusKm);
    const earth=['Earth-day','Earth-forward-oblique','Earth-near-top'].includes(original.name);
    if(!terrain&&!earth)continue;
    const dataset=structuredClone(original);dataset.queries=[];
    dataset.name=original.name+(terrain?'-v2-explicit-height':'-explicit-height');
    dataset.supplement={version:SCATTERING_SUPPLEMENT_VERSION,originalDataset:original.name,
      explicitHeight:true,source:terrain?{id:terrainReference.id,sha256:terrainReference.sha256,
        minRadiusKm:terrainReference.minRadiusKm,maxRadiusKm:terrainReference.maxRadiusKm}:null};
    if(terrain){
      // Actual source mesh coordinates use the catalogue ellipsoid. Preserve
      // each camera's metric radius/latitude and phase while binding its q to
      // that same ellipsoid, rather than the old synthetic rounded q=.9941.
      dataset.polarRatio=bodyCatalogue.Mars.polarKm/bodyCatalogue.Mars.radiusKm;
      const frame=basis(dataset),axis=unit(physical(frame.axis,dataset.polarRatio));
      const phase=dataset.phase*Math.PI/180;
      dataset.options={...dataset.options,polarRatio:dataset.polarRatio,
        cameraBodyKm:physical(frame.axis.map(v=>v*dataset.cameraRadius),dataset.polarRatio),
        sunDirectionBody:unit(axis.map((v,i)=>v*Math.cos(phase)+frame.u[i]*Math.sin(phase)))};
      dataset.bounds={referenceRadiusKm:bodyCatalogue.Mars.radiusKm,minRadiusKm:terrainReference.minRadiusKm,maxRadiusKm:terrainReference.maxRadiusKm};
      const lower=Math.min(0,bodyCatalogue.Mars.radiusKm-dataset.radiusKm,terrainReference.minRadiusKm-dataset.radiusKm);
      const upper=Math.max(0,bodyCatalogue.Mars.radiusKm-dataset.radiusKm,terrainReference.maxRadiusKm/dataset.polarRatio-dataset.radiusKm);
      dataset.supplement.heightEnvelopeKm=[lower,upper];
      for(const height of [lower,lower+.001,-11.803,-.001,0,.001,3.37,upper-.001,upper])
        for(const fraction of [.173,.873,1,1.03])
          for(const azimuth of [0,Math.PI/2-.00001,Math.PI/2,Math.PI/2+.00001,4.337,2*Math.PI-1e-8])
            dataset.queries.push(angularSurface(dataset,height,fraction,azimuth));
      for(const height of [.001,3.37,10])for(const impactHeight of [-.0005,0,.0005])
        for(const side of [-1,1])for(const azimuth of [Math.PI/2-.01,Math.PI/2,Math.PI/2+.01])
          dataset.queries.push(impactQuery(dataset,impactHeight,azimuth,height,side));
      for(const entry of sampled.samples)dataset.queries.push(surfaceQuery(dataset,entry.surface,entry.heightKm,entry));
      dataset.supplement.mesh={vertexCount:sampled.vertexCount,minimumExplicitHeightKm:sampled.minimumExplicitHeightKm,
        maximumExplicitHeightKm:sampled.maximumExplicitHeightKm,sampledPoints:sampled.samples.length};
    }else{
      // Preserve actual catalogue/profile datum rather than reconstructing it
      // by subtracting two rounded radii in the fragment shader.
      const height=bodyCatalogue.Earth.radiusKm-dataset.radiusKm;
      dataset.supplement.heightEnvelopeKm=[height,height];
      for(const fraction of [.173,.873,1,1.03])for(const azimuth of [0,.741,Math.PI/2,4.337,2*Math.PI-1e-8])
        dataset.queries.push(angularSurface(dataset,height,fraction,azimuth));
    }
    for(const height of [.001,2,dataset.topKm-.001,dataset.topKm])for(const azimuth of [0,Math.PI/2,4.337])
      dataset.queries.push(impactQuery(dataset,height,azimuth));
    if(original.name==='Earth-day'||original.name==='Mars-day-terrain'){
      const [lower,upper]=dataset.supplement.heightEnvelopeKm;
      for(const explicitHeightKm of [lower-1,upper+1]){
        const query=angularSurface(dataset,(lower+upper)/2,.173,0);
        dataset.queries.push({...query,explicitHeightKm,coverage:'explicit-height-negative-control',
          expectedHeightRejection:true});
      }
    }
    dataset.queries.forEach((query,i)=>{assert.ok(vector(query.surface)&&vector(query.direction));query.name=`${dataset.name}/${query.kind}/${i}`;});
    result.push(dataset);
  }
  assert.ok(result.some(d=>d.body==='Mars')&&result.some(d=>d.body==='Earth'),'Both explicit height consumers required');
  return result;
}

/** These deliberate invalid-height controls are additive input-admission tests.
 * All valid queries still use the original unmodified scattering assessor. */
export function assessExplicitHeightRejection(query,measured){
  assert.equal(query.expectedHeightRejection,true);
  const finite4=v=>Array.isArray(v)&&v.length===4&&v.every(Number.isFinite);
  const passed=finite4(measured?.scattering)&&finite4(measured?.color)
    &&measured.scattering.every(v=>Math.abs(v)<=1e-7)
    &&measured.color.slice(0,3).every(v=>Math.abs(v-.18)<=1e-7);
  return {passed,domain:'invalid-explicit-height-control',failures:passed?[]:['explicit height was ignored or fallback was not preserved'],
    maxScatteringError:null,maxDisplayError:null,raw_assessment:{passed,failures:passed?[]:['invalid-height control']}};
}
