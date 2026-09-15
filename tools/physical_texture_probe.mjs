/** Observe exact numerical texture uploads before application startup.
 * Self-contained for evaluateOnNewDocument; never hashes during timed draws.
 * This proves source upload identity, not driver acceptance or numerical output.
 * Framebuffer textures are deliberately ineligible: a dynamic field requires
 * separate producer-generation evidence, even after a later texImage2D upload.
 */
export function installPhysicalTextureEvidence() {
  if (globalThis.__solPhysicalTextureEvidence) return;
  const contexts = new WeakMap(), pending = new Set();
  let sequence = 0;
  const context = gl => {
    if (!contexts.has(gl)) contexts.set(gl, { textures: new WeakMap(), attachments: new WeakSet() });
    return contexts.get(gl);
  };
  const invalid = (gl, texture, reason) => {
    if (texture) context(gl).textures.set(texture, { sequence: ++sequence, status: 'invalid', reason });
  };
  const bound = (gl, target) => target === gl.TEXTURE_2D ? gl.getParameter(gl.TEXTURE_BINDING_2D) : null;
  const proto = WebGL2RenderingContext.prototype;
  const originalImage = proto.texImage2D;
  proto.texImage2D = function (...args) {
    const texture = bound(this, args[0]);
    invalid(this, texture, 'texImage2D replacement is not an admitted numeric upload');
    let record = null, bytes = null;
    if (texture && !context(this).attachments.has(texture)) {
      const [target, level, internalFormat, width, height, border, format, type, source, offset = 0] = args;
      const channels = internalFormat === this.R32F && format === this.RED ? 1
        : internalFormat === this.RG32F && format === this.RG ? 2
          : internalFormat === this.RGBA32F && format === this.RGBA ? 4 : 0;
      const unpack = Object.fromEntries([
        ['alignment', 'UNPACK_ALIGNMENT'], ['flipY', 'UNPACK_FLIP_Y_WEBGL'],
        ['premultiplyAlpha', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL'],
        ['colorspaceConversion', 'UNPACK_COLORSPACE_CONVERSION_WEBGL'],
        ['rowLength', 'UNPACK_ROW_LENGTH'], ['imageHeight', 'UNPACK_IMAGE_HEIGHT'],
        ['skipPixels', 'UNPACK_SKIP_PIXELS'], ['skipRows', 'UNPACK_SKIP_ROWS'], ['skipImages', 'UNPACK_SKIP_IMAGES'],
      ].map(([key, name]) => [key, this.getParameter(this[name])]));
      const count = width * height * channels;
      if (target === this.TEXTURE_2D && level === 0 && border === 0 && channels && type === this.FLOAT
          && Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
          && source instanceof Float32Array && Number.isInteger(offset) && offset >= 0
          && Number.isSafeInteger(count) && offset + count <= source.length
          && !this.getParameter(this.PIXEL_UNPACK_BUFFER_BINDING)
          && [1, 2, 4, 8].includes(unpack.alignment) && (width * channels * 4) % unpack.alignment === 0
          && !unpack.flipY && !unpack.premultiplyAlpha
          && ['rowLength', 'imageHeight', 'skipPixels', 'skipRows', 'skipImages'].every(key => unpack[key] === 0)) {
        // Copy before native submission and before the asynchronous digest. The
        // caller may transfer, reuse, or modify the original immediately after.
        bytes = new Uint8Array(source.buffer, source.byteOffset + offset * 4, count * 4).slice();
        record = { sequence: ++sequence, status: 'pending', reason: null,
          width, height, internalFormat, format, type, byteLength: bytes.byteLength, unpack };
      }
    }
    // A native exception must retain the invalid record; do not consume getError.
    const result = originalImage.apply(this, args);
    if (record) {
      const state = context(this);
      state.textures.set(texture, record);
      const job = Promise.resolve().then(() => crypto.subtle.digest('SHA-256', bytes)).then(hash => {
        if (state.textures.get(texture) !== record) return;
        record.sha256 = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
        record.status = 'ready';
      }, error => {
        if (state.textures.get(texture) !== record) return;
        record.status = 'invalid'; record.reason = `SHA-256 failed: ${String(error)}`;
      });
      pending.add(job); job.finally(() => pending.delete(job));
    }
    return result;
  };
  for (const name of ['texSubImage2D', 'copyTexImage2D', 'copyTexSubImage2D',
    'compressedTexImage2D', 'compressedTexSubImage2D', 'texStorage2D', 'generateMipmap']) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    proto[name] = function (...args) {
      invalid(this, bound(this, args[0]), `${name} modified the texture`);
      return original.apply(this, args);
    };
  }
  const originalDelete = proto.deleteTexture;
  proto.deleteTexture = function (texture) {
    invalid(this, texture, 'texture deleted');
    return originalDelete.call(this, texture);
  };
  for (const [name, index] of [['framebufferTexture2D', 3], ['framebufferTextureLayer', 2]]) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    proto[name] = function (...args) {
      const texture = args[index];
      if (texture) {
        context(this).attachments.add(texture);
        invalid(this, texture, 'framebuffer attachment requires separate producer evidence');
      }
      return original.apply(this, args);
    };
  }
  globalThis.__solPhysicalTextureEvidence = Object.freeze({
    snapshot(gl, texture) {
      if (!texture) return null;
      if (gl.isContextLost()) return { status: 'invalid', reason: 'context lost' };
      const record = contexts.get(gl)?.textures.get(texture);
      return record ? { ...record, ...(record.unpack ? { unpack: { ...record.unpack } } : {}) } : null;
    },
    async settle() { while (pending.size) await Promise.all([...pending]); },
  });
}
