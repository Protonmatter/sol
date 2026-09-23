# Dynamic Sun acceptance ledger

This ledger describes the **R4 smooth-quiet/attachment candidate** submitted for review,
not a release decision. **Stage06 model and source browser validation passed;
the combined appearance target remains NOT accepted.**
The original 2026-09-23 plan is unchanged. Requirements remain `planned` in the
governance registry until complete acceptance and merge, even where implementation
and local tests are present. Numeric assertions concern an illustrative model.

## Current candidate and evidence status

Final generated active/quiet packs exist under `build/solar-dynamic-r4-final/`.
The core workstream reports public Python/Rust admission for both, 35 resource
records per scene. Each has 25 L32 geometry keys, corrected 64³/96³ fallback
volumes with separate diffuse-only backgrounds, and 2048×1024 t0/t900 linear
surface references. The base surface aliases the exact t0 reference bytes with
transfer identity `hierarchical-euv-linear-v1`. Generated manifest and producer
identities are recorded in [DYNAMIC_SUN.md](DYNAMIC_SUN.md).

The accepted component choice for integration is the smooth quiet transform.
That decision is not observational, photorealistic, device or release acceptance.
The current browser evaluates the surface analytically from the admitted
attachment packet, draws analytic strands with a diffuse-only background, and
does not sample the 2K reference map or stream/re-solve the 25 PFSS geometry keys.
Initial connectivity is advected/sheared; local pulse descriptors supply motion.

Final immutable artifact `local-dynamic-sun-06` has release-manifest SHA-256
`d9350b523b79de7be00c110cea7895587adbccd4cf1ceeadbf289827a7aa1730`.
The actual model and archive harnesses each passed six checks with no errors.
The responsive model check explicitly established readiness. Native Adreno/D3D11
cadence measured 301 frames in five seconds, p50/p95 approximately 16.7 ms;
this is not endurance or physical mobile testing. Final sampled hierarchy
CPU/GPU maximum absolute error is `6.1600864846855785e-6`.

The Blender common-endcap loss was corrected and its axial/overlap/orientation
fixtures pass. All four final views and the editable beauty companion are
retained in the 336-artifact hash inventory. Same-time t900 back pulse/control
passes with no surface change; front zero signal is retained and explained by
opaque-body occultation, not relabeled as a positive pulse detection.

The browser and Blender still show broad rounded dark masks and a few isolated
smooth bright arcs. They do not meet the requested irregular connected emission
and dense varied loop-family appearance. Numerical and reference checks do not
override this visual rejection. The [final handoff](DYNAMIC_SUN_HANDOFF.md) records
the decision and diagnostic artifacts.

## Requirement ledger

| Plan ID | Implemented behavior and available evidence | Remaining acceptance |
| --- | --- | --- |
| SUN-01 | Cartesian/full-sphere hierarchy, stage06 views and actual front/limb/back/north Blender references. Analytic surface has no 512-grid dependency. | Appearance explicitly unaccepted; exhaustive pole/seam and morphology acceptance remain open. |
| SUN-02 | Separate illustrative EUV/visible, 121-frame source-facing archive and retained legacy paths. Stage06 model and source harnesses each passed six checks. | Manual user acceptance and broader interaction matrix. |
| SUN-03 | Visible Planck-relative contrast/limb law; R4 linear analytic emission and fixed endpoint budgets. Final sampled hierarchy CPU/GPU maximum error 6.1601e-6. | Calibrated instrument response is absent; scoped numerical parity is not visual acceptance. |
| SUN-04 | Bounded absolute clock, Carrington frame and differential advection; stage06 time-change and pause checks pass with independent source/orbital clocks. | Camera-matched whole-image Blender/browser parity is not claimed. |
| SUN-05 | Distinct visible granulation and EUV hierarchy; final shader samples and fixed-camera time-varying pixels verified. | Rounded masks/isolated arcs remain unaccepted; no observed cellular calibration. |
| SUN-06 | PFSS curves, gains, local pulses and fixed anchors; subdivision preserves disk budgets. Same-time t900 back pulse/control passes with surface difference zero. | Initial browser topology and 25 offline-only keys remain limitations; no streamed topology, MHD or accepted loop-family richness. |
| SUN-07 | Analytic strands, occultation, ordered sheet transfer and corrected CDF fallback. Blender common-endcap correction passes its scoped fixtures. | Exact curved-cell clipping and arbitrary partial-overlap qualification remain absent; sheet is not non-LTE synthesis. |
| SUN-08 | Immutable archive/frame identity, stage06 asset verification, strict source/packet admission and producer receipts including the deposition helper. | AIA quality-bit interpretation and provider display-transfer calibration remain unqualified. |
| SUN-09 | Seed/time recipes, independent ABI, UTF-8 admission, fixed anchors, fresh producer identity and staged matching resources. | Wider cross-device floating-point and fresh-machine qualification. |
| SUN-10 | Analytic display-pixel surface, visible close-up and playback filtering; offline 2K Gaussian area tests pass scoped nonpolar cases. | Near-polar raster error up to 3.44% remains unqualified; peak/filter fidelity and full scale/rate matrix pending. |
| SUN-11 | Stage06 play/pause/scrub/end/restart, reduced-motion transitions, navigation and held source pixels/time pass; live-policy RAF guard regression covered. | Physical touch and screen-reader manual checks. |
| SUN-12 | Bounded loads/cancellation/frame ring and generation ownership; stage06 context-loss restoration retains verified resources and stays paused. | Wider driver/failure matrix and long-run resource instrumentation. |
| SUN-13 | Resource caps and quality variants; stage06 model ready at 390-pixel viewport. Native five-second run: 301 frames, p50/p95 16.7 ms. | Physical iPhone/Safari and two-/ten-minute thermal/memory qualification have not occurred. |
| SUN-14 | Scalar accumulation before palette, isolated HDR, stage06 exposure/corona-free disk checks and final four-view Blender palette checks pass. | Complete bloom/exposure/overlap matrix across additional native devices. |
| SUN-15 | Corrected Cycles common-endcap handling; four final views, raw EXRs, editable verified beauty companion and 336 indexed artifacts. Back t900 local pulse passes; front zero signal correctly occulted. | Visual target remains unaccepted; camera-matched image parity, arbitrary partial overlaps and complete cool-sheet/cutaway references remain open. |
| SUN-16 | Explicitly schematic cutaway remains separate from observed imagery; local regression coverage preserved. | Manual educational/accessibility acceptance. |
| SUN-17 | 1,360 Node tests, 229 Rust tests, separately passed offline qualifications, and local Python/gate results recorded below. | Full Python rerun after the last Blender-only fix, broader browser matrix and hosted CI. |
| SUN-18 | Stage06 identity, actual asset readback, before/after admission, science fingerprints and whole-release rollback policy verified locally. | No publication, hosted delivery, deployment or operational rollback rehearsal. |

## Numerical evidence that does not imply complete acceptance

- Attachment tests cover masks contributing zero emission, no old-center pedestal
  after moving a group, fixed core/structure budgets, width independence from
  envelope extent, valid anchor/endpoints and bit-identical disk values under
  geometric subdivision. They do not infer plasma heating or measured topology.
- The Gaussian helper's twelve interior grid/width/alignment cases retain
  0.9999982800915547–0.9999982800915550 of target mass. The omitted fraction is the
  declared five-sigma tail; shell/box losses are separate and never renormalized.
  Nine helper tests and three core integration tests are reported passing.
- Active 64³ float32 total-minus-background reintegration was reported within
  8.67e-9 relative to the declared retained strand mass. This does not qualify a
  coarse volume as a high-resolution coronal image.
- The 2K reference map's 0.0035 R Gaussian integrated-area test passes scoped
  0°/45°/75° latitude cases within approximately 4e-7. Near-polar and peak-value
  reconstruction acceptance remain open. The browser uses analytic attachment
  evaluation rather than this reference texture.

## Final local checks and retained limits

| Check | Recorded result |
|---|---|
| Node | 1,360 passed, zero failures; `build/dynamic-sun-final/node-tests-final.log`. |
| Python | Full 446 tests plus 1,555 subtests passed before the last Blender alias-metadata fix; targeted Blender helpers subsequently passed all 14 tests. This is not a claim of a second full-suite run. |
| Rust | Workspace 229 passed; two default-ignored offline qualifications separately passed in release mode. |
| Static/tooling | Formatting, clippy, 127-file web typecheck, static-web, UX and governance passed locally. |
| Actual browser | Stage06 model and archive harnesses each six checks passed with empty error arrays; the model responsive state was ready. |
| Actual GPU | Final sampled hierarchy maximum absolute error 6.1600864846855785e-6; GL error zero. |
| Blender | Common-endcap correction fixtures, four-view palette checks and same-time back pulse-locality pass; 336 artifacts indexed with appearance accepted explicitly false. |

The next acceptance work is visual morphology and wider qualification, not another
label change on these results. Retain the front pulse's zero-signal case and the
scope of the tested overlap correction. Physical device/thermal tests, hosted CI,
deployment and operational rollback have not occurred. Any new recipe or rendering
change needs fresh source-bound numerical and visual checks; existing passes do
not transfer merely because paths or dimensions match.

Commands, scientific assumptions and reproduction are in [DYNAMIC_SUN.md](DYNAMIC_SUN.md).
The [final handoff](DYNAMIC_SUN_HANDOFF.md) records the decision, exact identities
and diagnostic evidence. Neither generated-product admission nor a passed
transfer equation establishes observational realism or deployment readiness.
