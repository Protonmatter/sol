# Test matrix and evidence gates

All tests below are planned. Passing plan/document checks is not passing these implementation gates. Numerical tolerances are **proposed engineering acceptance values**, selected to expose implementation error; a scientific reviewer may tighten them against the admitted sources. Changed tolerances require a documented reason, not an unrecorded adjustment after failure.

## Acceptance mapping

| Test | Requirements | Level / setup | Expected result | Evidence / gate |
|---|---|---|---|---|
| T01 full-sphere coverage | SUN-01, SUN-02 | Fixed seed/time, 12 longitudes, equator and ±60 degrees, both poles; bloom off | No missing modeled hemisphere, coordinate seam, pole starburst or cloned observational active region; observed camera never implies acquired far-side coverage | Named camera images, coverage/variance maps; visual gate |
| T02 source/model authority | SUN-02, SUN-08, SUN-17 | Switch observed/model/legacy under loading, failure and replay | Correct source kind, channel, epoch, units and limitations always accompany current pixels; legacy schema still loads | State/DOM assertions plus source IDs; contract gate |
| T03 wavelength semantics | SUN-03, SUN-14 | Visible, modeled171, observed171/304/193 presets | Visible disk neutral and limb-darkened; EUV false color explicit; no extra photospheric limb law on observed pixels; unsupported response labeled | Reference images and recipe metadata; science gate |
| T04 rotation/frame | SUN-04, SUN-09 | Analytic markers at 0/30/60 degrees latitude; one day and relative Carrington drift | Matches one declared coefficient set; no double spin or sign reversal; axes determinant +1 | f64 analytic vectors and GPU marker readback; numerical gate |
| T05 absolute-time determinism | SUN-04, SUN-09 | Sample direct, many steps, irregular fps, backward seek, rate changes | Same IDs/hashes and equivalent numeric descriptors at the same target time; no per-frame RNG | Rust/native/WASM replay receipt; contract gate |
| T06 resolved disk evolution | SUN-05, SUN-10 | Close-up granulation at fixed camera/exposure, 60x, time-separated 600 solar seconds; no bloom/labels | Local cell boundaries change independently of bulk rotation or global gain; selected fixture has >2-pixel resolvable changes | Registered disk-only differences, feature samples; temporal gate |
| T07 coronal local motion | SUN-06, SUN-07 | Fixed camera; quiet and active strands, one scripted local pulse; disk/halo masks separate | Local structure/intensity evolves; unaffected regions do not share mandatory synchronous pulse; rear strand remains occluded | Region traces and linear emission captures; temporal/transfer gate |
| T08 opaque/absorptive transfer | SUN-07, SUN-14 | Analytic slabs, sphere tangent, front/rear structures, foreground moon and transparent foreground layer | Analytic transmittance/emission within tolerance; correct front-to-back order; no bounding-envelope depth occlusion | CPU/GPU/Blender matched linear outputs; numerical gate |
| T09 source ingest | SUN-08, SUN-18 | Wrong hash, unsupported quality, missing exposure, mismatched WCS, irregular times, gap | Invalid products withheld; unknown quantities remain unavailable; no JPEG-to-radiance inference or timestamp relabeling | Preparation receipts and negative tests; data gate |
| T10 resolution/temporal LOD | SUN-10, SUN-13 | Disk diameters 200/300/900/2000px; limb and close-up; 1x/60x/600x/7200x | No false resolvable granules at small disk size; prefiltered rapid detail; smooth tier/patch transitions; scale labels | Physical-pixel footprint calculations and captures; visual gate |
| T11 lifecycle controls | SUN-11, SUN-12 | Pause/scrub/play/end/replay, hidden tab, reduced-motion change while playing, channel/mode switch | Whole scene clock state is consistent; no hidden catch-up, stale source times or residual loop motion when paused | Event/state logs and timed captures; interaction gate |
| T12 cancellation and failure | SUN-12 | Slow/failed/truncated load, latest seek, worker deadline, decode/upload failure, context loss/restore, rapid resize | Bounded work and buffers; no cross-generation publication; usable last verified state with accurate status | Resource counters, ownership/generation trace; reliability gate |
| T13 performance/device | SUN-13 | Physical iPhone/Safari and native Windows ARM/Adreno; two-minute and ten-minute runs, idle | Tier budgets measured; honest fallback if unsupported; paused idle does not repaint continuously | Device/OS/browser/GPU/build receipt; device gate |
| T14 HDR/palette/bloom | SUN-14 | Known 0/.18/1/4/16 linear patches, two exposures, palette ramp, bloom on/off | One decode/encode; no premature clamp; scientific values independent of presentation; bounded bloom targets | Numeric readback, color-space metadata; color gate |
| T15 Blender parity | SUN-15 | Same camera/time/recipe in CPU reference, Blender and browser; linear and bloom-free | Unit scale, occultation, transfer and geometric support agree within adopted error budget | Scene/recipe/version hashes, EXR metadata, convergence samples; authoring gate |
| T16 interior cutaway | SUN-16 | Cutaway entered/exited from observed and model modes | Layer ordering and scale disclosure correct; no interior leaks into exterior observed view; clocks remain unchanged | UI and geometry captures; education gate |
| T17 regression scope | SUN-17 | Existing Rust/Node/Python suites, engine requests, planets, sky, reference loading, HDR and restored contexts | No changed scientific snapshot/orbit values or removed navigation/features; existing ABI remains compatible | Complete existing check results; integration gate |
| T18 artifact/rollback | SUN-18, SUN-08, SUN-12 | Build, hash verify, interrupted update, new shader/old manifest mix, rollback | Mixed identities rejected; old complete artifact restored; no retained incompatible worker/texture | Staged manifest and rollback trace; release gate |

## Numerical fixtures and tolerances

| Quantity | Independent reference | Proposed criterion |
|---|---|---|
| Planck ratio | f64 direct formula and limiting/monotonic cases | Rust relative error ≤1e-10 on admitted range; f32 shader ≤1e-4 where reference nonzero |
| Linear limb law | Analytic disk integral 1-u/3 and point samples | CPU integral relative error ≤1e-5; shader samples absolute ≤1e-4 before tone mapping |
| Frame matrices | Basis orthogonality, determinant and known source markers | f64 orthogonality error ≤1e-12; f32 position error ≤1e-5 R on unit-scale fixtures |
| Harmonic PFSS | Single-harmonic solutions, analytic boundary derivative | Normalized RMS field error ≤1e-3; source-surface tangential residual ≤1e-6 of reference RMS for direct analytic evaluation |
| Flux balance | Exact weighted synthetic bipole/zero-monopole fixtures | abs(net)/unsigned flux ≤1e-6 when unsigned flux is nonzero; explicit zero-field case |
| Field trace | Analytic dipole/harmonic line and step-halving convergence | End-footpoint angular error ≤0.1 degrees on selected well-conditioned fixtures; null/budget cases explicitly classified |
| Scalar transfer | jL, Beer–Lambert, uniform slab formal solution | abs(error) ≤max(1e-5, 1% of reference) before display mapping |
| Thin strand integration | Dense/adaptive CPU ray reference | ≤1% integrated-emission error on admitted widths; lower-quality prefiltered variant may use ≤3% with separate identity |
| Half-float encoding | Original bounded f32/f64 fields | Per-channel bound declared; reject overflow/nonfinite; resulting transfer must still meet the appropriate tier tolerance |
| Observation decode | Qualified source-to-preview recipe | Exact hashes and dimensions; pixel agreement against that recipe, not an unrelated JPEG download |

These numerical tests establish equations/implementation consistency. They do not validate solar heating, calibrated plasma variables, real-time forecasting or unique magnetic connectivity.

## Morphology and temporal acceptance

Use resolution/channel-matched references and maintain development/held-out sets. Record disk radial intensity profile, center/limb contrast, spatial power spectrum or multiscale variance, active-region filling fraction, structure orientation, off-limb radial falloff, temporal autocorrelation and feature-displacement distributions where the source supports them. Window/mask edges before Fourier analysis. Declare PSF/downsampling and exclude invalid pixels, source gaps and unqualified intensity changes.

For modeled feature metrics, compare distributions over appropriate scenarios; do not require a synthetic region to occupy the same pixel as an unrelated observation. Fix camera, tone curve and exposure. Use model geometry to remove expected rigid rotation, or compare against a deliberately rigid-only control. Local-motion tests can use deterministic block matching/feature masks without adding OpenCV as an application dependency.

Set observation-dependent thresholds after a source-quality review and before final look tuning. Record that baseline as a fixture manifest. Do not invent calibrated thresholds from an outreach movie. The first acceptance is categorical morphology plus independent reviewer assessment; statistical fidelity claims require a stronger admitted dataset.

### Required negative controls

- Freeze only disk structure while keeping glow, camera and labels animated: T06 must fail.
- Animate only a shared halo pulse: T07 must fail.
- Rotate a frozen texture: local deformation requirement must still fail.
- Remove half the modeled surface detail: T01 must fail.
- Mirror measured active regions onto the observed back: T02 must fail.
- Change exposure between comparison frames: temporal measurement must reject the pair or compensate using explicit exposure metadata.
- Allow a stale worker packet after a seek: T12 must fail.
- Mark an exhausted field trace open: field-topology test must fail.
- Apply AgX to one parity image but not the other: T15 must flag incompatible display transforms.
- Hide a quality downgrade that freezes only one layer: T11/T13 must fail.

## Device protocol

Record physical device model, OS/browser build, orientation, viewport and drawing-buffer size, selected tier, accessible WebGL capabilities, source/scenario IDs, shader/module hashes, duration and captured frame statistics. The supplied iPhone model is not known; select it or a documented representative with the user during implementation. Desktop responsive emulation is useful but is not an iOS graphics or thermal test.

Run: cold load; warm load; orbit front→side→back→pole; zoom to patch and back; change visible/EUV/observed; pause/scrub/rate; lock/background and return; rotate portrait/landscape; reduced motion; airplane/offline cached view; simulated missing optional assets; context loss where platform permits; 10-minute sustained animation. Verify touch target reachability, pinch/scroll behavior, screen-reader control labels and focus order. Use VoiceOver on iOS and the existing Windows accessibility targets when qualifying the changed controls.

## Evidence record

Each result should include `test_id`, `requirement_ids`, exact candidate and diff hash, staged release/asset digests, recipe/source IDs, tool/version/backend, camera, channel, time/rate, quality tier, procedure, expected/actual, result `pass|fail|not_run`, limitations and evidence files. Add reviewer identity only after a real review. No automatic change from `not_run` to accepted because another platform passed.

Release gates are cumulative: numerical/contract → shader/integration → source/morphology → Blender authoring → physical device/accessibility → artifact/rollback. Existing repository qualification requirements remain in force; this matrix adds relevant Sun evidence rather than replacing them.
