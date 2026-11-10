# Retained IERS/USNO daily Earth-orientation source

This directory retains the original `finals2000A.all`, its official format,
the identical before/after published SHA-512 lists, and the frozen acquisition
plan/receipt. These six inputs are individually pinned by
[the source manifest](../../../tools/ephemeris-data/eop-sources.json).
This README is explanatory and is not an upstream reference.

The 3,775,228-byte raw source has SHA-256
`f7c0e9e5033b92ecd2488cf20cdf015c8aa2229f3153eceafd17d862b19fc961`.
It was retrieved from the [official USNO endpoint](https://maia.usno.navy.mil/ser7/finals2000A.all)
on2026-11-04. Its SHA-512 matches both published checksum captures. The
[format](https://maia.usno.navy.mil/ser7/readme.finals2000A) defines fixed-width
Bulletin A/B fields and their units. The implementation selects only Bulletin A
polar motion, DUT1, its reported formal error and the PM/UT1 I/P flags.
It does not splice Bulletin B values or apply the celestial-pole offsets.

There are20,031 complete daily rows from MJD41684 through61714, inclusive.
The first knot is1973-01-02T00:00:00UTC; the final usable knot is
2027-11-05T00:00:00UTC. Observed I/I knots end at2026-10-29T00:00:00UTC;
372 P/P knots follow. Fifty additional date-only rows contain no selected EOP
values and add no coverage. Fixed-width trailing spaces and raw line endings
are significant; Git attributes preserve these exact bytes.

Reproduce/check offline from the repository root:

```text
python tools/generate_eop.py --check
python tools/generate_eop.py --out-dir build/NEW-eop-rebuild
python -m unittest discover -s tests/python -p test_eop_generation.py -v
```

The compact table is661,039 bytes, SHA-256
`994c3fe24df38b54dc404bc6c1d1b7db86aab6aae4d2f311d7ad8207b0a9038a`.
The generator performs no download and never overwrites the runtime table.
The [EOP follow-up](../../../docs/EOP_HISTORY_20261104.md) records runtime
interpolation, measured comparisons, clock-coherence correction and limits.
