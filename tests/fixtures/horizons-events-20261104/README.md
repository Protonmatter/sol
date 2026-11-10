# Fine Sun/Moon event reference packet

Original NASA/JPL Horizons Q2/Q4/Q20/Q49 replies for 32 predeclared six-minute
windows, each 361 rows at approximately one-second intervals. The 12 selected
cases cover Sun/Moon, latitude 0/42.36/75 degrees, longitude/elevation zero, on
2026-03-21 and 2026-06-21. This refines earlier diagnostic cases; it is not held-out
selection or a continuous accuracy qualification.

`plan.json` predates acquisition and fixes the 10-second comparison limit,
configured 34-arcminute refraction, body radii, reference conventions and byte/row
limits. `acquisition.json` records all original response identities and request
times. Frozen selector/acquirer/helper sources preserve the exact query origin.
`manifest.json` binds every file needed for offline replay. Raw bytes retain their
original line endings through `.gitattributes`.

`tools/horizons_events.py` validates all 32 raw responses and reconstructs
`events.csv` exactly. The crate's `data/horizons-events-20261104.csv` is an exact
copy, consumed by its native test. Rise/set intervals use independent airless
elevation and observer range with Sol's fixed standard threshold. Peak intervals
retain the two adjacent one-second samples around one strict sampled maximum,
requiring the entire grid to increase then decrease. That interpretation remains
conditional on sampled unimodality; no continuous interpolation theorem is claimed.
Horizons e/t markers are context only and do not sharpen the two-second bracket.

These 32 intervals do not certify weather/terrain/visibility, unsampled earlier
events, whole-day absence, full 1900–2200 observer/event accuracy or UI evidence
status. Four native nonfinite events outside the selected intervals are context
only. See `docs/FINE_EVENTS_20261104.md` for the retained native/review results.
