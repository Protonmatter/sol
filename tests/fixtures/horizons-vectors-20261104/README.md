# Retained DE441 geometric-vector references

Ten original Horizons responses contain 160 vectors at 16 predeclared TDB
epochs, from proleptic Gregorian year 1 through year 9999. These are geometric
ecliptic-J2000 vectors in AU, with no light-time or aberration correction.

The [manifest](manifest.json) binds the acquisition ledger, exact query
specification, frozen acquisition source, predeclared budget and derived CSV.
The raw replies total 62,777 bytes. Their original API version is 1.2.

Target/origin pairs are 1/10 Mercury, 2/10 Venus, 399/10 Earth centre, 4/10 Mars
system, 5/10 Jupiter system, 6/10 Saturn system, 7/10 Uranus system, 8/10 Neptune
system, 301/10 heliocentric Moon and 301/399 geocentric Moon. Horizons returns
documented aliases 199/299 for requests 1/2. Planetary system barycentres are
not measurements of the giant planets' body-centre offsets.

The intended budget was frozen before acquisition:
`norm(model-reference)/norm(reference) * 206264.80624709636 <= 10`.
This is **arcsecond-equivalent full-vector error**, not angular pointing error.
Angular and radial residuals are separate diagnostics. The current native model
**fails 29/160 samples** at this unchanged budget. Passing samples establish no
continuous interval. See the [measured report](../../../docs/GEOMETRIC_VECTORS_20261104.md).

The offline loader checks source, target/origin, frame/correction/units, complete
ordered epoch/calendar rows, finite numeric tokens, original hashes and derived
values. The crate-local CSV must be byte-identical. Raw Git attributes preserve
response bytes on Windows. There is no network fallback or automatic qualification.

```text
python -m unittest discover -s tests/python -p test_horizons_vectors.py -v
python tools/validate_vectors.py --report build/NEW-vector-report.json
```

The second command requires the installed Rust toolchain and returns **1 for
the current scientific budget failure**, retaining its full finite result.
It builds/runs the zero-dependency native example offline. Reports must be new
files under `build/` or `coverage/`; existing files and product paths are refused.
Exit 0 means every recorded sample passes; argparse uses exit 2 for invalid
arguments. Never replace raw references or relax the budget to obtain exit 0.

This is not apparent-place, absolute ancient UTC/UT1, event, navigation, UI-registry
or release qualification. References: [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
and [body/frame/time definitions](https://ssd.jpl.nasa.gov/horizons/manual.html).
JPL/NASA government reference data; preserve the attribution in the original replies.
