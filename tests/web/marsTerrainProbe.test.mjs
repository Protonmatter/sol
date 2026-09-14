import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { prepareMarsTerrainEvidence } from '../../tools/mars_terrain_probe.mjs';

async function fixture({ corrupt = false, outside = false, gpuError = false } = {}) {
  const pos = new Float32Array([outside ? 2 : 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]);
  const idx = new Uint32Array([0, 1, 2]), heights = new Float32Array([1, 2, 3, 4]);
  const mesh = { pos, idx, vertexCount: 3 }, grid = { width: 2, height: 2, heightsKm: heights };
  const position = { bytes: new Uint8Array(pos.buffer).slice() }, index = { bytes: new Uint8Array(idx.buffer).slice() }, texture = {};
  if (corrupt) position.bytes[0] ^= 1;
  const program = {}, uniforms = new Map([
    ['u_model', new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, .1, .2, .3, 1])],
    ['u_terrainShadowEnabled', 1], ['u_terrainShape', new Float32Array([3396, 3372, 3417, 0])],
    ['u_terrainPoles', new Float32Array([-1, -2])], ['u_bodyRadiusKm', Math.fround(3396.2)], ['u_terrainHeight', 5],
  ]);
  const gl = { lost: false, getError: () => gpuError ? 1282 : 0, isContextLost() { return this.lost; } };
  for (const [i, name] of ['ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER', 'COPY_READ_BUFFER', 'COPY_WRITE_BUFFER',
    'ARRAY_BUFFER_BINDING', 'ELEMENT_ARRAY_BUFFER_BINDING', 'COPY_READ_BUFFER_BINDING', 'COPY_WRITE_BUFFER_BINDING',
    'CURRENT_PROGRAM', 'ACTIVE_TEXTURE', 'TEXTURE0', 'TEXTURE_BINDING_2D', 'TRANSFORM_FEEDBACK_ACTIVE',
    'TRIANGLES', 'UNSIGNED_INT', 'FLOAT', 'R32F', 'RED', 'BUFFER_SIZE', 'VERTEX_ATTRIB_ARRAY_BUFFER_BINDING',
    'VERTEX_ATTRIB_ARRAY_ENABLED', 'VERTEX_ATTRIB_ARRAY_SIZE', 'VERTEX_ATTRIB_ARRAY_TYPE', 'VERTEX_ATTRIB_ARRAY_NORMALIZED',
    'VERTEX_ATTRIB_ARRAY_INTEGER', 'VERTEX_ATTRIB_ARRAY_STRIDE', 'VERTEX_ATTRIB_ARRAY_DIVISOR', 'VERTEX_ATTRIB_ARRAY_POINTER'].entries()) gl[name] = i + 1;
  gl.NO_ERROR = 0;
  const bindings = new Map([[gl.ARRAY_BUFFER, position], [gl.ELEMENT_ARRAY_BUFFER, index], [gl.COPY_READ_BUFFER, null]]);
  let active = gl.TEXTURE0, divisor = 0;
  gl.getParameter = key => key === gl.CURRENT_PROGRAM ? program : key === gl.ACTIVE_TEXTURE ? active
    : key === gl.TEXTURE_BINDING_2D ? texture : key === gl.TRANSFORM_FEEDBACK_ACTIVE ? false
      : bindings.get(new Map([[gl.ARRAY_BUFFER_BINDING, gl.ARRAY_BUFFER], [gl.ELEMENT_ARRAY_BUFFER_BINDING, gl.ELEMENT_ARRAY_BUFFER],
        [gl.COPY_READ_BUFFER_BINDING, gl.COPY_READ_BUFFER], [gl.COPY_WRITE_BUFFER_BINDING, gl.COPY_WRITE_BUFFER]]).get(key));
  gl.bindBuffer = (target, buffer) => {
    if (target === gl.ARRAY_BUFFER && buffer === index) throw Error('Index buffer cannot be bound as ARRAY_BUFFER');
    bindings.set(target, buffer);
  };
  gl.activeTexture = value => { active = value; };
  gl.getUniformLocation = (_, name) => name; gl.getUniform = (_, name) => uniforms.get(name);
  gl.getAttribLocation = (_, name) => name === 'a_pos' ? 0 : 1;
  gl.getVertexAttribOffset = location => location * 12;
  gl.getVertexAttrib = (_, key) => new Map([[gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING, position],
    [gl.VERTEX_ATTRIB_ARRAY_ENABLED, true], [gl.VERTEX_ATTRIB_ARRAY_SIZE, 3], [gl.VERTEX_ATTRIB_ARRAY_TYPE, gl.FLOAT],
    [gl.VERTEX_ATTRIB_ARRAY_NORMALIZED, false], [gl.VERTEX_ATTRIB_ARRAY_INTEGER, false],
    [gl.VERTEX_ATTRIB_ARRAY_STRIDE, 24], [gl.VERTEX_ATTRIB_ARRAY_DIVISOR, divisor]]).get(key);
  gl.getBufferParameter = target => bindings.get(target).bytes.length;
  gl.getBufferSubData = (target, offset, bytes) => bytes.set(bindings.get(target).bytes.subarray(offset, offset + bytes.length));
  for (const name of ['bufferData', 'bufferSubData', 'copyBufferSubData', 'deleteBuffer', 'bindBufferBase', 'bindBufferRange', 'beginTransformFeedback']) gl[name] = () => 17;
  gl.drawElements = () => 41;
  const originals = { drawElements: gl.drawElements, bufferData: gl.bufferData };
  const field = { status: 'ready', sha256: createHash('sha256').update(new Uint8Array(heights.buffer)).digest('hex'),
    width: 2, height: 2, internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT };
  const scope = vm.createContext({ console, URL, Float32Array, Uint32Array, Uint8Array, crypto: webcrypto, setTimeout, clearTimeout,
    Event: class {}, __solPhysicalTextureEvidence: { settle: async () => {}, snapshot: () => ({ ...field }) },
    document: { querySelector: () => ({ src: 'http://127.0.0.1/sol/app.js?v=immutable' }),
      getElementById: name => name === 'orreryCanvas' ? { getContext: () => gl }
        : { dispatchEvent: () => gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0) } } });
  const moduleValues = {
    'store.js': { store: { orrery: { bodies: [{ name: 'Mars', x_au: .1, y_au: .2, z_au: .3 }] } } },
    'bodyData.js': { BODY: { Mars: { radiusKm: 3396.2, polarKm: 3376.2 } } },
    'terrainAssets.js': { loadTerrainReference: async () => ({ reference: { id: 'mars-test', sha256: 'source-hash' }, grid }) },
    'terrainGeometry.js': { buildTerrainMesh: (_, options) => {
      assert.equal(options.latSegments, 256); assert.equal(options.lonSegments, 512); return mesh;
    }, terrainShadowUniforms: () => ({ shape: [3396, 3372, 3417, 0], poles: [-1, -2] }) },
    'atmosphereOptics.js': { getAtmosphereProfile: () => ({ radiusKm: 3396.19 }) },
    'atmosphereIncident.js': { incidentFieldDomain: () => ({ minHeightKm: -24, maxHeightKm: 24 }) },
  };
  const modules = new Map();
  for (const [name, values] of Object.entries(moduleValues)) {
    const module = new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context: scope });
    await module.link(() => {}); await module.evaluate(); modules.set(`./js/${name}?v=immutable`, module);
  }
  const invoke = () => new vm.Script(`(${prepareMarsTerrainEvidence})()`, { importModuleDynamically: specifier => {
    assert.ok(modules.has(specifier), `Immutable source import: ${specifier}`); return modules.get(specifier);
  } }).runInContext(scope);
  const draw = { mode: gl.TRIANGLES, count: idx.length, type: gl.UNSIGNED_INT, offset: 0 };
  return { gl, scope, field, uniforms, position, index, bindings, originals, invoke, draw, program,
    divisor: value => { divisor = value; }, capture: changes => scope.__solMarsTerrainEvidence.capture(gl, program, { ...draw, ...changes }) };
}

test('pre-window readback uses COPY_READ_BUFFER and binds exact source-derived geometry', async () => {
  const env = await fixture(), summary = await env.invoke();
  assert.equal(summary.positionHash, summary.actualPositionHash); assert.equal(summary.indexHash, summary.actualIndexHash);
  assert.equal(summary.incidentHeightDomain.outsideHeightDomain, 0);
  assert.equal(env.gl.drawElements, env.originals.drawElements);
  assert.equal(env.bindings.get(env.gl.COPY_READ_BUFFER), null);
  assert.equal(env.capture().passed, true);
  env.scope.__solMarsTerrainEvidence.dispose();
  assert.equal(env.gl.bufferData, env.originals.bufferData); assert.equal(env.capture().passed, false);
});

test('equal-sized corrupt geometry and GPU readback failure cannot prepare a passing proof', async () => {
  for (const options of [{ corrupt: true }, { gpuError: true }, { outside: true }]) {
    const env = await fixture(options); await assert.rejects(env.invoke());
    assert.equal(env.gl.drawElements, env.originals.drawElements); assert.equal(env.gl.bufferData, env.originals.bufferData);
  }
});

test('actual incomplete draw, layout, source height texture and disabled shadows are rejected', async () => {
  const env = await fixture(); await env.invoke();
  for (const change of [{ count: 1 }, { type: 5123 }, { mode: 1 }, { offset: 4 }]) assert.equal(env.capture(change).passed, false);
  env.divisor(1); assert.equal(env.capture().passed, false); env.divisor(0);
  env.uniforms.set('u_terrainShadowEnabled', 0); assert.equal(env.capture().passed, false); env.uniforms.set('u_terrainShadowEnabled', 1);
  const hash = env.field.sha256; env.field.sha256 = 'wrong'; assert.equal(env.capture().passed, false); env.field.sha256 = hash;
  env.uniforms.set('u_terrainShape', [1, 2, 3, 4]); assert.equal(env.capture().passed, false);
  env.scope.__solMarsTerrainEvidence.dispose();
});

test('buffer replacement, update, copying, deletion and transform feedback invalidate the established readback', async () => {
  for (const mutation of ['bufferData', 'bufferSubData', 'copyBufferSubData', 'deleteBuffer', 'bindBufferBase', 'bindBufferRange', 'beginTransformFeedback']) {
    const env = await fixture(); await env.invoke();
    if (mutation === 'deleteBuffer') env.gl[mutation](env.position);
    else if (mutation === 'copyBufferSubData') { env.bindings.set(env.gl.COPY_WRITE_BUFFER, env.position); env.gl[mutation](env.gl.COPY_READ_BUFFER, env.gl.COPY_WRITE_BUFFER); }
    else if (mutation === 'bindBufferBase' || mutation === 'bindBufferRange') env.gl[mutation](1, 0, env.position);
    else env.gl[mutation](env.gl.ARRAY_BUFFER);
    assert.equal(env.capture().passed, false, mutation); env.scope.__solMarsTerrainEvidence.dispose();
  }
});

test('same-sized different index buffer and lost context cannot reuse old readback evidence', async () => {
  const env = await fixture(); await env.invoke();
  env.bindings.set(env.gl.ELEMENT_ARRAY_BUFFER, { bytes: env.index.bytes }); assert.equal(env.capture().passed, false);
  env.bindings.set(env.gl.ELEMENT_ARRAY_BUFFER, env.index); env.gl.lost = true; assert.equal(env.capture().passed, false);
  env.scope.__solMarsTerrainEvidence.dispose();
});
