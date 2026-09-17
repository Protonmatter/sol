import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {PLANET_PHENOMENA, phenomenaForBody, loadPhenomenonImage, renderPlanetPhenomena, PHENOMENON_TIMEOUT_MS} from '../../apps/web/js/planetPhenomena.js';

const root=new URL('../../apps/web/',import.meta.url);
test('source gallery keeps verified bytes separate from unqualified globe mapping',async()=>{
  const json=JSON.parse(await fs.readFile(new URL('planet-phenomena.v1.json',root),'utf8'));
  assert.deepEqual(PLANET_PHENOMENA,json);
  assert.ok(Object.isFrozen(PLANET_PHENOMENA.observations[0]));
  let total=0;
  for(const item of PLANET_PHENOMENA.observations){
    assert.equal(item.mapping_status,'unqualified');
    assert.deepEqual(item.allowed_usages,['observation-gallery']);
    assert.equal(item.playback,'static-reference');
    assert.notEqual(item.observation.label,item.published_at);
    const bytes=await fs.readFile(new URL(item.asset.path,root));total+=bytes.length;
    assert.equal(bytes.length,item.asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.asset.sha256);
    assert.equal(item.source_sha256,item.asset.sha256,'unmodified official published image');
  }
  assert.ok(total<1500000);assert.equal(PLANET_PHENOMENA.observations.length,5);
});
test('phenomena retain correct bodies, hemispheres, spectral interpretation and missing coverage',()=>{
  assert.equal(phenomenaForBody('Jupiter').length,2);
  const saturn=phenomenaForBody('Saturn');
  assert.equal(saturn.find(x=>x.id==='saturn-hexagon').hemisphere,'north');
  const south=saturn.find(x=>x.id==='saturn-decagon');
  assert.equal(south.hemisphere,'south');assert.match(south.coverage,/missing/i);assert.match(south.band,/F763M/);
  assert.match(phenomenaForBody('Neptune')[0].coverage,/mid-latitude/i);
  assert.match(phenomenaForBody('Jupiter').find(x=>x.id==='jupiter-aurora').band,/3.36/);
  assert.deepEqual(phenomenaForBody('Earth'),[]);assert.deepEqual(phenomenaForBody('<img>'),[]);
});
test('image loader uses selected same-origin asset only and rejects byte/hash substitution',async()=>{
  const item=phenomenaForBody('Saturn')[1],raw=await fs.readFile(new URL(item.asset.path,root));
  let url;
  const blob=await loadPhenomenonImage(item.id,{fetcher:async value=>{url=value;return new Response(raw);}});
  assert.equal(url.href,new URL(item.asset.path,root).href);assert.equal(blob.size,raw.length);assert.equal(blob.type,item.asset.mime);
  const corrupt=Uint8Array.from(raw);corrupt[20]^=1;
  await assert.rejects(loadPhenomenonImage(item.id,{fetcher:async()=>new Response(corrupt)}),/hash|SHA-256/);
  await assert.rejects(loadPhenomenonImage(item.id,{fetcher:async()=>new Response(raw.subarray(1))}),/truncat|size/);
  await assert.rejects(loadPhenomenonImage('unknown',{fetcher:async()=>{throw Error('must not fetch');}}),/unknown/i);
});
test('image loader cancels oversize streams and bounds cancellation or stalled requests',async t=>{
  const item=phenomenaForBody('Saturn')[1];let cancelled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(item.asset.bytes+1));},cancel(){cancelled=true;}});
  await assert.rejects(loadPhenomenonImage(item.id,{fetcher:async()=>new Response(stream)}),/size|budget/);assert.ok(cancelled);
  const abort=new AbortController();abort.abort();
  await assert.rejects(loadPhenomenonImage(item.id,{signal:abort.signal}),{name:'AbortError'});
  t.mock.timers.enable({apis:['setTimeout']});let signal;
  const pending=loadPhenomenonImage(item.id,{fetcher:(_,options)=>{signal=options.signal;return new Promise(()=>{});}});
  t.mock.timers.tick(PHENOMENON_TIMEOUT_MS);await assert.rejects(pending,{name:'TimeoutError'});assert.ok(signal.aborted);
});

function dom(){
  class Element {
    constructor(tagName,ownerDocument){this.tagName=tagName;this.ownerDocument=ownerDocument;this.children=[];this.attributes={};this.dataset={};this.events={};this.hidden=false;this.ownText='';this.className='';}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[...children];}
    set textContent(value){this.ownText=String(value);this.children=[];}
    get textContent(){return this.ownText+this.children.map(x=>x.textContent||'').join('');}
    setAttribute(key,value){this.attributes[key]=String(value);}
    removeAttribute(key){delete this.attributes[key];if(key==='src')this.src='';}
    addEventListener(type,fn){this.events[type]=fn;}
    dispatch(type){this.events[type]?.({target:this});}
  }
  const document={createElement:tag=>new Element(tag,document)};
  return new Element('section',document);
}
const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('gallery has native keyboard selection, text-only DOM, explicit source captions, selected-image-only loading',async()=>{
  const host=dom(),loads=[],urls=[],revoked=[];
  const dispose=renderPlanetPhenomena(host,'Saturn',{loadImage:async id=>{loads.push(id);return new Blob(['image']);},objectUrls:{createObjectURL:()=>{const value='blob:local-'+urls.length;urls.push(value);return value;},revokeObjectURL:url=>revoked.push(url)}});
  await tick();
  assert.equal(host.hidden,false);assert.deepEqual(loads,['saturn-hexagon']);
  const nodes=descendants(host),select=nodes.find(x=>x.tagName==='select');
  assert.ok(select);assert.equal(select.attributes['aria-label'],'Saturn mission observation');
  assert.ok(nodes.some(x=>x.tagName==='figure'));assert.ok(nodes.some(x=>x.tagName==='figcaption'));
  assert.match(host.textContent,/reference/i);assert.match(host.textContent,/10 Dec 2012/);
  select.value='saturn-decagon';select.dispatch('change');await tick();
  assert.deepEqual(loads,['saturn-hexagon','saturn-decagon']);
  assert.match(host.textContent,/29 Aug 2025/);assert.match(host.textContent,/South/i);assert.match(host.textContent,/F763M/);assert.match(host.textContent,/missing/i);
  for(const link of descendants(host).filter(x=>x.tagName==='a')){
    assert.match(link.href,/^https:\/\//);assert.equal(link.rel,'noopener noreferrer');
  }
  dispose();assert.deepEqual(revoked,urls);assert.equal(host.children.length,0);
});
test('stale image results cannot replace selection; failures retain source evidence and cleanup cancels',async()=>{
  const host=dom(),pending=[],revoked=[];let count=0;
  const dispose=renderPlanetPhenomena(host,'Jupiter',{loadImage:(id,{signal})=>new Promise((resolve,reject)=>pending.push({id,signal,resolve,reject})),objectUrls:{createObjectURL:()=> 'blob:'+count++,revokeObjectURL:url=>revoked.push(url)}});
  const select=descendants(host).find(x=>x.tagName==='select');
  select.value='jupiter-storm';select.dispatch('change');assert.ok(pending[0].signal.aborted);
  pending[0].resolve(new Blob(['old']));await tick();assert.equal(count,0);
  pending[1].reject(new Error('hash mismatch'));await tick();
  assert.match(host.textContent,/unavailable/i);assert.match(host.textContent,/JunoCam/);
  dispose();assert.ok(pending[1].signal.aborted);assert.deepEqual(revoked,[]);
  renderPlanetPhenomena(host,'Earth');assert.ok(host.hidden);assert.equal(host.children.length,0);
});

test('one-option Neptune gallery retries a failed image in place and retains the verified result',async()=>{
  const host=dom(),pending=[],revoked=[];let created=0;
  const dispose=renderPlanetPhenomena(host,'Neptune',{loadImage:(id,{signal})=>new Promise((resolve,reject)=>pending.push({id,signal,resolve,reject})),objectUrls:{createObjectURL:()=>`blob:retry-${created++}`,revokeObjectURL:url=>revoked.push(url)}});
  const nodes=descendants(host),retry=nodes.find(x=>x.className==='planet-phenomena__retry'),image=nodes.find(x=>x.tagName==='img');
  assert.ok(retry,'a native retry button must be available for the failed selection');
  assert.equal(retry.tagName,'button');assert.equal(retry.type,'button');assert.equal(retry.hidden,true);
  assert.equal(nodes.find(x=>x.tagName==='select').children.length,1);
  pending[0].reject(Error('offline'));await tick();assert.equal(retry.hidden,false);assert.match(host.textContent,/unavailable/);
  retry.dispatch('click');retry.dispatch('click');assert.equal(pending.length,2,'double activation cannot restart pending work');
  assert.equal(pending[0].signal.aborted,true);assert.equal(retry.hidden,true);assert.equal(retry.disabled,true);
  assert.equal(pending[1].id,pending[0].id);
  pending[1].resolve(new Blob(['recovered']));await tick();
  [image.naturalWidth,image.naturalHeight]=phenomenaForBody('Neptune')[0].asset.dimensions;
  image.onload();assert.equal(image.hidden,false);assert.match(host.textContent,/Source image verified/);assert.equal(retry.hidden,true);
  retry.dispatch('click');assert.equal(pending.length,2,'a hidden ready-state retry cannot discard the verified image');
  dispose();assert.deepEqual(revoked,['blob:retry-0']);
});

test('gallery decode and dimension failures expose retry, with stale and disposed callbacks inert',async()=>{
  const host=dom(),pending=[],revoked=[];let created=0;
  const dispose=renderPlanetPhenomena(host,'Saturn',{loadImage:(id,{signal})=>new Promise((resolve,reject)=>pending.push({id,signal,resolve,reject})),objectUrls:{createObjectURL:()=>`blob:decode-${created++}`,revokeObjectURL:url=>revoked.push(url)}});
  const nodes=descendants(host),retry=nodes.find(x=>x.className==='planet-phenomena__retry'),image=nodes.find(x=>x.tagName==='img'),select=nodes.find(x=>x.tagName==='select');
  assert.ok(retry);
  pending[0].resolve(new Blob(['image']));await tick();const staleLoad=image.onload,staleError=image.onerror;
  image.onerror();assert.equal(retry.hidden,false);assert.deepEqual(revoked,['blob:decode-0']);
  retry.dispatch('click');assert.equal(pending.length,2);staleError();assert.equal(retry.hidden,true);
  pending[1].resolve(new Blob(['image']));await tick();image.naturalWidth=1;image.naturalHeight=1;image.onload();
  assert.equal(retry.hidden,false);assert.match(host.textContent,/unexpected dimensions/);assert.deepEqual(revoked,['blob:decode-0','blob:decode-1']);
  retry.dispatch('click');const abandoned=pending[2];select.value='saturn-decagon';select.dispatch('change');
  assert.equal(abandoned.signal.aborted,true);abandoned.resolve(new Blob(['old']));await tick();assert.equal(created,2);
  staleLoad();staleError();assert.equal(retry.hidden,true);
  dispose();const count=pending.length;retry.dispatch('click');assert.equal(pending.length,count);
  pending.at(-1).resolve(new Blob(['disposed']));await tick();assert.equal(created,2);assert.equal(host.children.length,0);
});
