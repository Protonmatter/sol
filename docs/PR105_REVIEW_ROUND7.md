# PR105 observation and calculation-lifecycle corrections

September 12, 2026. These corrections address all six findings in review
`5187910210` of [PR105](https://github.com/Protonmatter/sol/pull/105), starting at
`ce83185496d6a998c6970362e6edf51f891f13d1`. The binding rules are in
[SPEC](SPEC.md); existing RFCs, schemas, numerical methods, source payloads,
dependency locks, coverage thresholds and branch protection remain unchanged.

| Finding | Correction and regression |
| --- | --- |
| Incomplete native observation frames | Simulation and replay share complete frame admission. Missing required metadata cannot turn an otherwise unusable report into Assimilation or produce an invalid snapshot. Actual CLI tests verify Synthetic fallback and successful replay. |
| Discarded assimilated context | Accepted report metadata and context are retained semantically, with only inadmissible frames removed and retained order preserved. Validated activity/freshness context is also serialized at snapshot level. Actual CLI tests verify the retained inputs, activity `0.58`, and replay. |
| Invalid Python row timestamps | Numeric selection sorts parsed instants and excludes explicitly malformed clocks. Missing/null clocks retain the legacy unstamped fallback. Hash-bound source-to-derived tests cover invalid newer records, UTC offsets, fractions, selected evidence and freshness. |
| Boolean Python measurements | Numeric admission rejects booleans and non-finite values or strings. Finite numeric strings remain supported. Persisted-bundle regressions verify the synthetic baseline for boolean-only records, finite fallback and unchanged raw payload bytes. |
| Native UTC grammar mismatch | Ingestion accepts explicit `Z` and `+00:00` with fractional seconds, at Python-compatible microsecond precision. Source strings remain unchanged. Hash-valid source-pointer-to-ingest-to-simulate-to-replay tests cover all spellings, subsecond ordering and both sides of the unrounded 48-hour boundary. |
| Completed calculation shown as cancelled | Pending generation state is separate from displayed results. Surface changes and tab hiding preserve completed/failed/idle status; actual pending work still cancels, and obsolete settlement cannot clear replacement work. Unit and real-browser regressions cover those boundaries. |

## Verification

Each behavioral defect was demonstrated before its correction. Local evidence is
retained under ignored `build/pr105-round7` and `coverage/pr105-round7` directories.
Root inspected the changed implementation and integrated regressions directly.

- `cargo test --workspace --locked --offline`: 189 passed, none failed or ignored.
- `cargo fmt --all -- --check`: passed.
- `cargo clippy --workspace --all-targets --locked --offline -- -D warnings`: passed.
- Python coverage-wrapped unittest discovery: 28 provider and 203 tools tests passed.
  The unchanged selected-module branch-inclusive 90% gate passed at 92% (rounded).
- `node tools/check_node_coverage.mjs --output-dir=coverage/pr105-round7/node-executed`:
  653 passed; executed-module coverage 99.25% lines, 91.99% branches and 96.85%
  functions, against unchanged independent 90% thresholds.
- `python tools/typecheck_web.py`: 68 JavaScript files passed.
- SDLC, documentation, UX structure, static web and diff-whitespace checks passed.
- `python tools/build_wasm.py --locked --out-root build/pr105-round7/wasm`:
  both release WASM modules built successfully with offline Cargo resolution.
- `node tools/experience_validation.mjs --web-root=build/pr105-round7/site --out=coverage/pr105-round7/experience`:
  passed against the rebuilt artifact, including actual view switches, tab hiding,
  completed-state retention and pending cancellation. The new regression failed
  against the previous staged runtime with the incorrect cancelled status.

The local staged artifact is a dirty-tree development build identified by its parent
commit, not final-head CI attestation. Final-head check, release-gate and review
results are recorded on the PR after publication. Required checks must pass without
protection changes before a normal expected-head merge.

## Boundaries

Tests use synthetic offline evidence and local browser execution, not live public
feed acquisition or physical/scientific calibration. Candidate verification does
not authorize deployment: promotion, served-release qualification and rollback
qualification retain their existing holds. No scientific payload was regenerated.
The previous local ARM64 Moon-regeneration limitation remains separate from these
fixes and the hosted Linux checks. Historical absent/null replay context remains
compatible; strict context admission applies to newly assimilated CLI inputs.

## Additional comments on `bda055e`

Review `5188104576` identified six further admission inconsistencies. The correction
keeps the same interfaces, schemas, scientific payloads and protected delivery gates:

- Numeric and count-based Python proxies now use one clock-admission decision;
  malformed-dated region/sunspot/flare records cannot influence counts or activity.
- Numeric timestamps reject compact ISO and nonzero/negative-zero offsets, retaining
  the explicitly supported native legacy forms and `Z`/`+00:00` fractional UTC forms.
- Equal parsed timestamps choose the last original payload position, matching native
  selection. Persisted hash-bound regressions verify selection and original bytes.
- Live JS/Python/native solar admission rejects active regions older than 14 days,
  while accepting the exact endpoint; replay rejection preserves previous output.
- Assimilation requires at least one completely validated attached observation frame.
  Shared cases reject empty observations and empty frame lists while preserving valid
  Synthetic and attributable Assimilation cases.
- Both live Sky validators compare horizontal/equatorial unit directions before
  publication. The one-arcminute consistency allowance is explicit in SPEC and is not
  a scientific accuracy claim. Tests cover incorrect altitude/azimuth/time/latitude,
  cardinal directions, poles, zenith/nadir, wraparound and both sides of the allowance.
  The test-only Moon/compass/provider fixtures now keep their synthetic coordinate
  pairs coherent; no production science data or provider response is rewritten.

The optional server currently supplies approximate mean sidereal/EOP metadata while
Horizons supplies apparent body coordinates. The distinction is documented by the
[Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html#greenwich-mean-sidereal-time).
This change adds bounded intake consistency, not a live Horizons qualification.

Fresh integrated results after these corrections: 191 Rust tests, 239 Python tests
(28 provider, 211 tools) and 657 Node tests passed. Rust formatting and Clippy with
warnings denied passed; 68 JavaScript files typechecked. The unchanged Node coverage
gate passed at 99.25% lines, 92.01% branches and 96.86% functions. The unchanged Python
branch-inclusive gate passed at 92% rounded. Real-browser experience validation passed
against `build/pr105-round8/site`; its WASM binaries reuse the previously verified
build because no engine/WASM source changed in this correction. Final-head hosted CI
rebuilds and verifies the immutable release candidate independently.

## Final timestamp and inactive-signal corrections

Review `5188218419` on `b3900bf` identified two remaining Python/native selection
mismatches. Timestamp parsing and row-clock extraction now retain the exact string
instead of trimming surrounding whitespace into a usable timestamp. F10.7 selection
now excludes only literal `active: false`, matching the native predicate; inactive
source records and diagnostic row counts remain intact. Missing/true activity metadata
remains usable. Neither change rewrites immutable payload bytes.

Direct regressions demonstrated four failures before correction; persisted hash-bound
regressions demonstrated three. All 28 tests in the two affected Python suites then
passed, including padded clocks, newer inactive rows, inactive-only payloads, retained
diagnostics and missing/true controls. The existing native timestamp and inactive-signal
tests also passed unchanged. Final integrated and hosted results are recorded on the PR.
