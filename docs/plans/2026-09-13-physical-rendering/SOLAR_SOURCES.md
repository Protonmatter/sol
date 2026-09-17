# Solar EUV reference and modeled arcade rendering

Status: implementation workstream; see the parent execution record for integration
and qualification status. Scientific quantities in the state-estimation engine,
body positions, rotation and model epoch are not changed by this appearance layer.

## Scope and scientific limits

This mode is **AIA 171 reference + modeled corona**, a source-grounded educational
reconstruction. It is not visible-light photography, a full-Sun observation,
calibrated EUV radiance, measured loop geometry, PFSS, or an MHD solution. The
visible-light Sun remains a separate mode. The original Observe camera image is
not changed or replaced by this derived rendering.

The admitted source is two NASA SDO/AIA Level 1.5-derived JPEG2000 display images
from the ESA/NASA Helioviewer service. NASA explicitly identifies Helioviewer as
an SDO access route: https://sdo.gsfc.nasa.gov/data/dataaccess.php . The source
display intensities are already compressed/stretched by the provider and cannot
be inverted into physical radiance, electron density, temperature or magnetic
field strength. SOL uses a documented gold false-color ramp for this named EUV
mode. It does not relabel the ramp as the provider's exact color table or as
visible-light color.

Source identity and WCS are kept separately from reconstruction assumptions.
The original JP2 files and original XML metadata are retained under the ignored
`build/solar-sources-20260913/`; deterministic preparation verifies their hashes
before image decoding. The product manifest retains source URLs, exact epochs,
source and derived hashes, FITS geometry and quality word. No runtime acquisition
or dependency installation is added.

## Pinned source identity

| Field | Frame 0 | Frame 1 |
|---|---|---|
| Instrument/channel | SDO/AIA 171 angstrom | SDO/AIA 171 angstrom |
| Helioviewer image ID | 156611963 | 156612438 |
| DATE-OBS | 2024-05-10T12:00:09.349Z | 2024-05-10T12:19:57.350Z |
| Original dimensions | 4096 x 4096 | 4096 x 4096 |
| CRPIX1, CRPIX2 | 2048.5, 2048.5 | 2048.5, 2048.5 |
| Carrington observer longitude | 306.98407 degrees | 306.80270 degrees |
| Observer heliographic latitude | -3.1403694 degrees | -3.1397429 degrees |
| R_SUN | 1583.6266 source pixels | 1583.6483 source pixels |
| MISSVALS | 0 | 0 |
| Provider QUALITY word | 1073741824 | 1073741824 |

The provider quality word is retained, not silently cleared or interpreted as a
scientific-quality certification. This narrowly admitted educational display
recipe additionally requires the pinned byte identities, 171 angstrom channel,
level 1.5 metadata, no missing pixels, zero pointing rotation/reference offsets,
and the exact supported tangent-plane coordinate types and units.

Acquisition URLs:

- https://api.helioviewer.org/v2/getJP2Image/?date=2024-05-10T12:00:09Z&sourceId=10
- https://api.helioviewer.org/v2/getJP2Header/?id=156611963
- https://api.helioviewer.org/v2/getJP2Image/?date=2024-05-10T12:19:57Z&sourceId=10
- https://api.helioviewer.org/v2/getJP2Header/?id=156612438

Pinned original SHA-256 values:

```text
2c49076995696cbafd77b00289d66452266210f59d1f4f07c327200984207903  aia171-20240510-120009.jp2
4fe0c23018743fe661e791fd2f7ded7793821c446c445fb2c07c10c40aa05725  aia171-20240510-120009-header.xml
79bcae5c5b931db234eb5f75dd058af566bb1264e1a0184d154147e9fb261525  aia171-20240510-121957.jp2
64ea4070602ccee349fcfbe817344287c467ff6d59b9dbf320b0d9f1e3bd9663  aia171-20240510-121957-header.xml
```

## Registration and coverage

The source projection uses FITS HPLN-TAN/HPLT-TAN, CRPIX, CDELT,
DSUN_OBS/RSUN_REF, CRLN_OBS and CRLT_OBS. Browser texture coordinates are
top-down; the source north axis therefore has a negative image-v increment.
The source basis is fixed in Carrington body coordinates. Camera movement and
System time do not redefine its observation epoch or move the reference map to
follow the camera.

The mapping intersects the finite-distance observer ray with a unit photosphere.
This is a declared reference-sphere projection of on-disk EUV emission, not an
assertion that optically thin coronal structures lie on the photosphere. No
off-limb pixel is wrapped over the sphere. Near-limb projected detail is withheld
where the source-direction cosine is below the declared threshold, and fades
over a bounded transition. The unseen hemisphere has no observational detail.
The original full-frame camera images remain the correct way to inspect actual
off-limb observed emission.

Two exact source frames are interpolated only inside their interval. Source
playback is explicit, bounded and separate from the System model epoch. A source
interpolation time is not a new observation. Reduced motion holds the modeled
flow phase; deliberate source-time scrubbing still selects the reference frames.

## Elevated geometry

No usable measured three-dimensional loop-coordinate bundle was acquired for
this interval. NASA SVS's example explains the magnetogram/PFSS pathway but its
page explicitly does not distribute the underlying dataset:
https://svs.gsfc.nasa.gov/3287/ . SOL must not infer such a solution from its
reduced scalar activity estimate or from grayscale EUV intensity.

The bounded implementation therefore uses explicitly modeled thin arcade arches
as an educational geometry layer. Their candidate anchor locations come from
deterministically selected bright patches in frame 0. This does not establish
active-region identity, magnetic polarity or connectivity. Arc radius, plane,
cross-section, display gain and apparent flow are declared model parameters.
They are not fitted measurements. No random sunspots, fabricated granulation,
observed far-side detail or claimed magnetic-field reconstruction are introduced.

Each arcade is a semicircle in the local normal/tangent plane, with its circle
center at `normal * sqrt(1 - radius^2)`. Its two footpoints lie on the reference
sphere and its apex lies above it. A Gaussian cross-section defines a finite
optically thin emission field. The renderer integrates this field only over the
visible ray interval, ending at the first photosphere intersection; far-side
arches therefore cannot shine through the disk. A fixed 1.35 solar-radius bound
limits the draw volume and must be included in display-clearance budgets.

Each ray is additionally intersected with each arcade's finite bounding sphere
before its 32 midpoint samples are taken. This avoids undersampling thin arches
with a broad whole-Sun sample grid. Empty bounds cost no emission integration;
the hard maximum is 32 samples times 12 arches. Bounding-mesh back faces must be
culled outside the volume to avoid drawing the same transparent emission twice.
Inside the bounding sphere, draw its back faces instead, or constrain the camera
to the declared envelope. The opaque photosphere always ends the visible ray.

Production uses separate opaque photosphere and transparent emission passes.
Only the photosphere writes depth. The optically thin modeled volume adds emitted
RGB without inventing extinction, after opaque bodies and before any nearer
transparent rings or atmospheric shells. Transparent body passes are sorted from
far to near; the display-clearance contract keeps other body envelopes outside
the 1.35 solar-radius volume. This prevents a bounding-sphere depth value from
hiding a farther planet and permits a nearer ring to attenuate the solar emission.

This geometry establishes perspective, elevation and occlusion behavior. Its
emission is a display quantity, not a calibrated plasma-transfer calculation.
A later PFSS or MHD adapter needs a separate immutable, source-qualified model
bundle and its own numerical and observational tests.

## Attribution and references

Credit: **Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams.**

- https://sdo.gsfc.nasa.gov/data/rules.php — attribution and browse-data limits.
- https://sdo.gsfc.nasa.gov/data/channels.php — channel interpretation.
- https://api.helioviewer.org/docs/v2/ — source images and FITS header API.
- https://api.helioviewer.org/docs/v2/appendix/coordinates.html — image axes/scales.
- https://svs.gsfc.nasa.gov/3287/ — distinction between imagery and PFSS geometry.

## Validation scope

Pure tests cover source identity, missing/unsupported WCS rejection, projection
orientation and source coverage, deterministic reference playback, finite ray
intervals, opaque photosphere occlusion, emission bounds and quadrature
convergence. They establish implementation behavior, not plasma calibration.
GPU image parity, rendering resource lifetime, normal/reduced-motion operation,
camera behavior and engine immutability are integration gates in the parent
execution record.

Reproduction and local workstream validation:

```powershell
python tools/prepare_solar_appearance.py --source-root build/solar-sources-20260913 --out build/solar-reference-replay
python -m unittest discover -s tests/python -p test_solar_appearance.py
node --test tests/web/solarAppearance.test.mjs
node tools/solar_appearance_validation.mjs
```

Use a new `--out` directory for each replay. The preparation process compares the
FITS geometry embedded in each JP2 with its separately hash-pinned XML header,
then derives the atlas and checks its fixed expected SHA-256. The admitted atlas
is 2048 x 1024 grayscale, 839,964 bytes, with SHA-256
`f05f77184be4c1ed7f7630ba0ca49d8899f13a1bcdaabd4bd3c7d3bd65f97f8b`.
Two independent local derivations reproduced that byte identity.

The isolated actual-shader gate currently passes 17 checks, including source
orientation, independent source-frame sampling, interpolation, unavailable
hemisphere, off-limb emission, far-side occlusion, deterministic phase, Float64
quadrature parity, a pinned NASA pixel reference, background transmission,
foreground opaque occlusion, nearer transparent-ring blending and split-pass
source-disk parity. Actual vertex/fragment
program linkage is checked. The 32-sample per-arc integration also agrees with
512-sample Float64 references to absolute integrated-emission error below 1e-5
on the documented synthetic thin-arc viewing sweep. These are numerical and
rendering regressions, not source photometric or plasma calibration.
