# Bounded scattering target lifecycle

The resource helper in [scatteringTargets.js](../../../apps/web/js/scatteringTargets.js)
owns allocation, two-pass submission, current-frame matching, binding, and cleanup.
This change adds no renderer wiring and imports no trial scattering formula.
Its CPU tests establish lifecycle behavior; they do not establish shader accuracy,
native compile performance, GPU completion, or rendered physical readiness.

## Ownership and prerequisites

`createScatteringTargets(gl, options)` requires an already-ready generator borrowed
from `createShaderPrograms`. The options are `contextGeneration`,
`programGeneration`, `programs`, `generatorKey`, `generatorUniforms`, `admitPlan`,
and optional `capacity` (1 or 2, default 2). The shader owner's generation and the
renderer's graphics context generation are separate counters. The helper checks
the captured owner generation and exact ready program object before admitting a
submission or binding. It never creates, compiles, links, queries status or uniform
locations for, or deletes a program or shader. The caller retains the qualified
generator source and uniform-location association.

The context must provide WebGL 2, `EXT_color_buffer_float`, at least ten fragment
and combined texture units, and valid texture dimensions. Capability queries run
once at creation. Unit 7 holds the borrowed atmospheric column texture; units 8
and 9 hold the owned surface/volume and limb textures. Each of at most two resident
keys owns one framebuffer, one empty fullscreen-triangle VAO, and two single-level
RGBA32F textures with NEAREST sampling and CLAMP_TO_EDGE wrapping.

Each key has a fixed maximum of 65,536 total texels across its two textures,
or 1,048,576 logical payload bytes. Two keys therefore have a maximum 2 MiB logical
texture payload. These values are not measured VRAM usage. Dimensions must be
positive integers, x/y dimensions at least 2, and surface depth 1, 9, or 17. The
surface texture is flattened to `surfaceSize[0]` by
`surfaceSize[1] * surfaceSize[2]`. Both allocations must fit `MAX_TEXTURE_SIZE`.
The helper independently recomputes the texel count and bytes and rejects forged
summaries, overflow, invalid dimensions, or excessive budgets even when the caller
predicate returns true. A resize deletes the prior owned group before allocation.

## Admission and identity

Call `beginFrame({contextGeneration, sceneSerial, epoch})` before generation.
The serial is a monotonically increasing nonnegative safe integer. Repeating the
exact current frame is permitted. A new frame invalidates every earlier submitted
result; an invalid or older frame cannot restore it. Epoch is finite and compared
exactly, including signed zero. Frame identity is separate from binary32 optical
input identity.

`generate(key, args, callerState)` and `bind(key, args, consumer)` take the same
argument schema:

```javascript
const args = {
  frame: {contextGeneration, sceneSerial, epoch},
  plan, profile, opticalOptions,
  columnTexture,     // caller-owned qualified column texture
  columnIdentity,    // nonempty identity for those current column contents
};
```

Plans provide `status: 'ready'`, `body`, `radiusKm`, `topKm`, `polarRatio`,
`cameraBodyKm`, `cameraRadius`, `axis`, `u`, `v`, `heightRange`, `surfaceSize`,
`limbSize`, `evaluations`, and `bytes`. Optical options use the existing
`atmosphereUniformValues` schema: `cameraBodyKm`, `sunDirectionBody`, `polarRatio`,
`solarDistanceAu`, and `exposure`. Numeric vectors must be ordinary arrays;
convert typed vectors with `Array.from` at the boundary.

`admitPlan(plan, profile, opticalOptions)` is mandatory and must return exactly
true. The caller establishes qualified source/profile admission, valid basis and
grid geometry, finite nonzero Sun, an outside-envelope camera, and the complete
scientific domain. A self-declared `status: 'ready'` is insufficient. The helper
also rejects zero/nonfinite uploaded Sun, inconsistent plan/profile radius and
top, and mismatched camera or polar ratio. It does not infer scientific validity
from dimensions, nor derive a plan itself.

The helper bounds and copies plain input data, then compares binary32 identities
for the camera, Sun, profile, grid, and actual derived uniform values, including
the normalized Sun and solar scale. Signed zero remains distinct. Numeric inputs
that round to the same binary32 value match. Column texture object and caller
column content identity must both match. Admission is repeated during binding;
mutations, cancellation, frame changes or shader replacement during admission
cannot admit a stale result. Source qualification and actual producer/content
identity must still be verified independently by integration evidence.

## Exact GL state handoff

The caller supplies known state, avoiding a full driver state query each frame:

```javascript
const callerState = {
  drawFramebuffer, readFramebuffer, // actual scene HDR FBO or null, independently
  viewport: [x, y, width, height],
  program, vertexArray, activeTexture,
  textureUnits: [
    {unit: 7, texture: columnBinding, sampler: columnSampler},
    {unit: 8, texture: priorBinding8, sampler: priorSampler8},
    {unit: 9, texture: priorBinding9, sampler: priorSampler9},
  ],
  enabled: {
    blend, depthTest, cullFace, scissorTest, stencilTest,
    rasterizerDiscard, sampleCoverage, sampleAlphaToCoverage, dither,
  },
  colorMask: [redWrite, greenWrite, blueWrite, alphaWrite],
  depthMask,
};
```

Bindings must be live caller-owned objects or null, never this manager's owned
targets, framebuffer or VAO. After a consumer draw, explicitly unbind the old
output textures before generation and supply those known null bindings. A failed
resize or cancellation may delete owned resources; restoring a deleted owned
handle would be invalid. The helper rejects that snapshot before changing GL
bindings or deleting the old group, while invalidating its submission. That bounded
group remains allocated until explicit retry/cancel/disposal. The caller remains
responsible for accurately describing current state.

The prepass disables all listed capabilities, enables all color channels, disables
depth writes, uses its own framebuffer and empty VAO, and unbinds the two outputs
from sampling units before drawing. It clears every output texel to invalid zero
RGBA, then issues one fullscreen triangle per pass. A qualified generator must
write valid output for its admitted domain. The invalid clear prevents discarded
fragments from retaining earlier content. The helper restores the supplied draw
and read FBOs, viewport, program, VAO, capabilities, masks, texture and sampler
bindings, and active selector independently on success or failure. It does not
assume the scene framebuffer is null. It does not modify depth functions, blend
equations, scissor rectangles, stencil functions, or other disabled-state values.

Generator locations are the existing `ATMOSPHERE_UNIFORMS`,
`u_atmosphereColumnField`, `u_scatteringPass`, and the helper's exported
`SCATTERING_TARGET_UNIFORMS`. Optimized-out locations may be null, except the
required column and pass locations. Consumer locations use the exported scattering
list; `u_scatteringReady` must be present. Locations must belong to the corresponding
current program. The helper initializes optical/grid uniforms and sampler indices.

The caller must already have the consumer program current when calling:

```javascript
const usable = targets.bind(key, args, {
  program: currentConsumerProgram,
  locations: consumerLocations,
  activeTexture: knownCurrentActiveSelector,
});
```

Binding sets readiness to zero first. A matching submission installs textures on
units 8/9 with null samplers, uploads grid uniforms, and sets readiness to one.
It intentionally leaves those output bindings and consumer uniforms installed,
restoring the active texture selector. The caller must update its known-state
tracking and gate the physical draw on the boolean result. A false result must not
be treated as physical readiness, including when a context error prevents a
uniform update.

## Failure, retry, and proof limits

Generation returns true only after both draw submissions and state restoration
have passed bounded GL error checks. Binding checks errors before admission,
after texture/uniform setup, and after active-selector restoration. Consumed
nonzero errors are retained with their phase in the key's bounded diagnostic list
(most recent eight). There is no silent error-draining loop: a caller error found
on entry fails the operation and is handed back through `status(key).glErrors`.
A consumed restoration error is recorded even after a prior failure. Successful
submission and `NO_ERROR` do not prove GPU completion or content correctness;
`gpuCompletionVerified` is always false. The helper does not call `finish`,
`flush`, or readback APIs.

An allocation or submission failure releases partial resources and latches the
key unavailable. `retry(key)` is explicit; no automatic allocation loop runs.
`cancel(key)` or `cancel()` releases the selected or all keys and invalidates any
in-progress submission; retry is required afterward. Keys retain their bounded
slots after cancellation. `dispose()` is idempotent and terminal. Context loss or
shader owner replacement makes the entire manager unavailable, releases its
resources, and requires creating a new manager with a new explicit context/owner
identity. Status `submitted` describes CPU submission evidence only; `bind` is the
authoritative admission operation for a current consumer draw.

## CPU validation

[scatteringTargets.test.mjs](../../../tests/web/scatteringTargets.test.mjs)
uses a strict GL state/resource mock. It forbids compiler/status/uniform-location
queries, borrowed-program deletion, synchronization, and readback. Cases cover
exact HDR/default-FBO restoration, binary32/frame mismatch, caller admission,
forged budgets, capability failures, partial allocations, explicit retry,
two-key capacity, volume flattening, failed resize, cancellation/disposal,
context/program replacement, silent GL binding/restoration errors, and the exact
65,536-node budget boundary. Four added regressions were observed failing before
the corresponding fixes (selector above unit 9, binding error, and program
replacement during admission, and implicit unbinding on rejected restore state).

Run with the repository Node 22 runtime:

```powershell
node --test tests/web/scatteringTargets.test.mjs
python tools/typecheck_web.py
python tools/validate_docs.py
python tools/validate_sdlc.py
git diff --check
```

Renderer integration, qualified formula outputs, source-bound GPU producer joins,
native/software comparisons, startup deadlines, and physical draw readiness need
separate tests against the integrated immutable stage. This helper alone does not
change or qualify those release gates.
