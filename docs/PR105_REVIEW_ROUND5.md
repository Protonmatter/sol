# PR 105 admission and review corrections

## Scope

September 12, 2026, branch `codex/sol-correctness-experience`, starting at
`34f8bc356a002d9bc88804f5052ba45c9c11f125`, targeting `master`. This patch addresses
the seven distinct open review findings, including a duplicated replay thread.
It preserves public interfaces, schema versions, historical v2 readers, committed
scientific payloads, coverage floors and branch protection. No dependency, live feed,
merge, deployment or production authority is introduced.

The [implementation plan](superpowers/plans/2026-09-12-pr105-comment-contracts.md)
and [admission specification](SPEC.md#admission-consistency) record the contracts.
This document records local evidence; final-head hosted CI and persisted review state
must be checked on [PR 105](https://github.com/Protonmatter/sol/pull/105).

## Findings and verified corrections

| Severity | Review finding | Correction and regression |
| --- | --- | --- |
| P2 | Standalone replay accepts UNKNOWN provenance; comments 3995048484 and 3995048487 | Rust, Python and browser v3 intake share each language's pure attribution predicate. A 47-case literal corpus exercises real CLI replay/simulation and raw/structured browser admission; rejected replay preserves the existing output. |
| P2 | Standalone simulation admits U+001C-padded UNKNOWN; comment 3996987188 | Simulation uses the same explicit whitespace and Unicode-lowercase rule. Valid source text, including U+FEFF, is not rewritten. Valid C1 characters also survive native serialization; unescaped JSON U+0000–U+001F remain rejected. |
| P1 | Series frame payload disagrees with advertised metadata; comment 3995048490 | All three bundle readers bind available index/stage/activity/region count to the validated snapshot and array position. Eight rehashed negative cases reject; valid gaps and illustrative months remain supported. |
| P2 | Future cached observations reported fresh; review 5185142288 | Unrounded negative ages and ages above the per-feed limit are stale. One-second bounds and the exact inclusive endpoints are tested. Original rows remain retained with explicit future warnings; offset timestamp labels are converted to UTC. |
| P2 | Compass text disagrees with accepted azimuth; comment 3996987189 | Browser/Python v3 guards enforce all 16 sectors, exact midpoints clockwise. The provider derives labels from normalized serialized azimuth and uses cache v6 to avoid reusing old malformed pairs. Both rounding boundaries and old-cache isolation are tested offline. |
| P2 | Feed sources not bound to source manifest; comment 3996987194 | All readers require the exact ordered retained-product projection, including product ID, status, origin and timestamps. Eleven rehashed mutations reject; absent acquisitions stay in source failures without invented feed rows. |
| P2 | Bundle admission omitted from science identity; comment 3996987196 | `dataBundle.js` and extracted `sourceAttribution.js` participate in the scientific component hash and change classifier. Built-manifest tests isolate science-only qualification scope, include a baseline acceptance and UI-only control, and retain unchanged data/WASM identities. |

Each correction has failing-before/passing-after evidence. The source corpus originally
produced 37 invalid-source acceptance cases in Python and JavaScript and two failing
native CLI tests. Rehashed bundle tests originally admitted all 19 semantic mutations;
the browser also replaced its previous publication. Freshness originally failed 28
subcases plus two offset-label cases. Compass tests exposed label admission, serialized
rounding and old-cache reuse. These are behavioral regressions, not checks that merely
assert helper names or implementation strings.

Independent review found no actionable issue in the final attribution/bundle and
freshness/fingerprint diffs. A review suggestion strengthened qualification tests with
separate manual/UI and scientific/science scopes. A separate static run found the new
module's missing preload; it was added and the static gate then passed. Root review
also checked the compass producer/consumer relation and the complete changed diff.

## Local validation

Environment: Windows ARM64, Node 24.18.0, Python 3.14.3, Rust 1.96.0 and Chrome
151.0.7922.174. These results do not replace Linux/Node 22/Python 3.12 hosted checks.

| Command or gate | Result |
| --- | --- |
| `cargo test --workspace --locked --offline` | 179 tests passed; zero failures/skips |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | Passed |
| `node tools/check_node_coverage.mjs --output-dir=coverage/pr105-comments-final/node-executed` | 639 tests passed; lines 18,982/19,125 (99.25%), branches 3,528/3,842 (91.82%), functions 491/507 (96.84%); each unchanged 90% floor passed |
| Existing two `coverage run --branch` unittest discovery commands | 28 provider and 198 tooling tests passed; 226 total |
| Python configured coverage report and retained XML | 92% aggregate across 19 files; existing 18 files plus extracted `observation_provenance.py` (100%) |
| `build_wasm.py --locked` with `CARGO_NET_OFFLINE=true` | Both engines built; source web assets unchanged |
| `browser_smoke.py` against fresh `/sol/` staged candidate | Sun, My Sky and interactive 3-D System passed |
| `browser_validation.mjs` against same candidate | Chromium execution, WebGL geometry/colors and moon shadow/eclipse pixel assertions passed |
| Denominator-complete Node plus Chromium coverage merge | All 61 handwritten runtime files retained; 9,544/9,778 lines (97.60%); 90% floor passed |
| `experience_validation.mjs` against fresh root-mounted staged preview | Sun/System interactions, disclosure, reflow and failure recovery passed |
| `sky_validation.mjs` against same root-mounted preview | Actual worker, keyed focus, consent/revocation, recipient failure, sharing, cancellation and reflow passed |
| Syntax/type/docs/static/UX/SDLC | 69 web JS syntax checks, 68 typechecked modules, references, preload inventory, UX structure and 16 SDLC requirements passed |
| Offline source/corpus/determinism | Stars, geography, body constants/motion, EOP window, snapshot/readiness/notebook structure, source-evidence identity and exact fixture/series regeneration passed |
| `git diff --check` | Passed |

The whole-web denominator includes the new attribution helper and the service worker's
137 unexecuted lines. Nothing was removed from coverage to obtain a pass. Both Python
coverage include lists were expanded so extraction cannot hide formerly measured code.

The actual generator-to-CLI round-trip used a synthetic immutable source bundle with
three one-second-future observations and a fixed evaluation clock. It retained original
offset provenance and F10.7 value 150, labelled all feeds stale, and emitted correct UTC
diagnostic times. Actual `solar-cli simulate` reported `assimilated=false`, zero freshness
gain and Synthetic mode. Fields/uncertainty exactly matched the no-observation baseline;
both generated snapshots passed v3 and research-readiness validation.

The `/sol/` staged candidate manifest hash is
`ea2831084cc92127eb7bcba44cf10fc7f36485fc4d904348ccb2bdd396f05910`.
The root-mounted UX preview manifest hash is
`4c53c120033b168680cdf6db29128240a70a587e1a6b03fb07ceb5a656c45d18`.
They are separate local builds of the same reviewed runtime source/WASM, labelled with
parent-commit lineage plus uncommitted changes, not final-commit release attestations.
Ignored logs, screenshots, coverage and independent reports are under the
`build/pr105-comments-*` and `coverage/pr105-comments-final` paths.

## Failed attempts, limits and remaining release gates

- The first extra UX runner attempt timed out because its local server does not mount
  `/sol/`; retained request evidence shows the unserved namespace. The root-mounted
  preview then passed. The separate smoke/visual coverage runner did verify `/sol/`.
- `python tools/validate_moons.py` fails locally because generated bytes differ from
  reviewed hashes on Windows ARM64/Python 3.14.3, as already documented in
  [canonical generation](CANONICAL_GENERATION.md). Authoritative moon bytes, source
  data, hashes and tolerances remain untouched. The Linux CI check is still mandatory;
  this document does not claim canonical cross-platform qualification.
- Ninety inventoried tracked data/source/generated-asset hashes were unchanged. No
  scientific payload was regenerated in place to satisfy a validator.
- Live public providers, physical accuracy, assistive-technology/manual accessibility,
  production Pages bytes, protected scientific/manual qualification, promotion and
  rollback remain unvalidated. The operational-readiness negative gate still rejects
  operational use, as intended.
- Final publication must verify the exact new head's four required checks and every
  prerequisite of the complete release gate, then re-fetch review state and resolve
  addressed threads. Prior green CI cannot be borrowed by this patch.

## Changed files and rollback

Runtime changes are confined to standalone and bundle admission, cached-feed freshness,
compass serialization/validation, and release classification. New files are pure shared
predicates, literal regression fixtures/tests, and documentation. The complete path/hash
table is [implementation inventory](IMPLEMENTATION_FILES.md).

Rollback is a normal reviewed revert of this scoped patch if valid producer compatibility
regresses. Do not bypass protection, lower floors, alter source evidence, clear old cache
files indiscriminately or force-push. Reverting would reintroduce the listed admission
defects and therefore requires explicit review; no deployment was performed here.
