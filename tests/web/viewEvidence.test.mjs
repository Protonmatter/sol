import assert from "node:assert/strict";
import test from "node:test";
import {createViewEvidence} from "../../apps/web/js/viewEvidence.js";
test("export pins the explanatory revision visible at preview, without raw location or later mutations",()=>{
  const presentation={headline:"Example observer: 4 above",timeLabel:"UTC 2026-09-11",revision:"sky:1",nested:{count:4}};
  const result=createViewEvidence({surface:"sky",presentation,releaseId:"local-a",exportedAt:"2026-09-11T12:00:00Z",observer:{lat:50,lon:1}});
  assert.deepEqual(result.presentation,presentation);assert.ok(Object.isFrozen(result.presentation.nested));
  presentation.nested.count=8;assert.equal(result.presentation.nested.count,4);assert.equal(result.observer,undefined);
  assert.throws(()=>createViewEvidence({surface:"unknown",presentation}));
  assert.throws(()=>createViewEvidence({surface:"today",presentation:null}));
});
