# Planetary appearance source qualification — 2026-09-13

This record supplies the source and display-registration evidence for
[RFC 0004](../../rfcs/0004-registered-planetary-appearance.md), especially
`SOL-VIS-004`. It covers Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and
the Moon. Earth has a separate source acquisition and layer contract.

The supplied textures contain real mission observations or documented agency
composites. They are reference appearances, with fixed source dates, rather than
current photographs of the simulated state. Source pixels cannot establish
ephemeris accuracy, present cloud locations, photometric calibration, or complete
coverage. Runtime admission and GPU verification remain separate implementation
gates.

## Reproducible handoff

Original downloads, metadata, inspection images, derivatives and acquisition logs
are retained in the ignored `build/planet-sources-20260913/` directory. The
implementation handoff is `planet-assets.json`. Every asset entry binds:

- Original and rendering file paths, dimensions, byte counts and SHA-256 hashes.
- Requested agency URL, resolved download URL, retrieval time and source evidence.
- Map longitude direction, latitude convention, coordinate bounds and a texture
  window with an explicit equation.
- Observation period, publication date, color interpretation and source credits.
- Separate coverage masks and the limits of interpreting those masks.

The tracked [`tools/prepare_planet_reference.py`](../../../tools/prepare_planet_reference.py)
performs deterministic format conversion and reduction with the optional Pillow
12.2.0 image environment. It requires no NumPy, network access or installation at
build time. It does not change exposure, color balance, geography or weather.
Mars and Venus use BOX area reduction; Jupiter uses LANCZOS reduction. Other
derivatives retain their native dimensions. PNG RGB values are accompanied by
binary alpha; matching grayscale coverage PNGs are also supplied. Moon uses the
original JPEG without re-encoding. No downloading occurs in this preparation
step, build step, or browser runtime.

```powershell
python tools/prepare_planet_reference.py --source-root build/planet-sources-20260913 --out build/planet-reference-replay
python -m unittest discover -s tests/python -p test_planet_reference.py -v
```

The output must be a new directory below `build/`. The preparer verifies all
selected original hashes before decoding, checks each derived hash against the
reviewed recipe, then publishes the complete directory with `derivation.json`.
It refuses mismatched sources, unreviewed decoder output, existing destinations
and output paths outside `build/`. A failed preparation leaves admitted assets
unchanged. The source recipe can select individual bodies with `--body Mars`.

The native Mercury browse is 1024 × 512. Enlarging it would not create additional
observed detail. Uranus and Neptune are also kept at their smaller native
dimensions; their published sampling already oversamples the observations.

## Selected sources

| Body | Rendering input | Meaning and date | Registration and coverage |
|---|---|---|---|
| Mercury | `mercury-bdr-reference-1k.png`, 1024 × 512 | MESSENGER monochrome BDR; observations 2012–2015, product 2016 | North-up, positive-east, planetocentric, zero longitude at center; local display excludes latitude beyond ±85° |
| Venus | `venus-magellan-radar-reference-2k.png`, 2048 × 1024 | Magellan radar surface beneath clouds; imaging cycles 1990–1992 | Exact GeoTIFF affine grid, positive-east, planetocentric; source nodata and out-of-domain sampling withheld |
| Mars | `mars-viking-reference-2k.png`, 2048 × 1024 | Viking colorized surface mosaic; USGS publication 2009-02-02 | Exact JPEG auxiliary affine grid, positive-east, planetocentric; original padded extents retained |
| Jupiter | `jupiter-opal-reference-2k.png`, 2048 × 1024 | Hubble OPAL Map A, 2015-01-19 02:00–12:30 UTC | System III, positive-east in source X, zero longitude at left; planetographic; ±79.8° source latitude limit |
| Saturn | `saturn-opal-reference.png`, 1800 × 900 | Hubble OPAL Map A, 2025-08-29 05:53:28–14:20:17 UTC | System III, positive-east in source X, planetographic; conservative bands −80°..0° and 7°..75° |
| Uranus | `uranus-opal-reference.png`, 721 × 361 | Hubble OPAL Map A, 2024-11-09 07:01–20:04 UTC | Positive-west in source X, zero east longitude at right; planetographic; conservative band −5°..90° |
| Neptune | `neptune-opal-reference.png`, 721 × 361 | Hubble OPAL 2025b; campaign 2025-08-24..25 | Positive-east in source X, zero west longitude at left; planetographic; conservative band −90°..35° |
| Moon | `moon-lroc-2025-2k.jpg`, 2048 × 1024 | NASA CGI Moon Kit map produced December 2025 | Zero longitude at center; LROC color ±70°, source-produced LOLA monochrome completion at poles |

### Mercury

The [USGS MESSENGER BDR product](https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_basemap_bdr_166m)
provides the original 1024 × 512 browse and an ISIS label for its full global
mosaic. The label identifies SimpleCylindrical, planetocentric, positive-east
mapping centered at 0°. NAC and WAC 750 nm observations form a stretched
monochrome reflectance mosaic, with residual terrain shading. This is not an
RGB true-color or unlit albedo map. The source describes no large gaps, which
does not prove every pixel valid. The local polar exclusion is an explicit
display restriction for the heavily shaded/seamed browse poles, not a claim
that MESSENGER never observed them.

### Venus

The [USGS Magellan C3 radar mosaic](https://astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_mosaic_2025m)
supplies a 18775 × 9388 single-band GeoTIFF and matching ISIS label. Radar
backscatter describes the surface beneath opaque clouds; it is neither
visible-light terrain color nor elevation. The source describes the three
imaging cycles from September 1990 to September 1992 and cumulative coverage
near 98%. Gaps remain in this raster. GeoTIFF tags declare pixel areas, 2025 m
spacing, a 6051000 m sphere, tie point and nodata 0. Those tags, rather than a
nominal 2:1 assumption, determine the supplied texture window. The original
extent is slightly short of 360° longitude; samples beyond it are unavailable.
The product metadata date 2022-09-01 is not an observation date.

### Mars

The [USGS Viking colorized mosaic](https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m)
warps Viking color onto MDIM 2.1 terrain mapping. Its publication date is
2009-02-02. Viking orbiters imaged Mars during 1976–1980; this is the mission
range, not verified dates for every contributing pixel. The original JPEG is
21339 × 10670. Its accompanying XML declares 1000 m pixels, a 3396190 m sphere,
and upper-left coordinates (−10670000, 5335000) m. The exact outer bounds are
slightly different from ±180° and ±90° and are preserved through resizing.
Zero is declared nodata for each band. The map does not establish current dust,
surface season or optical reflectance calibration.

### Jupiter

The [NASA SVS global map](https://svs.gsfc.nasa.gov/12021/) is byte-identical to
the [HST OPAL Cycle 22 Map A TIFF](https://archive.stsci.edu/hlsp/opal/opal-jupiter-cycle-22).
The product README establishes planetographic latitude, a 71492/66854 km
ellipsoid, 10 pixels/degree and the System III longitude direction. Color uses
F631N/F502N/F395N for red/green/blue with slight contrast enhancement and limb
correction. The TIFF is display-scaled, not calibrated I/F. The source fills
some moon/shadow transit regions using adjacent observations; small boundaries
may remain. Black polar caps are missing map coverage, not black terrain.
Its cloud features remain a dated 2015 reference at every simulation time.

### Saturn

The [HST OPAL Cycle 32 Saturn source](https://archive.stsci.edu/hlsp/opal/opal-saturn-cycle-32)
uses F631N/F502N/F395N display color and planetographic mapping on a
60268/54364 km ellipsoid. The README explicitly reports moon/shadow transits.
Inspection also shows polar fringes and a black strip near the equator.
The supplied mask conservatively withholds these latitude zones and zero-valued
source pixels. It is not a scientific artifact-removal algorithm: other transit
residuals can remain. The map describes clouds during the stated 2025 epoch and
does not supply a ring texture, ring geometry or permanent surface features.

### Uranus and Neptune

The [Uranus](https://archive.stsci.edu/hlsp/opal/opal-uranus-cycle-32) and
[Neptune](https://archive.stsci.edu/hlsp/opal/opal-neptune-cycle-32) products use
F657N/F547M/F467M display color, with producer contrast enhancement. Their
READMEs establish different source X longitude directions and planetographic
latitude. Large unobserved areas and color fringes are masked conservatively.
Their 721 × 361 samples at a stated two pixels/degree imply an endpoint-inclusive
grid; this is explicitly an inference. Independently acquired F467M FITS files
confirm dimensions and observation identity, but contain no CRPIX, CRVAL,
CDELT or other WCS cards to prove the sample-center convention. The proposed
half-pixel window is therefore a qualified display convention. Geographic
storm picking is not qualified. Neptune retains the full campaign range;
the F467M timing alone does not establish all RGB exposures. No recoloring to
a familiar saturated blue is performed or described as true color.

### Moon

The [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) explicitly supplies maps
for 3D rendering and identifies the December 2025 revision. The original 2k
JPEG embeds an `sRGB IEC61966-2.1` profile, verified locally. Its LROC RGB bands
are 643/566/415 nm, with producer exposure/white-balance adjustment. Beyond
70° north/south, the producer uses lower-resolution monochrome LOLA reflectance;
small high-latitude dropouts are inpainted. These source-produced completions
remain disclosed. NASA describes the map as optimized for aesthetics rather
than scientific measurement. It is suitable for reference appearance, not
quantitative radiometry.

## Mapping contract

`gridRegistration.textureWindow` gives the complete operation, in this order:

```text
u = fract(phasePrimeU + sign * eastLongitudeDegrees / 360) * scaleU + offsetU
v = ((90 - mappedLatitudeDegrees) / 180) * scaleV + offsetV
```

`sign` is +1 when source X increases eastward, −1 when it increases westward.
Texture row zero is north. The input longitude is in the body's accepted
reference frame; this transform does not alter that frame or its rotation law.
`primeU` records the source prime-meridian placement, while `phasePrimeU` is
the pre-window phase. They differ for an affine or endpoint-centered grid.
Applying both as independent offsets would count the correction twice.

For planetographic maps, convert from the renderer's actual ellipsoid latitude,
not from an assumed spherical UV. If starting from planetocentric latitude
φ on the source ellipsoid, the conversion is
`atan((equatorialRadius/polarRadius)^2 * tan(φ))`. The renderer's parametric
mesh latitude requires its own equivalent conversion; see RFC 0004. Source
ellipsoid radii are coordinate evidence, not a request to change modeled body
geometry.

For Mars and Venus, let the original degree bounds be west/east/south/north:

```text
phasePrimeU = -west / 360
scaleU = 360 / (east - west)
offsetU = 0
scaleV = 180 / (north - south)
offsetV = (north - 90) / (north - south)
```

This preserves slight padding and the actual source prime meridian without
stretching its geographic bounds to a nominal full globe. For the explicitly
inferred Uranus/Neptune endpoint convention, `scale = (720/721, 360/361)` and
`offset = (0.5/721, 0.5/361)`. Their geographic interpretation remains limited
as stated above. Source UV outside [0,1], excluded latitude bands, and alpha 0
must use the documented simplified fallback, not edge clamping presented as
observation. Fallback color is an approximation and is not another map.

The supplied masks mean **withheld display coverage**, not a mission quality
flag. With nodata masking enabled, a source pixel with any zero channel is
excluded, followed by a 5 × 5 minimum filter. BOX mask reduction admits only
pixels with fully valid support. Conservative latitude exclusions also remove
known fringe/occlusion zones. This procedure cannot identify every nonzero
artifact or reconstruct absent observations. RGB display interpolation does
not calibrate reflectance; only the Moon original declares its own ICC profile.

## Sources deliberately not substituted

- [NASA's enhanced Mercury map](https://science.nasa.gov/resource/enhanced-color-mercury-map/)
  supplies useful 4k false/enhanced color, but this review did not establish its
  exact grid against a matching product label. It is retained as an optional
  reference, not silently given the BDR label or natural-color interpretation.
- [JPL's Venus texture notes](https://space.jpl.nasa.gov/tmaps/venus.html)
  distinguish a repeated single-image visible cloud texture from a
  Magellan/Pioneer/Venera radar mosaic. Repeated cloud pixels do not establish
  a globally observed atmosphere; the registered USGS radar product is used.
- [Voyager's true/false-color Uranus pair](https://science.nasa.gov/photojournal/uranus-in-true-and-false-color/)
  is a two-disk comparison. It is not a 2:1 longitude/latitude map despite its
  rectangular aspect ratio. Contrast-enhanced or artificial-color panels cannot
  be used as an optical calibration.
- Existing generic texture-pack maps remain subject to their prior provenance
  holds. No geometry or source qualification is inherited merely from a
  familiar-looking texture.

## Credits and validation boundary

The [OPAL archive](https://archive.stsci.edu/hlsp/opal) licenses these products
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and requests
acknowledgement of NASA/ESA HST, the OPAL program led by Amy Simon, STScI/AURA
under NASA contract NAS 5-26555, and [DOI 10.17909/T9G593](https://doi.org/10.17909/T9G593).
Credits must accompany shipped derivatives and identify SOL's resampling/masking.
Mercury, Venus, Mars and Moon retain the source-specific agency/mission credits
in the handoff inventory. NASA attribution is not a claim of NASA endorsement.

Source work verifies byte identity, image decode, native dimensions, available
coordinate labels, color-profile presence and mask construction. Renderer
acceptance must independently test source X sign, prime phase, north/south,
ellipsoid latitude, UV-window application and withheld pixels. Tests should
sample asymmetric patterns on the actual GPU path, then inspect real maps.
Source failure, context loss and optional texture toggles must preserve the
correct fallback and source dates. This document does not claim those browser
or release gates passed; the implementation evidence records their results.

Local verification on 2026-09-13: all eight real assets reproduced byte-for-byte
through the tracked preparer into `build/planet-reference-replay-01/`. All twelve
offline regression tests passed, including the four Pillow image tests; none
were skipped locally. Tests cover source substitution, north/south coverage,
preserved valid black pixels, zero-channel and partial-footprint exclusion,
original Mars affine coordinates, the Venus longitude shortfall, endpoint sample
centers, refused overwrites and no partial publication. Image tests explicitly
report a skip on a host without the optional pinned Pillow environment; the
standard-library admission and mapping tests remain runnable there. No claim of
cross-platform image-byte reproduction is made without executing the hash gate.

Original and derivative hashes are recorded below so the ignored acquisition
workspace is not the only durable record of which bytes were evaluated.

| Body | Original SHA-256 | Rendering SHA-256 |
|---|---|---|
| Mercury | `f7a5b7b3e7a7e7b61c0e9267d87432a1c5f3f18282b55e264f14ef2f3bff8d31` | `1dc83dbbf0b59633673dd325b6f3e0f453c4a33c09a54c008bef71c2a0cd5ead` |
| Mars | `fdfcd335559c3dc67052b7e8a9565d850e336ac0d1f3ea7f5eb7826ffb44ecb2` | `f62de76a876702a3959dc5b2873c34f5cdeedda4c54eb7bddb6f78f62dbcfc74` |
| Venus | `833d5368564b626a787b6d0a2b2432a0afaa89f72d4b46e5221a19b3a01ec380` | `fc043e4ebabe8d50eba42c80378dbb82284f2e3ff7e59f1a0870f17e52c03bd7` |
| Jupiter | `c3b915227ef88899a07a2b62584d9303d77d3491b9bb7de8824fb6df4a52f7b2` | `b134fbf614aa21dda6e951f616067b2d32ed825950e48d35d35d09f6a5c80637` |
| Moon | `f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170` | `f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170` |
| Saturn | `c34a13a8253a39bcc1f8376b24c077b89f05ce0b5202706f535ded20314440d7` | `c88eb864e3c6a2c4a23f7b8cfa32a510e4dc46431da8b0697b7121f45e307fee` |
| Uranus | `838dbf45072d4354425389d7c5869312185fd8df3d0d5ee526661b22db4c3c12` | `d59ba81033bba3faf30950c2d8893319a8f3e94f968a648c03b16b5d0fd8c8a5` |
| Neptune | `8c17a2872b5d55577c63abe7ba1369997ff32bb83e0f9b9c350a46db96713cb8` | `c9dee0f329268f801ae5e4c736da72c329539f862a651f536e0c3d4846682adf` |
