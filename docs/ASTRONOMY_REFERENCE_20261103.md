# Astronomy reference follow-up — 2026-11-03

Status: bounded independent pointing regression added; production qualification
remains incomplete. Requirements: `SOL-SCI-001`, `SOL-TEST-001`.
Base revision: `3a55a795767f3043112673ea561cdaf6dc7e2d0f`; changes are uncommitted.
This follow-up preserves the [moon-time correction](PRODUCTION_READINESS_20261103.md)
and [native optics correction](NATIVE_OPTICS_20261103.md).

## Evidence-gate defects corrected

`tools/validate_accuracy_evidence.py::main` previously reproduced source vectors
without binding the record's method, quantity, time scale, observer domain,
symbol or metric to that calculation. Relabelled source parity could pass as
another evidence domain; duplicate/blank IDs and changed thresholds could also
pass. A nonfinite native vector bypassed comparisons through NaN. Body/epoch
checks used assertions, which Python optimization removes.

The validator now admits exactly the existing eight-record TOP2013 parity
matrix, pins its metadata and 0.5 arcsecond relative-vector threshold, verifies
finite native output and exact sample identity, and uses explicit errors for
body/epoch mismatches. The registry, source literals and accepted UI status were
not changed. Adversarial tests reproduce the rejected cases, including under
`python -O`; the actual native example is also replayed separately.

`tools/validate_ephemeris.py::angular_sep` also accepted NaN directions as zero
separation through Python's min/max clamp. It now rejects nonfinite directions.
The response parser requires exactly one epoch row, all five requested finite
quantities, and their physical domains. Multi-row, missing/extra quantity,
nonfinite and out-of-domain references fail visibly.
The parser reads the exact CSV quantity columns and whole numeric tokens;
regressions proved that the prior substring scan accepted `NaN(10.0)`,
`junk10.0` and `10.0oops` as a coordinate. All three are now rejected while
the original 36 captured responses continue to pass.

## Raw reference acquisition and identity

The existing helper's exact 36 queries were executed once and their returned
UTF-8 response bytes retained, without adding targets, sites or quantity types.
These are nine bodies at Boston, Sydney, Reykjavik and Nairobi public fixture
sites, at four instants on 2026-07-01. They are not the user's coordinates.
Acquisition ran from `2026-11-03T22:09:11.379948+00:00` through
`2026-11-03T22:09:38.219587+00:00` using NASA/JPL Horizons API 1.2.

The [reference pack](../tests/fixtures/horizons-observer-20261103/README.md)
contains 36 raw responses (313,300 bytes), exact request URLs, acquisition times,
per-response hashes and the acquisition helper's original bytes. The headers
retain each target's ephemeris identity, observer, Earth center, airless
convention, calendar, time representation and EOP source. Queries request
[observer quantities 2, 4 and 49](https://ssd.jpl.nasa.gov/horizons/manual.html):
apparent RA/Dec, azimuth/elevation and DUT1. They do not request ranges or events.

| Item | SHA-256 |
| --- | --- |
| Manifest | `8b8e20120a58853dde34759faffb01bc15a94793740b80721aa7c38cafb39ecd` |
| Original acquisition helper | `5a2603124c97d3f53e7119576ce28ca072610543a71c3f04c3fba733191a0d31` |
| Derived observer CSV, both copies | `dfd0989455dfc4292cc92bd00690c360c837aba936b5fb169fcafed115fea93d` |

The new `tools/horizons_reference.py` loader validates the complete request
matrix, exact query associations, paths, bounded file sizes, hashes, acquisition
intervals and raw target/center/site/API/airless headers before exposing immutable
responses. It rejects duplicate metadata, missing data and unlisted files.
Offline replay has no network fallback; tests prohibit network access and prove
that a damaged pack aborts before engine execution. Hashes bind reviewed bytes,
not the scientific truth of an arbitrary rehashed replacement.

The native test consumes the identical crate-local CSV. A separate Python test
links every derived value and raw hash back to the acquired responses. The CSV
is included in Cargo's package file list, so the regression remains available
in an unpacked crate. No external dependency was added.

## Observed residuals and scope

The actual release `sky` binary passed all 36 captured comparisons offline.
The same raw data also passed replay through the original acquisition helper.
The native Rust regression passed with the original thresholds.

| Measurement | Maximum observed | Unchanged acceptance threshold |
| --- | --- | --- |
| Topocentric apparent RA/Dec great-circle separation | 3.702930 arcseconds | 10 arcseconds general; 12 for Moon |
| Airless alt/az great-circle separation | 3.836795 arcseconds | 10 arcseconds general; 12 for Moon |
| Absolute altitude residual | 3.449204 arcseconds | 10 arcseconds general; 12 for Moon |
| DUT1 residual | 0.287547 milliseconds | 3 milliseconds |

These four instants/sites on one day do not establish seasonal or continuous
accuracy, heliocentric vectors, range accuracy, event times, catalogue-star
accuracy or physical visibility. The v3 registry still holds eight source-theory
parity records only, and the UI continues to withhold validated status. No
Moon range counterexample was reconstructed or treated as external truth.

The accuracy contract now distinguishes the measured topocentric quantity from
the intended independent heliocentric vector budget. The earlier table's
heliocentric label was not supported by the observer helper. The intended
10 arcsecond independent vector budget remains held; no tolerance was relaxed.

## Validation and retained artifacts

The following checks passed locally on the previously recorded Windows ARM64
toolchain. All 522 Python tests passed, including the 16 added regression tests;
the 36 provider tests also passed. Fresh statement/branch coverage passed the
unchanged configured Python include list and 90% gate, reporting 91% aggregate.
This is the policy's selected production denominator, not a claim of 90% coverage
for every validation tool. Local coverage.py remains 7.13.5 versus CI's 7.15.2 pin.
The complete Rust workspace tests passed, as did fmt and clippy with
warnings denied. Documentation links/style, SDLC and web static checks passed.
Independent read-only review of the evidence changes and final CSV parser found
no actionable defects; the reviewer reran the focused Python suites, native
captured-matrix regression and actual offline CLI checks.
Both production WASM engines were rebuilt offline and are
byte-identical to the earlier rendering candidate:

| Engine | SHA-256 |
| --- | --- |
| `solar_ephemeris.wasm` | `58bc13046f78ad3a94bf6ce10f371a244d61c8791dab28de8868df79fb229155` |
| `solar_wasm.wasm` | `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199` |

Only the Rust test module changed; production numerical code and coefficient
tables were preserved. Identity evidence is retained in ignored
`coverage/production-20261103-astronomy-wasm-identity.json`; the offline replay
report is `build/horizons-offline-report-20261103.json`. Logs are retained in
the parent workspace as `sol-astronomy-*-20261103.log` and
`sol-horizons-*-20261103.log`.
Fresh Python coverage is `coverage/production-20261103-astronomy-python.xml`,
with exact scope/results in `sol-astronomy-coverage-report-20261103.log` in
that parent workspace. The [extended rendering matrix](RENDERING_MATRIX_20261103.md)
records seven further passing validators against the same runtime artifact.

```text
python -m compileall -q tools/horizons_reference.py tools/validate_accuracy_evidence.py tools/validate_ephemeris.py tests/python/test_accuracy_evidence.py tests/python/test_horizons_reference.py tests/python/test_ephemeris_helper.py
python -O -m unittest discover -s tests/python -p test_accuracy_evidence.py
python -O -m unittest discover -s tests/python -p test_horizons_reference.py
python -O -m unittest discover -s tests/python -p test_ephemeris_helper.py
python -m unittest discover -s tests/python -p test_*.py -v
python tools/validate_accuracy_evidence.py
python -O tools/validate_accuracy_evidence.py
cargo test --workspace --locked --offline
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
cargo package -p solar-ephemeris --list --allow-dirty --locked --offline
python tools/validate_ephemeris.py --reference-dir tests/fixtures/horizons-observer-20261103 --report build/horizons-offline-report-20261103.json
python tools/validate_docs.py
python tools/validate_sdlc.py
python tools/validate_web_static.py
git diff --check
```

The offline helper requires the installed `sky` binary; build it with
`cargo build --release --locked --offline -p solar-ephemeris --bin sky`.
Set `CARGO_NET_OFFLINE=true` when invoking `tools/build_wasm.py` for an explicitly
offline build. The default helper remains the existing live 36-query check.

## Remaining work and rollback

Independent heliocentric vector, range and event qualification, coefficient
provenance and the manual,
cross-platform and release holds in the earlier reports remain open. This
follow-up does not certify a release, change a production tenant, publish,
commit or push anything.
At this checkpoint Rust coverage was unmeasured. The later
[local coverage follow-up](RUST_COVERAGE_20261103.md) passes the unchanged line
gate at 95.32% with all 196 tests, using Rust LLD on Windows ARM64. Hosted CI
qualification remains separate.
The later [native moon generation report](CANONICAL_MOON_20261103.md) also
qualifies the current moon-asset contract using two reviewed exact-image runs;
continuous independent astronomical accuracy remains a separate hold.

Rollback reverses only the new offline loader, helper/evidence-gate changes,
captured fixtures, crate-local CSV, regression test and associated documentation.
Preserve the earlier moon-time, rendering and optics changes and any unrelated
working-tree edits. No deployed service or live data store was changed.
