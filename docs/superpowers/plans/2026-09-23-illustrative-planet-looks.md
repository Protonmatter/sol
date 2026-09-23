# Illustrative Planet Looks Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement each task.

**Goal:** Add the seven requested lab planet looks as an optional SOL appearance mode.

**Architecture:** Keep the current WebGL2 scene. A separate, bounded cache supplies
attributed artistic maps only to eligible planets when explicitly selected.

**Tech Stack:** Native ESM JavaScript, WebGL2, Node test runner, Python validators.

**Spec:** `docs/rfcs/0007-illustrative-planet-looks.md`

## Global constraints

Source-qualified remains default. Earth, Sun, moons, snapshot schemas, physical
coordinates and current reference admission remain unchanged. Two 2K maps maximum.
Venus radar takes precedence. No measured terrain beneath unregistered artistic maps.

## Review focus

Rapid mode changes must abort unwanted decodes. Context loss must release cached
objects. Corrupt assets must fail closed. Disabled textures must remove both demand
and display. Returning to source-qualified must restore reference requests.

## Task 1: Catalog, decoding and demand

Files: `apps/web/js/illustrativeAppearance.js`, `illustrativeAssetManifest.js`,
`apps/web/textures/illustrative/*`, `tests/web/illustrativeAppearance.test.mjs`.

- [x] Write tests for eligibility, status, byte/hash integrity, aborted decode,
  dimensions, priority and the two-map demand cap.
- [x] Run `node --test tests/web/illustrativeAppearance.test.mjs`; expect missing module.
- [x] Copy the seven maps and generate the catalog from the lab provenance manifest.
- [x] Implement `illustrativeSelected(body,state)`, `planIllustrativeDemand(visible,state)`,
  `illustrativeDescription(body,state)` and `decodeIllustrativeMap(asset,signal,services)`.
- [x] Re-run the targeted test and require every assertion to pass.

## Task 2: Rendering and UI

Files: `orrery.js`, `planetAppearance.js`, `orreryDetail.js`, `index.html`.

- [x] Add source suppression tests and a rendering-lifecycle contract test.
- [x] Use `createDetailCache({capacity:2,load,release,onChange})` for image upload;
  `load` checks the context and active demand again after decoding.
- [x] Prioritize its map in `drawBody`; bypass measured terrain only while that
  body's illustrative mode is selected. Preserve geometry and lighting.
- [x] Wire selector, status, explicit retry, source rows, leaving and context loss.
- [x] Run targeted and full Node tests, type/static and governance checks.

## Task 3: Review delivery

Files: README, SPEC, requirements.json, RFC and this plan.

- [x] Record evidence and remaining GPU/CI gates; retain Draft RFC status.
- [ ] Commit and push a feature branch; create a draft PR with concrete changes,
  tested behavior, limitations and rollback. Do not merge or deploy production SOL.

## Execution evidence

Task 1: five pure/source tests passed after an initial missing-module failure.
Task 2: three renderer-lifecycle tests passed after initial missing-selector-state
failures. The existing 1,310-test baseline passed before changes. A memory-reader
fixture assumed one import; it now links the added appearance dependency and all
15 memory tests pass. Web types pass (114 files). Full-suite and release-gate
results are recorded in the PR after the final run.

Ruling: source-qualified remains default and RFC stays Draft in this reviewable
candidate. Artistic maps cannot satisfy source qualification; promotion requires
owner design review and existing CI. The cost is an explicit mode selection.

Lab revision is independent: darker Earth oceans and anchored/evolving Sun arches
were built, checked and privately deployed at commit 1294840338b7216f2ff26bc4f5591615b1726b9d.

Final local validation: all 1,318 Node tests and 28 ephemeris service tests pass.
Web types (114 files), SDLC (24 requirements), documentation (140 files), UX and
static web validators pass. Python discovery ran 388 tests with five errors from
missing cargo/rustc and three skips; it is not a green full-suite result. Rust/WASM,
real browser/GPU, coverage and physical mobile checks remain required CI/manual
work. No production SOL build or deployment is claimed.

Independent review: no Critical or Important runtime issues found. Deferred minor:
the context-loss test should assert deletion of the specific illustrative texture
handles; its current aggregate deletion count also includes other resource owners.
Actual cleanup is present and was reviewed; stronger regression isolation remains
open. GPU appearance, native behavior, mobile memory and lab visual parity were
not qualified by this review and remain release gates.
