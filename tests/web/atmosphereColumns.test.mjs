import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';
import {ATMOSPHERE_GLSL} from '../../apps/web/js/atmosphereShaders.js';
import {SPHERE_FS,SPHERE_VS,BASE_SPHERE_FS,BASE_SPHERE_VS} from '../../apps/web/js/orreryShaders.js';
import {ATMOSPHERE_COLUMN_FIELDS} from '../../apps/web/js/atmosphereColumnManifest.js';
import {ATMOSPHERE_COLUMN_SIZE,ATMOSPHERE_COLUMN_BYTES,outwardDensityColumn,generateAtmosphereColumns,
  generateAtmosphereOzoneColumns,loadAtmosphereOzoneColumns,packAtmosphereOpticalField,sampleOutwardColumns,sampleDensityColumns,ATMOSPHERE_RENDER_GLSL,ATMOSPHERE_RENDER_FS,
  loadAtmosphereColumns,loadAtmosphereFields,cacheAtmosphereViewRay,specializeAtmosphereSunDepth} from '../../apps/web/js/atmosphereColumnField.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytesFor=body=>fs.readFileSync(new URL(`../../apps/web/data/optics/${body.toLowerCase()}-columns-v1.f32`,import.meta.url));
const valuesFor=body=>{const bytes=bytesFor(body);return Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4));};

test('base sphere specialization changes only the optical enable declaration and retains fixed mesh attributes',()=>{
  for(const [physical,base]of [[SPHERE_VS,BASE_SPHERE_VS],[SPHERE_FS,BASE_SPHERE_FS]]){
    assert.equal(base,physical.replace('uniform int u_atmosphereEnabled;','const int u_atmosphereEnabled = 0;'));
    assert.match(physical,/uniform int u_atmosphereEnabled;/);assert.doesNotMatch(base,/uniform int u_atmosphereEnabled;/);
  }
  for(const source of [SPHERE_VS,BASE_SPHERE_VS]){
    assert.match(source,/layout\(location=0\) in vec3 a_pos; layout\(location=1\) in vec3 a_nrm;/);
  }
});

test('offline column generation exactly reproduces the shipped Float32 fields and fixed memory bounds',()=>{
  assert.equal(ATMOSPHERE_COLUMN_SIZE,512);assert.equal(ATMOSPHERE_COLUMN_BYTES,2097152);
  for(const body of ['Earth','Mars']){
    const values=generateAtmosphereColumns(getAtmosphereProfile(body)),bytes=Buffer.alloc(values.byteLength);
    for(let i=0;i<values.length;i++)bytes.writeFloatLE(values[i],i*4);
    assert.deepEqual(bytes,bytesFor(body));assert.equal(sha(bytes),ATMOSPHERE_COLUMN_FIELDS[body].sha256);
  }
});

test('runtime ozone columns stay off the admitted RG field and vanish for Mars',()=>{
  const earth=generateAtmosphereOzoneColumns(getAtmosphereProfile('Earth'));
  const mars=generateAtmosphereOzoneColumns(getAtmosphereProfile('Mars'));
  assert.equal(earth.length,ATMOSPHERE_COLUMN_SIZE**2);
  assert.equal(mars.length,earth.length);
  assert.ok(earth.some(value=>value>0));
  assert.ok(mars.every(value=>value===0));
  const columns=generateAtmosphereColumns(getAtmosphereProfile('Earth'));
  const packed=packAtmosphereOpticalField(columns,earth);
  assert.equal(packed.length,ATMOSPHERE_COLUMN_SIZE**2*4);
  assert.equal(packed[0],columns[0]);
  assert.equal(packed[1],columns[1]);
  assert.equal(packed[2],earth[0]);
  assert.equal(packed[3],1);
  assert.throws(()=>packAtmosphereOpticalField(columns,earth.subarray(1)),/Invalid packed optical field/);
});

test('production transfer preserves scattering expressions but contains no nested density quadrature',()=>{
  for(const shader of [SPHERE_VS,SPHERE_FS,ATMOSPHERE_RENDER_FS]){
    assert.doesNotMatch(shader,/float atmosphereColumnSegment\(|float atmosphereColumn\(/);
    assert.match(shader,/u_atmosphereColumnField/);
    assert.match(shader,/texelFetch\(u_atmosphereColumnField,ivec2\(0\),0\)\.rg\*u_atmosphereColumnKeep/);
    assert.doesNotMatch(shader,/u_atmosphereColumnField,ivec2\(0\),0\)\.rg\*0\.0/);
    assert.match(shader,/texelFetch\(field/);
    assert.match(shader,/u_atmosphereOzoneField/);
    assert.match(shader,/u_atmosphereOzoneKm/);
    assert.match(shader,/atmosphereOzoneColumnOnAxis/);
  }
  const from='vec3 atmosphereSunTransmission(';
  const routed=specializeAtmosphereSunDepth(cacheAtmosphereViewRay(ATMOSPHERE_GLSL));
  assert.equal(ATMOSPHERE_RENDER_GLSL.slice(ATMOSPHERE_RENDER_GLSL.indexOf(from)),routed.slice(routed.indexOf(from)));
  assert.match(ATMOSPHERE_GLSL,/float atmosphereColumnSegment\(/,'offline oracle stays available');
  const renderer=fs.readFileSync(new URL('../../apps/web/js/orrery.js',import.meta.url),'utf8');
  assert.doesNotMatch(renderer,/generateAtmosphereColumns/,'precomputation is not runtime work');
});

test('view cache routing binds each original call once and preserves the generic depth evaluator',()=>{
  assert.match(ATMOSPHERE_RENDER_GLSL,/AtmosphereColumnRay columnRay=atmosphereColumnRay\(entry,ray,distance\);/);
  assert.match(ATMOSPHERE_RENDER_GLSL,/exp\(-atmosphereCachedOpticalDepth\(columnRay,distance\)\)\*atmosphereLitSunTransmission\(p\)/);
  assert.match(ATMOSPHERE_RENDER_GLSL,/vec3 atmosphereOpticalDepth\(vec3 origin,vec3 direction,float distance\)/);
  assert.throws(()=>cacheAtmosphereViewRay(ATMOSPHERE_RENDER_GLSL),/view-ray cache binding/,'already rewritten or changed references fail closed');
  assert.throws(()=>cacheAtmosphereViewRay(ATMOSPHERE_GLSL.replace('vec3 atmosphereScatteredMonotonic(','vec3 renamedMonotonic(')),/view-ray cache binding/);
  assert.throws(()=>cacheAtmosphereViewRay(ATMOSPHERE_GLSL+'\nvec3 atmosphereScatteredMonotonic(vec3 origin,vec3 direction,vec2 interval){'),/view-ray cache binding/,'ambiguous duplicated binding fails closed');
});

test('Sun-to-top specialization changes only the depth call after the original blocking and interval checks',()=>{
  const body=source=>source.slice(source.indexOf('vec3 atmosphereSunTransmission('),source.indexOf('// Private source kernel'));
  assert.equal(body(ATMOSPHERE_RENDER_GLSL).replace('atmosphereSunOpticalDepthToTop(point,light)','atmosphereOpticalDepth(point,light,sky.y)'),body(ATMOSPHERE_GLSL));
  assert.throws(()=>specializeAtmosphereSunDepth(ATMOSPHERE_RENDER_GLSL),/Sun-to-top binding/);
  assert.throws(()=>specializeAtmosphereSunDepth(ATMOSPHERE_GLSL.replace('point,light,sky.y','point,light,sky.x')),/Sun-to-top binding/);
  assert.throws(()=>specializeAtmosphereSunDepth(ATMOSPHERE_GLSL+'\nexp(-atmosphereOpticalDepth(point,light,sky.y))'),/Sun-to-top binding/);
  assert.throws(()=>specializeAtmosphereSunDepth(ATMOSPHERE_GLSL.replace('samplePoint,light,sky.y','samplePoint,light,sky.x')),/Sun-to-top binding/);
  assert.throws(()=>specializeAtmosphereSunDepth(ATMOSPHERE_GLSL+'\nexp(-atmosphereOpticalDepth(samplePoint,light,sky.y))'),/Sun-to-top binding/);
  const lit=source=>source.slice(source.indexOf('vec3 atmosphereLitSunTransmission('),source.indexOf('// Exact exponential optical-coordinate'));
  assert.equal(lit(ATMOSPHERE_RENDER_GLSL).replace('atmosphereSunOpticalDepthToTop(samplePoint,light)','atmosphereOpticalDepth(samplePoint,light,sky.y)'),lit(ATMOSPHERE_GLSL));
  assert.doesNotMatch(lit(ATMOSPHERE_RENDER_GLSL),/ground|atmosphereSunTransmission/);
});

test('off-grid columns retain the near-ground aerosol layer and grazing molecular density',()=>{
  let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const body of ['Earth','Mars']){
    const profile=getAtmosphereProfile(body),values=valuesFor(body);
    for(let i=0;i<2000;i++){
      const height=profile.topKm*random()**3,mu=random()**3,actual=sampleOutwardColumns(values,profile,height,mu);
      for(const [c,h]of [profile.rayleighScaleHeightKm,profile.aerosolScaleHeightKm].entries()){
        const expected=outwardDensityColumn(profile.radiusKm,height,mu,h,profile.topKm);
        const beta=profile.betaRayleighKm.map((v,j)=>c?profile.betaAerosolExtinctionKm[j]:v);
        for(const b of beta)assert.ok(Math.abs(Math.exp(-b*actual[c])-Math.exp(-b*expected))<.0001,`${body} ${height} ${mu} ${c}`);
      }
    }
    assert.deepEqual(sampleOutwardColumns(values,profile,profile.topKm,0),[0,0]);
  }
});

// Independent uniform midpoint integration, rather than the generator's Gauss rule.
function midpoint(origin,direction,distance,profile,q,steps=16384){
  const result=[0,0];
  for(let i=0;i<steps;i++){
    const s=distance*(i+.5)/steps,p=origin.map((v,j)=>v+direction[j]*s),h=Math.max(0,Math.hypot(p[0],p[1],p[2]/q)-profile.radiusKm);
    for(const [j,H]of [profile.rayleighScaleHeightKm,profile.aerosolScaleHeightKm].entries())result[j]+=Math.exp(-h/H)*distance/steps;
  }
  return result;
}
test('endpoint subtraction retains short paths, closest crossings, subdatum endpoints and exact oblate scaling',()=>{
  for(const body of ['Earth','Mars']){
    const profile=getAtmosphereProfile(body),values=valuesFor(body),R=profile.radiusKm;
    const tangent=Math.sqrt((R+100)**2-(R+.37)**2);
    for(const [name,origin,direction,distance,q]of [
      ['vertical',[R,0,0],[1,0,0],100,1],['inward',[R+100,0,0],[-1,0,0],100,1],
      ['short',[R+.713,0,0],[1,0,0],.01,1],['subdatum',[R+100,0,0],[-1,0,0],112.37,1],
      ['closest',[R+.37,0,-tangent],[0,0,1],2*tangent,1],
      ['inside crossing',[0,0,-12.13],[0,0,1],24.26,1],
      ['oblate polar',[0,0,(R+100)*.9],[0,0,-1],100*.9,.9],
      ['away outside',[R+110,0,0],[1,0,0],10,1],
    ]){
      const actual=sampleDensityColumns(values,profile,origin,direction,distance,q),expected=midpoint(origin,direction,distance,profile,q);
      for(let j=0;j<3;j++){
        const b=profile.betaRayleighKm[j],a=profile.betaAerosolExtinctionKm[j];
        assert.ok(Math.abs(Math.exp(-actual[0]*b-actual[1]*a)-Math.exp(-expected[0]*b-expected[1]*a))<.0001,`${body} ${name} ${j}`);
      }
    }
  }
});

test('column pure functions reject invalid geometry and malformed grids',()=>{
  const p=getAtmosphereProfile('Earth'),values=valuesFor('Earth');
  assert.throws(()=>outwardDensityColumn(p.radiusKm,-1,0,8,100),RangeError);
  assert.throws(()=>outwardDensityColumn(p.radiusKm,0,2,8,100),RangeError);
  assert.throws(()=>outwardDensityColumn(p.radiusKm,0,0,0,100),RangeError);
  assert.throws(()=>sampleOutwardColumns(new Float32Array(2),p,0,0),RangeError);
  assert.throws(()=>sampleOutwardColumns(values,p,0,-1),RangeError);
  assert.throws(()=>sampleDensityColumns(values,p,[0,0,0],[0,0,0],1),RangeError);
  assert.throws(()=>sampleDensityColumns(values,p,[0,0,0],[1,0,0],-1),RangeError);
});

test('column admission binds profile, format, bytes and hash before publishing decoded values',async()=>{
  for(const body of ['Earth','Mars']){
    const bytes=bytesFor(body),field=await loadAtmosphereColumns(body,{fetcher:async()=>new Response(bytes)});
    assert.equal(field.width,512);assert.equal(field.height,512);assert.equal(field.values.length,524288);
    const bad=Buffer.from(bytes);bad[100]^=1;
    await assert.rejects(loadAtmosphereColumns(body,{fetcher:async()=>new Response(bad)}),/hash mismatch/);
    await assert.rejects(loadAtmosphereColumns(body,{fetcher:async()=>new Response(bytes.subarray(4))}),/size or hash/);
    await assert.rejects(loadAtmosphereColumns(body,{fetcher:async()=>new Response(Buffer.concat([bytes,Buffer.alloc(1)]))}),/byte budget/);
    const ref=ATMOSPHERE_COLUMN_FIELDS[body],identity=ref.profile_sha256,format=ref.format;
    try{
      ref.profile_sha256='0'.repeat(64);await assert.rejects(loadAtmosphereColumns(body),/profile changed/);
      ref.profile_sha256=identity;ref.format='old';await assert.rejects(loadAtmosphereColumns(body),/not admitted/);
    }finally{ref.profile_sha256=identity;ref.format=format;}
  }
  await assert.rejects(loadAtmosphereColumns('Titan'),/not admitted/);
  await assert.rejects(loadAtmosphereColumns('Earth',{timeoutMs:20001}),RangeError);
  await assert.rejects(loadAtmosphereColumns('Earth',{fetcher:async()=>new Response(null,{status:503})}),/unavailable/);
});

test('nonfinite or negative column samples fail even when their transport hash is rebound',async()=>{
  const ref=ATMOSPHERE_COLUMN_FIELDS.Earth,identity=ref.sha256,original=bytesFor('Earth');
  try{for(const value of [NaN,-1,2001]){
    const bytes=Buffer.from(original);bytes.writeFloatLE(value,0);ref.sha256=sha(bytes);
    await assert.rejects(loadAtmosphereColumns('Earth',{fetcher:async()=>new Response(bytes)}),/Invalid density column/);
  }}finally{ref.sha256=identity;}
});

test('deadline and explicit cancellation release a stalled reader without waiting for its cancellation promise',async(t)=>{
  let ready,cancelled=0,released=0;const started=new Promise(resolve=>{ready=resolve;});
  const fetcher=async()=>({ok:true,body:{getReader:()=>({read:()=>{ready();return new Promise(()=>{});},cancel:()=>{cancelled++;return new Promise(()=>{});},releaseLock:()=>{released++;}})}});
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=loadAtmosphereColumns('Earth',{fetcher,timeoutMs:10}),rejection=assert.rejects(pending,{name:'AbortError'});
  await Promise.race([started,pending]);t.mock.timers.tick(10);await rejection;t.mock.timers.reset();
  assert.ok(cancelled>0);assert.equal(released,1);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadAtmosphereColumns('Earth',{signal:controller.signal,fetcher}),{name:'AbortError'});
});

test('optical field groups promptly cancel a companion transfer and suppress late publication',async()=>{
  for(const failing of ['incident','column']){
    let siblingSignal;
    const fail=async()=>{throw Error('bad field');},pending=async(_body,{signal})=>{siblingSignal=signal;return new Promise(()=>{});};
    await assert.rejects(loadAtmosphereFields('Earth',{incidentLoader:failing==='incident'?fail:pending,columnLoader:failing==='column'?fail:pending}),/bad field/);
    assert.equal(siblingSignal.aborted,true);
  }
  const controller=new AbortController();let finish;
  const pending=loadAtmosphereFields('Earth',{signal:controller.signal,incidentLoader:async()=>1,columnLoader:async()=>new Promise(resolve=>{finish=resolve;})});
  controller.abort();finish(2);await assert.rejects(pending,{name:'AbortError'});
  assert.deepEqual(await loadAtmosphereFields('Earth',{incidentLoader:async()=>1,columnLoader:async()=>2}),[1,2]);
});

test('ozone table generation yields and stays cached for the same profile',async()=>{
  const profile=getAtmosphereProfile('Earth');
  const cancelled=new AbortController();cancelled.abort();
  await assert.rejects(loadAtmosphereOzoneColumns(profile,{signal:cancelled.signal}),{name:'AbortError'});
  const first=await loadAtmosphereOzoneColumns(profile,{rowsPerSlice:32});
  const direct=generateAtmosphereOzoneColumns(profile);
  assert.equal(first.length,direct.length);
  assert.equal(first[256*512+128],direct[256*512+128]);
  assert.equal(await loadAtmosphereOzoneColumns(profile),first);
  await assert.rejects(loadAtmosphereOzoneColumns({...profile,version:profile.version+'-slice'},{rowsPerSlice:0}),RangeError);
});
