# Captured Horizons observer reference for large DUT1: 2026-11-12

This pack retains 12 unmodified UTF-8 text responses from NASA/JPL Horizons API
1.2: the Sun, the Moon and Jupiter at two public city fixture sites on
**1973-01-15** and **2015-06-20**. The sites are test inputs, not the user's
location. Acquisition ran from 2026-11-12 03:37:12 to 03:37:20 UTC.

The two days were chosen for their DUT1, which Horizons reports as +0.763 s and
-0.669 s. Every other observer pack in this repository is from 2026, where
DUT1 stays below 0.08 s and moves the sky by about one arcsecond, so those
packs cannot tell whether UT1 = UTC + DUT1 is applied at all. Here, ignoring
DUT1 moves each target by 9.2 to 10.7 arcseconds and reversing its sign moves
it twice as far.

The exact request URLs, acquisition times, byte counts and response SHA-256 values
are in `manifest.json`. `query-helper.txt` preserves the acquisition helper at
base revision `ba1ef17cd7a7a9c87ac2324d312e209ed20f4009`; it is provenance,
not the executable helper for replay. Manifest SHA-256:
`f759cef7915ea2d1dc2a4a1febbeab1f5365f3a0c33c875de72d689797dca413`.

Requests have the same shape as the [2026-07-01 pack](../horizons-observer-20261103/README.md):
observer quantities 2 (apparent RA/Dec), 4 (azimuth/elevation) and 49 (DUT1),
Earth geodetic sites, airless coordinates, numeric JD/UT, Gregorian calendar,
fractional seconds and angles in degrees. Request elevation is in kilometres;
the derived CSV stores metres.

`observer-matrix.csv` is derived solely from those requests and responses. The
identical [crate copy](../../../crates/solar-ephemeris/data/horizons-observer-dut1-20261112.csv)
lets the native Rust regression run without network or Python. The Python
fixture test compares every CSV value and raw-response identity, and the strict
offline loader checks completeness, exact request association, byte hashes,
target, center, site and airless/API headers. It has no network fallback.
Hashes detect changes relative to the reviewed manifest; they do not authenticate
an arbitrary replacement manifest without review.

From the repository root, with the installed locked toolchain:

```text
cargo test --locked --offline -p solar-ephemeris --test dut1_reference
python -m unittest discover -s tests/python -p test_horizons_dut1_reference.py
```

The Rust test holds altitude/azimuth and RA/Dec to 2 arcseconds and DUT1 to
3 milliseconds. At capture the worst altitude/azimuth residual was 0.45
arcseconds and the worst DUT1 difference 1.7 milliseconds. Passing these 12
samples establishes no continuous accuracy span, heliocentric vector, range,
event, catalogue-star or visibility qualification. This pack is not an accepted
UI accuracy registry.

An intentional update requires newly retained raw responses and acquisition
provenance, both derived CSV copies and the pinned-manifest fixture test. Do
not regenerate references from Sol's own output or widen the budget to
accommodate a regression: the budget must stay well below the displacement a
dropped DUT1 causes, which the Rust test also asserts.
