import assert from "node:assert/strict";
import test from "node:test";
import {SYSTEM_ORDER,validateSystemRequest,assertSystemSnapshot,projectSystemPositions} from "../../apps/web/js/systemContract.js";
const value=()=>({schema_version:"system-snapshot.v1",jd_utc:2440587.5,bodies:SYSTEM_ORDER.map(name=>({name,x_au:1,y_au:0,z_au:0,dist_au:1,geo_dist_au:1,speed_kms:1,phase_angle_deg:null,illuminated_fraction:null,magnitude:null,equilibrium_temp_k:null,mean_temp_k:null,a_au:null,ecc:null,inc_deg:null,node_deg:null,argp_deg:null}))});
test("System worker binds its exact request epoch and dense fixed body inventory",()=>{
  const s=value();assert.equal(assertSystemSnapshot(s,0),s);assert.ok(Object.isFrozen(s.bodies[0]));
  for(const mutate of [s=>delete s.bodies[2],s=>delete s.bodies[0].speed_kms,s=>s.bodies[0].x_au=NaN,s=>s.bodies[0].dist_au=4,s=>s.jd_utc+=.01,s=>s.bodies[0].name="Sun",s=>s.schema_version="wrong",s=>s.bodies[0].extra=1]){const s=value();mutate(s);assert.throws(()=>assertSystemSnapshot(s,0));}
  assert.throws(()=>validateSystemRequest({unix:Infinity}));assert.throws(()=>validateSystemRequest({unix:Date.UTC(10000,0,1)/1000}));
  assert.equal(validateSystemRequest({unix:0}).unix,0);
});
test("System coordinates are fully staged before publication and never mutate retained metadata",()=>{
  const snapshot=assertSystemSnapshot(value(),0), before=JSON.stringify(snapshot);
  const positions=Float64Array.from({length:27},(_,i)=>i%3===0?i+1:0);
  const projected=projectSystemPositions(snapshot.bodies,positions);
  assert.equal(projected[2].geo_dist_au,0);assert.equal(projected[1].geo_dist_au,3);
  assert.equal(projected[8].x_au,25);assert.equal(JSON.stringify(snapshot),before);
  for(const input of [positions.slice(0,26),Array(27),Float64Array.from(positions,(_,i)=>i===26?NaN:1),Float64Array.from(positions,()=>Number.MAX_VALUE)]) {
    assert.throws(()=>projectSystemPositions(snapshot.bodies,input));
    assert.equal(JSON.stringify(snapshot),before);
  }
});
