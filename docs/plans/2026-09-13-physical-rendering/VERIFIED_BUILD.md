# Physical rendering: verified local candidate

Date: 2026-09-13. Implements the admitted products in [RFC 0005](../../rfcs/0005-physical-rendering.md)
and the [execution plan](IMPLEMENTATION.md). This record describes a verified working-tree
preview, not a deployment or a hosted CI result. The RFC remains Accepted pending merge.

## Exact artifact

- Branch: `codex/sol-observation-workspace`.
- Base revision: `3e5faba409f5ce5f466d837f426bd7d50003a0d5`.
- Staged directory: `build/physical-preview-04`.
- Namespace: `releases/physical-preview-04/`.
- Release manifest SHA-256: `0c96caa10b701a50a0960312adf9220221594c3c27b0cc7e76ed9fdaf60dfc91`.
- All 184 asset byte counts/hashes verified; zero differences between the manifest's
  source hashes and the current application source at qualification start.
- Both WASM engines rebuilt from the unchanged current Rust source with locked Cargo.
  The manifest and its per-file hashes identify this preview; the base revision alone
  does not identify uncommitted application changes.
- Local screenshot gallery: `C:/Users/mkang/Pictures/Screenshots/SOL-Physical-Rendering-20260913-0c96caa1/index.html`.
  Exported PNGs are unmodified and verified against the full-app capture hashes.

## Delivered behavior

1. Moon LOLA and Mars MOLA radial terrain drive physical-scale vertex displacement,
   normals and directional terrain shadows. Cancellable workers, bounded LOD, a two-entry
   cache, native source-grid shadows and conservative camera/display extents preserve
   the existing orbital model and smooth fallback.
2. Close Earth/Mars views use dimensioned molecular/aerosol single scattering, view
   attenuation, incident attenuation and bounded incident-solar refraction. Reflected
   sunlight and night emission remain separate. Physical inverse-square illumination
   is distinct from display exposure. Interpolated radial scale prevents triangle sag
   from becoming false atmospheric altitude.
3. Sun inspection uses registered historical NASA/SDO AIA 171 frames with assigned EUV
   color, modeled elevated coronal arcs and finite source playback independent of System
   time. The unobserved hemisphere remains held. Separate opaque/photosphere and
   transparent/corona passes compose with planets, moons, rings and atmospheres.
4. Five native historical NASA/JPL observations provide Jupiter storms/aurorae, Saturn's
   north hexagon and south decagon, and Neptune aurora context. The source selector keeps
   date, band, hemisphere, coverage, credits and verified-byte identity visible.
5. Source failures retain explicit fallback; context restoration recreates rendering
   resources from retained physical state without initiating a redundant metadata solve.
   Reduced motion, pause, camera restoration and narrow-screen layout remain supported.

## Validation

All commands below ran locally; artifact-consuming commands selected preview04.

| Command / gate | Result |
| --- | --- |
| `python tools/build_wasm.py --locked --out-root build/physical-wasm-final` | Both WASM engines built |
| `cargo test --workspace --locked` | 191 passed, 0 failed, 0 ignored |
| `node tools/check_node_coverage.mjs --output-dir=coverage/physical-node-verified` | 873 tests passed; lines 97.84%, branches 90.91%, functions 94.24% |
| `python -m unittest discover -s tests/python` | 344 passed |
| `python tools/typecheck_web.py` | 95 files passed |
| `node tools/browser_validation.mjs --web-root=build/physical-preview-04 --output-dir=coverage/physical04-browser` | Complete Sun, Sky, System, worker and visual journey passed |
| `node tools/collect_node_coverage.mjs --web-root=build/physical-preview-04 --output-dir=coverage/physical04-node` | Denominator-complete Node execution passed |
| `node tools/merge_web_coverage.mjs --web-root=build/physical-preview-04 --node-input=coverage/physical04-node/coverage-final.json --browser-input=coverage/physical04-browser/coverage-final.json --output-dir=coverage/physical04-combined` | Whole-web line coverage 96.82%; required 90% |
| `node tools/atmosphere_validation.mjs --web-root=build/physical-preview-04 --out=coverage/physical04-atmosphere` | 83/83 |
| `node tools/terrain_shadow_validation.mjs --web-root=build/physical-preview-04 --out=coverage/physical04-terrain` | 32/32 |
| `node tools/solar_appearance_validation.mjs --web-root=build/physical-preview-04 --out=coverage/physical04-solar` | 17/17 |
| `node tools/planet_phenomena_validation.mjs --web-root=build/physical-preview-04 --out=coverage/physical04-phenomena` | 8/8 |
| `node tools/planet_appearance_validation.mjs --web-root=build/physical-preview-04 --out=coverage/physical04-planets` | 93/93 |
| `node tools/ring_appearance_validation.mjs --web-root=build/physical-preview-04 --out=coverage/physical04-rings` | 11/11 |
| `node tools/physical_rendering_validation.mjs --web-root=build/physical-preview-04 --out=coverage/physical-preview-04 --context-loss` | 18 checks, 20 capture pairs; actual worker/source/recovery/mobile and engine invariants passed |

Documentation, SDLC/23 requirements, UX, static web, body constants, visual inventories,
physical products and observation-product validators also passed. Python compilation
and `git diff --check` passed. CI now runs the new staged gates and retains their evidence;
no coverage threshold or module denominator was reduced.

The full physical-app run recorded zero page, console, shader/link, WebGL or failed
external request errors. Context restoration passed the original 10-second deadline;
intentional context-state checks use timer polling rather than a lost rendering clock.
The complete capture set checks byte-identical orbital time and body records.

## Corrected findings and preserved failures

- Cache eviction previously left stale readiness and retained unnecessarily high LOD.
  Regression coverage now verifies state and residency after eviction/zoom changes.
- A combined solar outer-volume depth pass hid background objects. Split passes and
  ordered transparent rendering now pass real framebuffer near/far occlusion cases.
- Earth triangle interpolation created false underground atmospheric paths. The original
  shader failed the deliberately red cell/elevation cases; radial-scale reconstruction
  passes the expanded 83-check suite and the actual Earth capture is free of the bands.
- Paused context restoration started redundant orbital metadata computation. The red
  regression demonstrated two requests instead of one; restoration now retains the
  physical snapshot and recreates only graphics resources, within unchanged deadlines.
- The legacy ring test fixture did not bind the new displaced coordinate. Its correction
  preserves the extracted production shader and adds an actual-radius negative control.
- Preview01 exposed an unused research image request outside Today Research; the view
  now gates that work correctly, with a deliberately red then green regression.
- Preview02 captured an intermediate shader precision mismatch. Preview03 exposed the
  above recovery/banding issues and an old ignored solar WASM binary missing the current
  uncertainty contract. These failed artifacts remain locally retained. Preview04 uses
  freshly built engines and is the qualified artifact; earlier previews are not relabeled.

Independent reviews covered optical transforms/profile resets and asset/build/CI admission.
Concrete integration findings were fixed and the affected checks rerun before this record.

## Limits and remaining work

- Terrain is admitted only for Moon/Mars and has 0.25-degree source cells. This is global
  relief, not local surveying or universal geological detail. Other bodies retain their
  separately qualified source imagery and declared smooth/reference geometry.
- Optics is a bounded Earth/Mars reference model. Observer and scattered-light rays
  remain straight; no multiple scattering, measured weather retrieval, cloud coupling,
  ocean specular mask/glint, refracted eclipse boundary or full path tracer is enabled.
- The solar elevated geometry is modeled from source constraints, not measured 3-D
  magnetic/plasma geometry. Two historical source frames do not establish live conditions.
- Giant-planet observations are a historical image gallery, not globally registered
  cloud fields, mapped auroral volumes or a storm/current forecast. Dense atmosphere
  products and further body terrain need their own source/physical qualification.
- Numerical gates use headless Chrome/SwiftShader. Native GPU frame rate, other browser
  engines, fresh-device performance and empirical scientific calibration are not qualified.
- No Rust engine, state estimator, physical orbit, package dependency, telemetry or
  runtime external-provider change was made. Publication/hosted CI are separate evidence.

## Rollback

Restore the rendering code, matching manifests/generated metadata and eight source
assets together. Terrain/optics controls retain the smooth/illustrative fallback;
visible Sun mode remains separate from reconstructed EUV. No physical state migration
is necessary. Follow [operations](../../OPERATIONS.md) for staged build/validation.

## Exact changed-file inventory

Builds, original acquisition caches, coverage, screenshots and this report's generator
remain outside the commit. The implementation's source inventory is:

- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)
- [.github/workflows/coverage.yml](../../../.github/workflows/coverage.yml)
- [apps/web/app.js](../../../apps/web/app.js)
- [apps/web/index.html](../../../apps/web/index.html)
- [apps/web/js/atmosphereOptics.js](../../../apps/web/js/atmosphereOptics.js)
- [apps/web/js/atmosphereShaders.js](../../../apps/web/js/atmosphereShaders.js)
- [apps/web/js/destinationCards.js](../../../apps/web/js/destinationCards.js)
- [apps/web/js/destinationOverview.js](../../../apps/web/js/destinationOverview.js)
- [apps/web/js/orrery.js](../../../apps/web/js/orrery.js)
- [apps/web/js/orreryShaders.js](../../../apps/web/js/orreryShaders.js)
- [apps/web/js/physicalRendering.js](../../../apps/web/js/physicalRendering.js)
- [apps/web/js/planetPhenomena.js](../../../apps/web/js/planetPhenomena.js)
- [apps/web/js/planetPhenomenaManifest.js](../../../apps/web/js/planetPhenomenaManifest.js)
- [apps/web/js/solarAppearance.js](../../../apps/web/js/solarAppearance.js)
- [apps/web/js/solarAppearanceManifest.js](../../../apps/web/js/solarAppearanceManifest.js)
- [apps/web/js/solarAssetLoader.js](../../../apps/web/js/solarAssetLoader.js)
- [apps/web/js/solarVolumeShaders.js](../../../apps/web/js/solarVolumeShaders.js)
- [apps/web/js/terrain.worker.js](../../../apps/web/js/terrain.worker.js)
- [apps/web/js/terrainAssets.js](../../../apps/web/js/terrainAssets.js)
- [apps/web/js/terrainGeometry.js](../../../apps/web/js/terrainGeometry.js)
- [apps/web/js/terrainShadowShaders.js](../../../apps/web/js/terrainShadowShaders.js)
- [apps/web/js/terrainWorkerClient.js](../../../apps/web/js/terrainWorkerClient.js)
- [apps/web/js/view.js](../../../apps/web/js/view.js)
- [apps/web/planet-phenomena.css](../../../apps/web/planet-phenomena.css)
- [apps/web/planet-phenomena.v1.json](../../../apps/web/planet-phenomena.v1.json)
- [apps/web/solar-appearance.v1.json](../../../apps/web/solar-appearance.v1.json)
- [apps/web/styles.css](../../../apps/web/styles.css)
- [apps/web/terrain-assets.v1.json](../../../apps/web/terrain-assets.v1.json)
- [apps/web/textures/phenomena/jupiter-aurora.png](../../../apps/web/textures/phenomena/jupiter-aurora.png)
- [apps/web/textures/phenomena/jupiter-storm.jpg](../../../apps/web/textures/phenomena/jupiter-storm.jpg)
- [apps/web/textures/phenomena/neptune-aurora.png](../../../apps/web/textures/phenomena/neptune-aurora.png)
- [apps/web/textures/phenomena/saturn-decagon.jpg](../../../apps/web/textures/phenomena/saturn-decagon.jpg)
- [apps/web/textures/phenomena/saturn-hexagon.jpg](../../../apps/web/textures/phenomena/saturn-hexagon.jpg)
- [apps/web/textures/solar/aia171-20240510-reference-atlas.png](../../../apps/web/textures/solar/aia171-20240510-reference-atlas.png)
- [apps/web/textures/terrain/mars-radial-height.u16.bin](../../../apps/web/textures/terrain/mars-radial-height.u16.bin)
- [apps/web/textures/terrain/moon-radial-height.u16.bin](../../../apps/web/textures/terrain/moon-radial-height.u16.bin)
- [docs/OPERATIONS.md](../../../docs/OPERATIONS.md)
- [docs/REQUIREMENTS.md](../../../docs/REQUIREMENTS.md)
- [docs/RFC_ALIGNMENT.md](../../../docs/RFC_ALIGNMENT.md)
- [docs/SPEC.md](../../../docs/SPEC.md)
- [docs/VALIDATION_PLAN.md](../../../docs/VALIDATION_PLAN.md)
- [docs/plans/2026-09-13-physical-rendering/IMPLEMENTATION.md](../../../docs/plans/2026-09-13-physical-rendering/IMPLEMENTATION.md)
- [docs/plans/2026-09-13-physical-rendering/OPTICS_SOURCES.md](../../../docs/plans/2026-09-13-physical-rendering/OPTICS_SOURCES.md)
- [docs/plans/2026-09-13-physical-rendering/PHENOMENA_SOURCES.md](../../../docs/plans/2026-09-13-physical-rendering/PHENOMENA_SOURCES.md)
- [docs/plans/2026-09-13-physical-rendering/SOLAR_SOURCES.md](../../../docs/plans/2026-09-13-physical-rendering/SOLAR_SOURCES.md)
- [docs/plans/2026-09-13-physical-rendering/TERRAIN_SOURCES.md](../../../docs/plans/2026-09-13-physical-rendering/TERRAIN_SOURCES.md)
- [docs/plans/2026-09-13-physical-rendering/VERIFIED_BUILD.md](../../../docs/plans/2026-09-13-physical-rendering/VERIFIED_BUILD.md)
- [docs/requirements.json](../../../docs/requirements.json)
- [docs/rfcs/0005-physical-rendering.md](../../../docs/rfcs/0005-physical-rendering.md)
- [tests/python/test_atmosphere_reference.py](../../../tests/python/test_atmosphere_reference.py)
- [tests/python/test_physical_assets.py](../../../tests/python/test_physical_assets.py)
- [tests/python/test_planet_phenomena.py](../../../tests/python/test_planet_phenomena.py)
- [tests/python/test_solar_appearance.py](../../../tests/python/test_solar_appearance.py)
- [tests/python/test_terrain_reference.py](../../../tests/python/test_terrain_reference.py)
- [tests/web/atmosphereOptics.test.mjs](../../../tests/web/atmosphereOptics.test.mjs)
- [tests/web/destinationCards.test.mjs](../../../tests/web/destinationCards.test.mjs)
- [tests/web/dynamicVisualSources.test.mjs](../../../tests/web/dynamicVisualSources.test.mjs)
- [tests/web/helpers/orreryHarness.mjs](../../../tests/web/helpers/orreryHarness.mjs)
- [tests/web/orreryContextRecovery.test.mjs](../../../tests/web/orreryContextRecovery.test.mjs)
- [tests/web/orreryCoverage.test.mjs](../../../tests/web/orreryCoverage.test.mjs)
- [tests/web/physicalRendering.test.mjs](../../../tests/web/physicalRendering.test.mjs)
- [tests/web/planetPhenomena.test.mjs](../../../tests/web/planetPhenomena.test.mjs)
- [tests/web/solarAppearance.test.mjs](../../../tests/web/solarAppearance.test.mjs)
- [tests/web/solarAssetLoader.test.mjs](../../../tests/web/solarAssetLoader.test.mjs)
- [tests/web/terrainAssets.test.mjs](../../../tests/web/terrainAssets.test.mjs)
- [tests/web/terrainGeometry.test.mjs](../../../tests/web/terrainGeometry.test.mjs)
- [tests/web/terrainShadows.test.mjs](../../../tests/web/terrainShadows.test.mjs)
- [tests/web/terrainWorkerClient.test.mjs](../../../tests/web/terrainWorkerClient.test.mjs)
- [tools/atmosphere_reference.py](../../../tools/atmosphere_reference.py)
- [tools/atmosphere_validation.mjs](../../../tools/atmosphere_validation.mjs)
- [tools/browser_validation.mjs](../../../tools/browser_validation.mjs)
- [tools/build_web.py](../../../tools/build_web.py)
- [tools/physical_rendering_validation.mjs](../../../tools/physical_rendering_validation.mjs)
- [tools/planet_phenomena_validation.mjs](../../../tools/planet_phenomena_validation.mjs)
- [tools/prepare_planet_phenomena.py](../../../tools/prepare_planet_phenomena.py)
- [tools/prepare_solar_appearance.py](../../../tools/prepare_solar_appearance.py)
- [tools/prepare_terrain_reference.py](../../../tools/prepare_terrain_reference.py)
- [tools/ring_appearance_validation.mjs](../../../tools/ring_appearance_validation.mjs)
- [tools/solar_appearance_validation.mjs](../../../tools/solar_appearance_validation.mjs)
- [tools/terrain_shadow_validation.mjs](../../../tools/terrain_shadow_validation.mjs)
- [tools/validate_physical_assets.py](../../../tools/validate_physical_assets.py)
- [tools/validate_planet_phenomena.py](../../../tools/validate_planet_phenomena.py)
