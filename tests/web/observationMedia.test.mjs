import test from 'node:test';
import assert from 'node:assert/strict';
import { initObservationMedia } from '../../apps/web/js/observationMedia.js';

function fixture({complete=false,width=0}={}) {
  const nodes=Object.fromEntries(['observationImage','observationLoading','observationUnavailable','observationMedia','observationRetry'].map(id=>[id,{
    hidden:false,attributes:{},events:{},
    setAttribute(key,value){this.attributes[key]=value;},
    getAttribute(key){return this.attributes[key]??null;},
    addEventListener(key,listener){(this.events[key]??=[]).push(listener);},
    emit(key){for(const listener of this.events[key]??[])listener();},
  }]));
  const image=nodes.observationImage;
  image.attributes.src='textures/solar-observation-171.jpg';
  Object.assign(image,{complete,naturalWidth:width,currentSrc:'https://sol.example/sol/'+image.attributes.src});
  let assignments=0;
  Object.defineProperty(image,'src',{set(value){assignments++;this.attributes.src=value;},get(){return new URL(this.attributes.src,'https://sol.example/sol/').href;}});
  const document={baseURI:'https://sol.example/sol/',getElementById:id=>nodes[id]??null};
  return {document,nodes,image,get assignments(){return assignments;}};
}

test('successful and broken requests completed before boot are distinguished',()=>{
  for(const [width,expected] of [[1024,'ready'],[0,'failed']]) {
    const f=fixture({complete:true,width}),controller=initObservationMedia(f.document);
    assert.equal(controller.media,expected);
    assert.equal(f.image.hidden,expected!=='ready');
    assert.equal(f.nodes.observationUnavailable.hidden,expected!=='failed');
    assert.equal(f.nodes.observationLoading.hidden,true);
    assert.equal(f.nodes.observationMedia.attributes['aria-busy'],'false');
    assert.equal(f.assignments,0);
  }
});

test('pending request, early retry and later application adoption share one lifecycle',()=>{
  const f=fixture(),early=initObservationMedia(f.document);
  assert.equal(early.media,'loading');
  assert.equal(f.image.hidden,true);
  f.image.emit('error');
  assert.equal(early.media,'failed');
  f.nodes.observationRetry.emit('click');
  assert.equal(early.media,'loading');
  assert.equal(f.assignments,1);
  const application=initObservationMedia(f.document),states=[];
  const unsubscribe=application.subscribe(value=>states.push(value));
  assert.equal(application,early);
  assert.equal(f.image.events.load.length,1);
  assert.equal(f.nodes.observationRetry.events.click.length,1);
  f.image.naturalWidth=1024;f.image.emit('load');
  assert.deepEqual(states,['loading','ready']);
  assert.equal(f.image.hidden,false);
  f.image.emit('error');f.nodes.observationRetry.emit('click');
  assert.deepEqual(states,['loading','ready','failed','loading']);
  assert.equal(f.assignments,2,'one retry starts exactly one request after main application adoption');
  unsubscribe();f.image.emit('load');assert.equal(states.length,4);
});

test('late startup subscribes to ready state without another load or download',()=>{
  const f=fixture(),early=initObservationMedia(f.document);
  f.image.naturalWidth=1024;f.image.emit('load');
  const states=[];initObservationMedia(f.document).subscribe(value=>states.push(value));
  assert.deepEqual(states,['ready']);assert.equal(early.media,'ready');assert.equal(f.assignments,0);
});

test('a stale load for another source cannot manufacture readiness',()=>{
  const f=fixture({complete:true,width:1024});
  f.image.currentSrc='https://sol.example/sol/another-image.jpg';
  const controller=initObservationMedia(f.document);
  assert.equal(controller.media,'loading');
  assert.equal(f.image.hidden,true);
  f.image.emit('load');assert.equal(controller.media,'loading');
  f.image.currentSrc=f.image.src;f.image.emit('load');assert.equal(controller.media,'ready');
});

test('absent media markup is inert',()=>{
  assert.equal(initObservationMedia({getElementById:()=>null}),null);
});
