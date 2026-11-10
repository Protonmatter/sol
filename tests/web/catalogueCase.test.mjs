import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {closeCatalogueCase,catalogueCasePassed} from '../../tools/catalogue_case.mjs';

function item(){return{status:'passed',page_errors:[],cleanup:false};}
test('case acceptance waits for every owner and rejects a late page error',async()=>{
  const record=item(),page=new EventEmitter(),closed=[];
  page.on('pageerror',error=>record.page_errors.push(error.message));
  await closeCatalogueCase(record,[['context',async()=>{closed.push('context');}],['browser',async()=>{closed.push('browser');page.emit('pageerror',Error('late runtime failure'));}]]);
  assert.deepEqual(closed,['context','browser']);assert.equal(record.status,'failed');assert.equal(catalogueCasePassed(record),false);
});
for(const failure of [Error('close failed'),null,undefined,false,0,''])test(`cleanup rejection ${String(failure)} preserves failure and attempts remaining owners`,async()=>{
  const record=item(),closed=[];
  await closeCatalogueCase(record,[['context',async()=>{closed.push('context');throw failure;}],['browser',async()=>{closed.push('browser');}]]);
  assert.deepEqual(closed,['context','browser']);assert.equal(record.status,'failed');assert.equal(record.cleanup,false);
  assert.equal(record.cleanup_owners.context.status,'failed');assert.equal(record.cleanup_owners.browser.status,'closed');assert.equal(catalogueCasePassed(record),false);
});
test('clean ownership closes before acceptance, and later errors still invalidate it',async()=>{
  const record=item();await closeCatalogueCase(record,[['context',async()=>{}],['browser',async()=>{}]]);
  assert.equal(catalogueCasePassed(record),true);record.page_errors.push('arrived before final receipt');assert.equal(catalogueCasePassed(record),false);
});
test('primary failure survives a later cleanup failure',async()=>{
  const record={...item(),status:'failed',error:{message:'original check failed'}};
  await closeCatalogueCase(record,[['context',async()=>{throw Error('secondary cleanup failure');}],['browser',async()=>{}]]);
  assert.equal(record.error.message,'original check failed');assert.equal(record.cleanup_errors.length,1);assert.equal(catalogueCasePassed(record),false);
});
