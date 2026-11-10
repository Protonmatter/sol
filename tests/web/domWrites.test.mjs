import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';

const textNode=value=>({nodeType:3,textContent:value});
const commentNode=value=>({nodeType:8,textContent:value});
const elementNode=value=>({nodeType:1,textContent:value});
// Records arguments BEFORE host conversion. Browser parity is checked separately.
class ElementHost {
  constructor(children=[]){this.childNodes=children;this.attributes=new Map();this.writes=[];}
  get textContent(){return this.childNodes.filter(node=>node.nodeType!==8).map(node=>node.textContent).join('');}
  set textContent(value){
    this.writes.push({property:'textContent',value});
    if(typeof value==='symbol')throw new TypeError('Cannot convert a Symbol to DOMString');
    const converted=value==null?'':String(value);
    this.childNodes=converted===''?[]:[textNode(converted)];
  }
  getAttribute(name){return this.attributes.get(name)??null;}
  get title(){return this.getAttribute('title')??'';}
  set title(value){this.writes.push({property:'title',value});if(typeof value==='symbol')throw new TypeError('Symbol title');this.attributes.set('title',String(value));}
  get className(){return this.getAttribute('class')??'';}
  set className(value){this.writes.push({property:'className',value});this.attributes.set('class',String(value));}
}
async function harness(node=new ElementHost()){
  const context=vm.createContext({document:{getElementById:id=>id==='target'?node:null}});
  const [api]=await loadSourceModules(context,[new URL('../../apps/web/js/dom.js',import.meta.url)]);
  return {api,node};
}
for(const children of [[],[textNode('seed')]])test('unchanged plain string avoids replacing '+(children.length?'its Text node':'empty content'),async()=>{
  const node=new ElementHost(children),{api}=await harness(node),first=node.childNodes[0];
  api.text('target',node.textContent);assert.equal(node.writes.length,0);assert.equal(node.childNodes[0],first);
  api.text('target','new');assert.equal(node.textContent,'new');assert.equal(node.writes.length,1);
});
for(const children of [[elementNode('seed')],[commentNode('comment'),textNode('seed')],[textNode('se'),textNode('ed')],[commentNode('only comment')]])test('matching aggregate text still flattens node types '+children.map(n=>n.nodeType),async()=>{
  const node=new ElementHost(children),{api}=await harness(node),value=node.textContent;
  api.text('target',value);assert.equal(node.writes.length,1);
  assert.equal(node.childNodes.length,value===''?0:1);if(value!=='')assert.equal(node.childNodes[0].nodeType,3);
});
for(const value of [null,undefined,0,false,NaN,Infinity,new String('seed')])test('non-string '+String(value)+' reaches original text setter unchanged',async()=>{
  const node=new ElementHost([textNode(value==null?'':String(value))]),{api}=await harness(node);
  api.text('target',value);assert.equal(node.writes.length,1);assert.ok(Object.is(node.writes[0].value,value));
});
test('object conversion happens once in the original setter and Symbol rejection remains intact',async()=>{
  let conversions=0;const value={toString(){conversions++;return 'seed';}},node=new ElementHost([textNode('seed')]),{api}=await harness(node);
  api.text('target',value);assert.equal(conversions,1);assert.equal(node.writes[0].value,value);
  const symbol=Symbol('bad');assert.throws(()=>api.textWithTitle('target',symbol,'unreached'),TypeError);
  assert.equal(node.writes.at(-1).value,symbol);assert.equal(node.getAttribute('title'),null);
});
test('absent empty title is assigned once, then identical leaf and title assignments are skipped',async()=>{
  const node=new ElementHost([textNode('seed')]),{api}=await harness(node);assert.equal(node.title,'');assert.equal(node.getAttribute('title'),null);
  api.textWithTitle('target','seed','');assert.deepEqual(node.writes,[{property:'title',value:''}]);
  api.textWithTitle('target','seed','');assert.equal(node.writes.length,1);
  api.textWithTitle('target','new','details');assert.equal(node.textContent,'new');assert.equal(node.title,'details');assert.equal(node.writes.length,3);
  api.textWithTitle('target','new',null);assert.equal(node.writes.at(-1).value,null);assert.equal(node.title,'null');
});
test('state pill keeps current content and class without recreating the leaf, and still changes state',async()=>{
  const node=new ElementHost([textNode('live')]);node.attributes.set('class','state-pill ready');const {api}=await harness(node),first=node.childNodes[0];
  api.setPill('target','live','ready');assert.equal(node.writes.length,0);assert.equal(node.childNodes[0],first);
  api.setPill('target','failed','unavailable');assert.equal(node.textContent,'failed');assert.equal(node.className,'state-pill unavailable');assert.equal(node.writes.length,2);
});
test('state-class conversion still follows text assignment and missing targets do not coerce arguments',async()=>{
  const node=new ElementHost(),{api}=await harness(node);assert.throws(()=>api.setPill('target','changed',Symbol('bad')));assert.equal(node.textContent,'changed');
  const value={toString(){throw Error('unreachable');}};api.text('missing',value);api.textWithTitle('missing',value,value);api.setPill('missing',value,value);
});
test('legacy hosts without node/attribute APIs retain their original assignments',async()=>{
  const writes=[],node={get textContent(){return 'seed';},set textContent(v){writes.push(['text',v]);},set title(v){writes.push(['title',v]);},set className(v){writes.push(['class',v]);}};
  const {api}=await harness(node);api.text('target','seed');api.textWithTitle('target','seed','');api.setPill('target','seed','ready');
  assert.deepEqual(writes,[['text','seed'],['text','seed'],['title',''],['text','seed'],['class','state-pill ready']]);
});

for(const children of [undefined,{length:1}])test('incomplete structural hosts reach setter without reading text',async()=>{
  const writes=[],node={childNodes:children,get textContent(){throw Error('legacy getter must not be consulted');},set textContent(value){writes.push(value);}};
  const {api}=await harness(node);api.text('target','seed');assert.deepEqual(writes,['seed']);
});
