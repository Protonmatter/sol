# RFC 0007: Illustrative planet looks

- Status: Draft
- Authors: Codex for Protonmatter
- Created: 2026-09-23
- Target: appearance-mode review
- Requirements: `SOL-VIS-008`

## Summary

Offer the Planet Look Lab maps for Mercury, Venus, Mars, Jupiter, Saturn, Uranus,
and Neptune through an explicit Illustrative look selector. Illustrative look is the
initial mode, as requested by the owner on 2026-09-25; Source-qualified remains selectable.
This draft accompanies a reviewable implementation; appearance acceptance and
required CI remain prerequisites for merge.

## Context

The user requested these seven looks in SOL. Their Solar System Scope maps include
artistic color and reconstructed coverage. RFC 0004's source-qualified requirements
remain in force for the Source-qualified option. Earth, Sun, moons, physics and reference
inventories are outside this change.

The subsequent [Sites Earth integration](0009-sites-earth-v7.md) adds Earth to
the same selector under `SOL-VIS-010`. This RFC's seven-map inventory and its
two-texture cache remain unchanged; the Earth resource budget is separate.

## Requirements

`SOL-VIS-008`: Fresh sessions MUST start in Illustrative look, limited to the seven
named planets, visibly attributed, and separate from registered source imagery.
Source-qualified MUST remain selectable for immediate visual rollback.
It MUST NOT change engine outputs or claim registered terrain, calibrated colors,
current weather or observation epochs for the artistic maps. Map failures MUST
show simplified surfaces with explicit status. Resources MUST be bounded and
cancelled when unwanted, inactive or superseded by graphics-context loss.

## Design

`illustrativeAppearance.js` owns the allowlisted catalog, demand, status text and
hash-checked decoding. `illustrativeAssetManifest.js` pins the seven 2048 by 1024
assets copied from the lab. Existing `createDetailCache` bounds this separate cache
to two maps. The largest visible maps, prioritizing the anchor, load on demand.
Registered surface requests are suppressed for these bodies while selected.
Existing ellipsoids, rotation matrices, lights and ring geometry are reused.
Mars measured relief is suspended because the artistic map has no measured grid
registration. Relief stays suspended for the whole time Illustrative look is
selected, including load, failure, and eviction, not only while the artistic map
is shown. Switching back restores the source-qualified path. Venus with
Magellan radar keeps the registered ground and draws the artistic atmosphere
on a translucent shell above it. Without radar, Illustrative look still
replaces Venus with the opaque artistic cloud deck. The shell is a display
composite: the JPEG has no alpha, coverage is derived, and it is not a
qualified optical profile or a co-registered cloud measurement. No runtime
dependency or snapshot schema changes are introduced.

## UX and accessibility

Solar System > View > Planet appearance uses a labelled native select with
Source-qualified and Illustrative look options. An adjacent explanation includes
credit/license links and scope. Body cards show loading/failure/ready status and
artistic limits. Before body selection, the overview discloses the active artistic
mode and attribution, or that textures are switched off. The existing texture checkbox controls both modes. Keyboard and
touch interaction use existing native controls. No new animation is added.

## Security and privacy

No user data is transmitted. Requests use seven pinned same-origin assets, not
arbitrary URLs. Bytes, SHA-256 and dimensions are checked before GPU upload.
Aborted decodes close their bitmap and stale generations cannot upload. A two-map
cache bounds retained image/GPU allocations; no maps load at page startup.

## Alternatives

Presenting artistic maps as scientific observations would misrepresent them. The
default artistic mode retains explicit attribution and the source-qualified alternative.
Porting the lab's
standalone renderer would duplicate geometry and physics. Reuse SOL's renderer
with an explicitly labelled material mode instead.

## Risks

Artistic colors/longitude features are not scientifically registered. Keep source
qualification separate and disable measured relief for affected bodies. GPU color
and physical mobile behavior require the repository's browser/native gates.
Additional allocation is bounded to two 2K maps. No current reference admission is
changed or waived.

## Acceptance criteria

1. Fresh sessions show the seven illustrative maps without a mode-selection action.
   Source-qualified and unknown modes retain registered imagery; Earth, Sun and moons
   never select an illustrative texture (unit tests).
2. All seven assets match pinned bytes, hashes, dimensions and license (unit tests).
3. Offscreen, disabled and galaxy demand produce no requests. Venus with radar
   still requests the artistic atmosphere and the registered Magellan ground;
   the artistic map is a shell, not a replacement. Anchor priority and the
   two-map bound hold (unit tests).
4. Wrong bytes/hash/dimensions, decode errors and aborts never upload (unit tests).
5. Selection, source disclosure, cancellation and context restore remain wired
   through existing UI/render lifecycle (contract tests and browser CI).

## Validation

Run the new illustrative tests; existing planetAppearance, referenceDemand and
resource lifecycle tests; all Node tests; web type/static checks; SDLC/doc/UX
validators. Required repository CI owns native GPU, two-engine browser, coverage,
WASM and release qualification. A screenshot in the lab verifies the intended
textures but does not qualify SOL's GPU integration.

## Rollout and rollback

Submit as a draft PR with the owner-requested illustrative default. Merge/release only after RFC
review and required CI. Select Source-qualified for immediate user rollback;
revert the commit for complete removal. No data or user-state migration.

## Documentation

Update SPEC, README, requirement traceability, this RFC and the implementation plan.
The standalone lab's Earth grading and Sun-loop fixes are independently deployed.
