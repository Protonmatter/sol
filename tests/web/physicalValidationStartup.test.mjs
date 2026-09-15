import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {orreryHarness} from './helpers/orreryHarness.mjs';

const source=fs.readFileSync(new URL('../../tools/physical_rendering_validation.mjs',import.meta.url),'utf8');
function between(start,end){
  assert.equal(source.split(start).length,2,`Unique validator boundary: ${start}`);
  const first=source.indexOf(start)+start.length,last=source.indexOf(end,first);
  assert.ok(last>first,`Missing validator boundary: ${end}`);
  return source.slice(first,last);
}

// Execute the actual validator wait callback in a browser-like module realm.
// Only its DOM/store import and Puppeteer polling boundary are replaced.
async function readiness(orrery){
  let predicate,options;
  const context=vm.createContext({URL,document:{querySelector:()=>({src:'https://local.test/app.js?v=startup-test'})}});
  const store={orrery},storeModule=new vm.SyntheticModule(['store'],function(){this.setExport('store',store);},{context});
  await storeModule.link(()=>{});await storeModule.evaluate();
  const block=between("await page.click('[data-mode=\"orrery\"]');","await paintAction('checkbox',{id:'orreryAnimate'");
  const module=new vm.SourceTextModule(`export async function wait(page){${block}}`,{context,
    importModuleDynamically:specifier=>{
      assert.equal(specifier,'./js/store.js?v=startup-test');return storeModule;
    }});
  await module.link(()=>{});await module.evaluate();
  await module.namespace.wait({async waitForFunction(fn,opts){predicate=fn;options=opts;}});
  assert.equal(options.timeout,40000,'Existing startup wait must not gain more time');
  return {poll:()=>predicate(),store};
}

test('validator waits through real entry until rounded snapshot coordinates promote at the same epoch',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true,reducedMotion:true,
    systemPositions:()=>Float64Array.from({length:27},(_,i)=>i%3===0?1+i/3+(i===0?2e-9:0):0)});
  t.after(()=>h.leaveOrrery());
  const entering=h.enterOrrery();await h.settle();
  assert.equal(h.state.bodies.length,9,'Worker snapshot is visible while base programs are pending');
  assert.equal(h.state.entering,true);assert.equal(h.state.bodies[0].x_au,1);
  const epoch=h.state.renderUnix,bootstrap=JSON.stringify([epoch,h.state.bodies]);
  const wait=await readiness(h.state);
  assert.equal(await wait.poll(),false,'Nine bootstrap bodies cannot freeze the scientific invariant');
  h.completePrograms();h.frame(100);await entering;
  assert.equal(h.state.entering,false);assert.equal(h.state.renderUnix,epoch);
  assert.equal(h.state.bodies[0].x_au,1.000000002);
  assert.notEqual(JSON.stringify([epoch,h.state.bodies]),bootstrap,'Actual entry promotes raw-f64 coordinates');
  assert.equal(await wait.poll(),true);
  const invariant=JSON.stringify([h.state.renderUnix,h.state.bodies]);
  h.event('orreryInspectSun','click');await h.settle();
  assert.equal(JSON.stringify([h.state.renderUnix,h.state.bodies]),invariant,'Exact post-readiness invariant survives inspection');
  h.leaveOrrery();
});

test('validator does not admit inactive, incomplete, still-entering or failed System state',async()=>{
  const ready={active:true,entering:false,bodies:Array.from({length:9},()=>({})),engineError:''};
  const wait=await readiness(ready);assert.equal(await wait.poll(),true);
  for(const state of [undefined,{...ready,active:false},{...ready,entering:true},
    {...ready,entering:undefined},{...ready,bodies:[]},{...ready,engineError:'Engine unavailable'}]){
    wait.store.orrery=state;assert.equal(await wait.poll(),false);
  }
});

test('real failed entry cannot become startup-ready merely by retaining nine snapshot bodies',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true,reducedMotion:true});
  t.after(()=>h.leaveOrrery());
  const entering=h.enterOrrery();await h.settle();
  h.setGraphicsFailure('link');h.completePrograms();h.frame(100);await entering;await h.settle();
  assert.equal(h.state.bodies.length,9);assert.equal(h.state.entering,false);
  assert.ok(h.state.engineError);assert.equal(await (await readiness(h.state)).poll(),false);
  h.leaveOrrery();
});

test('startup remains inside the original absolute 240-second run deadline',async()=>{
  const start='const deadline=new Promise((_,reject)=>{',end='  clearTimeout(timer);timer=null;';
  const block=start+between(start,end);
  let callback,delay,aborts=0,started=0;
  const context=vm.createContext({expired:false,timer:null,controller:{abort(){aborts++;}},
    setTimeout(fn,ms){callback=fn;delay=ms;return 1;},run(){started++;return new Promise(()=>{});}});
  const running=vm.runInContext(`(async()=>{${block}})()`,context);
  assert.equal(started,1);assert.equal(delay,240000);assert.equal(context.expired,false);
  callback();await assert.rejects(running,/Full application validation exceeded 240 seconds/);
  assert.equal(context.expired,true);assert.equal(aborts,1);
});
