# Retained 1900–2200 precision references

This packet contains 190 original NASA/JPL Horizons API text responses,
10,686,539 raw response bytes, and the frozen acquisition metadata. The plan
was declared before acquisition: 3,665 samples on a 30-day model-time grid,
257 deterministic irregular samples and three additional boundary probes,
3,925 unique model epochs in total. The approved complete UTC years 1900–2200
are padded by one day at each edge for model-time offsets.

Ten geometric target/origin pairs yield 39,250 vectors. Nine geocentric targets
yield 35,325 apparent direction/range records. Target IDs, centers, DE441 source,
ICRF/ecliptic-J2000 geometric vectors, apparent equator/equinox-of-date angles,
Gregorian calendar, numeric JD and explicit TDB/TT arguments are retained in
the queries and original responses. Q30/Q45 columns remain diagnostic.

The first 64-entry irregular query failed after two attempts, last observed
HTTP502; its cause was not established. The recorded transport amendment uses
32-entry batches within the original maximum64 limit, with every scientific
epoch and numerical budget unchanged. The first successful regular response
is retained with its original hash and acquisition identity.

Thirty vector records print an irregular JD shifted by at most two binary64
ulps (80.47 microseconds). The loader retains both exact tokens and admits only
the fixed printed half-quantum plus two arithmetic ulps, capped at one
millisecond. It does not shift the model sample or increase a scientific limit.

`manifest.json` binds all eight metadata files; `acquisition.json` binds every
original response. Raw bytes are protected from Git line-ending conversion.
The README is explanatory and is not a source reference or a qualification.
The unchanged manifest SHA-256 is
`d3ea57a0eef1347dda375f0f66614a8d4235a0a179d08bbdba2184cec0e6cccb`.

Replay offline with existing Rust/Python tooling:

```text
python tools/validate_precision_window.py --out-dir build/NEW-precision-validation
python -m unittest discover -s tests/python -p "test_precision_window*.py" -v
```

See the [precision scope and results](../../../docs/PRECISION_WINDOW_20261104.md).
A passing discrete sweep establishes only its sampled body/quantity/frame/time
comparisons; physical events, future Earth rotation, catalogue stars, minor
bodies, major-moon table windows and production release acceptance are separate.
