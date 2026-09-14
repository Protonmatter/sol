import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { collectSubmittedEarthSpin } from '../../tools/earth_spin_probe.mjs';

// Exercise the production harness assertion and failure catch without launching
// its browser CLI. The callback itself is the actual exported page helper.
const source = fs.readFileSync(new URL('../../tools/browser_validation.mjs', import.meta.url), 'utf8');
const tree = ts.createSourceFile('browser_validation.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let spinAssertion, failureCatch;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'assertSubmittedSpin') spinAssertion = node.initializer.getText(tree);
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'main') failureCatch = node.body.statements.find(ts.isTryStatement).catchClause.block.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(spinAssertion && failureCatch);
const assertSubmittedSpin = vm.runInNewContext(`(${spinAssertion})`);

function transform(angle = 0, center = [.1, .2, .3]) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { model: new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, ...center, 1]),
    normal: new Float32Array([c, s, 0, -s, c, 0, 0, 0, 1]) };
}

async function spin({ actions = [], deliverRaf = false, importToken = '?v=qualified', setup, allowNativeErrors = false, probeOptions = {}, physicalCapture,terrainCapture } = {}) {
  let now = 0, nextId = 0, outcome, currentProgram = null;
  const tasks = new Map(), frames = new Map(), nativeCalls = [], uncaught = [], imports = [];
  const state = { active: true, animate: true, anchor: 'Earth', selected: 'Earth', engineError: '', lastTick: 12,
    renderUnix: 100, yearsPerSec: 7 / 365.25, bodies: [{ name: 'Earth', x_au: .1, y_au: .2, z_au: .3 }] };
  const program = { name: 'sphere' }, otherProgram = { name: 'other' }, uniforms = new Map();
  const presentationProgram={name:'presentation'},sceneTexture={name:'scene'},sceneFramebuffer={name:'scene-fbo'};
  let framebuffer=null,boundTexture=sceneTexture,activeUnit=100,presentationState={};
  const queryCounts = { parameter: 0, uniform: 0, location: 0 };
  let rejection = null, readbackError = null, readbackDelay = () => 0, drawDelay = 0;
  function native(api, self, args, effect, result) {
    nativeCalls.push({ api, self, args });
    if (api === 'drawElements') now += drawDelay;
    if (rejection?.api === api) {
      const rejected = rejection; rejection = null;
      if (rejected.type === 'throw') throw Error(`native ${api} failed`);
      return result; // WebGL may report a rejected upload without throwing JS.
    }
    effect?.(); return result;
  }
  const values = p => { if (!uniforms.has(p)) uniforms.set(p, new Map()); return uniforms.get(p); };
  const gl = { CURRENT_PROGRAM: 1, isContextLost: () => false,
    DRAW_FRAMEBUFFER_BINDING:2,DRAW_FRAMEBUFFER:3,COLOR_ATTACHMENT0:4,FRAMEBUFFER_ATTACHMENT_OBJECT_NAME:5,
    ACTIVE_TEXTURE:6,TEXTURE_BINDING_2D:7,TEXTURE0:100,TRIANGLES:4,
    COLOR_WRITEMASK:8,VIEWPORT:9,RASTERIZER_DISCARD:10,SCISSOR_TEST:11,DEPTH_TEST:12,STENCIL_TEST:13,
    isEnabled:name=>!!presentationState[name],
    useProgram(...args) { return native('useProgram', this, args, () => { currentProgram = args[0]; }); },
    uniform1i(...args) { return native('uniform1i', this, args, () => {
      if (args[0]?.program === currentProgram) values(currentProgram).set(args[0].name, args[1]);
    }); },
    uniformMatrix4fv(...args) { return native('uniformMatrix4fv', this, args, () => {
      const [location, transpose, data, offset = 0, length = 0] = args;
      if (transpose || location?.program !== currentProgram) return;
      values(currentProgram).set(location.name, new Float32Array(Array.from(data).slice(offset, offset + (length || data.length - offset))));
    }); },
    drawElements(...args) { return native('drawElements', this, args, null, 41); },
    drawArrays(...args) { return native('drawArrays', this, args, null, 42); },
    getParameter(name) { queryCounts.parameter++;return name===2?framebuffer:name===6?activeUnit:name===7?boundTexture:
      name===8?(presentationState.mask??[true,true,true,true]):name===9?(presentationState.viewport??[0,0,732,612]):currentProgram; },
    getFramebufferAttachmentParameter(){return sceneTexture;},activeTexture(unit){activeUnit=unit;},
    // Deliberately fresh identities: production cached locations cannot be
    // matched against separately queried WebGLUniformLocation objects.
    getUniformLocation(p, name) { queryCounts.location++; return { program: p, name }; },
    getUniform(p, location) { queryCounts.uniform++; now += readbackDelay(location.name); if (readbackError) throw Error(readbackError); return values(p).get(location.name); },
  };
  const original = Object.fromEntries(['useProgram', 'uniform1i', 'uniformMatrix4fv', 'drawElements', 'drawArrays'].map(name => [name, gl[name]]));
  const appLocation = (name, p = program) => ({ program: p, name });
  const env = { gl, state, program, otherProgram, values, queryCounts, nativeCalls, appLocation,
    hdr(index){state.hdrFrame={generation:1,epoch:state.renderUnix,serial:index};framebuffer=sceneFramebuffer;values(program).set('u_linearOutput',1);},
    present(changes={}){
      presentationState=changes;
      framebuffer=null;boundTexture=changes.texture??sceneTexture;gl.useProgram(presentationProgram);
      const frame={...state.hdrFrame,...changes},u=values(presentationProgram);
      u.set('u_scene',0);u.set('u_frameSerial',frame.serial);u.set('u_frameGeneration',frame.generation);
      u.set('u_frameEpochHigh',Math.fround(frame.epoch));u.set('u_frameEpochLow',frame.epoch-Math.fround(frame.epoch));
      gl.drawArrays(changes.mode??4,0,changes.count??3);
      now+=changes.completionDelay??0;
      state.hdrStatus=changes.rejected?{state:'unavailable'}:{state:'ready',presented:frame};
    },
    reject: (api, type = 'throw') => { rejection = { api, type }; },
    failReadback: message => { readbackError = message; },
    delayReadback: callback => { readbackDelay = callback; },
    delayDraw: duration => { drawDelay = duration; },
    setActualProgram: p => { currentProgram = p; },
    upload(angle = 0, center, p = program, offsets = false) {
      const { model, normal } = transform(angle, center);
      gl.useProgram(p);
      const mvp = transform(0, [9, 9, 9]).model;
      gl.uniformMatrix4fv(appLocation('u_mvp', p), false, mvp);
      if (offsets) gl.uniformMatrix4fv(appLocation('u_model', p), false, new Float32Array([88, 99, ...model, 77]), 2, 16);
      else gl.uniformMatrix4fv(appLocation('u_model', p), false, model);
      gl.uniform1i(appLocation('u_mode', p), 0);
      // Later sampler/flag uploads must not erase the earlier potential mode.
      gl.uniform1i(appLocation('u_texture', p), 6);
      values(p).set('u_nmat', normal);
      return { model, normal };
    },
    draw() { assert.equal(gl.drawElements(4, 36, 5123, 0), 41); },
    advance(index) { state.lastTick = now; state.renderUnix = 100 + index * 6048; },
  };
  setup?.(env);
  const canvas = { clientWidth: 732, clientHeight: 612, width: 732, height: 612, getContext: () => gl,
    getBoundingClientRect: () => ({ x: 125, y: 144, width: 732, height: 612 }) };
  const schedule = (fn, delay, interval = 0) => { const id = ++nextId; tasks.set(id, { fn, at: now + delay, interval }); return id; };
  const context = vm.createContext({ document: { hidden: false, visibilityState: 'visible',
    querySelector: () => importToken === null ? null : { src: `https://sol.invalid/sol/app.js${importToken}` }, getElementById: () => canvas },
    performance: { now: () => now }, URL,queueMicrotask,
    __solPhysicalSpinEvidence:physicalCapture?{body:probeOptions.body??'Earth',summary:{body:probeOptions.body??'Earth'},capture:()=>physicalCapture(env)}:undefined,
    __solMarsTerrainEvidence:terrainCapture?{body:'Mars',summary:{body:'Mars'},capture:(_gl,_program,args)=>terrainCapture(env,args)}:undefined,
    setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => tasks.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, delay), clearInterval: id => tasks.delete(id),
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
  });
  const storeModule = new vm.SyntheticModule(['store'], function () { this.setExport('store', { orrery: state }); }, { context });
  await storeModule.link(() => {}); await storeModule.evaluate();
  const module = new vm.SourceTextModule(`export default ${collectSubmittedEarthSpin.toString()}`, {
    context, importModuleDynamically: specifier => { imports.push(specifier); return storeModule; },
  });
  await module.link(() => {}); await module.evaluate();
  module.namespace.default(probeOptions).then(value => { outcome = { value }; }, error => { outcome = { error }; });
  await new Promise(resolve => setImmediate(resolve));
  for (const [at, action] of actions) schedule(() => action(env), at);
  let nextFrame = 16;
  for (let step = 0; step < 2000 && !outcome; step++) {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    if (outcome) break;
    const selected = [...tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    const frameAt = deliverRaf && frames.size ? nextFrame : Infinity;
    if (frameAt < (selected?.[1].at ?? Infinity)) {
      now = frameAt; nextFrame = now + 16;
      const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(now);
    } else {
      assert.ok(selected, 'probe must retain its deadline'); now = Math.max(now, selected[1].at);
      if (selected[1].interval) selected[1].at += selected[1].interval; else tasks.delete(selected[0]);
      try { selected[1].fn(); } catch (error) { uncaught.push(error.message); }
    }
  }
  assert.ok(outcome); assert.ifError(outcome.error);
  if (!allowNativeErrors) assert.deepEqual(uncaught, []);
  for (const [name, fn] of Object.entries(original)) assert.equal(gl[name], fn, `${name} restored`);
  assert.equal(tasks.size, 0, 'all probe timers cleared'); assert.equal(frames.size, 0, 'heartbeat cleared');
  assert.deepEqual(imports, [`./js/store.js${importToken || ''}`]);
  return { result: JSON.parse(JSON.stringify(outcome.value)), now, nativeCalls, uncaught, gl, queryCounts };
}

const advancingDraws = (customize = () => {}) => [1, 2, 3, 4].map(index => [index * 100, env => {
  env.advance(index); env.upload(index * .01 * 2 * Math.PI / 5); customize(env, index); env.draw();
}]);

test('offscreen Earth producers require the matching color-writing presentation',async()=>{
  const actions=advancingDraws((env,i)=>env.hdr(i));
  const held=await spin({actions});assert.equal(held.result.samples.length,0);
  const visible=await spin({actions:[1,2,3,4].map(i=>[i*100,env=>{
    env.advance(i);env.upload(i*.01*2*Math.PI/5);env.hdr(i);env.draw();env.present();
  }])});
  assert.equal(visible.result.samples.length,4);assertSubmittedSpin(visible.result.samples);
  assert.ok(visible.result.samples.every(s=>s.presentation.serial>0));
});

test('stale texture, frame serial, epoch and context generation cannot present a current Earth producer',async()=>{
  for(const changes of [{texture:{}},{serial:99},{epoch:0},{generation:2}]){
    const {result}=await spin({actions:[1,2,3,4].map(i=>[i*100,env=>{
      env.advance(i);env.upload(i*.01*2*Math.PI/5);env.hdr(i);env.draw();env.present(changes);
    }])});
    assert.equal(result.samples.length,0,JSON.stringify(changes));
  }
});

test('a stale producer epoch cannot be legitimized by matching stale presentation metadata',async()=>{
  const {result}=await spin({actions:[1,2,3,4].map(i=>[i*100,env=>{
    env.advance(i);env.upload(i*.01*2*Math.PI/5);env.hdr(i);env.state.hdrFrame.epoch--;
    env.draw();env.present();
  }])});
  assert.equal(result.samples.length,0);
});

test('held final draw negative control rejects advancing HDR producers without weakening five seconds',async()=>{
  const {result,now}=await spin({probeOptions:{holdPresentation:true},actions:[1,2,3,4].map(i=>[i*100,env=>{
    env.advance(i);env.upload(i*.01*2*Math.PI/5);env.hdr(i);env.draw();env.present();
  }])});
  assert.equal(result.samples.length,0);assert.equal(now,5000);
});

test('identity metadata cannot substitute for a full color-writing presentation draw',async()=>{
  for(const changes of [{count:0},{mode:0},{mask:[false,false,false,false]},{viewport:[0,0,0,0]},
    {10:true},{11:true},{12:true},{13:true},{rejected:true}]){
    const {result,now}=await spin({actions:[1,2,3,4].map(i=>[i*100,env=>{
      env.advance(i);env.upload(i*.01*2*Math.PI/5);env.hdr(i);env.draw();env.present(changes);
    }])});
    assert.equal(result.samples.length,0,JSON.stringify(changes));assert.equal(now,5000);
  }
});

test('presentation completion after five seconds cannot accept an earlier HDR producer',async()=>{
  const {result}=await spin({actions:[[4999,env=>{
    env.advance(1);env.upload();env.hdr(1);env.draw();env.present({completionDelay:2});
  }]]});
  assert.equal(result.samples.length,0);assert.equal(result.drawCounts.lateReadbacks,1);
});

test('separate physical spin cannot admit fallback draws or bypass final presentation',async()=>{
  const actions=[1,2,3,4].map(i=>[i*100,env=>{env.advance(i);env.upload(i*.01*2*Math.PI/5);env.hdr(i);env.draw();env.present();}]);
  const rejected=await spin({actions,probeOptions:{physicalEvidence:true},physicalCapture:()=>({passed:false,reason:'fallback program'})});
  assert.equal(rejected.result.samples.length,0);assert.equal(rejected.result.drawCounts.physicalRejected,4);
  const accepted=await spin({actions,probeOptions:{physicalEvidence:true},physicalCapture:()=>({passed:true,programSequence:1})});
  assert.equal(accepted.result.samples.length,4);assertSubmittedSpin(accepted.result.samples);
  assert.ok(accepted.result.samples.every(sample=>sample.physical.passed&&sample.presentation));
  const held=await spin({actions,probeOptions:{physicalEvidence:true,holdPresentation:true},physicalCapture:()=>({passed:true})});
  assert.equal(held.result.samples.length,0);assert.equal(held.result.drawCounts.physicalAccepted,4);
});

test('Mars terrain and physical evidence join the same actual draw without changing the Earth default',async()=>{
  const actions=[1,2,3,4].map(i=>[i*100,env=>{env.advance(i);env.upload(i*.01*2*Math.PI/5);env.hdr(i);env.draw();env.present();}]);
  const setup=env=>{env.state.bodies[0].name='Mars';env.state.selected='Mars';};
  for(const passed of [true,false]){
    const observed=[];
    const {result}=await spin({actions,setup,probeOptions:{body:'Mars',physicalEvidence:true,requireTerrainEvidence:true},
      physicalCapture:()=>({passed:true}),terrainCapture:(_env,args)=>{observed.push(args);return {passed};}});
    assert.equal(result.subjectBody,'Mars');assert.equal(result.samples.length,passed?4:0);
    assert.equal(observed.length,4);assert.ok(observed.every(args=>args.mode===4&&args.count===36&&args.type===5123&&args.offset===0));
    if(passed)assert.ok(result.samples.every(sample=>sample.physical.passed&&sample.terrain.passed&&sample.presentation));
  }
});

test('zero draws retain the five-second window and initial/final state evidence', async () => {
  const { result, now } = await spin({ importToken: null });
  assert.equal(now, 5000); assert.equal(result.samples.length, 0); assert.equal(result.rafHeartbeat.count, 0);
  assert.deepEqual(result.timing, { startedMs: 0, endedMs: 5000, elapsedMs: 5000 });
  assert.equal(result.initialState.lastTick, 12); assert.equal(result.state.lastTick, 12);
  assert.equal(result.initialState.renderUnix, 100); assert.equal(result.state.renderUnix, 100);
  assert.equal(result.state.canvas.clientWidth, 732); assert.equal(result.state.canvas.width, 732);
});

test('independent RAF heartbeat cannot manufacture a draw or advance the scientific clock', async () => {
  const { result } = await spin({ deliverRaf: true });
  assert.ok(result.rafHeartbeat.count > 0); assert.equal(result.drawCounts.submitted, 0);
  assert.equal(result.samples.length, 0); assert.equal(result.state.renderUnix, 100);
  assert.ok(result.rafHeartbeat.samples.every(sample => sample.elapsedMs >= 0 && sample.elapsedMs <= 5000));
});

test('four actual GPU draws retain early exit, timestamps, native arguments, and the unchanged spin gate', async () => {
  const { result, now, nativeCalls, gl, queryCounts } = await spin({ actions: advancingDraws(), deliverRaf: true });
  assert.equal(now, 450); assert.equal(result.samples.length, 4); assertSubmittedSpin(result.samples);
  assert.deepEqual(result.samples.map(sample => sample.elapsedMs), [100, 200, 300, 400]);
  assert.equal(queryCounts.parameter, 4); assert.equal(queryCounts.uniform, 12); assert.equal(queryCounts.location, 3);
  assert.ok(nativeCalls.every(call => call.self === gl));
  assert.deepEqual(nativeCalls.filter(call => call.api === 'drawElements').map(call => call.args), Array.from({ length: 4 }, () => [4, 36, 5123, 0]));
});

test('two submitted Earth frames still wait five seconds and fail the unchanged minimum of three', async () => {
  const { result, now } = await spin({ actions: advancingDraws().slice(0, 2) });
  assert.equal(now, 5000); assert.throws(() => assertSubmittedSpin(result.samples), /insufficient Earth sphere draws: 2/);
});

test('non-Earth bodies and duplicate accepted epochs avoid synchronous GPU queries', async () => {
  const { result, queryCounts } = await spin({ actions: [[100, env => {
    for (let i = 0; i < 20; i++) { env.upload(0, [1 + i, 2, 3]); env.draw(); }
    env.advance(1); env.upload(); env.draw(); env.upload(); env.draw();
  }]] });
  assert.equal(result.samples.length, 1); assert.equal(result.drawCounts.duplicateEpoch, 1);
  assert.equal(queryCounts.parameter, 1); assert.equal(queryCounts.uniform, 3); assert.equal(queryCounts.location, 3);
});

test('unknown initial state and program switches cannot reuse preceding draw hints', async () => {
  const { result, queryCounts } = await spin({ setup: env => env.upload(), actions: [[100, env => {
    env.draw(); env.upload(); env.gl.useProgram(env.otherProgram); env.draw();
  }]] });
  assert.equal(result.samples.length, 0); assert.equal(queryCounts.parameter, 0); assert.equal(queryCounts.uniform, 0);
});

test('matrix upload offsets and lengths are respected without changing native arguments or source data', async () => {
  let uploaded;
  const { result, nativeCalls } = await spin({ actions: [[100, env => {
    env.upload(0, undefined, env.program, true);
    uploaded = env.nativeCalls.filter(call => call.api === 'uniformMatrix4fv').at(-1).args[2]; env.draw();
  }]] });
  assert.equal(result.samples.length, 1);
  assert.deepEqual(result.samples[0].model, JSON.parse(JSON.stringify(Array.from(uploaded.slice(2, 18)))));
  const args = nativeCalls.filter(call => call.api === 'uniformMatrix4fv').at(-1).args;
  assert.equal(args[1], false); assert.equal(args[2], uploaded); assert.equal(args[3], 2); assert.equal(args[4], 16);
  assert.deepEqual([uploaded[0], uploaded[1], uploaded.at(-1)], [88, 99, 77]);
});

test('offset upload with the default zero length uses the remaining source elements', async () => {
  const { result } = await spin({ actions: [[100, env => {
    env.gl.useProgram(env.program); env.gl.uniform1i(env.appLocation('u_mode'), 0);
    env.gl.uniformMatrix4fv(env.appLocation('u_model'), false, new Float32Array([8, 9, ...transform().model]), 2, 0);
    env.values(env.program).set('u_nmat', transform().normal); env.draw();
  }]] });
  assert.equal(result.samples.length, 1);
});

for (const invalid of ['transpose', 'negative-offset', 'short-length', 'non-affine', 'nonfinite', 'null-location']) {
  test(`ambiguous matrix upload ${invalid} cannot create an Earth candidate`, async () => {
    const { result, queryCounts } = await spin({ actions: [[100, env => {
      env.gl.useProgram(env.program); env.gl.uniform1i(env.appLocation('u_mode'), 0);
      const data = transform().model;
      if (invalid === 'non-affine') data[3] = 1;
      if (invalid === 'nonfinite') data[4] = NaN;
      env.gl.uniformMatrix4fv(invalid === 'null-location' ? null : env.appLocation('u_model'),
        invalid === 'transpose', data, invalid === 'negative-offset' ? -1 : 0, invalid === 'short-length' ? 15 : 0);
      env.draw();
    }]] });
    assert.equal(result.samples.length, 0); assert.equal(queryCounts.parameter, 0); assert.equal(queryCounts.uniform, 0);
    assert.equal(result.nativeCalls.uniformMatrix4fv.completed, 1);
  });
}

test('draw-local hints support both upload orders and are cleared after either draw API', async () => {
  const { result, queryCounts } = await spin({ actions: [[100, env => {
    env.gl.useProgram(env.program); env.gl.uniform1i(env.appLocation('u_mode'), 0);
    env.gl.uniformMatrix4fv(env.appLocation('u_model'), false, transform().model);
    env.values(env.program).set('u_nmat', transform().normal); env.draw();
    env.advance(1); env.draw(); // Same GPU state without new uploads is unknown.
    env.upload(); env.gl.drawArrays(0, 0, 3); env.draw();
  }]] });
  assert.equal(result.samples.length, 1); assert.equal(result.drawCounts.arraySubmitted, 1);
  assert.equal(queryCounts.parameter, 1); assert.equal(queryCounts.uniform, 3);
});

test('named locations are cached independently for each candidate program', async () => {
  const { result, queryCounts } = await spin({ actions: [[100, env => {
    env.advance(1); env.upload(); env.draw();
    env.advance(2); env.upload(.01, undefined, env.otherProgram); env.draw();
    env.advance(3); env.upload(.02); env.draw();
  }]] });
  assert.equal(result.samples.length, 3); assert.equal(queryCounts.location, 6);
  assert.equal(queryCounts.parameter, 3); assert.equal(queryCounts.uniform, 9);
});

for (const mismatch of ['program', 'mode', 'model']) test(`shadow hints cannot admit mismatched actual GPU ${mismatch}`, async () => {
  const { result } = await spin({ actions: [[100, env => {
    env.upload();
    if (mismatch === 'program') {
      for (const [name, value] of env.values(env.program)) env.values(env.otherProgram).set(name, value);
      env.setActualProgram(env.otherProgram);
    }
    if (mismatch === 'mode') env.values(env.program).set('u_mode', 2);
    if (mismatch === 'model') env.values(env.program).set('u_model', transform(0, [9, 9, 9]).model);
    env.draw();
  }]] });
  assert.equal(result.samples.length, 0);
});

test('changing hints cannot make frozen actual GPU transforms pass the original spin assertion', async () => {
  const { result } = await spin({ actions: advancingDraws(env => {
    const frozen = transform(); env.values(env.program).set('u_model', frozen.model); env.values(env.program).set('u_nmat', frozen.normal);
  }) });
  assert.equal(result.samples.length, 4);
  assert.throws(() => assertSubmittedSpin(result.samples), /frozen|outside cap/);
});

test('actual normal/model disagreement stays red instead of using hinted model data', async () => {
  const { result } = await spin({ actions: advancingDraws(env => env.values(env.program).set('u_nmat', transform().normal)) });
  assert.throws(() => assertSubmittedSpin(result.samples), /inverse transpose/);
});

test('silent native rejection cannot turn a submitted matrix hint into observed Earth evidence', async () => {
  const { result } = await spin({ actions: [[100, env => {
    env.upload(0, [9, 9, 9]); env.reject('uniformMatrix4fv', 'silent');
    env.gl.uniformMatrix4fv(env.appLocation('u_model'), false, transform().model); env.draw();
  }]] });
  assert.equal(result.samples.length, 0);
});

test('native exceptions preserve attempted/completed diagnostics, propagation, and cleanup', async () => {
  const { result, uncaught } = await spin({ allowNativeErrors: true, actions: [[100, env => {
    env.upload(); assert.equal(env.gl.drawArrays(0, 0, 7), 42); env.reject('drawElements'); env.draw();
  }], [200, env => { env.reject('uniformMatrix4fv'); env.gl.uniformMatrix4fv(env.appLocation('u_model'), false, transform().model); }]] });
  assert.deepEqual(uncaught, ['native drawElements failed', 'native uniformMatrix4fv failed']);
  assert.equal(result.drawCounts.attempted, 1); assert.equal(result.drawCounts.submitted, 0);
  assert.equal(result.drawCounts.arrayAttempted, 1); assert.equal(result.drawCounts.arraySubmitted, 1);
  assert.equal(result.nativeCalls.uniformMatrix4fv.attempted, 3); assert.equal(result.nativeCalls.uniformMatrix4fv.completed, 2);
  assert.equal(result.sampleError, ''); assert.equal(result.timing.elapsedMs, 5000);
});

for (const api of ['useProgram', 'uniform1i', 'drawArrays']) test(`rejected ${api} remains visible and does not change native failure semantics`, async () => {
  const { result, uncaught } = await spin({ allowNativeErrors: true, actions: [[100, env => {
    env.reject(api);
    if (api === 'useProgram') env.gl.useProgram(env.program);
    if (api === 'uniform1i') env.gl.uniform1i(env.appLocation('u_mode'), 0);
    if (api === 'drawArrays') env.gl.drawArrays(0, 0, 3);
  }]] });
  assert.deepEqual(uncaught, [`native ${api} failed`]); assert.equal(result.samples.length, 0);
  if (api === 'drawArrays') {
    assert.equal(result.drawCounts.arrayAttempted, 1); assert.equal(result.drawCounts.arraySubmitted, 0);
  } else {
    assert.equal(result.nativeCalls[api].attempted, 1); assert.equal(result.nativeCalls[api].completed, 0);
  }
});

test('a failed GPU readback exits through the unchanged poll and restores every wrapper', async () => {
  const { result, now } = await spin({ actions: [[100, env => { env.upload(); env.failReadback('GPU read failed'); env.draw(); }]] });
  assert.match(result.sampleError, /GPU read failed/); assert.equal(now, 150); assert.equal(result.samples.length, 0);
});

test('a normal readback completing after five seconds cannot supply the required third sample', async () => {
  const { result } = await spin({ actions: advancingDraws((env, index) => {
    if (index === 3) env.delayReadback(name => name === 'u_nmat' ? 4900 : 0);
  }).slice(0, 3) });
  assert.equal(result.timing.endedMs, 5200); assert.equal(result.drawCounts.lateReadbacks, 1);
  assert.equal(result.samples.length, 2);
  assert.throws(() => assertSubmittedSpin(result.samples), /insufficient Earth sphere draws: 2/);
});

test('the sample timestamp includes the final GPU readback and admits completion exactly at five seconds', async () => {
  const { result } = await spin({ actions: [[100, env => {
    env.upload(); env.delayReadback(name => name === 'u_nmat' ? 4900 : 0); env.draw();
  }]] });
  assert.equal(result.samples.length, 1); assert.equal(result.samples[0].sampledMs, 5000);
  assert.equal(result.samples[0].elapsedMs, 5000); assert.equal(result.drawCounts.lateReadbacks, 0);
});

test('a native draw completing after the deadline is forwarded but incurs no GPU inspection', async () => {
  const { result, queryCounts } = await spin({ actions: [[100, env => { env.upload(); env.delayDraw(5000); env.draw(); }]] });
  assert.equal(result.drawCounts.submitted, 1); assert.equal(result.drawCounts.expiredDraws, 1);
  assert.equal(result.samples.length, 0); assert.equal(queryCounts.parameter, 0); assert.equal(queryCounts.uniform, 0);
});

for (const diagnosticFails of [false, true]) test(`early failures preserve page and console errors with DOM failure=${diagnosticFails}`, async () => {
  const writes = [], timers = new Set(), original = Error('spin failed');
  const context = { error: original, diagnosticPage: { evaluate: () => diagnosticFails ? Promise.reject(Error('page unavailable')) : Promise.resolve({ surface: 'orrery' }) },
    phase: 'System/WebGL', outputDirectory: 'evidence', failures: ['pageerror: native draw failed', 'console: unexpected'], workerCoverage: { errors: [] },
    fs: { writeFileSync: (name, text) => writes.push({ name, value: JSON.parse(text) }) }, path: { join: (...parts) => parts.join('/') },
    console: { error() {} }, setTimeout: () => { timers.add(1); return 1; }, clearTimeout: id => timers.delete(id) };
  await assert.rejects(vm.runInNewContext(`(async()=>${failureCatch})()`, context), error => error === original);
  assert.equal(writes.length, 1); assert.deepEqual(writes[0].value.runtimeErrors, context.failures); assert.equal(timers.size, 0);
  if (diagnosticFails) assert.equal(writes[0].value.diagnosticError, 'page unavailable');
  else assert.deepEqual(writes[0].value.diagnostic, { surface: 'orrery' });
});
