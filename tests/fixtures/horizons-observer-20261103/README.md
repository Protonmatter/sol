# Captured Horizons observer reference: 2026-11-03

This pack retains 36 unmodified UTF-8 text responses from NASA/JPL Horizons API
1.2. They are the existing validation helper's nine targets at four public city
fixture sites, at four instants on **2026-07-01**. The sites are test inputs, not
the user's location. Acquisition ran from 2026-11-03 22:09:11 to 22:09:38 UTC.

The exact request URLs, acquisition times, byte counts and response SHA-256 values
are in `manifest.json`. `query-helper.txt` preserves the acquisition helper at
base revision `3a55a795767f3043112673ea561cdaf6dc7e2d0f`; it is provenance,
not the executable helper for replay. Manifest SHA-256:
`8b8e20120a58853dde34759faffb01bc15a94793740b80721aa7c38cafb39ecd`.

Requests use observer quantities 2 (apparent RA/Dec), 4 (azimuth/elevation) and
49 (DUT1), Earth geodetic sites, airless coordinates, numeric JD/UT, Gregorian
calendar, fractional seconds and angles in degrees. Request elevation is in
kilometres; the derived CSV stores metres. The raw headers preserve the source
ephemeris for each target. See the [Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
and [quantity and time definitions](https://ssd.jpl.nasa.gov/horizons/manual.html).

`observer-matrix.csv` is derived solely from those requests and responses. The
identical [crate copy](../../../crates/solar-ephemeris/data/horizons-observer-20261103.csv)
allows the native Rust regression to run without network or Python. The Python
fixture test compares every CSV value and raw-response identity, while the
strict offline loader checks completeness, exact request association, byte
hashes, target/center/site and airless/API headers. It has no network fallback.
Hashes detect changes relative to the reviewed manifest; they do not authenticate
an arbitrary replacement manifest without review.

From the repository root, with the installed locked toolchain:

```text
cargo build --release --locked --offline -p solar-ephemeris --bin sky
python tools/validate_ephemeris.py --reference-dir tests/fixtures/horizons-observer-20261103 --report build/horizons-offline-report.json
cargo test --locked --offline -p solar-ephemeris --lib apparent_pointing_matches_captured_horizons_observer_matrix
python -m unittest discover -s tests/python -p test_horizons_reference.py
```

The original 10 arcsecond general, 12 arcsecond Moon and 3 millisecond DUT1
limits are unchanged. Passing these samples establishes no seasonal or
continuous accuracy span, heliocentric vector, range, event, catalogue-star or
visibility qualification. This pack is not an accepted UI accuracy registry;
the v3 readers continue to withhold validated status.

An intentional update requires newly retained raw responses and acquisition
provenance, both derived CSV copies, reviewed quantity/frame/time conventions,
and the pinned-manifest fixture test. Do not regenerate references from Sol's
own output or change tolerances to accommodate a regression.
