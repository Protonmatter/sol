import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import {assertSolarSnapshot} from "../../apps/web/js/solarContract.js";

const source=fs.readFileSync(new URL("../../apps/web/js/timeline.js",import.meta.url),"utf8");
const runFunction=source.slice(source.indexOf("export async function runLiveEngine"),source.indexOf("function playStep")).replaceAll("export ","");
const valid=JSON.parse(fs.readFileSync(new URL("../../apps/web/data/latest-state.json",import.meta.url),"utf8"));
test("actual live publication retains data and intent on invalid results and recovers",async()=>{
  const status={},sentinel={valid:"sentinel"},store={state:sentinel,timelineIndex:4,liveEngineRun:false,selectedRegionId:7};
  let result=null,renders=0;
  const context=vm.createContext({store,document:{getElementById:id=>id==="liveStatus"?status:{value:"0.9"}},
    performance:{now:()=>0},requestSolarSimulation:async()=>result,assertSolarSnapshot,
    stopPlay(){},renderAll(){renders++;}});
  vm.runInContext("let navGeneration=0;"+runFunction,context);
  const sparseResults = ["br_normalized", "continuum_proxy", "confidence"].map(field=>{
    const value=structuredClone(valid);delete value.fields[field].values[17];return structuredClone(value);
  });
  const allSparse=structuredClone(valid);allSparse.fields.br_normalized.values=new Array(valid.grid.lon_count*valid.grid.lat_count);
  for(const invalid of [null,{}, {...valid,schema_version:"wrong"},{...valid,fields:{}},...sparseResults,structuredClone(allSparse)]){
    result=invalid;await context.runLiveEngine();
    assert.equal(store.state,sentinel);assert.equal(store.timelineIndex,4);assert.equal(store.liveEngineRun,false);assert.equal(store.selectedRegionId,7);assert.equal(renders,0);
    assert.match(status.textContent,/retained|last valid/i);
  }
  result=valid;await context.runLiveEngine();assert.deepEqual(store.state,valid);assert.equal(store.timelineIndex,-1);assert.equal(renders,1);
});
