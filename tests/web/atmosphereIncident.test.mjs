import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';
import {SPHERE_VS} from '../../apps/web/js/orreryShaders.js';
import {INCIDENT_FIELDS} from '../../apps/web/js/atmosphereIncidentManifest.js';
import {incidentFieldCoordinate,incidentFieldGeometry,incidentFieldWork,loadIncidentField,sampleIncidentField} from '../../apps/web/js/atmosphereIncident.js';

test('incident ray solve budget is independent of geometry and animation frames',()=>{
  for(const vertices of [4753,18721,74305])for(const frames of [1,300]){
    const work=incidentFieldWork(vertices,frames);
    assert.equal(work.raySolves,0);
    assert.equal(work.textureFetches,vertices*frames*8);
  }
  assert.doesNotMatch(SPHERE_VS,/atmosphereCurvedRay|atmosphereRayDerivative|for\(int i=0;i<96/);
  assert.match(SPHERE_VS,/atmosphereIncidentLookup/);
  assert.match(SPHERE_VS,/u_atmosphereOzoneKm\*atmosphereOzoneOutward\(max\(height,0\.0\),apparentMu\)/);
  assert.doesNotMatch(SPHERE_VS,/atmosphereOzoneOutward\(max\(height,0\.0\),clamp\(mu/);
});

test('admitted immutable field verifies bytes and the model profile before decoding',async()=>{
  const bytes=fs.readFileSync(new URL('../../apps/web/data/optics/earth-incident-v1.f32',import.meta.url));
  const field=await loadIncidentField('Earth',{fetcher:async()=>new Response(bytes)});
  assert.equal(field.width,385);assert.equal(field.height,195);assert.equal(field.values.length,300300);
  const result=sampleIncidentField(field.values,'Earth',[6378.137,0,0],[1,0,0],6378.137,1);
  assert.ok(Math.abs(result.direction[0]-1)<1e-12);assert.ok(result.transmission.every(v=>v>0&&v<1));
  const bare=sampleIncidentField(field.values,'Earth',[6378.137,0,0],[1,0,0],6378.137,1,[0,0,0]);
  const ratio=result.transmission.map((value,i)=>value/bare.transmission[i]);
  assert.ok(ratio[1]<ratio[0]&&ratio[0]<ratio[2],'Chappuis absorption is strongest in green, then red, then blue');
  const zenith=89*Math.PI/180,grazingSun=[Math.cos(zenith),0,Math.sin(zenith)];
  const grazing=sampleIncidentField(field.values,'Earth',[6378.137,0,0],grazingSun,6378.137,1);
  const grazingBare=sampleIncidentField(field.values,'Earth',[6378.137,0,0],grazingSun,6378.137,1,[0,0,0]);
  const grazingRatio=grazing.transmission[1]/grazingBare.transmission[1];
  assert.ok(grazingRatio<ratio[1],'an 89 degree Sun crosses a longer ozone column than zenith');
  const ozoneRatio=degrees=>{
    const angle=degrees*Math.PI/180,sun=[Math.cos(angle),0,Math.sin(angle)];
    const lit=sampleIncidentField(field.values,'Earth',[6378.137,0,0],sun,6378.137,1);
    const dark=sampleIncidentField(field.values,'Earth',[6378.137,0,0],sun,6378.137,1,[0,0,0]);
    assert.ok(lit.transmission[1]>0&&dark.transmission[1]>0);
    return lit.transmission[1]/dark.transmission[1];
  };
  const horizon=ozoneRatio(90),refracted=ozoneRatio(90.6);
  assert.ok(refracted<horizon,'a refracted below-horizon Sun keeps its own ozone column');
  const corrupt=Buffer.from(bytes);corrupt[0]^=1;
  await assert.rejects(loadIncidentField('Earth',{fetcher:async()=>new Response(corrupt)}),/hash mismatch/);
  await assert.rejects(loadIncidentField('Earth',{fetcher:async()=>new Response(bytes.subarray(4))}),/length mismatch/);
  await assert.rejects(loadIncidentField('Earth',{fetcher:async()=>new Response(Buffer.concat([bytes,Buffer.alloc(1)]))}),/byte budget/);
  await assert.rejects(loadIncidentField('Titan'),/not admitted/);
});

test('abort and deadline settle even when a returned stream ignores fetch cancellation',async(t)=>{
  let cancellations=0;
  let streamStarted;
  const started=new Promise(resolve=>{streamStarted=resolve;});
  const fetcher=async()=>({ok:true,body:{getReader:()=>({read:()=>{streamStarted();return new Promise(()=>{});},cancel:()=>{cancellations++;return new Promise(()=>{});}})}});
  // Admission hashing may itself exceed 10ms on a busy runner. Admit the stream
  // first, then advance the same whole-transfer deadline deterministically.
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=loadIncidentField('Earth',{fetcher,timeoutMs:10});
  const rejection=assert.rejects(pending,{name:'AbortError'});
  await Promise.race([started,pending]);
  t.mock.timers.tick(10);
  await rejection;
  assert.ok(cancellations>0);
  t.mock.timers.reset();
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadIncidentField('Earth',{signal:controller.signal,fetcher}),{name:'AbortError'});
  await assert.rejects(loadIncidentField('Earth',{fetcher,timeoutMs:20001}),RangeError);
  await assert.rejects(loadIncidentField('Earth',{fetcher:async()=>new Response(null,{status:503})}),/unavailable/);
});

test('Mars field profile identity and runtime height domain are admitted independently',async()=>{
  const bytes=fs.readFileSync(new URL('../../apps/web/data/optics/mars-incident-v1.f32',import.meta.url));
  const field=await loadIncidentField('Mars',{fetcher:async()=>new Response(bytes)});
  assert.deepEqual(field.domain,{minHeightKm:-24,maxHeightKm:24,quadratic:false});
  const reference=INCIDENT_FIELDS.Mars,priorDomain=reference.domain,priorIdentity=reference.profile_sha256;
  try{
    reference.domain={...priorDomain,maxHeightKm:25};
    await assert.rejects(loadIncidentField('Mars',{fetcher:async()=>new Response(bytes)}),/domain or format changed/);
    reference.domain=priorDomain;reference.profile_sha256='0'.repeat(64);
    await assert.rejects(loadIncidentField('Mars',{fetcher:async()=>new Response(bytes)}),/optical profile changed/);
  }finally{reference.domain=priorDomain;reference.profile_sha256=priorIdentity;}
});

test('both fields reject obsolete or missing identity encoding and the old float64 profile hash',async()=>{
  for(const body of ['Earth','Mars']){
    const reference=INCIDENT_FIELDS[body],encoding=reference.profile_encoding,identity=reference.profile_sha256;
    let requests=0;
    const fetcher=async()=>{requests++;throw Error('Invalid identity must fail before transfer');};
    try{
      for(const invalid of [undefined,'atmosphere-profile-float64-v0']){
        reference.profile_encoding=invalid;
        await assert.rejects(loadIncidentField(body,{fetcher}),/profile encoding changed/);
      }
      reference.profile_encoding=encoding;
      reference.profile_sha256=createHash('sha256').update(JSON.stringify(getAtmosphereProfile(body))).digest('hex');
      await assert.rejects(loadIncidentField(body,{fetcher}),/optical profile changed/);
      assert.equal(requests,0);
    }finally{reference.profile_encoding=encoding;reference.profile_sha256=identity;}
  }
});

test('field coordinates preserve signed physical terrain heights and concentrate at the horizon',()=>{
  assert.deepEqual(incidentFieldCoordinate('Earth',0,0),[1,0]);
  assert.ok(incidentFieldCoordinate('Mars',93,-24)[0]<1e-12);
  assert.equal(incidentFieldCoordinate('Mars',93,-24)[1],0);
  assert.equal(incidentFieldCoordinate('Mars',93,24)[1],1);
  assert.ok(incidentFieldCoordinate('Earth',90,0)[0]>.4);
  assert.throws(()=>incidentFieldCoordinate('Earth',80,-1),RangeError);
  assert.throws(()=>incidentFieldCoordinate('Mars',80,25),RangeError);
});

test('local density gradient and normal curvature reduce exactly to the reference sphere',()=>{
  const result=incidentFieldGeometry([3406.19,0,0],[0,1,0],3396.19,1);
  assert.ok(Math.abs(result.radiusKm-3396.19)<1e-10);
  assert.equal(result.heightKm,10);
  assert.equal(result.columnScale,1);
  assert.deepEqual(result.normal,[1,0,0]);
  assert.equal(result.zenithDegrees,90);
  const polar=incidentFieldGeometry([0,0,6378.137*.9966],[1,0,0],6378.137,.9966);
  assert.ok(Math.abs(polar.radiusKm-6378.137/.9966**2)<1e-8);
  assert.ok(Math.abs(polar.columnScale-.9966)<1e-12);
});
