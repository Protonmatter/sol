# RFC 0008: Optional Enhanced Earth presentation

- Status: Accepted
- Authors: Codex for Protonmatter
- Created: 2026-09-23
- Target: Enhanced Earth review candidate
- Requirements: `SOL-VIS-009`

## Summary

Add an opt-in Enhanced Earth checkbox: deeper oceans, a raised historical cloud
layer, Sun-directed offset shadows and independent drift during Play time.
The owner approved this design in conversation on 2026-09-23. Acceptance authorizes
implementation; it does not qualify native graphics, merge or deployment.

## Context

Earth already uses NASA surface, cloud, night-light and sea-ice maps. Clouds are
currently composited on the ground. This change retains those immutable sources
and their dates. It does not import the lab's artistic Earth or simulate weather.

## Requirements

`SOL-VIS-009`: Enhanced Earth MUST be opt-in and disclosed as illustrative. It
MUST preserve source-qualified defaults, engine state and non-Earth materials.
Cloud geometry, shadows and drift MUST share a single map phase. Pausing time,
hidden/inactive views and reduced motion MUST stop drift. Camera redraws MUST NOT
advance phase. MODIS clouds-and-ground swaths MUST NOT be lifted or drifted.
Unavailable cloud imagery MUST NOT create opaque fallback clouds or shadows.

## Design

Use the existing surface and cloud resources. Grade only dark blue pixels inside
a conservative offshore mask derived offline from the committed Natural Earth
land/ice polygons. Protect bright ice; suspend enhancement for the sea-ice palette.
The mask is display support, not a qualified coastline or ocean reflectance map.

Raise the cloud ellipsoid homothetically by a nominal 8 km at the equator
(slightly less at the poles). Reuse the sphere mesh and base program in a
transparent cloud pass, back-face culled, depth-tested and without depth writes.
The base program's existing haze approximation lights the cloud shell; this is
not dense-cloud or volumetric optical transfer. Night-side coverage falls off so
Black Marble remains on the ground pass, and a close view with the physical
atmosphere shell does not also add illustrative cloud haze. The ground retains
its existing reference atmosphere. Cloud shadows trace straight sunlight rays
from the oblate ground to this same shell and sample the same phase, attenuating
direct sunlight only. No fixed screen-space or longitude offset is used.

Drift adds 3% of the visible Earth rotation, capped at 0.002 turns per real second,
using a bounded phase advanced once per successful animation tick. The clock is
illustrative and never alters observation dates, positions or Earth orientation.
Daily MODIS or scientific sea-ice palette selection suspends the enhancement; toggling back resumes its phase.

## UX and accessibility

Earth layers contains a native unchecked Enhanced Earth checkbox, a concise help
paragraph and status describing active, suspended, loading or unavailable layers.
It is independent of the other planets' appearance mode. Keyboard/touch behavior
uses existing controls; reduced motion suppresses independent cloud drift.

## Security and privacy

No new runtime dependencies, external requests, user data or schemas. Existing
bounded/cancellable reference loaders own NASA imagery. One 512x256 R8 mask is
uploaded lazily, retained per context and disposed on context loss. Upload failure
leaves oceans ungraded with visible status. The generated mask pins input hashes.

## Alternatives

A fixed UV shadow offset contradicts a moving Sun. Full volumetric clouds need
different data and performance qualification. Replacing scientific defaults would
hide display edits; a separate toggle permits direct comparison and rollback.

## Risks

Cloud height, opacity-to-shadow strength and drift are artistic choices, not
retrieved meteorology. Coarse vectors omit small islands; blue/brightness guards
and an offshore margin restrict grading, but the mask is not survey accuracy.
Cloud scattering uses illustrative haze; it is not the ground's qualified optical
transfer. Physical-height depth is subtle at globe scale. Native GPU/mobile visual
and performance qualification remain required; CPU draw tests cannot establish it.

## Acceptance criteria

1. Default/off, non-Earth, no textures and MODIS paths retain their original draws.
2. Ready composite clouds appear once on the shell; missing/off clouds cast no shadow.
3. Executed shader geometry hits the correct raised oblate shell toward the Sun;
   tangent/polar/night cases are finite, and opposite light directions reverse offsets.
4. Draw tests prove shared cloud/shadow phase, elevation, depth/culling/blending,
   no night-light leakage, and pause/camera/context continuity.
5. Ocean math preserves masked land, neutral/bright ice and non-blue pixels;
   deterministic mask regeneration and known land/ocean/polar samples pass.

## Validation

Run focused shader/helper and full-renderer lifecycle tests, all Node tests,
mask regeneration, Python tests, type/static/doc/SDLC/UX gates and the web build.
Required CI retains native WebGL2, browser visual, coverage, WASM and release gates.

## Rollout and rollback

Submit a separate draft PR based on the existing default branch. Default is off.
Merge/deploy only after normal review and required gates. Uncheck Enhanced Earth
for immediate comparison/rollback; revert the feature commit for full removal.

## Documentation

Update SPEC, requirements catalogue/traceability, README, status and validation
evidence with the actual local results and remaining qualification limits.
