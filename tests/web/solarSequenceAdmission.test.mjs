import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSolarSequencePlayer,validateSolarSequence} from '../../apps/web/js/solarSequencePlayer.js';

async function fixture(count=3) {
  const m=JSON.parse(await readFile(new URL('../../apps/web/solar-observation-sequence.v1.json',import.meta.url)));
  m.frames=m.frames.slice(0,count);
  m.valid_time_range=[m.frames[0].observed_at,m.frames.at(-1).observed_at];
  return m;
}
const jpeg=bytes=>new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg'}});
function player(m,overrides={}) {
  const shown=[],states=[],closed=[];
  const p=createSolarSequencePlayer(m,{
    fetchImpl:async url=>jpeg(m.frames.find(f=>url.endsWith(f.asset_path)).bytes),
    digest:async(_b,frame)=>frame.sha256,
    decode:async(_b,frame)=>({width:frame.width,height:frame.height,close(){closed.push(frame.id);}}),
    onFrame:v=>shown.push(v),onState:s=>states.push(s),...overrides});
  return {p,shown,states,closed};
}

test('every schema rule class rejects a violating manifest', async () => {
  const m=await fixture();
  const cases={
    'wrong const':x=>{x.mission='SOHO';},
    'number type':x=>{x.expected_cadence_seconds='12';},
    'below minimum':x=>{x.expected_cadence_seconds=1;},
    'above maximum':x=>{x.expected_cadence_seconds=99999;},
    'non-integer':x=>{x.frames[0].bytes=10.5;},
    'non-finite':x=>{x.frames[0].gap_before_seconds=Infinity;},
    'nullable fractional':x=>{x.frames[0].quality_raw=1.5;},
    'empty string':x=>{x.credits='';},
    'string pattern':x=>{x.id='not-an-id';},
    'string type':x=>{x.credits=7;},
    'array too short':x=>{x.source_urls=[];},
    'array too long':x=>{x.source_urls=Array(9).fill(x.source_urls[0]);},
    'not an array':x=>{x.limitations='text';},
    'object required':x=>{x.frames[0].wcs=[1,2];},
    'null object':x=>{x.frames[0]=null;},
    'missing key':x=>{delete x.frames[0].sha256;},
    'open map value type':x=>{x.frames[0].wcs={crpix1:'center'};},
    'calendar normalisation':x=>{x.frames[0].observed_at='2026-02-30T00:00:00Z';},
    'gap mismatch':x=>{x.frames[1].gap_before_seconds+=5;},
    'range start':x=>{x.valid_time_range=[x.frames[1].observed_at,x.valid_time_range[1]];},
    'range end':x=>{x.valid_time_range=[x.valid_time_range[0],x.frames[0].observed_at];},
    'duplicate id':x=>{x.frames[1].id=x.frames[0].id;},
  };
  for(const [name,change] of Object.entries(cases)){const bad=structuredClone(m);change(bad);assert.throws(()=>validateSolarSequence(bad),undefined,name);}
  // Nullable members accept null rather than tripping the numeric rule.
  const nullable=structuredClone(m);nullable.frames[0].exposure_seconds=null;nullable.frames[0].quality_raw=null;
  assert.equal(validateSolarSequence(nullable).frames[0].exposure_seconds,null);
});

test('player options and bounds are enforced before any request', async () => {
  const m=await fixture();
  for(const timeoutMs of [0,16000,NaN])assert.throws(()=>createSolarSequencePlayer(m,{timeoutMs}),/timeout budget/);
  assert.throws(()=>createSolarSequencePlayer(m,{baseUrl:'file:///tmp/'}),/same-origin HTTP/);
  const {p}=player(m);
  await assert.rejects(p.seek(-1),/outside archive/);
  await assert.rejects(p.seek(3),/outside archive/);
  await assert.rejects(p.advance(-1),/nonnegative/);
  assert.equal(p.play(),false,'nothing shown yet');
  p.pause();assert.equal(p.getState().status,'deferred');
});

test('fetch, MIME, origin, integrity and geometry failures surface as failed without drawing', async () => {
  const m=await fixture();
  const failures={
    'network':{fetchImpl:async()=>{throw new Error('offline');}},
    'mime':{fetchImpl:async()=>new Response(new Uint8Array(m.frames[0].bytes),{headers:{'Content-Type':'text/html'}})},
    'redirected origin':{fetchImpl:async()=>{const r=jpeg(m.frames[0].bytes);Object.defineProperty(r,'url',{value:'https://evil.example/x.jpg'});return r;}},
    'http status':{fetchImpl:async()=>new Response(new Uint8Array(4),{status:404,headers:{'Content-Type':'image/jpeg'}})},
    'declared length':{fetchImpl:async()=>new Response(new Uint8Array(4),{headers:{'Content-Type':'image/jpeg','Content-Length':String(10**9)}})},
    'oversize body':{fetchImpl:async()=>jpeg(m.frames[0].bytes+1)},
    'short body':{fetchImpl:async()=>jpeg(m.frames[0].bytes-1)},
    'digest':{digest:async()=>'0'.repeat(64)},
    'geometry':{decode:async()=>({width:1,height:1,close(){}})},
  };
  for(const [name,overrides] of Object.entries(failures)){
    const {p,shown}=player(m,overrides);
    assert.equal(await p.seek(0),false,name);
    assert.equal(p.getState().status,'failed',name);
    assert.equal(shown.length,0,name);
    assert.equal(p.play(),false,`${name}: failed state cannot play`);
  }
});

test('playback ends on the last frame, replays from the start and disposes once', async () => {
  const m=await fixture();
  const {p,shown,closed,states}=player(m);
  assert.ok(await p.seek(2));
  assert.equal(p.play(),false);assert.equal(p.getState().status,'ended');
  await p.replay();assert.equal(p.getState().index,0);assert.equal(p.getState().playing,true);
  await p.advance(0);assert.equal(p.getState().index,0,'zero delta does not step');
  await p.advance(1e6);assert.equal(p.getState().status,'ended');
  assert.ok(shown.length>=3);
  p.dispose();p.dispose();
  assert.equal(states.filter(s=>s.status==='disposed').length,1,'dispose is idempotent');
  assert.ok(closed.length>=1,'retained bitmaps are closed');
  assert.equal(await p.seek(0),false,'disposed player ignores seeks');
  assert.equal(p.play(),false);p.pause();
});

test('the decoded ring keeps at most three frames and closes evicted bitmaps', async () => {
  const m=await fixture(6);
  const {p,closed}=player(m);
  for(let i=0;i<6;i++)assert.ok(await p.seek(i));
  assert.ok(closed.length>=3,'older frames were evicted and closed');
  assert.ok(!closed.includes(m.frames[5].id),'the displayed frame is retained');
});
