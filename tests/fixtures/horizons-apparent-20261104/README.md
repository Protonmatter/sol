# Geocentric apparent directions — 2026-11-04

This packet preserves nine raw NASA/JPL Horizons responses: 144 directions at
16 fixed TT instants from AD 1 to 9999. It is independent model-characterization
evidence, not a passing continuous accuracy qualification or observed event data.
The predeclared plan fixes targets, instants, quantities, metric and unchanged
10/12-arcsecond budgets before acquisition. No failing sample may be omitted.

Every request uses Earth geocenter, airless observer quantities 2, 30 and 45,
Gregorian JD/TT and decimal degrees. Q2 is apparent true-equator/equinox-of-date
RA/Dec; Q45 is apparent ICRF RA/Dec for a separate frame diagnostic; Q30 retains
Horizons' TDB−UT interpretation. Matching TT isolates coordinate-model error
from the different historical UTC/UT1 conversions. The native input clock is
inverted explicitly; this does not qualify that conversion against history.

Targets are Sun10, Moon301, Mercury199, Venus299 and Mars/Jupiter/Saturn/Uranus/
Neptune system barycenters4/5/6/7/8. These are explicit system identities;
planet-center and natural-satellite solutions can have shorter coverage.

`query-builder.py.txt` preserves acquisition code as inert text. `query-spec.json`
contains exact URLs; `acquisition.json` binds returned bytes, version, hashes
and acquisition times. `manifest.json` binds those files and the derived
`apparent.csv`. The identical crate CSV supports the native observation example.
The offline loader performs no network request and executes no captured code.

See [the Horizons quantity definitions](https://ssd.jpl.nasa.gov/horizons/manual.html)
and [API time-scale parameters](https://ssd-api.jpl.nasa.gov/doc/horizons.html).
Scientific results and limitations are recorded in the
[apparent-coordinate report](../../../docs/APPARENT_EPOCHS_20261104.md).
