# Operations

Updated: 2026-09-13. Scope: local research operation. No production, scheduled acquisition,
registry publication or deployed-service qualification is asserted.

## Preconditions and authority

Use the locked development environment described in [instructions](INSTRUCTIONS.md).
Read existing artifact/pointer identities before a change, choose an exact task-local
destination and retain prior valid state. No administrator access is needed for ordinary
local validation. Explicitly authorize network acquisition and endpoint/recipient scope;
the deterministic default uses committed fixtures.

## Source and derived data transactions

`tools/fetch_public_data.py` acquires immutable source bundles with original bytes, hashes,
source identity, observation/retrieval times, origin, quality and failure records.
`tools/run_daily_ingest.py` derives and validates a complete research bundle before
atomically selecting `current.json`. Source and derived pointers are separate: a newly
acquired source does not make a failed derivation current.

The derived bundle binds snapshot v3, observations, feed status v2, series manifest and
available frames to one source-manifest hash. The browser resolves a local pointer once
or its release-bound descriptor, verifies all required bytes/contracts and publishes one
coherent state. Corrupt, missing or mixed components leave the prior valid state visible
with an actionable error. Generation time never replaces observation/retrieval time.

For an **existing validated local source bundle**, an offline derivation into an exact
task-local output is:

```powershell
python tools/run_daily_ingest.py --skip-fetch --cache PATH_TO_EXISTING_SOURCE_BUNDLE_ROOT --web-data build/research-preview
```

The cache root must already contain its valid `current.json`; this command does not fetch.
It creates immutable local output and selects that output's pointer, not a deployed site.
`--migrate-v1 --skip-fetch` explicitly inventories an existing legacy cache without
rewriting its original raw files; review provenance gaps before use.
`--fail-on-degraded` withholds degraded derivations. Exit 0 means local validated
selection only; failure returns 1 and retains the last derived pointer. Argument errors
can return 2. Failure-attempt evidence remains distinct from healthy feed status.

Omitting `--skip-fetch` performs network acquisition and requires separate authorization.
Do not infer permission from scheduling examples or use a demonstration fixture as a
live observation. See the separately maintained [data update playbook](DATA_UPDATE_PLAYBOOK.md)
for governed refresh procedures; exact current code and accepted contracts prevail over
historical prose about fixed output aliases.

## Dated Earth imagery acquisition

If a mapped planet image is unavailable after a temporary connection or GPU upload
failure, leave Solar System and return, or turn **Source-qualified textures** off
and on in its inspector. Each deliberate action retries only failed references;
pending requests and loaded textures remain intact. There is no automatic retry
loop. A retry requests the same pinned local imagery and never changes its source
date or refreshes weather. Device limits or persistent missing files remain
explicitly unavailable and use the disclosed simplified surface.

`tools/fetch_earth_reference.py` is an explicit operator-run NASA acquisition tool.
It requires Python 3.11 or later, uses only the standard library, and needs ordinary
HTTPS access to `gibs.earthdata.nasa.gov`. It creates a new directory under the ignored
`build/` tree; use a distinct output name for each review. Existing output is preserved.
It does not update the browser, production assets, a manifest, or a current-data pointer.

For a pinned prior UTC date:

```powershell
python tools/fetch_earth_reference.py --date 2026-09-12 --out build/earth-reference-20260912-review
```

Add `--aqua-fill` to fill Terra's missing coverage using the same UTC day's Aqua
image and its own validity mask. Terra retains priority wherever its mask reports
data. This preserves source pixels without averaging or inventing clouds:

```powershell
python tools/fetch_earth_reference.py --date 2026-09-12 --aqua-fill --out build/earth-reference-20260912-paired-review
```

To select the most recent date advertised for all requested images and masks,
strictly before today's UTC date:

```powershell
python tools/fetch_earth_reference.py --latest-prior-day --out build/earth-reference-latest-review
```

The default output is 2048 by 1024 pixels; `--width 4096` requests 4096 by 2048.
The tool makes four bounded requests: WMS capabilities, the dated Terra MODIS true-color
image, its same-date data/no-data mask, and the mask's published classification palette.
`--aqua-fill` adds two requests for Aqua's same-date image and data/no-data mask;
date selection then requires availability for both satellites and both masks.
Requests have a 45-second socket timeout, a fixed NASA HTTPS host, and response limits
of 8 MiB for capabilities, 24 MiB per image, and 64 KiB for the palette. There is no
background acquisition or automatic retry. A network failure or rejected response leaves
no completed candidate directory.

Successful output contains `weather-original.png`, `no-data-original.png`,
`no-data-palette.xml`, `capabilities.xml`, `weather-rgba.png`, and
`earth-reference.json`. The JSON records the actual selected date, retrieval time,
source URLs, hashes, sizes, grid, validity counts, and derivation. Exit 0 means that
this review candidate was acquired; exit 1 means a rejected or unavailable acquisition;
argument errors return 2. Repeated acquisition of a date may return revised provider
bytes, so compare hashes instead of assuming a date identifies immutable imagery.

With `--aqua-fill`, output also retains `aqua-weather-original.png` and
`aqua-no-data-original.png`. The final `weather-rgba.png` takes each pixel from Terra
when Terra is valid, otherwise Aqua when Aqua is valid. Both missing stays transparent.
The JSON records both original image/mask pairs, source priority, Terra pixels retained,
Aqua pixels used to fill gaps, and remaining no-data pixels. A valid black pixel stays
valid; RGB brightness is never used as the coverage test.

The derivative retains each original decoded RGB value. Its alpha is 255 only for
the provider mask's exact Data class `(0,0,0,0)` and 0 for its No Data class
`(202,170,86,255)`. Different grids, malformed PNG data, changed palette semantics,
or unrecognized mask colors fail closed. The tool never infers missing observations
from black photographic pixels. NASA documents this separate mask in its
[GIBS Python workflow](https://nasa-gibs.github.io/gibs-api-docs/python-usage/#using-a-mask)
and [classification palette](https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Data_No_Data.xml).

Before incorporating a candidate, verify its original and derived hashes, review its
coverage and exact date, and run:

```powershell
python -m unittest discover -s tests/python -p test_fetch_earth_reference.py -v
python tools/validate_visual_assets.py
```

Publication requires a separate reviewed asset inventory change and the ordinary
build/release gates. Rollback keeps or restores the previously reviewed asset hashes;
an acquired candidate never becomes active merely because the fetch succeeded.

This is a dated satellite mosaic containing clouds, surface, ocean, and ice; it is
not a cloud-only image, weather forecast, or live global observation. The most recent
prior UTC day can still contain missing swaths, polar gaps, or later revisions.
Terra and Aqua observe at different overpass times; the optional combined image is
not a simultaneous scene. Real seams between overpasses remain visible, and missing
polar or shared swath coverage is not filled from another date.
Transparent missing coverage reveals the separately identified historical base map.
The January 2004 Blue Marble surface and 2016 Black Marble night lights retain their
own source epochs when the model clock changes. The Blue Marble map contains Antarctic
and Greenland land ice, but does not establish Arctic sea-ice coverage. A JPL MUR
sea-ice layer is a dated scientific analysis: retain its percentage legend and
false-color meaning rather than inventing a photographic white polar cap.

## Browser/provider operation

Default Sky calculations stay on device. Remote mode requires an explicitly configured
recipient and session-only consent for selected latitude, longitude, elevation and time.
Health and snapshot redirects are rejected before reaching another recipient. Endpoint
changes require fresh consent. Deny/revoke aborts remote intent; errors retain last-valid
data and offer explicit local recovery, not hidden fallback. Share/export previews show
the captured values before the second copy/download action.

The optional Python provider is a separate loopback service, not a production-hardened
public deployment. Admission is bounded to four workers/twelve distinct jobs, with
subscriber-aware cancellation, an overall twenty-second job budget, bounded response
bytes and retries. OS/DNS calls cannot be forcibly terminated by Python threads; a stuck
slot remains occupied without replacement-thread growth. See [ephemeris limits](EPHEMERIS_V3.md).
No public endpoint, authentication/TLS topology or production latency is qualified here.

## Candidate build, promotion and rollback

Build into a new staged directory using [instructions](INSTRUCTIONS.md). Candidate,
qualified, promotion-eligible and served-verified are distinct states.
[Release delivery](RELEASE_DELIVERY.md) specifies same-run evidence, protected profile
acceptance, immutable asset/WASM/schema identities and exact-artifact promotion. The
privileged promotion path does not rebuild source. Missing settings/manual/scientific
acceptance is a hold, not success. Registry publication is separately held.

Do not repair a failed release by overwriting data aliases, rebuilding an arbitrary ref
or clearing all caches. Preserve evidence and identify a compatible, corrected,
qualified predecessor artifact; production rollback needs separate authority and served
verification. A local retained artifact alone is not an eligible production rollback.

## Validation and incident evidence

Run source, contract, staged-browser and coverage checks in [VALIDATION_PLAN](VALIDATION_PLAN.md).
Keep command/toolchain versions, source and final asset hashes, errors and exact input
identities. Do not log credentials or needless location payloads. A fresh source fetch,
successful build or upload is not a verified served release.

For invalid data, retain the selected pointer and inspect the failed attempt, source
manifest and component hashes. For unavailable workers/providers, preserve valid facts,
cancel obsolete intent and use explicit recovery. Do not fabricate missing events or
change schema versions to bypass validation.

## Scientific and operational limits

Real imagery is not automatically registered. Globe mapping requires reviewed byte
identity, coordinate registration, coverage, source epoch, and display interpretation;
photographic texture does not become state-estimation evidence. Coefficient
regeneration/notice gaps and canonical runtime holds are in
[COEFFICIENT_PROVENANCE](COEFFICIENT_PROVENANCE.md) and
[CANONICAL_GENERATION](CANONICAL_GENERATION.md).
Keep operational readiness false: no calibrated magnetic/forecast probability,
navigation, occultation, mission-safety or operational warning authority is established.
