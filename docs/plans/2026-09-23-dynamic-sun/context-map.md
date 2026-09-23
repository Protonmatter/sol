# Context map

Baseline inspected: `88bfb852a9b19a101a59c5053c53bccf60c1aea1`. GitHub HEAD/master were refreshed and still matched at planning start. Original `../repo` contains unrelated work and is not the implementation base. These plan documents reside in the separate review checkout's established `docs/plans/` hierarchy. Existing plans remain unchanged.

## Current ownership and behavior

| Surface | Existing files | Confirmed behavior / integration consequence |
|---|---|---|
| Authoritative solar state | `crates/solar-core/src/{lib,synthetic,flux_transport,differential_rotation,coordinates,grid,constants}.rs` | Dependency-free Rust; immutable serialized v3 state; normalized radial magnetic field; deterministic source-event and transport checkpoints. No calibrated magnetic uncertainty. |
| WASM and workers | `crates/solar-wasm/src/lib.rs`, `apps/web/engine.js`, `apps/web/js/{solarWorker,solarWorkerClient,workerClient,engineLimits}.js` | Raw ABI; existing `simulate`/`result_len`; release/schema/ABI/generation checks; bounded latest-intent worker requests. Keep this ABI compatible. |
| Observed destination | `apps/web/js/{solarObservation,solarProjection,solarContract,render}.js` | Original observation and scientific model remain separate. Existing registration does not authorize compositing them. |
| 3-D source rendering | `apps/web/js/{solarAppearance,solarAppearanceManifest,solarVolumeShaders,solarAssetLoader}.js`, `apps/web/solar-appearance.v1.json` | Two 2024 frames, source-fixed projection, radial-median far-side fill, explicit non-calibrated gold mapping, 24 illustrative/source-anchored arches. |
| Orrery integration | `apps/web/js/{orrery,orreryShaders,orreryDetail,physicalRendering,destinationCards}.js` | Opaque/emission passes, inspection camera, illustrative surface features, demand-driven resource loading, context lifecycle. Avoid a broad rewrite of `orrery.js`. |
| Color | `apps/web/js/{materialColor,hdrPresentation,hdrPresentationShaders}.js` | Existing display-recipe-to-linear conversion and RGBA16F scene path; existing final tone map is x/(1+x) plus sRGB encoding. New physical-relative linear outputs must not undergo legacy display decoding again. |
| Layer explanation | `apps/web/js/sunlayers.js`, `apps/web/index.html`, `apps/web/styles.css` | Existing educational cutaway and UI surfaces. Extend coherently rather than introducing a disconnected demo. |
| Preparation/build | `tools/{prepare_solar_appearance,solar_image_registration,validate_physical_assets,build_web,build_wasm}.py` | Exact source and output hashes; strict existing v1 manifest schema; build enumerates critical modules. A new schema needs explicit build/validator support. |
| Tests | `tests/web/{solarAppearance,sunContextMode,solarObservation,solarRegistration,solarContract}.test.mjs`; Rust/Python suites | Numeric/contract tests currently pass but preserve the smooth far-side fallback. New acceptance needs temporal morphology and full-orbit coverage. |
| Browser evidence | `tools/{solar_appearance_validation,physical_rendering_validation,browser_validation,browser_backend}.mjs` | Actual shaders, staged artifact identity, native/SwiftShader distinction, resource/context recovery. Extend these tools rather than treating screenshots as scientific validation. |
| Release | `docs/{SPEC,OPERATIONS,INSTRUCTIONS,RELEASE_DELIVERY}.md`, requirements/RFC/governance tools | Immutable release/data identities and qualification controls remain applicable. Plan writing does not accept a release. |

Owners below are **workstream roles**, not invented assignees: solar numerical engineer, rendering engineer, data engineer, scientific reviewer, Blender technical artist, device QA reviewer. Assign named owners when implementation starts.

## Specific inconsistencies to resolve

1. The engine uses `14.713 - 2.396 sin²(latitude) - 1.787 sin⁴(latitude)` sidereal degrees/day; appearance uses `14.37 - 2.33 sin²(latitude) - 1.56 sin⁴(latitude)`. Both are tracer-dependent laws, but a shared modeled region cannot have two incompatible poses. The new scene declares the engine law as its authority and includes its coefficients/frame in the packet. Preserve old coefficients only inside the legacy reference recipe.
2. The core radius is 695,700 km while the retained source WCS uses its supplied 696,000 km reference. Preserve both as explicitly different quantities. Do not alter source registration to force equality.
3. The engine's 128×64 maximum admitted grid cannot resolve granulation. Appearance microstructure must be a separately declared statistical field with a zoom-appropriate resolution, never a relabeling of the coarse magnetic grid.
4. Current observational and illustrative clocks are separate. The new modeled scene needs one scenario clock shared by spots, footpoints, corona and events; measured sequences retain their own acquisition clock.
5. Existing `solar-appearance.v1` validation rejects unknown fields. Add a separately versioned manifest instead of silently changing v1 semantics.
6. Existing source policy prohibits inventing missing observational detail. Full-sphere illustrative structure therefore needs a separately named mode, provenance type and RFC amendment; it must not be added as a hidden fill inside observed mode.
7. Current `BODY.Sun.atmosphere.composition` says `H₂ plasma`. Audit this wording when updating layer descriptions: the solar mixture cannot be summarized as molecular hydrogen throughout. Use an accurately scoped hydrogen/helium composition description. This is documentation/catalogue text, not permission to modify physical constants.

## Local Blender and hardware evidence

Checked PATH, HKLM/HKCU standard uninstall entries, `C:/Program Files/Blender Foundation`, `C:/Program Files/Blender`, `%LOCALAPPDATA%/Programs/Blender Foundation`, and `~/scoop/apps/blender`. No installation was located. No callable Blender-specific tool was exposed in this session. Host API reports OS architecture ARM64 and `Qualcomm(R) Adreno(TM) X1-85 GPU`.

Use these facts only for provisioning and test planning. They do not prove EEVEE support, Cycles GPU support, driver compatibility, memory availability or render throughput. Follow [Blender pipeline](blender-pipeline.md) for a real smoke-test sequence.

## Scope protection

Do not change ephemeris positions, sky calculations, planetary materials, scientific snapshot v3 semantics, existing model assimilation, package manager, deployment settings, or old accepted evidence to make this visual work easier. New appearance modules must be additive and disabled until their own bundle and context admission succeeds. Shared changes to HDR or the frame scheduler require existing planetary/sky regressions.
