# Moon appearance source qualification

Reviewed 2026-09-13. Scope: the **22 moons currently supported** by SOL's moon catalogue. This is source and display-map qualification, not a change to ephemerides, physical radii, eclipse calculations, or the state-estimation engine. A map's geographic grid does not establish a time-dependent body attitude.

Eleven new mapped references are admitted alongside the existing Earth Moon reference: **12 of 22 supported moons have a reviewed map**. The other ten retain explicitly simplified materials and source-linked context. The original legacy browse records retain their `hold` status; newly qualified entries have independent source and derived-byte identities.

## Coverage of every supported moon

| Parent | Moon | Display source / decision | Coverage and interpretation |
| --- | --- | --- | --- |
| Earth | Moon | Existing NASA LRO [2025 CGI kit](https://svs.gsfc.nasa.gov/4720/) | Existing 2K color reference; LROC filters and producer processing disclosed in its registry entry. No new admission here. |
| Mars | Phobos | New USGS Viking/DLR-controlled structural mosaic | Full simple-cylindrical source grid; producer illumination blending; mapped onto an explicitly simplified sphere, not an irregular shape model. |
| Mars | Deimos | Simplified material; [MRO HiRISE mission image](https://science.nasa.gov/resource/martian-moon-deimos-in-high-resolution/) | 2009-02-21 enhanced-color perspective views are inspector references, not a global texture. Registered map and irregular-shape qualification remain open. |
| Jupiter | Io | USGS Galileo SSI color-merge TIFF | Mission-derived false color, multi-epoch; per-band NoData and interpolated polar caps withheld. Actual TIFF uses center longitude 0. See [Io color qualification](IO_COLOR_SOURCES.md). |
| Jupiter | Europa | New original USGS Voyager/Galileo TIFF | No source coverage south of 83 degrees S; additional NoData gaps retained; northern detail can be only about 20 km/pixel in source inputs. |
| Jupiter | Ganymede | New original USGS Voyager/Galileo TIFF | Monochrome; original NoData retained; source resolution and illumination vary. |
| Jupiter | Callisto | New original USGS Voyager/Galileo TIFF | Full registered raster with original NoData; replaces reliance on an unqualified cropped legacy browse. |
| Saturn | Mimas | New NASA Cassini PIA17214 unlabeled map | Published complete map, monochrome; June 2017 release includes late Cassini observations. |
| Saturn | Enceladus | New NASA Cassini/Voyager PIA12564 map | February 2010 edition; Voyager and lower-resolution Cassini images supply source gaps. |
| Saturn | Tethys | New NASA Cassini/Voyager PIA14931 map | June 2012 edition; varying native coverage/resolution. |
| Saturn | Dione | New NASA Cassini/Voyager PIA12577 map | February 2010 edition; provider longitude correction already applied. |
| Saturn | Rhea | New NASA Cassini/Voyager PIA14928 map | March 2012 edition; six Voyager images supply north-polar source gaps. |
| Saturn | Titan | Illustrative visible-light orange haze and blue high-altitude rim | [Natural-color Cassini composite](https://www.jpl.nasa.gov/images/pia06230-cassinis-view-of-titan-natural-color-composite/) grounds the appearance. RGB values remain illustrative, not calibrated. Opaque haze hides the surface. See [Titan source decision](TITAN_SOURCES.md). |
| Saturn | Iapetus | New NASA Cassini/Voyager PIA11116 map | Exact map rectangle extracted from annotated sheet; very dark terrain remains valid data. |
| Uranus | Miranda | Simplified material; [Voyager south-polar mosaic](https://science.nasa.gov/photojournal/south-polar-view-of-miranda/) | 1986-01-24 partial hemisphere; projected source presentation does not supply a full observed globe. |
| Uranus | Ariel | Simplified material; [Voyager color image](https://science.nasa.gov/photojournal/ariel-highest-resolution-color-picture/) | 1986-01-24 green/blue/violet image, partial disk. |
| Uranus | Umbriel | Simplified material; [Voyager closest-approach image](https://science.nasa.gov/photojournal/umbriel-at-closest-approach/) | 1986-01-24 clear-filter partial disk; approximately 10 km source resolution. |
| Uranus | Titania | Simplified material; [Voyager image](https://science.nasa.gov/photojournal/titania-highest-resolution-voyager-picture/) | 1986-01-24 two-image clear-filter composite; approximately 13 km source resolution. |
| Uranus | Oberon | Simplified material; [Voyager image](https://science.nasa.gov/photojournal/oberon-at-voyager-closest-approach/) | 1986-01-24 violet/clear/green composite, partial disk. |
| Neptune | Triton | Simplified material; [Voyager map release](https://science.nasa.gov/photojournal/map-of-triton/) remains held for texture use | 1989 Voyager coverage lacks much of the north. The available preview has baked graticules. The USGS color product also describes provider interpolation over graticule lines; neither is silently treated as observed global coverage. |
| Neptune | Nereid | Simplified material; [Voyager image](https://science.nasa.gov/resource/nereid/) | 1989-08-24 image is only a few resolved pixels at about 43 km/pixel. This supports basic appearance context, not detailed terrain. |
| Neptune | Proteus | Simplified material; [NASA Voyager source](https://science.nasa.gov/neptune/moons/proteus/) | Partial disk, roughly 8 km/pixel from Voyager's 1989 encounter; no registered globe or detailed irregular-shape model admitted. |

This table deliberately includes source gaps. It does not claim every moon has a global photo map, true-color imagery, full spatial coverage, or a measured 3D shape.

## Registration and data processing

All eleven new outputs retain a north-up simple-cylindrical/equirectangular reference grid. They are historical mission-image composites. They are **not observations at the selected simulation time**. SOL uses fixed reference orientation, openly described in source captions; feature longitudes are not physical body attitudes.

For Mimas, Iapetus, Enceladus, Tethys, Dione, and Rhea, NASA's labeled companion identifies the longitude and latitude axes: north at top, 0-degree longitude at the center, 180 degrees at both edges. Positive-west labels decrease toward the right, hence positive-east shader longitude increases with U. Their `primeMeridianU` is 0.5. Phobos's linked ISIS label specifies center 0, PositiveEast, planetocentric latitude and a complete 360-by-180-degree grid; its linked 1024-pixel sample retains that grid.

The four Galilean TIFFs have exact GeoTIFF origin/spacing, linked ISIS projection labels, and the published `GDAL_NODATA=0` tag. ISIS converts PositiveWest coordinate names into east-positive projected X before applying SimpleCylindrical: see the [official projection implementation](https://isis.astrogeology.usgs.gov/10.0.0/Object/Programmer/_simple_cylindrical_8cpp_source.html). Image columns therefore increase east despite the west-positive coordinate names. Io uses prime U 0.5; Europa, Ganymede and Callisto use prime U 0.

The registry carries the exact affine scale/offset rather than guessing coverage from a near-2:1 image ratio. Independent projected-coordinate anchors test equator, north/south interiors and longitude edges. Ganymede's ISIS label rounds its 1000.0671917072 m GeoTIFF spacing to 1000.067192 m; the test allows less than 0.000003 output pixels for that source precision difference. Callisto affine errors below 1e-13 are explicitly normalized to identity.

Io's older December 2005 footprint PDF shows center 180 and conflicts with the actual later TIFF/browse grid. The original TIFF, current label and direct image registration establish center 0; the stale companion does not override them. The retained Callisto legacy 1024-by-498 browse has unverified latitude bounds. The previous inferred +/-87.6-degree claim has been removed; the new original full-grid TIFF has separate, verified coordinates.

NoData zero is applied only to the four originals that publish that interpretation. Validity is conservatively eroded with a 5-by-5 minimum filter before BOX reduction; any output footprint that includes invalid source coverage becomes transparent. Europa additionally masks source rows south of 83 degrees S. Actual source affine latitude extents determine row centers. No inpainting, alpha edge fill, invented northern terrain, or interpolation across missing coverage is performed. RGB is reduced over the unchanged grid; alpha prevents invalid display footprints from appearing as surface detail.

The six NASA maps and Phobos preserve valid dark pixels. Brightness is not used as an undocumented coverage mask. Iapetus's extraction is an explicit reviewed rectangle, not brightness-driven auto-cropping. PNG conversion preserves the source grayscale or originally stored equal-color channels, with BOX reduction where specified. No visible hue is fabricated for monochrome maps.

At render time, monochrome reference brightness is normalized by its coverage-aware image mean, exponent 0.6 and cap 1.8, then scaled by the existing albedo and physical-eclipse display gain. This supplies readable texture contrast and preserves physical-state inputs; it is not calibrated local reflectance. The source images already contain differing illumination and provider contrast processing. Partial maps keep missing areas in the disclosed simplified material.

## Pinned inputs and outputs

The authoritative machine-readable values, retrieval/review times, source URLs, metadata URLs, axes, limitations and preparation recipe are in `apps/web/visual-assets.v1.json`. The table below also records every new recipe's exact byte identity. Original files remain outside the tracked app; only bounded display assets are admitted.

| Moon | Original grid / extracted rectangle | Display output | Original bytes | Display bytes |
| --- | --- | --- | ---: | ---: |
| Mimas | 5760 x 2880; `(0, 0, 5760, 2880)` | 2048 x 1024 | 6,959,979 | 1,189,557 |
| Iapetus | 6199 x 3407; `(240, 203, 6000, 3083)` | 2048 x 1024 | 2,057,630 | 2,023,258 |
| Enceladus | 7200 x 3600; `(0, 0, 7200, 3600)` | 2048 x 1024 | 4,136,213 | 1,537,963 |
| Tethys | 11520 x 5760; `(0, 0, 11520, 5760)` | 2048 x 1024 | 7,104,011 | 1,499,343 |
| Dione | 23040 x 11520; `(0, 0, 23040, 11520)` | 2048 x 1024 | 21,677,835 | 1,537,869 |
| Rhea | 11520 x 5760; `(0, 0, 11520, 5760)` | 2048 x 1024 | 5,583,646 | 1,322,217 |
| Phobos | 1024 x 512; `(0, 0, 1024, 512)` | 1024 x 512 | 161,960 | 332,013 |
| Io | 11445 x 5723; `(0, 0, 11445, 5723)` | 2048 x 1024 | 196,637,696 | 2,843,310 |
| Europa | 19631 x 9816; `(0, 0, 19631, 9816)` | 2048 x 1024 | 192,777,263 | 2,079,254 |
| Ganymede | 16539 x 8270; `(0, 0, 16539, 8270)` | 2048 x 1024 | 136,844,537 | 1,805,208 |
| Callisto | 15138 x 7569; `(0, 0, 15138, 7569)` | 2048 x 1024 | 114,640,717 | 1,790,932 |

Combined new tracked display payload: **17,960,924 bytes**. Original archives are independently hash-verified before decoding.

### Mimas

- Original file: `mimas-PIA17214-unlabeled-original.png`. [Original download](https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/p/i/a/1/PIA17214_unlabeled.png); [product metadata](https://science.nasa.gov/resource/mimas-global-map-june-2017/).
- Original SHA-256: `f8ffa667b2c35ec890973ea3300a33d3ee506f596b53d3818cdfee56943e038b`.
- Display asset: `textures/reference/mimas-cassini-reference-2k.png`.
- Display SHA-256: `fbb571b298642fe64899c548ff6948daf0634e15b8ce6ba3abe963abd7d40196`.
- Epoch: Cassini flyby composite, June 2017 release, including November 2016 and February 2017 images; not one observation.
- [Axes / projection evidence](https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/p/i/a/1/PIA17214_labeled.png).

### Iapetus

- Original file: `iapetus-nasa-map.jpg`. [Original download](https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia11/pia11116/PIA11116.jpg); [product metadata](https://science.nasa.gov/photojournal/map-of-iapetus-may-2008/).
- Original SHA-256: `c054d5927ca1f3b42914fef82cd700c8bbfd28c6890b5410faaf79e3368d0887`.
- Display asset: `textures/reference/iapetus-cassini-reference-2k.png`.
- Display SHA-256: `519dd1c1781d2a183666ed4b3fc5541cbaa351e604214a0a774e298db49bd6a0`.
- Epoch: Cassini and Voyager flyby composite, May 2008 map edition, released October 2008; individual source dates differ.

### Enceladus

- Original file: `enceladus-nasa-map.jpg`. [Original download](https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia12/pia12564/PIA12564.jpg); [product metadata](https://science.nasa.gov/photojournal/map-of-enceladus-february-2010/).
- Original SHA-256: `52bf59db9a98cce6073139fb649282113e0dde92d39b84bb029636ca9671537b`.
- Display asset: `textures/reference/enceladus-cassini-reference-2k.png`.
- Display SHA-256: `ec869b20d7aa570b55ecd0bbda42ba42797d84e1eeaf4bfc5a5f52ca312e1c9c`.
- Epoch: Cassini and Voyager composite, February 2010 map edition, including October and November 2009 flybys.
- [Axes / projection evidence](https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia12/pia12564/figures/PIA12564_fig1.jpg?w=1600&fit=clip).

### Tethys

- Original file: `tethys-nasa-map.jpg`. [Original download](https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia14/pia14931/PIA14931.jpg); [product metadata](https://science.nasa.gov/photojournal/map-of-tethys-june-2012/).
- Original SHA-256: `08f6fed39325fa7532be01eebc85c0b2a55bf0b9fdcfbf85c878db5bbac45ae5`.
- Display asset: `textures/reference/tethys-cassini-reference-2k.png`.
- Display SHA-256: `ecc49fcac05091c42d456d23266fd378d6e7728c90024bf65728637767fe77af`.
- Epoch: Multiple Cassini flybys, June 2012 map edition, released November 2012; individual source dates not listed.
- [Axes / projection evidence](https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia14/pia14931/figures/PIA14931_fig1.jpg?w=1600&fit=clip).

### Dione

- Original file: `dione-nasa-map.jpg`. [Original download](https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia12/pia12577/PIA12577.jpg); [product metadata](https://science.nasa.gov/photojournal/map-of-dione-february-2010/).
- Original SHA-256: `de59158e9d9b5b00d717bb0d2750e960dc3eb68f5aed36a3b214ce6db46660ec`.
- Display asset: `textures/reference/dione-cassini-reference-2k.png`.
- Display SHA-256: `e95437fecb7d447179b65427afcb80c1eaa948f1073470995d1c21a25ba8467d`.
- Epoch: Cassini and Voyager flyby composite, February 2010 map edition; individual source dates differ.
- [Axes / projection evidence](https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia12/pia12577/figures/PIA12577_fig1.jpg?w=1600&fit=clip).

### Rhea

- Original file: `rhea-nasa-map.jpg`. [Original download](https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia14/pia14928/PIA14928.jpg); [product metadata](https://science.nasa.gov/photojournal/map-of-rhea-march-2012/).
- Original SHA-256: `dd17563a8cd20fb057af7f4f0df465855f895e61cf29ec0a27e3e8862d14bd5e`.
- Display asset: `textures/reference/rhea-cassini-reference-2k.png`.
- Display SHA-256: `759e9732ad7804221bc85da61c459d6846342d4aa1fe06d67b566d4b9b889779`.
- Epoch: Cassini and Voyager composite, March 2012 edition, including Cassini observations from March 10, 2012.
- [Axes / projection evidence](https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia14/pia14928/figures/PIA14928_fig1.jpg?w=1600&fit=clip).

### Phobos

- Original file: `phobos-usgs-source.jpg`. [Original download](https://astrogeology.usgs.gov/ckan/dataset/85290c2c-7524-44ba-9251-61ea69fcd9dd/resource/876ae3aa-ac7b-434c-86f4-a2e50cc9826d/download/phobos_viking_mosaic_dlrcontrol_1024.jpg); [product metadata](https://astrogeology.usgs.gov/search/map/phobos_viking_global_mosaic_5m).
- Original SHA-256: `d8a00068ac8e13821528d546b2e1d2c613e5225a22da04ad7d05bf3b727f3ce4`.
- Display asset: `textures/reference/phobos-viking-reference-1k.png`.
- Display SHA-256: `57b0b9bb3d69e2735cfe19b68d6d64d05a6cd7cf33ae0a3bd87501f70e90b5fe`.
- Epoch: Viking-era and supplementary spacecraft images; USGS mosaic published June 2012; individual source dates differ.
- [Axes / projection evidence](https://astrogeology.usgs.gov/ckan/dataset/85290c2c-7524-44ba-9251-61ea69fcd9dd/resource/3d2f2c56-c13d-4f3b-9a4e-5ff538e02c89/download/phobos_viking_mosaic_40ppd_dlrcontrol.lbl).

### Io

- Admitted original: `Io_Galileo_SSI_Global_Mosaic_ClrMerge_1km.tif`; full source interpretation, labels and independent feature anchors are in [IO_COLOR_SOURCES.md](IO_COLOR_SOURCES.md).
- Original SHA-256: `524dcabd247c889a4e7c2a1bfd9e5fcc545c6a039b2c765da9b741befdfd00bd`.
- Display asset: `textures/reference/io-galileo-color-reference-2k.png`.
- Display SHA-256: `f83b274d56021fa11eac9c0c3755bd6ffc1397d93cc9fadb6207faca77366ed8`.
- Mission-derived false color uses Galileo violet, green and near-infrared observations; no natural-color or calibrated-radiance claim. Covered RGB ratios are retained through mode 5's common scalar display adjustment.
- Coverage: 1,978,368 valid pixels and 118,784 transparent pixels. The approximate +/-85 degree admission policy excludes the producer's interpolated polar caps; binary full-footprint coverage is retained.
- Superseded monochrome product: `io-original.tif`, SHA-256 `cf65a0323aac9c4c9eb582aa7b7ce0d36be8e445316fa6dba49ab5647b63584c`, 65,546,342 bytes. `IO_MONOCHROME_SOURCE_SPEC` preserves its exact offline recipe; original source/labels are linked in the Git history and [original USGS metadata](https://astrogeology.usgs.gov/search/map/io_voyager_galileo_ssi_global_mosaic_1km). Its derived `eabc16b3b001ecf53802688d6a6481029b71cc567190cb91b971ab439aa63449` is no longer bundled or selected in the app.

### Europa

- Original file: `europa-original.tif`. [Original download](https://planetarymaps.usgs.gov/mosaic/Europa_Voyager_GalileoSSI_global_mosaic_500m.tif); [product metadata](https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m).
- Original SHA-256: `a323f0c9ccb47d5af9902ea8297fe81f9a9708795645b80801f103c3f7c9a624`.
- Display asset: `textures/reference/europa-voyager-galileo-reference-2k.png`.
- Display SHA-256: `87ad2488589f01e72a4bbc3656c22555728b21e38b4d0df2a6c2aeb9fc894a07`.
- Epoch: Historical multi-epoch mosaic: Voyager Jupiter encounters (1979) and Galileo Jupiter mission (1995-2003); these are mission periods, not a single image date.
- [Axes / projection evidence](https://astrogeology.usgs.gov/ckan/dataset/4080036f-afc5-422e-abe9-1c0c8e4f98ea/resource/db62f55a-9d03-474e-a349-1fd7d8f0d5fc/download/europa_voyager_galileossi_global_mosaic_500m.lbl).
- Binary display coverage: 2,000,438 valid pixels, 96,714 transparent pixels out of 2,097,152; no fractional-alpha pixels in the prepared asset.

### Ganymede

- Original file: `ganymede-original.tif`. [Original download](https://planetarymaps.usgs.gov/mosaic/Ganymede_Voyager_GalileoSSI_global_mosaic_1km.tif); [product metadata](https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_global_mosaic_1km).
- Original SHA-256: `c2c8d9506b8cf8f7a0a90d823d9052e91c8d9885cf7267fdce8de8216f4df888`.
- Display asset: `textures/reference/ganymede-voyager-galileo-reference-2k.png`.
- Display SHA-256: `900af8e39acb7137e2c6d1745279ebdac1152702818711336f149972a055b050`.
- Epoch: Historical multi-epoch mosaic: Voyager Jupiter encounters (1979) and Galileo Jupiter mission (1995-2003); these are mission periods, not a single image date.
- [Axes / projection evidence](https://astrogeology.usgs.gov/ckan/dataset/57cad6e2-ed52-4b99-9d44-afbb9def6450/resource/32769bd3-7a00-4aa6-9ce8-52126cbd4384/download/ganymede_voyager_galileossi_global_mosaic_1km.lbl).
- Binary display coverage: 2,016,836 valid pixels, 80,316 transparent pixels out of 2,097,152; no fractional-alpha pixels in the prepared asset.

### Callisto

- Original file: `callisto-original.tif`. [Original download](https://planetarymaps.usgs.gov/mosaic/Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif); [product metadata](https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km).
- Original SHA-256: `e1f0bd2e0e05de605d067d6b5f5ededddaf31ca6c064562a1ca770f15a7dbaa3`.
- Display asset: `textures/reference/callisto-voyager-galileo-reference-2k.png`.
- Display SHA-256: `fb8cd280cd2fbd82f55b33f8a7710087cc590f128e72adac95fc1e21dc88a909`.
- Epoch: Historical multi-epoch mosaic: Voyager Jupiter encounters (1979) and Galileo Jupiter mission (1995-2003); these are mission periods, not a single image date.
- [Axes / projection evidence](https://astrogeology.usgs.gov/ckan/dataset/a80abd68-7ed9-440e-829a-76376779164f/resource/66433621-ca46-4563-994f-c615931adb42/download/callisto_voyager_galileossi_global_mosaic_1km.lbl).
- Binary display coverage: 2,008,724 valid pixels, 88,428 transparent pixels out of 2,097,152; no fractional-alpha pixels in the prepared asset.

Mimas has a source-label discrepancy: the companion title mentions January 2017 while the release is June 2017 and its caption includes November 2016 / February 2017 encounters. The release/observation descriptions are retained without inventing a single capture date. Enceladus's downloaded 7200-by-3600 JPEG is a reduced representation of the described underlying map; the underlying 110 m/pixel claim is not applied to these JPEG pixels. Catalogue radii are not replaced by mapping-sphere radii. Europa's metadata contains an invalid 1969 observation end-date field; it is not propagated as an observation date. Mission-era intervals describe the contributing missions, not every pixel's acquisition time.

## Reproduce the admitted outputs

Run from the repository root using the existing Python/Pillow **12.2.0** environment. The tool does not install dependencies, fetch data, modify production assets, or update the registry. No elevated permissions are required. Download the exact URLs above into operator-selected local source folders first and retain their original filenames. These commands use the reviewed ignored source folders; alternate folders are accepted if the pinned filenames and bytes match.

```powershell
python tools/prepare_moon_reference.py --source-root build/moon-source-review-20260913 --out build/moon-cassini-replay --body Mimas --body Iapetus --body Enceladus --body Tethys --body Dione --body Rhea --body Phobos
python tools/prepare_moon_reference.py --source-root build/galilean-source-review --out build/moon-galilean-replay --body Europa --body Ganymede --body Callisto
python tools/prepare_moon_reference.py --source-root build/io-color-source --out build/io-color-replay --body Io
```

`--source-root` selects originals; `--out` must be a new directory below `build/`; repeated `--body` selects distinct supported recipes. Omitting `--body` selects all eleven and requires all originals in that source folder. Existing outputs are never overwritten. Each selected original must match its exact byte size, SHA-256, dimensions and channel interpretation. Selected inputs are verified before decoding; original files are unchanged. The pixel ceiling is raised only after source authentication and restored afterward. Source limits are 200,000,000 bytes and 300,000,000 pixels per file; the largest originals can require substantial working memory while decoded.

Success is exit 0 with a new output directory containing the pinned PNGs and `derivation.json`. Missing or changed originals, unsupported Pillow versions, malformed images, duplicate selections, unreviewed crops, and derived-hash mismatches fail with exit 1. Temporary work is removed on failure and the final directory is published only after all selected hashes match. A rerun uses a new destination; it does not silently reuse a stale output.

Preparation itself needs no rollback because it writes only new ignored output directories. Application rollback is the reviewable reversion of the new registry entries, generated registry module, and matching display assets; it does not touch scientific state, source archives or older held records.

Validation commands:

```powershell
python -m compileall -q tools/prepare_moon_reference.py tests/python/test_moon_reference.py
python -m unittest discover -s tests/python -p test_moon_reference.py
python tools/validate_visual_assets.py
```

The validator also requires the generated JavaScript manifest to match the JSON. Regeneration/build remains a separate repository workflow owned by the integrating change.

## Remaining source work

Titan's [2018 938-nm infrared surface mosaic](https://science.nasa.gov/resource/titan-mosaic-the-surface-under-the-haze/) is a real global product, but its exact image axes have not been independently closed in this change. It remains unadmitted; even after qualification it must be an explicitly infrared surface interpretation, separate from visible opaque haze. It must not be presented as a clear visible-light surface.

Triton needs an unannotated original, exact registered bounds, a defensible observational coverage mask, and explicit enhanced-color interpretation. A rectangular file and provider-filled graticule lines do not establish a complete observed surface. The Uranian moons require source-registered partial mosaics and transparent coverage masks; their Voyager perspective photos remain inspector context. Deimos, Proteus and Nereid retain simple representations until detailed mapping or shape evidence justifies more. No source gap is solved with synthetic planetary features.
