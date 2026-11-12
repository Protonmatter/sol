# Structural Completion Implementation Plan

> **For agentic workers:** Use executing-plans for ordered integration and dispatching-parallel-agents only for independent, explicitly owned files. Track results here and in the remediation status document.

**Goal:** Resolve every remaining recommendation in the structural review with implemented behavior or an evidence-backed disposition, and verify the integrated application.

**Architecture:** Retain the Rust numerical engine and browser modules. Establish explicit coordinate, camera, frame scheduling, presentation and release-loading boundaries, preserving physical data, lifecycle recovery and release provenance. Integrate stages in the requested order.

**Tech Stack:** Rust/WASM, JavaScript browser modules, Python release tooling, Node tests, Chromium acceptance.

**Spec:** [Structural remediation status](../../structural-remediation.md); original review in `/workspace/sol-review/SOL-structural-review.md` on the authoring workstation (not retained in this repository; see the status report's evidence retention section).

## Global Constraints

- Preserve existing local fixes and scientific precision boundaries; never silently extend qualified epoch coverage.
- Preserve geometric horizon and compass-map orientation consistently.
- Keep Sun startup lazy, worker memory isolated, failures retryable, and source distributions bound to staged bytes.
- Use focused failing regressions before behavior changes; run the integrated suites and staged browser checks after integration.
- Software GL evidence cannot certify physical-device GPU performance. Do not fabricate external comparison or hardware evidence.
- No external publishing, deployment or shared-branch mutation is required by this task.

## Review Focus

- Epoch/RA seam/pole alignment and absent optional server metadata.
- Body versus satellite camera framing, picking and scale consistency.
- Hidden views, context loss, rapid input, worker cancellation and retry.
- Immutable release paths, offline cache and corresponding-source integrity.
- Unsupported scientific epochs, device limits and degraded presentation retain honest labels.

## Task 1: Coordinate and display contracts

Files: `crates/solar-ephemeris/src/lib.rs`, `apps/web/js/sky.js`, new shared frame helper, `apps/web/js/orrery.js`, camera policy helper, focus controls and their tests.

- [x] Test constellation/star epoch alignment, seam/poles, server metadata absence; implement engine-derived reduction consumed by Sky.
- [x] Test Earth/Saturn body framing separately from satellite systems and true scale; implement explicit focus policy shared by extent/scale consumers.
- [x] Run focused Rust release and browser-module tests; review both changes together.

## Task 2: Frame and presentation ownership

Files: `apps/web/js/orrery.js`, new frame scheduler and label presenter, existing presenter helpers, related Node tests.

- [x] Test pointer-burst coalescing, cancellation/hidden view and redraw during frame; centralize pending-frame ownership.
- [x] Test stable label metrics and font/resize/text invalidation; extract measurement and placement presentation.
- [x] Separate render preparation/results from inspector presentation; remove duplicate unchanged presenter work and hot-path synchronous diagnostics.
- [x] Verify lifecycle suites and record input/frame instrumentation separately from snapshot latency.

## Task 3: Loading and build ownership

Files: module graph/build tooling, worker clients/engines, new WASM broker, catalogue/texture loaders and tests.

- [x] Reject multiple URL identities for one application module; canonicalize imports and generate release identities.
- [x] Bundle view entries with shared chunks while preserving worker entries, lazy loading, manifests and offline behavior.
- [x] Compile WASM once per release/session and clone compiled modules to independent worker instances; test failure/retry/restart.
- [x] Load catalogues by actual demand and bound image decode, upload and residency. Compare bytes/request counts; only use binary/alternative image formats if justified by measurements.
- [x] Run graph, build, release, worker, catalogue and texture checks.

## Task 4: Quality and presentation

Files: browser layout/styles, rendering-quality policy and renderer integration, accessibility and policy tests.

- [x] Reduce phone header/caveat overhead and enforce readable type while preserving navigation/status/accessibility.
- [x] Add bounded adaptive tiers with hysteresis, deterministic overrides and reduced-motion handling; verify policy and fallback.
- [x] Run staged responsive checks; record physical-device qualification as unavailable unless actual hardware evidence exists.

## Task 5: Scientific and distribution policy

Files: Rust time/EOP model, accuracy evidence contract, moon catalogue policy, scientific documentation and source-distribution tooling as supported by findings.

- [x] Test future-time continuity and quality flags; implement explicit modeled future UT1/UTC assumptions without fabricated observed EOP/leap seconds.
- [x] Support typed independent comparison evidence with exact source/domain/metrics; rerun available committed independent references and report limits.
- [x] Resolve out-of-range moon behavior explicitly; add an illustrative fallback only if a defensible model can be verified, otherwise document why unsupported data remain unavailable.
- [x] Verify differential-rotation attribution against the original source and corresponding-source artifact availability/digests; avoid relocating source without an actual hosting target.

## Task 6: Integrated verification and review

- [x] Run JavaScript, Rust release, Clippy/type/static/documentation checks and immutable WASM/web builds.
- [x] Run broad staged experience and Sky/release checks sequentially to avoid resource contention; fix regressions instead of weakening deadlines.
- [x] Obtain an independent final code review, resolve material findings, update the remediation matrix with completed work and actual limitations.

## Execution ledger

Ruling: continue on the existing feature branch with previous local changes; they are the authorized baseline. No clean/reset operation is appropriate.

Ruling: the user's explicit instruction to complete the remaining work supersedes additional approval checkpoints. Independent Sky and camera work is delegated under the parallel-agent skill; later stages wait for integration.

Pre-flight: Task 1 camera policy and Task 2 scheduler both touch `orrery.js`; execute them sequentially. Task 1 Sky engine metadata and Task 3 broker both touch engine loading; execute them sequentially. Task 3 module canonicalization must follow new module additions from Task 2, and final graph generation must follow Task 4 additions.

Task 1: camera integration passed 50 focused tests; Sky frame/contract/renderer checks passed 70 focused tests, plus native frame parity at three epochs. Evidence under `/workspace/sol-review/stage1-*.md` (authoring workstation only).

Task 2: scattering driver polling removed from normal steady-state, allocation/error diagnostics retained; 33 tests passed after observed red regression (7 polls versus 0 required). Frame/presenter extraction in progress.

Task 2: complete in focused validation: 82 integration tests and 23 scheduler/label/presenter unit tests passed, plus root 33 scattering lifecycle/diagnostic tests. Typecheck green at this boundary. Evidence `/workspace/sol-review/stage2-frames.md` (authoring workstation only). Full integrated suite remains Task 6.

Task 3: implementing three independent areas: module/build/coverage tooling, compiled WASM broker, and catalogue/source-texture demand. Binary catalogue conversion rejected on measured compressed size: moon Float64 payload alone is 23.4% larger than whole JS gzip; star payload plus metadata also grows. Preserve generated full precision JS.

Tasks 3–5 implementation and focused checks complete. Final bundler preserves source-mapped coverage of uncalled code; fresh System static closure is 98→31 modules, 1,113,870→984,506 bytes, while startup union remains 20 modules/74,586 bytes. Final Rust source is frozen and the WASM receipt matches independent evidence bindings. Native replay retains 141 passing and 19 failing deep-time samples; all-samples numerical qualification remains failed by design. Final integration and browser checks are in progress; no physical-device qualification is available.


Final integration — 2026-11-11: deferred first-frame/Retry ownership, stale inspector status and visible observation failures are fixed and independently reviewed. The raw-position gate exposed redundant Earth/Moon solves and repeated TOP/VSOP phase evaluation. Exact reuse plus a dedicated browser build profile preserves scalar and sampled WASM bits. Native/browser panic settings are separated, resolving native Cargo artifact collisions. Final native verification passes 245 tests, Clippy and formatting. Evidence replay retains 141/160 passing samples and all 19 existing failures.

Application artifact `structural-final10` passes the full experience workflow (raw positions 8.8 ms p95 against unchanged 16 ms gate), three-release cache/update checks, dedicated Sky checks and all 25 responsive layouts. Daytime Sky completes within the original worker deadline and retains accessible stars while suppressing plotted stars. Old/new WASM parity covers 324 values, 12 complete System snapshots and nine complete Sky snapshots. The remediation status document records suite counts and targeted reruns explicitly.

The calibrated cold/warm startup diagnostic completed with one demanded ephemeris compilation per page and no lifecycle/source-integrity errors. It does not qualify the 200 ms visible-response target: Inspector probes were 521.7/210 ms and native event durations 736/376 ms. Additional balanced CSS and renderer traces did not justify a speculative style change and exposed substantial presentation wait. This acceptance limit, unavailable physical-device qualification and the existing deep-time numerical failures remain explicitly open; completing the planned implementation/investigation does not mark them passed.
