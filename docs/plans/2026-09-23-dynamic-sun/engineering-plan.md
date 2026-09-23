# Engineering implementation plan

Status: **all slices planned, none implemented in this task**. Baseline: `88bfb852a9b19a101a59c5053c53bccf60c1aea1`. Read [problem-and-scope](problem-and-scope.md), [context-map](context-map.md), [science-and-math](science-and-math.md), [design-review](design-review.md), [devex-review](devex-review.md) and [blender-pipeline](blender-pipeline.md) before implementing. Existing plans and unrelated work remain unchanged.

The smallest useful finished slice is a fully covered, clearly illustrative Sun with correct emissive shading, shared clock/coordinates, and tested local structure evolution. It is not the complete goal. The complete initial scope adds constrained coronal structure, observation playback, Blender references and device qualification through S10.

## S0 — Baseline, fixtures and RFC amendment (2–3 days)

**Owner role:** engineering lead plus scientific reviewer. **Risk:** low for capture; medium for defining changed scientific presentation.

**Files:** new dynamic-Sun RFC in `docs/rfcs/` using the next available number; `docs/requirements.json`, `docs/SPEC.md`, source/appearance policy docs; small new fixtures under `tests/fixtures/solar-dynamic/`. Do not edit earlier plans or mark their incomplete qualification accepted.

**Actions:** re-pin live master/release identities; create a clean implementation worktree; capture current fixed-camera front/side/back/polar views and shader/backend identities. Record original observations and the current source-to-model boundaries. Add SUN-01–18 traceability without breaking the requirements schema. Define quiet/active/limb/gap/corrupt/reduced-motion cases before visual tuning. Record the new illustrative default and preserved Observe/Research/legacy modes as a proposed RFC decision.

**Tests first:** golden metadata/identity assertions, coverage-mode label tests, and negative fixtures for source/model confusion. Do not assert that old half-textured screenshots are desirable new baselines.

**Exit:** target and scope recorded; source provenance and held-out comparison set selected; implementation dependencies and named owners assigned. Any unavailable observation data remains an explicit acquisition task, not fabricated fixtures.

## S1 — Contracts, clocks and coordinate authority (3–5 days; depends S0)

**Owner:** core/data engineer. **Risk:** high at frame/unit boundaries.

**New files:** three schemas from devex-review; `crates/solar-core/src/appearance/{mod,recipe,time,packet}.rs`; `apps/web/js/{solarDynamicContract,solarDynamicClock}.js`; corresponding Rust/Node/Python tests.

**Modified:** `crates/solar-core/src/lib.rs` module exports only; schema generation/build validation dispatch; requirements traceability. Existing snapshot v3 and legacy v1 readers are unchanged.

**Actions:** specify units, +Z-north Carrington axes, source-WCS adapter, one rotation coefficient identity and absolute scenario time. Define model/observation lifecycle and no cross-clock mutation. Implement strict semantic validation, enums, finite/range/capacity checks and source/model authority checks. Use stable recipe hashes and canonical serialization. State ABI and schema versioning before worker work.

**Red tests:** half-turn/pole/handedness errors; double rotation; source-radius substitution; pause/rate/seek partition dependence; invalid timestamps; source data falsely labeled measured full-sphere.

**Exit:** contract round-trip and coordinate/time tests pass; identical absolute-time requests return equivalent descriptors independent of frame history. No renderer change required yet.

## S2 — Full-sphere photosphere and microstructure (5–8 days; depends S1)

**Owner:** numerical and rendering engineer. **Risk:** medium, especially aliasing and inflated feature sizes.

**New:** `appearance/{surface,granulation,transfer}.rs`, `solarSurfaceShaders.js`, `tests/web/solarSurface.test.mjs`, Rust appearance tests, CPU sampling fixtures.

**Modified:** additive `solar-wasm` appearance exports, `apps/web/engine.js` loader only as needed, narrow `orreryShaders.js`/renderer dispatch later through feature gating. Do not replace planetary materials.

**Actions:** implement Planck ratio and declared limb law; spherical cellular field with deterministic hash and C1 lifetimes; spot/facular masks from accepted model IDs; projected-size and temporal filtering. Test the CPU reference before GLSL. Use the same recipe seed and target time in WASM/GLSL, and keep microstructure independent from the coarse magnetic-grid resolution. Add neutral-white visible rendering and a scale-labeled close-up.

**Red tests:** seam and pole discontinuity; large visible cells on a small disk; rigidly advected-only noise; per-frame RNG; negative intensity; photospheric night side; double limb darkening in observed imagery.

**Exit:** full-orbit continuity, locally evolving resolved detail and emissive appearance pass with bloom disabled. Original observations remain unchanged. Capture target-scale and close-up evidence separately.

## S3 — Offline magnetic geometry and scenario packs (6–10 days; depends S1)

**Owner:** numerical engineer and scientific reviewer. **Risk:** high numerical/scientific interpretation.

**New:** `appearance/{pfss,field_lines,events}.rs`, `tools/prepare_solar_dynamic.py`, `tools/validate_solar_dynamic.py`, scenario recipes and analytic field fixtures. **Modified:** `crates/solar-cli/src/` existing command dispatch; strict optional appearance subcommands.

**Actions:** produce synthetic flux-balanced boundary fields from model snapshots; document normalized units. Implement a bounded offline PFSS harmonic solution and field-line tracer with explicit termination. Use independent analytic harmonics for validation. Create six-hour quiet/active packs with proposed 15-minute geometry keys, stable seed/strand IDs, field topology and source/model provenance. Define a separate long-duration rotation scenario. Generate offline spatial bins/occupancy with hard caps and conservative supports. Reject over-budget packs instead of dropping structures silently.

Density/temperature/heating descriptors are declared reduced-model assumptions, not inferred from PFSS. Geometry keys and model state times remain paired. Bifrost or measured radial-map adapters remain optional extensions requiring separate evidence.

**Red tests:** net monopole injection, wrong harmonic normalization/sign, polar singularity, source-surface tangential field, false open-field classification after budget exhaustion, bad area-weighted resampling, mismatched snapshot identity.

**Exit:** analytic solution, trace convergence and flux checks pass; a scientific reviewer can trace every field/plasma assumption. No per-frame global solve is introduced in the web app.

## S4 — Observed sequence pipeline (5–8 days; depends S1)

**Owner:** data engineer. **Risk:** medium/high source timing and intensity interpretation.

**New:** `tools/prepare_solar_sequence.py`, `solarSequencePlayer.js`, sequence tests and fixture manifests. **Modified:** `solarObservation.js`, existing source acquisition adapters only if approved datasets require them, build input validation.

**Actions:** select an actual bounded NASA/SDO sequence through documented access routes. Retain source bytes/headers, image IDs, observation times, quality, acquisition errors and rights. Prepare preview/full-resolution variants, WCS registration and gap records. Source access has its own explicit command and cache; offline preparation performs no network calls. Implement three-frame decoded buffering, current/next GPU textures, meaningful play/pause/end/gap states and exact timestamp labels.

Start with original provider-display intensity if calibration is unavailable. Expose its display limitations. For a calibrated track, use separately pinned FITS preparation, exposure/quality handling and instrument calibration; it is not achieved by dividing JPEG values by exposure.

**Red tests:** missing frame; duplicate/nonmonotonic times; invalid quality; source/exposure mismatch; corrupt digest; wrong channel; late frame for a canceled seek; appearance timestamp advancing while old frame remains; interpolation across a gap.

**Exit:** a real sequence plays within its own clock, retains off-limb imagery, and never invents source frames. Main Observe and Research paths remain distinct.

## S5 — Dynamic corona renderer and bounded transfer (7–12 days; depends S2/S3)

**Owner:** rendering engineer. **Risk:** high GPU cost, compositing and numerical accuracy.

**New:** `solarDynamicAssets.js`, `solarDynamicRenderer.js`, `solarAtmosphereShaders.js`, `solarDynamicWorker.js`, `solarDynamicWorkerClient.js`; renderer/lifecycle tests. **Modified:** narrow integration in `orrery.js`, physical-envelope admission and context restoration hooks.

**Actions:** implement bounded loaders and latest-generation publication; CPU/worker packet selection; low-resolution volume and spatially indexed strand sampling; camera/surface/depth intersections; emission integration and optional absorption; quality variants and allocation probes. Use f64 CPU transfer as the independent numerical reference. Implement known empty-space and homogeneous cases before visually complex assets. Import field-aligned geometry and local pulses; remove dependence on shared pulse/repeating event in the new mode.

Map the new extended envelope only in isolated Sun inspection. Preserve system-overview geometry/occlusion rules. Diagnostic mode renders disk, emission, opacity, coverage and IDs separately. Confirm nonblank output and actual submitted shader/resource identity in the running app.

**Red tests:** rear loop shines through disk; transparent envelope writes opaque depth; whole-scene pulse falsely qualifies motion; undersampled thin strand loses energy; half-float overflow; allocation failure leaks resources; canceled packet replaces current scene; reduced motion leaves a partial animated clock.

**Exit:** actual-shader numerical tests and fixed-camera local-motion tests pass at each admitted tier; captures show coherent full-sphere structure without source-image seams.

## S6 — Channel/layer display and color integration (4–6 days; depends S4/S5)

**Owner:** rendering/UI engineer. **Risk:** medium, shared HDR regression.

**New:** `solarDynamicControls.js`, `solarBloom.js`, associated tests. **Modified:** `index.html`, `styles.css`, `destinationCards.js`, `sunlayers.js`, `orrery.js`, `hdrPresentation.js` only for additive targets/output-encoding support as required.

**Actions:** implement clearly named modes, visible/171 presets, source time and model elapsed time, play/pause/rate, layers and close-up scale bar. Keep technical details in the inspector. Add linear-relative output path and optional restrained bloom; do not globally change the existing tone map. Add interior cutaway via current layer UI. Update misleading catalogue text only where needed for these layer explanations.

**Red tests:** unlabeled synthetic source; channel switch changes physics time; old source date appears under a new image; controls unreachable at 320px; center label obscures inspection; new solar gamma path double-decodes; stationary pause keeps rendering; cutaway bleeds into external observation mode.

**Exit:** user can identify mode/channel/time and pause/scrub without scrolling through long prose. Existing keyboard/touch/Research/navigation behavior passes.

## S7 — Cool plasma and explicit event lesson (3–5 days; depends S3/S5/S6)

**Owner:** numerical/rendering engineer with scientific review. **Risk:** high interpretation, bounded implementation.

**Files:** appearance event/transfer modules, atmosphere shader, event recipes/tests and layer copy.

**Actions:** implement the declared prominence/filament transfer surrogate and a separate opt-in kinematic eruption lesson. A selected event has a finite time window and does not repeat automatically. Keep its connectivity/physics explanation distinct from PFSS. Its density/temperature/velocity parameters are illustrative; no measured CME label unless using observed footage.

**Red tests:** cool material incorrectly bright on every background; alpha applied after foreground light; negative opacity; event reset at a periodic modulo; flare/CME mislabeled as equivalent; event velocity/time-scale inconsistency.

**Exit:** on-disk absorption/off-limb emission behaves according to recipe, explicit onset/end works, and scientific labeling survives source/mode changes.

## S8 — Blender reference and export pipeline (5–9 days; depends S1/S2/S3; final parity after S5)

**Owner:** Blender technical artist and rendering engineer. **Risk:** medium/high tool and color mismatch.

**Files:** those enumerated in [blender-pipeline.md](blender-pipeline.md), optional small reference fixtures, exporter tests. Generated large assets stay in ignored build output.

**Actions:** provision/pin Blender when implementation reaches this slice; run the CPU sphere/slab/strand smoke test before authoring a complex Sun. Build scenes from shared packets. Produce diagnostic linear EXR, matched-display images and separately named beauty previews. Verify numeric exports without needing a glTF material transplant. Compare forward/side/back/polar/limb views at shared times.

**Red tests:** missing backend; node/API mismatch; wrong R-to-scene conversion; non-linear EXR; camera misalignment; baked bloom contaminates scalar data; glTF drops required material semantics; `.blend` output lacks source recipe identity.

**Exit:** reproducible recipe/scene inputs, bounded render, numerical slab checks, geometry export round-trip and browser-reference agreement within adopted tolerances. Observational realism remains a separate gate.

## S9 — Temporal, visual and physical-device qualification (7–12 days; depends S4–S8)

**Owner:** QA/device reviewer and scientific reviewer. **Risk:** high if substituted with desktop screenshots.

**New:** temporal/spatial assertions and mobile protocol described in [test-matrix.md](test-matrix.md). **Modified:** existing solar/physical/browser validation tools, evidence schemas, selected fixtures.

**Actions:** run deterministic CPU/GLSL tests, actual staged shader tests, matched Blender comparisons and independent observed-sequence reviews. Exercise all acceptance scenes and negative controls. Test normal/reduced motion, foreground/background, touch orbit, zoom, rotation, reload, offline state, partial downloads and WebGL restoration on a physical iPhone/Safari. Also test native Windows Chromium on the local ARM/Adreno hardware if available. Record device/OS/browser/build/time/channel/rate/resource identities.

Measure two-minute active and ten-minute sustained sessions, plus idle. Compare screen-space local structure after removing camera/bulk-rotation/global-gain effects. Set empirical morphology thresholds from qualified reference distributions before final tuning. If a reference or target device is unavailable, keep that acceptance item pending rather than substituting another platform.

**Exit:** SUN-01–17 have linked evidence; regressions and known approximations are explicit; no remaining misleading-science interpretation in the accepted scope.

## S10 — Build, documentation, rollback and promotion handoff (3–5 days; depends S9)

**Owner:** release engineer. **Risk:** high external effect; implementation remains local until separately authorized publication.

**Modified:** `build_web.py`, physical/schema/module/asset validation, service-worker/build identity lists, release change classification, relevant workflow tests, README, SPEC, OPERATIONS, STATUS, requirements and RFC evidence.

**Actions:** stage a complete immutable bundle, verify every new dependency and optional resource, test source/hash mismatch rejection and offline caching. Enable the new default only after its feature/config and compatible bundle are qualified. Preserve a complete older release as rollback; never combine old shader code with new schema data. Rollback must restore mode mapping, modules and assets atomically. No migration of scientific snapshot v3 is needed.

**Exit:** SUN-18 evidence, exact source/artifact identity, complete manifest, rollback exercise, honest limitations and a reviewable handoff. Commit, push, PR, merge, protected-setting changes and deployment require the applicable separate authorization; this plan provides none.

## Failure, concurrency and idempotence summary

| Condition | Required behavior |
|---|---|
| Source sequence missing/invalid | Retain last verified source frame with stale/paused state; explicit retry. Never silently show synthetic material under observed label. |
| New model variant over budget | Choose an admitted lower tier and disclose it; if none fits, show truthful fallback with motion unavailable. |
| Partial preparation | Stage under a unique temporary directory; validate all dependencies; finalize to content-addressed destination only when complete. A failed attempt cannot update the selected pointer. |
| Repeated identical preparation | Verify existing product hashes and return success without rewriting; differing recipe gets a new immutable identity. |
| Latest seek supersedes load | Cancel pending work, release readers/arrays, reject all old generation/serial completions. |
| Context loss/resize | Dispose dependent targets and programs under current owner; rebuild from admitted CPU products with new context generation. Old uniform/resource handles never survive. |
| Shader error or invalid output | Surface a visible unavailable diagnostic, retain verified fallback, record local structured reason. No magenta/NaN output accepted as solar data. |
| Background/reduced motion | Stop clocks/work; hold an explicit paused state and allow deliberate scrub. Resume cannot jump through hidden elapsed time. |
| Scenario endpoint | Stop with Replay/Choose scene; no extrapolation or hidden modulo loop. |

## Existing validation commands

Use repository tooling and installed prerequisites; these commands are **implementation validation**, not claims of execution during planning:

```powershell
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
npm test
$env:PYTHONPATH = 'tools'
python -m unittest discover -s tests/python -p 'test_*.py' -v
python tools/validate_docs.py
python tools/validate_sdlc.py
python tools/validate_ux_contract.py
python tools/typecheck_web.py
python tools/validate_web_static.py --root apps/web
git diff --check
```

Stage using existing supported commands and unused destinations:

```powershell
$candidateSha = git rev-parse HEAD
python tools/build_wasm.py --locked --out-root build/wasm-dynamic-sun
python tools/build_web.py --wasm-dir build/wasm-dynamic-sun --out-root build/site-dynamic-sun --release-id local-dynamic-sun-1 --source-sha $candidateSha --repository Protonmatter/sol --run-id 1
node tools/solar_appearance_validation.mjs --web-root=build/site-dynamic-sun --out=coverage/dynamic-sun-reference
node tools/physical_rendering_validation.mjs --web-root=build/site-dynamic-sun --out=coverage/dynamic-sun-physical --backend=native
node tools/browser_validation.mjs --web-root=build/site-dynamic-sun --output-dir=build/dynamic-sun-browser
```

The existing harnesses must be extended to exercise the new modes; running their current versions only tests existing paths. Native backend selection must be verified from the actual context. Set the existing supported `CHROME_BIN`/browser argument to an installed browser; do not download a new browser implicitly. A dirty HEAD label is lineage, not full source attestation; record candidate diff/manifest hashes.

## New planned commands and test files

After implementing their CLI contracts:

```powershell
cargo run -p solar-cli --locked -- appearance prepare --recipe assets/solar/recipes/quiet-sun.v1.json --out build/solar-pack-quiet
python tools/prepare_solar_sequence.py --source-root PATH_TO_VERIFIED_SOURCE_BUNDLE --recipe assets/solar/recipes/observed-171.v1.json --out build/solar-sequence-171
python tools/validate_solar_dynamic.py --manifest build/solar-pack-quiet/manifest.json
node tools/solar_dynamic_validation.mjs --web-root=build/site-dynamic-sun --out=coverage/dynamic-sun-temporal --backend=native
```

New targeted test groups: Rust `appearance_math`, `appearance_determinism`, `pfss_reference`, `field_line_trace`; Python `test_solar_sequence.py`, `test_solar_dynamic_assets.py`, `test_solar_dynamic_build.py`; Node `solarDynamicClock`, `solarDynamicContract`, `solarDynamicAssets`, `solarDynamicWorker`, `solarSurface`, `solarAtmosphere`, `solarSequencePlayer`, `solarDynamicControls`, `solarBloom` test files. Test exact failure paths and cross-boundary behavior rather than only matching shader strings.
