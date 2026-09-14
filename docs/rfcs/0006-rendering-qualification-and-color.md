# RFC 0006: Rendering qualification, color and derived resources

- Status: Draft
- Authors: Codex with Min Kang
- Created: 2026-09-14
- Target: independently qualified rendering follow-ups
- Requirements: `SOL-VIS-004`, `SOL-VIS-005`, `SOL-VIS-006`, `SOL-ARCH-001`, `SOL-SCI-001`

## Summary

Qualify atmospheric terrain endpoints and bounded rendering work before admitting
new lighting optimizations. Specify every material's color pipeline, measure real
texture processing, and separate HDR, reflection, terrain and photometry into
reviewable changes. This draft captures the accepted work sequence; it does not
mark its proposed rendering techniques or new datasets as accepted or implemented.

## Context

At `bd7f5b45798a754c409e4b265e15703dad018f84`, Earth/Mars physical scattering still
runs its quadrature per surface/shell fragment. Fresh hosted tests missed the
unchanged Earth animation deadline. The earlier bounded-field prototype failed
368 of 5,592 broader interpolation queries and remains unpublished.

Registered primary-body imagery uses linear arithmetic after encoded filtering;
catalogue moons use separate display recipes. Night emission, scientific palettes,
fallback colors and shell composition have distinct semantics. A global sRGB
upload change would cross these boundaries. Asset count and compressed file size
alone do not diagnose texture memory or upload performance.

This RFC extends the qualification boundaries of RFCs 0004 and 0005. It does not
change source interpretation, ephemerides, collision-clearance policy, the state
estimator, uncertainty or operational-use claims.

## Requirements

- `SOL-VIS-006`: Optical changes MUST retain explicit endpoint, density, geometry,
  phase, shadow and exposure conventions, a finite work bound, and independent
  numerical and actual-GPU acceptance. Existing reference assertions and limits
  MUST remain in force. New domains require additional references and gates.
- `SOL-VIS-004`: Color migration MUST identify the representation at decode,
  resize, upload, filtering, shading, composition and output for each active and
  fallback material. Alpha/coverage and scientific palettes MUST remain data.
- `SOL-VIS-004`: A derived texture MUST retain original source identity plus its
  own bytes, hash, dimensions, transform recipe, color/coverage policy and
  capability selection. File presence MUST NOT imply rendering admission.
- `SOL-VIS-005`: New terrain MUST retain physical units, datum, coverage and source
  cell resolution; refinement MUST NOT invent surface information.
- `SOL-SCI-001`: A photometric claim MUST name its observable and independent
  reference. A map's mean brightness MUST NOT be labelled geometric albedo.
- `SOL-ARCH-001`: Appearance work MUST NOT evolve or reinterpret engine state.

## Design

The [engineering plan](../plans/2026-09-14-rendering-qualification/ENGINEERING_PLAN.md)
defines scope, ownership, data flow, resource states, sequencing and test matrix.
Its detailed color, texture and advanced-rendering companion specifications define
the individual implementation boundaries.

The first atmospheric reference extension is explicitly opt-in: ground-clipped
reference behavior stays the default; terrain-endpoint mode preserves a finite
physical endpoint through the existing constant-below-datum density convention.
That is a mathematical reference convention, not an underground-atmosphere claim.
The candidate segmentation is qualification tooling until admitted separately.

Future bounded scattering must align interpolation with qualified geometric
boundaries and satisfy the retained complete domain, material and actual-raster
gates. A fast prepass, stale field or illustrative fallback cannot count as a
current final physical Earth submission.

Color migration starts with the current route matrix. Source display maps are not
calibrated reflectance merely because they are decoded to linear channel values.
HDR initially means a floating-point scene target with explicit SDR output; display
HDR and absolute radiometry are separate capabilities. Palette overlays remain
outside physical material fitting.

Texture profiling separates Image decode scheduling, CPU API calls, GPU completion
observation, filtering and resource lifetime. Logical payload accounting is an
estimate, not observed total VRAM. Derived formats are admitted only when measured
benefits and numerical/source fidelity justify them.

Ring models retain distinct subpixel coverage and material transmission. Moon
photometry defines phase, disk integration, BRDF, exposure and independent source
data before fitting. New reflection and terrain products require their own source
qualification before surface rendering is enabled.

## UX and accessibility

No new navigation or controls are needed for qualification tooling. Future options
use existing keyboard-operable disclosures and maintain selection/focus on failure.
Capability fallback, loading, unavailable data and explicit retry remain visible.
Scientific labels distinguish reference scenarios, mission display imagery,
calibrated data and educational approximations without presenting debug internals
in the primary exploration flow.

## Security and privacy

Qualification uses local staged artifacts and existing dependencies. Tools verify
source/asset hashes and constrain local paths and browser network destinations.
They do not transmit user locations, credentials or session information. New
numeric and image resources retain existing size, value, hash and cancellation
checks. No new runtime provider, telemetry or background service is introduced.

## Alternatives

1. Global sRGB upload: rejected as an incomplete migration across shared uniforms,
   night emission, coverage and moon recipes.
2. Larger tensor scattering fields: prior experiments still failed accuracy gates;
   allocation growth alone is not evidence of a valid interpolation design.
3. Raise animation deadlines or reduce texture/terrain detail: rejected because
   this would weaken the accepted product/qualification contract.
4. Effective slab from averaged ring opacity, or moon fitting against image means:
   rejected because these replace the required physical observable with another.
5. One large visual rewrite: rejected; independent slices provide smaller reviews
   and rollback boundaries and expose unmet data prerequisites.

## Risks

More integration segments can correct a density kink while increasing work; that
does not solve the performance P1. Finite grids can interpolate across visibility
boundaries. Browser color conversion and device filtering can vary. HDR can clip
or double-apply exposure, and tiled resources can leak or admit stale generations.
Source imagery can contain unknown illumination or incomplete coverage. Each risk
has a named qualification gate before promotion; failures remain retained evidence.

## Acceptance criteria

1. Existing default numerical cases remain unchanged; terrain-endpoint analytic,
   convergence, polar/oblate and shadow-boundary cases are independently verified.
2. Optical candidate passes both original GPU assertions and the expanded domain
   at unchanged tolerances, with measured finite invocation counts.
3. Every material/fallback path has an explicit contract and behavioral fixtures;
   actual decode/filter/mip changes additionally pass GPU pixel controls.
4. Texture receipts bind an immutable stage, record actual capabilities and distinguish
   isolated replay from whole-application demand and lifetime measurements.
5. Each advanced slice names its independent source/observable, resource budget,
   failure path and rollback; missing data keeps that slice unadmitted.
6. Runtime promotion passes existing staged application, animation, context-loss,
   coverage and hosted CI gates. Local success alone does not establish readiness.

## Validation

Use existing Node/Python tests, web typecheck, docs, SDLC and UX validators. Add
explicit terrain-endpoint Python tests, material route tests and texture profiler
tests. Run the original atmosphere GPU gate and its opt-in terrain extension;
qualification-only candidate output is identified separately from shipped shaders.
Full runtime changes additionally run staged browser and physical-rendering tests,
unchanged coverage floors and native-device qualification as specified per slice.

## Rollout and rollback

Publish independently reviewable qualification/contract changes first. Promote
runtime changes only after their slice-specific gates pass. Use immutable derived
resource identities and existing capability fallbacks. Reverting a slice must not
replace original source bytes, engine snapshots or physical coordinates. Merge,
release promotion and deployment remain separately visible actions.

## Documentation

Maintain the engineering plan, color/texture/advanced specifications and per-run
qualification record. Update RFC 0005, SPEC, requirements traceability, source
records and user disclosures when a runtime slice is accepted. Do not mark this
RFC Implemented from tests or documentation alone.
