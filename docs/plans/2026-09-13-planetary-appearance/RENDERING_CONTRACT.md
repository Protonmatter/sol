# Registered planetary appearance: rendering contract v1

Date: 2026-09-13. Implementation contract supporting [RFC 0004](../../rfcs/0004-registered-planetary-appearance.md),
`SOL-VIS-004`, `SOL-VIS-003`, `SOL-VIS-002` and `SOL-SCI-001`.
This is a bounded display-reference contract. It does not establish radiometric
calibration, continuous observation, forecast skill or complete surface qualification.

## Admission and compatibility

`visual-assets.v1.json` retains its existing legacy `assets`, `observed_images`,
`procedural_assets`, `fallbacks` and `dynamic_sources`. The additive `mapped_references`
collection admits documented geographic imagery for display. Its absence remains
valid for older fixtures. Its presence requires every record to pass strict fields,
types, byte identities, source metadata, coordinate bounds and processing checks.

Admission does not change a legacy `mapping_status: hold`, grant `global-sphere`, or
assert that provider interpolation was an observation. The existing
`--require-qualified` gate retains those distinctions. CLI output counts legacy
rasters, their verified source identities, pinned observed stills and dated mapped
layers separately. New mapped-reference records cannot duplicate an identity from
another raster collection.

Each new entry binds these independently reviewable facts:

| Property | Required evidence |
| --- | --- |
| Identity | Unique `id`, `body`, and one of `surface`, `night-lights`, `weather`, `sea-ice`; only one selected reference per body/role |
| Rendered bytes | Same-origin `textures/reference/<filename>.jpg`, `.jpeg` or `.png`, SHA-256, positive byte count and stored raster dimensions |
| Original bytes | Official HTTPS `source_url`, `source_sha256`, `source_bytes`, timezone-qualified `source_retrieved_at` |
| Interpretation | Visible label, credit, dated/ranged `observation_label`, `color_interpretation`, explicit limitations and derivation |
| Coordinates | Equirectangular projection, prime-meridian image position, longitude direction, latitude type, source-grid latitude bounds and optional pixel-center affine window |
| Coverage | `validLatitudeBounds` within the source grid; explicit `none`, `black` or `alpha` no-data policy |
| Review | Official metadata references and `reviewed_at` at or after source retrieval |

Derived RGB, masks and palettes may use `derivation_inputs`, a nonempty array of
`{url, sha256, bytes}`. It must include the exact bound primary source and identify
each further original input without duplicate URLs. Different rendered/source hashes
require a processing description. A source URL alone does not demonstrate byte identity.

Source hosts are NASA/USGS domains or the exact NASA mission archives
`archive.stsci.edu` and `outerplanets.stsci.edu`. STScI input requires NASA mission
metadata in the same record. The exact NASA GIBS documentation host
`nasa-gibs.github.io` is an additional metadata source, not an image acquisition host.
Credentials, non-HTTPS sources, host lookalikes and unusual ports are rejected.

The dated labels cannot claim live/current observations. Absence of such a word does
not itself prove honest interpretation: product review must still confirm the date,
processing, coverage and visible limitation text. Acquisition and source research
remain explicit tasks; validation and build use committed bytes offline.

All files recursively under `textures/reference` must be inventoried. Symlinks,
unlisted files, wrong hashes, wrong sizes, invalid supported image headers and wrong
dimensions fail admission. This does not expand the legacy flat texture inventory.
PNG alpha no-data requires an explicit alpha channel; inferred palette transparency
needs a reviewed conversion. Header validation is not a full raster decoder; browser
decode/upload readiness is a separate gate.

An optional `sea-ice` `legend` binds original provider PNG bytes at an `images/` path,
with SHA-256, byte count, dimensions and official source URL. Other roles cannot use
that field. The legend remains a same-origin image beside the dated concentration
explanation. It is independent of the reference-texture inventory and must be retained
by release asset staging.

## Body coordinates and pixel registration

`surfaceMapping.js` exports immutable `DEFAULT_SURFACE_MAPPING`, `surfaceUv`,
`srgbToLinear`, `linearToSrgb`, `NIGHT_LIGHT_FULL_COSINE` and `nightLightWeight`.
`surfaceUv(position, mapping, axisRatio)` operates on the sphere mesh coordinate
before the renderer scales it to the ellipsoid. It accepts finite nonzero 3-vectors
and a positive finite axis ratio `q = polarRadius / equatorialRadius`.

The mesh coordinate is parametric. If `rho = hypot(x,y)`:

| Source latitude convention | Latitude recovered from mesh coordinates |
| --- | --- |
| Parametric | `atan2(z, rho)` |
| Planetocentric | `atan2(q*z, rho)` |
| Planetographic | `atan2(z, q*rho)` |

The planetographic expression follows the ellipsoid-normal latitude definition;
the planetocentric expression follows the scaled position vector. These are the
local renderer transform, derived from ellipsoid geometry and checked independently
against the coordinate distinctions in [JPL GEorec documentation](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/FORTRAN/spicelib/georec.html).
They do not establish which convention a particular source used; that remains in
the product metadata and source review.

Positive mesh longitude runs from `+x` toward `+y`. Compute:

```text
longitude = atan2(y, x)
uGrid = fract(primeMeridianU + direction * longitude / (2*pi))
vGrid = (northLatitude - sourceLatitude) / (northLatitude - southLatitude)
uImage = uGrid * uvScale[0] + uvOffset[0]
vImage = vGrid * uvScale[1] + uvOffset[1]
```

`direction` is `+1` for east or `-1` for west. The pole uses the prime-meridian
column because longitude there is indeterminate. The default is prime meridian
`0.5`, east, planetocentric, latitude grid `[-90,90]`, scale `[1,1]`, offset `[0,0]`.
The longitude wrap happens before the affine image window.

The affine scale is positive and finite; offsets and endpoints are finite, and each
transformed axis must overlap the image. A documented grid may extend slightly
beyond an image edge: the Venus source's fractional missing seam is one such case.
Out-of-image coordinates retain their computed value and return `inCoverage:false`.
They must use fallback pixels, not clamp to a pole or repeat the opposite seam.
The shader additionally applies the independently declared valid-latitude bounds
and no-data mask. Missing caps and swaths remain missing.

The renderer's ellipsoid normal matrix is the inverse transpose of its model scale
and rotation, proportional to `R * diag(1,1,1/q)`. Source latitude and lighting normals
serve different purposes; both must agree with the actual scaled geometry. IAU
orientation, ephemeris positions, supported dates, physical centers, display-radius
clearance, collision guards and state estimation remain outside this change.

## GPU interface and color composition

The reference branch uses the existing `SPHERE_VS` and `SPHERE_FS`, selected by
`u_useTex=1` and `u_texMode=3`. Other material modes retain their established meaning.

| Uniform | Contract |
| --- | --- |
| `u_map` | `[primeMeridianU, direction, latitudeType, 0]`, where type is 0 parametric / 1 planetocentric / 2 planetographic |
| `u_mapLat` | `[gridSouth, gridNorth, validSouth, validNorth]` in radians |
| `u_mapWindow` | `[scaleU, scaleV, offsetU, offsetV]` |
| `u_mapNoData` | 0 none / 1 black / 2 alpha |
| `u_oblate` | Polar/equatorial ratio of the rendered body |
| `u_earthNight`, `u_earthWeather`, `u_earthIce` | Explicit layer switches, reset between draws |
| `u_nightTex`, `u_weatherTex`, `u_iceTex` | Texture units 2, 3 and 4 |

Decoded HTML images enter the actual `makeTexture` RGBA upload path with
`UNPACK_FLIP_Y_WEBGL=false`: north remains the top source row. The
[WebGL specification](https://registry.khronos.org/webgl/specs/latest/1.0/)
defines the image unpack controls used by this path. Display imagery uses linear
filtering/mipmaps; scientific sea-ice palette pixels use nearest sampling. A device
unable to preserve the palette grid fails that layer explicitly. General display
resampling must preserve geographic extent and report its display limitations.

Masked photographic references upload with `UNPACK_PREMULTIPLY_ALPHA_WEBGL=true`.
The shader divides the filtered RGB by coverage alpha before decoding sRGB, then
composites covered source and fallback in linear light. This excludes no-data RGB
from the source color average and prevents dark filtering fringes. Zero coverage
uses fallback. The unpack setting is explicit for every texture upload; unmasked
maps and the nearest-sampled scientific palette use the non-premultiplied path.
Texture interpolation remains a display reconstruction, not a new observation.

Reference RGB is treated as display sRGB by an explicit convention. The pure helper
uses the standard piecewise transfer: decode cutoff `0.04045`, exponent `2.4`; encode
cutoff `0.0031308`, reciprocal exponent. This corresponds to the
[W3C color conversion definitions](https://www.w3.org/TR/css-color-4/#color-conversion-code).
Shading/compositing occurs in linear light and output is encoded once. This is not
source reflectance calibration. Existing moon albedo/reference behavior keeps its
separate established contract.

The reference branch uses a stated illustrative ambient floor of `0.001`, plus
`0.999 * max(dot(normal, SunDirection),0) * visibleSolarFraction`. It avoids a bright
night-side weather image while preserving direct-light eclipse shadows. The legacy
ambient floor is unchanged. Atmospheric limb scattering remains illustrative.

Earth's source layers share their admitted geographic grid, with distinct dates:

The validator enforces the current shared-UV renderer boundary: auxiliary roles are
supported only for Earth and require its surface reference. Base and auxiliaries
must agree on normalized prime meridian, longitude direction, latitude type and
projection, use full `[-90,90]` grid/valid-latitude bounds, and retain an identity
image window. Omitted window defaults equal explicit `[1,1]` scale and `[0,0]`
offset; prime-meridian `1` equals `0` after wrapping. Night lights require `none`
no-data semantics; the historical cloud layer, weather and sea ice require `alpha`. This does not assert that
all cells were observed: the admitted masks still retain missing coverage. A new
auxiliary source on another grid requires reviewed normalization or a renderer
extension before admission. Surface-only maps retain their documented partial grids
and affine windows.

1. The base provides observed/source-composited continents and land ice. Provider
   processing and interpolation must remain in the source explanation.
2. Dated satellite weather is clouds **and surface** where that is the product's
   content. Its documented validity mask controls alpha; missing data reveals the
   base. No arbitrary cloud drift, invented swaths or hemispheric mirroring is added.
   This daily swath view requires explicit selection. The default uses the qualified
   NASA Blue Marble 2002 cloud-only layer, white cloud with alpha fitted from its
   grayscale source over the base, with historical processing and date disclosed. The same solar-lit sampler selects exactly one source; a pending or
   unavailable source never implicitly falls back to the other epoch.
3. Night lights use a published source composite as relative display emission.
   Weight is zero at solar cosine `>=0`, full at `<=-sin(6 degrees)`, with a smooth
   cubic transition. The transition is a display convention, not a street-light
   activation/outage model. Camera direction, ambient darkness and eclipses do not
   turn on day-side lights. The composite epoch does not follow the simulation clock.
4. Sea-ice concentration colors composite after lighting and retain the original
   provider legend. They are an optional dated analysis overlay, not white material
   painted from latitude. Land ice, sea ice, cloud and no-data semantics stay distinct.

## Acceptance and evidence

| Layer of evidence | Required checks |
| --- | --- |
| Pure coordinate math | Prime meridian, east/west anchors, both poles, antimeridian, partial bounds, stable huge/tiny vectors, rejected invalid inputs, independently derived `q=.5` latitude cases, affine uncovered-edge cases |
| Transfer/illumination math | sRGB segment boundaries and round trips; night weight bounded, monotonic, zero by day and full by stated twilight bound |
| Offline source admission | Required/unknown fields, dates and claims, exact source/derived inputs, URL boundaries, roles, legacy holds unchanged, file inventory/hash/dimensions/alpha, original legend identity |
| Actual GPU | Compile actual sphere shaders; decode/upload real PNG fiducials through actual `makeTexture`; compare asymmetric landmarks, source coordinates, missing caps/seams/no-data, linear alpha, dim ambient, night emission, palette and ellipsoid normal lighting |
| Negative controls | Flip image upload, reverse longitude and displace prime meridian by half a turn; each must differ from the registered landmark reference |
| Application integration | Final staged-build controls, source/date/legend visibility, Earth and other bodies, texture/layer toggle resets, missing image and context-loss recovery, keyboard/focus/reflow, no runtime errors |
| Existing science/delivery | Established physical geometry, orbit clearance, shadows, eclipse, state/uncertainty, source fingerprint, coverage, service worker and release identity gates |

The GPU fixture uses synthetic images explicitly as test coordinates. It does not
claim those images are NASA data. Its one-pixel patches isolate shader lookup from
camera framing; the application's full-sphere screenshots and interaction checks
remain additional evidence. Evidence JSON binds shader, renderer, helper and fixture
hashes, Chrome/GPU identity, every expected/actual result and runtime errors.

Run from repository root:

```powershell
node --test tests/web/surfaceMapping.test.mjs
python -m unittest discover -s tests/python -p test_mapped_references.py -v
python -m unittest discover -s tests/python -p test_visual_assets.py -v
python tools/validate_visual_assets.py
node tools/planet_appearance_validation.mjs --out=coverage/planet-appearance
node tools/planet_appearance_validation.mjs --web-root=build/site --out=coverage/planet-appearance-candidate
```

The GPU tool accepts `--browser=<path>` or `CHROME_BIN`; it launches an owned Chrome
instance against credential-free loopback fixtures using installed locked dependencies.
It admits no external image traffic and writes only its evidence directory. It exits
0 on all checks passing and 1 on failure. A 75-second work deadline, bounded launch
settlement and owned-browser cleanup bound failure. No service or scheduled task remains.
With `--web-root`, it selects the release manifest's current namespace and verifies
the exact tested module hashes; it does not accidentally test a retained old release.

The reusable hosted coverage workflow runs this GPU gate against `build/site` after
the existing browser assertions, and retains `coverage/planet-appearance` with the
JavaScript validation artifacts. Local helper/validator results and initial GPU results
are implementation evidence; final build, hosted CI and product acceptance must be
reported separately. Record their exact candidate/hash in the parent evidence ledger.

## Rollback and remaining bounds

Revert the appearance runtime, mapped reference collection/bytes, UI controls and
documentation as one reviewed change. Legacy fallback and source holds remain valid.
No ephemeris migration or state-model rollback is required by this contract.

Gas-giant patterns retain their source epochs and do not forecast atmospheric motion.
Enhanced-color, radar, mosaicked and interpolated products retain those names and
limits. Native resolution constrains detail. A verified hash/transform cannot prove
source completeness, absolute photometry, current weather or a user's monitor response.
Those limits remain visible rather than being silently upgraded by visual polish.
