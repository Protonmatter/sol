# Blender production and reference pipeline

## 1. Decision and local feasibility

Use Blender as a scriptable offline scene/reference tool. It can render emissive surfaces, curve-based structures and volumes, produce linear intermediate images, and help review the Sun from controlled viewpoints [B01–B06]. It cannot turn a textured sphere into a physically solved star, infer a missing hemisphere, or export arbitrary Cycles shaders as working WebGL programs.

No Blender executable was found in the bounded local checks recorded in [context-map.md](context-map.md). The host reports ARM64 and Qualcomm Adreno X1-85. The official Blender Windows-on-Arm report describes improved EEVEE operation with the Vulkan backend in Blender 4.5 LTS [B01]. That supports a feasibility trial, not a performance claim for this machine. The documented Cycles GPU backend families do not establish an Adreno Cycles path [B02]; plan a **CPU Cycles reference** initially and test EEVEE/Vulkan separately.

Use a supported official Windows ARM64 release available at implementation time, pin exact version/build hash and optional packages, and validate the required nodes/API. A 4.5-LTS-compatible scene recipe is the initial API target; do not describe that as the newest release or silently switch versions. Provisioning is a separate implementation operation. No software was installed and no Blender render was produced during planning.

## 2. First executable feasibility slice

Once an exact Blender executable is available:

1. Capture version, build hash, OS architecture, selected render engine/device and graphics backend. Discover actual available Cycles devices; never force an unavailable GPU backend.
2. Run headless with factory settings, automatic embedded scripts disabled, and a repository-owned Python script. No downloaded `.blend` file or third-party add-on is required.
3. Render a 512×512 test with a unit emissive sphere, one foreground and one occulted rear strand, a homogeneous emissive volume slab, and a known camera. Use CPU Cycles first, 64 samples as a starting configuration, fixed seed, denoising off.
4. Compare slab output with analytic `I=j*L` and absorbing slab output with the formal solution. Check scene-unit conversion and render linear values before tuning solar appearance.
5. Render four viewpoints and a five-frame descriptor sequence. Confirm nonblank output, sensible occlusion, stable camera, finite images, and bounded completion time. Record timing as observation, not a benchmark guarantee.
6. Evaluate EEVEE/Vulkan on this host. If it fails, retain CPU references or use an explicitly selected other render workstation later; do not call failed local support a scientific limitation.

First result should be a small contact sheet, `.blend` plus recipe, linear diagnostic images, and a machine-readable receipt. Large production renders wait until this slice passes.

## 3. Scene specification

Scene units: one Blender unit equals one nominal solar radius. Record conversion in scene metadata and manifests. Use the same +Z-north, west-positive Carrington frame as the model. Camera position, orientation, projection, focal length/FOV, principal point, clipping planes and output dimensions are imported from a named browser validation camera.

Collections, with stable object names:

```text
SOL_REFERENCE
  Photosphere
  SpotMasks
  ChromosphereIllustration
  CoronalStrands
  DiffuseCorona
  CoolPlasma
  MagneticOverlay
  CutawayInterior
  ReferenceCameras
  CalibrationObjects
```

Only appropriate collections participate in each preset. The ordinary exterior photosphere is opaque. Cutaway uses explicit clipping/section geometry and an educational label; it is not achieved by making the full star transparent.

### Photosphere material

- Use Emission or an equivalent unlit emissive surface path driven by imported relative continuum data/analytic descriptors.
- Match the Planck-contrast and limb law in the science specification; camera-angle variation is intentional, not Lambertian illumination by an external light.
- Load numeric masks/temperature descriptors as non-color data. Do not allow sRGB decoding of scalar fields.
- Apply spot/facular masks from the same stable model IDs as the browser. Do not hand-paint active-region features that are then represented as observed.
- Generate geometry-level granulation only for the close-up reference if it is an admitted model choice; displacement must be small relative to physical scale and cannot change the main full-disk radius arbitrarily.
- No glossy BSDF, metalness, planet terminator, or bump-map lighting from a fake key light.

### Coronal material and geometry

- Import traced field curves with per-point radius and per-strand emissivity/temperature-proxy attributes. Geometry Nodes can instance/build the selected tube or volume representation from those numeric inputs.
- A curve mesh with an emissive material is useful for geometry inspection, but its solid surface is not a volumetric reference. Quantitative comparison must use the same continuous emissivity support and transfer law as the browser.
- For final reference volumes, use emission/absorption coefficient shaders where the pinned Blender version supports them [B03]. Principled Volume can also represent emission, but disable unrelated smoke/fire scattering and blackbody assumptions for the EUV model [B04].
- Convert coefficients explicitly: if scene lengths are in solar radii, absorption coefficients are per Blender unit = per solar radius; physical per-meter coefficients must be multiplied by R. Emissivity normalization must be converted consistently, checked with the slab test.
- A million-kelvin EUV corona must not be rendered as million-kelvin visible blackbody fire. Evaluate the channel emissivity outside the material or supply its relative scalar field, then apply the declared false-color visualization.
- Keep a separate optional white-light scattering experiment. Its sunlight scattering kernel/normalization differs from EUV thermal line emission and requires its own parity evidence.

### OpenVDB option

Blender can load OpenVDB volume files and sequences [B05]. Use this when importing a qualified simulation or a precomputed reduced-model volume. OpenVDB is **optional**: producing it may require an offline authoring package not currently present. Do not make its installation a hidden runtime requirement. The small initial analytic sphere/slab/strand tests can proceed without it.

The authoritative data remains the hashed numeric field plus units, coordinates, extent and time. A VDB is a derived authoring representation. Record voxel size and resampling. Do not use Blender's combustion simulation as a surrogate for magnetic solar plasma.

## 4. Reference outputs and visual comparison

Produce three output families for every named reference case:

1. **Linear diagnostic:** OpenEXR with documented scene-linear working space, bloom/glare disabled, denoising disabled, exposure identity. Include emission-only, transmittance, surface mask, geometry IDs/depth when supported. EXR extension alone does not guarantee linear values; validate metadata and known patches [B06].
2. **Matched display:** apply the browser's existing exposure/tone map/sRGB recipe to the linear result outside the scientific integration. Use this image for browser-versus-Blender composition comparisons.
3. **Art-direction preview:** optional AgX view transform and restrained glare for reviewing appearance [B07]. Clearly name it a preview; do not compare its pixel values directly against the browser's different tone map or call its colors calibrated.

Cycles path-tracing variance is expected. Fix seed, version, device, sample count and settings for controlled repeats; compare converged means/tolerances, not byte-identical stochastic images across all devices. Denoised beauty frames can hide thin strands or invent temporal continuity; they are not the numerical reference.

Required views: source-equivalent front, east/west limbs, back, both poles, near-limb close-up, foreground/rear strand pair, cool filament on disk and prominence off limb, quiet/active scenarios, and cutaway. Match scene time and channel before assessing similarity. Blender matching the browser establishes implementation consistency, not that the shared model matches the Sun; independent observations remain necessary.

## 5. Export contract

Export data that the existing runtime can consume without adopting a new scene framework:

- Float32 little-endian curve point/radius/attribute arrays with manifest counts, stride, bounds and hashes.
- Bounded scalar volume grids with explicit axes, spacing, channel encoding, valid range and physical/relative units.
- Grayscale masks/LUTs plus source provenance, not beauty-pass color images reused as calibrated inputs.
- Optional simple mesh/glTF assets for cutaway labels or geometric helpers only after checking the actual supported material subset.
- Preview images/video as review evidence, not the primary orbitable Sun.

glTF's material model differs from Blender's [B08]. It does not carry the complete Cycles/Geometry Nodes/OpenVDB program as a browser-executable model. A baked glow or baked single-camera corona loses viewpoint-dependent occlusion and should not be applied as a universal full-sphere texture. Keep browser shading and transfer explicit.

## 6. Planned files and commands

New text sources:

```text
tools/blender/build_solar_scene.py
tools/blender/render_solar_reference.py
tools/blender/export_solar_fields.py
tools/blender/validate_solar_export.py
tools/blender/README.md
assets/solar/recipes/quiet-sun.v1.json
assets/solar/recipes/active-sun.v1.json
assets/solar/recipes/limb-transfer.v1.json
```

Scripts accept arguments after `--`, validate input hashes, bound dimensions/frame count, use explicit output directories and fail on conflicting output. No networking or automatic add-on execution. Store generated `.blend`, VDB, EXR and movies under ignored `build/solar-authoring/<recipe-hash>/`; source-control the recipes/scripts and selected small qualified fixtures, not gigabytes of caches. Publication/storage of large assets requires its own reviewed artifact decision.

**Proposed commands; not runnable until these scripts and Blender exist:**

```powershell
$blenderExe = 'PATH_TO_PINNED_BLENDER/blender.exe'
& $blenderExe --version
& $blenderExe --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/blender/build_solar_scene.py -- --recipe assets/solar/recipes/quiet-sun.v1.json --bundle build/solar-pack/manifest.json --out build/solar-authoring/quiet-v1
& $blenderExe --background --factory-startup --disable-autoexec --python-exit-code 1 --python tools/blender/render_solar_reference.py -- --scene build/solar-authoring/quiet-v1/sun.blend --camera limb --time-seconds 600 --device CPU --out build/solar-authoring/quiet-v1/reference-limb
python tools/blender/validate_solar_export.py --root build/solar-authoring/quiet-v1
```

Check exact CLI/API support in the pinned version [B09]. `--disable-autoexec` prevents embedded/startup script execution; the repository script is still explicitly invoked. Do not load an external `.blend` supplied by a data provider as executable authority.

## 7. Go/no-go conditions

Proceed to production asset work only when analytic transfer, coordinates, emission/absorption scaling, linear output, sphere occultation and export round-trip checks pass. If Blender's volume path cannot achieve the required reference accuracy at bounded cost, use the CPU numerical integrator as the transfer oracle and Blender only for visual review. A beautiful Blender image does not override failed numerical or observational acceptance.
