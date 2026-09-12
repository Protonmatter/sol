# PR 105 third review correction evidence

Scope: five new comments on [PR 105](https://github.com/Protonmatter/sol/pull/105),
reviewed at `2fb158834ecbd49a5a0c81bb72454220a1e392e4` on September 12, 2026 UTC.
All five were verified actionable. This supplements the
[second correction record](PR105_REVIEW_ROUND2.md), not a new product or release claim.

## Contract and corrections

The changes implement existing SPEC/RFC 0002 requirements for attributable evidence,
complete bundle admission, valid model epochs and retained-state recovery. No dependency,
schema, coverage floor, coefficient or production recipient changes. RFC 0002 remains
Accepted. Core transport event inclusion is corrected without changing its operators.

| Comment | Verified cause and correction | Regression evidence |
| --- | --- | --- |
| [3994692511, P1](https://github.com/Protonmatter/sol/pull/105#discussion_r3994692511) | Python derived context consumed all raw rows while evidence used a separate representative row. Bundle context now excludes unattributable rows; numeric value, evidence and freshness select the same eligible numeric row. | [Provenance tests](../tests/python/test_bundle_observation_provenance.py): persisted daily derivation/resolution, invalid newer and invalid-only rows, manifest fallback, six numeric feeds, counts, raw payload and metadata retention. |
| [3994692515, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994692515) | Animation changed displayed time and called raw positions outside the supported epoch range. It now validates/stages the proposed epoch and complete positions before publication; failure pauses and retains the previous state with recovery guidance. | [System regressions](../tests/web/orrery_review_regressions.test.mjs): upper/lower crossings, paused boundary admission, retained clock/coordinates, late metadata reply, Now recovery and explicit resume. |
| [3994692519, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994692519) | A negative region age passed the lifetime upper bound, exposing future births and causing snapshot serialization to panic. Active selection now also requires birth at or before the current epoch; pending sources remain queued. | [Flux transport tests](../crates/solar-core/src/flux_transport.rs): real intermediate snapshots, inclusive births, zero prebirth flux, retained source ledger, exact partition equality, no reinjection after rebase. |
| [3994692527, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994692527) | Python/browser numeric role parsing admitted extra leading-zero aliases. Exact selected-role membership now matches native intake. | [Python bundles](../tests/python/test_data_bundles.py), [browser bundles](../tests/web/dataBundle.test.mjs): freshly hash-bound aliases, gaps, out-of-range roles, canonical indices 0/10, retained pointer and actual loader publication. |
| [3994692530, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994692530) | Hiding first System entry cancelled its generation but retained the obsolete entry promise. Cancellation now releases that promise immediately; identity-checked completion cannot clear a replacement. | [System regressions](../tests/web/orrery_review_regressions.test.mjs): hide/show before/after cancellation settlement, animated/paused entry, delayed shared engine loading, stale completion and single-loop ownership. |

## Red/green and independent review

Python provenance tests first produced 19 expected subtest failures, including invalid
235 instead of attributable 150, inflated activity counts and invalid-only signals.
An additional six failures showed newer nonnumeric metadata lending its timestamp to
older numeric evidence. All eight focused tests now pass. The persisted mixed-row
daily bundle has F10.7 150, activity 0.5 and 25 illustrative regions, with unchanged
source bytes and the selected evidence source/time. Legacy fixture/cache selection
behavior remains unchanged; the stricter projection applies to bundle derivation.

Both new future-birth tests first panicked at the real snapshot producer's birth-time
invariant. Both pass after adding the lower age bound. All active-region lifetime,
event-consumption and fixed-checkpoint partition tests remain green.

The original Python reader admitted four alias variants; the original browser accepted
`series_frame:00`. Both now reject aliases and retain valid multidigit/gap series.
An independent reviewer also ran actual native replay against production-built temporary
rehashed bundles: the valid sparse series succeeded, all seven alias/gap/orphan cases
returned exit 2, and the prior pointer and two replay outputs stayed byte-identical.

System tests reproduced five failures before correction. An independent reviewer
reproduced these again by loading the original module into the new harness in memory,
without editing the checkout. The harness executes the entire Orrery module and real
LatestWorkerClient; browser/GPU/engine I/O boundaries are controlled. The lower-bound
crossing deliberately injects a reverse rate; current UI speed controls advance only.
All 26 focused System/recovery/contract/time tests pass. Independent reviews of the
provenance, bundle-role, core and System changes found no remaining actionable findings.

## Local verification

Windows ARM64; Node 24.18.0, Python 3.14.3, Cargo 1.96.0, coverage.py 7.13.5;
existing locked tooling only. Hosted workflow/runtime results are recorded in the PR.

| Command/check | Result |
| --- | --- |
| `npm test` | 355 passed, including 12 new JavaScript tests. |
| `cargo test --workspace --locked --offline` | 167 passed across all unit/integration targets, including 2 new core tests. |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | Passed. |
| `cargo fmt --all -- --check` | Passed. |
| Python provider/tool coverage commands from `coverage.yml` | 28 provider + 170 tool tests passed; 92% combined branch-enabled coverage over the unchanged 18-file scope. |
| `python tools/typecheck_web.py` | 67 files clean. |
| `python tools/validate_sdlc.py` | 16 requirements and RFC/workflow contracts pass. |
| `python tools/validate_ux_contract.py` and `python tools/validate_web_static.py` | Passed. |
| `python -m compileall -q` on changed Python modules/tests | Passed. |
| Unchanged Node 90/90/90 coverage gate | Failed: 79.84% lines / 80.62% branches / 70.97% functions, despite 355 passing tests. |

Both WASM engines were rebuilt offline into `build/pr105-round3-wasm`; the staged
diagnostic release is `pr105-round3` under `build/pr105-round3-site`. Its manifest
SHA-256 is `f02ccf261ef7265be179b1f0d0993cec8696664476c2181ae9df7a1e35a8dba9`.
The recorded source SHA is pre-change lineage: this dirty-tree preview is not an
exact committed-source attestation. No production source changed after staging.

`python tools/browser_smoke.py --web-root build/pr105-round3-site` passed Sun, Sky
and interactive System. `node tools/experience_validation.mjs
--web-root=build/pr105-round3-site --out=coverage/pr105-round3-qa/run-1/experience`
passed on installed headless Chrome with SwiftShader, blocked external requests and
no uncaught page errors. These were isolated sequential runs; their diagnostics and
screenshots remain ignored local evidence. The previous round's label-clearance failure
is not erased or declared fixed by this passing run. No label-layout code was changed.

## Remaining holds and rollback

JavaScript coverage remains below the unchanged required floors. Browser lifecycle
race/boundary regressions use deterministic platform doubles; the generic staged browser
checks do not constitute native OS visibility scheduling or ten-minute physical-device
qualification. Full accessibility, operational/scientific evidence, production service-
worker updates and release qualification remain unclaimed.

Regenerating bundles intentionally changes context previously influenced by invalid
attribution. Extra alias components now reject instead of being silently ignored.
Existing immutable inputs are never repaired or overwritten. Rollback is a reviewed
revert commit, not history rewriting or mutation of bundle bytes; reverting can
reintroduce the documented defects. No merge, deployment or live acquisition was performed.
