import assert from 'node:assert/strict';
import test from 'node:test';
import {writeAttribute,writeBoolean,writeText} from '../../apps/web/js/domWrites.js';

test('pure helpers import without a document and preserve native leaf conversion',()=>{
  const values=[],node={childNodes:[],get textContent(){return '';},set textContent(value){values.push(value);}};
  writeText(node,'');assert.equal(values.length,0);
  const value={toString(){throw Error('the helper must not coerce this object');}};
  writeText(node,value);assert.equal(values[0],value);
});

test('attribute equality preserves absence versus empty and repairs changed live state',()=>{
  const attrs=new Map(),writes=[],node={getAttribute:name=>attrs.get(name)??null,setAttribute(name,value){writes.push([name,value]);attrs.set(name,String(value));}};
  writeAttribute(node,'aria-label','');assert.equal(writes.length,1,'absent empty attribute must be established');
  writeAttribute(node,'aria-label','');assert.equal(writes.length,1);
  attrs.set('aria-label','external edit');writeAttribute(node,'aria-label','');assert.equal(writes.length,2);
  writeAttribute(node,'aria-label','Current');assert.equal(attrs.get('aria-label'),'Current');
});

test('attribute nonstring inputs reach the native setter once without a helper read or conversion',()=>{
  for(const value of [null,undefined,0,false,Symbol('value'),{toString(){throw Error('not in helper');}}]){
    let reads=0;const calls=[],node={getAttribute(){reads++;throw Error('unexpected read');},setAttribute(...args){calls.push(args);}};
    writeAttribute(node,'aria-label',value);assert.equal(reads,0);assert.equal(calls.length,1);assert.equal(calls[0][1],value);
  }
  const name={toString(){throw Error('not in helper');}},calls=[];
  writeAttribute({getAttribute(){throw Error('unexpected read');},setAttribute(...args){calls.push(args);}},name,'value');assert.equal(calls[0][0],name);
});

test('legacy attribute hosts retain their setter and native errors propagate',()=>{
  const calls=[],legacy={setAttribute(...args){calls.push(args);}};writeAttribute(legacy,'aria-pressed','true');assert.equal(calls.length,1);
  const sentinel=Error('setter failed');assert.throws(()=>writeAttribute({setAttribute(){throw sentinel;}},'aria-pressed','false'),error=>error===sentinel);
});

test('boolean property equality skips native setter but remains based on current host state',()=>{
  let state=false;const writes=[],node={get hidden(){return state;},set hidden(value){writes.push(value);state=Boolean(value);}};
  writeBoolean(node,'hidden',false);assert.equal(writes.length,0);
  writeBoolean(node,'hidden',true);assert.deepEqual(writes,[true]);writeBoolean(node,'hidden',true);assert.equal(writes.length,1);
  state=false;writeBoolean(node,'hidden',true);assert.equal(writes.length,2);
});

test('nonboolean properties preserve original setter conversion instead of trusting aggregate equality',()=>{
  const writes=[],node={get hidden(){throw Error('nonboolean helper read');},set hidden(value){writes.push(value);}};
  for(const value of ['until-found',1,null,undefined,{}])writeBoolean(node,'hidden',value);
  assert.equal(writes.length,5);assert.equal(writes[0],'until-found');
  const sentinel=Error('property failed');assert.throws(()=>writeBoolean({set hidden(_value){throw sentinel;}},'hidden',true),error=>error===sentinel);
});
