# PR105 final-review corrections

Date: September 12, 2026. Repository: `Protonmatter/sol`; PR [105](https://github.com/Protonmatter/sol/pull/105).
Correction starts at `9c90af7fa5ab343412aed30ed4f337ce049daf6e` on
`codex/sol-correctness-experience`; repository base is
`25efcd528c13bb46a0caf364b37b98801232e7be`.

## Scope and specification

This correction addresses the five P2 findings from review `5187683205`, submitted
against the starting head after its earlier clean check snapshot. It preserves the
current v3 contracts, immutable source evidence, numerical methods, dependency locks,
coverage floors, substantive WASM gate, branch protection and deployment boundaries.
The binding semantics are in [SPEC](SPEC.md), under Admission consistency and UI
contract, with the existing RFC/requirement structure retained. The scoped
[implementation plan](superpowers/plans/2026-09-12-pr105-final-review-fixes.md) records
interfaces, regression requirements and delivery gates.

| Finding | Correction | Behavioral regression |
| --- | --- | --- |
| [Ingestion attribution](https://github.com/Protonmatter/sol/pull/105#discussion_r3997248175) | The unchanged explicit-whitespace/Unicode-lowercase predicate moves from CLI to `solar_core::provenance`; ingest and CLI consume that one implementation through existing dependencies. | Actual ingest-to-simulate execution of all 47 literal cases; unattributable F10.7 cannot borrow valid magnetic/wind evidence. Invalid-newer/valid-older selection and exact valid-source retention are covered. |
| [Image registration attribution](https://github.com/Protonmatter/sol/pull/105#discussion_r3997248180) | Registration uses the existing shared browser attribution predicate instead of custom `trim()` semantics. | Actual JavaScript and Python assessors use the same 47 literal cases; inputs and accepted source evidence remain unchanged. Compositing is false for every case. |
| [Previous from Latest](https://github.com/Protonmatter/sol/pull/105#discussion_r3997248186) | Only reverse navigation from the separate `-1` Latest sentinel starts after the final cycle record. | Final-ready selection, gaps, skipped counts, reverse/forward wrap, preserved forward Latest, one-record, empty and all-unavailable cases. |
| [Stale visible System facts](https://github.com/Protonmatter/sol/pull/105#discussion_r3997248188) | Successful current-generation metadata publication invokes the existing accuracy/detail presentation updater. | Real whole-module System lifecycle verifies the sampled timestamp and selected speed change together, delayed results project onto newer rendered positions, and cancelled completion cannot publish. |
| [Unknown clock shown healthy](https://github.com/Protonmatter/sol/pull/105#discussion_r3997248189) | One pure freshness assessment serves selectors and explanatory presentation; invalid/missing clocks produce unknown/non-live state. Existing optional-field schema admission is unchanged. | Strict explicit UTC/calendar cases, leap-day/fractional timestamps, exact inclusive six-hour grace, direct selectors and synthetic hash-consistent bundle-to-selector integration. |

Final integration review also checked the detailed feed and aurora consumers. Both now
use the shared assessment: reported status/source successes are historical evidence,
current freshness is separate, invalid refresh dates remain unknown, and finite retained
Kp carries an unknown-freshness caveat. Valid fresh/stale and missing-Kp behavior remains.

The backward-compatible clock option was explicitly permitted by the review: admission
and presentation freshness remain separate. `next_recommended_run_utc` must be a real
calendar timestamp ending in `Z` or `+00:00` to establish freshness. Nonzero offsets,
local-time spellings and `-00:00` do not claim UTC certainty. Fractional seconds are
accepted at JavaScript's millisecond evaluation precision. Explicit failed, degraded
and aborted feed states remain intact. Unknown clocks do not discard last-good data.

Attribution preserves the normative boundary set, including U+001C–U+001F, and Unicode
lowercase placeholder rejection. U+FEFF remains deliberately untrimmed. This tests
attribution admission, not authenticity of a source string or physical observation.

## Regression and independent-review evidence

All five original behaviors were demonstrated before implementation:

- Native corpus/selection target: two failing tests, including six corpus divergences
  and newer invalid F10.7 selecting activity `1.0` instead of the older valid `0.5`.
- Registration/navigation target: 10 of 12 passed; separator-only attribution and
  reverse Latest failed on their literal expected results.
- UI target: 13 of 18 passed; missing helper, false daily-ok state and stale visible
  metadata timestamp failed. Cancellation protection was already passing.

Focused targets then passed. Independent spec/quality review approved the registration,
navigation and UI changes with no actionable findings. Native review requested the
exact mag/wind-only baseline topology. The corrected integration test now ingests those
two attributable inputs with F10.7 absent, asserts both retained supporting sources,
asserts no F10.7 context/frame, and simulates that report. Every invalid F10.7 case is
compared against this baseline's Synthetic mode, `0.9` activity and physical fields.
Its two tests and formatting pass; scoped independent re-review found the P2 addressed
with no new breakage. No production change was needed for that test refinement.

The integrated architecture/consumer review then identified one remaining P2: two panel
consumers still conflated the legacy nullable overdue value with current freshness.
The bounded panel fix used the existing shared assessment and added actual-module tests.
Its target was 28/32 before the fix and 32/32 afterward, with existing fresh/stale,
source-failure, missing-Kp and no-feed assertions retained or strengthened. This review
examined current corrections, relevant consumers and cumulative release/coverage
architecture; it was not an exhaustive line-by-line re-review of the 3.4 MB branch patch.
Scoped re-review confirmed the main panel correction and identified a residual copy
overclaim when Kp exists without a feed report. The caveat now refers only to the displayed
snapshot, its actual source, and a direct no-feed assertion forbids invented last-report
provenance. This wording regression was 29/32 before and 32/32 after; root readback and
the refreshed full 650-test Node run verify the correction. No extra runtime branch,
formatter or model change was introduced for it.

The tests exercise actual assessors, selectors, bundle admission, CLI subprocesses and
the whole System module. Existing browser/GPU/worker harness boundaries and in-memory
bundle transport are test doubles; these are not live source or physical accuracy tests.

## Local validation

Environment: Windows ARM64, Node 24.18.0, Python 3.14.3, Rust 1.96.0 and Chrome
151.0.7922.174. These results do not replace final-head Linux/Node 22/Python 3.12 CI.

| Command or gate | Result |
| --- | --- |
| `cargo test --workspace --locked --offline` | 181 tests passed, zero failures/skips, including the full rerun after baseline refinement |
| `cargo fmt --all -- --check` | Passed, including after baseline refinement |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | Passed |
| `node tools/check_node_coverage.mjs --output-dir=coverage/pr105-round6/publication/node-executed` | 650 tests passed; lines 19,010/19,153 (99.25%), branches 3,569/3,880 (91.98%), functions 493/509 (96.85%); unchanged independent 90/90/90 floors passed |
| Existing two Python branch-coverage discovery commands | 28 provider and 199 tooling tests passed; 227 total |
| Python configured coverage gate | 92% branch-measured aggregate over unchanged 19-file scope; XML records 3,036/3,231 lines and 1,246/1,420 branches |
| Both locked WASM builds with `CARGO_NET_OFFLINE=true` | Passed, staged only under ignored `build/pr105-round6/wasm` |
| `/sol/` staged `browser_smoke.py` | Sun, My Sky and interactive 3-D System passed |
| `/sol/` staged `browser_validation.mjs` | Chromium execution, WebGL geometry/color and lunar shadow/eclipse pixel assertions passed |
| Denominator-complete Node/Chromium merge | 9,572/9,806 lines (97.61%); all 61 handwritten runtime files retained; 90% floor passed |
| Root-mounted `experience_validation.mjs` | Sun/System interactions, disclosure, reflow, retained-state/failure/cancellation checks passed |
| Root-mounted `sky_validation.mjs` | Actual worker, keyed focus, privacy/consent, recovery, cancellation and reflow passed |
| Type/static/UX/SDLC/docs | 68 typechecked modules, static/preload/UX rules, 16 SDLC requirements and Markdown references passed |
| Source/physics/readiness checks | Star regeneration, body constants/motion, EOP window, v3 snapshot and notebook structure passed; operational use remains explicitly false |
| Protected payload comparison | All 83 tracked files in the selected data/texture/ephemeris-source scopes retain their starting SHA-256 |

The service worker remains in whole-runtime coverage with all 137 lines unexecuted.
No measured runtime file was excluded, no coverage floor was lowered, and no coverage
workflow changed. New shared Rust code remains in the existing workspace coverage scope.

Local immutable preview manifests:

- Publication `/sol/`: `63766b76e8cf36292e13b17e7058c4a58ae49258f8750ce1f3ced6c4c103b23b`.
- Publication root-mounted UX: `80e843827a44933c5536baf1170a4ff34c583fec09b7e3082543b4ffbca202c0`.

These previews contain the corrected runtime and rebuilt WASM. Their source identity is
parent-commit lineage plus uncommitted changes, not a final-commit release attestation.
Ignored evidence is under `build/pr105-round6` and `coverage/pr105-round6`; final browser
and coverage reruns use their `publication/` subdirectories. Pre-panel-fix previews and earlier
passing coverage (648 tests, 9,568/9,802 whole-runtime lines) are retained as earlier
observations, not substituted for the final runtime verification.

## Failed attempts and remaining gates

- Browser commands initially stopped before launch because `CHROME_BIN` was unset.
  The installed executable was verified and supplied explicitly; the resumed smoke,
  WebGL, experience and Sky runs passed. No browser install or harness relaxation.
- The UI red-test setup initially needed the existing positions-list population and
  DOM shim before it could expose the intended failures. A later expected selected-time
  literal was corrected from an arithmetic error; production was not changed for it.
- The Python focused-test module-name invocation was corrected to repository-compatible
  unittest discovery. These setup mistakes are not represented as product defects.
- The pre-existing Windows ARM64/Python 3.14 moon-regeneration mismatch remains recorded
  in [canonical generation](CANONICAL_GENERATION.md) and [round 5](PR105_REVIEW_ROUND5.md).
  It was not repaired by altering source bytes or tolerances. Final Linux CI must pass
  the unchanged moon gate; local checks do not prove cross-platform generator parity.
- Hosted verification must use the final pushed head: all four protected contexts,
  every complete-release-gate prerequisite, actual artifact identity/coverage evidence,
  and completed review state. Prior green CI and resolved threads cannot be borrowed.
- Live acquisition, independent scientific qualification, manual assistive-technology
  qualification, protected promotion configuration, deployed Pages bytes and rollback
  eligibility remain unvalidated. Compositing and operational readiness remain false.

## Changed files and rollback

Ten runtime-source files and nine test files carry these corrections. SPEC, this
evidence record, the scoped plan and [whole-PR inventory](IMPLEMENTATION_FILES.md) provide
traceability. No source payload, schema, lockfile, dependency or workflow was changed
in this correction. The inventory excludes ignored generated validation artifacts.

Rollback is a normal reviewed revert of this correction if valid compatibility regresses;
it would reintroduce the listed defects and requires review. Do not force-push, weaken
checks, rewrite scientific evidence or bypass branch protection. This record itself
does not authorize or attest a deployment, merge or production qualification.
