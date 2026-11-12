# Structural remediation status — November 11, 2026

Implementation on `fix/structural-label-policy`, based on `02aaec8eebfd714fc9000e32fdd4e5d15ec60b91`. This report records local validation; source publication does not grant merge or deployment qualification. The original review and extracted attachment were kept in `/workspace/sol-review` on the authoring workstation; that directory is not part of this repository (see [evidence retention](#evidence-retention)). The [ordered implementation plan](superpowers/plans/2026-11-10-structural-completion.md) records the integration sequence.

## Recommendation matrix

| Review concern | Implementation or disposition |
| --- | --- |
| Detached System labels | Labels require a finite on-screen target and adjacent clearance. Crowded names are suppressed; catalogue/search selection remains available. |
| Sky collisions and daylight | Deterministic collision placement preserves marker positions. Stars, constellation dots and lines fade together with daylight; accessible objects remain. Visibility remains a display heuristic. |
| Constellation epoch/frame | Engine exports its common star reduction matrix. Sky applies it to catalogue vertices and retains known-star proper motion. Native tests cover 1900, 2026, 2200, seams and poles. Missing remote frame metadata explicitly suppresses the overlay. |
| Horizon and orientation | Retain the declared geometric horizon and compass-map convention consistently across markers, tracks, hit tests and labels. A partial refraction or East/West reversal is not adopted. |
| Planet and satellite framing | Shared overview, body, system and true-scale policy drives radii, offsets, camera extent, labels and picking. Body inspection frames globe/rings; satellite-system focus is a separate accessible action. |
| Rendering ownership | One animation-frame scheduler coalesces input, owns cancellation and records bounded CPU timing samples. Label metrics and physical/status presentation have separate owners and invalidation rules. Unchanged inspector text is not rewritten. The lifecycle owner handles the first deferred frame on entry, restoration and repeated Retry, retaining explicit failure state. |
| Raw position calculation | Earth and Moon results are calculated once per epoch. TOP2013 and VSOP2013 reuse identical phase evaluations within each calculation, preserving argument and accumulation order, coefficient binaries, body order and the WASM ABI. Exact old/new WASM output comparison covers 324 Float64 values at 12 epochs. Sparse phase tables are bounded to 33,872 bytes for TOP2013 and 41,344 bytes for VSOP2013. The dedicated WASM profile optimizes the ephemeris crate for speed. Final staged timing verification follows below. |
| Driver synchronization and allocations | Normal scattering submission avoids synchronous error polling; allocation checks and diagnostic mode remain. Projection uploads reuse typed arrays. Texture capability queries are owned by context initialization. |
| Module identity and bundling | Bare application imports have one identity. All-edge validation rejects duplicate identities across view/worker closures. Pinned esbuild emits view/shared chunks, immutable manifests and source maps while preserving optional catalogues and initial startup. Original-source and generated-output hashes bind release fingerprints and coverage. |
| Native/browser build policy | Browser abort behavior and ephemeris speed optimization live in a dedicated `wasm-release` profile. Native release uses default unwinding, eliminating incompatible native test/example artifacts. Receipts name the actual profile and retain strict source/output binding. |
| WASM initialization | A release-keyed broker caches compiled modules; workers instantiate independent memory. Existing startup/compute deadlines include preparation; retry, cancellation and restart remain bounded. |
| Catalogue startup | Full moon/star catalogues load on actual selection, search or galaxy demand. Generated full precision JS is retained because measured binary alternatives increase compressed transfer. |
| Reference textures | Source bytes and dimensions are verified before asynchronous resized decode. Continuous maps cap at 2048×1024; exact palette maps retain their grid. Two decodes, one upload per frame, 32 MiB pending and 96 MiB resident budgets bound application resource ownership. Browser-internal decode temporaries are not claimed bounded. PNG source fidelity is retained. |
| Graphics quality | Auto starts High and uses bounded rolling timing/hysteresis/cooldown. Low/Balanced/High overrides remain deterministic. Hidden, idle and failed frames do not drive adaptation; reduced motion is honored. |
| Phone space and typography | Compact header, touch controls, useful canvas sizing, readable CSS and density-aware canvas text. Secondary explanation uses accessible About disclosures while source epoch, time, errors and recovery stay visible. |
| Provider failure | Redrawing a retained Sky snapshot cannot implicitly restart a failed provider's trajectory worker. Explicit recovery remains available. |
| Future time | Beyond observed EOP, future nominal UTC holds the last leap offset explicitly as an assumption. Endpoint-anchored modeled ΔT derives UT1 continuously, with modeled quality and unknown uncertainty. Server mode refuses unsupported future time before cache/upstream work. |
| Speed units and solar attribution | Speed conversion derives from AU/Julian-year constants. Differential-rotation attribution now names the original Doppler-feature fit; numerical coefficients are unchanged. |
| Independent accuracy | Typed native-vector evidence binds exact source, body, origin, frame, TDB sample, metric and reference. Native replay retains all 160 samples: 141 pass and 19 fail the unchanged budget. Only passing exact samples can be admitted; no continuous interval or numerical WASM qualification is inferred. |
| Out-of-range moons | No unverified long-range propagation is introduced. Dated positions, hits and shadows stay unavailable outside admitted coverage; identities, facts and parent framing remain accessible. |
| Corresponding source | Exact-version source archive stays optional in the immutable release, with portal, inventory and digest validation. Relocation without an actual hosting target would not reduce normal startup transfer. |

See [scientific and distribution dispositions](structural-science-dispositions.md) for original-paper attribution, measured catalogue alternatives, moon-model reasoning and qualification limits. See the [public accuracy page](../apps/web/accuracy/index.html) for retained independent sample results.

## Measured build changes

Final source-to-staged static closure measurements with tree shaking disabled to preserve original-source coverage:

| Static closure | Before modules | Built modules | Before bytes | Built bytes |
| --- | ---: | ---: | ---: | ---: |
| Startup union | 20 | 20 | 74,811 | 74,795 |
| System | 98 | 31 | 1,117,289 | 987,768 |
| Sky | 28 | 24 | 223,055 | 210,235 |
| Research | 40 | 35 | 326,962 | 321,825 |

These are static closure measurements, not network timing or GPU benchmarks. The 16-byte startup difference comes from release stamping. Full catalogues remain outside ordinary System startup. Evidence: `final-bundle-measurement.json` in the authoring workstation's `/workspace/sol-review`, not retained in this repository.

## Integrated verification

Final application artifact: `build/site-structural-final10`, manifest SHA-256 `183befe0b2fbaa0f6ed87f73d385f43a8abeaa6d66578f0931a3ff360b7451b1`, built from the local working changes over the baseline commit. Its engine receipt is `build/wasm-structural-final7`. Final documentation and the corrected startup diagnostic driver follow this application snapshot; nothing is published.

- **Native:** all 245 tests in a fresh full release workspace run pass, with no warnings. Clippy with warnings denied and formatting checks pass. Dedicated browser abort settings resolve the native Cargo test/example artifact collision.
- **JavaScript:** 2,246 cases verified through the full integrated run and targeted reruns. The full run passed 2,244; its two remaining boundary-clock fixtures were corrected to account for the lifecycle-owned first frame and both passed afterward. Subsequent header, evidence and diagnostic changes passed their focused tests. No unresolved JavaScript test failure remains.
- **Python:** 860 repository cases plus 42 server cases verified. Missing-toolchain errors and dependency skips in the initial run were resolved by targeted reruns using the installed toolchain and isolated pinned dependencies. The final build-profile change additionally passes all 88 release-artifact, corresponding-source and receipt tests, overlapping the original suite.
- **Numerical preservation:** old/new WASM comparison matches all 324 Float64 position values at 12 epochs, 12 complete System snapshots and nine complete Sky snapshots. Native scalar oracles also compare exact position/element bits at 30 epochs. These are regression comparisons, not independent astronomical qualification.
- **Evidence/provenance:** native replay and final WASM source-receipt binding pass. Registry SHA-256 is `bf0d3b6a2167af8c9f74f43fc3f0c21faf200412f6440b0149618904ea609597`; scientific-source digest is `87a3db9fda6a4f2d6d297c54e0317db94ed3b92781d3b5b3e38101a797760b21`.
- **Experience:** the complete staged workflow passes. The unchanged 300-pair, 4× CPU-throttled raw-position gate passes at **8.8 ms p95**, versus 45.3 ms in the original workflow. Maximum is 20.7 ms; this is a p95 gate, not a worst-case guarantee. Full JSON p95 is 39.5 ms and remains off the application main thread.
- **Responsive/Sky:** all 25 layouts, six body/system focus comparisons and six coalesced input bursts pass at 320, 390 and 1440 pixels. Daylight has zero plotted stars and 108 accessible stars. Actual Sky request/result times are approximately 1.88 and 1.75 seconds, below the unchanged 10-second worker deadline. Dedicated Sky privacy, cancellation, recovery, focus and reflow checks pass.
- **Release lifecycle:** actual-browser cache/update/offline/integrity-fault checks pass across immutable artifacts 8, 9 and 10. The final build validates exact corresponding source, source maps, module identities and independent evidence binding.
- **Static checks:** 151 application files typecheck clean; static web, UX/accessibility structure and governance checks pass. All 286 Markdown files pass reference/style validation. `git diff --check` is clean.
- **Review:** independent review accepted the coordinate/display policies, frame and presenter ownership, loading/build changes, science policies, lifecycle fixes, build profiles and exact phase reuse. No material finding remains in that reviewed scope.

Primary logs and reports were written to `/workspace/sol-review`, with browser evidence under `build/experience-structural-final10`, `build/structural-acceptance-final10`, `build/sky-structural-final10` and `build/cache-structural-final10`. All of these are local to the authoring workstation and are not retained in this repository.

## Evidence retention

The paths above under `/workspace/sol-review` and `build/` name files on the workstation where this remediation was written. `build/` is ignored by Git and `/workspace/sol-review` lies outside the checkout, so none of those logs, traces or measurement files can be inspected from this repository or from a CI artifact. Treat every figure in this report that cites only such a path as the author's recorded local result, not as retained evidence.

What can be checked from the repository and from CI:

- **Tests and gates:** the Rust, JavaScript and Python suites, the governance, documentation and static web validators, and the coverage gates run in CI on every push and pull request. The run for the merge of this remediation is CI run 43061040875 on `precision/verified-readiness-20261109` at `2d26c8e`; its artifacts (staged site, release evidence, coverage and browser visuals) are kept for 90 days.
- **Independent accuracy:** the 160 comparison records, with reference and native vectors, are committed in `apps/web/data/independent-vector-evidence.json`, and the original Horizons responses are under `tests/fixtures/horizons-vectors-20261104`.
- **Position timing:** the 16 ms raw-position p95 assertion is in `tools/experience_validation.mjs`. No CI workflow runs that tool, so the gate and the 45.3 ms and 8.8 ms figures are local results only.
- **Old and new WASM parity, bundle sizes, responsive layouts and the interaction diagnostics below:** local measurements only. Reproduce them before relying on them.


## Interaction qualification remains open

A calibrated cold/warm diagnostic pair completed on Chrome 156 / SwiftShader, with 4× main-thread CPU slowdown and 200 KB/s shared transfer. It verifies source/artifact stability, worker completion and one demanded ephemeris compilation shared by Sky and System; retained Research data does not require Solar WASM compilation. This is one diagnostic pair, not the required ten-pair qualification or an accepted baseline comparison. Cold/warm LCP was 4,604/872 ms, and the largest assessed feedback across the six exercised tasks was 1,479.2/1,108.8 ms. Broader startup/interaction qualification is therefore also open; these diagnostics do not establish overall performance acceptance.

The Inspector's click processing was 0.7 ms cold and 5.9 ms warm, but visible-feedback probes were 521.7 and 210 ms, and native event durations were 736 and 376 ms. **The 200 ms visible-response target is not closed.** The initial calibration failure and a stale diagnostic assumption requiring unused Solar compilation are retained alongside the corrected successful diagnostic. Six balanced backdrop-style pairs did not show a consistent improvement, so no speculative styling change was adopted.

System inspector DOM visibility measured 0.2–1.2 ms, with the next RAF at 1.1–30.9 ms. These synthetic button measurements do not establish visible paint completion. A desktop Earth input burst still waited about 482 ms for its RAF in software GL. A separate first-opening trace reproduced 743.2 ms frame-probe feedback and 928 ms native event duration. Renderer-main layout/style occupied approximately 175 ms, prepaint/paint 37 ms, and the ScriptDuration metric increased by 57 ms. A GPU-process `SwapBuffers` interval occupied 612.6 ms wall time but only 0.74 ms thread CPU: presentation/synchronization wait evidence, not 612.6 ms of GPU execution. Overlapping thread intervals must not be summed. Neither handler time nor CPU submission is relabeled as compositor completion; native-device qualification remains unavailable.

## Scientific and compatibility limits

The retained deep-time matrix has 19 failures at years 1, 5000, 7000 and 9999; its all-samples numerical gate remains failed. These are existing model limits, with unchanged tolerances and all failed rows retained. Source/WASM receipt agreement proves provenance; sampled old/new WASM equality proves regression parity, not independent WASM accuracy or an all-date bound. Software-GL acceptance cannot qualify native GPU speed, thermal behavior or physical-device fidelity.

The public Rust coefficient structs now include phase-index metadata. External Rust consumers constructing those structs with literals must update their constructors; exported WASM functions and data layouts are unchanged.
