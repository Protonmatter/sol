# Monthly observer regression — 2026-11-04

The current candidate passes 2,160 comparisons against 432 original Horizons
observations: 12 monthly 2026 epochs at four sites, for nine bodies. Current
original-CLI observations, a native Rust regression and independent reconstruction
pass. These are sampled seasonal results, not continuous 1900–2200 qualification.

## Frozen design and capture

Before acquisition, the plan fixed the 15th of each month at Boston, Sydney,
Reykjavik and Nairobi, retaining each site's existing coordinates, elevation and
odd-second UTC time. Targets are Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn,
Uranus and Neptune. The 36 serial queries batch 12 epochs each, using explicit
Gregorian UT/JD, geodetic sites, airless output and quantities 2/4/20/49, following
the [JPL API](https://ssd-api.jpl.nasa.gov/doc/horizons.html#tlist-parameter).

Limits remain 10 arcsec for Sun/planets, 12 arcsec for Moon, 3 ms for DUT1 and
`max(1 km, 10 ppm * reference range)` for distance. No tolerance was fitted to
these residuals. No network path is added to the application or offline admission.

The first capture stopped after six replies because its guard wrongly assumed
every Earth-center kernel was DE441. All four sites in the historical corpus
already identify target-specific Jupiter/Neptune Earth kernels. The explicit
amendment binds those identities, preserves the failure and six raw bytesets,
then fetches only the remaining 30 queries. Dates, sites, quantities, model and
budgets are unchanged. Five capture times remain their recorded instants; the
sixth remains interval-bounded without an invented exact timestamp.

## Offline integrity and native checks

The 46-file fixture retains all 36 raw replies (354,484 bytes), frozen plan,
query/helper snapshots as text, amendment, both acquisition states and derived
CSV. Admission never executes snapshot helper text. Actual archived API identity
is 1.2; a documentation version does not replace the observed response version.

`tools/horizons_observer_seasonal.py` bounds reads and checks metadata, plan,
amendment, acquisition, query, file, source, site, epoch, quantity, unit and capture
correspondence. It rejects duplicate/non-JSON metadata, malformed CSV, nonfinite
or out-of-domain values and incomplete grids. Parsed rows are immutable; both
requested and returned JD are retained. The derived and crate CSVs match exactly.

| Artifact | SHA-256 |
| --- | --- |
| Predeclared plan | `7d5c6df57cf8994aecef9867848ecda36964a800cf360c2e8369d76c14a05bf3` |
| Provenance amendment | `a07ddeacc639bbb98d0f9a4105404c5726f17be4e0d502d1c04138efe3c68fa3` |
| Acquisition | `261fe4cbbe78d791f36b7aca37e09a678d9f54074088749065fd20fc4dff3f59` |
| Fixture manifest | `afc6cb1363f9b82a0ae8a1d0694a729784803c41c80c8ae9a0747ec69e5b2dac` |
| Derived/crate CSV | `8b42182fc48f7bddcb90b8231e73d48c62db03f03ecfb58e4b55cebdb58e5edc` |
| Admission module | `9555933dabf1ea21b48a7c3cba668e721965ae34a8b95056f18f02586fcf61c3` |

All 11 admission tests pass, including rehashed/missing/duplicated metadata,
wrong source/site/epoch/units, byte limits, nonfinite values and quoted CSV errors.
The required coverage commands and scope inventory include the new module:
50 modules, the same 37 hash-pinned legacy exclusions and unchanged 90% floor.
The first full run retained one stale 49-module assertion. The final full run
passes 729 repository and 39 provider tests at 90.319592% aggregate coverage;
receipt SHA-256 is
`75dc6b0b5b0b893c84dd702def4e62827870cd43cc8b3bfadbf75fe8b402c5c1`.

The Rust change is exactly one `cfg(test)` function plus its CSV. Removing the
block reproduces the preserved prior source. All 224 tests, fmt and Clippy pass.
Fresh workspace/all-features coverage passes the existing 90% line floor:
8,782 / 9,165 lines, or 95.821058%. The source-bound local coverage receipt is
`37159c9838105ec340ead92a9b23b7976232005e05ce51c9fad736c8e2edc5df`.
Rebuilding changes the native binary digest, so the original diagnostic remains
historical. A fresh 48-snapshot replay binds current source/binary, admits every
full v3 result and verifies each returned epoch/site. All 2,160 checks pass and
all 48 JSON outputs match their predecessors byte-for-byte. Current summary:
`10da73265cd4b87b4915d658c59594788a1786cc80a886e2ba32a59fd0dbec53`.

Independent review reconstructs all rows and recomputes all metrics using a
stable haversine. Acos conditioning differs by less than 0.00069 arcsec and changes
no result. Review receipt:
`61bac5bc325256dda5cf48036f3c8957a88044a8fc141cfb0898abc220da1847`.

| Quantity | Independent maximum | Existing control |
| --- | ---: | ---: |
| Topocentric RA/Dec | 0.819566 arcsec | 10 / Moon 12 arcsec |
| Airless alt/az | 0.856446 arcsec | 10 / Moon 12 arcsec |
| Airless altitude | 0.690536 arcsec | 10 / Moon 12 arcsec |
| DUT1 | 1.432404 ms | 3 ms |
| Largest range-budget fraction | 15.2647%, Moon | 100% |

Forty snapshots use rapid EOP and eight use predictions. Repeated target checks
represent 48 distinct site epochs, not 432 independent clocks. The
[Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) documents that future
EOP values are forecasts, not final physical Earth-rotation truth.

The fresh current-source 1900–2200 model replay also passes 109,900 checks at
3,925 epochs, summary SHA-256
`b28c96ee57728ca6defa02f8974fe209927be9defef4f3ca4108a3ad0462ee4c`.
Rebuilt release WASM stays exactly `2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2`
and `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199`.
Prior browser/native rendering evidence remains bound to that unchanged runtime.

## Reproduction and limits

```text
python tools/horizons_observer_seasonal.py
python -m unittest discover -s tests/python -p test_horizons_observer_seasonal.py -v
python -m unittest discover -s tests/python -p test_python_coverage_scope.py -v
cargo test --workspace --locked --offline
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
python tools/validate_precision_window.py --out-dir build/NEW-seasonal-model
```

The separate [native minimum-compiler follow-up](SEASONAL_MSRV_20261104.md)
passes current tests, model and seasonal observations on Linux Rust 1.85.0.
The actual saved archive and current inputs are admitted; independent review of
the downloaded scientific evidence recomputes every metric and passes.
The approved target remains 1900–2200, with 1–9999 approximate outside it.
Continuous accuracy, full-span Earth rotation, held-out physical events,
visibility, navigation and catalogue-star precision remain separate. Capture
stays `captured_not_qualified`; snapshots stay `unvalidated`. No UI, hosted,
licensing or production status is promoted.

Rollback removes this regression, CSV, admission module and matching coverage,
tests and docs together. Preserve raw evidence and unrelated goal work. No new
external dependency, application network call, commit, push or deployment occurred.
