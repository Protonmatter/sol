import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSolarSequenceControls} from '../../apps/web/js/solarSequenceControls.js';

class Element extends EventTarget {
  constructor(){super();this.hidden=false;this.disabled=false;this.value='60';this.textContent='';this.attributes={};this.draws=0;}
  setAttribute(name,value){this.attributes[name]=value;}
  getContext(){return {drawImage:()=>{this.draws++;}};}
  fire(type){this.dispatchEvent(new Event(type));}
}
async function harness(fetchOverride){
  const ids=['observationSequenceCanvas','observationSequenceToggle','observationSequencePlay','observationSequenceRestart','observationSequenceTime','observationSequenceTimeLabel','observationSequenceControls','observationSequenceRate'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const doc=new EventTarget();doc.hidden=false;doc.baseURI='http://localhost/index.html';doc.getElementById=id=>elements[id];
  const motion=new EventTarget();motion.matches=false;
  const raf=new Map();let serial=0,changes=0;
  doc.defaultView={matchMedia:()=>motion,fetch:fetchOverride|| (async url=>{
    const path=new URL(url).pathname.slice(1),data=await readFile(new URL('../../apps/web/'+path,import.meta.url));
    return new Response(data,{headers:{'content-type':path.endsWith('.json')?'application/json':'image/jpeg'}});
  }),createImageBitmap:async()=>({width:512,height:512,close(){}}),requestAnimationFrame:callback=>{raf.set(++serial,callback);return serial;},cancelAnimationFrame:id=>raf.delete(id)};
  const controls=createSolarSequenceControls({document:doc,onChange:()=>changes++});
  const settle=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('condition did not settle');};
  const tick=async time=>{const callbacks=[...raf.values()];raf.clear();for(const callback of callbacks)await callback(time);};
  return {elements,doc,motion,raf,controls,settle,tick,changes:()=>changes};
}
test('DOM toggle loads hash-pinned real archive paused with actual timestamp and source labels',async()=>{
  const h=await harness();assert.equal(h.controls.active(),false);assert.equal(h.controls.presentation(),null);
  h.elements.observationSequenceToggle.fire('click');assert.equal(h.controls.active(),true);
  await h.settle(()=>h.controls.presentation()?.availability==='ready');
  const p=h.controls.presentation();assert.equal(p.sourceKind,'observed');assert.equal(p.capturedAt,'2024-05-10T16:29:57.349Z');assert.equal(p.compositingPermitted,false);assert.equal(p.modelBundleIdentity,null);
  assert.match(p.interpretation,/quality/i);assert.equal(h.elements.observationSequenceCanvas.draws,1);assert.equal(h.raf.size,0);
  h.elements.observationSequenceToggle.fire('click');assert.equal(h.controls.active(),false);assert.equal(h.controls.presentation(),null);assert.equal(h.elements.observationSequenceCanvas.hidden,true);h.controls.dispose();
});
test('play, scrub, hide and background are DOM-driven and never catch up hidden time',async()=>{
  const h=await harness();h.elements.observationSequenceToggle.fire('click');await h.settle(()=>h.controls.presentation()?.availability==='ready');
  h.elements.observationSequenceRate.value='600';h.elements.observationSequenceRate.fire('change');h.elements.observationSequencePlay.fire('click');
  await h.tick(1000);await h.tick(1200);assert.notEqual(h.controls.presentation().capturedAt,'2024-05-10T16:29:57.349Z');
  h.controls.setVisible(false);const held=h.controls.presentation().capturedAt;assert.equal(h.raf.size,0);h.controls.setVisible(true);await h.tick(999999);assert.equal(h.controls.presentation().capturedAt,held);assert.equal(h.raf.size,0);
  h.elements.observationSequenceTime.value='120';h.elements.observationSequenceTime.fire('input');await h.settle(()=>h.controls.presentation().capturedAt==='2024-05-10T18:30:09.350Z');assert.equal(h.raf.size,0);
  h.elements.observationSequenceRestart.fire('click');await h.settle(()=>h.controls.presentation().capturedAt==='2024-05-10T16:29:57.349Z');
  h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(h.raf.size,0);h.controls.dispose();
});
test('manifest corruption fails closed and selected loading is canceled on hide',async()=>{
  const bad=await harness(async()=>new Response('{}',{headers:{'content-type':'application/json'}}));bad.elements.observationSequenceToggle.fire('click');await bad.settle(()=>bad.controls.presentation()?.availability==='unavailable');assert.equal(bad.elements.observationSequenceCanvas.draws,0);bad.controls.dispose();
  let aborted=false,cancelled=false;
  const pending=await harness(async(_url,options)=>{options.signal.addEventListener('abort',()=>aborted=true);return new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}});});
  pending.elements.observationSequenceToggle.fire('click');await new Promise(r=>setTimeout(r,0));pending.controls.setVisible(false);await new Promise(r=>setTimeout(r,0));assert.equal(aborted,true);assert.equal(cancelled,true);assert.equal(pending.elements.observationSequenceCanvas.draws,0);pending.controls.dispose();
});
test('reduced motion blocks play and disposal removes listeners',async()=>{
  const h=await harness();h.elements.observationSequenceToggle.fire('click');await h.settle(()=>h.controls.presentation()?.availability==='ready');h.motion.matches=true;h.motion.dispatchEvent(new Event('change'));h.elements.observationSequencePlay.fire('click');assert.equal(h.raf.size,0);
  h.controls.dispose();const before=h.changes();h.elements.observationSequenceToggle.fire('click');h.elements.observationSequenceTime.fire('input');assert.equal(h.changes(),before);assert.equal(h.raf.size,0);
});
test('reduced-motion change during active playback cancels scheduling and holds frame time',async()=>{
  const h=await harness();h.elements.observationSequenceToggle.fire('click');await h.settle(()=>h.controls.presentation()?.availability==='ready');
  h.elements.observationSequencePlay.fire('click');await h.tick(1000);
  assert.equal(h.elements.observationSequencePlay.attributes['aria-pressed'],'true');
  const held=h.controls.presentation().capturedAt;
  h.motion.matches=true;h.motion.dispatchEvent(new Event('change'));
  assert.equal(h.elements.observationSequencePlay.attributes['aria-pressed'],'false');assert.equal(h.raf.size,0);
  await h.tick(999999);assert.equal(h.controls.presentation().capturedAt,held);
  h.controls.dispose();
});
test('RAF observes reduced-motion policy before its change event without leaving stale playing state',async()=>{
  const h=await harness();h.elements.observationSequenceToggle.fire('click');await h.settle(()=>h.controls.presentation()?.availability==='ready');
  h.elements.observationSequencePlay.fire('click');await h.tick(1000);
  h.motion.matches=true; // MediaQueryList state can update before its queued event.
  await h.tick(1200);
  assert.equal(h.elements.observationSequencePlay.attributes['aria-pressed'],'false');assert.equal(h.raf.size,0);
  h.controls.dispose();
});
test('reduced-motion policy arriving during frame decode pauses before scheduling again',async()=>{
  const h=await harness();h.elements.observationSequenceToggle.fire('click');await h.settle(()=>h.controls.presentation()?.availability==='ready');
  let release,decoding=false;const gate=new Promise(resolve=>release=resolve);
  h.doc.defaultView.createImageBitmap=async()=>{decoding=true;await gate;return{width:512,height:512,close(){}};};
  h.elements.observationSequenceRate.value='600';h.elements.observationSequenceRate.fire('change');h.elements.observationSequencePlay.fire('click');await h.tick(1000);
  const pending=h.tick(2000);await h.settle(()=>decoding);h.motion.matches=true;release();await pending;
  assert.equal(h.elements.observationSequencePlay.attributes['aria-pressed'],'false');assert.equal(h.raf.size,0);h.controls.dispose();
});
test('replacement frame failure retains actual pixels and declares last_valid source',async()=>{
  const h=await harness(async url=>{
    const path=new URL(url).pathname.slice(1);
    const data=path.endsWith('frame-120.jpg')?new Uint8Array([1,2,3]):await readFile(new URL('../../apps/web/'+path,import.meta.url));
    return new Response(data,{headers:{'content-type':path.endsWith('.json')?'application/json':'image/jpeg'}});
  });
  h.elements.observationSequenceToggle.fire('click');await h.settle(()=>h.controls.presentation()?.availability==='ready');
  const held=h.controls.presentation().capturedAt;h.elements.observationSequenceTime.value='120';h.elements.observationSequenceTime.fire('input');
  await h.settle(()=>h.controls.presentation()?.headline.includes('unavailable'));
  assert.equal(h.controls.presentation().availability,'last_valid');assert.equal(h.controls.presentation().capturedAt,held);assert.equal(h.elements.observationSequenceCanvas.draws,1);h.controls.dispose();
});
test('manifest header admission failures cancel open bodies immediately',async()=>{
  for(const kind of ['mime','status','oversize','redirect','origin']){
    let canceled=false,aborted=false;
    const h=await harness(async(_url,options)=>{
      options.signal.addEventListener('abort',()=>aborted=true);
      const response=new Response(new ReadableStream({cancel(){canceled=true;}}),{status:kind==='status'?503:200,headers:{'content-type':kind==='mime'?'text/html':'application/json',...(kind==='oversize'?{'content-length':'1048577'}:{})}});
      if(kind==='redirect')Object.defineProperty(response,'redirected',{value:true});
      if(kind==='origin')Object.defineProperty(response,'url',{value:'https://other.invalid/manifest.json'});
      return response;
    });
    h.elements.observationSequenceToggle.fire('click');await h.settle(()=>h.controls.presentation()?.availability==='unavailable');assert.equal(canceled,true,kind);assert.equal(aborted,true,kind);h.controls.dispose();
  }
});
