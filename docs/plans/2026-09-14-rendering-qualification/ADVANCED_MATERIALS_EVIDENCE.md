# Advanced material implementation evidence

The implementation extends the accepted rendering direction without changing source
images, engine state, orbit/radius values, or the existing Earth presentation gate.
Each source/model admission below is separate from whole-application qualification.

## Runtime status and remaining requested work

| Requested feature | Enabled runtime behavior in these commits | Reference/tooling result | Remaining qualification |
| --- | --- | --- | --- |
| D2 Earth reflection | No new Earth reflection material. | Independently implemented GGX/Fresnel CPU and real GLSL float-target corpus. | Real material/coverage admission, measured angular comparisons and integrated HDR qualification. |
| D3 finer terrain | New Moon/Mars numerical height products drive displacement, normals and the full shadow grid; close views select level 4. | Exhaustive source/derivative comparison, allocation/cancellation checks and actual level 4 draw submissions. | Final integrated/native-device qualification. Regional tiled terrain and finer photographic color products have not been implemented. |
| D4 ring transport | The existing display shadow now uses the explicitly named display-transmission helper; its numerical behavior is preserved. | Mixed-subregion transmission, coverage separation and independent CPU/GLSL observables. | A real band/geometry-specific transmission product and separate reflected-light model. No calibrated angular material is enabled. |
| D5 moon photometry | Existing moon materials and source map modes continue. | Independent disk and hemisphere quadratures, partial-coverage accounting and GLSL disk sums. | Per-body calibrated material/attitude data and independent epoch/aspect validation. No moon receives fitted brightness or a calibrated surface model. |

Only the bounded D3 terrain change supplies new live visual detail here. D2, the
calibrated portion of D4, and D5 remain incomplete requested production work;
passing synthetic references does not complete them.

## D2: synthetic dielectric reflection

`surfaceReflection.js` implements the bounded GGX distribution, separable Smith
masking and exact dielectric Fresnel for slope width alpha in [0.05, 1]. The matching
GLSL include is available for independent shader qualification. Its Python float64
reference is separately implemented in `tools/reflection_reference.py`.

The directional corpus has 400 cases: incidence/emergence 0, 30, 60, 80 and 89 degrees,
relative azimuth 0, 45, 90 and 180 degrees, alpha 0.05, 0.2, 0.5 and 1, synthetic
indices 1 and 1.5. CPU comparisons, reciprocity, equal-index and total-internal-
reflection cases pass. Normal-incidence hemisphere integration for alpha 0.2, 0.5
and 1 converges by less than 1e-5 between 256 and 512 midpoint polar samples and
remains below unit incident energy. This limited convergence corpus does not qualify
all grazing or narrow-lobe hemispheric integrals. The synthetic GPU directional
corpus now passes all 400 cases under the prescribed 1e-5 + 1e-3*abs(reference)
criterion; the maximum error/budget ratio is 0.09304. This qualifies the tested
synthetic shader values, not a real Earth reflection material.

No Earth reflection record is admitted. The concrete missing inputs are a registered
categorical water/land/ice/unknown product, a band-specific refractive-index and
roughness model, cloud/baked-highlight treatment, and independent held-out directional
measurements. NASA MOD44W alone supplies neither roughness nor the latter measurements.
The existing photographic material receives no added uncalibrated lobe.

References: [Walter et al. (2007)](https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf),
[NASA MOD44W description](https://modis.gsfc.nasa.gov/data/dataprod/mod44w.php).

## D3: finer complete-globe numerical terrain

The runtime selects new immutable `moon-radial-height-v2.u16.bin` and
`mars-radial-height-v2.u16.bin` products, each 2880 by 1440 (8 samples/degree,
0.125-degree output cells). The inputs are 5760 by 2880 (16 samples/degree,
0.0625-degree source cells), acquired from NASA/PDS on 2026-09-14. The original
source and metadata bytes remain under the operator's `build/terrain-source-v2`
cache, with their acquisition record. Their filenames/hashes are pinned in
`tools/prepare_terrain_detail.py`. All v1 binary bytes remain unchanged and their
complete prior metadata remains in [the baseline manifest](TERRAIN_BASELINE_V1.json).

Each output cell is the equally weighted mean of its registered 2 by 2 numerical
source cells, with exact rational conversion and half-up rounding to integer metres.
This is not a shot-weighted or spherical-area mean. Missing input samples fail the
complete-grid route. Source-team interpolation remains explicitly disclosed; the
products do not independently distinguish a measured shot from an interpolated bin.
LOLA's unsigned half-metre TIFF is offset by 20000 codes relative to the 1737.4 km
sphere. MOLA uses signed big-endian integer metres offset from a 3396 km sphere;
areoid heights are not substituted.

The original MOLA PDS3 label and the new PDS4 array both establish those dimensions,
radius datum and encoding. The PDS4 cartography block has transposed scale/resolution
numbers (16 km/pixel and 3.705 pixels/degree); the original label correctly states
16 pixels/degree and approximately 3.705 km/pixel. The preserved PDS3 label,
array dimensions and documented coverage define this product's registration.

An independent float64 footprint implementation checked all 4,147,200 output cells
per body against the original source and found zero mismatches. Maximum added
quantization error was 0.5 m. Source/derivative height extrema in kilometres are:

| Body | Original 16-sample source | 8-sample derivative |
| --- | --- | --- |
| Moon | -8.9815 to 10.6855 | -8.729 to 10.552 |
| Mars | -23.170 to 21.280 | -23.059 to 21.272 |

Grid spacing is not measurement accuracy. Source gridding and the deliberate
2-by-2 footprint mean limit geological detail. All retained cells drive the same
physical mesh sampling, finite-difference normals and complete R32F shadow field;
there is no higher-detail surface paired with the prior coarser shadow texture.
The existing 64-step directional shadow approximation remains bounded and can
undersample long grazing paths. This change does not qualify regional tiles,
finite-Sun penumbrae or arbitrary sub-cell geology.

Existing detail levels 1, 2 and 3 retain 48/96, 96/192 and 192/384 latitude/longitude
segments. A new level 4 selects 256/512 segments at projected diameter >=1500 pixels,
within the prior 256/512 geometry hard cap. Lower ready levels remain available
during demand changes. Terrain work is serialized to one transfer/worker/CPU build;
conservative per-request CPU admission includes encoded overlap, decoded heights
and mesh arrays under 48 MiB. Two complete GPU entries fit within 64 MiB. These are
tracked allocation estimates, not a measurement of driver or garbage-collector memory.
Device texture dimensions are checked before acquisition; partial GPU groups are
released on failure. The finite deadline, explicit retry, cancellation and context
identity checks remain in force.

Offline commands:

```powershell
python tools/prepare_terrain_detail.py --source-dir build/terrain-source-v2
python tools/terrain_detail_validation.py --source-dir build/terrain-source-v2 --out build/terrain-v2-source-evidence-01.json
python tools/validate_physical_assets.py
python -m unittest discover -s tests/python -p test_terrain_detail.py
node --test tests/web/terrainAssets.test.mjs tests/web/terrainDetail.test.mjs tests/web/terrainGeometry.test.mjs tests/web/terrainResources.test.mjs tests/web/terrainShadows.test.mjs tests/web/terrainWorkerClient.test.mjs tests/web/physicalRendering.test.mjs
```

The receipt destination must be new; failed receipts are retained. The original
source cache must match the pinned hashes before derivation. Revert this slice's
commit to select the preserved v1 catalog and loader budgets together. The numerical
GPU shadow corpus and staged application qualification described below now pass
on software WebGL2. New native-device and integrated release qualification remain
separate requirements.

Sources: [NASA numerical displacement product](https://svs.gsfc.nasa.gov/4720/),
[PDS MOLA product description](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html),
[exact MOLA PDS3 label](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megr90n000eb.lbl),
[exact MOLA PDS4 label](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megr90n000eb.xml).

## D4: ring coverage and transmission

`ringTransport.js` discriminates preserved `display-opacity` from a bounded
`resolved-mixture` of explicit empty, opaque and homogeneous-depth subregions.
The latter averages transmission after angular transport, then applies separate
geometric coverage. It never derives optical depth from the old opacity texture.
The mandatory half-opaque/half-empty fixture transmits 0.5 at both normal and
half-cosine incidence; the incorrect averaged slab gives 0.25 and is rejected.
Negative weights/depth, non-unit total area, unsupported material records and
grazing values outside 0.02 <= abs(cosine) <= 1 fail closed.

The live ring-shadow shader calls the explicit display-transmission helper with
its unchanged 0.72 contrast factor and unchanged geometric edge coverage. Band
geometry, source photo alpha, narrow rings, gaps and the ray-plane guard remain
unchanged. Homogeneous and mixed-coverage GLSL helpers are available to a separate
qualified material route; no measured optical-depth source is currently admitted.

The concrete missing product is a selected band-specific occultation or angular-
transmission profile with radius registration, spatial support, illumination/view
geometry, noise/saturation limits, uncertainty and independent holdout samples.
The available Cassini RSS archive is radio-band evidence and cannot directly
calibrate visible RGB transmission. Reflected ring brightness/phase scattering is
also distinct from transmission. Existing display assets retain their declared role.

## D5: physical moon photometry reference

`tools/moon_photometry_reference.py` now supplies two independent quadratures: equal
projected-area disk sampling and visible-hemisphere surface-area sampling with the
explicit normal/view factor. Both compare the outgoing Lambertian signal to the
same unit-reflectance flat disk. The analytic phase law and zero-phase 2*rho/3
geometric albedo are tested at rho 0.1, 0.5 and 1 and phases 0, 30, 60, 90, 120, 150
and 180 degrees. The two quadratures agree within 1e-4 absolute normalized units
and reject the texture-mean shortcut. A 256 by 256 float-target GLSL disk fixture
is included in `tools/advanced_material_validation.mjs`, separately from live moons.

Partial source coverage reports observed contribution and unresolved illuminated
projected fraction separately. The disk result remains unavailable while a required
illuminated/visible contribution is missing; observed cells are never renormalized
to a full globe. Valid black cells count as measured zero. Asymmetric hemispheres,
orientation changes, explicit bands and invalid inputs have independent tests.

The existing `moonAlbedoGain`, hue recipe, mapped source modes (including Io mode 5)
and simplified materials remain unchanged. A geometric albedo above one can arise
from directional scattering and cannot be used as a Lambertian diffuse reflectance
above one. No catalogue value or image mean has been fitted into a new material.

No real per-body/band model is admitted. Required missing inputs are calibrated
angular or disk photometry over a declared phase/aspect domain, band responses,
uncertainties, registered normalization history and valid body attitude for the
observed epochs, followed by independent holdout epochs/aspects. ROLO demonstrates
why phase and libration are needed for the Moon; its program description does not
supply equivalent calibrated models for the other satellites. The current fixed
source-map reference orientation is not a time-dependent attitude solution.

Sources: [JPL geometric-albedo technical definition](https://ssd.jpl.nasa.gov/glossary/albedo.html),
[USGS ROLO measurements and domain](https://www.usgs.gov/centers/astrogeology-science-center/science/rolo-further-details-lunar-calibration).

## Bounded source admission assessment

The [acquisition receipts](MATERIAL_SOURCE_ACQUISITION.json) preserve successful and
failed documentation/product requests made on 2026-09-14. Successful original bytes
remain in `build/material-source-assessment`; the receipt records byte counts, SHA-256,
content type and final URL. These are source investigation records, not admitted
runtime assets. A successful HTTP response is insufficient when its content is wrong.

The [PDS ring-occultation index](https://pds-rings.seti.org/ringocc/) identifies the
specific Earth-based `EBROCC_0001` volume: six telescope data sets from the July 1989
28 Sgr Saturn occultation. Its 5.14 MB original archive request returned HTTP 403;
this is a historical failed request, and no product label or profile was acquired
in that attempt. The [visible-source follow-up](VISIBLE_RING_SOURCE_CANDIDATE.md)
records a later successful directory GET separately, resolves the bands of three
EBROCC catalog entries, and identifies an exact visible-sensitive HST candidate.
Its bounded science-file prefix and complete quality product do not constitute
an admitted radial optical-depth profile; runtime source admission remains held.
Cassini RSS/UVIS/VIMS archive descriptions identify radio/ultraviolet/infrared
measurements; they do not admit visible RGB transport. Even a downloaded profile
of effective normal optical depth would not independently identify unresolved
opaque area and depth within its measurement footprint. The current values in
`orreryMath.js:ringColorAt` and `ringOpacityProfile` remain display recipes.

The Moon does have source-backed band/phase observables. The
[USGS instrument-team documentation](https://www.usgs.gov/centers/astrogeology-science-center/science/rolo-information-instrument-teams)
contains an EO-1/ROLO worked exchange example at 2001-11-01T21:05:43 UTC, phase
8.599 degrees. For the nominal 485 nm band (effective 485.70 nm), it lists modeled
disk irradiance 3.3652 microW m^-2 nm^-1 and the observing geometry. It also gives
ten observation examples. These are documented exchange examples, not an independently
admitted holdout corpus. USGS explicitly limits this interface to disk-integrated
irradiance; it requires spectral response and detailed geometry. A disk result does
not determine the distribution of radiance over this application's photographic map.

The exact Kieffer/Stone 2005 publication is
[USGS record 70029564](https://www.usgs.gov/publications/spectral-irradiance-moon),
DOI `10.1086/430185`. The former NASA SeaWiFS coefficient-paper URL now returns
generic SeaWiFS HTML with HTTP 200, rather than the requested PDF. That response
is preserved and rejected for coefficient admission. The
[Buratti 2011 NASA record](https://ntrs.nasa.gov/citations/20120013529), DOI
`10.1029/2010JE003724`, returns metadata with an empty downloads array. Neither
record supplies an acquired complete coefficient/adjustment product here. Search
snippets are not substituted for original numerical tables.

The smallest plausible next Moon step is an explicitly band-limited disk-observable
model after acquiring exact versioned coefficients/adjustments, spectral integration
and geometry inputs plus independent comparison epochs. It would remain a disk
observable until a separately sourced surface radiance model and attitude/registration
contract support live mapped rendering. These acquisition results establish the
current admission boundary; they do not claim that suitable data do not exist.

## GPU and whole-application receipts

All runs used Node 22.23.2 and serialized owned Chrome/SwiftShader processes. These
are local software-WebGL results, not new native-driver or production release claims.
Receipts and screenshots are retained under the named `coverage` directories in the
implementation checkout. Each selected stage binds release and per-file hashes.

| Stage source | Receipt directory | Result |
| --- | --- | --- |
| `fee4035` | `coverage/terrain-v2-shadow-01` | 32/32 real shader/R32F shadow checks pass, including actual v2 Moon/Mars grids, seams, poles and analytic ridge/flat cases. |
| `fee4035` | `coverage/terrain-v2-physical-01` | 19 full-app checks pass, real workers/new height assets, relief on/off, source views, context restoration and 390-pixel layout; later ring-helper work is separately reported as current-source drift. |
| `acb3c94` | `coverage/advanced-material-gpu-01` | 425/425 pass: 400 GGX, 4 ring transmission fixtures and 21 pre-exposure Lambert disk sums. |
| `acb3c94` | `coverage/advanced-ring-01` | Retained failed harness attempt: extracting only the ring shadow block omitted its new helper dependency. No production shader error was inferred from this fixture error. |
| `acb3c94` | `coverage/advanced-ring-02` | After hash-binding the helper into that fixture, 11/11 established ring display/alpha/gap/shadow checks pass. |
| `acb3c94` | `coverage/terrain-v2-physical-level4-02` | 21 full-app checks pass with additive `--terrain-close-detail --context-loss`; both bodies submit actual level 4 draws, then restore the prior zoom and complete the original tour. |

The level 4 probe observes real worker payload identity and the real indexed draw,
including 131,841 vertices, 783,360 indices, unsigned-32 index type, a 3,133,440-byte
index buffer and the enabled terrain-shadow uniform. It adds no runtime hook and
does not relax the existing application predicates or 240-second total deadline.
Both body captures were inspected. Magnification still exposes the finite resolution
of existing source color maps; this change does not create additional color detail.

The ring synthetic maximum absolute error was 1.24e-8. The 256-square Lambert
fixture's maximum normalized disk error was 3.78e-5, within the prescribed relative
1e-3 plus absolute 1e-5 criterion in every case. Per-case raster coverage error is
reported separately. These are synthetic shader observables; calibration of live
moon materials and real ring angular transmission remains held.

The established three-final-Earth-draws-within-five-seconds gate was not changed by
these slices and is owned by the integrating workstream. New integrated color/HDR
and atmosphere changes require their own final combined stage; these receipts
cannot be relabeled as results for later commits.

The final JavaScript suite passes 1,010/1,010 tests. Its first broad run caught three
older lifecycle assumptions about immediate/concurrent terrain starts. The queue
now starts its first admitted task synchronously, preserving that existing behavior;
the intentional single-worker contract queues the next level until the first ends.
The lifecycle test now asserts both that serialization and the original late-result,
fallback/status, cancellation and explicit-retry behavior. All 29 focused lifecycle
and resource checks then pass. This scheduling-only follow-up does not change the
shader or terrain bytes, but later combined application validation must still bind
the final integrated source. The failed first full-suite output is retained in
`build/advanced-full-node-tests.txt`; the passing run is
`build/advanced-full-node-tests-02.txt`.

## Additive Mars optical terrain animation admission

`tools/physical_rendering_validation.mjs --mars-optical-animation` adds a final
Mars phase after every existing paused-engine, gallery, restoration and mobile
predicate. It leaves the 240-second whole-application deadline and original
three-Earth-final-draws-in-five-seconds gate unchanged. The extra Mars phase uses
the existing seven-days-per-second UI preset and requires at least three distinct
actual Mars draws and their matching final HDR presentations within five seconds.
All hashing and full geometry readbacks finish before that window.

The shared physical probe identifies the actually linked sphere shader sources,
the source-bound optical profile and actual incident/column texture uploads, and
the current optical camera/Sun geometry. The terrain probe separately reads both
GPU buffers through `COPY_READ_BUFFER`, compares their complete SHA-256 identities
with a mesh rebuilt from the staged MOLA source, and invalidates that proof after
buffer modification, copying, deletion or transform-feedback use. Timed draws
must bind those same buffers with the complete 783,360-index unsigned-32 range,
131,841 vertices, exact interleaved position/normal layout, source-derived terrain
shape/pole uniforms and the decoded source R32F shadow texture. Readiness metadata
or a matching buffer size cannot satisfy these predicates.

The texture observer records exact numerical upload bytes and unpack state before
startup and hashes immutable copies outside the timed window. Later modification
or framebuffer attachment invalidates static-source admission. It therefore does
not claim to qualify a dynamic scattering field: such a field needs separate
producer generation and camera/Sun/profile evidence. The existing direct optical
reference renderer remains the baseline for this application-consumption gate.

The actual source-derived Mars level-4 mesh has optical unflattened heights from
-7.06905 to 22.78633 km. All 131,841 vertices fit the incident field's existing
[-24,24] km height domain. This correlated vertex result is separate from the
conservative independent radius/polar envelope needed by atmospheric domain
qualification. The original atmospheric corpus must remain intact, with the v2
terrain envelope added as supplemental cases before a new scattering field is
admitted for these assets.

CPU regressions cover equal-sized corrupted geometry, rejected readbacks, changed
layouts and source textures, partial draws, post-readback mutations through every
WebGL2 buffer target alias, stale/frozen transforms and late or mismatched HDR
presentation. The combined suite passed 1,076 tests before the final buffer-alias
guard; all six terrain-probe groups passed after that guard. Runtime type checking
passed 108 files and documentation validation passed 117 Markdown files.

Example, using an existing pinned stage and Node 22:

```text
node tools/physical_rendering_validation.mjs --web-root=build/<immutable-stage> --out=coverage/<new-receipt> --terrain-close-detail --context-loss --mars-optical-animation
```

Exit 0 means every enabled predicate passed on the recorded local backend. A
nonzero result retains failure state and the receipt. Removing the optional flag
returns to the established application tour; no product runtime hook is installed
outside this validation process.

The first immutable combined run passed all 22 checks in 77.896 seconds. Runtime
source `f022cea` is staged in `build/mars-optical-terrain-03`; the release manifest
SHA-256 is `15e98b0049fff99fb605f752211de7db657cda2708d1bfea3873f0f72a517399`.
The harness includes buffer-alias guard `58fd468`, and its exact tool hashes are
bound in the receipt. There were no current-source differences, page/console/GL
errors, rejected physical/terrain draws, presentation mismatches or late reads.
Five accepted Mars final presentations completed at 24.3, 418.9, 768.3, 811.4 and
1,841.0 milliseconds; each includes current source geometry, optical fields and
camera/Sun intervals. The independently captured model and inverse-transpose
normal rotations passed the seven-days-per-second bounded spin check, and a
frozen-transform control was rejected.

Context restoration delivered the native event 3.8 milliseconds after request and
restored actual terrain/optics readiness after 9.3123 seconds, retaining the
original 10-second native-event and 40-second resource deadlines. The final image
was inspected: the highly magnified numerical terrain is visible, while the
existing color map remains limited by its original resolution.

The complete local receipt is `coverage/mars-optical-terrain-03/evidence.json`,
SHA-256 `5e4f5f9f6c05f4417c9571ef34f92c93875d9982d058a5c1d1e0a1682110e790`.
Its bounded checked-in summary is
[MARS_TERRAIN_OPTICAL_RUNTIME_RECEIPT.json](MARS_TERRAIN_OPTICAL_RUNTIME_RECEIPT.json).
This harness requested SwiftShader but did not record the context adapter string;
the receipt does not establish a native-driver result. These are successful
application-consumption checks for the staged direct reference optics path and
static fields. They do not admit a later dynamic scattering candidate or remove
the distinct reflection, calibrated ring and calibrated moon source holds.
