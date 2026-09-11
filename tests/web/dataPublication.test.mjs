import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { resolvePresentation } from "../../apps/web/js/presentationState.js";

test("data loader publishes once only after complete bundle and preserves all prior data on error",async()=>{
  const source=fs.readFileSync(new URL("../../apps/web/js/data.js",import.meta.url),"utf8")
    .replace(/^import .*;\r?\n/gm,"").replaceAll("export ","").replaceAll("import.meta.url",'"https://example.invalid/js/data.js"');
  const sentinel={id:"last valid"},store={state:sentinel,liveState:sentinel,feedStatus:{id:"old status"},seriesFrames:[sentinel],seriesRecords:[{id:"old"}],seriesManifest:{id:"old manifest"},timelineIndex:3,selectedRegionId:7};
  let resolve,reject,renders=0;
  const context=vm.createContext({store,URL,Image:class{},FALLBACK_STATE:{fallback:true},BASE_IMAGES:{},document:{getElementById:()=>null},window:{},
    fetch:async()=>{throw Error("Mutable alias fetch forbidden");},
    prepareBundlePublication:()=>{},readDataBundle:()=>new Promise((yes,no)=>{resolve=yes;reject=no;}),renderAll:()=>{renders++;},maybeAutoStartTour:()=>{}});
  vm.runInContext(source,context);
  let request=context.loadState();await Promise.resolve();
  assert.equal(typeof reject,"function","loader must await the pinned bundle reader, not mutable aliases");
  assert.equal(store.state,sentinel);assert.equal(renders,0);
  reject(Error("component hash mismatch"));await request;
  assert.equal(store.state,sentinel);assert.equal(store.feedStatus.id,"old status");assert.equal(store.seriesRecords[0].id,"old");assert.equal(store.timelineIndex,3);assert.equal(store.selectedRegionId,7);
  assert.match(store.dataError,/hash mismatch/);
  const replacement={snapshot:{id:"complete"},feedStatus:{id:"new status"},seriesFrames:[],seriesRecords:[],seriesManifest:{frames:[]},identity:Object.freeze({bundle_id:"b",source_bundle_id:"source-b",manifest_sha256:"b".repeat(64)})};
  request=context.loadState();await Promise.resolve();resolve(replacement);await request;
  assert.equal(store.state,replacement.snapshot);assert.equal(store.feedStatus,replacement.feedStatus);assert.equal(store.dataError,null);assert.equal(renders,2);
  assert.equal(store.dataBundleIdentity,replacement.identity);assert.ok(Object.isFrozen(store.dataBundleIdentity));
  const older=context.loadState();await Promise.resolve();const resolveOlder=resolve;
  const newer=context.loadState();await Promise.resolve();const newest={...replacement,snapshot:{id:"newest"}};
  resolve(newest);await newer;resolveOlder({...replacement,snapshot:{id:"late older"}});await older;
  assert.equal(store.state,newest.snapshot);assert.equal(renders,3);
});

test("complete bundle resets cycle/gap/live intent and invalidates pending worker and active playback",async()=>{
  const strip=path=>fs.readFileSync(new URL(path,import.meta.url),"utf8").replace(/^import .*;\r?\n/gm,"").replaceAll("export ","").replaceAll("import.meta.url",'"https://example.invalid/js/data.js"');
  for(const mode of ["cycle","gap","live"]){
    const prior={run:{time_seconds:0}},replacement={snapshot:{run:{time_seconds:900}},identity:{bundle_id:"new"},seriesFrames:[prior,null],seriesRecords:[{months:0,status:"available"},{months:12,status:"unavailable"}],seriesManifest:{frames:[]}};
    const store={state:prior,liveState:prior,timelineIndex:mode==="live"?-1:1,liveEngineRun:mode==="live",selectedRegionId:7,seriesFrames:[prior,null],seriesRecords:[],playTimer:99};
    let workerResolve,bundleResolve,bundleReject,cancelled=0,cleared=0;
    const status={textContent:""},scrubber={value:"1"};
    const context=vm.createContext({store,URL,Image:class{},FALLBACK_STATE:{},BASE_IMAGES:{},performance:{now:()=>0},
      document:{getElementById:id=>id==="liveStatus"?status:id==="timeScrubber"?scrubber:null,querySelector:()=>null},
      window:{clearInterval:id=>{assert.equal(id,99);cleared++;}},renderAll:()=>{},maybeAutoStartTour:()=>{},
      cancelSolarSimulation:()=>{cancelled++;},requestSolarSimulation:()=>new Promise(resolve=>{workerResolve=resolve;}),assertSolarSnapshot:value=>value,
      readDataBundle:()=>new Promise((resolve,reject)=>{bundleResolve=resolve;bundleReject=reject;})});
    vm.runInContext(strip("../../apps/web/js/timeline.js"),context);
    vm.runInContext(strip("../../apps/web/js/data.js"),context);
    const pending=context.runLiveEngine();
    let load=context.loadState();bundleReject(Error("bad bundle"));await load;
    assert.equal(cancelled,0);assert.equal(cleared,0);assert.equal(store.state,prior);assert.equal(store.playTimer,99);
    load=context.loadState();bundleResolve(replacement);await load;
    assert.equal(store.timelineIndex,-1,mode);assert.equal(store.liveEngineRun,false,mode);assert.equal(store.selectedRegionId,null);
    assert.equal(cancelled,1);assert.equal(cleared,1);assert.equal(store.playTimer,0);assert.equal(scrubber.value,"0");
    assert.doesNotMatch(status.textContent,/Running|Computed/);
    workerResolve({run:{time_seconds:123},active_regions:[]});await pending;
    assert.equal(store.state,replacement.snapshot,"old worker cannot overwrite the selected bundle");
    assert.equal(store.liveEngineRun,false);
    const presentation=resolvePresentation({snapshot:store.state,timeline:store.timelineIndex>=0?store.seriesRecords[store.timelineIndex]:null,liveEngineRun:store.liveEngineRun});
    assert.doesNotMatch(presentation.headline,/month 12|Idealized cycle/);
  }
});
