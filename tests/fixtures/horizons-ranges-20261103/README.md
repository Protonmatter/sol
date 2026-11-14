# Captured Horizons range references — 2026-11-03

This pack retains 72 unmodified NASA/JPL Horizons API 1.2 text responses from
the existing provider's query functions: Q2/Q4/Q20 at an Earth-geodetic site and
Q2/Q20 at Earth center, for nine bodies at the four existing public-city fixture
instants on 2026-07-01. These are fixture coordinates, not the user's location.
Acquisition ran from 2026-11-03 23:13:29.144363 through 23:14:22.750226 UTC.

`manifest.json` records exact queries, per-response hashes and acquisition times.
Its SHA-256 is `3fb7c133e71f070aa9bef087425ab13450e4b419bcb44d0c4117fad8d8f50285`.
`query-provider.txt` retains the original provider code used for acquisition.
`predeclared-plan.txt` preserves the range budget recorded before acquisition:
absolute error <= `max(1 km, 1e-5 * reference_range_km)`, independently for each
range. This is an engineering regression target, not empirical calibration.

[Horizons quantity 20](https://ssd.jpl.nasa.gov/horizons/manual.html#definition-of-observer-table-quantities)
is apparent target range with down-leg light-time, relative to the selected
observer. The raw headers retain each target's source ephemeris, center, site,
airless convention and units. Convert AU using exactly 149597870.7 km/AU.
These are not instantaneous geometric heliocentric distances or event times.

`ranges.csv` is derived only from the original rows and query site/epoch inputs.
It is byte-identical to the [crate copy](../../../crates/solar-ephemeris/data/horizons-ranges-20261103.csv).
Python tests bind every derived range, raw hash, site and epoch; the Rust test
then checks the actual native engine against that CSV offline. The loader checks
the complete exact request matrix, bounded file reads, identities, source/site/
quantity headers, AU conversion, single ordered block, finite values and epochs.
Hashes bind reviewed bytes; they do not authenticate an arbitrary replacement
manifest or establish that its scientific conventions are appropriate.

From the repository root with the installed toolchain:

```text
cargo build --release --locked --offline -p solar-ephemeris --bin sky
python tools/validate_ranges.py --report build/NEW-range-report.json
cargo test --locked --offline -p solar-ephemeris --lib apparent_ranges_match_captured_horizons_centers
python -m unittest discover -s tests/python -p test_horizons_ranges.py
```

The offline validator has no network fallback. It needs read access to the pack
and existing `sky` binary, plus write access only if `--report` is requested.
Exit codes: `0` all samples pass, `1` admission/numerical failure, `2` invalid
CLI usage. No elevation, credentials or production change is required.

The native observer range retains an approximation: it subtracts the terrestrial
observer vector along the apparent direction, rather than independently solving
observer-specific un-aberrated light time. The observed lunar residual is below
0.525 km in this pack. The native geocentric correction uses heliocentric Earth
motion and is not a full barycentric/relativistic ranging model.

The [range correction report](../../../docs/LUNAR_RANGE_20261103.md) records the
failure before correction and the final residuals. Four instants on one day do
not qualify a continuous span, historical accuracy, heliocentric vectors,
events, navigation or UI validated status. The UI registry is unchanged.

Intentional changes require fresh raw/source/plan provenance, both CSV copies,
explicit convention review and an updated pinned-manifest test. Never derive
references from Sol's own output or relax the declared budget to fit a failure.
