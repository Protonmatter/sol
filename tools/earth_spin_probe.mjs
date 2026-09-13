/** Collect actual submitted Earth transforms in the unchanged five-second window.
 * Self-contained: Puppeteer serializes this function into the existing app page.
 */
export async function collectSubmittedEarthSpin() {
  const entry = document.querySelector('script[type="module"][src^="app.js"]');
  const { store } = await import(`./js/store.js${entry ? new URL(entry.src).search : ""}`);
  const canvas = document.getElementById("orreryCanvas"), gl = canvas.getContext("webgl2");
  const original = gl.drawElements, originalArrays = gl.drawArrays;
  const originalUseProgram = gl.useProgram, originalUniform1i = gl.uniform1i;
  const originalUniformMatrix4fv = gl.uniformMatrix4fv;
  const samples = [], locations = new Map();
  const draws = { attempted: 0, submitted: 0, arrayAttempted: 0, arraySubmitted: 0,
    surface: 0, earth: 0, duplicateEpoch: 0, candidates: 0, unknown: 0, gpuMismatch: 0,
    expiredDraws: 0, lateReadbacks: 0 };
  const nativeCalls = Object.fromEntries(["useProgram", "uniform1i", "uniformMatrix4fv"].map(
    name => [name, { attempted: 0, completed: 0 }]));
  let hintedProgram = null, zeroInteger = false, earthMatrix = false;
  const clearHints = () => { zeroInteger = false; earthMatrix = false; };
  const centeredOnEarth = (model, earth) => earth && model.length === 16 && model.every(Number.isFinite)
    && Math.hypot(model[12] - earth.x_au, model[13] - earth.y_au, model[14] - earth.z_au) <= 1e-5;
  const readState = () => {
    const rect = canvas.getBoundingClientRect();
    return { sampledMs: performance.now(), active: store.orrery.active, animate: store.orrery.animate,
      hidden: document.hidden, visibility: document.visibilityState, contextLost: gl.isContextLost(),
      anchor: store.orrery.anchor, selected: store.orrery.selected, engineError: store.orrery.engineError,
      lastTick: store.orrery.lastTick, renderUnix: store.orrery.renderUnix,
      canvas: { clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight,
        width: canvas.width, height: canvas.height, x: rect.x, y: rect.y, widthCss: rect.width, heightCss: rect.height } };
  };
  const timing = { startedMs: performance.now(), endedMs: null, elapsedMs: null };
  const deadlineMs = timing.startedMs + 5000;
  const initialState = readState(), rafHeartbeat = { count: 0, samples: [] };
  let heartbeatId = 0;
  const heartbeat = timestamp => {
    const sampledMs = performance.now();
    rafHeartbeat.count++;
    if (rafHeartbeat.samples.length < 120) rafHeartbeat.samples.push({ timestamp, sampledMs, elapsedMs: sampledMs - timing.startedMs });
    heartbeatId = requestAnimationFrame(heartbeat);
  };
  let sampleError = "";
  // Native uniform-location objects queried here need not equal the renderer's
  // already-cached objects. Treat draw-local scalar/matrix uploads only as broad
  // candidate hints; never infer a named uniform or accept uploaded values as
  // evidence. Every accepted epoch below still reads the actual GPU uniforms.
  gl.useProgram = function (...args) {
    nativeCalls.useProgram.attempted++;
    const result = originalUseProgram.apply(this, args);
    nativeCalls.useProgram.completed++;
    hintedProgram = args[0]; clearHints();
    return result;
  };
  gl.uniform1i = function (...args) {
    nativeCalls.uniform1i.attempted++;
    const result = originalUniform1i.apply(this, args);
    nativeCalls.uniform1i.completed++;
    if (hintedProgram && args[0] && args[1] === 0) zeroInteger = true;
    return result;
  };
  gl.uniformMatrix4fv = function (...args) {
    nativeCalls.uniformMatrix4fv.attempted++;
    const result = originalUniformMatrix4fv.apply(this, args);
    nativeCalls.uniformMatrix4fv.completed++;
    try {
      const [location, transpose, data, offset = 0, length = 0] = args;
      const count = length || (data?.length - offset);
      if (hintedProgram && location && transpose === false && Number.isInteger(offset) && offset >= 0
          && count === 16 && offset + count <= data?.length) {
        const model = Array.from(data).slice(offset, offset + count);
        const earth = store.orrery.bodies.find(body => body.name === "Earth");
        // A perspective MVP cannot be a model hint. Later unrelated uniforms
        // must not erase a valid candidate from the same production draw.
        if (model[3] === 0 && model[7] === 0 && model[11] === 0 && model[15] === 1
            && centeredOnEarth(model, earth)) earthMatrix = true;
      }
    } catch (error) { sampleError = String(error); }
    return result;
  };
  gl.drawArrays = function (...args) {
    draws.arrayAttempted++;
    try {
      const result = originalArrays.apply(this, args);
      draws.arraySubmitted++;
      return result;
    } finally { clearHints(); }
  };
  gl.drawElements = function (...args) {
    draws.attempted++;
    const candidate = hintedProgram && zeroInteger && earthMatrix, expectedProgram = hintedProgram;
    let result;
    try { result = original.apply(this, args); } // Always submit the unchanged production draw.
    finally { clearHints(); }
    draws.submitted++;
    if (samples.length >= 120 || sampleError) return result;
    if (performance.now() > deadlineMs) { draws.expiredDraws++; return result; }
    if (!candidate) { draws.unknown++; return result; }
    draws.candidates++;
    const epoch = store.orrery.renderUnix;
    if (samples.at(-1)?.epoch === epoch) { draws.duplicateEpoch++; return result; }
    try {
      const program = gl.getParameter(gl.CURRENT_PROGRAM);
      if (performance.now() > deadlineMs) { draws.lateReadbacks++; return result; }
      if (!program || program !== expectedProgram) { draws.gpuMismatch++; return result; }
      if (!locations.has(program)) locations.set(program, Object.fromEntries(
        ["u_mode", "u_model", "u_nmat"].map(name => [name, gl.getUniformLocation(program, name)])));
      const loc = locations.get(program);
      if (!loc.u_mode || !loc.u_model || !loc.u_nmat) { draws.gpuMismatch++; return result; }
      const mode = gl.getUniform(program, loc.u_mode);
      if (performance.now() > deadlineMs) { draws.lateReadbacks++; return result; }
      if (mode !== 0) { draws.gpuMismatch++; return result; }
      draws.surface++;
      const earth = store.orrery.bodies.find(body => body.name === "Earth");
      const model = Array.from(gl.getUniform(program, loc.u_model));
      if (performance.now() > deadlineMs) { draws.lateReadbacks++; return result; }
      if (!centeredOnEarth(model, earth)) { draws.gpuMismatch++; return result; }
      draws.earth++;
      const normal = Array.from(gl.getUniform(program, loc.u_nmat));
      // A synchronous GPU read can postpone timer delivery. Admission uses its
      // monotonic completion time, including the final normal readback, so a
      // late third draw cannot turn a five-second failure into a pass.
      const sampledMs = performance.now();
      if (sampledMs > deadlineMs) { draws.lateReadbacks++; return result; }
      samples.push({ sampledMs, elapsedMs: sampledMs - timing.startedMs,
        epoch, rate: store.orrery.yearsPerSec * 365.25 * 86400,
        normal, model });
    } catch (error) { sampleError = String(error); }
    return result;
  };
  try {
    // Observe browser frame delivery independently; this callback never invokes
    // the application loop, paints, or changes the scientific/render clock.
    heartbeatId = requestAnimationFrame(heartbeat);
    // Require actual submitted frames, not an assumed SwiftShader frame rate.
    // Bounded waiting keeps a stopped renderer red while tolerating a busy host.
    await new Promise(resolve => {
      const deadline = setTimeout(done, 5000);
      const poll = setInterval(() => { if (samples.length >= 4 || sampleError) done(); }, 50);
      function done() { clearInterval(poll); clearTimeout(deadline); resolve(); }
    });
  } finally {
    gl.drawElements = original; gl.drawArrays = originalArrays;
    gl.useProgram = originalUseProgram; gl.uniform1i = originalUniform1i;
    gl.uniformMatrix4fv = originalUniformMatrix4fv;
    cancelAnimationFrame(heartbeatId);
    timing.endedMs = performance.now(); timing.elapsedMs = timing.endedMs - timing.startedMs;
  }
  return { samples, sampleError, drawCounts: draws, nativeCalls, timing, rafHeartbeat, initialState, state: readState() };
}
