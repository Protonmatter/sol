# SOL system appearance refinement

Date: 2026-09-13. Bounded implementation of the user's request to apply the Earth
quality review to the Sun, all eight planets, Earth's Moon and the 21 catalogued
satellites. Extends [RFC 0004](../../rfcs/0004-registered-planetary-appearance.md)
under `SOL-VIS-004`, `SOL-VIS-003`, `SOL-VIS-002` and `SOL-SCI-001`.

## Required behavior

1. Source identity, projection, coverage and interpretation remain independent
   admission requirements. A perspective photograph cannot become a global texture.
   Unqualified legacy maps remain held even when a newer qualified map is added.
2. Every selected catalogue moon receives a useful inspector, reference radius,
   parent and orbital period, and a working focus action. Facts do not follow the
   imagery date. Unknown objects must not receive invented facts.
3. Registered moon mosaics retain source axes and missing coverage. The 21-moon
   orbital catalogue has no qualified surface-spin model: these maps use an
   explicitly disclosed fixed reference orientation. Spheres are shape
   approximations, especially for Phobos, Deimos and other irregular satellites.
4. Moon imagery must retain the existing eclipse and published-albedo display
   gains. Texture readiness, failure, toggles and context restoration must not
   change the physical positions, clock or shadow geometry.
5. Ring geometry and its shadow profile must share radial intervals and gaps.
   Thin rings cannot disappear from the shadow merely because point sampling
   missed them. Display opacity and unresolved widths remain labelled approximations.
6. NASA solar observations stay in their original camera plane. Do not overlay a
   model-radius outline, imposed vignette or assumed limb crop. The separate 3-D
   Sun uses an illustrative white emissive material, never a wrapped camera frame
   or invented spots. Loading, failure and explicit retry remain visible.
7. Camera focus and zoom may improve readability without changing body radii,
   centers, orbital elements, physical lighting or scene time. Initial system
   context and explicit wide-view controls remain available.

## Registered moon display material

Texture mode 4 uses the same `referenceUV`, latitude convention, affine window and
coverage calculation as the planetary maps. Alpha masks are premultiplied on
upload. The sampled covered RGB and the coarsest mip RGB are divided by their
respective coverage before calculating a relative intensity. Thus missing black
pixels cannot lower the map mean or introduce dark seams along valid edges.

The monochrome display contrast is `min((intensity / mean)^0.6, 1.8)`, with a
bounded mean floor and input ratio as in the existing moon display model. It
modulates the existing albedo/eclipsed `u_base`; missing coverage uses unmodulated
`u_base`. This is a display convention for independently stretched archive mosaics,
not calibrated local reflectance, measured color, current terrain illumination,
photometric inversion or a claim about the current facing hemisphere. No
procedural craters or guessed missing surface detail are enabled.

Io's separately qualified Galileo SSI false-color map uses mode 5. Its explicit
`moon_color_mode: source-rgb` admission is restricted to Io's surface, with absent
fields retaining mode 4. Source RGB is divided by its covered luminance and multiplied
by the same relative contrast, then divided by `max(1, max(R,G,B))` before the neutral
albedo/eclipse gain. Every covered channel receives the same scalar: there is no
invented yellow tint, independent channel clipping, or inferred natural color. The
source RGB encoding is retained as a display convention; neither linear radiometry
nor exact disc-average albedo is established. Original per-band NoData and provider-
interpolated polar regions beyond approximately +/-85 degrees remain withheld. See
[Io source qualification](IO_COLOR_SOURCES.md). No in-app source selector is added;
the prior monochrome recipe remains reproducible offline.

Earth’s night, cloud and ice flags are cleared for each moon and each other body.
Ring and transit-shadow state are also reset for moon draws. The existing
catalogue does not qualify mutual events on satellite surfaces.

## Longitude seam filtering

The all-body visual review reproduced a thin, bright intermittent seam on Iapetus.
This was a renderer artifact, independent of the original Earth swath gaps:
implicit texture derivatives across `atan`/`fract` longitude wrapping selected a
coarse mip level from unrelated parts of the map. A spatial 8-by-4-pixel GPU patch
with matching source edges reproduces the defect in both registered color and
moon modes; constant-coordinate probes alone did not exercise it.

`referenceSample` now differentiates longitude in its local tangent plane and
uses `textureGrad`. The admitted affine transform applies to both UV and its
gradients. Source imagery, masks, palette values, longitude direction, planet
flattening and coverage bounds remain unchanged. The same sampling path serves
planetary and satellite references and Earth's night, cloud and ice layers.
It does not blend away real provider mosaic transitions or complete missing data.

## Partial planetary maps

Saturn, Uranus and Neptune retain the exact qualified source masks. Missing
coverage now uses a flat representative display color instead of unrelated gray.
The color is the per-channel median of fully opaque pixels in the committed
reference image. It supplies no bands, storms or terrain. Its interpretation
inherits the source display palette; it is not a measured natural color.

| Body | RGB bytes | Registered input SHA-256 |
| --- | --- | --- |
| Saturn | 180, 186, 168 | `c88eb864e3c6a2c4a23f7b8cfa32a510e4dc46431da8b0697b7121f45e307fee` |
| Uranus | 198, 232, 203 | `d59ba81033bba3faf30950c2d8893319a8f3e94f968a648c03b16b5d0fd8c8a5` |
| Neptune | 109, 203, 161 | `c9dee0f329268f801ae5e4c736da72c329539f862a651f536e0c3d4846682adf` |

`appearanceFallbackColor` applies these values only while the registered source
hash matches. An updated map requires an explicit new derivation. The original
source RGB remains unchanged in covered pixels.

Reproduce with the existing Pillow 12.2.0 environment from the repository root:

```python
import json
from pathlib import Path
from PIL import Image, ImageStat

root = Path("apps/web")
registry = json.loads((root / "visual-assets.v1.json").read_text())
for asset in registry["mapped_references"]:
    if asset["body"] in {"Saturn", "Uranus", "Neptune"}:
        with Image.open(root / asset["path"]) as image:
            mask = image.getchannel("A").point(lambda v: 255 if v == 255 else 0)
            print(asset["body"], ImageStat.Stat(image.convert("RGB"), mask).median)
```

Mercury, Venus, Earth, Mars, Jupiter and Earth's Moon keep their existing admitted
maps. Venus is explicitly a radar view; OPAL images keep their own color-processing
and epoch limitations. Earth's complete historical composite, optional daily
swaths, night lights and sea-ice analysis remain unchanged.

## Verification and rollback

Meaningful regressions cover source registration on the actual GPU, no-data
normalization, eclipse gain retention, inspector facts for all 21 catalogue moons,
source-identity-bound flat colors, source-preserving solar camera images, and
ring intervals, shadows and display clearance. Application screenshots must cover
every supported body, including both sides of partial maps and multiple moon
hemispheres. Fixed model state must survive camera and source interactions.

No engine schema, Rust/WASM calculation, ephemeris, catalogue orbital elements,
external dependency, runtime network source or telemetry is introduced. Asset
preparation is explicit offline processing of pinned official originals. Existing
reference toggles provide immediate simplified rendering; revert the refinement
commit to restore the previous renderer and source registry together.

Local test success does not qualify every browser/GPU, current weather, feature
orientation on catalogue moons, calibrated radiance, navigation, mutual events or
production deployment. Source-specific evidence is in the adjacent source records.
