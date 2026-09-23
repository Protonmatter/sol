import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSolarSequencePlayer, validateSolarSequence, parseSolarSequenceManifest } from '../../apps/web/js/solarSequencePlayer.js';

async function fixture() {
  const m = JSON.parse(await readFile(new URL('../../apps/web/solar-observation-sequence.v1.json', import.meta.url)));
  m.frames = m.frames.slice(0, 3);
  m.valid_time_range = [m.frames[0].observed_at, m.frames.at(-1).observed_at];
  return m;
}
function harness(m, overrides = {}) {
  const closed = [], shown = [];
  const player = createSolarSequencePlayer(m, {
    fetchImpl: async url => new Response(new Uint8Array(m.frames.find(f => url.endsWith(f.asset_path)).bytes), {headers: {'Content-Type':'image/jpeg'}}),
    digest: async (_bytes, frame) => frame.sha256,
    decode: async (_bytes, frame) => ({width:frame.width,height:frame.height,close(){closed.push(frame.id);}}),
    onFrame: value => shown.push(value), ...overrides,
  });
  return {player, closed, shown};
}
test('strict immutable admission rejects path, time, extra keys and budgets', async () => {
  const m = await fixture();
  assert.ok(Object.isFrozen(validateSolarSequence(m).frames[0]));
  for (const change of [x=>x.frames[0].asset_path='../escape', x=>x.frames[1].observed_at=x.frames[0].observed_at, x=>x.extra=true, x=>x.frames[0].width=10000]) {
    const bad=structuredClone(m); change(bad); assert.throws(()=>validateSolarSequence(bad));
  }
});
test('manifest text rejects duplicate keys and oversized input',async()=>{
  const m=await fixture(),text=JSON.stringify(m);
  assert.equal(parseSolarSequenceManifest(text).id,m.id);
  assert.throws(()=>parseSolarSequenceManifest(text.replace('"mission":"SDO"','"mission":"bad","mission":"SDO"')),/duplicate/);
  assert.throws(()=>parseSolarSequenceManifest(text.replace('"mission":"SDO"','"mi\\u0073sion":"bad","mission":"SDO"')),/duplicate/);
  assert.throws(()=>parseSolarSequenceManifest(' '.repeat(1048577)),/budget/);
});
test('closed schemas reject own prototype-named keys at manifest and frame levels',async()=>{
  const m=await fixture();
  for(const key of ['toString','constructor','__proto__'])for(const level of ['manifest','frame']){
    const bad=structuredClone(m),target=level==='manifest'?bad:bad.frames[0];
    Object.defineProperty(target,key,{value:'unknown',enumerable:true});
    assert.throws(()=>parseSolarSequenceManifest(JSON.stringify(bad)),/unknown key/,`${level}.${key}`);
  }
  const good=structuredClone(m);good.frames[0].wcs.extra_numeric=1;
  assert.doesNotThrow(()=>validateSolarSequence(good));
});
test('every early HTTP rejection cancels its owned open body and aborts request',async()=>{
  const m=await fixture();
  for(const kind of ['mime','status','length','malformed-length','origin','redirect']){
    let cancelled=false,signal;
    const h=harness(m,{fetchImpl:async(_url,options)=>{
      signal=options.signal;
      const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:kind==='status'?503:200,headers:{'content-type':kind==='mime'?'text/html':'image/jpeg',...(kind==='length'?{'content-length':'999999999'}:kind==='malformed-length'?{'content-length':'nope'}:{})}});
      if(kind==='origin')Object.defineProperty(response,'url',{value:'https://other.invalid/frame.jpg'});
      if(kind==='redirect')Object.defineProperty(response,'redirected',{value:true});
      return response;
    }});
    await h.player.seek(0);assert.equal(h.player.getState().status,'failed',kind);
    assert.equal(cancelled,true,`${kind}: body cancelled`);assert.equal(signal.aborted,true,`${kind}: request aborted`);
    assert.equal(h.shown.length,0);h.player.dispose();
  }
});
test('play requires explicit intent, timestamp follows verified pixels, endpoint has no loop', async () => {
  const m=await fixture(); const {player,shown,closed}=harness(m);
  assert.equal(player.getState().playing,false);
  await player.seek(0); player.play(); await player.advance(65);
  assert.equal(player.getState().observedAt,shown.at(-1).frame.observed_at);
  await player.seek(2); player.play(); await player.advance(100);
  assert.equal(player.getState().status,'ended'); assert.equal(player.getState().index,2);
  player.dispose(); assert.ok(closed.length); assert.equal(player.getState().status,'disposed');
});
test('hash failure holds visible timestamp and reports failed',async()=>{
  const m=await fixture(); const {player}=harness(m,{digest:async(_b,f)=>f===m.frames[0]?f.sha256:'0'.repeat(64)});
  // Validation clones the manifest, so select by stable id.
  player.dispose();
  const h=harness(m,{digest:async(_b,f)=>f.id===m.frames[0].id?f.sha256:'0'.repeat(64)});
  await h.player.seek(0); await h.player.seek(1);
  assert.equal(h.player.getState().observedAt,m.frames[0].observed_at);
  assert.equal(h.player.getState().status,'failed'); h.player.dispose();
});
test('late seek completion cannot publish or retain obsolete bitmap',async()=>{
  const m=await fixture(); let release; const gate=new Promise(r=>release=r);
  const h=harness(m,{decode:async(_b,f)=>{if(f.id===m.frames[0].id)await gate;return {width:f.width,height:f.height,close(){}};}});
  const first=h.player.seek(0); await new Promise(r=>setTimeout(r,0));
  const latest=h.player.seek(2); release(); await first;await latest;
  assert.equal(h.shown.length,1); assert.equal(h.player.getState().index,2); h.player.dispose();
});
test('decoded memory ring stays bounded, obsolete seeks never start decode',async()=>{
  const m=await fixture(); let release;const gate=new Promise(r=>release=r);let active=0,maxActive=0,live=0,maxLive=0;
  const h=harness(m,{decode:async(_b,f)=>{active++;maxActive=Math.max(maxActive,active);if(f.id===m.frames[0].id)await gate;active--;live++;maxLive=Math.max(maxLive,live);return{width:512,height:512,close(){live--;}};}});
  const first=h.player.seek(0);await new Promise(r=>setTimeout(r,0));
  const pending=Array.from({length:20},(_,i)=>h.player.seek(1+i%2));release();await Promise.all([first,...pending]);
  assert.equal(maxActive,1);assert.ok(maxLive<=3);assert.equal(h.shown.length,1);h.player.dispose();assert.equal(live,0);
});
test('oversized/MIME/redirect responses cannot replace the displayed frame',async()=>{
  const m=await fixture();
  for(const response of [()=>new Response(new Uint8Array(m.frames[0].bytes+1),{headers:{'content-type':'image/jpeg'}}),()=>new Response('html',{headers:{'content-type':'text/html'}}),()=>({ok:true,redirected:true,headers:new Headers({'content-type':'image/jpeg'}),body:new ReadableStream()})]){
    const h=harness(m,{fetchImpl:async()=>response()});await h.player.seek(0);assert.equal(h.player.getState().status,'failed');assert.equal(h.shown.length,0);h.player.dispose();
  }
});
test('gap holds actual displayed time until explicit seek',async()=>{
  const m=await fixture(); const t=Date.parse(m.frames[0].observed_at);
  m.frames[1].observed_at=new Date(t+300000).toISOString(); m.frames[1].gap_before_seconds=300;
  m.frames[2].observed_at=new Date(t+360000).toISOString(); m.frames[2].gap_before_seconds=60;
  m.valid_time_range[1]=m.frames[2].observed_at;
  const {player}=harness(m);await player.seek(0);player.play();await player.advance(310);
  assert.equal(player.getState().status,'gap');assert.equal(player.getState().index,0);
  assert.equal(player.getState().gapSeconds,300);player.dispose();
});
test('pause cancels stream reads and timeout produces failure without pixels',async()=>{
  const m=await fixture();let cancelled=false;
  const h=harness(m,{fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'image/jpeg'}}),timeoutMs:5});
  await h.player.seek(0);assert.equal(h.player.getState().status,'failed');assert.equal(cancelled,true);assert.equal(h.shown.length,0);h.player.dispose();
});
test('pause during decode suppresses late frame and closes bitmap',async()=>{
  const m=await fixture();let release;const gate=new Promise(r=>release=r);let closed=false;
  const h=harness(m,{decode:async()=>{await gate;return {width:512,height:512,close(){closed=true;}};}});
  const pending=h.player.seek(0);await new Promise(r=>setTimeout(r,0));h.player.pause('background');release();await pending;
  assert.equal(h.shown.length,0);assert.equal(closed,true);assert.equal(h.player.getState().playing,false);h.player.dispose();
});
