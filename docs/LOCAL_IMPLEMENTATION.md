# September 11 local implementation and remaining gates

Status: uncommitted engineering candidate; not release-ready.

Publication handoff addendum: the user subsequently authorized committing, pushing and
opening a draft PR. The uncommitted/no-push statements below describe the original local
validation snapshot, not the later PR state; the PR is the publication record. No merge,
deployment or registry publication is authorized by that request. Publication preflight
found Git line-ending conversion would invalidate one immutable research-bundle hash.
Scoped `.gitattributes` rules preserve raw bytes in both committed immutable bundle roots;
the datasets and their existing manifests are not regenerated. Markdown whitespace cleanup
and the refreshed file inventory are the other publication-preparation changes.

## Source and authority

The user authorized implementation of the correctness-and-experience plan in the dedicated
`sol-review-20260911` checkout on branch `codex/sol-correctness-experience`. Implementation
baseline is `25efcd528c13bb46a0caf364b37b98801232e7be`, one data-only fast-forward after
the reviewed baseline. The separate dirty `../repo` checkout was not modified.

No commit, push, PR mutation, merge, protected-setting change, deployment or registry
publication was performed. New source/fixture files are still untracked and are part of
the deliverable; a tracked-only diff is incomplete. Build/coverage outputs and independent
review records are retained locally, not represented as hosted CI evidence.

RFC 0002 and D01–D16 are accepted for local engineering. ADRs 0006–0008 record scientific
contracts, presentation/worker boundaries and tested-artifact promotion. Full RFC milestone
status remains Accepted rather than Implemented.

## Implemented source

| Area | Material changes |
| --- | --- |
| Solar correctness | Exactly-once endpoint events and checkpoint/rebase semantics; strict parser and full replay validation before replacement; elapsed-time scalar illustrative uncertainty; immutable birth/current modeled anchors; closed live v3 and separate historical v2 readers |
| Ephemeris correctness | Pole-safe finite observer geometry, explicit geocentric/observer ranges, half-open mean-solar event windows and distinct null statuses, supported Gregorian admission and exact request epoch/observer binding |
| Shared experience | Persistent three-destination navigation, hero-first responsive layout, optional inspector/tour, immutable evidence-based presentation and previewed view-evidence export |
| Sun | Separate observed/model modes; heuristic-score encoding, stable region selection, current model projection, native frame alternatives, true gaps/temporal spacing, cancellable local simulation |
| My Sky | Native search/filter/selection, explicit device/UTC time and provider, geometric horizon grouping, recipient-specific session consent, redirects denied, captured share/export preview, last-valid recovery |
| Solar System | Searchable full catalogue, deterministic label placement, persistent selected facts/focus, actual rendered-time disclosure, atomic time/coordinate updates and initial-error Retry; metadata sampled epoch is separate |
| Execution | Latest-intent workers with admission, cost/deadline/cancellation and schema/ABI/release binding; bounded provider queue/subscribers; no automatic remote fallback |
| Data delivery | Immutable attributable source/derived bundles; resolve-once captured-byte readers; atomic pointer/store publication; exact-owned rolling-PR adapter source, default read-only candidate workflow |
| Release integrity | Complete same-run job policy, immutable artifact hashes/source mapping, explicit coherent cache activation/retention, qualification applicability and veto rules, exact crate/served-byte verification source |
| Engineering | Regression corpora, functional/browser/visual tests, explicit coverage denominators, PowerShell mocked outcome tests, narrow locked dependency patch and source/provenance documentation |

This table describes code, not blanket qualification. Independent reviews found and drove
additional corrections in event/intake contracts, release evidence, provider redirects,
System recovery, feed publication and smoke-runner cleanup. Their original reports and
correction rounds remain in the local `.superpowers/sdd/engineering-plan` evidence directory.

## Acceptance boundaries

| Acceptance criteria | Evidence and remaining boundary |
| --- | --- |
| AC-01–05, 07–10 | Native/unit/cross-language regression evidence; independent astronomy/empirical accuracy is separate |
| AC-06, 11 | Fail-closed image registration and evidence-scoped accuracy implemented; no current compositing permission or independently qualified broad accuracy interval |
| AC-12–19, 21–23 | Source and bounded Node/Chromium workflow evidence; final integration rerun is required after any source change |
| AC-20, 24 | Automated reflow/focus/visual and limited local timing observations only; full manual accessibility, usability and accepted physical-device performance profile remain open |
| AC-25–28 | Local artifact/cache/transaction/policy tests; real historical v2-to-v3 population, remote rolling PR and protected hosted gate remain unexecuted |
| AC-29 | Canonical-generation safeguard implemented; exact pinned Linux x86_64 two-run qualification remains open; authoritative moon outputs and numerical tolerances unchanged |
| AC-30 | Whole-web line gate has a passing local candidate; separate Node 90/90/90 gate fails, Rust LLVM coverage unavailable; configured Python denominator is explicit, not whole-repository coverage |
| AC-31–32 | Existing dependency graph narrowly patched and locked install checked; PowerShell mock tests pass; crate publication and real scheduler operation not executed |
| AC-33–34 | Local coefficient hashes/history and missing regeneration inputs disclosed; source documentation reconciled; immutable upstream notice/serializer correspondence and GitHub presentation at a future released SHA remain open |
| AC-35 | No final promotion: required qualification, served production artifact and compatible production rollback drill are absent; operational status remains false |

## Validation ledger and coverage hold

### Latest integrated candidate

The final local handoff stage is `build/handoff-preview`, release
`local-handoff-20260911`, manifest SHA-256
`8e32757281780525929e8a5f9c5cd0e388cfe48779360ae4f466618019bfe5bf`.
It includes the independently reviewed P15 corrections and the fresh locked WASM build.
Its manifest source SHA names the baseline of this dirty local candidate, not an exact
hosted-commit attestation. No production or publication claim follows from this artifact.

| Fresh validation | Result |
| --- | --- |
| Rust workspace | 152 tests passed; locked build, format and strict Clippy passed |
| JavaScript functional tests | 303 tests passed in both collection and the independent coverage run |
| Python tools and provider | 156 tool tests plus 28 provider tests passed |
| Static checks | 67 JavaScript files typechecked; compileall, SDLC, UX contract, body constants/motion, static web, EOP and snapshot/readiness checks passed |
| Experience browser suite | Passed on the handoff artifact: real workers, cancellation, time/selection, bundle recovery, focus and 320/390/1440-pixel reflow |
| Full browser suite | Instrumented run passed the existing Sun/Earth, orbit/spin, moon transit/eclipse/shadow and camera assertions; see retained first-run timeout below |
| Sky browser suite | Passed real-worker, consent/revocation, local two-origin redirect denial, recovery, focus and reflow checks |
| Legacy browser smoke | Passed all 11 readiness markers and screenshot checks; bounded cleanup correction independently reviewed |
| Release cache browser suite | Passed actual two-client A/B activation/offline behavior, corrupt-C rejection and unknown-identity rejection |
| Merged handwritten web line gate | Passed: 9,019/9,668 = **93.28%** across 60 files; branches 86.50% and functions 94.55% are informational, not this gate's enforced thresholds |
| Separate native Node 90/90/90 coverage gate | **Failed:** 81.85% lines / 80.16% branches / 70.99% functions, despite all 303 functional tests passing |

Current evidence is retained under `coverage/handoff-experience`,
`coverage/handoff-browser-diagnostic`, `coverage/handoff-sky`, `coverage/handoff-cache`,
`coverage/handoff-node` and `coverage/handoff-combined`. The service worker remains
explicitly zero-covered in the merged runtime denominator; cache behavior tests do not
substitute for runtime coverage. No coverage threshold or exclusion was weakened.

The first fresh full-browser run timed out after 20 seconds waiting for initial Sky
readiness. A second run with bounded failure diagnostics passed unchanged assertions.
The exact first-run cause is unestablished: retain this as a flake investigation, not a
verified product fix. The diagnostic addition neither automatically retries nor relaxes
the readiness gate.

The current controlled SwiftShader/4x-throttled 300-pair timing observation was raw
position p95 13.2 ms (maximum 28.3 ms), and full JSON p95 34.6 ms (maximum 43.4 ms).
The raw p95 16 ms local gate passed. This is not physical-device performance qualification
or a production SLO. Earlier faster measurements are historical samples, not the current
handoff metric.

The P15 correction author reran branch-enabled Python coverage: 92% combined coverage
over the configured 18 source files (3,134 statements and 1,368 branches); its source
inventory was independently hash-verified. This is not a whole-Python result and does
not establish coverage of the smoke-tool changes. AC-30 remains open until the remaining
affected Python denominator and Rust LLVM coverage are reconciled.

The full local candidate file inventory is [IMPLEMENTATION_FILES](IMPLEMENTATION_FILES.md).

### Earlier candidate and diagnostic history

The retained `local-implementation-final` preview manifest is
`742e382c8d77bec4f72fcb940743914f3a2cf64432904d8bbf9a35ad0ad5c8f7`.
It predates the final P15 correction round; its passing evidence must not be reused as
an exact-source claim for later changes. Its full Chromium suite passed unchanged camera,
moon transit/eclipse/shadow, Sun/Earth pixel, spin and interaction assertions. The merged
Node plus Chromium handwritten line result was 9,000/9,656 = 93.20% across 60 files.
Branches were 86.60% and functions 94.15%; only lines are enforced by that merge gate.
The service worker remained explicitly zero-covered in that denominator; separate cache
behavior tests do not grant service-worker runtime coverage credit.

The independent native Node gate failed at 81.85% lines / 79.99% branches / 70.99%
functions. A strictly local diagnostic identity hook demonstrated duplicate versioned
module URLs in the native reporter, but normalization still failed at 84.91% / 83.00% /
78.23%. The hook is not enabled in CI. Genuine gaps include Sky/UI/engine paths and
negative bundle/historical contract cases. **No threshold or exclusion was weakened.**

The branch-enabled Python metric passed its configured expanded 18-file denominator at
92% before final review corrections. This is coverage.py's combined line/branch metric,
not 90% for every file, nor a claim that all Python tools are counted. Additional affected
scientific/generation/validator paths need explicit denominator reconciliation before
calling AC-30 complete. Installed local coverage.py is 7.13.5; CI pins 7.15.2.

Local toolchain: Windows ARM64, Python 3.14.3, Node 24.18.0, Rust 1.96.0,
Chrome 151.0.7922.174/SwiftShader. Hosted Linux/Node 22 was not run. The existing locked
`npm ci --ignore-scripts` completed with 67 packages and zero reported audit findings.
Both release WASM engines built with `--locked`; their SHA-256s match the previously
staged native binaries. Typecheck passed for 67 files. Body constants/motion, static web,
snapshot/readiness and EOP checks passed; EOP had approximately 293 days of remaining
prediction coverage at the local check. This is not a guarantee of future freshness.

## Resume and verify

Use the repository's existing commands from [INSTRUCTIONS](INSTRUCTIONS.md), with
`PYTHONPATH=tools` for Python discovery and an explicitly installed `CHROME_BIN`.
Do not install new host toolchains, fetch scientific reference data or enable the remote
adapter without the relevant authority.

```powershell
$env:PYTHONPATH = 'tools'
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
python -m unittest discover -s tests/python -p 'test_*.py' -v
python -m unittest discover -s services/ephemeris-server -p 'test_*.py' -v
npm test
python tools/typecheck_web.py
python tools/validate_sdlc.py
python tools/validate_ux_contract.py
```

Next local work is to close the unchanged Node coverage gate with meaningful tests,
reconcile the remaining Python scope, investigate the retained Sky readiness flake and obtain
Rust coverage on the approved pinned tooling. Then perform separately authorized canonical,
manual/scientific and hosted qualification. Green source tests alone do not authorize release.
Preserve all untracked fixture manifests/payloads and the independent review evidence.
