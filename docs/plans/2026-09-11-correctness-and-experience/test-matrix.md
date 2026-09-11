# Test matrix, regression ledger and validation commands

Status: planned tests and gates unless explicitly identified as existing. No test in this document is claimed to have run during plan authoring. Priority labels retain the review's P1/P2 classifications; none is escalated to P0 without new evidence.

Post-authorization implementation evidence is recorded in
[LOCAL_IMPLEMENTATION](../../LOCAL_IMPLEMENTATION.md). The proposed filenames below remain
the original plan; actual test paths are in `docs/requirements.json` and the local reports.
Coverage, scientific, manual and hosted qualification holds are not waived by this matrix.

## Evidence rules

Every case records source SHA, fixed input/clock/seed, toolchain, expected result, actual result, test command, artifact paths and gate. Numerical tests record quantity, frame, units, tolerance and reference identity. Browser tests assert visible meaning and user behavior, not just successful clicks. A screenshot baseline update needs reviewed reasons; never auto-accept a changed image to hide a regression.

U = unit; C = cross-language contract; F = functional integration; B = real browser; V = semantic visual; D = deterministic; X = independent external reference; M = manual. New file paths are proposals. P-number identifies the engineering slice; all findings inherit SOL-TEST-001 and SOL-DOC-001 in addition to the mapped AC requirements.

## F01–F22 finding-to-test traceability

| Finding / source symbol and problem | Impact and recommended correction | Concrete regression and proposed test home | Level / gate / owner slice |
|---|---|---|---|
| **F01 P1** `crates/solar-core/src/flux_transport.rs::advance_flux_transport`, `save_transport_anchor`: endpoint/source progress skips births | Different caller partitions produce different fields; use explicit event ownership and correct next-event progress | `event_ownership.rs` or colocated tests: source at 3600, target 7200, one call vs 3600+3600; sources 0+1800 must differ from only 0; simultaneous IDs, irregular partitions, zero dt, late source and rebase. Compare Br/continuum/confidence and event identities. | U/F/D; Rust + determinism; P02; AC-01 |
| **F02 P1** `apps/web/sw.js` fetch routing, `tools/build_web.py`, engine loaders: tokened WASM can stay cached | Returning clients execute old engine after new release; immediate routing fix then verified manifest transaction | Extend `tests/web/serviceWorker.test.mjs`; new `releaseManifest.test.mjs`; browser A->B engine-only update with unchanged source JS must report B engine bytes. Interrupted B preserves A with offline identity. | U/B/F; artifact/browser; P04/P09; AC-25 |
| **F03 P1** `apps/web/js/render.js::projectRegion`: hardcoded meridian, missing observed registration | Visible geometry disagrees with snapshot; project declared frame and gate observed blend | New `tests/web/solarProjection.test.mjs`: declared central longitude maps to disk center/front, +/-90 to limbs, 180 to far side; nonzero B0/P and registered image control points; absent capture metadata disables blend. | U/V/B; Node/browser; P04/P07/P11; AC-05/06 |
| **F04 P1** `render.js::drawMagneticPatches`: constant glow ignores confidence | Users see unsupported uncertainty; encode actual heuristic score, not complexity | New `confidenceEncoding.test.mjs`: identical geometry/complexity with scores 0.1 and 0.95 gives distinct ordered encoding; fixed score with changed complexity does not change score color/opacity; missing score unavailable. Semantic image/legend assertion. | U/V/B; Node/browser; P04/P07/P11; AC-14 |
| **F05 P1** `panels.js::beginnerCycleInsight`, `config.js` tour, timeline captions: synthetic counts described as current observations | Misleading front-door science claims; derive all explanations from resolved state | New `presentationState.test.mjs`, `solarNarrative.test.mjs`: fixture, stale data, failed image, local simulation and playback; assert headline, counts, legend, time, tour and view-evidence agree and never promote synthetic regions to observed. | U/F/B; Node/browser; P04/P10/P11; AC-13/16 |
| **F06 P1** `.github/workflows/daily-ingest.yml`: generation/dispatch conflated with publication | Feed remains stale despite successful work; explicit rolling-PR lifecycle | New `tests/python/test_delivery_lifecycle.py`: same PR reuse, no-op, approval pending, check failure, merge race, actual merged SHA, deploy failure and served mismatch. Hosted rehearsal separately records the full chain. | U/F + hosted; Python/release; P15; AC-27/28 |
| **F07 P1** release workflows and owner-managed settings: incomplete assurance/manual bypass | Untested source can deploy/publish; complete eligibility and settings verification | New `test_release_policy.py`, `test_release_manifest.py`; extend `test_sdlc_contract.py`: one mandatory failed/skipped/cancelled job rejects, wrong SHA/run/repo/artifact rejects, manual untested ref rejects, stale normal candidate rejects. Verify actual required check separately. | U/F + settings audit; governance/release; P01/P09/P17; AC-26/31/35 |
| **F08 P1** `services/ephemeris-server/server.py::_horizons_params`: Gregorian input meets mixed calendar | Historical request may be ten days wrong; explicit JD/calendar and returned-epoch check | Extend `test_server.py`: 1500-03-01 Gregorian JD2268982.5 versus mixed JD2268992.5, both sides of 1582 transition, leap boundaries, endpoint range and mismatched returned JD. Frozen provider response first, limited external confirmation later. | U/C/X; Python/scientific; P05/P08; AC-10 |
| **F09 P2** `crates/solar-cli/src/main.rs` assimilation and `contracts.rs` fields: scalar covariance serialized spatially | False magnetic uncertainty; solar v3 separates scalar proxy and unavailable magnetic covariance | New `crates/solar-cli/tests/uncertainty_contract.rs`: zero-step scalar update cannot create spatial covariance; default q disabled; P=0.1,q=0.02/day after 2 days yields 0.14; positive-q partition agreement; freshness0 no correction and no score inflation. | U/C/D; Rust/contracts; P07; AC-04 |
| **F10 P2** `crates/solar-cli/src/main.rs` replay: substring validation and replacement | Invalid snapshot overwrites valid output; full validation then atomic copy | New `crates/solar-cli/tests/replay_contract.rs`: missing-field/length mismatch invalid inputs preserve a sentinel output hash; valid alternate whitespace succeeds; interrupted/locked destination returns deterministic failure and preserves old result. | U/F/C; Rust/Python contract; P03; AC-03 |
| **F11 P2** `crates/solar-core/src/json_read.rs` number reader: accepts non-JSON numeric syntax | Cross-language disagreement; implement RFC grammar and duplicate policy | Colocated parser tests + new `tests/fixtures/contracts/json-lexical.json`: reject `01`, `1.`, `-.1`, `1.e2`; accept valid lexical neighbors, bounded exponents and escapes; reject overflow/nonfinite per project policy and duplicate keys. | U/C; Rust/Python/Node; P03; AC-02 |
| **F12 P2** transport vs `contracts.rs` region coordinates: birth location presented as current | Marker drifts from modeled field; preserve birth and supply modeled anchor | New `crates/solar-core/tests/region_geometry.rs`: isolated source at several latitudes, zero and multiday ages, wraparound, one-cell footprint tolerance in specified fixture; immutable birth data and producer/browser projection parity. | U/C/V/D; Rust/browser; P07/P11; AC-05 |
| **F13 P2** `apps/web/js/data.js` series loading / timeline labels: successful-frame compaction | Time labels and butterfly spacing wrong after failure; retain paired records | New `tests/web/seriesIdentity.test.mjs`: months0/12/24 with first/middle/last failure independently; original IDs/months and missing status retained; gap at12 and month24 label correct; next/previous and playback behavior asserted. | U/F/B; Node/browser; P04/P11; AC-12 |
| **F14 P2** `apps/web/js/data.js` solar publication: no guard | Malformed data crashes/misleads renderer; validate raw input before publication | New `tests/web/solarContract.test.mjs`: null, wrong version, missing fields, bad dimensions/coordinates, nonfinite and duplicate text; invalid replacement never mutates last-valid revision; subsequent valid load recovers. | U/C/B; Node/Python/Rust contracts; P03/P04/P07; AC-02/22 |
| **F15 P2** `crates/solar-ephemeris/src/lib.rs::events_core`: endpoint fit extrapolates outside day | Invalid transit time presented as event; bracket genuine culmination or null | New `crates/solar-ephemeris/tests/event_boundaries.rs`: Boston42.36,-71.06,elev10 July2026 each day; July1 Moon original out-of-window case; monotonic synthetic altitude function, start/end roots, polar/no-transit days; all nonnull events in declared half-open day. | U/C/X; Rust/contracts; P05/P08; AC-08 |
| **F16 P2** `earth_orientation.rs::corrected_observer_geodetic`: pole singularity | Valid observer produces invalid latitude/direction; Cartesian rotation | Extend module tests: +/-90, +/-89.999999, longitude quadrants, nonzero xp/yp; finite normalized output, norm preservation and validator acceptance; reference coordinate basis check. | U/C; Rust/contracts; P05; AC-09 |
| **F17 P2** `solar-ephemeris/lib.rs` topocentric range / server quantity20: different meanings | Provider swap changes displayed distance and size semantics; explicit ranges | New `range_contract.rs`, provider/Node fixtures: 2026-07-01T02:13:47Z observer0,0,0 Moon preserves distinct geocentric and observer ranges; zenith/horizon/parallax cases; angular-size and phase tests use correct frame. | U/C/X; Rust/provider/scientific; P08; AC-07 |
| **F18 P2** `tools/{moon_model,generate_moons}.py` equinoctial generation: rounding drift | Full regeneration not stable on observed host; canonical runtime and independent numeric validation | New `tests/python/test_moon_generation.py`: Oberon knot320 JD2461455.5 rounding boundary, two canonical regenerations same digest; at least two host comparisons recorded; full moon residual bounds unchanged. | U/D/X-reference; generation CI; P06; AC-29 |
| **F19 P2** `apps/web/js/orrery.js` position-list update: replaces focused buttons | Keyboard selection lost during animation; keyed in-place updates | New `tests/web/objectBrowser.test.mjs`; real-browser focus test retains same node after ten updates, Enter selects it, filter removal moves focus deliberately, no repeated aria-live announcements. Also cover Sky list. | U/B/M; browser/a11y; P04/P10/P13; AC-19 |
| **F20 P2** `orrery.js` epoch readout: offset years instead of actual rendered time | Displayed date/accuracy differs from geometry; one render instant | Extend `tests/web/orreryTime.test.mjs`; new `renderEpoch.test.mjs`: animated New Year and validity-limit crossings update geometry/date/accuracy in same revision; pause/resume and negative speed. | U/B; Node/browser; P04/P13; AC-18 |
| **F21 P2** `apps/web/js/accuracy.js` broad labels vs sparse evidence | Unsupported accuracy confidence; body/quantity/epoch evidence registry | New `tests/web/accuracyDisclosure.test.mjs`, `tests/python/test_accuracy_evidence.py`: measured sample inside scope, epoch outside, unsupported body/quantity, stale/missing evidence and stars with omitted terms; no validated arcsecond wording outside evidence. | U/C/B/X; science/browser; P04/P08; AC-11 |
| **F22 P2** `package-lock.json` brace-expansion resolution through coverage tools | Development supply-chain exposure; narrow patched lock update | `npm audit` plus locked install/unit/coverage; verify affected dependency resolution and no unexpected runtime/dependency changes. No exploit reproduction; report development scope accurately. | dependency/static/F; supply/coverage; P06; AC-31 |

## Additional hardening and enhanced-workflow coverage

| Case | Setup and expected behavior | Proposed test / level / slice |
|---|---|---|
| H01 assimilation public API | Mismatched observation/forecast/variance lengths, negative/nonfinite variances, zero denominator; typed failure or documented zero-gain, no panic at intake | Core assimilation tests, U/C, P03/P07; AC-02/04 |
| H02 ingest numerical meaning | Mixed record order/old and new sources, escaped metadata, no attributable observations; newest usable scalar selected or explicit synthetic fallback | `test_ingest_transaction.py` plus Rust ingest tests, U/F/C, P03/P15; AC-28 |
| H03 supported reference rate | 14.1844 accepted; unsupported positive/invalid rates rejected consistently | Core grid tests + contract corpus, U/C, P07; AC-05 |
| H04 schema keyword support | Bounds/lengths/timestamp rules enforced; unsupported keyword in a test schema fails schema loading, not ignored | `test_contract_validators.py`, U/C, P03/P07/P08; AC-02 |
| H05 engine admission/cancel | Below/at/above grid/cell-step caps, request A then B with late A, deadline, navigation disposal, memory failure | `workerLifecycle.test.mjs` + browser, U/F/B, P14; AC-23 |
| H06 provider admission | Mock slow/error/429 upstream, queue full, shared subscribers, cancellation and deadline | `test_server.py`, U/F, P14; AC-10/22/23 |
| H07 ingest transaction | Fault at every write/validate/select boundary, older cached payload after failed fetch, locked pointer and restart | `test_ingest_transaction.py`, U/F/D, P15; AC-28 |
| H08 PowerShell outcomes | Mock Python failure and scheduled-task state; skipped WhatIf is not Removed, applied removal verified | New `tests/powershell/HelperContracts.Tests.ps1`, parser + mock unit, P16; AC-32 |
| H09 coefficient provenance | Source hash/immutable revision/packer inputs/notices required; wrong digest fails, missing generator explicitly disclosed | `test_asset_provenance.py`, U/F/D, P06/P16; AC-33 |
| H10 release package semantics | Absent registry version vs401/429/5xx distinguished; wrong source/package digest rejects | `test_release_policy.py`, U/F, P01/P17; AC-31 |
| UX01 navigation and hierarchy | Inspector closed, all destinations reachable; hero-first DOM at narrow sizes; time/selection survives switch | Browser shell cases, B/M, P10; AC-15/20 |
| UX02 Sun complete task | Identify observed/model/time, choose region, inspect score, scrub actual cycle gap, export intended artifact | Browser + formative task session, B/V/M, P11/P16; AC-13/14/16 |
| UX03 Sky complete task | Set manual observer, search/filter/select, distinguish horizon/daylight/events, change time | Browser + manual task, B/M, P12/P16; AC-17/20 |
| UX04 privacy transitions | Spy on network/geolocation from first paint; deny/allow/changed recipient/revoke/offline; location share preview | Browser request ledger, B/M, P12/P14; AC-21 |
| UX05 System complete task | Search/focus object, animate, switch scale/scene, label collision, keyboard selection | Browser/WebGL + manual, B/V/M, P13/P16; AC-18/19 |
| UX06 failure states | Missing image/WASM, invalid payload, provider failure, WebGL loss, offline cold/warm and incompatible version | Browser failure fixtures, B/V, P04/P09/P10–P14; AC-22/25 |
| UX07 accessibility | 320px reflow, mobile/desktop/short landscape, 200% zoom, keyboard, focus, reduced motion, NVDA/Edge and VoiceOver/Safari | Browser + signed scoped manual checklist, B/M, P16; AC-20 |
| UX08 performance | Named ten-cold/ten-warm profile, fixed60s physical-device animation, hidden/paused idle, bytes by class | Browser traces + manual device run, B/M, P14/P16; AC-24 |
| R01 complete gate | Every mandatory needs-result failure class, wrong identities, stale candidate, manual rollback path, actual settings | Python policy fixtures + hosted read-only check, U/F, P01/P09/P17; AC-26/35 |
| R02 rollback/served identity | A->B->A, partial B, old tab, data-bundle rollback, missing retained artifact, wrong served hash | Browser + authorized deployment rehearsal, B/F, P09/P15/P17; AC-25/35 |
| D01 documentation truth | Build/run commands execute, proposed/current status distinguished, requirements resolve, screenshots match artifact | Offline doc validators + reviewed evidence ledger, F/M, P17; AC-34 |
| COV01 complete denominators | Add an unexecuted hand-written worker/affected Python module and verify the denominator includes it and fails the floor; generated catalogue cannot inflate it; source-stamped coverage maps exactly once | Coverage-scope/merge Python+Node tests, U/F, P09/P16; AC-30 |
| MIG01 actual v2-to-v3 population | Start v2 release A; introduce v3 B with open A tab, returning warm A, offline A and fresh B; coherent release or explicit safe reload, no mixed scientific revision; compatible rollback | Mandatory real-browser migration suite, B/F, P09 before P07/P08 activation; AC-25 |
| GEO01 geometric versus refracted horizon | Negative geometric/positive refracted, exact zero and clear positive/negative altitudes; group/count/text use alt_deg > 0, existing above_horizon remains refracted; rise/set threshold stays distinct | Shared provider/resolver/browser fixtures, C/B, P08/P12; AC-17 |
| QUAL01 evidence-gated promotion | All automated jobs green but manual missing/failed, wrong task/fingerprint, expired/different-algorithm scientific evidence; corrective packet rejected for final profile; applicable evidence reusable for data-only change | `test_release_policy.py` and trusted evidence-index integration, U/F, P01/P09/P17; AC-26/35 |
| READ01 pinned bundle transaction | Pause reader after snapshot A, switch pointer to B, resume: complete A or B only; hash/bundle mismatch, legacy mutable alias, partial component, concurrent rollback | `test_ingest_transaction.py`, build tests and browser bundle-loader test, U/F/B, P09/P15; AC-28 |

## Functional versus scientific validation

Functional correctness proves workflow/contract behavior. Numerical invariants prove deterministic, finite, internally consistent results. Neither proves empirical calibration. Use three separate scientific layers:

1. Unit/invariant checks: coordinate normalization, event ownership, gain formula, range/frame consistency, root bracket width and finite states.
2. Frozen attributable independent references: retained Horizons epoch/observer/body/query metadata, response hash and expected values. Commit small reference fixtures with source terms and acquisition dates; do not invent measurements.
3. Bounded external revalidation: existing near-present planet10-arcsecond, general Moon12-arcsecond and syzygy10-arcsecond gates remain unchanged unless a reviewed scientific amendment changes them. A new range test initially uses a proposed10km Moon observer-range ceiling for the preserved near-present example; verify baseline/reference model discrepancy before adopting the claim. Never widen it simply to make implementation pass.

Expand the evidence grid deliberately: four existing observer sites, every month of 2026, Moon near horizon/zenith, polar inputs, Gregorian1500/1582 calendar checks and representative epochs1750/1900/2000/2100/2300 for method comparison. The grid does not automatically establish a continuous300-year bound. Record body/quantity/site/sample dates and measured maxima; an interval claim needs a documented interpolation/error argument and denser evidence. Catalogue-star approximations remain separately labeled; a planet error gate cannot validate star accuracy.

Nightly/weekly network or fuzz work is separate from offline PR tests. A network outage is unavailable evidence, not success. For changes to a scientific quantity, final release requires relevant independently reviewed evidence within30days of the candidate under the proposed policy; unchanged scientific code may cite retained evidence whose source/algorithm hashes still match, with age visible. EOP keeps the existing90-day freshness margin. Do not block every documentation PR on a public endpoint.

## Existing validation commands

Run from repository root in the chosen clean execution checkout. These commands exist at baseline. They are not results from this planning turn. Install only existing locked tooling, with execution authorization; no unrequested new dependencies. Avoid commands that regenerate committed data as casual diagnostics.

### Syntax, unit and static validation

```powershell
cargo fmt --all --check
python -m compileall -q tools services/ephemeris-server
cargo test --workspace --locked
$env:PYTHONPATH = 'tools'
python -m unittest discover -s tests/python -p 'test_*.py' -v
python -m unittest discover -s services/ephemeris-server -p 'test_*.py' -v
npm test
cargo clippy --workspace --all-targets --locked -- -D warnings
python tools/typecheck_web.py
python tools/validate_web_static.py --root apps/web
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_ux_contract.py
git diff --check
```

Preserve/restore an existing PYTHONPATH in the execution harness instead of overwriting the user's persistent environment. Expected ordinary command exit is0. Negative tests must assert their expected rejection while the test runner exits0.

### WASM, data and browser checks

```powershell
cargo build --release --locked -p solar-wasm --target wasm32-unknown-unknown
cargo build --release --locked -p solar-ephemeris --target wasm32-unknown-unknown
python tools/build_wasm.py
python tools/validate_snapshot.py apps/web/data/latest-state.json
python tools/validate_operational_readiness.py apps/web/data/latest-state.json
python tools/validate_star_catalog.py
python tools/generate_geography.py --check
python tools/validate_body_constants.py
python tools/validate_body_motion.py
python tools/validate_moons.py
python tools/check_eop_freshness.py --minimum-days 90
python tools/validate_notebook.py notebooks/solar-maximum-lab.ipynb
python tools/browser_smoke.py --web-root apps/web
node tools/browser_validation.mjs
```

Baseline `build_wasm.py` stages into `apps/web/pkg` and has no CLI flags; P09 adds locked/output behavior. Baseline `build_web.py` also has no output flags and rewrites cache tokens in the source tree. Do not run it in a dirty checkout. `browser_smoke.py` finds Chromium on PATH; the Node harness uses CHROME_BIN or its supported Linux locations. It accepts `--output-dir=...` but not a web-root argument before P09.

For reproducible fixture/series generation, use two independent task-local directories. Existing generator arguments are `generate_fixture_snapshot.py --out PATH --observations-out PATH --seed 42` and `generate_series.py --base PATH --out-dir DIR --frames 11 --seed 42 --months-span 132`. Validate every result and compare hashes; do not overwrite the committed reference to make the test pass. P00 should put these existing calls into a test harness with exact resolved temporary paths and explicit UTF-8 output handling.

Ephemeris example command `cargo run --quiet --locked -p solar-ephemeris --example snapshot` emits JSON; capture with explicit UTF-8, then call `python tools/validate_ephemeris_snapshot.py PATH` and `node tools/test_ephemeris_contract.mjs PATH`. PowerShell5.1 default redirection encoding is not assumed to be UTF-8.

### Coverage

```powershell
node tools/collect_node_coverage.mjs
node tools/browser_validation.mjs
node tools/merge_web_coverage.mjs --minimum-lines=90
cargo llvm-cov --workspace --all-features --locked --fail-under-lines 90 --lcov --output-path coverage/rust.lcov
```

Use the repository-pinned cargo-llvm-cov and Python coverage versions in CI. Node has independent90% line/branch/function thresholds. Current merge inputs are fixed under `coverage/node` and `coverage/browser`; `coverage/browser-ci` is not interchangeable. Baseline Python coverage names only five production files; P16 expands the explicit denominator to affected/new ingest, generation, solar semantic, build, manifest, release and provider code while retaining90%. Report untouched teaching/prototype exclusions rather than pretending every Python file is covered.

### Network-dependent evidence, not ordinary unit tests

```powershell
cargo build --release --locked -p solar-ephemeris --bin sky
python tools/validate_ephemeris.py --binary target/release/sky.exe --report validation/ephemeris-reference.json
python tools/stress_moon_syzygy.py
```

The output directory must exist in a task-local evidence area; use the correct binary suffix for the host. `validate_ephemeris.py` does not currently accept arbitrary date/site matrix flags; P08 adds a versioned input case-list interface and tests it before expanding the grid. `stress_moon_syzygy.py` has no argument parser at baseline. No live source fetch, deployment or provider load test is performed by merely authoring this plan.

## Planned targeted invocations

After the named files exist, use `cargo test -p solar-core --test event_ownership --locked`, `cargo test -p solar-cli --test replay_contract --locked`, `cargo test -p solar-ephemeris --test event_boundaries --locked`, `node --test tests/web/solarProjection.test.mjs`, and the repository Python discovery command. If Rust tests are colocated to avoid changing public API, the owning package test command is the gate instead; record the final symbol/test name in requirements.

New build-root/release-manifest CLI invocations are specified in [DevEx](devex-review.md), explicitly as future interfaces. Their own argument/error/path-containment tests precede workflow adoption. PowerShell helper tests require a pinned existing/approved Pester runtime; if unavailable, retain parser checks and mark mock-runtime qualification pending rather than silently installing an unapproved dependency.

## Evidence packet and release stop conditions

Retain unit reports, cross-language corpus verdicts, deterministic hashes, coverage scopes, staged manifests, browser screenshots/DOM/console diagnostics, performance raw traces, manual task checklists, reference query/response identities and served verification. Never retain secrets, precise user location history or unrelated filesystem data.

Block final experience-milestone promotion for any unclosed F01–F22 regression, failed mandatory gate, incomplete v3 migration, misleading source/accuracy/uncertainty output, unexpected location transmission, lost primary keyboard path, unqualified mandatory manual task, incompatible cache/artifact identity, missing rollback candidate, or failed served verification. Earlier corrective releases use the explicitly reviewed narrower profile in DevEx, not an implicit waiver of the final catalogue. Qualification records and applicability/freshness are checked by executable promotion policy; a green automated aggregate is not sufficient. An owner can amend scope/RFC with explicit rationale; a prose waiver cannot relabel a failing requirement as passed.
