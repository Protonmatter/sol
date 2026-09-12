# Data sources, provenance and acquisition boundaries

Updated: 2026-09-11. This is an offline inventory of repository-declared sources, not
a live availability/pricing/terms review. No source was contacted for this update.

## Source roles

| Source family | Role in this repository | Interpretation limit |
| --- | --- | --- |
| NOAA/SWPC JSON/text and GOES XRS | Observed space-weather/activity learning context and fixtures | Preserve source/active/quality and observation time; not Sol warning authority |
| NOAA/NCEI archives | Historical context | Archive records and live feeds have different provenance/time semantics |
| Helioviewer / NASA SDO quicklook | Observed imagery or explicit fallback | Not calibrated magnetic data and not automatically registered model overlays |
| JSOC/HMI science records | Potential science-grade workflow | Separate export/access/volume requirements; no implemented calibration claim |
| IERS Earth orientation | Bundled rapid/predicted EOP and degraded outside-coverage state | Current coverage/freshness must be checked, not inferred from a source name |
| JPL Horizons | Optional provider and separately acquired reference records | Network permission, response metadata, frame/time scale and immutable evidence required |
| VSOP2013 / ELP-MPP02 / TOP2013 tables | On-device analytic calculations | Missing upstream input/serializer/notice correspondence; see coefficient inventory |
| Hipparcos and named-star/constellation catalogues | Catalogue-backed positions and labels | Derived stellar estimates are labelled; absent parallax cannot supply a distance |
| Natural Earth / IAU-USGS features | Globe-scale geography / feature locations | Cartographic generalization; positions and extents do not measure albedo |
| JPL satellite elements/vectors/physical records | Bounded major-moon interpolation and held-out checks | Not an extrapolatable navigation or mutual-event ephemeris |

Earlier documents recorded many of these as public/free. That history is not a guarantee
of current access, registration, terms, rate limits or bandwidth. Verify those separately
before an authorized refresh; do not silently introduce a new service or identity.

## Immutable committed reference inventories

| Inventory | Generation / validation | Status distinction |
| --- | --- | --- |
| [Coefficients](COEFFICIENT_PROVENANCE.md) | Binary decoders in `solar-ephemeris` | Exact local hashes/lineage; all three blobs non-regenerable from current supplied tools |
| [Stars](../tools/ephemeris-data/stars/README.md) | `generate_star_catalog.py`, `generate_constellations.py`, `validate_star_catalog.py` | Committed source package versions/hashes; not a new external catalogue audit |
| [Geography](../tools/ephemeris-data/geography/README.md) | `generate_geography.py --check` | Committed vector/feature sources |
| [Moons](../tools/ephemeris-data/moons/README.md) | `generate_moons.py`, `validate_moons.py` | Source/output manifest exists; canonical Linux x86_64 qualification remains pending |

The current major-moon window is January 2021–December 2030 as defined by the committed
generated model. Previously recorded 11,985 held-out checks and their numerical errors
describe that reference/model pair, not independent qualification of the new v3 apparent-
place, observer-range or event fields. The current ephemeris evidence registry has eight
TOP2013 source-parity samples only. No unretained live Moon range response is used as evidence.

## Acquisition and derivation

Default validation is offline. Explicit acquisition produces
`public-data-cache-manifest.v2` source bundles retaining original bytes, hashes,
source, `current-fetch`/`cached-fallback`/`fixture` origin, observation/retrieval times,
quality and failures. Fixture fallback remains labelled fixture, and cached fallback
does not acquire a newer observation epoch.

Derivation produces one `research-data-bundle.v1` binding solar snapshot v3, observations,
feed status v2, source manifest and cycle files. Only a complete validated bundle becomes
the derived pointer. The browser validates the full selected unit before publication;
failed/mixed data retains last-valid state. Local acquisition and derivation are not
approval, merge, deployment or served verification.

Use [OPERATIONS](OPERATIONS.md) for offline existing-bundle commands and the separately
governed [DATA_UPDATE_PLAYBOOK](DATA_UPDATE_PLAYBOOK.md) for authorized refresh/rollback.
Do not regenerate fixed live aliases independently, run scheduled acquisition without
authority, or present synthetic cycle examples as observed history.

## SWPC schema-change context

The repository retains Service Change Notice 26-21 and legacy/new schema fixtures:
replacement RTSW products use `/json/rtsw/`, numeric values can be JSON numbers rather
than quoted legacy numerics, and source/active metadata is preserved. This is the
implemented adapter compatibility context, not a new live availability verification.
See [SWPC schema change](SWPC_SCHEMA_CHANGE_2026_03_31.md) for the archived notice,
field mappings and retention requirements.

## Claims that remain prohibited

Do not assume unlimited access or stable upstream schemas. Do not infer calibrated
magnetic units, registered geometry, forecast probability, deep-time topocentric precision,
or operational warning authority from a public source name. Do not claim proprietary
JPL/NOAA/commercial algorithms or independent accuracy from source parity. Original
third-party notice correspondence remains a separate distribution review.
