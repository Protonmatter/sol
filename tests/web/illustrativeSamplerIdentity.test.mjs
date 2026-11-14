import test from 'node:test';
import assert from 'node:assert/strict';
import * as probe from '../../tools/illustrative_look_probe.mjs';

const mercury=texture=>({mode:0,useTex:1,texMode:0,illustrativeLinear:1,texture});
const venus=texture=>({mode:4,useTex:1,texMode:0,illustrativeLinear:1,texture,depthWrites:false});
const sample=(draws,textures)=>({draws,textures});
const live=id=>({id,live:true});

test('actual Mercury and Venus sampler sets are distinct, with earlier eviction allowed',()=>{
  assert.deepEqual(probe.assertDistinctIllustrativeSamplers(
    sample([mercury(1)],[live(1)]),sample([venus(2)],[{id:1,live:false},live(2)])),
  {mercury:[1],venus:[2]});
});

test('an irrelevant second historical map cannot hide Venus reusing a Mercury sampler',()=>{
  assert.throws(()=>probe.assertDistinctIllustrativeSamplers(
    sample([mercury(1),mercury(2)],[live(1),live(2)]),sample([venus(1)],[live(1),live(2)])),/must not reuse Mercury/);
});

test('every qualifying Venus shell must be disjoint, even if another shell is distinct',()=>{
  assert.throws(()=>probe.assertDistinctIllustrativeSamplers(
    sample([mercury(1)],[live(1)]),sample([venus(2),venus(1)],[live(1),live(2)])),/must not reuse Mercury/);
});

test('an unrelated live texture cannot hide a dead qualifying Mercury sampler',()=>{
  assert.throws(()=>probe.assertDistinctIllustrativeSamplers(
    sample([mercury(1),{texture:2}],[{id:1,live:false},live(2)]),sample([venus(3)],[live(3)])),/Mercury.*live/);
});

test('an unrelated live texture cannot hide a dead qualifying Venus sampler',()=>{
  assert.throws(()=>probe.assertDistinctIllustrativeSamplers(
    sample([mercury(1)],[live(1)]),sample([venus(2),{texture:3}],[{id:2,live:false},live(3)])),/Venus.*live/);
});

test('source-qualified or incomplete draws cannot supply either artistic sampler set',()=>{
  assert.throws(()=>probe.assertDistinctIllustrativeSamplers(
    sample([{...mercury(1),illustrativeLinear:0}],[live(1)]),sample([venus(2)],[live(2)])),/Mercury.*sampler/);
  assert.throws(()=>probe.assertDistinctIllustrativeSamplers(
    sample([mercury(1)],[live(1)]),sample([{...venus(2),useTex:0}],[live(2)])),/Venus.*sampler/);
});
