# Earth and Moon asset qualification followthrough

Historical legacy-asset review. The retained `earth.jpg` and `moon.jpg` decisions below
remain valid. The later [planetary appearance RFC](../../rfcs/0004-registered-planetary-appearance.md)
adds separately acquired and registered display references; it does not promote these
held rasters. See the current `mapped_references` inventory and
[planetary source review](../2026-09-13-planetary-appearance/PLANET_SOURCES.md).

Reviewed: 2026-09-13. Scope: the retained Earth and Moon rasters, official replacement
sources, and the current product-to-renderer admission boundary. This record adds source
evidence; it does not enable an asset or qualify the full planetary appearance inventory.

## Decision

Neither retained raster can honestly be promoted to `global-sphere` from the evidence
currently attached to its exact bytes. Earth has a verified NASA file identity and useful
product-family metadata. The Moon has only a third-party source label. A NASA Moon
replacement is available, but requires acquisition, explicit processing disclosures and
renderer registration tests before use. Changing `mapping_status` alone is insufficient.

| Local raster | Dimensions and byte count checked in this review | SHA-256 checked in this review | Current admission |
| --- | --- | --- | --- |
| `apps/web/textures/earth.jpg` | 2048 by 1024; 238,676 bytes | `5b54cc586c6cbf2b28762ef4d4011f6cf4227a8b93a637b818a0c54090ce6c2c` | Official source identity recorded; browse preview only |
| `apps/web/textures/moon.jpg` | 2048 by 1024; 1,053,869 bytes | `2764ba6535ea0481a062846ee033cc7a909dae05b31a8fd13f3e98f3a7fd92bd` | Source identity unverified; no detailed use |

These are fresh local hash/dimension checks. The Earth remote byte match remains the
manifest's earlier `2026-09-13T01:49:29.439169+00:00` evidence; no new raster was downloaded
for this review. A 2:1 aspect ratio establishes neither coverage nor coordinate registration.

## Retained Earth: what the official evidence establishes

The pinned URL is [NASA's land/shallow-water/topography JPEG](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg).
NASA's [Blue Marble 2002 article](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/)
links the matching product 57752. It describes historical composites based largely on
Terra/MODIS, with land and coastal observations from June through September 2001 and
topographic shading from USGS GTOPO30. Credits identify NASA GSFC, Reto Stoeckli and
Robert Simmon. These are processed mosaics, not a simultaneous photograph or a live view.

The exact [Visible Earth product page](https://visibleearth.nasa.gov/images/57752/blue-marble-land-surface-shallow-water-and-shaded-topography)
redirected to the general Earth Observatory homepage during this review. The surviving
article supports provenance and processing context, but does not establish the exact
JPEG's pixel-center registration, axis direction or prime-meridian offset. Its embedded
relief shading also requires review before adding simulated illumination.

Do not apply Blue Marble Next Generation documentation to this file: that is a different
product generation. The filename, recognizable coastlines, and aspect ratio are useful
inspection cues, not a substitute for registration evidence. The retained Earth therefore
remains a correctly attributed browse preview.

## Moon: an official replacement path with explicit limits

NASA's [CGI Moon Kit, SVS 4720](https://svs.gsfc.nasa.gov/4720/) offers a
[2025 color JPEG](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg)
at 2048 by 1024, listed as 447.2 KB. NASA documents a 0-degree central longitude,
LRO/LROC color data, LOLA polar contributions, adjusted exposure/white balance, and
inpainted high-latitude dropouts. WAC color coverage is limited to 70 degrees north/south;
the polar completion is lower-resolution monochrome albedo. NASA identifies the maps
as intended for aesthetic rendering and directs scientific applications to source data.
The page explicitly distinguishes linear EXR from sRGB TIFF encoding; do not infer the
JPEG's transfer function from those separate file types.

This is a candidate replacement, not evidence for the retained Solar System Scope file.
Its original JPEG bytes, acquisition time and color profile have not been inspected in
this review. No new download, local conversion or runtime substitution was performed.

The NASA-linked [LROC WAC Hapke product record](https://wms.lroc.asu.edu/lroc/view_rdr/WAC_HAPKE)
resolves to the instrument team's current archive. It specifies equirectangular source
tiles, 0-360 degrees east longitude, coverage from 70 degrees south to 70 degrees north,
and acquisitions from January 2010 through May 2013. Its I/F values are normalized to
specified illumination/viewing angles. The archive's ready-made three-band RGB uses a
different band assignment from the SVS color map. It must not be described as the same
color product. The NASA-linked readme fetch failed in the web reader; no missing readme
contents or tile-label values are assumed here.

Full rectangular coverage, observed color coverage, polar laser-derived coverage and
inpainted pixels must remain distinct. A source-backed aesthetic map could be useful
for learning, but cannot be represented as complete measured true-color coverage. The
current manifest has no spatial validity mask or per-region derivation map; filling its
coverage fields with full extents would not resolve that distinction.

## Current renderer contract to verify before admission

Local code inspection establishes the following implementation behavior, not agreement
with any particular source product:

- `orreryShaders.js`, `SPHERE_FS`: `u = 0.5 + atan(y,x)/(2*pi)` and
  `v = acos(z)/pi`. The body's positive x axis samples the center column; positive y
  samples three-quarter width; positive z samples the top edge.
- `orreryMath.js`, `iauRotation`: local x is the modeled prime meridian; local y is
  positive 90-degree east longitude; z is the pole. Source maps must be registered to
  this particular frame and epoch convention.
- `orrery.js`, `makeTexture`: browser image bytes are uploaded as RGBA with no Y flip,
  horizontal repeat, vertical clamp and mipmaps. The upload does not declare
  `SRGB8_ALPHA8`. The mode-0 shader samples its color and applies illumination without
  an explicit source transfer-function conversion.
- `validate_visual_assets.py`, `validate_mapping_evidence`: qualification must bind the
  reviewed raster hash, image axis conventions, coordinate frame, prime meridian,
  renderer transform, color processing, coverage interpretation and official sources.

The color path needs a product-specific decision and test before an sRGB or linear map
is enabled. This is presently an admission prerequisite, not an active unqualified-texture
rendering defect: both Earth and Moon are still rejected by `textureEligible` for global use.

## Concrete next implementation work

1. Acquire an official map and its metadata as one immutable product package. For the
   Moon, start with SVS 4720's small original JPEG for provenance/appearance review;
   retain it unchanged and record the exact SHA-256, byte count, retrieval time and
   embedded color metadata. Keep the legacy raster's identity separate.
2. Establish whether the map's documented derivations are appropriate for the intended
   learning view. Record color versus monochrome coverage and inpainting explicitly.
   Where measured-only surface detail is required, use the original LROC tiles plus
   their labels/validity information; show missing areas without fabricated detail.
3. Obtain product-specific cartographic evidence for image axes, pixel centers, seam,
   body-fixed coordinate convention and epoch. For Earth 57752, retain the hold unless
   exact-product registration can be established; select a documented replacement
   if the old metadata cannot be recovered.
4. Add an independently specified registration fixture covering at least the prime
   meridian, both longitude signs, equator, poles and seam. Prove it fails for a horizontal
   mirror, vertical flip and half-turn offset. Check recognizable source landmarks in
   the actual rendered scene without adjusting ephemeris positions to improve appearance.
5. Define decoding, interpolation, shading and output encoding explicitly. Verify known
   gray/color ramps and illumination changes in the actual WebGL path, with a negative
   control for missing or duplicate transfer conversion. Review embedded relief shading
   separately from simulated lighting. Do not call a browse mosaic calibrated reflectance.
6. Attach byte-bound mapping evidence and independent review before changing allowed
   usage. Re-run visual inventory, generated-manifest parity, source-bound Node/browser
   checks and the geometry/transit/eclipse checks on the exact built artifact.

This work can proceed without weakening scientific calculations or relaxing the existing
qualification gate. The current review resolves source choices and identifies specific
missing evidence; it does not claim that all NASA/JPL planetary appearances are qualified.

## Verification of this evidence change

- Recomputed local Earth and Moon SHA-256 values and JPEG dimensions; both match the
  manifest's recorded identities and sizes.
- Read the current manifest, admission function, validator, texture upload, shader UV
  lookup and IAU rotation implementation.
- Revisited the primary NASA and NASA-linked instrument-team pages above on 2026-09-13.
- Documentation-only change. No source rasters, runtime behavior, dependencies, model
  inputs, qualification flags or release artifacts changed.
