# Native optical program correction — 2026-11-03

Status: locally verified correction with native numerical, repeated end-to-end,
browser and coverage evidence. Broader production qualification remains open.

Requirements: `SOL-VIS-006`, `SOL-UX-003`, `SOL-TEST-001`, `SOL-COV-001`.
Governing specification: [physical rendering RFC](rfcs/0005-physical-rendering.md).
The [implementation plan](superpowers/plans/2026-11-03-profiled-optical-programs.md)
records the source/profile and resource invariants.

## Cause and measured scope

The initial [readiness investigation](PRODUCTION_READINESS_20261103.md) found
intermittent native physical-program failure on Qualcomm Adreno X1-85 / ANGLE
D3D11. An instrumented unchanged staged app remained visible and polled with a
maximum 237 ms gap. Its physical sphere completed after 39.6 seconds; its
scattering generator remained incomplete after 45 seconds. This distinguishes
that observed failure from a missed requestAnimationFrame deadline or hidden tab.
The production 30-second compile deadline correctly withheld the failed programs.

The generic fragments include different branches for the equal density scale
heights in the admitted Mars profile and unequal heights in the Earth profile.
Resolving that known predicate before compilation substantially reduced the
observed compilation cost. No density value, coordinate, transfer formula,
quadrature node, texture dimension or numerical tolerance is changed.

| Full-app diagnostic | Physical sphere | Atmosphere shell | Generator |
| --- | ---: | ---: | ---: |
| Generic native source | 39.6 s | 15.4 s | incomplete at 45 s |
| Earth predicate resolved | 2.7 s | 1.3 s | 10.5 s |
| Mars predicate resolved | 12.6 s | 5.3 s | 27.7 s |

These are individual local characterization runs, not calibrated benchmarks or
cross-device performance SLOs. A dynamic-loop-bound experiment did not help
(40.6 s versus 36.5 s original in that comparison), and removing unreachable
helpers alone gave 27.3 s. Neither experimental transformation entered production.

## Implementation and ownership

`physicalProgramSources.js` compares the admitted immutable profile's scale
heights in binary32, matching the actual WebGL uniform representation. It
replaces only the exact equality/inequality predicate and retains the generic
sources as numerical oracles. Unsupported bodies and roles fail explicitly.

The renderer requests six distinct body/role keys and caches completed sets.
The manager's explicit capacity is 13: six base programs, six physical programs,
and one Earth-look program. Its existing context ledger cap remains 32. There
are no new per-frame compilations or automatic retry loops. Failure in an older
profile neither cancels the current profile nor renews its deadline. Queued
atmosphere draws capture their own program/uniform records.

`profiledScatteringTargets.js` dispatches to two existing source-bound owners,
each with capacity one. Total ownership stays at two target groups, each capped
at 65,536 evaluations and 1,048,576 bytes. The existing owner still checks program,
generation, scene serial, epoch, uniform, texture and submission identity. The
adapter rejects cross-body dispatch and stale/substituted frames. Admission
additionally binds the complete serialized profile to the canonical profile
whose source was specialized. Context loss, cancellation and explicit retry
continue through the existing lifecycle.

Actual draw probes now require the matching specialized source. The negative
producer-hold control recognizes both exact source pairs and preserves its
current-program check. Neither probe accepts the generic source as a substitute
for a specialized submitted program.

## Numerical harness correction

The first specialized numerical attempt failed with WebGL error 1282 before
returning comparison results. The older qualification fixture did not bind the
packed RGBA optical companion now required by the shader's ozone/column lookup.
Its default sampler could alias a generated output texture. The qualifier now
prepares the same packed companion and explicitly binds unit 10 in the generator,
reference, specialized consumer and shell programs. It rejects a missing companion
and devices with fewer than eleven fragment texture units before drawing.
The qualified science formulas and thresholds were preserved.

The snapshot copier also resolves release cache-token queries to their real
filesystem paths while preserving the imported module bytes and hash checks.
Other queries or fragments are rejected. This was necessary when following the
new source helper's transitive dependencies in an immutable staged release.

## Verification observed

- Source/key/owner/body-switch tests pass, including pending Earth to Mars,
  both bodies submitted in one frame, returning to cached sources, older-profile
  timeout isolation, stale frame rejection and disposal.
- The independent read-only review reported no actionable P0/P1/P2/P3 defect and
  independently passed 96 focused source, lifecycle, HDR, context, owner and probe
  tests. It did not perform the GPU qualification itself.
- The complete native numerical matrix passed: **21 cases, 5,592 original queries
  plus 1,600 terrain-height queries, including four negative controls**. There
  were zero unexpected failed queries; every atlas and domain-coverage gate passed.
  The original absolute/relative scattering, transmission, zero-leak and display
  tolerances remain unchanged. This compares the renderer's interpolation/transfer
  with the retained GPU integrator; it does not establish astronomical or
  photometric calibration.
- The first full staged native run passed actual source-bound Earth/Mars optics,
  both level-4 terrain meshes, context restoration with decoded nonblank output,
  source playback, galleries, narrow viewport, Mars optical animation and matching
  HDR final draws, within the original 240-second run deadline.
- Three further native runs passed the same complete gate. Two used the same
  final staging bytes; the last used the restaged signed-zero identity correction.
  Every receipt reports zero source differences, page errors and console errors.
- The final adapter compares same-serial epochs with `Object.is`, matching the
  existing owner even for signed zero. Its new regression failed before the
  correction and passed afterward; independent follow-up review passed nine
  owner/fixture tests with no actionable finding.
- Current full Node execution: **1,420 tests passed**. Node-only coverage is
  **98.31% lines, 91.26% branches and 96.27% functions**, exceeding all 90% floors.
  Fresh merged whole-web line coverage is **97.54%**, exceeding its 90% floor.
  TypeScript checks pass for 124 files; static web, governance, UX structure,
  documentation and diff checks pass. All 26 release-artifact and one served-release
  Python regression tests passed.
- The final staged Chromium browser suite passed the existing Sun, Earth, camera,
  rotation, planetary appearance, transit-shadow and eclipse assertions on
  observed SwiftShader, with complete source-bound coverage mapping.
- The native Earth-optics and Mars-terrain captures compared with the earlier
  passing generic native captures are byte-identical PNGs, not merely visually
  similar. This comparison is bounded to those two static scenes.
- Direct byte comparisons against HEAD confirm the four generic atmosphere
  source/profile modules and all three binary ephemeris coefficient tables are
  unchanged. The comparison hashes are retained locally.

## Candidate and retained evidence

The base revision is `3a55a795767f3043112673ea561cdaf6dc7e2d0f`; all corrections
remain uncommitted. Per-file source/staged hashes identify the actual dirty-tree
candidate rather than implying correspondence to the base commit alone.

The final staging directory is `build/production-20261103-profiled-identity-site`,
release ID `local-production-profiled-identity-20261103`, manifest SHA-256
`72a1accc264eb88e0eac8bb72837334f3f8aac28774d43667e2fcb1358fc3e08`.
The first native run used an earlier staged candidate. Subsequent changes added
the two modulepreload declarations and the signed-zero adapter guard; the
specialized shader sources are identical across all four native runs.
Runs two/three used manifest
`3092dfebf0cbf27208c1b5b51f05c77c0c7ecc0ee158d0144496dfb003d092de`;
the final run adds only the tested signed-zero adapter correction to that runtime.

Evidence remains ignored under `coverage/production-20261103-*`: startup timing,
compile-only experiments, `profiled-scattering-3`, `profiled-native-1/2/3`,
`profiled-native-identity`, `profiled-identity-browser`, `profiled-identity-combined`,
`profiled-frame-comparison.json` and `reference-identity.json`. The
numerical run copied the fixture before the final ten-versus-eleven-unit rejection
guard was strengthened; its observed hardware already has more than eleven units,
so this does not change its executed numerical path. Separate fixture regressions
prove the strengthened guard and missing-companion refusal.

## Remaining qualification and rollback

The bounded shader-startup correction is locally verified on the observed host.
Broader cross-platform, physical mobile, accessibility, source
provenance, independent astronomical evidence and release qualification from the
initial report remain open. No commit, push, hosted workflow, release, dependency
installation, external acquisition or production setting was changed by this fix.

Rollback reverses only the profiled-program helpers, renderer integration,
associated probe/qualifier changes and tests/docs. Preserve the earlier moon-time
and framing corrections. Do not regenerate reference tables or lower a deadline,
resource budget or numerical tolerance as a rollback workaround.

## Reproduction commands

Use the installed locked tooling and explicit local staging roots. The native
command retains the original deadlines and all source, terrain, optics and HDR gates.

```text
node --experimental-vm-modules --test tests/web/physicalProgramSources.test.mjs tests/web/profiledScatteringTargets.test.mjs tests/web/profiledPhysicalLifecycle.test.mjs tests/web/scatteringValidationFixture.test.mjs
node tools/scattering_validation.mjs --web-root=build/production-20261103-profiled-site --out=coverage/NEW-NUMERICAL-RUN --profile-specialized --terrain-v2-explicit-height --backend=native
node tools/physical_rendering_validation.mjs --web-root=build/production-20261103-profiled-identity-site --out=coverage/NEW-NATIVE-RUN --backend=native --context-loss --mars-optical-animation --terrain-close-detail
node tools/browser_validation.mjs --web-root=build/production-20261103-profiled-identity-site --output-dir=coverage/NEW-BROWSER-RUN
node tools/check_node_coverage.mjs
```

Select new output directories; do not overwrite retained evidence. The browser
command requires `CHROME_BIN` on this Windows host. Local Node 24.18.0/Chrome
156 and native Adreno observations do not replace the full pinned CI/platform matrix.
