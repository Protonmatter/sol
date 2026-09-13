# Earth appearance source qualification — 2026-09-13

This record supports [RFC 0004](../../rfcs/0004-registered-planetary-appearance.md)
and `SOL-VIS-004`. It distinguishes geographic source registration, observed
coverage, source date, display processing and renderer validation. None of these
imagery products qualifies the state estimation engine, ephemerides or current
weather independently. The release inventory remains
[`apps/web/visual-assets.v1.json`](../../../apps/web/visual-assets.v1.json).

## Source and acquisition records

Original downloads and qualification evidence are retained in the ignored
`build/earth-sources-20260913/` directory. Its `earth-assets.json` records source
URLs, response hashes, dimensions, projection evidence, color interpretation,
source dates and the limitations below. The original-byte policy applies to
downloaded originals; explicitly identified derivatives have separate hashes.

The selected weather replay is
`build/earth-reference-20260912-terra-aqua/earth-reference.json`. That directory
contains all four original image/mask responses, the palette, capabilities,
derived RGBA image, `mask-qualification.json` and `pixel-verification.json`.
Ignored local evidence is an acquisition record, not a dependency required to
load the committed application. Selected assets and their provenance are bound
in the tracked release inventory.

The explicit acquisition tool uses Python's standard library and performs no
network calls at import or build time. It preserves existing output and publishes
a new review directory atomically only after acquisition and validation:

```powershell
python tools/fetch_earth_reference.py --date 2026-09-12 --aqua-fill --out build/earth-reference-20260912-paired-review
python -m unittest discover -s tests/python -p test_fetch_earth_reference.py -v
```

See [operations](../../OPERATIONS.md#dated-earth-imagery-acquisition) for limits,
date selection, exit codes and rollback. Acquisition success never activates a
candidate. A later request for the same date may return revised provider bytes.

## Historical land, ocean and land ice

Selected product: NASA Blue Marble Next Generation, January 2004, the non-shaded
`world.200401.3x5400x2700.jpg` base map. Credit: NASA Earth Observatory / Reto Stockli;
source observations primarily Terra MODIS. NASA's
[base-map page](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/)
links the
[original 5400 × 2700 JPEG](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700.jpg)
and
[matching GeoTIFF](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700_geo.tif).

Registration is supported by the GeoTIFF geospatial tags and NASA's
[technical report](https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/bmng.pdf),
sections 5.1–5.3 and Table 2. The map is Plate Carrée / geographic equirectangular,
WGS84, north at the top, eastward columns, southward rows, and pixel-area edges at
180°W/90°N and 180°E/90°S. The GeoTIFF reports EPSG:4326, a 0.0666666667° pixel
scale and the upper-left tie point (-180, 90). Pixel centers follow
`longitude = -180 + (x + 0.5) / 15` and
`latitude = 90 - (y + 0.5) / 15`.

The `world` product supplies the base color without the separately offered
`world.topo` relief shading. It is a display composite with nonlinear contrast,
provider gap filling, assigned deep-ocean blue and temporally interpolated winter
snow. January 2004 is its monthly composite label, not a claim that each pixel
was observed within that month. The JPEG has no embedded ICC profile; treating
its RGB as sRGB in the renderer is an explicit display convention, not albedo
calibration.

Continents, Antarctic land ice and Greenland land ice are present. The Arctic
Ocean is blue in this selected original; the map does not establish current
Arctic sea-ice coverage. A latitude-based white cap would invent information and
is excluded. On a GPU whose maximum texture dimension is 4096, the renderer may
reduce the complete 5400 × 2700 extent to 4096 × 2048 without cropping, altering
the map window or claiming additional detail.

## Historical night lights

Selected product: NASA Black Marble 2016, grayscale global 0.1° map from Suomi
NPP VIIRS. The
[NASA Earth at Night maps page](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/)
provides the
[original grayscale JPEG](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_01deg_gray.jpg)
and
[matching grayscale GeoTIFF](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_01deg_gray_geo.tif).
The grayscale original supplies display emission directly; the implementation
does not estimate lamp locations by removing blue terrain from the color map.

The 3600 × 1800 grid has WGS84 geographic registration, the same full-world
edge coordinates and directions as the day map, and 0.1° pixel-area sampling.
Its JPEG is grayscale with an embedded display profile. The source is an annual
cloud-free display composite assembled from selected observations; it does not
measure current outages, lighting schedules or physical radiance.

The model controls surface orientation and the geometric solar terminator.
Night-light emission is zero on the day side, fades from solar elevation 0° to
-6° by an explicitly illustrative twilight rule, and reaches full reference
weight farther into darkness. Its source label remains 2016 when model time
changes. Combining it with the dated cloud/surface layer does not imply
cloud-attenuated live city lighting.

## Dated Terra and Aqua satellite clouds and surface

Selected date: **2026-09-12 UTC**. Retrieval of the replay began at
2026-09-13T07:43:02.452978Z. Observation date and retrieval time remain distinct.
The selected image is a local, source-preserving composite of these exact NASA
GIBS layers:

| Satellite | Display image | Published validity layer |
| --- | --- | --- |
| Terra MODIS | `MODIS_Terra_CorrectedReflectance_TrueColor` | `MODIS_Terra_Data_No_Data` |
| Aqua MODIS | `MODIS_Aqua_CorrectedReflectance_TrueColor` | `MODIS_Aqua_Data_No_Data` |

All four requests use NASA's
[EPSG:4326 WMS endpoint](https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1)
with the same explicit parameters:

```text
SERVICE=WMS
REQUEST=GetMap
VERSION=1.1.1
SRS=EPSG:4326
BBOX=-180,-90,180,90
WIDTH=2048
HEIGHT=1024
TIME=2026-09-12
FORMAT=image/png
TRANSPARENT=TRUE
STYLES=
LAYERS=<exact layer identifier from the table>
```

WMS 1.1.1 uses longitude/latitude for this geographic bounding box. Each decoded
response is a 2048 × 1024, north-top, east-right RGBA8 PNG. The common full-world
pixel-area grid is registered independently of the model clock. Capabilities
must advertise the requested prior date for every selected image and mask;
`--latest-prior-day --aqua-fill` intersects all four availability ranges.

NASA documents the separate validity mask in its
[GIBS Python workflow](https://nasa-gibs.github.io/gibs-api-docs/python-usage/#using-a-mask).
The official
[WMTS capabilities](https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml)
associate both mask layers with the same
[MODIS Data/No Data palette](https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Data_No_Data.xml).
[Aqua layer metadata](https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/MODIS_Aqua_Data_No_Data.json)
identifies its own daily Aqua MODIS daytime radiance inputs. The mask describes
data availability; it is not a cloud classifier.

The reviewed mask has exactly two classes:

| Source class | Published raster RGBA | Derived alpha |
| --- | --- | --- |
| Data, source value 0 | `(0, 0, 0, 0)` | 255 |
| No Data, source value 1, `nodata=true` | `(202, 170, 86, 255)` | 0 |

`derive_weather_rgba` preserves every original decoded RGB channel and derives
only alpha from the corresponding mask. It rejects changed palette semantics,
unknown or interpolated mask classes, mismatched grids, malformed PNGs and
oversized responses. Black photographic pixels are never assumed to be no-data;
`TRANSPARENT=TRUE` alone did not remove opaque black gaps in the original RGB.

`fill_weather_gaps` then takes a pixel from Terra whenever Terra's mask admits
it. Aqua supplies a pixel only when Terra has no data and Aqua's mask admits it.
Where both are missing, alpha stays zero. There is no averaging, spatial fill,
cloud-motion extrapolation, adjacent-day substitution or recoloring. The two
satellites observe at different times; the resulting seams are real limitations
of this display composite, not evidence of simultaneous global weather.

The exact selected output has:

| Coverage category | Pixels |
| --- | ---: |
| Original Terra pixels retained | 1,848,641 |
| Same-day Aqua pixels filling Terra gaps | 60,613 |
| Total admitted output pixels | 1,909,254 |
| Remaining no-data pixels | 187,898 |
| Full raster | 2,097,152 |

The admitted fraction is approximately 91.04% of raster pixels. This is **not an
area-weighted fraction of Earth** and does not establish complete observations.
Missing swaths and polar darkness remain; transparent areas reveal the separately
identified historical land map. Satellite reflectance contains clouds, land,
ocean, snow and ice; the control therefore says clouds and surface, rather than
claiming a cloud-only measurement or forecast.

An independent Pillow 12.3.0 decode checked every one of the 2,097,152 output
pixels against the four original NASA responses at 2026-09-13T07:44:58.910740Z.
It confirmed exact source RGB, binary validity, Terra overlap priority and
transparent shared gaps. This validates the derivative bytes; actual GPU
filtering and compositing require their own rendering tests.

The committed PNG retains those exact derivative bytes. During GPU upload,
masked photographic references use premultiplied alpha; after filtering, the
shader normalizes the covered color before sRGB decoding and coverage blending.
This prevents transparent black no-data pixels from darkening nearby observed
clouds. Unmasked references and the nearest-sampled scientific sea-ice palette
use their own explicit upload convention. This is a rendering operation, not a
change to source observations or the archived derivative.

## Dated sea-ice analysis and legend

Selected product: NASA/JPL MUR sea-ice concentration, GIBS layer
`GHRSST_L4_MUR_Sea_Ice_Concentration`, dated **2026-09-07**, retrieved on
2026-09-13. The
[JPL PO.DAAC product record](https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1)
identifies MUR-JPL-L4-GLOB-v4.1, a multisensor analysis. Its upstream sea-ice
information includes EUMETSAT OSI SAF; NASA/JPL distribution must not be
misrepresented as an image acquired solely by NASA instruments.

The source is a 2048 × 1024 geographic WMS PNG with the same explicit grid as
the weather requests and `TIME=2026-09-07`. It is a false-color data visualization,
not photographic white ice. Preserve its
[concentration palette](https://gibs.earthdata.nasa.gov/colormaps/v1.3/GHRSST_Sea_Ice_Concentration.xml)
and the unmodified
[official horizontal legend PNG](https://gibs.earthdata.nasa.gov/legends/GHRSST_Sea_Ice_Concentration_H.png).
The actual legend response measures 420 × 95 pixels. Transparent cells mean no
displayed data and cannot generally be interpreted as ice-free ocean.

The layer is an explicit user choice, retains its date and percentage legend,
and composites in the scientific display palette after solar lighting. Nearest
texture sampling and no mipmaps avoid inventing intermediate palette classes.
An unsupported scientific texture grid is withheld rather than resampled into
new colors. The rendered palette is not inverted to claim exact concentration
measurements from compressed or provider-resampled display pixels.

## Byte identities

SHA-256 values identify the downloaded or explicitly derived bytes, not every
future response served at the same URL. Sizes below are bytes.

| Product or evidence | Dimensions | Size | SHA-256 |
| --- | --- | ---: | --- |
| BMNG January 2004 original JPEG | 5400 × 2700 | 1,884,678 | `99f5faad74efe985fbf1714c8be7296ca9999759a1215b65f99b7f1df278dde5` |
| BMNG matching GeoTIFF | 5400 × 2700 | 12,587,602 | `70a5682eb0fb5b5cde7beb707ec4ae0dd75f1463f43836c0b033056946ae9042` |
| BMNG technical report | PDF | 895,032 | `487f3e3c84f862f6053eda3e0213b17ebb923133adbdb75d574a28b678b56949` |
| Black Marble 2016 grayscale original JPEG | 3600 × 1800 | 365,655 | `4d2158f59123dadf0696a1cf8909c45018a1de8d0daab40da04122a5aa7f27c6` |
| Black Marble matching grayscale GeoTIFF | 3600 × 1800 | 856,529 | `35fd04c07eb69605e037ecca8f7ce43442a4a109bcac3a84df713661455c1ec8` |
| Terra true-color original, 2026-09-12 | 2048 × 1024 | 4,813,063 | `a1452574ed01213f960580171c5fee39b13460f630522ea344a3aa33f7ce6ade` |
| Terra validity original, 2026-09-12 | 2048 × 1024 | 22,190 | `bd4d4d26c3e65c406a42289c8d14fbdcd36dfad5e6288e4c1f8ec1dded0544df` |
| Aqua true-color original, 2026-09-12 | 2048 × 1024 | 4,736,399 | `67e2583fd6630d8476d47a1db7dfed12f086383b8b460206d3cec77cbd8c2371` |
| Aqua validity original, 2026-09-12 | 2048 × 1024 | 23,368 | `6fe08aa520499a3e4b4679984d9854daaf3b73a5454e4b52fcfcfe104d938896` |
| Shared MODIS validity palette | XML | 638 | `547bd46510b3dd552db7f1b3e032f43bfa5e3568eb66b06ee4ad95cf37c40220` |
| Selected Terra/Aqua RGBA derivative | 2048 × 1024 | 4,836,310 | `4b26e448151fe0ce83cbf34d865c8804a500aa4ff95190fc625585ea4fd70918` |
| JPL MUR sea ice original, 2026-09-07 | 2048 × 1024 | 121,355 | `89264243ea3c39795b549f68dbafaf86669bc2900f6de9ff8a79dd4b5dcf2e21` |
| Official sea-ice legend original | 420 × 95 | 4,298 | `460e8ae290340176ebd4f2c0608a1710b0b79e2537b69ef48ebd83da19a771f4` |

The source inventory contains the complete encoded WMS URLs and the weather
derivation's four-image input chain. The saved WMTS capability response linking
both masks to the palette has SHA-256
`c838b94994086b2089e2b823d634707aa004b2cf08d14bc0b182c433640aeb42`.
The sea-ice palette XML has SHA-256
`f72c4d294d5b16128c62c6e8ac3f9367837c2fab03b83263be48c287597e6c4c`.

## Withheld reference and renderer boundaries

The older NASA Blue Marble `cloud_combined_2048.jpg` was acquired for comparison
but is not promoted. Its source description combines visible and polar infrared
coverage and describes manually filled regions. Exact constituent dates and
the required map-axis evidence were not established. A 2:1 image shape alone
does not establish scientific global registration.

The blue atmospheric rim remains an explicitly illustrative optical effect.
No current atmospheric density, pressure, temperature, air quality, aurora or
weather forecast is inferred from it. Source registration does not prove
celestial orientation precision; that belongs to the existing engine contract.
Image failures, unavailable GPU resources and context loss must produce honest
fallback status without changing accepted engine positions or model time.

The independent runtime checks cover source dispatch, Earth-only auxiliary
samplers, disabled layers, preserved source dates, texture limits, upload errors,
context generations and palette filtering. Actual shader fixtures, browser
appearance, release caching and screenshots remain separate acceptance evidence
recorded with the final tested candidate.
