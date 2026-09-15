# Current-frame scattering runtime integration

The bounded runtime and its current-frame producer observer are implemented.
Numerical source admission, interpolation, material composition and complete
application performance have separate gates. Runtime `daa1fbe` passes all 7,192
interpolation queries and all 1,600 independent supplemental source comparisons
on native Adreno and SwiftShader; the original 1,280-case atmosphere gate passes
on SwiftShader. The [production ledger](PRODUCTION_EXECUTION.md) records separate
final application, material, memory and published-head hosted admission. Earlier immutable application
passes are retained in [their receipt record](SCATTERING_APPLICATION_RECEIPTS.md)
and do not qualify subsequent source changes. HDR remains opt-in.

The renderer retains six mandatory base programs. Qualified Earth/Mars demand
requests three optional programs through the existing asynchronous owner: the
physical sphere consumer, atmosphere shell consumer and full-integrator field
generator. Capacity is nine; the existing 30-second per-request timeout is
unchanged. No optional uniform locations are queried before all three programs
are ready. The existing reference sphere sources remain available for independent
fixtures. Runtime physical draws use guarded consumer specializations with no
scattering quadrature in final fragments. The generator retains the numerical
module's current source-qualified direct integrator.

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

The [dynamic producer observer](SCATTERING_PRODUCER_EVIDENCE.md) observes actual
generator draws, program source, both attached output textures, current
camera/Sun/profile/column bindings and matching frame identity before accepting
a physical consumer. It includes an actual held-generator rejection control and
fresh-generation recovery. Static texture-allocation or upload evidence cannot
prove generated field contents. Final combined-source admission still requires
the complete immutable application, original three Earth final draws in five
seconds, physical Earth/Mars, HDR pixels and native backend gates after numerical
source admission. Earlier reference or bounded runtime results do not transfer
automatically to a changed generator/consumer source pair.

Rollback reverts this runtime wiring to the separately retained reference shader
route. It does not change scientific state, image bytes, numerical payloads or
HDR exposure/encoding. The earlier native reference-shader completion failure
remains a retained limitation of that rollback route.
