# PR 105 coverage and required WASM gate correction

## Scope and status

Recorded September 12, 2026, for branch `codex/sol-correctness-experience`, starting at
`e09e8bc0f8bbac698dbccb2687fe76741fc8dab5`, targeting `master`. This change corrects
test attribution, adds behavioral coverage, and restores the required WASM check.
It does not change production browser/Rust runtime code, dependencies, coverage
thresholds, branch protection, scientific claims, deployment settings, or public APIs.

This document records local implementation evidence and the first hosted gate result.
Final-head hosted checks and review state must be read from
[PR 105](https://github.com/Protonmatter/sol/pull/105), not inferred from these local runs.
New unrelated actionable review findings remain open, so successful CI alone does not
establish merge readiness. No merge, deployment, approval, or thread resolution is
performed by this patch.

## Diagnosis and correction

The earlier hosted Node gate failed at 76.09 percent lines, 78.41 percent branches,
and 66.12 percent functions on 360 tests. There were both collection and test gaps:

1. Several regression harnesses stripped imports/exports and executed anonymous VM
   scripts. Behavioral assertions ran, but those transformed bytes were not coverage
   evidence for the actual production module. The shared harness now executes complete
   original bytes with `vm.SourceTextModule` and canonical file URLs. Synthetic modules
   identify only controlled IO/DOM boundaries. The inspector regression checks exact
   source bytes, original offsets, URL identity, and an executed function. Transformed
   release-stamped Sky fixtures remain anonymously identified and claim no original
   source coverage. Semantic query strings/fragments are rejected by this harness.
2. Plain and version-query ESM instances execute independently. The native Node summary
   did not correctly merge their complementary coverage into one source-path result.
   The replacement Node-only reporter uses existing locked c8 reporting, not an ESM
   resolver hook. A small executable fixture proves both instances stay distinct while
   their real branch/function hits merge at reporting time. Imported generated modules
   remain in this gate, exactly as before. Ambient c8 configuration and CLI arguments
   cannot lower floors or alter its population. Exact integer counts, not rounded
   percentages, enforce 90 percent independently for lines, branches, and functions.
3. New assertions close real gaps in Orrery interactions and selection, panel states,
   tours/tooltips, body/star detail presentation, Sky time/geolocation/filter/export and
   worker recovery, timeline cancellation/playback, WASM-wrapper dispatch and timeout,
   and valid/invalid data contracts. Existing Orrery regression bodies were preserved
   while their reusable harness was extracted. DOM/GL/IO doubles do not claim rendered
   pixel or actual WASM execution; separate staged-browser runs exercise those surfaces.
4. A browser collector failure was caused by normal worker detachment racing with an
   in-flight CDP operation. Only an actual Puppeteer `TargetCloseError` after the exact
   worker's detach event is treated as cancellation. Arbitrary errors, unrelated worker
   detachment, and instrumentation timeouts remain failures. No coverage hits are
   invented for cancelled workers and unexecuted runtime remains in the denominator.

The independent Node gate and the whole-runtime gate are deliberately separate:

| Gate | Population | Unchanged floor | Final local result |
| --- | --- | --- | --- |
| Node-only | Imported `apps/web/**/*.js`, including imported generated modules | 90% lines / branches / functions | 18,967/19,110 lines (99.25%); 3,502/3,816 branches (91.77%); 491/507 functions (96.84%) |
| Whole web | All 60 hand-written runtime files, Node plus Chromium | 90% lines | 9,529/9,763 lines (97.60%) |
| Python | Existing 18-file configured population with branch measurement | 90% aggregate | 92% |

Whole-web branches (93.92%) and functions (98.07%) are informative, not a replacement
for the independent Node requirements. The service worker remains present with all
137 lines unexecuted. No generated exclusion or runtime denominator was changed.

## Required WASM and release-gate alignment

The exact protected check name `WASM build (wasm32-unknown-unknown)` is restored as a
fail-closed verification job. The existing `Build immutable web artifact` job still
performs both locked Rust WASM builds and supplies the immutable candidate. The new
check rejects failure, cancellation, skipping, or missing artifact ID/digest, downloads
the same-run/attempt artifact, and uses the existing manifest validator to bind both
engine hashes/headers and all candidate bytes to repository/SHA/run/attempt/digest.

`Release gate` now requires this job, and the protected promotion verifier's mandatory
job map includes its exact name. Negative tests reject absent or weakened gates,
foreign/conditional artifacts, missing identity flags, and failure tolerance. The
actual workflow prerequisite guard is executed with successful and adverse inputs.
Node-gate governance also rejects job/step conditions and advisory failure settings,
including keys placed after the run command.

Branch protection is unchanged. A future production promotion requires a reviewed,
coordinated pinned-verifier and protected job-map update; older incomplete policy
fails closed. See [release delivery](RELEASE_DELIVERY.md) for that authority boundary.

## Local validation

Local runtime: Windows ARM64, Node 24.18.0, Python 3.14.3, Rust/Cargo 1.96.0,
coverage.py 7.13.5, and Chrome 151.0.7922.174. Hosted CI uses Linux, Node 22,
Python 3.12, and its existing pinned coverage.py 7.15.2; local results do not substitute
for that final-head run.

| Command / check | Result |
| --- | --- |
| `node tools/check_node_coverage.mjs --output-dir=coverage/pr105-gates-final-node/node-executed` | 565 passed, zero failures/skips; all three Node floors pass |
| `node tools/collect_node_coverage.mjs --web-root=build/pr105-gates-site --output-dir=coverage/pr105-gates-final-node/node` | 565 passed; denominator-complete map produced |
| `node tools/merge_web_coverage.mjs --web-root=build/pr105-gates-site --node-input=coverage/pr105-gates-final-node/node/coverage-final.json --browser-input=coverage/pr105-gates-final/browser/coverage-final.json --output-dir=coverage/pr105-gates-final-node/combined` | All 60 files retained; 97.60% lines passes unchanged floor |
| `python -m unittest discover` through the existing branch-coverage commands | 28 provider plus 179 tooling tests pass; unchanged 18-file gate 92% |
| `cargo test --workspace --locked --offline` | 171 tests pass |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | Pass |
| `cargo fmt --all -- --check` | Pass |
| `python tools/build_wasm.py --locked --out-root build/pr105-gates-wasm` with `CARGO_NET_OFFLINE=true` | Both engines built |
| Fresh `build_web.py` and `validate_release_manifest.py` | Same local candidate validates |
| `python tools/browser_smoke.py --web-root build/pr105-gates-site` | Pass |
| `node tools/browser_validation.mjs --web-root=build/pr105-gates-site --output-dir=coverage/pr105-gates-final/browser` | Staged WebGL assertions and worker coverage pass |
| `node tools/experience_validation.mjs --web-root=build/pr105-gates-site --out=coverage/pr105-gates-experience` | Pass |
| `node tools/sky_validation.mjs --web-root=build/pr105-gates-site --out=coverage/pr105-gates-sky` | Actual worker, focus, privacy, recovery, cancellation and reflow pass |
| `python tools/typecheck_web.py` | 67 files pass with TypeScript 5.9.3 |
| `python tools/validate_sdlc.py` | 16 requirements, RFCs, evidence paths and workflow contracts pass |
| `python tools/validate_ux_contract.py` and `python tools/validate_web_static.py` | Pass |
| `python tools/validate_docs.py` | 129 Markdown files pass |

The local staged manifest digest is
`a26aaf4c2e902f22083552f4eea360c54192ab0a6891243fbb74acffb2357720`.
It carries the pre-commit diagnostic identity `e09e8bc...`, not an assertion that the
dirty validation-tooling tree equals that commit. Production staged source bytes did
not change while final tests were added; source hashes are checked before merging
coverage. Hosted CI must build a fresh immutable candidate for the published head.

Failed baseline collector evidence is retained under ignored
`coverage/pr105-gates-baseline/browser`, separate from the unchanged-baseline retry
and final passing outputs. Negative regressions were observed failing before their
fixes, including attribution, worker cancellation, gate mutation, and nested fixture
environment isolation. Independent review caught and verified corrections for a
default-output artifact mismatch, after-command advisory gate keys, and insufficient
WASM-wrapper dispatch assertions. No blocking finding remains within this patch's
reviewed collection/gate scope.

## Hosted release-evidence follow-up

The first published head, `4a3209b5b248e379883992bae02ec4a9013f385a`, passed all four
protected checks and both the reusable and standalone Coverage workflows. Hosted
Node 22 reproduced the exact 565-test and 99.25/91.77/96.84 Node totals above, and
the 97.60% whole-web gate passed. However, the complete
[CI run 34707010841](https://github.com/Protonmatter/sol/actions/runs/34707010841)
failed at `Release gate` while assembling Python coverage evidence; no release
evidence artifact was produced. This failure is retained, not treated as success.

The actual coverage.py 7.15.2 XML declares `/home/runner/work/sol/sol` as its source
root and uses repository-relative class paths. A fresh `coverage xml` process loads
the measurement database but does not retain the earlier `coverage run --source`
CLI option. The prior local reporter-shape test incorrectly reused that configured
in-memory reporter and therefore exercised only subdirectory-root XML.

The follow-up changes `python_denominator` to accept the exact trusted checkout root
as well as the original two measurement roots. Every resolved file must still reside
under `tools` or `services/ephemeris-server`; the configured population is not widened.
Missing, duplicate, ambiguous, absolute, traversal, symlinked and out-of-scope file
identities still fail closed. Two regressions reproduced the hosted failure before
the fix: repository-root XML with strict per-file scope, and the actual installed
reporter reloaded into a fresh instance before XML generation. Both pass after it.
The final-head CI must be re-run after publishing this follow-up; the earlier green
substantive jobs cannot stand in for a passing complete release gate.
The follow-up local run passes 28 provider plus 180 tooling tests (208 total), with
the same 18-file Python branch-measured gate at 92%. An actual separately generated
XML report resolves all 18 canonical source identities. Independent review replayed
the downloaded hosted report with only the checkout root localized in memory, confirmed
the old resolver failure and exact new 18-file result, and found no blocking patch issue.

## Unresolved review and release limitations

At the pre-publication review refresh, 20 of 23 inline threads were resolved. Three
unresolved threads cover two issues (standalone provenance is duplicated), and a
review-body comment raises a third issue:

- Standalone snapshot validators accept placeholder provenance in paths outside the
  already corrected immutable-bundle checks. A coordinated Rust/JavaScript/Python
  predicate and regressions are still needed.
- Hash-valid series frame content is not fully bound to manifest frame semantics.
  Reordered frame data can remain inconsistent with advertised stage/activity values.
- Future-dated feed observations can be reported non-stale because negative age is
  not rejected. Time-bound validation and an explicit diagnostic need separate work.

These were triaged read-only, not silently fixed or resolved as part of this coverage
and check-alignment change. Refresh all threads and review bodies after final CI.
Green CI is not proof that these known defects are absent or acceptance is complete.
Live feed endpoints, production policy administration, served Pages bytes, mobile
devices, scientific reference qualification, and deployment/rollback are not validated
or authorized here. Local browser execution used bounded fixtures and loopback only.

## Files and rollback

Changed scope: CI/Coverage workflows, package test commands, Node/worker coverage
tooling, SDLC and release policy plus Python tests, four existing VM regression suites,
the worker-coverage regression suite, new exact-source/DOM/Orrery helpers, Node gate
fixtures, six new focused behavior/contract suites, and evidence/planning/delivery docs.
The complete candidate path/hash list is [implementation inventory](IMPLEMENTATION_FILES.md).
Ignored coverage/build/review artifacts are not source payloads.

Revert this scoped commit through a normal reviewed PR if collection/gate behavior
regresses. Retain failed evidence, preserve the unchanged coverage floors and protected
check names, and do not rewrite history, reuse an unverified artifact, or bypass policy.
