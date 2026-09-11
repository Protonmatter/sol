import assert from "node:assert/strict";
import test from "node:test";
import {validateSkyWork} from "../../apps/web/js/skyLimits.js";
const track={operation:"track",bodyIndex:1,lat:0,lon:0,elev:0,unix:1782872027,dtSeconds:600,samples:145};
test("sky work validates exact observer and supported epoch before dispatch",()=>{
  const request={operation:"snapshot",lat:90,lon:360,elev:100000,unix:-62135596800};
  assert.deepEqual(validateSkyWork(request),request);
  for(const change of [{lat:91},{lon:361},{elev:100001},{unix:253402300800},{unix:NaN},{lat:"0"}]) assert.throws(()=>validateSkyWork({...request,...change}));
});
test("track count and aggregate span are admitted without clamping",()=>{
  for(const samples of [256,257]) assert.equal(validateSkyWork({...track,samples}).samples,samples);
  for(const samples of [0,1,258,2000,2.5]) assert.throws(()=>validateSkyWork({...track,samples}));
  assert.equal(validateSkyWork({...track,dtSeconds:675,samples:257}).samples,257);
  assert.throws(()=>validateSkyWork({...track,dtSeconds:676,samples:257}));
  assert.equal(validateSkyWork({...track,dtSeconds:3600,samples:49}).dtSeconds,3600);
  for(const change of [{dtSeconds:3601},{dtSeconds:0},{dtSeconds:NaN},{bodyIndex:9},{bodyIndex:-1},{unix:253402300799},{unix:-62135596800,dtSeconds:-1}]) assert.throws(()=>validateSkyWork({...track,...change}));
});
