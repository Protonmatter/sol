import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {physicalProgramSources,PHYSICAL_PROGRAM_ROLES} from '../../apps/web/js/physicalProgramSources.js';
import {getAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';

async function boot(t){
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true,
    incidentField:async()=>({values:new Float32Array(4*257*195),width:257,height:195,
      domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}})});
  t.after(()=>h.leaveOrrery());h.state.solarMode='visible';
  const entering=h.enterOrrery();await h.settle();h.completePrograms();h.frame(100);await entering;
  h.setAnimate(false);return h;
}
async function poll(h){for(let i=0;i<4;i++){h.completePrograms();if(h.frames.size)h.frame(100);await h.settle();}}
function programs(h,body){const expected=physicalProgramSources(body);
  return Object.fromEntries(PHYSICAL_PROGRAM_ROLES.map(role=>[role,h.programs.find(program=>program.sources.includes(expected[role].fragment))]));}

test('pending Earth programs cannot admit Mars, and returning to Earth reuses only its exact sources',async t=>{
  const h=await boot(t);h.input('orreryAnchor','Earth','change');await h.settle();
  const earth=programs(h,'Earth');assert.ok(Object.values(earth).every(Boolean),'request all four live Earth-specialized programs');
  h.input('orreryAnchor','Mars','change');await h.settle();
  const mars=programs(h,'Mars');assert.ok(Object.values(mars).every(Boolean),'request distinct Mars-specialized programs');
  for(const role of Object.keys(earth))assert.notEqual(earth[role],mars[role]);
  for(const body of ['Earth','Mars'])assert.ok(!h.programs.some(p=>p.sources.includes(physicalProgramSources(body).scatteringGenerator.fragment)),'unused complete oracle is not requested');
  h.completePrograms(program=>Object.values(earth).includes(program));
  if(h.frames.size)h.frame(100);await h.settle();
  assert.equal(h.state.programStatus.physical,'loading','Earth completion is insufficient for the selected Mars profile');
  await poll(h);assert.equal(h.state.opticsStatus.Mars,'ready');
  const count=h.programs.length;h.input('orreryAnchor','Earth','change');await poll(h);
  assert.equal(h.state.opticsStatus.Earth,'ready');assert.equal(h.programs.length,count,'both source sets stay cached');
  assert.deepEqual(programs(h,'Earth'),earth);
});

test('both ready physical bodies keep their source, optical uniforms and target ownership in one frame',async t=>{
  const h=await boot(t);
  for(const body of ['Earth','Mars','Earth']){h.input('orreryAnchor',body,'change');await poll(h);}
  h.input('orrerySize',2);h.state.radius=.5;
  const start=h.gpuDraws.length;h.resize(1440,1000);await h.settle();
  const draws=h.gpuDraws.slice(start).filter(draw=>draw.uniforms.u_atmosphereEnabled===1&&draw.uniforms.u_mode===0);
  const seen=new Set();
  for(const draw of draws){
    const body=['Earth','Mars'].find(body=>draw.program===programs(h,body).physicalSphere);
    if(!body)continue;seen.add(body);const profile=getAtmosphereProfile(body);
    assert.deepEqual(draw.uniforms.u_atmosphereDensityScaleKm.map(Math.fround),[profile.rayleighScaleHeightKm,profile.aerosolScaleHeightKm].map(Math.fround));
    assert.equal(draw.uniforms.u_scatteringReady,1);
    assert.equal(h.state.scatteringStatus[body].state,'submitted');
  }
  assert.deepEqual([...seen].sort(),['Earth','Mars']);
});

test('an older profile timeout neither cancels nor renews the current profile deadline',async t=>{
  const h=await boot(t);h.input('orreryAnchor','Earth','change');await h.settle();
  h.advanceMonotonicTime(20000);h.input('orreryAnchor','Mars','change');await h.settle();
  h.advanceMonotonicTime(30100);for(let i=0;i<3&&h.frames.size;i++)h.frame(100);await h.settle();
  assert.equal(h.state.programDiagnostics['Earth:physicalSphere'].status,'unavailable');
  assert.equal(h.state.programStatus.physical,'loading','foreign timeout must leave Mars pending');
  h.advanceMonotonicTime(50100);for(let i=0;i<3&&h.frames.size;i++)h.frame(100);await h.settle();
  assert.equal(h.state.programStatus.physical,'unavailable','Mars keeps its original 30-second deadline');
});
