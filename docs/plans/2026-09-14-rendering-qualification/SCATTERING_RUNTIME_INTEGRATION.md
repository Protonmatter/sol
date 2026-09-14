# Current-frame scattering runtime integration

This is CPU-validated candidate wiring. It does not establish native interpolation
accuracy, native physical readiness, final-frame performance or release approval.
The source-qualified numerical module and the context-owned target manager have
separate review surfaces. HDR remains opt-in.

The renderer retains six mandatory base programs. Qualified Earth/Mars demand
requests three optional programs through the existing asynchronous owner: the
physical sphere consumer, atmosphere shell consumer and full-integrator field
generator. Capacity is nine; the existing 30-second per-request timeout is
unchanged. No optional uniform locations are queried before all three programs
are ready. The existing reference sphere sources remain available for independent
fixtures. Runtime physical draws use guarded consumer specializations with no
scattering quadrature in final fragments. The generator retains the numerical
module's exact original integrator.

Every visible scene has a distinct context generation, monotonic scene serial
and exact epoch, including paused repaints and SDR scenes. The HDR producer and
scattering owner use that same serial and epoch. A physical body can contribute
only after both surface and limb passes have been submitted for its current
profile, camera, Sun, column texture and admitted plan. The surface and deferred
shell each bind that exact submission. No prior-frame output can establish
current readiness. Diagnostics explicitly retain the manager's `submitted`
state and `gpuCompletionVerified: false`; shader/content qualification and
observed production draw evidence remain separate requirements.

The plan uses the catalogue radius as the physical datum. An admitted v2 terrain
mesh must match the body's source ID and hash before its full published radial
envelope contributes to the plan. The physical mesh and `surfaceBodyKm` endpoint
are unchanged. The consumer's explicit optical height is
`(v_surfaceScale - 1) * u_bodyRadiusKm + u_scatteringReferenceHeightKm`, with the
catalogue-minus-optical datum computed on the CPU and uploaded separately. This
retains Earth's 3 m datum offset without recovering it by subtracting two large
binary32 radii. This scalar is a coordinate conversion, not new relief or data.

Before generation, output units 8/9 are actually unbound; restoring a prior
manager-owned output could otherwise retain a deleted target or create feedback.
The caller snapshot records both draw/read framebuffers, viewport, current
program, vertex array, active texture selector, units 7/8/9 and samplers, color
and depth masks, and all nine affected enable states. The target manager restores
these after either success or failure. Thus a prepass inside an HDR scene returns
to that scene's offscreen framebuffer before the surface and shell compose.

Missing capabilities, invalid plans, source mismatches, incomplete targets or
rejected bindings retain the existing illustrative material/limb and unavailable
status. Static field or program readiness alone cannot claim a submitted current
frame. Allocation failures do not retry on repaint. A caller-state capture exception
retains its unavailable status and original cause across subsequent repaints;
recovering the driver alone does not start a hidden retry loop. Explicit optical retry,
selection demand, context loss, hidden/left views and zero-size canvases preserve
bounded cancellation and disposal. Numeric assets, ephemerides, geometry detail,
terrain shadows, material interpretations and presentation thresholds are unchanged.

The integration adds both modules to the immutable science dependency inventory.
Their module preloads are a separate, already coordinated main-branch change;
there is no hand-written service-worker asset list to duplicate.

## Validation and remaining gates

The pre-edit focused lifecycle baseline passed 40 tests. Consumer shader
regressions were deliberately red (0/2) before specialization and green (2/2)
afterward. Production-module lifecycle tests exercise independently pending
generator completion, fresh two-pass generation on paused repaints, the exact
HDR caller framebuffer, source terrain bounds and datum, failure fallback,
explicit retry and replacement of context-owned outputs. The broader Node suite
passed 1,098 tests including the terrain-identity guard and its negative control,
and a targeted state-read failure test verifies drawable fallback and removal
of prior admission. The final focused lifecycle/consumer subset passed 39 tests.
All 110 JavaScript files typechecked with the existing TypeScript 5.9.3 tool.
An independent review then reproduced a caller-state failure becoming a permanent
loading status on the next repaint. Its regression was red (6/7) before the
terminal-cause fix and green (7/7) afterward, including explicit optical retry.

The real dynamic producer observer is a separate follow-up. It must observe
actual generator draws, program source, both attached output textures, current
camera/Sun/profile/column bindings and matching frame identity before accepting
a physical consumer. Static texture-allocation or upload evidence cannot prove
generated field contents. The complete immutable application, original three
Earth final draws in five seconds, additive physical Earth/Mars, HDR pixel and
native backend gates must run after numerical source admission. No result from
the prior full-integrator runtime transfers automatically to these consumers.

Rollback reverts this runtime wiring to the separately retained reference shader
route. It does not change scientific state, image bytes, numerical payloads or
HDR exposure/encoding. The earlier native reference-shader completion failure
remains a retained limitation of that rollback route.
