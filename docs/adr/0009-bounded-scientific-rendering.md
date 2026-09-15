# ADR 0009: Bounded scientific rendering and material admission

- Status: Accepted under RFC 0006; admission and release remain source-specific
- Date: 2026-09-14

## Context

Scattering quadrature in every final surface and shell fragment made atmospheric
work scale with framebuffer size. Earlier bounded-field candidates failed their
numerical domains, and synchronous shader readiness blocked native startup.
Color, terrain and HDR changes also require different source and resource
contracts. ADRs 0001, 0006, 0007 and 0008 remain in force.

## Decision

1. Retain native ES modules, WebGL2, raw WASM and the existing physical state.
   Rendering consumes validated positions, radii, time and source identities;
   display inflation and camera choices do not alter engine or orbital geometry.
2. Evaluate Earth/Mars scattering into current-camera surface and limb fields.
   The source integrator retains its physical conventions, segmentation and
   60-node analytic bound. Each body has at most 65,536 integration texels and
   1,048,576 logical payload bytes; at most two groups reside. Final consumers
   have bounded interpolation and analytic work, with no scattering quadrature.
   These bounds describe work and payload, not measured time or VRAM.
3. Bind every field to the context generation, scene serial, epoch,
   camera, Sun, endpoint and grid geometry,
   optical profile and numerical input resources that produced it. A physical
   consumer and its final presentation must use that current identity. Failed,
   stale, partial or held producers cannot qualify physical readiness. Retain
   disclosed loading/failure behavior and explicit retry.
4. Keep mandatory base programs usable while optional physical programs compile
   through the bounded asynchronous owner. Retain the original deadlines and
   cancellation, leave/reenter and context-restoration semantics. A compiler
   optimization must preserve the qualified source model and numerical domain.
5. Admit color changes per material. Opaque Earth/Moon display maps may decode
   before GPU filtering; masked references, night emission, catalogue-moon
   recipes, scientific palettes and fallbacks retain their declared contracts.
   Display-map decoding does not establish calibrated reflectance or complete
   browser/monitor color management.
6. Keep HDR opt-in: floating-point linear composition uses explicit exposure and
   SDR presentation. Allocate within the declared full-resolution target budget;
   unsupported targets retain the SDR path. Scientific palettes retain their
   SDR composition. This does not admit display HDR or absolute radiometry.
7. Admit source-derived Moon/Mars terrain by its numeric source, datum, units,
   coverage and bounded geometry/worker/resource contract. Regional tiling,
   finer photographic detail, reflection, revised ring transport and calibrated
   moon photometry require independent source and acceptance records. Reference
   helpers do not enable those materials. Temporal reconstruction is deferred.
8. Include scientific rendering, material, terrain, shader/resource ownership
   and HDR dependencies in the scientific release fingerprint. Preserve original
   source bytes and failed experiments. Qualify the actual staged artifact and
   named device/backend; passing local checks does not replace hosted gates or
   authorize merge, release promotion or deployment.

## Consequences and evidence boundary

Boundary-aware interpolation, coherent shadow support and stable coordinate
arithmetic add implementation complexity. Complete numerical corpora, independent
physical references and actual producer/consumer/presentation evidence control
admission. Neither visually plausible output nor a faster frame can waive them.

Native process/WDDM measurements complement explicit allocation accounting; they
are not attributable texture VRAM or a stable latency distribution. Derived
texture formats remain conditional on measured benefit and source fidelity.
Each advanced slice keeps its own failure and rollback boundary.

The governing [RFC 0006](../rfcs/0006-rendering-qualification-and-color.md),
[production ledger](../plans/2026-09-14-rendering-qualification/PRODUCTION_EXECUTION.md),
[color contract](../plans/2026-09-14-rendering-qualification/COLOR_PIPELINE.md) and
[advanced source contracts](../plans/2026-09-14-rendering-qualification/ADVANCED_RENDERING_SLICES.md)
record the exact supported scope, retained failures and remaining gates.
