# Linux software-browser validation — 2026-11-06

All 16 steps of the corrected native Linux ARM64 browser campaign pass against the
same immutable artifact previously tested on Windows. The existing software-rendering,
interaction, GPU and coverage gates remain intact. Application code, scientific
calculations, coefficient bytes, both WASM modules and Illustrative Earth are unchanged.
This is local platform evidence, not full production or release acceptance.

## Frozen artifact and environment

The selected artifact is `build/lgpl-component-20261106-01/site-final`, release
`local-lgpl-20261106-02`, with manifest SHA-256
`4bbebdd5324bae5886933efb5cd09d4f4387e3d4afea0d4ae512f7f7ee41b41a`.
Its 238 files, including the complete source archive and 236 inventoried assets,
remain unchanged throughout the run. The manifest's Git SHA is the dirty
checkout's lineage; it does not attest a new committed revision.

The environment is native Linux ARM64 under WSL2, with Chromium 156.0.8078.79,
Node 22.23.4 and Python 3.12.14. The browser image extends the preceding pinned
Linux QA image and pins the Debian Chromium package version. Package versions
and critical executable/library hashes are retained. The actual application
contexts identify ANGLE/Vulkan SwiftShader; launch flags alone are not treated
as proof of a backend.

Actual tests use no external network, a read-only root, read-only source/stage
mounts and read-only locked dependencies. A fresh invocation directory is exposed
at `/out` and the ignored `coverage` location for generated evidence only. It
does not make application source writable. Six CPUs, 8 GiB memory, a 1 GiB shared
memory area and explicit process/deadline limits bound the owned container.
Its browser profiles and cache remain in temporary container storage.

All 1,688 source inventory entries and Git status remain unchanged during the
campaign. All 3,074 dependency file/symlink entries match the pinned image's
installation and remain unchanged. The source lock matches that installation.
The exact invocation-owned container exits zero and ID-specific readback confirms
absence after normal cleanup.

## Completed checks

| Existing check | Recorded result |
| --- | --- |
| Staged manifest and runtime prerequisites | Pass; exact selected manifest and installed runtime versions |
| Browser smoke | Sun, My Sky and interactive 3-D Solar System pass |
| Complete browser rendering/coverage command | Original Sun/Earth, physical spin, moon-shadow, orbit-guide, keyboard, tour and reflow gates pass; all 22 selected producer hashes match |
| Trusted touch follow-up | Seven scenarios pass; zero errors/off-origin requests and context closure verified |
| Sky workflow | Nine groups pass, zero errors, one local mock request and zero redirect-target requests |
| Experience workflow | 24 groups pass, zero captured page errors |
| Planet appearance | 110/110 GPU checks pass |
| Ring appearance | 11/11 GPU checks pass |
| Atmosphere transfer | 1,172/1,172 CPU/GPU numerical checks pass |
| Terrain illumination budget | Both 4,753-vertex and 74,305-vertex meshes pass; all 4,753 shared points agree exactly |
| Terrain shadows | 32/32 GPU checks pass |
| Solar appearance | 28/28 GPU checks pass |
| Planetary observations | Eight checks pass |
| Integrated physical rendering | 19 groups pass, including source playback, galleries, mobile geometry and actual graphics-context loss/recovery |
| Complete Node suite during runtime coverage collection | 1,534 tests pass; zero failures, cancellations or skips |
| Combined hand-written web runtime coverage | 17,907/18,354 lines = 97.56%, above the unchanged 90% floor |

The combined denominator retains browser-only modules at zero until execution
contributes hits. Browser-only coverage is 85.70%; it is not presented as a
standalone 90% pass. Generated catalogues retain the existing explicit exclusion
policy; hand-written runtime modules are not removed to raise the percentage.

The fixed raw-position microprofile retains 300 pairs and four-times CPU
throttling. Raw p95 is 7.3 ms under the existing 16 ms cap; JSON p95 is 22.3 ms.
This supports the existing fixed-nine-body raw-position exception in this
environment. It is not a whole-app frame-rate, physical GPU or general device SLO.

The context-loss case observes a new restoration event and application callback,
329 live replacement-context draws and a nonblank restored terrain frame. Terrain
and optics become ready within the original 40-second bound from the request.
No shader, WebGL, page or console error is accepted as successful recovery.

The saved Earth capture shows the preserved NASA July 2004 Illustrative recipe,
including its display exposure, historical cloud layers and cloud-depth treatment.
Source-qualified remains a separate tested choice. Captures and numerical GPU
comparisons do not qualify observed weather, calibrated photometry or new orbital
accuracy.

## Retained first failure and correction

The first invocation passes the smoke, complete browser/touch, Sky, experience and
planet gates, then exits one before the ring GPU launch. The ring validator
correctly rejects `/out/results/ring-appearance` because it requires output beneath
the repository's `coverage` directory. Its original output-root and fresh-directory
guards remain unchanged.

Versioned controllers instead bind the new invocation directory at the ignored
coverage location and route auxiliary output beneath it. The complete corrected
campaign is rerun in order; it is not assembled by relabelling the failed cohort.
Neither a threshold, validator, shader nor application file changes. Both invocations
retain their own source maps, command logs, results and normal absence observations.

The existing frozen renderer studies and historical intermittent focus, overlap,
performance and export-Cancel failures keep their original identities. This finite
passing campaign does not establish a cause for an older intermittent failure.

## Evidence, documentation correction and remaining scope

The ignored evidence root is `build/linux-browser-20261106-01/`. Its accepted
invocation is `controllers-v2/invocation-6a51264aa37f4772be41886de66abb5f`.
The closure binds all 16 step results, 564 retained artifact hashes, the complete
source maps, the 238-file stage, dependency correspondence, actual backend,
screenshots, GPU cases, raw performance samples, coverage and terminal cleanup.
Historical controllers and retained fixed-output experiments must not overwrite
their earlier cohorts on reuse.

The release-evidence paragraph in the validation plan also required correction.
It described protected profile/acceptance/freshness/settings checks as normal Pages
checks. Both actual Pages checks invoke `--publish-master`, and the release guide
already distinguishes that identity/rich-evidence path from protected evaluation.
The corrected wording keeps full production/manual/scientific requirements and
served-byte verification explicit. No workflow, permission or eligibility predicate
changes.

This report, the status update and that paragraph are documentation changes after
the closed campaign. Their preceding source bytes are retained separately, so
the old cohort does not acquire later documentation hashes.

Native hardware graphics, Linux x86_64, other browser engines, physical devices,
assistive technology/manual acceptance, current-source hosted CI and served-release
verification remain outside this result. The retained Google Cloud job still needs
its own result retrieval. The approved 1900–2200 target and approximate exploration
outside it remain unchanged. No commit, push, publication, deployment or licence
scope expansion occurred; the overall production-readiness goal remains active.
