# Observed scattering producer and consumer evidence

This validation-only observer supplements the current physical Earth/Mars draw
gate. It is CPU-tested tooling; it does not by itself establish interpolation
accuracy, completed GPU texture contents, native performance or release approval.
The original five-second collection deadline, three accepted final Earth draws,
frozen-rotation control and held-presentation control are unchanged.

Both browser callers install `installScatteringProducerEvidence` before startup,
alongside immutable linked-program and numerical-upload observers. Physical
preparation imports the staged consumer and generator shader strings, records
their SHA-256 identities, waits for static upload hashing, and configures the
generator observer. Earlier draws cannot be admitted retroactively. No field
hashing or full texture readback runs inside the timed collection window.

Each accepted generator submission requires the observed exact generator source
and independently queried actual current program; a complete triangle draw;
an actual level-zero RGBA32F color attachment; an observed matching allocation;
the full target viewport; all four color writes; and the manager's disabled
blend/depth/cull/scissor/stencil/discard/sample/dither state. Both passes read back
their actual physical profile, camera, Sun, solar scale, exposure and grid
uniforms. The actual column sampler must reference the observed immutable RG32F
upload with no sampler override. Scene serial, epoch and context generation are
captured at the draw. Subsequent clears, draws, texture mutations, replacement,
deletion, relinks or a different frame prevent reuse of that evidence.

At the final physical surface draw, the existing actual model/camera/Sun and
static field guards still apply. The added checks require both actual bound
surface/limb textures, in order, from the current generator program and scene.
All contributing producer and consumer profile/grid uniforms must match.
Surface and shell consumers have separate required active uniform schemas: a
surface shader can optimize out the limb sampler/size, and a shell shader can
optimize out the surface sampler/height/size. Both actual bound producer textures,
allocations and pass dimensions remain mandatory and must match an independently
prepared source plan. Generator-only camera radius and axis can be optimized out of the consumer, so
their consistency with the actual uploaded physical camera is checked using
propagated binary32 rounding bins. The same check validates the generator's
camera/Sun-derived basis. This does not introduce a physical km/angle tolerance.

The separately uploaded surface datum must match the catalogue-minus-optical
radius. The field height range must equal the immutable smooth datum, or the
full admitted terrain source envelope for the explicit Mars terrain gate. The
existing Mars buffer and height-texture proof remains responsible for matching
the actual drawn level-4 geometry to that source. Published manager status is
additional confirmation only: a submitted status without both observed producer
draws cannot pass. Accepted evidence retains both pass uniforms, upload/draw
sequences, frame identity and filter/query counters.

Native calls retain their receivers, arguments, return values and exceptions.
Observer failure invalidates evidence without consuming application GL errors.
CPU source hints filter unrelated draws before expensive driver queries; known
output binding transitions are independently checked so an invalid native bind
cannot hide a later mutation. Texture selector changes used for inspection are
restored. The observer adds no application dependencies, assets or network calls.

## Validation

The initial focused producer and physical-profile suite passed 16 groups. It includes
held and mismatched outputs; stale serial, epoch and generation; source relinks;
wrong current programs despite matching CPU hints; partial color writes; wrong
pass dimensions; mutated static columns; differing camera, Sun, basis and profile;
nonzero surface datum; later framebuffer writes; texture replacement; invalid
binding hints; context loss; and preserved native exceptions. Independently
rounded oblate cameras pass for both the projected-Sun and fallback basis cases.
The combined Node suite passes 1,110 tests; 110 production JavaScript files
typecheck with the existing TypeScript 5.9.3 tool.

An actual immutable application replay must still demonstrate these joins on
SwiftShader and the native backend after numerical admission. Numerical and
pixel tests must separately qualify the exact generator/consumer source pair.
Submission evidence is not a full-texture readback and cannot establish that
every interpolated sample is valid. No earlier reference-shader receipt transfers
automatically to the new scattering consumer. HDR remains opt-in.

Rollback restores the previous validation tooling and its matching immutable
runtime together; a current consumer cannot be qualified using the older static
field-only probe. Retained older successful and failed receipts are unchanged.

The first real SwiftShader application replay of runtime `2ba2911` retained four
original final Earth draws, but rejected 91 physical candidates because the probe
required the optimized-out surface-side limb-size uniform. That failed receipt
is preserved. The corrected active schema passes 18 focused CPU groups, including
absent required uniforms, a wrong unused-side producer grid and shell-specific
requirements. This is a probe correction, not a numerical or deadline change;
a corrected immutable browser replay remains required.
