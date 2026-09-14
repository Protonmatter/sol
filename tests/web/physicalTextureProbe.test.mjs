import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { installPhysicalTextureEvidence } from '../../tools/physical_texture_probe.mjs';

function fixture({ digest = (...args) => webcrypto.subtle.digest(...args) } = {}) {
  class GL {
    constructor() {
      Object.assign(this, { TEXTURE_2D: 3553, TEXTURE_BINDING_2D: 32873, FLOAT: 5126,
        R32F: 33326, RG32F: 33328, RGBA32F: 34836, RED: 6403, RG: 33319, RGBA: 6408,
        UNPACK_ALIGNMENT: 3317, UNPACK_FLIP_Y_WEBGL: 37440, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
        UNPACK_COLORSPACE_CONVERSION_WEBGL: 37443, UNPACK_ROW_LENGTH: 3314, UNPACK_IMAGE_HEIGHT: 32878,
        UNPACK_SKIP_PIXELS: 3316, UNPACK_SKIP_ROWS: 3315, UNPACK_SKIP_IMAGES: 32877,
        PIXEL_UNPACK_BUFFER_BINDING: 35055 });
      this.texture = {}; this.parameters = new Map([[3317, 4], [37443, 37444]]);
      this.calls = []; this.lost = false; this.reject = false;
    }
    getParameter(key) { return key === this.TEXTURE_BINDING_2D ? this.texture : this.parameters.get(key) ?? 0; }
    isContextLost() { return this.lost; }
    texImage2D(...args) { if (this.reject) throw Error('native rejected'); this.calls.push(args); return 73; }
  }
  for (const method of ['texSubImage2D', 'copyTexImage2D', 'copyTexSubImage2D', 'compressedTexImage2D',
    'compressedTexSubImage2D', 'texStorage2D', 'generateMipmap', 'deleteTexture', 'framebufferTexture2D', 'framebufferTextureLayer']) {
    GL.prototype[method] = function (...args) { this.calls.push([method, ...args]); return 41; };
  }
  const scope = vm.createContext({ WebGL2RenderingContext: GL, Float32Array, Uint8Array,
    crypto: { subtle: { digest } } });
  vm.runInContext(`(${installPhysicalTextureEvidence})()`, scope);
  const gl = new GL(), evidence = scope.__solPhysicalTextureEvidence;
  const upload = (source = new Float32Array([1, 2, 3, 4]), extra = {}) => gl.texImage2D(gl.TEXTURE_2D,
    extra.level ?? 0, extra.internalFormat ?? gl.R32F, 2, 2, 0, extra.format ?? gl.RED, gl.FLOAT, source, extra.offset ?? 0);
  return { gl, evidence, upload, scope, GL };
}

test('numeric source bytes are copied before asynchronous hashing and snapshots cannot alter identity', async () => {
  const { gl, evidence, upload } = fixture();
  const source = new Float32Array([1, 2, 3, 4]);
  const wanted = createHash('sha256').update(Buffer.from(source.buffer)).digest('hex');
  assert.equal(upload(source), 73); source.fill(99);
  assert.equal(evidence.snapshot(gl, gl.texture).status, 'pending');
  await evidence.settle();
  const record = evidence.snapshot(gl, gl.texture);
  assert.equal(record.sha256, wanted); assert.equal(record.byteLength, 16);
  assert.equal(record.unpack.colorspaceConversion, 37444);
  record.sha256 = 'forged'; record.unpack.flipY = true;
  assert.equal(evidence.snapshot(gl, gl.texture).sha256, wanted);
  assert.equal(evidence.snapshot(gl, gl.texture).unpack.flipY, 0);
});

test('typed-array byte offset and WebGL source element offset select exact submitted bytes', async () => {
  const { gl, evidence, upload } = fixture();
  const backing = new Float32Array([99, 88, 1, 2, 3, 4, 77]);
  upload(backing.subarray(1), { offset: 1 }); await evidence.settle();
  assert.equal(evidence.snapshot(gl, gl.texture).sha256,
    createHash('sha256').update(Buffer.from(new Float32Array([1, 2, 3, 4]).buffer)).digest('hex'));
});

test('column RG32F and incident RGBA32F preserve the complete channel payload', async () => {
  for (const channels of [2, 4]) {
    const { gl, evidence, upload } = fixture();
    const source = Float32Array.from({ length: 4 * channels }, (_, i) => i / 7);
    upload(source, { internalFormat: channels === 2 ? gl.RG32F : gl.RGBA32F,
      format: channels === 2 ? gl.RG : gl.RGBA });
    await evidence.settle(); const record = evidence.snapshot(gl, gl.texture);
    assert.equal(record.status, 'ready'); assert.equal(record.byteLength, channels * 16);
    assert.equal(record.sha256, createHash('sha256').update(Buffer.from(source.buffer)).digest('hex'));
  }
});

test('later texture mutation wins over an outstanding digest', async () => {
  let release;
  const { gl, evidence, upload } = fixture({ digest: () => new Promise(resolve => { release = resolve; }) });
  upload(); await Promise.resolve();
  gl.texSubImage2D(gl.TEXTURE_2D); release(new Uint8Array(32).buffer); await evidence.settle();
  assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid');
});

test('out-of-order digests cannot restore the identity of an older upload', async () => {
  const releases = [];
  const { gl, evidence, upload } = fixture({ digest: () => new Promise(resolve => releases.push(resolve)) });
  upload(); await Promise.resolve(); upload(new Float32Array([5, 6, 7, 8])); await Promise.resolve();
  releases[1](new Uint8Array(32).fill(2).buffer); await Promise.resolve();
  releases[0](new Uint8Array(32).fill(1).buffer); await evidence.settle();
  assert.equal(evidence.snapshot(gl, gl.texture).sha256, '02'.repeat(32));
});

test('every supported mutation and native failed replacement invalidates previous identity', async () => {
  for (const method of ['texSubImage2D', 'copyTexImage2D', 'copyTexSubImage2D', 'compressedTexImage2D',
    'compressedTexSubImage2D', 'texStorage2D', 'generateMipmap', 'deleteTexture']) {
    const { gl, evidence, upload } = fixture(); upload(); await evidence.settle();
    assert.equal(gl[method](method === 'deleteTexture' ? gl.texture : gl.TEXTURE_2D), 41);
    assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid', method);
  }
  const { gl, evidence, upload } = fixture(); upload(); await evidence.settle(); gl.reject = true;
  assert.throws(() => upload(), /native rejected/);
  assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid');
});

test('framebuffer attachment permanently prevents static source admission, including re-upload', async () => {
  for (const method of ['framebufferTexture2D', 'framebufferTextureLayer']) {
    const { gl, evidence, upload } = fixture(); upload(); await evidence.settle();
    gl[method](0, 0, ...(method === 'framebufferTexture2D' ? [gl.TEXTURE_2D, gl.texture, 0] : [gl.texture, 0, 0]));
    assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid');
    upload(); await evidence.settle();
    assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid');
  }
});

test('unsupported unpack, PBO, level, format and short source fail closed', async () => {
  for (const key of ['UNPACK_FLIP_Y_WEBGL', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'UNPACK_ROW_LENGTH',
    'UNPACK_IMAGE_HEIGHT', 'UNPACK_SKIP_PIXELS', 'UNPACK_SKIP_ROWS', 'UNPACK_SKIP_IMAGES', 'PIXEL_UNPACK_BUFFER_BINDING']) {
    const { gl, evidence, upload } = fixture(); gl.parameters.set(gl[key], 1); upload(); await evidence.settle();
    assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid', key);
  }
  for (const variant of [{ level: 1 }, { internalFormat: 0 }, { format: 0 }]) {
    const { gl, evidence, upload } = fixture(); upload(undefined, variant); await evidence.settle();
    assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid');
  }
  const { gl, evidence, upload } = fixture(); upload(new Float32Array(3)); await evidence.settle();
  assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid');
});

test('context isolation, context loss, digest rejection and repeated installation are explicit', async () => {
  const { gl, evidence, upload, scope, GL } = fixture({ digest: async () => { throw null; } });
  const installed = GL.prototype.texImage2D;
  vm.runInContext(`(${installPhysicalTextureEvidence})()`, scope);
  assert.equal(GL.prototype.texImage2D, installed);
  upload(); await evidence.settle();
  assert.equal(evidence.snapshot(gl, gl.texture).status, 'invalid');
  assert.match(evidence.snapshot(gl, gl.texture).reason, /SHA-256 failed: null/);
  assert.equal(evidence.snapshot(new GL(), gl.texture), null);
  gl.lost = true; assert.equal(evidence.snapshot(gl, gl.texture).reason, 'context lost');
});
