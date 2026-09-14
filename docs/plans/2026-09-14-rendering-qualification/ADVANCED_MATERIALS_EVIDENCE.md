# Advanced material implementation evidence

The implementation extends the accepted rendering direction without changing source
images, engine state, orbit/radius values, or the existing Earth presentation gate.
Each source/model admission below is separate from whole-application qualification.

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
all grazing or narrow-lobe hemispheric integrals. GPU evaluation remains pending.

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
commit to select the preserved v1 catalog and loader budgets together. GPU source,
geometry, shadow and full-application qualification remains pending for this slice.

Sources: [NASA numerical displacement product](https://svs.gsfc.nasa.gov/4720/),
[PDS MOLA product description](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html),
[exact MOLA PDS3 label](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megr90n000eb.lbl),
[exact MOLA PDS4 label](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megr90n000eb.xml).
