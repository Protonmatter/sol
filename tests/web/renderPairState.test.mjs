import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRenderPairState,assertRenderPairStable,waitForRenderPairState} from '../../tools/render_pair_state.mjs';
const ready=()=>({schema:'render-pair-state.v1',body:'Earth',active:true,animate:false,epoch:100,
  camera:{anchor:'Earth',az:.3,el:.62,radius:.28,freeFly:false,galaxy:false,topDown:false},
  quality:{planetLook:'source-qualified',useTextures:true,opticsEnabled:true,terrainEnabled:true,
    earthNight:true,earthWeather:true,earthIce:false,hdrEnabled:false,exaggeration:1},
  geometry:[732,612,731.5,612],earthPosition:[1,2,3],maps:{surface:'ready',cloud:'ready'},base:'ready',physical:'ready',optics:'ready',
  frame:{contextGeneration:1,sceneSerial:2,epoch:100},terrainRendered:false,
  scattering:{state:'submitted',contextGeneration:1,programGeneration:1,submission:{contextGeneration:1,sceneSerial:2,epoch:100}}});

test('settled state and 2π camera return preserve identities without freezing scene serial',()=>{
  const a=ready(),b=ready();b.camera.az+=2*Math.PI;b.frame.sceneSerial=3;b.scattering.submission.sceneSerial=3;
  assert.equal(inspectRenderPairState(a,{requirePhysical:true}).state,'ready');
  assert.equal(assertRenderPairStable(a,b,{requirePhysical:true}).settled,true);
});
for(const kind of ['program','optics','submission','frame','map','terrain'])test(`ready maps do not bypass pending ${kind}`,()=>{
  const s=ready();if(kind==='program')s.physical='loading';if(kind==='optics')s.optics='loading';
  if(kind==='submission')s.scattering.submission.sceneSerial=1;if(kind==='frame')s.frame=null;
  if(kind==='map')s.maps.cloud='loading';if(kind==='terrain')delete s.terrainRendered;
  assert.equal(inspectRenderPairState(s,{requirePhysical:true}).state,'loading');
});
for(const kind of ['epoch','camera','azimuth','material','programGeneration','context','geometry','position','map','terrain'])test(`changed ${kind} fails state comparison`,()=>{
  const a=ready(),b=ready();
  if(kind==='epoch'){b.epoch=101;b.frame.epoch=101;b.scattering.submission.epoch=101;}
  if(kind==='camera')b.camera.radius+=.01;if(kind==='azimuth')b.camera.az+=.001;if(kind==='material')b.quality.earthNight=false;
  if(kind==='programGeneration')b.scattering.programGeneration++;
  if(kind==='context'){b.frame.contextGeneration++;b.scattering.contextGeneration++;b.scattering.submission.contextGeneration++;}
  if(kind==='geometry')b.geometry[0]++;if(kind==='position')b.earthPosition[0]+=.001;
  if(kind==='map')b.maps.newSurface='ready';if(kind==='terrain')b.terrainRendered=true;
  assert.throws(()=>assertRenderPairStable(a,b,{requirePhysical:true}),/Round-trip/);
});
test('terminal degraded path is explicit and never satisfies required physical admission',()=>{
  const s=ready();s.optics='unavailable';
  assert.equal(inspectRenderPairState(s,{requirePhysical:true}).state,'unavailable');
  assert.deepEqual(inspectRenderPairState(s),{state:'ready',path:'degraded'});
  const b=ready();assert.throws(()=>assertRenderPairStable(s,b),/identity changed/);
});
test('missing, nonfinite or moving states cannot pass',()=>{
  for(const mutate of [s=>delete s.quality,s=>s.camera.az=NaN,s=>s.earthPosition[0]=Infinity,s=>s.animate=true,
    s=>s.camera.anchor='Mars',s=>s.geometry[0]=0,s=>s.quality.opticsEnabled='true',s=>s.engineError='failed']){
    const s=ready();mutate(s);assert.equal(inspectRenderPairState(s).state,'unavailable');
  }
});
test('baseline wait uses only the original remaining budget and retains latest settled state',async()=>{
  const state=ready();let waits=0,disposed=false,evaluations=0;
  const page={evaluate:async()=>++evaluations===1?{expired:false,state:{...state,optics:'loading'},assessment:{state:'loading'},pageTimeMs:100}:true,
    waitForFunction:async(_fn,options)=>{waits++;assert.equal(options.timeout,400);return{
      jsonValue:async()=>({expired:false,state,assessment:{state:'ready'},pageTimeMs:150}),dispose:async()=>{disposed=true;}};}};
  const result=await waitForRenderPairState(page,{deadlineMs:500,requirePhysical:true});assert.equal(result.optics,'ready');assert.equal(waits,1);
  assert.equal(disposed,true);
});
test('expired or unbound deadlines fail before waiting',async()=>{
  const page={evaluate:async()=>({expired:true,state:null,assessment:null,pageTimeMs:2}),waitForFunction:()=>assert.fail('must not wait')};
  await assert.rejects(waitForRenderPairState(page,{}),/deadline required/);
  await assert.rejects(waitForRenderPairState(page,{deadlineMs:1}),/deadline elapsed/);
});

test('large azimuths cannot expand the rounding allowance or hide overflow',()=>{
  for(const [a,b] of [[1e15,1e15+1],[1e308,-1e308]]){
    const first=ready(),last=ready();first.camera.az=a;last.camera.az=b;
    assert.throws(()=>assertRenderPairStable(first,last),/binary64 gesture precision/);
  }
});
test('loading timeout retains the initial state and terminal unavailability retains its sample',async()=>{
  const initial={expired:false,state:{...ready(),optics:'loading'},assessment:{state:'loading'},pageTimeMs:1};
  const failure=new Error('wait timeout');
  await assert.rejects(waitForRenderPairState({evaluate:async()=>initial,waitForFunction:async()=>{throw failure;}},{deadlineMs:500}),
    error=>error===failure&&error.renderPairReadiness.initial.state.optics==='loading'&&error.renderPairReadiness.terminal===null);
  const unavailable={...initial,assessment:{state:'unavailable',reason:'optics unavailable'}};
  await assert.rejects(waitForRenderPairState({evaluate:async()=>unavailable},{deadlineMs:500}),
    error=>error.renderPairReadiness.terminal===unavailable&&/unavailable/.test(error.message));
});

test('handle cleanup cannot replace a readiness failure and cannot silently pass after success',async()=>{
  for(const status of ['ready','unavailable']){
    const initial={expired:false,state:ready(),assessment:{state:'loading'},pageTimeMs:1};
    const cleanup=new Error('dispose failed');const page={evaluate:async()=>initial,
      waitForFunction:async()=>({jsonValue:async()=>({...initial,assessment:{state:status,reason:'actual readiness failure'}}),
        dispose:async()=>{throw cleanup;}})};
    await assert.rejects(waitForRenderPairState(page,{deadlineMs:500}),error=>status==='unavailable'?
      /actual readiness failure/.test(error.message)&&error.renderPairCleanupError.includes('dispose failed'):error===cleanup);
  }
});

test('map and setting key insertion order does not change recorded identity',()=>{
  const a=ready(),b=ready();b.maps=Object.fromEntries(Object.entries(b.maps).reverse());
  b.quality=Object.fromEntries(Object.entries(b.quality).reverse());assert.doesNotThrow(()=>assertRenderPairStable(a,b));
});
test('empty demanded maps and reported GL errors cannot settle as a physical baseline',()=>{
  const empty=ready();empty.maps={};assert.equal(inspectRenderPairState(empty).state,'unavailable');
  const errors=ready();errors.scattering.glErrors=[1282];assert.equal(inspectRenderPairState(errors).state,'unavailable');
});
