import assert from 'node:assert/strict';
import test from 'node:test';
import {orreryHarness} from './helpers/orreryHarness.mjs';

for(const [name,width,height,dpr,expected,dimensions] of [
  ['width only',956,600,1,[['width',956]],[956,600]],
  ['height only',800,612,1,[['height',612]],[800,612]],
  ['both dimensions',956,612,1,[['width',956],['height',612]],[956,612]],
  ['unchanged dimensions',800,600,1,[],[800,600]],
  ['unchanged rounded dimensions',800.16,600.12,1,[],[800,600]],
  ['DPI capped at two',800,600,3,[['width',1600],['height',1200]],[1600,1200]],
  ['positive subpixel canvas',.1,.1,1,[['width',1],['height',1]],[1,1]],
]) {
  test(`canvas resize writes only changed backing dimensions: ${name}`,async t=>{
    const h=await orreryHarness(t,{controls:true,reducedMotion:true});
    await h.enterOrrery();h.frame(1000);await h.settle();
    const canvas=h.nodes.orreryCanvas,writes=[];
    for(const dimension of ['width','height']){
      let value=canvas[dimension];
      Object.defineProperty(canvas,dimension,{configurable:true,get:()=>value,set:next=>{writes.push([dimension,next]);value=next;}});
    }
    const epoch=h.state.renderUnix,bodies=JSON.stringify(h.state.bodies),draws=h.draws;
    h.resize(width,height,dpr);
    assert.deepEqual(writes,expected,'an unchanged dimension must not reset the drawing buffer');
    assert.deepEqual([canvas.width,canvas.height],dimensions);
    assert.ok(h.draws>draws,'resize still redraws the current scene');
    assert.equal(h.state.renderUnix,epoch);
    assert.equal(JSON.stringify(h.state.bodies),bodies,'resize preserves the accepted physical snapshot');
    assert.equal(h.frames.size,0,'resize does not resume a paused clock');
  });
}

test('zero-size and inactive canvas do not receive backing-size assignments',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true});
  await h.enterOrrery();h.frame(1000);await h.settle();
  const canvas=h.nodes.orreryCanvas,writes=[];
  for(const dimension of ['width','height']){
    let value=canvas[dimension];
    Object.defineProperty(canvas,dimension,{configurable:true,get:()=>value,set:next=>{writes.push([dimension,next]);value=next;}});
  }
  const draws=h.draws;
  h.resize(0,600);h.resize(800,0);
  assert.deepEqual(writes,[]);assert.equal(h.draws,draws);
  h.leaveOrrery();h.resize(956,612);
  assert.deepEqual(writes,[]);assert.equal(h.draws,draws);
});
