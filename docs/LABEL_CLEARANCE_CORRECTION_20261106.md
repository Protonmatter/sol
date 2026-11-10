# Fractional label-clearance correction — 2026-11-06

The scene-label packer now measures fractional DOM rectangles instead of integer
offset sizes. A rounded-down width or height could leave less than the required
clearance even when the packing algorithm's own boxes were separated. This is
distinct from the [reduced-motion transition defect](REDUCED_MOTION_CORRECTION_20261106.md).
Both corrections remain in the final candidate.

The application change is limited to the label measurement in
`apps/web/js/orrery.js`. Projection, occlusion, priorities, 14/24 caps, body
coordinates, physical sizes and orbit calculations are unchanged. The renderer
already resets label transforms before measuring; the fractional rectangles are
CSS-pixel dimensions in the existing batched measurement phase. Illustrative
Earth's shaders, textures and display recipe remain unchanged.

## Reproduced boundary and regression

A retained Chromium scene reports Earth's label at **27.453125px** wide while its
integer `offsetWidth` is **27px**; Mars reports 25.96875px and 26px respectively.
The production `updateLabels` function, exercised with these measurements and two
declared projected anchors, originally places the second box four pixels after
the rounded first box. Actual horizontal clearance is only **3.546875px**.

The new unit group executes the actual production function and actual packing
algorithm. It checks actual rectangle separation and requires both labels to
remain visible. One case uses those measured widths; a separate case explicitly
constructs a fractional 15.453125px line height to check vertical rounding. Both
cases fail against the retained original renderer and pass after the correction.
The existing 3.9px acceptance allowance for a four-pixel target remains unchanged.
All 18 focused projection/layout/occlusion groups pass.

The first complete Node run also exposed inconsistent test geometry: the Orrery
fixture declared label offsets of 70×16 but inherited generic 240×60 rectangles.
Only scene-label spans now report rectangles consistent with their existing
fixture dimensions and assigned positions. Generic controls and canvas geometry
are untouched. The original Venus-readable assertion remains, passes in the
48-group focused run and passes in the fresh full suite. The failed full run and
its exact prior fixture remain separate from accepted evidence.

## Final candidate and local validation

The stage is `build/fractional-labels-20261106-01/site`, release
`local-fractional-labels-20261106-01`, mounted at `/sol/`. Manifest SHA-256:

`b5dc19f64e620eef6720a6cc489b767b70df60e572c2902160ddf2f7d5dcc879`

All 208 source owners remain. Only `apps/web/js/orrery.js` changes from the accepted
reduced-motion candidate. Its existing scientific inventory membership correctly
changes both science and UI fingerprints. Both WASM binaries, numerical data,
textures and the corrected stylesheet remain identical. This dirty local stage
does not establish a clean release correspondence to its base Git commit.

| Check | Result |
|---|---|
| Complete native and SwiftShader browser validation | Both pass all original gates, the permanent orbit-guide pixel regression and immediate reduced-motion placement. |
| Original experience workflow | All 24 groups pass, with no browser errors; 17/24 desktop and 12/14 mobile labels meet actual bounds and clearance checks. |
| Original raw-position microprofile | 300 pairs at 4x throttle: **6.3ms p95**, below the unchanged 16ms p95 cap; max 19.2ms is retained and is not claimed below 16ms. |
| Sky workflow | Nine groups pass, no errors, one deliberate mock request, zero redirect-target requests. |
| Full Node suite | **1,515 pass**, zero failures/skips/cancellations. |
| Independent Node coverage | **98.34% lines, 91.32% branches, 96.41% functions**; all unchanged 90% floors pass. |
| Fresh Node/native-browser coverage | **97.57% runtime lines**, above the unchanged 90% floor, with every hand-written runtime module retained. |

Exact sources, before files, red/green logs, failed/full cohorts, staged comparison,
coverage and independent review are retained under
`build/fractional-labels-20261106-01/`. The preceding CSS report and its source
snapshots are preserved. No failed test was relabeled or excluded from its cohort.

## Limits and rollback

The numerical WASM studies' 52 System and 45 Sky input hashes still match. No new
astrometric samples or accuracy guarantee follow from label placement. The
1900–2200 target, approximate exploration outside it and independent Earth-rotation
limits remain unchanged.

These finite local checks do not prove continuous visibility, all font/device
combinations or an every-call performance bound. The earlier focus failure and
22.1ms diagnostic outlier remain retained without a unique-cause claim. Current
passing workflows do not grant hosted, manual/accessibility, cross-platform,
notice/distribution or served-release acceptance. The existing Linux result is
still not retrieved; no replacement VM job, licensing change or deployment occurs.

Before copies preserve the renderer, projection test and prior test fixture.
Rollback uses only these measurement/test hunks and leaves the separate CSS
correction and unrelated working changes intact. No commit or push occurred.
