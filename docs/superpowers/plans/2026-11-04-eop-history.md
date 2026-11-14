# Measured Earth-orientation history implementation plan

**Goal:** Replace the seven-day EOP sample and old forecast approximation with
the complete admitted IERS/USNO daily Bulletin A series, preserving v3 interfaces
and explicit uncovered/predicted status.

**Requirements:** `SOL-SCI-001`, `SOL-DATA-001`, `SOL-TEST-001`, existing observer
pointing/DUT1 budgets and [event-quantity diagnosis](../../EVENT_QUANTITIES_20261104.md).

## Source and specification

The already acquired official `finals2000A.all` is 3,775,228 bytes, SHA-256
`f7c0e9e5033b92ecd2488cf20cdf015c8aa2229f3153eceafd17d862b19fc961`.
Its published SHA-512 was checked between identical before/after checksum files.
The [published format](https://maia.usno.navy.mil/ser7/readme.finals2000A)
identifies Bulletin A x/y polar motion, DUT1, their errors and individual I/P flags.
Use only the selected Bulletin A fields; do not splice Bulletin B or apply the
unrelated celestial-pole offsets to the existing nutation reduction.

The 20,031 complete daily rows span MJD41684–61714. Both selected series are
observed through MJD61342, then predicted. Fifty trailing date-only rows do not
extend coverage. The source starts1973-01-02; it supplies no EOP guarantee for
earlier dates or the entire1900–2200 precision target.

**Runtime policy:** Preserve exact knots. Use a four-point local polynomial
within the admitted table, with edge windows inside coverage. Interpolate
continuous UT1−TAI, then restore the requested UTC offset from the owning leap
table. Keep observed-only interpolation windows inside observed data; any
contributing predicted row makes quality predicted. Outside coverage, invalid
input or invalid embedded data returns the existing explicit degraded result.
Do not extrapolate or clamp. Propagate reported DUT1 formal errors using
absolute interpolation weights; document that these exclude interpolation and
unmodeled subdaily terms, rather than claiming calibrated total uncertainty.

The [IERS interpolation guidance](https://maia.usno.navy.mil/information/iers-gaz13.txt)
uses four-point local interpolation and additional high-frequency corrections.
This bounded data update does not claim full subdaily IERS realization.

## Architecture, scope and risk

Medium-risk numerical/data patch. Add strict stdlib-only offline parser/generator,
immutable source fixture/manifest, compact little-endian binary table and
regressions. Modify `earth_orientation.rs`, relevant clock regression expectations,
freshness/data admission checks and documentation. No new application network
call, dependency, public schema, orbital formula, coefficient or license change.
The existing Rust1.96.0 qualification compiler and Rust1.85 compatibility
declaration remain separate.

## Tasks

- [x] Freeze exact source/format/acquisition/checksum records and line-ending policy.
- [x] Add failing parser, data-correspondence, coverage, flags and leap controls.
- [x] Implement complete fixed-width admission and deterministic binary serialization.
- [x] Reproduce the blob twice; check source, output and runtime coverage metadata.
- [x] Implement bounded runtime lookup, four-point interpolation and leap handling.
- [x] Pass all daily-knot checks, all25 leap boundaries, observed/predicted/endpoints, malformed data and synthetic interpolation cases.
- [x] Replay the retained17,292 JPL diagnostics with the original3ms/10″/12″ controls; retain the failed predecessor report.
- [x] Run existing Rust/Python/Node, coverage, precision and staged WASM/browser checks appropriate to the final source.
- [x] Obtain independent read-only review and record measured outcomes, remaining limits and rollback.

Use existing `cargo test --workspace --locked --offline`, fmt/clippy, Python
unittest discovery and configured coverage floors; the full precision validator
and captured observer/range references; existing WASM/web builders and browser
validators. No hosted dispatch or production activation is authorized by this
plan. Keep failed/partial reports and use fresh build/evidence destinations.

The runtime integration additionally reproduced and corrected a small-offset
clock-admission defect, periodic-angle decimal rounding and binary64 remainder
endpoints. Each has focused regressions; the final native/reference/artifact
links, exact test populations and unchanged thresholds are recorded in the
[implementation report](../../EOP_HISTORY_20261104.md). Source/data coverage
limits and broader production qualification remain explicit.

Rollback must restore the EOP data, runtime lookup, associated metadata and
regressions together, then rebuild/requalify an exact artifact. Preserve all
unrelated accumulated work and the immutable before/after evidence.
