# Lunar range correction — 2026-11-03

Status: sampled independent range regression corrected; full production
qualification remains open. Requirements: `SOL-SCI-001`, `SOL-TEST-001`.
Base revision is `3a55a795767f3043112673ea561cdaf6dc7e2d0f`; changes are
uncommitted. Existing pointing, DUT1, shader and resource budgets were preserved.

## Defect and correction

`elpmpp02::moon_apparent_ecliptic` retarded the geocentric Moon position but
returned the norm of its initial Earth-co-moving position as apparent range.
That omitted Earth's translation between emission and reception. All eight
captured lunar geocentric/observer ranges failed the predeclared budget; the
maximum residual was 13.927098 km, or 35.082611 ppm. The other 64 body/range
comparisons passed.

The corrected range vector is `Moon_geocentric(emission) +
Earth_heliocentric(emission) - Earth_heliocentric(reception)`, with all three
terms in mean ecliptic/equinox J2000. Its norm restores the missing translation.
Apparent longitude/latitude keep the existing retarded Moon direction, without
adding annual aberration that would double-count the first-order observer effect.
`earth_center` calls `moon_xyz`, so the new dependency does not recurse through
`moon_apparent_ecliptic`. The public tuple and v3 fields are preserved.

The range uses one light-time iteration and heliocentric Earth motion; omitted
Sun barycentric-motion and higher-order effects remain. Native observer range
also keeps the existing terrestrial-vector subtraction along the apparent
direction. It is not an independent observer-specific un-aberrated light-time
solution. That approximation is visible in the sub-kilometre observer residual
below and remains within the declared budget. Angular size, parallax and events
can change slightly because they consume the corrected distance.

## Retained independent evidence

The [range pack](../tests/fixtures/horizons-ranges-20261103/README.md) contains
72 original responses (487,820 bytes), exact request URLs, acquisition times,
source-provider bytes and the pre-acquisition plan. The existing provider's
requests were used unchanged: Earth-geodetic Q2/Q4/Q20 and geocentric Q2/Q20,
for nine bodies at four public-city fixture instants on 2026-07-01. Acquisition
ran on 2026-11-03 from 23:13:29.144363 to 23:14:22.750226 UTC.

[JPL defines Q20](https://ssd.jpl.nasa.gov/horizons/manual.html#definition-of-observer-table-quantities)
as apparent target range with down-leg light time relative to the selected
observer. AU conversion is exactly 149597870.7 km/AU. This pack retains each
target's actual kernel identity and does not relabel every target as DE441.

| Artifact | SHA-256 |
| --- | --- |
| Reference manifest | `3fb7c133e71f070aa9bef087425ab13450e4b419bcb44d0c4117fad8d8f50285` |
| Derived CSV, both copies | `2cf479560c643f17435f4e6c66062d3283cfb4cbce5b2f9168aed5c7cee656db` |
| Original query provider | `0246a19cf1593643deaea8e540831c8d5808854904b27a486761b0ed2e410c15` |
| Pre-acquisition plan | `da29e30a47e4f06b7386af575d2d7702fddfb0c46107d3913b92e93c076acd28` |

The plan declared error <= `max(1 km, 1e-5 * reference range)` before acquiring
or inspecting the residuals. The strict loader verifies the complete matrix,
exact requests, hashes, byte budgets, acquisition intervals, target/center/site,
quantity headers, units, epoch and finite values before use. Every CSV value is
linked back to raw data in Python tests; the identical crate CSV supports native
regression without Python or network. No UI registry entry or validated status
was introduced.

## Observed results

The new Rust regression failed before the correction at Boston/Moon geocentric:
8.216771 km versus a 4.036069 km limit. After correction, all 72 ranges pass.

| Lunar quantity | Maximum absolute residual after correction |
| --- | ---: |
| Geocentric apparent range | 0.009508 km |
| Native approximate observer range | 0.524829 km |

Across the other eight bodies, the largest relative residual is 4.907622 ppm
(Saturn); the largest absolute residual is 11,295.678694 km (Uranus). The
predeclared relative budget reflects this educational, truncated analytic model;
these values are not navigation qualification. Existing captured pointing tests
also pass at the original 10/12 arcsecond limits.

## Provider and reference parser corrections

The provider previously scanned numeric substrings and consumed the first row.
Failing regressions showed that `NaN(12.5)`, `junk12.5`, `12.5oops`, extra numeric
quantities and multiple rows could be accepted. It now requires exactly one
ordered SOE/EOE block, one row and complete numeric tokens in the exact requested
plain-text quantity layout. Invalid/nonfinite coordinates, ranges and kilometre
overflow fail. A rounded full-turn angle is normalized to the equivalent zero.
The existing pointing helper also rejects reversed markers and handles that
rounding boundary. Queries and public response fields are unchanged.

Independent supporting review found the reversed-marker admission gap, which
was reproduced in the provider, range reader and pointing helper. All three
paths now reject it, with negative regressions retained. No recorded raw response
was edited to accommodate the stricter parsers.

## Local validation and retained artifacts

Final local checks passed: **196 Rust workspace tests, 541 Python tests, 39
provider tests and 1,420 Node tests**, plus fmt and clippy with warnings denied.
Both native captured matrices and the two actual offline CLI gates pass. The
configured Python coverage scope passes at 91%; Node line/branch/function gates
all exceed 90%, and merged whole-web line coverage is 97.54%. Local coverage.py
is still 7.13.5 versus CI's 7.15.2 pin. Rust coverage was unmeasured at this
checkpoint; the later [local LLD run](RUST_COVERAGE_20261103.md) passed at 95.32%
with all 196 tests, without changing Rust source or the coverage policy.

The staged Chromium suite passes runtime/visual assertions and actual WASM worker
flows. The expanded native physical run passes context restoration, L4 terrain,
physical optical fields, animated Mars, matching HDR final draws and a 390-pixel
viewport. Its existing application context identifies Qualcomm Adreno X1-85
through ANGLE D3D11. There were no page, console, shader-compilation or WebGL
errors. Six actual Mars animation draws were retained at distinct epochs;
deadlines and draw/source checks were unchanged. This single-host observation
does not replace the cross-platform/manual matrix.

The candidate ephemeris WASM SHA-256 is
`aa2ecdf33c2ffb74a0bba12fc7fb160e41d9b99c2005b15059e6f22739d58f5c`
(502,238 bytes); the solar WASM remains byte-identical to its earlier qualified
local artifact. Both captured CSV files are included in Cargo's package list.
No coefficient table or shader source was changed.

Independent read-only math and supporting-code reviews corroborated frames/sign,
finite dependency flow and the raw numeric references. The reported block-order
P2 was reproduced and corrected in all three parser paths; final review found
no remaining actionable findings in this scope.

### Native timing comparison

An isolated original-commit Rust build and the candidate were exercised in
alternating fresh processes, with one warm-up and three measured runs per
binary/case. Original sources were extracted from the base commit; archive
SHA-256 is `e702cf76f45b7c03de5c87ad2d37cb2972bcb34bb96fa2ed9c6dd9b28ec91659`.
The added Earth/ELP evaluations have a measured cost:

| Full snapshot | Baseline median | Candidate median | Median increase |
| --- | ---: | ---: | ---: |
| Modern Boston | 0.759476 s | 0.828020 s | 9.03% |
| Year 1, south pole | 0.631516 s | 0.685868 s | 8.61% |
| Year 9999, north pole | 0.995526 s | 1.037946 s | 4.26% |

The maximum measured candidate time was 1.071772 s. These are bounded native
functionality/timing observations, not historical accuracy, browser latency or
cross-device SLO certification. Browser/WASM deadline behavior is separately
exercised by the staged browser suite. No worker deadline was increased.

```text
cargo test --workspace --locked --offline
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
python -m unittest discover -s tests/python -p test_horizons_ranges.py
python -m unittest discover -s services/ephemeris-server -p test_*.py
python tools/validate_ranges.py --report build/horizons-ranges-supported-20261103.json
python tools/validate_ephemeris.py --reference-dir tests/fixtures/horizons-observer-20261103 --report build/horizons-pointing-after-range-20261103.json
node tools/check_node_coverage.mjs --output-dir=coverage/NEW-range-node-executed
node tools/collect_node_coverage.mjs --web-root=build/production-20261103-range-site --output-dir=coverage/NEW-range-node
node tools/browser_validation.mjs --web-root=build/production-20261103-range-site --output-dir=coverage/NEW-range-browser
node tools/physical_rendering_validation.mjs --web-root=build/production-20261103-range-site --out=coverage/NEW-range-native --backend=native --context-loss --mars-optical-animation --terrain-close-detail
```

Ignored before/after characterization reports and the strict offline report are
under `build/horizons-range*-20261103.json`. Raw acquisition remains separately
under `build/horizons-ranges-existing-20261103`. Logs are retained in the parent
workspace as `sol-range-*-20261103.log`. The newly staged runtime is
`build/production-20261103-range-site`, release `local-production-range-20261103`,
manifest SHA-256 `14f9cc29e37f6e77c45496cc297dd5265ec8a039cfb9208863f885e30f824082`.
Fresh execution, coverage and native receipts are retained under
`coverage/production-20261103-range-*`; the timing report is
`coverage/production-20261103-range-native-timing.json`. Use new output roots for
reproduction. The Windows browser command requires `CHROME_BIN` pointing at the
installed Chrome; observed Chrome was 156.0.8078.48 on Windows ARM64. Local Node
was 24.18.0 and Python 3.14.3, so pinned CI/platform qualification remains separate.

## Scope and rollback

The [20261104 validator hardening](PYTHON_SCOPE_VALIDATORS_20261104.md) changes
`validate_ranges.py --report` admission: choose a fresh ordinary file strictly
below this checkout's unredirected `build/` or `coverage/` directory. Existing
reports, source paths, reserved directory roots and paths redirected outside the
permitted roots are rejected.
The check is repeated before publication, and the file is created exclusively.
Pointing/range values and acceptance limits are unchanged. The apparent and
vector validator CLIs use the same report-publication guard.

The four instants/sites do not qualify continuous or historical accuracy,
heliocentric vectors, events, physical visibility or navigation. UI evidence
status remains unvalidated. Upstream notice/distribution correspondence,
complete platform/manual and
release qualification remain held in [status](STATUS.md).
The later [native moon source refresh](CANONICAL_MOON_REFRESH_20261104.md)
qualifies the separate current moon-asset generation contract with reviewed
pending and strict image runs. The original20261103 packet remains historical.

Rollback reverses only the lunar range correction, new range fixtures/tests/tools
and the parser corrections with their associated documentation. Preserve the
earlier catalogue-moon time, native optics, evidence and coefficient-recovery
work. Never replace or regenerate coefficient tables to roll back this change.
No production deployment or registry publication ran.
