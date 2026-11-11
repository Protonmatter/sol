# Attached System labels implementation plan

Goal: implement the first label-policy correction from the November 10 structural review, on baseline 02aaec8. Suppress detached scene labels while retaining catalogue/search access.

Architecture: keep the existing pure label layout boundary. Admit only finite, on-screen anchors; place a label in one of four adjacent positions, in existing priority order. When none fits, suppress it rather than relocating it into a corner list. Preserve clearance, density limits and input immutability. The browser acceptance helper must independently check attachment as well as non-overlap.

Scope: no orbital data, focus geometry, cache token, startup source, shader or catalogue changes. Rust speed conversion is covered by the subsequent Sky presentation batch.

- [x] Replace obsolete overflow expectations and add on-screen edge, crowded, reserved-header and offscreen regressions in labelLayout.test.mjs; update labelProjection.test.mjs to require hidden anchors to clear.
- [x] Run regressions and confirm failures before removing fallback placement in labelLayout.js.
- [x] Add browser acceptance cases for missing/nonfinite/out-of-view anchors and detached labels. Capture CSS-space projection coordinates in readSystemLabelLayout; check distance to label rectangle with DOM rounding tolerance.
- [x] Run focused tests, then npm test, applicable static/type/documentation validators and diff review. Record unavailable staged-browser checks; do not claim visual acceptance from unit tests.

Review focus: selected objects at each viewport edge; focused moons offscreen; collisions within Saturn's system; jump controls occupying the top inset; fractional canvas geometry. Search remains the alternative when the stage cannot display a name.

Implementation notes: the full suite exposed two additional obsolete overflow-label expectations in orreryCoverage.test.mjs. These now verify that planets and every catalogue moon remain accessible, and that moon selection still works when labels are suppressed. The fractional text regression permits suppression when an adjacent placement cannot satisfy clearance; visible labels must still respect the measured fractional bounds. No physics or camera state changes are introduced.

Initial validation: targeted runtime checks passed (37 tests); all 139 application JavaScript files typecheck; static web, accessibility structure and this document's reference/style checks pass. Initial full JavaScript suite: 2,113 passed, zero failed (`npm test`).

Subsequent staged validation passed for Sun, Earth and Saturn at 1440px and 390px widths, checking attachment, clearance, bounds and density with no page errors. The browser checker accounts for the half-pixel difference between integer client dimensions and fractional canvas bounds; a regression still rejects a 9px attachment gap. See the [current remediation status](../../structural-remediation.md) for combined validation and remaining work.
