# Rendering color contracts and migration gates

Status: preserved pre-migration characterization and accepted qualification plan.
Current B2 implementation and its precise mixed-filter/output contract are recorded
in [color migration results](COLOR_MIGRATION_RESULTS.md). The
[production ledger](PRODUCTION_EXECUTION.md) records current admission; the baseline
route matrix below remains historical characterization.

Baseline lineage: `bd7f5b45798a754c409e4b265e15703dad018f84` on
`codex/sol-observation-workspace`. Concurrent atmospheric work may change that working
tree; the lineage is not an exact dirty-tree artifact identity. This slice adds tests
and this contract only. It does not change image bytes, source selection, uniforms,
shader appearance, physical state, geometry, numerical optical tolerances or palettes.

This record makes the existing decode/filter/shade/encode order explicit before a
separately qualified migration. [RFC 0004](../../rfcs/0004-registered-planetary-appearance.md)
requires source color interpretation and coverage to remain distinct from registration;
[RFC 0005](../../rfcs/0005-physical-rendering.md) requires reflected light, emission and
atmospheric transfer to remain distinct. Decoding a display composite does not establish
calibrated reflectance, radiance, natural color or absence of baked illumination.

## Meanings and boundaries

`D` and `E` below mean the piecewise sRGB-like shader decode and encode in
`orreryShaders.js`, with thresholds 0.04045 and 0.0031308. The CPU reference functions
in `surfaceMapping.js` constrain inputs to [0,1]; shader encoding accepts nonnegative
values above one before the drawing-buffer range limits the result. Thus CPU reference
tests do not characterize HDR clipping. Alpha, coverage, opacity, terrain heights,
density columns, incident directions and transmittance are data; do not apply `D`/`E`
to them. BT.601 weights `[0.299,0.587,0.114]` in moon recipes calculate **display luma**,
not linear-light luminance.

The browser canvas requests WebGL2 with `alpha:false` and `premultipliedAlpha:false`.
The renderer does not explicitly set `drawingBufferColorSpace` or
`UNPACK_COLORSPACE_CONVERSION_WEBGL`. A browser image decode and any browser-default
profile conversion precede upload. Current code cannot claim end-to-end source ICC,
monitor, wide-gamut or browser color-management equivalence. Shader `D` is an explicit
renderer assumption about the decoded display bytes, not a source calibration fact.

`makeTexture` uploads DOM image/canvas bytes with `RGBA/RGBA/UNSIGNED_BYTE`, not
`SRGB8_ALPHA8`. Ordinary imagery uses `LINEAR` magnification,
`LINEAR_MIPMAP_LINEAR` minification and `generateMipmap`. Filtering and mip generation
therefore occur on stored display channel values **before** any shader decode. All
mapped references repeat longitude and clamp latitude; registered samples supply
analytic local longitude gradients through `textureGrad` to avoid a false seam footprint.
If a photographic image exceeds the device limit, a 2-D canvas first resamples its
complete extent. That earlier browser resampling is another distinct color/coverage
boundary. Its exact numerical implementation has not been qualified here.

For alpha-masked photographic references, upload sets
`UNPACK_PREMULTIPLY_ALPHA_WEBGL=true` before filtering. `coveredRGB` divides filtered
RGB by filtered alpha, clamps covered channels to [0,1], then the consumer applies
its recipe. This excludes transparent missing RGB from the covered sample and covered
mip mean. Alpha remains coverage. Each upload sets the premultiply flag explicitly;
Earth sea ice is the exception that retains straight RGB/alpha and nearest sampling.
The current manifest declares 24 mapped references, including 13 with `nodata:alpha`;
that declaration alone is not a pixel-level proof of a binary mask.

## Active materials

| Material and route | Input and filtering | Decode / shade / encode contract | Missing or disabled behavior |
| --- | --- | --- | --- |
| Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, and Earth's Moon: `drawBody`, mode 3 | Registered display map; covered RGB after the encoded filtering above | `mix(D(u_base),D(sourceRGB),coverage)`; without reference atmosphere, multiply by `0.001 + 0.999*Lambert*SunVisibility`; ring shadows multiply this linear value; then `E` | Within a loaded partial map, missing coverage uses **decoded** `u_base`. If the entire map is absent/off, the untextured route below is used. Mercury already performs linear arithmetic here; it is not on legacy moon shading. |
| Earth/Mars admitted physical surface program, mode 3 or untextured | The same display-source or fallback recipe; numerical incident and column fields independently admitted | Mode 3 is already decoded. Untextured display RGB is decoded once when optics enable. Direct light sees Lambert, visibility, incident transmission, physical solar-flux scale and separate display exposure; ring attenuation follows. Earth night emission is added afterward. The combined surface term receives view transmission and scattering; then `E` | Pending/failed fields retain the ordinary sphere program and disclosed illustrative atmosphere. Do not infer that mode 3's linear arithmetic establishes full linear image filtering or full-scene linear composition. |
| Earth cloud/surface composite and dated weather swaths: mode-3 auxiliary | Same registered grid; historical composite currently has no alpha no-data, daily swaths have alpha no-data; ordinary encoded filtering | `mix(surfaceLinear,D(coveredRGB(weather)),weather.a)` **before** illumination | A disabled/unready selected source has its flag cleared. Its date is not replaced by another source. This is clouds-and-surface display imagery, not an inferred cloud density layer. |
| Earth annual night lights: mode-3 auxiliary | Display RGB; ordinary encoded filtering; current source `nodata:none` | Explicit `D(referenceSample(u_nightTex,p).rgb)` multiplied by the visual twilight weight, added after reflected light and ring shadows, before view transport and final `E` | Flag cleared unless Earth mode 3, source ready and layer enabled. Emission does not receive incident-Sun attenuation; view attenuation does apply with optics. The existing twilight fade is a display convention, not a lighting switch-on model. |
| Earth sea-ice analysis palette: mode-3 auxiliary | Straight RGBA; `NEAREST` min/mag; no mipmaps; oversize grid rejected instead of resampled | No material decode, illumination or encode. `mix(displayResult,ice.rgb,ice.a)` occurs after surface encoding and illustrative limb addition | Disabled/unready layer has its flag cleared. Transparent no-data does not imply zero concentration. Legend and source date remain paired. Fractional alpha blends display colors; exact legend RGB is guaranteed only for an opaque category sample. |
| Mimas, Iapetus, Enceladus, Tethys, Dione, Rhea, Phobos, Europa, Ganymede and Callisto: `drawMoons`, mode 4 | Registered archive mosaics; encoded filtered covered RGB and covered coarsest-mip mean | Display-luma ratio with mean floor 0.02; ratio clamped [0,6]; contrast `min(ratio^0.6,1.8)`; multiply existing display `u_base`, then legacy `0.05+0.95*Lambert*SunVisibility`. No `D`/`E` in the ordinary route | Missing coverage multiplies `u_base` by one. Source off/unready uses the same albedo/eclipse base without mosaic contrast. No exact disc-average reflectance claim follows from a display-image mean. |
| Io Galileo RGB: `drawMoons`, mode 5 | Same registered/filter/covered-mean process as mode 4 | Form `sampleRGB * contrast / max(hereLuma,0.02)`, divide every channel by the common `max(1,peakChannel)`, then multiply neutral albedo/eclipse `u_base` and legacy shade. No `D`/`E` | Same neutral fallback gain. Common-scalar processing preserves covered source channel ratios before later composition/range limits; no inferred yellow tint or natural-color claim. |
| Untextured primary-body fallback: `drawBody`, `u_useTex=0`, `u_style=-1` | Explicit display `u_base`, no source filtering | Ordinary program multiplies display RGB by legacy shade and adds the illustrative display limb; no `D`/`E`. Enabled Earth/Mars optics instead decode the fallback as described above | Saturn `[180,186,168]/255`, Uranus `[198,232,203]/255`, Neptune `[109,203,161]/255` are hash-bound source medians. Other primary surfaces use admitted neutral `[.55,.55,.55]`. `BODY.color` is not this fallback's input. |
| Untextured catalogue-moon fallback, including Deimos, Ariel, Umbriel, Titania, Oberon, Miranda, Triton, Nereid and Proteus | `missingDetailColor`, normalized by display luma in `moonBaseColor`; geometric-albedo display gain and physical eclipse gain both use power `1/2.2` | Existing display RGB multiplied by legacy shade. No source decode or final encode. This remains an approximate historical display recipe | Registered-map failure uses the same recipe. The fallback is flat, not procedural terrain. Unknown catalogue color defaults to neutral; unknown albedo receives gain one. |
| Titan fallback | Illustrative orange `[.72,.48,.24]` normalized by the same albedo/eclipse recipe; separate illustrative blue rim | Legacy display shading and rim; no physical atmosphere transport or sRGB pass | Both texture-toggle states retain visible opaque haze; no infrared surface map becomes a visible surface. |
| Sun visible approximation / missing atlas: sphere mode 1, `u_style=-1` | Warm-white display `u_base=[1,.98,.94]` | Direct display output `u_base*(.72+.28*limb)`; no reflected sunlight term or `D`/`E` | Source-qualified fallback stays usable without inventing spots or wrapping an unregistered camera frame. |
| Sun registered AIA atlas / modeled elevated EUV emission: `SOLAR_VOLUME_FS` | Atlas `.r` is a display-intensity proxy; `textureLod(...,0)` with linear filtering, tile-center clamp, coverage-weighted temporal mix; no sRGB decode | Assigned nonlinear gold palette for the observed surface; modeled arc emission becomes a display glow. Surface pass clamps display color; elevated pass writes display RGB with zero alpha into additive `ONE,ONE` blending | Held hemisphere has explicit flat dark-gold fallback; missing atlas returns to the warm-white sphere. EUV colors are assigned, not material reflectance or calibrated emission. |
| Ring vertices: `RING_FS` | Interpolated display RGB plus separate opacity from the shared radial model | `ringEncode(ringDecode(rgb)*(0.08+0.92*incidence*sunVisibility))`; alpha unchanged, samples below alpha .02 discarded | Analytic bands are active; image ring-profile route is currently unqualified. Shape/opacity and color are separate; this is a bounded two-sided display scattering model. |
| Physical atmosphere shell: `ATMOSPHERE_FS` | Numerical scattering/transmittance from admitted profile/fields | Encodes scattering RGB, derives scalar opacity from transmittance, composites using `ONE,ONE_MINUS_SRC_ALPHA` | This is not exact spectral/RGB extinction of a previously encoded framebuffer: code explicitly describes scalar-alpha extinction of stars as an approximation. A scene-wide linear target is a separate migration. |
| Illustrative atmosphere shell: sphere mode 2 | Display `u_atmo` and geometric day/rim weights | Direct display RGB; additive blend; no `D`/`E` | Deferred optics retain this disclosed approximation, never a hidden physical calculation. |
| Guide lines, point stars/belts, markers and glow: `LINE_FS`, `PT_FS`, `GLOW_FS` | Vertex/uniform display colors; point/glow falloff changes alpha and sometimes RGB | Direct display output and their declared ordinary/additive blends; no material decode/encode | Keep display semantics isolated from any future material migration. Catalog-derived colors do not by themselves qualify calibrated on-screen luminance. |

The plain mission-observation/gallery `<img>` views also remain browser-managed display
images in their original camera plane. They do not pass through the sphere material,
solar lighting or an extra shader color transform.

## Dormant compatibility paths

The shader still contains mode 0 texture replacement, mode 1 generated-map modulation,
mode 2 legacy moon contrast, and procedural surface styles. The current primary and
catalogue draws set `u_style=-1`; the qualification registry blocks every legacy
`global-sphere`, generated-map and ring-photo route. Existence of a file or a shader
branch does not admit it. These contracts must be reviewed before any future activation:

| Dormant route | Existing behavior that an activation would inherit |
| --- | --- |
| Texture mode 0 replace | Sample encoded RGB and use legacy display shade; enabled optics would decode the sampled recipe before transport. |
| Texture mode 1 modulate | Mix procedural display recipe with `u_base`, multiply by encoded texture RGB times two; legacy shade or optional decode before optics. |
| Texture mode 2 old moon mosaic | Encoded display-luma contrast against the coarsest mip, no coverage exclusion; multiply display `u_base`, legacy shade. |
| Historical Sun procedural/HMI branch | Display procedural recipe and encoded HMI browse luma recolored warm-white; bypassed by the active early neutral-Sun branch. |
| Photographic ring profile | Encoded filtered texture RGB times 1.05, then ring decode/shade/encode; texture alpha is opacity. Current registry does not admit it. |

Numerical textures are also excluded from color migration: incident data use RGBA32F,
density columns RG32F, and terrain heights R32F with nearest storage sampling and
domain-specific interpolation. The ring shadow profile uses R8 opacity and linear
sampling. None is an sRGB material texture.

## Why a global conversion would change the application

An opaque black/white pair filtered equally in existing RGBA storage yields encoded
0.5. Mode 3 then decodes that to **0.21404114048223255**. Decode-before-filter gives
linear **0.5**, which encodes to **0.7353569830524495**. Hardware sRGB storage is
therefore an appearance change even for Mercury, whose later arithmetic is already
linear. Existing alpha-edge preservation does not eliminate this opaque-color bias.

For a 50%-covered white sample over black, the current masked route first recovers
covered white, decodes it, and mixes using coverage 0.5: output 0.7353569830524495.
Decoding premultiplied encoded 0.5 directly and then applying coverage again would
instead produce about 0.3607802138332792. A future linear-filter path must define the
order **decode RGB, premultiply by coverage, filter/mipmap, composite** and prove its
behavior. Simply changing the storage enum while keeping encoded premultiplication
would not establish that order.

`u_base` is shared across distinct meanings. A mode-3 partial-map fallback decodes it;
a completely unavailable map ordinarily shades it as display RGB; catalogue moons
receive an albedo/eclipse gain already converted by power `1/2.2`; Titan carries hue;
the Sun carries emitted display color. Changing `u_base` globally would double-decode
some values and change others that were not previously decoded. For Phobos the current
neutral gain is **0.27344612776452041677**, independently evaluated as
`(0.06/1.04)^(1/2.2)`; that gain is not linear albedo and is not an exact piecewise-sRGB
representation of the published ratio. Exact piecewise conversion is not a drop-in
replacement for the current moon brightness/eclipse convention.

## Migration contract to implement only after qualification

1. Give each admitted source/material an explicit meaning: display RGB, relative
   display contrast, scientific palette, scalar/intensity proxy or numerical field.
   Record byte encoding, browser decode assumptions, mask meaning, filter space,
   shading space, emission/reflection role and output encoding independently. Preserve
   immutable original/derived bytes and existing source meanings.
2. Select a versioned path per material. Keep an unchanged reference path available
   during qualification. Separate source/fallback display RGB from linear material
   values and from moon display gains; never switch the interpretation of shared
   `u_base` silently. New explicit uniforms/types require their own routing tests.
3. Qualify decode-before-filter for ordinary display imagery using synthetic opaque
   gradients, saturated pairs, transparent colored holes, half coverage, seams/poles,
   coarsest mip and browser-resized cases. Choose hardware sRGB storage or explicitly
   prepared linear mip levels only after proving coverage-premultiplication and browser
   upload behavior. Do not reconstruct missing pixels, increase detail or add imagery.
4. Treat moon contrast means/gamut compression, their brightness ordering and the
   power-2.2 eclipse convention as separate migration work. Compare matched material
   inputs and full drawn discs, including Io's saturated source ratios, rather than
   relying on a uniform swatch or a shared transfer-function unit test.
5. Keep night emission explicitly separate through view transmission. Preserve palette
   RGB/alpha and legend values outside material lighting; preserve source epoch and
   coverage. Any proposed scene-wide linear framebuffer must also qualify ring/shell,
   Sun, points, guides and alpha/additive composition, then encode once on presentation.
6. Establish numerical and visual acceptance limits before changing the renderer.
   Use unchanged scientific/numerical tolerances; do not widen them to make a color or
   performance change pass. Revert by restoring the prior material path and source
   selection, without altering physical state or assets. No dependency, asset
   acquisition, merge or deployment is authorized by this characterization.

## Evidence and outstanding gates

The new `tests/web/colorContracts.test.mjs` executes the complete production renderer
with the existing browser/GL I/O harness. It observes all 20 admitted surface requests,
actual image-upload calls, mode selection, neutral/mission/albedo fallback retention,
all ten catalogue moons without mapped sources in both texture-toggle states, alpha
state, filters/mip requests and Earth auxiliary sampler roles. GL format enums
are distinct so an sRGB-storage change cannot hide behind the host's generic constants.
Independent numerical fixtures use existing CPU transfer functions and published-moon
display logic. These are behavioral route/reference tests; they do not execute GLSL,
perform actual image decode, prove GPU interpolation, or measure final monitor color.

Existing tests cover complementary active fallbacks and material lifecycles:
`planetAppearanceRuntime.test.mjs`, `titanAppearance.test.mjs`, `appearance.test.mjs`,
`solarAppearance.test.mjs`, `orreryCoverage.test.mjs`, `rings.test.mjs` and the atmosphere
tests. Existing real-shader tools already include mode 3/4/5, coverage edges, valid
dark material versus black no-data, night lights, nearest scientific palettes,
ring color and atmospheric reference fixtures. Their presence is not evidence of a
fresh pass against this candidate.

Validation for this slice:

```powershell
node --experimental-vm-modules --test tests/web/colorContracts.test.mjs
node --experimental-vm-modules --test tests/web/colorContracts.test.mjs tests/web/planetAppearanceRuntime.test.mjs tests/web/appearance.test.mjs tests/web/titanAppearance.test.mjs tests/web/surfaceMapping.test.mjs
python tools/validate_docs.py
```

Before enabling a color migration, run the existing staged planet, ring, solar and
atmosphere GPU validators serially against one immutable candidate; extend GPU checks
for opaque high-contrast filtering, mip means, fallback/map seam transitions and
linear-target composition where applicable. Record browser/GPU identity, source and
shader hashes, exact output artifact identity, measured results and negative controls.
Capture representative planets/moons at fixed geometry, source, exposure and camera
with physical optics both admitted and unavailable. Qualify hardware/browser diversity
separately from software-WebGL success. Local CPU route tests do not establish source
calibration, complete application visual acceptance, cross-device performance or release
readiness.
