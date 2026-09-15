# Numerical terrain source qualification

Date: 2026-09-13. Scope: RFC0005 / SOL-VIS-005; first two admitted numeric products.
This record qualifies local data conversion and geometry. Browser integration evidence
belongs in the parent implementation record. It does not qualify a surface-navigation
tool, new scientific elevation measurements, current-facing lunar feature positions,
or terrain on the other planets and moons.

## Source identities and vertical datum

| Body | Numeric source | Vertical meaning | Native grid |
| --- | --- | --- | --- |
| Moon | NASA SVS CGI Moon Kit `ldem_4.tif`, reformatted LRO/LOLA gridded laser altimetry | Float kilometres above the 1737.4 km reference **sphere** | 1440x720, 0.25 degrees per cell, approximately 7.58 km equatorial cell width |
| Mars | PDS MGS MOLA `MEGR90N000CB.IMG` version 2.0 | Signed big-endian integer metres **plus 3396000 m gives planetary radius** | 1440x720, 0.25 degrees per cell, approximately 14.82 km equatorial cell width |

The numeric Moon TIFF is separate from NASA's aesthetically adjusted color image.
The Mars source is the **radius** product (MEGR), not the topography-above-areoid
product (MEGT). Adding MEGT to SOL's ellipsoid would introduce a datum error. Conversely,
applying the existing Mars flattening to MEGR a second time would distort the poles.
The geometry converts actual source radius into the existing model's normalized
equatorial/polar coordinates, so its final model transformation reproduces the radius.

Primary records:

- <https://svs.gsfc.nasa.gov/4720/>
- <https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif>
- <https://pds-geosciences.wustl.edu/missions/mgs/megdr.html>
- <https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/megr90n000cb.img>
- <https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/megr90n000cb.lbl>
- <https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/megr90n000cb.xml>

The PDS4 XML's cartography `pixel_scale_x/y` fields say 14.818 pixel/degree. That
contradicts both its descriptive text and its inherited PDS3 label: the actual
1440x720 global map is **4 pixels/degree**, and **14.818 km/pixel**. This implementation
uses the dimensions, PDS3 MAP_RESOLUTION=4.0, and cell bounds. Both label byte identities
are retained so this source metadata inconsistency is inspectable.

| Original file | SHA-256 |
| --- | --- |
| `ldem_4.tif` | `330afa2556a86fd05ac6ba2f912f246600fdade35de2a0d90593d50d07b01b65` |
| `megr90n000cb.img` | `f03189d62bb882f81d4f1dd08537e56d42f3d0371747ce62c9f01db3f552834a` |
| `megr90n000cb.lbl` | `5b5887d828354542e92eb404c1b7c25371b2aedeeedf645a18da22efaf06a8a9` |
| `megr90n000cb.xml` | `18a41c681c7d418eca3be847f8b0b33bbb6f2bfe838b41c96f047c2e4540b332` |

## Registration and coverage

Both maps use north-up, planetocentric latitude, positive-east longitude and
cell-centered samples. The Moon map spans -180..180 east with prime-meridian U=0.5.
The Mars map spans 0..360 east with prime-meridian U=0.0. Runtime bilinear sampling
wraps longitude and treats source pixel centers as centers, not edges. The half-cell
polar caps converge to the mean of the nearest source row; this is an explicitly local
closure/interpolation rule, not an added polar measurement. Duplicate longitude seam
vertices and normals are copied exactly. Each LOD is one closed globe, avoiding
mismatched tile boundaries; there are no patch skirts that could invent relief.

The native source grids are retained. MOLA source producers interpolate bins without
measurements; the label says approximately 55 percent of equatorial bins contain at
least one laser shot and gaps between profiles can reach 12 km. Full raster coverage
does not mean each raster cell is independently measured. LOLA is also a gridded product.
No RGB brightness, false-color legend, or shaded-relief image is converted into height.
Any future missing numeric cell is rejected before geometry admission; smooth geometry
remains the renderer's explicit fallback.

Moon texture and relief share the same body reference coordinates. The current Moon
orientation is still a reference view; no claim of current feature-facing orientation
or landing-site registration is introduced. Mars uses source IAU2000 cartography and
the existing rendering orientation, whose epoch/frame limits remain in force.

## Deterministic derivation

Public-source acquisition was performed once into ignored `build/terrain-source-cache`.
Builds and default tests do not fetch external data. With those four original files:

```powershell
python tools/prepare_terrain_reference.py --source-dir build/terrain-source-cache
```

The optional preparation environment is the existing Pillow 12.2.0 installation.
Pure numeric tests and runtime assets require no Pillow dependency. Exit zero writes
two numeric assets, the terrain manifest, and the generated reference block in
`terrainAssets.js`; invalid source bytes, missing Pillow, dimensions, or values fail
with an actionable exception and nonzero status. Original source bytes stay outside
Git. Preparation does not acquire data or mutate physical state.

Each source height is stored as little-endian unsigned 16-bit integer metres with
offset -32768 m. Code 65535 is reserved for unavailable coverage. Rounding is deterministic
half-up with a maximum additional error of 0.5 m; source precision is not claimed to be
0.5 m. No spatial resampling is performed. Two assets total 4,147,200 bytes. Source and
derived hashes, source metadata identities, radii, bounds, datum, units, pixel scale,
processing and observational periods are in `apps/web/terrain-assets.v1.json`.

## Geometry, bounds, and lighting

`buildTerrainMesh` emits interleaved xyz/normal and indices for the existing sphere
shader. Geometry uses physical radial heights with no exaggeration. Finite-difference
normals evaluate the same numeric radius field at half a native-cell angular step.
The source may carry finer slopes than a coarse mesh silhouette can resolve; it never
adds geography beyond source resolution. Normals are precompensated so the existing
inverse-transpose ellipsoid transformation recovers their physical direction.

LOD dimensions are 48x96, 96x192, and 192x384; the last uses uint32 indices before the
uint16 index limit is crossed. Polar degenerate triangles are omitted. The mesh exposes
source min/max radii, conservative normalized extents, index type, vertex count, and
native resolution. `terrainExtentKm` provides conservative source bounds before load
for display spacing and camera clearance. None of this changes physical orbits.

Host-local Node timings (one pass, not cross-device performance qualification):

| Mesh | Vertices | Combined vertex/index bytes | CPU construction |
| --- | --- | --- | --- |
| 48x96 | 4753 | 168216 | 24 ms |
| 96x192 | 18721 | 668184 | 50 ms |
| 192x384 | 74305 | 3543576 | 167 ms |

Geometry must be cached and high-LOD construction dispatched off the renderer thread;
it is not a per-frame operation. CPU and GPU resources require root integration's
bounded demand/lifecycle controls. Normals give local terrain slope illumination;
the separate ray pass below supplies bounded cast terrain shadows. Ray origins for existing ring/moon
shadows must use displaced `v_obj`, while texture coordinates retain normalized direction.

## Bounded cast terrain shadows

`terrainShadowShaders.js` exports `TERRAIN_SHADOW_GLSL`, included by the surface
fragment program. The root renderer calls `terrainSunVisibility(surfaceKm,
sunDirectionBody)` only for enabled, admitted terrain. Inputs are the physical
body-frame surface point and solar direction, never display-enlarged coordinates.
The returned visibility multiplies direct sunlight, not night emission or atmospheric
in-scattering. A directional Sun gives hard geometric occlusion; finite-Sun terrain
penumbrae are not implemented by this pass.

The original decoded heights are uploaded as **R32F, NEAREST**. The GLSL include uses
an explicitly high-precision sampler and manual bilinear interpolation, matching
cell centers, east-positive longitude wrap, and source polar-row closure. The worker
can call `terrainShadowUniforms(grid)` once to produce:

- `u_terrainHeight`: the numeric height texture.
- `u_terrainShadowEnabled`: 1 only when the height texture and geometry are admitted.
- `u_terrainShape`: `[referenceRadiusKm, minimumRadiusKm, maximumRadiusKm, primeMeridianU]`.
- `u_terrainPoles`: `[northEdgeMeanHeightKm, southEdgeMeanHeightKm]`.

The ray origin is projected outward to the native source-radius field when a coarse
mesh triangle lies below it. It then receives a numerical radial bias equal to
0.1 percent of an equatorial source cell, clamped to 2..50 metres (approximately
7.6m Moon / 14.8m Mars). An obstruction must exceed a further quarter-bias tolerance.
This guards finite precision and mesh/source mismatch; it is not an elevation
uncertainty estimate or a claim to metre-scale shadow accuracy.

Analytic intersection with the minimum-radius globe handles fully occulted rays.
The remaining ray segment is bounded by the maximum source radius. Up to 64 midpoint
samples cover that entire interval, targeting half an equatorial source cell per step;
when the interval is longer, the step increases to stay within 64. The separate hard
distance limit is 4096km, which does not bind the current Moon/Mars probes. The CPU
reference exposes `steps`, `stepKm`, `maxStepVsCell`, and `truncated`. Larger steps can
miss narrow ridges, especially along grazing paths. Polar longitudinal cells are
narrower than equatorial cells; no polar sub-cell shadow precision is claimed.

`terrainShadowVisibility` is a double-precision JavaScript implementation separate
from the GLSL path. Tests compare the GPU result against that reference, a denser CPU
sampling budget, and flat-sphere/known-ridge geometric cases. Missing/invalid source
data is rejected before upload. The pure reference rejects invalid directions, radii,
steps and distance limits. Unsupported or disabled runtime uniforms return unoccluded
visibility while the parent source state continues to report the fallback.

```powershell
node --test tests/web/terrainShadows.test.mjs
node tools/terrain_shadow_validation.mjs
```

The isolated current-host SwiftShader gate passed **32/32 actual GLSL/R32F readbacks**:
flat daylight/tangent/night, known ridge and reversed sunlight, disabled effect,
longitude registration, native Moon/Mars terrain, native poles, and longitude seams.
Both lit and occluded output were exercised. All 32 cases agreed with the denser CPU
probe; this finite fixture set does not bound all unsampled-ray errors. Evidence is
written to ignored `coverage/terrain-shadows/evidence.json`, with source hashes and
step metrics. The tool also accepts `--web-root=<immutable staged build>` and verifies
its selected release hashes before testing. Isolated one-pixel probes establish
shader computation, not application frame rate or complete scene appearance.

## Verification and remaining limits

Red tests were run before implementation and failed because terrain modules did not
exist. Green tests cover source hash/length rejection, streamed byte caps/cancellation,
compressed transfer versus decoded lengths, generated manifest parity, signed numerical
decoding, quantization bounds, numeric-only elevation, centered registration, source
landmarks, seam/pole continuity, missing cells, conservative bounds, outward triangle
winding, physical normal transforms, analytic gradient agreement, uint32 LOD, and
bounded terrain-ray occlusion.

```powershell
node --test tests/web/terrainGeometry.test.mjs tests/web/terrainAssets.test.mjs
python -m unittest discover -s tests/python -p test_terrain_reference.py -v
python -m compileall -q tools/prepare_terrain_reference.py
```

The full-application gate consumes an existing immutable web release. It checks the
release manifest's asset hashes and byte lengths before launching the real app, records
any differences from current source files, and requires actual terrain Worker creation
and successful height-asset requests. It saves full-page/canvas screenshots, terrain and
optics A/B pixel comparisons, scientific-time/position invariants, mobile overflow checks,
and explicit source/network/shader diagnostics in the chosen ignored evidence directory.

```powershell
node tools/physical_rendering_validation.mjs --web-root=build/physical-preview-04 --out=coverage/physical-preview-04 --context-loss
```

`--context-loss` additionally tests WebGL restoration and terrain Worker recreation.
Graphics restoration reuses the retained physical snapshot; it does not initiate a
redundant orbital metadata request or extend the engine's wall-clock deadline.
External DNS is blocked so that this gate cannot silently substitute unpinned imagery.
The browser is headless Chrome with software WebGL2; its results qualify integration
and failure handling on this host, not native GPU performance or all device classes.

The browser view is a coarse global terrain renderer, not a local high-resolution DEM
viewer. Craters smaller than the source/mesh support remain unresolved. Native texture
color is still qualified separately from terrain and must not become calibrated albedo
by implication. Other solid bodies require source qualification before terrain admission;
gas giants do not receive manufactured solid surfaces. No finite-Sun terrain penumbrae,
camera walkthrough, regional DEM tiling, or scientific elevation-query tool is claimed.
