import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import {SYSTEM_ORDER,projectSystemPositions,validateSystemRequest} from "../../apps/web/js/systemContract.js";
import {resolveSystemPresentation} from "../../apps/web/js/presentationState.js";
const source=fs.readFileSync(new URL("../../apps/web/js/orrery.js",import.meta.url),"utf8");
const functions=source.slice(source.indexOf("function rebuildPositions()"),source.indexOf("// Text alternative to the canvas"));
for(const id of ["orreryTime","orreryNow"])test(`${id} publishes clock and positions atomically, then recovers explicitly`,()=>{
  for(const bad of [new Float64Array(26),Float64Array.from({length:27},(_,i)=>i===26?NaN:1),new Float64Array(27).fill(Number.MAX_VALUE)]) {
    const bindings=new Map(),painted=[],headers=[];
    const bodies=SYSTEM_ORDER.map(name=>({name,x_au:1,y_au:0,z_au:0,dist_au:1,geo_dist_au:0}));
    const state={bodies,renderUnix:100,simElapsed:20,offsetYears:2,galYears:3,engineError:""};
    let positions=bad;
    const context=vm.createContext({state,projectSystemPositions,validateSystemRequest,systemPositions:()=>positions,
      performance:{now:()=>0},lastFullSnapshot:0,lastPosUpdate:0,metadataFailed:false,
      bind:(name,event,handler)=>bindings.set(name,handler),cancelSystemWork(){},
      inputTarget:e=>e.target,effectiveBaseUnix:()=>200,resetRotationDisplay(){},
      buildDropLines(){},rebuildSmallBodies(){},updateOrreryPositions(){},
      refreshSystemMetadata(){},updateGalaxySun(){},updateOrreryAccuracy:()=>headers.push(state.renderUnix),
      paint:()=>painted.push(state.renderUnix),document:{getElementById:()=>({value:"1"})}});
    const handler=source.split("\n").find(line=>line.includes(`bind("${id}",`));assert.ok(handler);
    vm.runInContext(functions+"\n"+handler,context);
    bindings.get(id)({target:{value:"1"}});
    assert.equal(state.bodies,bodies);assert.equal(state.renderUnix,100);assert.equal(state.offsetYears,2);assert.equal(state.simElapsed,20);assert.equal(state.galYears,3);
    assert.ok(!painted.includes(200));assert.ok(!headers.includes(200));assert.match(state.engineError,/retained|invalid|finite/i);
    positions=new Float64Array(27).fill(1);
    bindings.get(id)({target:{value:"1"}});
    assert.equal(state.renderUnix,200);assert.notEqual(state.bodies,bodies);assert.equal(state.simElapsed,0);assert.equal(state.engineError,"");
    assert.equal(painted.at(-1),200);assert.equal(headers.at(-1),200);
  }
});
test("initial System fallback failure exposes recovery; obsolete failures cannot replace newer view",async()=>{
  const fallback=source.slice(source.indexOf("async function showFallback("),source.indexOf("// ---------------------------------------------------------------- interaction"));
  const nodes={orreryInsight:{},orreryCanvas:{style:{}},orreryRetry:{hidden:true}};
  const state={active:true,renderUnix:100,bodies:[],engineError:""};
  let request=async()=>{throw Error("worker unavailable");};
  const context=vm.createContext({state,systemGeneration:0,document:{getElementById:id=>nodes[id]},
    requestSystemSnapshot:()=>request(),updateOrreryAccuracy(){nodes.orreryRetry.hidden=!state.engineError;},updateOrreryPositions(){}});
  vm.runInContext(fallback,context);
  await vm.runInContext('showFallback("3-D view failed to initialise: worker unavailable")',context);
  assert.equal(nodes.orreryRetry.hidden,false);assert.match(state.engineError,/worker unavailable/);
  let reject;request=()=>new Promise((resolve,fail)=>{reject=fail;});
  const pending=vm.runInContext('showFallback("previous attempt")',context);
  state.active=false;state.engineError="new view";reject(Error("obsolete failure"));await pending;
  assert.equal(state.engineError,"new view");
});
test("System presentation distinguishes unavailable from retained data",()=>{
  const unavailable=resolveSystemPresentation({renderUnix:100,hasSnapshot:false,error:"engine unavailable"});
  assert.equal(unavailable.availability,"unavailable");assert.match(unavailable.timeLabel,/No valid/);
  const retained=resolveSystemPresentation({renderUnix:100,hasSnapshot:true,error:"worker unavailable"});
  assert.equal(retained.availability,"last_valid");assert.equal(retained.error,"worker unavailable");
});
