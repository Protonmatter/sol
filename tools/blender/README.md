> Current visual-acceptance status: R4 component and combined reference rendering are complete, but appearance remains NOT accepted. Broad rounded dark regions and isolated bright arcs still fall short of the requested morphology. See [the current handoff](../../docs/DYNAMIC_SUN_HANDOFF.md) for validation and remaining work. Older R2/R3 descriptions below are retained as historical workflow documentation.

# Blender solar authoring and numerical references

Requires the already provisioned official Blender 4.5.14 LTS ARM64 (`62c1db4208e8`). No add-ons, downloads, UI automation, or additional Python packages are required inside Blender. CPU Cycles is the supported reference device. Generated files belong under ignored `build/solar-authoring/`.

Every Blender command uses `--background --factory-startup --disable-autoexec --python-exit-code 1`. Pass **absolute paths** after `--`; Blender can change its working directory during file operations. Output directories must not already exist. The scripts reject conflicting output rather than silently overwrite prior evidence.

```powershell
$blenderExe = Join-Path $env:LOCALAPPDATA 'Programs/Blender Foundation/blender-4.5.14-windows-arm64/blender.exe'
& $blenderExe --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/blender/qualify_transfer.py -- --out ABSOLUTE_OUTPUT_DIRECTORY
& $blenderExe --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/blender/qualify_atlas.py -- --out ABSOLUTE_OUTPUT_DIRECTORY
& $blenderExe --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/blender/build_solar_scene.py -- --recipe ABSOLUTE_RECIPE --bundle ABSOLUTE_PACKET_JSON --volume ABSOLUTE_LOW_EMISSION_F32 --volume-size 64 --out ABSOLUTE_SCENE_DIRECTORY
& $blenderExe --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/blender/render_solar_reference.py -- --scene ABSOLUTE_SCENE_DIRECTORY/sun.blend --camera all --time-seconds 0 --device CPU --out ABSOLUTE_RENDER_DIRECTORY
python tools/blender/export_solar_fields.py --packet PACKET_JSON --out NEW_EXPORT_DIRECTORY
python tools/blender/validate_solar_export.py --root OUTPUT_DIRECTORY
python -m unittest discover -s tests/python -p test_solar_blender.py
```

`--manifest ABSOLUTE_WEB_MANIFEST` admits packet roles from the top-level packet and deduplicated keyframes, verifies time/recipe identity, hashes and lengths, and rejects unsupported frame/radius/grid/surface semantics before scene creation. Dimensions come from the manifest. Nonzero-time volume use requires the declared time-averaged t0-background policy and applies the same inverse differential rotation as the browser. Surface keyframes must match packet time exactly. Optional `--surface ABSOLUTE_SURFACE_F32` switches to the generator's full-sphere EUV-style relative proxy (512x256, west-positive longitude, south-first latitude, texel centers). This is not a visible-continuum temperature map and is labeled separately in the scene receipt. Without `--surface`, the photosphere remains Planck-relative continuum.

`--bundle` currently takes the native generator's **packet.json**, schema `solar-render-packet.v1`; it does not parse a web manifest. The recipe ID and seed must match. Packet and recipe SHA-256 values are recorded in the saved scene and receipt. The optional volume is x-fastest float32 little endian, cubic 2..128, with voxel centers `-2.5+(i+0.5)*5/N`. Its hash is saved in scene metadata. A packed non-color floating-point atlas implements trilinear interpolation without OpenVDB. If omitted, closed emission-only curve volumes provide an explicitly labeled uniform-cross-section geometry preview; they do not establish Gaussian voxel parity.

The sphere is an opaque emissive boundary. Continuum intensity uses the declared 550 nm Planck temperature ratio and `1-u+u*mu`, with geodesic-region anchors from the packet. No key light, glossy shader, fake terminator, or arbitrary enlarged granulation is applied. Granules are unresolved at full-disk 512-pixel scale and are not synthesized by this authoring tool. The initial close-up camera does not imply that resolved granulation is implemented.

Named orthographic cameras are front (+X), limb (+Y), back (-X), north (+Z), south (-Z), and closeup. The default `all` renders the first four, each at scale 3.4 solar radii. The receipt stores camera position and orthographic scale. A supplied time must equal the immutable packet time; seeking requires regenerating the descriptor/volume. The renderer never pretends a frozen scene is an evolving sequence.

Each render writes a 32-bit scene-linear Rec.709 EXR and an 8-bit Standard/sRGB PNG at exposure 0, with deterministic seed 1729, 64 samples, CPU Cycles, and denoising off. PNG is a display preview, **not browser-tone-map parity**. A fixed seed controls stochastic sampling but does not promise byte-identical rendering across devices. Receipts contain artifact size/hash, render settings, elapsed time, finite/nonblank image statistics and source hashes.

The transfer fixture tests a j=0.4, alpha=0.7, unit-length slab against the exact solution; an opaque sphere hides a rear strand while a foreground strand adds jL. The atlas fixture tests a spatially varying scalar field at center and off-axis. Blender's Volume Absorption color must be black for neutral extinction; white has zero extinction. These tests establish coefficient scaling and basic occlusion, not solar physical calibration.

The export command writes numeric point/radius/emissivity tuples at 20-byte stride, float32 little endian, plus stable strand IDs and counts. It does not export Cycles shader graphs as browser executable materials. The export validator checks confined paths, lengths, and SHA-256 values. Ordinary failures exit nonzero; there is no network I/O or production-state change. Rollback is removal of a specifically identified generated output directory; preserve evidence needed for comparison.

Remaining qualification: browser camera/tone-map pixel parity; observational validation; L16/32/64 field convergence; full view/preset suite including cool-filament/cutaway; shared-volume temporal sequence; a close-up granulation appearance shader; Adreno/EEVEE capability and performance. A successful image does not qualify these missing items.

`--view-mode corona-diagnostic` on the renderer replaces the photosphere emission with an opaque black occulter and applies +4 stops only to the PNG display transform. Its EXR remains linear. This is a separately labeled analysis view, not an instrument image.


## Current R4 reference

Use the final R4 active/quiet manifests, their admitted 2048x1024
`hierarchical-euv-linear-v1` surface references, a diffuse-only background and
`--gaussian-strands`. R4 replaces the historical 512x256 base map and cellular
emission recipe described below. Placement masks do not emit; compact structure
is tied to validated loop attachments. Raw transfer remains R=corona, G=surface,
B=disk mask, with one palette evaluation and fixed Reinhard/Standard presentation.

Segments sharing the same endpoints now use one support summing their original
Gaussian terms. This corrects the reproduced Cycles concentric-endcap loss without
moving geometry or compensating brightness. `qualify_concentric_caps.py` exercises
axial/transverse views and reversed pulse orientation. Exact duplicate equal-width
supports still reject explicitly. Four-view, temporal/quiet and editable beauty
artifacts are local outputs under `build/solar-authoring/r4-final-*`; they are not
committed binary deliverables. The handoff records their identities and limits.

## Historical v2 references

The v2 qualified scenes consume `build/solar-dynamic-qualified/solar-dynamic/{active-v1,quiet-v1}/manifest.json`, with L32 packets. Optional `surface_keyframes` are exact Rust CPU bakes of the same generalized cellular model as browser GLSL, not observed images. The 2048x1024 bake contains base EUV emissivity times `exp(.65*(cell-.2))`, cell size10000km, lifetime1200s, with differential unadvection already applied. Do not advect that surface again. The full-disk reference is in the fully resolved visibility=1 regime.

When a relative EUV surface is supplied, the `.blend` deliberately stores **diagnostic material channels**: surface emission in R, volumetric emissivity in G, B=0. Running the reference renderer saves `NAME-transfer.exr`, then evaluates the browser's nonlinear palette separately on surface*3.2 and integrated-corona*40, adds those colors, and writes the resulting linear `NAME.exr`. The PNG applies Reinhard `c/(1+c)` followed by Standard/sRGB at exposure0. This preserves the distinction between volume integration and nonlinear display coloring. Rendering the `.blend` directly without this script shows diagnostic red/green, not the composed final preview.

The palette first interpolates (1,.24,.012) to (1,.72,.20) using smoothstep(.08,1.3,I), then toward (1,.94,.67) using smoothstep(2,8,I), and multiplies by max(I,0). `verify_palette.py` checks the saved linear output against raw diagnostic EXRs independently.

Pulse RGBA grids contain arc length, onset, duration, and support. They are sampled with the same trilinear interpolation and inverse rotation as the background. Inside 0<age<duration, the coefficient is `support*.3*sin(pi*age/duration)^2*exp(-.5*((arc-.0002*age)/.04)^2)`; otherwise zero. `--disable-pulse` on the reference renderer provides an explicitly labeled same-scene control, preserving surface/background. `verify_temporal_pulse.py` compares the real rendered transfer channels and writes a linear pulse-only difference plus separately normalized preview.

After opening any editable scene, the renderer validates dimension/sample bounds, forces CPU Cycles/64samples/seed1729/no denoising/no compositor/no sequencer, restores Standard/None/gamma1, and records actual settings. It rejects oversized scenes and validates all RGB channels. `qualify_pulse_settings.py` tests actual pulse transfer and an edited EEVEE/AgX scene's settings normalization. The test suite includes deliberate red-to-green regressions for review B1/B2/B3.

Current visual limitation: the deterministic cubic cellular model can expose lattice/ring-like structure at full-disk sampling. These previews faithfully show the admitted model; they are not claimed to be photorealistic or observationally calibrated. Changing this requires a versioned shared recipe/filter change rather than Blender-only invented texture.


## Historical R2 Gaussian strand reference

The R2 reference used the manifest under `build/solar-dynamic-r2/solar-dynamic/SCENARIO/manifest.json`. Supply its `standard-background.f32` and add `--gaussian-strands`. The importer requires an admitted companion with `contains_strands:false`; a total-emission volume cannot be combined with analytic strands. The earlier total-grid mode remains available by omitting the flag.

Each segment is a closed unit cylinder with local z in [-.5,.5], radial extent1, no surface shader, transformed to midpoint/orientation with world scale `(4*sigma,4*sigma,L)`. Sigma is the mean endpoint radius. The coefficient is `emission_relative * exp(-max(0,|original midpoint|-1)/.3) * exp(-r_perp^2/(2*sigma^2))`. The radial truncation uses a48-sided support mesh at4sigma; the Gaussian is continuous inside it. Adjacent noncoincident supports add, including bend overlaps. Exact duplicate supports are rejected: Cycles did not add their exactly coincident boundaries correctly in the qualification fixture.

The local pulse multiplies the baseline coefficient by `1 + amplitude*sin(pi*age/duration)^2*exp(-.5*((originalArcStart+localFraction*originalLength-speed*age)/.04)^2)` inside the finite lifetime. Reference geometry comes from the admitted t0 packet. Each endpoint is transported independently by Carrington-relative differential rotation, while pulse arc coordinates preserve original arc length under differential stretch. The displayed cameras remain fixed in Carrington coordinates. They are explicitly corotating references; an inertial-camera comparison also needs the global Carrington frame rotation.

R2 changes raw transfer channels to **R=integrated corona, G=surface relative emissivity, B=opaque-disk mask**. Its display recipe is now **one palette evaluation**: `palette(3.2*G + 40*R)`, then Reinhard and sRGB. Earlier receipts identify the older channel/palette recipe and are not silently reinterpreted.

The new exact Rust bakes include the shared quintic domain warp before cellular lookup. They reduce regular lattice symmetry; fine statistical banding can remain visible. No observed texture has been invented or inferred.

The final source-frozen sets are `r2-final-active`, `r2-final-active-t900`, and `r2-final-quiet`. Builders snapshot Python source bytes before scene construction into `authoring-source/`; renderers snapshot before rendering into `render-source/`, with hashes in their receipts. Saved scenes use Blender compression. `qualify_gaussian.py` checks actual single-cylinder transfer, its pulse coefficient, noncoincident overlap and exact-duplicate rejection.
