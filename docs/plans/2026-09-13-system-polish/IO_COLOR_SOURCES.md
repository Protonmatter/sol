# Io mission-derived color source qualification

Reviewed 2026-09-13. This correction replaces Io's default monochrome appearance with a separately qualified mission-derived color reference. It does not change the ephemeris, eclipse geometry, physical radius, state estimator, or time-dependent body attitude. The earlier monochrome recipe remains available for offline reproduction; this correction does not add an in-app source selector.

## Admitted source and color meaning

The selected source is the USGS Astrogeology [Io Galileo SSI Global Color Merge Mosaic 1km](https://astrogeology.usgs.gov/search/map/io_galileo_ssi_global_color_merge_mosaic_1km), using the original `Io_Galileo_SSI_Global_Mosaic_ClrMerge_1km.tif`. Its 1 km map grid is not a guarantee of 1 km native color resolution.

The producer calls this **false color**. Galileo SSI violet, green, and 756 nm near-infrared observations supply the color. The producer calibrated and registered the observations, corrected limb darkening, reduced seam mismatches, and merged color ratios with monochrome structure. SOL preserves those supplied RGB relationships; it does not apply a uniform yellow tint or synthesize natural color. The source combines epochs and is not an observation at the selected simulation time. Metadata names Galileo orbits G2, E6, C9, and C21, links the Galileo and Voyager archives, and records a 2009-03-15 processing date. That processing date is not an exposure date.

NASA/JPL/USGS [PIA09257, Io in Motion](https://science.nasa.gov/photojournal/io-in-motion/) independently demonstrates the expected regional color differences: yellow terrain, dark volcanic areas, bright deposits, and the red deposit surrounding Pele. NASA describes colors visible to a human eye as more muted. PIA09257 supports the interpretation and feature comparison; its gridded presentation is not used as the texture.

The separate USGS [Galileo SSI / Voyager Color Merged Global Mosaic](https://astrogeology.usgs.gov/search/map/io_galileo_ssi_voyager_color_merged_global_mosaic_1km) points to a different TIFF named `Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif`. It is useful supporting lineage evidence but is **not interchangeable** with the admitted original. Source URLs, labels, hashes, and processing records must identify the actual selected product.

## Registration verified from the original

The original GeoTIFF and its linked [ISIS label](https://astrogeology.usgs.gov/ckan/dataset/0fc15885-24ee-4d9d-9666-11de0667c10c/resource/91c2447c-1932-48e5-b33c-c199db865805/download/io_galileo_ssi_global_mosaic_clrmerge_1km.lbl) and [PDS3 label](https://astrogeology.usgs.gov/ckan/dataset/0fc15885-24ee-4d9d-9666-11de0667c10c/resource/7b1875cf-ca17-4147-b3d1-47a4509cf07e/download/io_galileo_ssi_global_mosaic_clrmerge_1km_pds3.lbl) agree:

| Field | Original value |
| --- | --- |
| Raster | 11,445 columns by 5,723 rows, three unsigned 8-bit RGB bands |
| Projection | Simple Cylindrical |
| Latitude | Planetocentric, north up |
| Longitude labels | Positive West, domain -180 to 180 degrees |
| Center longitude | **0 degrees** |
| Projection radius | 1,821,460 m |
| Upper-left corner | X = -5,723,000 m; Y = 2,862,000 m |
| Pixel spacing | 1,000 m in both axes |
| GeoTIFF NoData | `GDAL_NODATA=0` |

Despite positive-west longitude names in the labels, projected X increases east. For east-positive longitude `lambda` and planetocentric latitude `phi` in radians, the source pixel-corner coordinates are:

```text
x = (1,821,460 * lambda + 5,723,000) / 1,000
y = (2,862,000 - 1,821,460 * phi) / 1,000
u = x / 11,445
vNorthDown = y / 5,723
```

The existing affine registration convention is retained, with prime meridian U = 0.5 and the original pixel-grid offsets. The actual grid edges extend from approximately 180.022480 degrees W to 179.991024 degrees E and from 90.026968 degrees N to 89.995512 degrees S; rounding the raster to an assumed exact 2:1 global map would discard this evidence. A registered map does not establish a rotating body attitude.

PIA09257 describes a center-180-degree presentation and a different projection. That statement must not override the center-0-degree projection declared by the actual TIFF and both accompanying labels. The admitted color source and existing monochrome Io reference use the same source grid orientation.

Independent IAU/USGS nomenclature anchors also agree with the original and the producer's 1,024 by 512 browse. These are broad feature-placement checks, not subpixel control-network calibration. The Gazetteer can show slightly different latitude values for its available control networks; the coordinates below identify the checked entries.

| Feature | Gazetteer location | Expected original pixel-corner coordinates | Visual correspondence in producer browse |
| --- | --- | --- | --- |
| [Pele](https://planetarynames.wr.usgs.gov/Feature/4638) | 255.28 degrees W, 18.71 degrees S | X 9,052.098458; Y 3,456.799772 | Red deposit near (810, 309), surrounding the dark center |
| [Prometheus](https://planetarynames.wr.usgs.gov/Feature/4836) | 153.94 degrees W, 1.52 degrees S | X 829.174403; Y 2,910.321521 | Bright near-equatorial region near (74, 260) |
| [Loki Patera](https://planetarynames.wr.usgs.gov/Feature/3459) | 308.79 degrees W, 13.01 degrees N | X 7,350.990183; Y 2,448.405931 | Dark horseshoe region near (658, 219) |

## Coverage and preparation constraints

The producer reports absent color observations within approximately 5 degrees of both poles and says it filled the merged polar areas by interpolation. Those filled pixels must not be presented as observed surface color. SOL's conservative admission boundary is 85 degrees S through 85 degrees N, with a fully covered resampling footprint required. This is an explicit approximate coverage policy, not an inferred exact mission footprint. Outside admitted coverage, use the disclosed simplified surface material.

The producer also reports variable spatial resolution and poorer coverage on the Jupiter-facing hemisphere. Its color observations range from about 1.3 to 21 km per pixel at the equator; the merged structure can be finer. Multi-epoch source changes and provider illumination processing remain limitations. A 2K display derivative cannot correct those limitations.

Direct inspection found 65,499,735 source pixels. Red and green each contain 11,445 zero samples; blue contains 21,513. There are 11,445 all-zero RGB pixels but **21,513 pixels with at least one zero channel**. Because zero is the declared NoData value, coverage must require every color band to be valid. Checking only red or requiring all three bands to be black would incorrectly admit missing blue data.

Preparation must retain the original RGB grid and source hue relationships, apply the explicit polar and per-band NoData exclusions before coverage reduction, and keep excluded output pixels transparent. Preserve the conservative coverage erosion and full-footprint reduction used by the existing map preparation path. Do not inpaint gaps, smear edge colors across missing coverage, reorient this source by 180 degrees, or apply an undisclosed hue/saturation adjustment. The renderer's lighting remains a display approximation, not calibrated radiometry.

## Pinned evidence

Original files and inspection evidence are retained outside tracked app assets under `build/io-color-source/`. Only the bounded prepared display image belongs in the app asset inventory. The machine-readable registry and reproducible preparation recipe are authoritative for the final derived bytes.

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| [Original RGB TIFF](https://planetarymaps.usgs.gov/mosaic/Io_Galileo_SSI_Global_Mosaic_ClrMerge_1km.tif) | 196,637,696 | `524dcabd247c889a4e7c2a1bfd9e5fcc545c6a039b2c765da9b741befdfd00bd` |
| ISIS label | 1,674 | `5aa3b820962db226e69268ea22fdb2650466e1fc24ee6ee5333836826a646d60` |
| PDS3 label | 2,134 | `47a4b493743672efed5c4a634daa631e45379fe9110b4b6d350dc751d02b52e3` |
| [Producer 1,024-pixel browse](https://astrogeology.usgs.gov/ckan/dataset/0fc15885-24ee-4d9d-9666-11de0667c10c/resource/73d4c1f7-8c07-4b28-90ea-f47f7531c5ca/download/full.jpg) | 200,590 | `d722a545c9290b33f3b57cb7ccb9e173b367a7a8fa4867e74a8e11538f274282` |

The original was retrieved on 2026-09-13 using the published USGS URL with `?download=1`, which redirects to USGS's `asc-pds-services.s3.us-west-2.amazonaws.com` archive. The returned content length, local byte count, decoded dimensions, and SHA-256 agree. The query is a retrieval detail and does not create a different scientific product.

Validation at source qualification: complete TIFF decode; original SHA-256 and size; all three band ranges and NoData counts; GeoTIFF/ISIS/PDS3 projection agreement; three independent feature placements; visual inspection of the producer's color browse. No claim is made here about the final browser image, GPU output, or CI; those require the implementation's separate validation.

## Reproduced display artifact

The pinned `tools/prepare_moon_reference.py --body Io` recipe produces `io-galileo-color-reference-2k.png`: 2048 by 1024 RGBA, 2,843,310 bytes, SHA-256 `f83b274d56021fa11eac9c0c3755bd6ffc1397d93cc9fadb6207faca77366ed8`. All RGB bytes equal the original's unmodified BOX reduction. The binary mask contains 1,978,368 covered and 118,784 missing pixels, with covered rows 29 through 994. The original and independent replay hashes agree. The browser identifies this asset with `moon_color_mode: source-rgb`; the offline gate permits that field only for the qualified Io surface.

Mode 5 uses the original covered display RGB ratios and adjusts brightness with common scalars. Relative luminance uses the existing exponent 0.6 and cap 1.8. A common peak compression happens before the neutral albedo/eclipse gain; no color channel is clipped independently. This is a display convention in the supplied RGB encoding, not linear spectral radiance, natural-color calibration, or exact disc-average albedo. The other registered moon maps retain their monochrome mode 4. Missing coverage stays neutral and simplified.

## Implementation validation

The working-tree candidate `build/pr107-io-color-final` records release manifest SHA-256 `5cbbd26e8a29987b4bf9b26e55642368430485f737228593d27d72a781cf1c9e`. Its recorded HEAD `619e8eee6528913a000019788021154876f5107a` establishes lineage; source-input hashes bind the actual changes. Exact committed-build verification is recorded separately in the PR after publication.

- `node tools/check_node_coverage.mjs --output-dir=coverage/io-color-node-final`: 804 tests passed. Node lines 97.88%, branches 91.98%, functions 95.12%.
- `python -m unittest discover -s tests/python -p test_*.py`: 307 tests passed, including pinned recipe, RGB preservation, polar/no-data admission and immutable source registration.
- `python tools/typecheck_web.py`: 81 files passed. Static web, visual inventory, UX, SDLC and Markdown gates pass; no contract checks were relaxed.
- `node tools/planet_appearance_validation.mjs --web-root=build/pr107-io-color-final --out=coverage/io-color-planet-final`: 93 actual GPU probes passed. The 16 new color-mode checks include geographic RGB, dark deposits, valid black fixtures, missing coverage, filtering, proportional neutral gains and spatial longitude seams. Before the shader change, 13 of these failed while all previous 77 stayed green. Maximum new color-probe error after correction was 0.5 byte within the existing two-byte tolerance.
- `node tools/ring_appearance_validation.mjs --web-root=build/pr107-io-color-final --out=coverage/io-color-ring-final`: all 10 ring checks passed.
- `node tools/browser_validation.mjs --web-root=build/pr107-io-color-final --output-dir=coverage/io-color-browser`: staged Chromium visual/state/interaction assertions passed. Io eclipse retained 0.2891 of the control light; its published display ramp predicted 0.2784. The transit footprint, Sun/Earth colors, zero-delta Earth camera round trip, spin sampling, caption layouts and mobile recovery assertions remain intact.
- `node tools/collect_node_coverage.mjs` plus `node tools/merge_web_coverage.mjs` with the same candidate: combined runtime coverage 96.58% lines, 94.37% branches and 96.70% functions. Unexecuted handwritten runtime modules remain in the denominator.
- Independent source review verified exact original and derived hashes, all-channel RGB byte parity against direct BOX reduction, the binary coverage mask and geographic labels. Independent shader/runtime review found no blocker and verified neutral gains, source ratios and preserved other-moon paths.

Browser evidence is Windows Chromium 151 with SwiftShader/WebGL2; physical GPUs and other browser engines have not been qualified by these local runs. This corrects display imagery and does not establish natural-color or radiometric calibration, current surface orientation, live volcanism or operational readiness. The scientific engine, physical geometry, model interval and state-estimation code are unchanged.

Visual inspection of unedited candidate captures covers Io at model dates 2026-09-12 and 2021-09-12, exposing different sunlit longitudes, plus opposite night-side, north/south polar and mobile views. Color regions match the mission map and the source label remains visible. The first supplementary attempt used 2019, outside the unchanged satellite-table interval, so Io was correctly withheld and the screenshot readiness check timed out. Its failed evidence is retained separately; no unsupported date or readiness assertion was bypassed. The 2021 capture uses the supported model range and preserves the same physical records throughout camera interactions.
