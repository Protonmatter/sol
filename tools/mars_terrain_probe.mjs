/** Prepare source-bound terrain evidence outside the five-second spin window.
 * A full readback binds the actual buffers to the independently rebuilt staged
 * level-4 mesh. During capture only identities, layouts and uniforms are read.
 * This is application-consumption evidence; numerical terrain qualification is
 * recorded separately by the source and shadow reference suites.
 */
export async function prepareMarsTerrainEvidence() {
  const entry = document.querySelector('script[type="module"][src^="app.js"]');
  const query = entry ? new URL(entry.src).search : '';
  const [{ store }, { BODY }, { loadTerrainReference }, { buildTerrainMesh, terrainShadowUniforms },
    { getAtmosphereProfile }, { incidentFieldDomain }] = await Promise.all([
    import('./js/store.js' + query), import('./js/bodyData.js' + query), import('./js/terrainAssets.js' + query),
    import('./js/terrainGeometry.js' + query), import('./js/atmosphereOptics.js' + query), import('./js/atmosphereIncident.js' + query),
  ]);
  const gl = document.getElementById('orreryCanvas').getContext('webgl2');
  const textureEvidence = globalThis.__solPhysicalTextureEvidence;
  if (!textureEvidence) throw Error('Numeric texture evidence must be installed before startup');
  globalThis.__solMarsTerrainEvidence?.dispose();
  const physical = BODY.Mars, profile = getAtmosphereProfile('Mars'), source = await loadTerrainReference('Mars');
  const mesh = buildTerrainMesh(source.grid, { latSegments: 256, lonSegments: 512,
    equatorialRadiusKm: physical.radiusKm, polarRadiusKm: physical.polarKm });
  const shadow = terrainShadowUniforms(source.grid);
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    value => value.toString(16).padStart(2, '0')).join('');
  const [positionHash, indexHash, heightHash] = await Promise.all([
    hash(mesh.pos), hash(mesh.idx), hash(source.grid.heightsKm),
  ]);
  await textureEvidence.settle();
  const domain = incidentFieldDomain('Mars');
  let minHeightKm = Infinity, maxHeightKm = -Infinity, outsideHeightDomain = 0;
  for (let i = 0; i < mesh.pos.length; i += 6) {
    const height = Math.hypot(mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]) * physical.radiusKm - profile.radiusKm;
    minHeightKm = Math.min(minHeightKm, height); maxHeightKm = Math.max(maxHeightKm, height);
    if (height < domain.minHeightKm - .002 || height > domain.maxHeightKm + .002) outsideHeightDomain++;
  }
  if (outsideHeightDomain) throw Error('Mars level-4 vertices exceed the incident field height domain');
  const expected = {
    sourceId: source.reference.id, sourceSha256: source.reference.sha256,
    level: 4, latSegments: 256, lonSegments: 512, vertexCount: mesh.vertexCount,
    count: mesh.idx.length, positionBytes: mesh.pos.byteLength, indexBytes: mesh.idx.byteLength,
    positionHash, indexHash, heightHash, width: source.grid.width, height: source.grid.height,
    shape: Array.from(new Float32Array(shadow.shape)), poles: Array.from(new Float32Array(shadow.poles)),
    bodyRadiusKm: Math.fround(physical.radiusKm),
    incidentHeightDomain: { minHeightKm, maxHeightKm, outsideHeightDomain, vertexCount: mesh.vertexCount, admitted: domain },
  };
  const locations = new Map(), original = {}, revisions = new WeakMap();
  let positionBuffer = null, indexBuffer = null, positionRevision = 0, indexRevision = 0, disposed = false;
  const revision = buffer => revisions.get(buffer) || 0;
  const invalidate = buffer => { if (buffer) revisions.set(buffer, revision(buffer) + 1); };
  const binding = target => {
    const name = target === gl.ARRAY_BUFFER ? gl.ARRAY_BUFFER_BINDING
      : target === gl.ELEMENT_ARRAY_BUFFER ? gl.ELEMENT_ARRAY_BUFFER_BINDING
        : target === gl.COPY_WRITE_BUFFER ? gl.COPY_WRITE_BUFFER_BINDING
          : target === gl.COPY_READ_BUFFER ? gl.COPY_READ_BUFFER_BINDING : null;
    return name === null ? null : gl.getParameter(name);
  };
  for (const name of ['bufferData', 'bufferSubData', 'copyBufferSubData', 'deleteBuffer',
    'bindBufferBase', 'bindBufferRange', 'beginTransformFeedback']) {
    if (typeof gl[name] !== 'function') continue;
    original[name] = gl[name];
    gl[name] = function (...args) {
      if (name === 'deleteBuffer') invalidate(args[0]);
      else if (name === 'beginTransformFeedback') { invalidate(positionBuffer); invalidate(indexBuffer); }
      else if (name === 'bindBufferBase' || name === 'bindBufferRange') invalidate(args[2]);
      else invalidate(binding(args[name === 'copyBufferSubData' ? 1 : 0]));
      return original[name].apply(this, args);
    };
  }
  const dispose = () => {
    if (disposed) return; disposed = true;
    for (const [name, value] of Object.entries(original)) gl[name] = value;
  };
  const readUniform = (program, name) => {
    if (!locations.has(program)) locations.set(program, new Map());
    const names = locations.get(program);
    if (!names.has(name)) names.set(name, gl.getUniformLocation(program, name));
    const location = names.get(name); return location === null ? null : gl.getUniform(program, location);
  };
  const attribute = (program, name) => {
    const location = gl.getAttribLocation(program, name);
    if (location < 0) return null;
    const read = key => gl.getVertexAttrib(location, gl[key]);
    return { location, buffer: read('VERTEX_ATTRIB_ARRAY_BUFFER_BINDING'),
      enabled: read('VERTEX_ATTRIB_ARRAY_ENABLED'), size: read('VERTEX_ATTRIB_ARRAY_SIZE'),
      type: read('VERTEX_ATTRIB_ARRAY_TYPE'), normalized: read('VERTEX_ATTRIB_ARRAY_NORMALIZED'),
      integer: read('VERTEX_ATTRIB_ARRAY_INTEGER'), stride: read('VERTEX_ATTRIB_ARRAY_STRIDE'),
      divisor: read('VERTEX_ATTRIB_ARRAY_DIVISOR'), offset: gl.getVertexAttribOffset(location, gl.VERTEX_ATTRIB_ARRAY_POINTER) };
  };
  const same = (actual, wanted) => actual && actual.length === wanted.length && Array.from(actual).every((v, i) => v === wanted[i]);
  const validLayout = (value, offset) => value && value.buffer === positionBuffer && value.enabled
    && value.size === 3 && value.type === gl.FLOAT && !value.normalized && !value.integer
    && value.stride === 24 && value.offset === offset && value.divisor === 0;
  const capture = (context, program, draw) => {
    const reject = reason => ({ passed: false, reason });
    if (disposed || context !== gl || gl.isContextLost()) return reject('Terrain context is unavailable');
    if (!positionBuffer || !indexBuffer || revision(positionBuffer) !== positionRevision || revision(indexBuffer) !== indexRevision)
      return reject('Qualified terrain buffers were replaced or modified');
    if (draw.mode !== gl.TRIANGLES || draw.count !== expected.count || draw.type !== gl.UNSIGNED_INT || draw.offset !== 0)
      return reject('Draw does not submit the complete level-4 terrain index range');
    if (gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE)) return reject('Transform feedback can modify the qualified buffers');
    const position = attribute(program, 'a_pos'), normal = attribute(program, 'a_nrm');
    if (!validLayout(position, 0) || !validLayout(normal, 12)
        || gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) !== indexBuffer) return reject('Actual terrain vertex/index bindings or layout changed');
    const uniforms = { enabled: readUniform(program, 'u_terrainShadowEnabled'),
      shape: readUniform(program, 'u_terrainShape'), poles: readUniform(program, 'u_terrainPoles'),
      bodyRadiusKm: readUniform(program, 'u_bodyRadiusKm'), sampler: readUniform(program, 'u_terrainHeight') };
    if (uniforms.enabled !== 1 || !same(uniforms.shape, expected.shape) || !same(uniforms.poles, expected.poles)
        || uniforms.bodyRadiusKm !== expected.bodyRadiusKm || !Number.isInteger(uniforms.sampler) || uniforms.sampler < 0)
      return reject('Terrain shadow uniforms are not the admitted source geometry');
    const active = gl.getParameter(gl.ACTIVE_TEXTURE);
    let heightTexture;
    try { gl.activeTexture(gl.TEXTURE0 + uniforms.sampler); heightTexture = gl.getParameter(gl.TEXTURE_BINDING_2D); }
    finally { gl.activeTexture(active); }
    const field = textureEvidence.snapshot(gl, heightTexture);
    if (field?.status !== 'ready' || field.sha256 !== expected.heightHash || field.width !== expected.width
        || field.height !== expected.height || field.internalFormat !== gl.R32F || field.format !== gl.RED || field.type !== gl.FLOAT)
      return reject('Actual terrain shadow texture does not match decoded source heights');
    return { passed: true, reason: null, sourceId: expected.sourceId, sourceSha256: expected.sourceSha256,
      level: expected.level, vertexCount: expected.vertexCount, draw, positionHash, indexHash,
      uniforms: { ...uniforms, shape: Array.from(uniforms.shape), poles: Array.from(uniforms.poles) }, field };
  };
  let restorePreparationDraw = () => {};
  try {
    const previousDraw = gl.drawElements;
    let timer;
    const actual = await new Promise((resolve, reject) => {
      restorePreparationDraw = () => { gl.drawElements = previousDraw; clearTimeout(timer); };
      timer = setTimeout(() => { restorePreparationDraw(); reject(Error('No actual Mars level-4 draw within terrain preparation deadline')); }, 20000);
      gl.drawElements = function (mode, count, type, offset) {
        const result = previousDraw.call(this, mode, count, type, offset);
        if (count !== expected.count || type !== gl.UNSIGNED_INT || offset !== 0) return result;
        const program = gl.getParameter(gl.CURRENT_PROGRAM), model = readUniform(program, 'u_model');
        const mars = store.orrery.bodies.find(body => body.name === 'Mars');
        if (!model || !mars || Math.hypot(model[12] - mars.x_au, model[13] - mars.y_au, model[14] - mars.z_au) > 1e-5) return result;
        restorePreparationDraw();
        try {
          positionBuffer = attribute(program, 'a_pos')?.buffer;
          indexBuffer = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
          if (!positionBuffer || !indexBuffer) throw Error('Mars terrain draw has no bound geometry');
          const readBuffer = (buffer, length) => {
            // COPY_READ_BUFFER accepts both vertex and element buffer objects;
            // rebinding an element buffer as ARRAY_BUFFER is invalid in WebGL.
            const old = gl.getParameter(gl.COPY_READ_BUFFER_BINDING), bytes = new Uint8Array(length);
            try {
              gl.bindBuffer(gl.COPY_READ_BUFFER, buffer);
              if (gl.getBufferParameter(gl.COPY_READ_BUFFER, gl.BUFFER_SIZE) !== length) throw Error('Terrain GPU buffer length differs from source-derived mesh');
              gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, bytes);
            } finally { gl.bindBuffer(gl.COPY_READ_BUFFER, old); }
            return bytes;
          };
          const pos = readBuffer(positionBuffer, expected.positionBytes), idx = readBuffer(indexBuffer, expected.indexBytes);
          if (gl.getError() !== gl.NO_ERROR) throw Error('Terrain buffer readback was rejected');
          positionRevision = revision(positionBuffer); indexRevision = revision(indexBuffer);
          resolve({ pos, idx, draw: { mode, count, type, offset }, program });
        } catch (error) { reject(error); }
        return result;
      };
      // Repaint the existing paused engine state; preparation must not advance it.
      document.getElementById('orrerySize').dispatchEvent(new Event('input'));
    });
    const [actualPositionHash, actualIndexHash] = await Promise.all([hash(actual.pos), hash(actual.idx)]);
    if (actualPositionHash !== positionHash || actualIndexHash !== indexHash) throw Error('Actual Mars terrain buffers differ from the staged source-derived level-4 mesh');
    globalThis.__solMarsTerrainEvidence = { body: 'Mars', summary: { ...expected, actualPositionHash, actualIndexHash }, capture, dispose };
    return globalThis.__solMarsTerrainEvidence.summary;
  } catch (error) { dispose(); throw error; }
  finally { restorePreparationDraw(); }
}
