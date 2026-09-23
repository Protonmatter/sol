import assert from 'node:assert/strict';
import test from 'node:test';
import {buildSunCutaway} from '../../apps/web/js/sunlayers.js';

test('each cutaway host scopes its gradient IDs so a hidden copy cannot capture the visible one', () => {
  const hosts=new Map([['sunCutaway',{innerHTML:''}],['solarDynamicCutaway',{innerHTML:''}]]);
  const prior=globalThis.document;
  globalThis.document={getElementById:id=>hosts.get(id)??null};
  try{
    buildSunCutaway('solarDynamicCutaway');buildSunCutaway();
  }finally{globalThis.document=prior;}
  const all=[...hosts.values()].map(h=>h.innerHTML).join('\n');
  const ids=[...all.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(ids.length>=4);
  assert.equal(new Set(ids).size,ids.length,'no duplicate element IDs across both cutaways');
  for(const [id,host] of hosts){
    const refs=[...host.innerHTML.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1]);
    assert.ok(refs.length>=2);
    for(const ref of refs){
      assert.ok(ref.startsWith(id+'-'),`${id} references its own gradient, not ${ref}`);
      assert.ok(host.innerHTML.includes(`id="${ref}"`),'the referenced gradient exists in the same host');
    }
  }
});
