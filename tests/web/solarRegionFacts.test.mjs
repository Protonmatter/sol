import assert from "node:assert/strict";
import test from "node:test";
import { solarRegionFacts } from "../../apps/web/js/solarRegionFacts.js";
test("region inspector distinguishes current modeled anchor, immutable birth, elapsed age and heuristic score",()=>{
  const region={id:7,birth:{time_seconds:3600,lat_deg:12,lon_deg:30},model_position:{at_time_seconds:10800,lat_deg:11.9,lon_deg:31},flux_norm:1.2,confidence:.65,area_msh:100,complexity:.2,tilt_deg:8};
  const before=JSON.stringify(region),facts=solarRegionFacts(region,10800);
  assert.match(facts,/modeled anchor.*11\.9.*31\.0/);assert.match(facts,/birth.*12\.0.*30\.0.*3600/);
  assert.match(facts,/age 2\.00 model hours/);assert.match(facts,/normalized flux 1\.20/i);assert.match(facts,/heuristic model score 0\.65.*not probability/i);
  assert.equal(JSON.stringify(region),before);
});
