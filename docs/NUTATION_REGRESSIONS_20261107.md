# Scientific regression oracles — 2026-11-07

Status: test-only correction applied locally. Production nutation remains the
four-term implementation. The full-series prototype remains a separate experiment;
no numerical table, physical model, license, dependency or accuracy budget changes.
The original 76-pass/three-fail prototype receipt is retained unchanged.

## Problem and resulting tests

The [initial nutation characterization](NUTATION_CHARACTERIZATION_20261107.md)
found three regression failures after an isolated numerical-model substitution.
Two tests compared Sun events with hard-coded roots of the retained four-term
model. The third required one fixed observer to remain at exact stellar zenith.
Those values move when the reduction model changes, while the tests' intended
computational properties still need protection.

Only `#[cfg(test)] mod tests` in `crates/solar-ephemeris/src/lib.rs` changes:

- The Sun oracle samples each known coarse-grid gap at one-second intervals,
  interpolates actual sign changes and confirms opposite signs at +/-0.01 seconds.
  It calls neither the production event finder nor its bisection/extremum helpers.
  The original **0.1-second comparator**, dates, observers, negative coarse-grid
  samples, crossing-side checks and half-open day remain.
- The short-night test independently checks the early rise and both near-midnight
  crossings. It explicitly requires the first rise, rather than selecting the
  later rise near midnight. Historical model-specific root values remain in comments.
- The zenith test constructs the observer by independently inverting the polar
  rotation of its geodetic normal. It tests every one of the 108 catalogue stars
  under the current model with the unchanged **2e-6-degree** altitude tolerance.
  The original fixed observer remains a public-snapshot finiteness regression,
  and a separately constructed Alshain observer exercises a current exact zenith.

These are numerical oracles for the configured model. They do not validate real
star positions, physical event times, refraction or a continuous crossing census.
The bounded Sun helper deliberately rejects an exact one-second sampled zero;
if these retained cases change that way, their oracle needs explicit review.
Existing exact-boundary and tangency tests remain unchanged.

## Independent construction and fault controls

A separate native probe observes the actual Sun threshold scalar and stellar
apparent directions. It contains no event-finding or inverse-observer oracle.
An offline full-day census samples 86,401 times per case, two cases per model,
for **345,604 finite samples** across current and full-series variants. Each model
has two short-day crossings and three short-night crossings. All are covered by
the bounded test windows; all ten interpolated roots have the expected signs
inside independently queried 0.02-second brackets.

The independent Python observer construction applies the inverse 3D polar
rotation. Native forward evaluation places all 216 model/star combinations
within 8.54e-7 degrees of zenith. An independent reviewer repeats the construction
with the transpose of the complete 3x3 rotation matrix and obtains agreement
within 1.43e-14 degrees in latitude, with longitude equal modulo 360 degrees.

| Private variant | Result | Interpretation |
| --- | --- | --- |
| Current model with revised oracles | 78 library unit tests pass | Existing model and unchanged tolerances |
| Full-series prototype with revised oracles | 79 library unit tests pass | Includes its separate full-series reference check; not production adoption |
| Prototype with only altitude clamp removed | Zenith regression fails at a constructed Betelgeuse observer | New construction still detects the inverse-sine roundoff failure |
| Prototype with only grazing recovery disabled | Both Arctic regressions fail | New event oracles still detect crossings hidden between coarse samples |

Positive runs have no ignored or filtered cases. Both negative commands retain
their expected exit 101 and failed assertions. The prior failed prototype is a
different test-source cohort; its receipt and source are not rewritten or relabelled.

## Verification of the applied change

The applied source matches the independently reviewed proposal. Its **44,386-byte
production prefix is byte-identical**, and both diff hunks are inside the test
module. Fresh builds verify the stronger binary-level result: both product WASMs
exactly match the existing stage05 artifact.

| Main-check command | Result |
| --- | --- |
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | Pass |
| `cargo llvm-cov --workspace --all-features --locked --offline --fail-under-lines 90 --lcov ...` | All 234 workspace tests pass; no ignored tests |
| `cargo llvm-cov report --summary-only` | LLVM reports 8,941/9,313 lines, 96.01%, above the unchanged 90% floor |
| `python tools/validate_accuracy_evidence.py` | Eight bounded source-theory parity records pass; no independent accuracy promotion |
| `python tools/build_wasm.py --out-root ...` | Both rebuilt binaries match stage05 exactly |

The Windows ARM64 run uses existing Rust 1.96.0, pinned cargo-llvm-cov 0.6.16 and
the previously documented child-process LLD linker override. No tools are
installed. Coverage maps all 34 reported workspace source files to the frozen
input hashes. The reported LLVM line metric remains distinct from unique LCOV
line-entry diagnostics.

| Unchanged binary | SHA-256 |
| --- | --- |
| `solar_ephemeris.wasm` | `344f18dd7ce87a98762e284576a920543740dea3358473541657eab58f642c2c` |
| `solar_wasm.wasm` | `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199` |

Source remains frozen through terminal check collection and WASM comparison.
Subsequent report edits have their own snapshot. The unchanged artifact retains
its earlier source-archive construction cohort; final delivery still requires
regenerated source/archive correspondence from the selected reviewed checkout.

## Evidence, limits and rollback

Evidence is retained under
`build/nutation-regression-oracles-20261107-9917a6d9216244b9a1d76764433b8183/`:

- `observation-receipt.json`, `oracle-construction.json` and `oracle-analysis.json`:
  complete day scans, native facts, independent constructions and confirmation points.
- `test-variants-receipt.json`, input inventories and positive/negative logs:
  both models and both controlled faults.
- `application.json`: exact backup, before/after hashes and production-prefix proof.
- `main-checks-receipt.json`, `main-rust.lcov` and `source-after-main-checks.json`:
  complete commands, exits, coverage ownership, frozen sources and WASM identity.

The initial proposal patch used CRLF while source uses LF. It is preserved;
`main-test-proposal-lf.patch` is a separate corrected patch that passed ordinary
check/application without whitespace overrides. The full reviewed source matches
the applied file exactly.

Restore only the two test hunks with a checked reverse application of that LF
patch; preserve unrelated Rust changes. Remove this new report and reverse the
characterization cross-reference changes separately. Exact backups remain under
the audit's `before-main/` directory; whole-file restoration requires matching
the recorded applied hashes to avoid overwriting subsequent work.

This pass changes no application behavior, Illustrative Earth, orbital data,
source image, public license or accuracy status. It does not select or qualify
the full-series prototype. Source/attribution, observer/event references, WASM
and browser/performance qualification for a future numerical change remain
separate. The whole-driver 200 ms hold, physical/manual/hosted/release acceptance
and the broader production-readiness goal remain open. No commit, push or
deployment occurs.
