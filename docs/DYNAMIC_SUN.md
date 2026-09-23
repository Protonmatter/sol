# Dynamic Sun: local implementation and evidence boundaries

This document describes the September 23, 2026 **R4 smooth-quiet and attachment**
implementation. Final generated quiet/active data exists under
`build/solar-dynamic-r4-final/`; **stage06 model and source browser validation passed**.
The combined appearance target is **NOT accepted**: both renderers still show
broad rounded dark regions and a few isolated bright arcs rather than the desired
irregular connected emission and varied loop families. Numerical/reference passes
do not override that result. This document does not establish a released website,
scientific acceptance, or production qualification. See the
[final diagnostic handoff](DYNAMIC_SUN_HANDOFF.md) for the decision and evidence.
The original saved NASA observation and the research engine remain separate from
the new archive player and illustrative appearance renderer.

## Observed archive

The Observe view can switch between the original saved image and **121 actual
SDO/AIA 171 Å archive observations** from May 10, 2024, 16:29:57.349 through
18:30:09.350 UTC. Requested sampling is one minute; the displayed timestamp always
comes from the visible frame's original `DATE-OBS`, including irregular archive
spacing. Selection starts paused. Play, pause, frame scrub, restart, and 60×/600×
archive rates are explicit controls. End-of-sequence does not loop automatically.
Missing intervals greater than twice the expected cadence stop playback and hold
the last verified frame. Scrubbing can deliberately select a later frame.

The 512×512 previews are grayscale, provider-stretched JP2 imagery reduced and
encoded as JPEG. All source `QUALITY=1073741824` values remain present and explicitly
unqualified. These are not calibrated radiance values; unknown per-frame provider
transfer prevents quantitative intensity comparisons. The source image plane is
preserved. The imagery is not registered to model regions, mapped onto a globe,
or interpolated into invented observations. WCS values describe the original
4096-pixel source, not a qualified preview registration.

Sources: [Helioviewer API documentation](https://api.helioviewer.org/docs/v2/) and
[source identifiers](https://api.helioviewer.org/docs/v2/appendix/data_sources.html).
The manifest records each frame's exact source and metadata URLs and SHA-256
identities. Credits belong to NASA/SDO AIA, ESA/NASA Helioviewer, and LMSAL JP2
generation. Original acquisition bytes and receipts are retained locally in ignored
`build/solar-sequence-source-121/`; these large originals are not shipped.

The bundled preview pack is approximately 5.0 MB; its exact preview-byte sum
is 5,021,778. The manifest is `apps/web/solar-observation-sequence.v1.json`, with
SHA-256 `865d478cce97cef48eff729df81721c0e61336766d937d7101e6f672a6e26b31`.
Browser controls pin this manifest. The loader admits individual images by digest,
byte count, MIME and dimensions, with a maximum three-frame decoded ring and one
active loading/decoding pipeline. There is no whole-movie preload. Replacements
that fail retain old pixels and their old timestamp with a visible failure state.
Hidden/background/reduced-motion state pauses playback; returning does not catch
up through elapsed hidden time.

## Illustrative dynamic model

The separate dynamic Sun display uses quiet and active six-hour appearance packs.
Coordinates are Carrington, positive longitude west, with north along +Z and a
nominal solar radius of 695,700 km. Fields and emission are normalized illustrative
quantities. Synthetic boundary fields and reduced plasma assumptions are not
observations, MHD solutions, or calibrated plasma inference.

The current browser uses the **initial PFSS connectivity**, advected and sheared
with continuous local pulse variation. Its diffuse background is held and rotated.
It does not re-solve PFSS as browser time changes. Each pack's 25 precomputed
geometry keys are offline authoring/reference products; the browser does not
consume them as a time-varying PFSS solution. This distinction applies even when
motion looks continuous. The separate native rotation and source-boundary workflows
do not imply that those scenarios are selected by the browser.

### R4 surface and attachment hierarchy

The model combines a slowly changing macro-scale dark-hole mask, a smooth quiet
emission field, sparse structure and dark lanes around admitted field-line
endpoints, and compact bright endpoint kernels. The quiet middle-scale component
uses the declared transform
`(0.5 + 0.5 * clamp(0.55*N0 + 0.30*N1 + 0.15*N2, -1, 1))²`.
That transform changes only the quiet component. Sharper structure remains local
to attachments; quiet brightness was not compensated by changing exposure.

Region envelopes are placement/diagnostic masks and **add no surface emission**.
Bright kernels attach to actual traced endpoints. Each logical endpoint group has
two kernels, a fixed total core amplitude budget of 1.4 and structure budget of
0.22, divided into 0.7/0.11 per kernel. Core width is 0.0035 R and the surrounding
structure support width is 0.015 R, independently of region-envelope extent.
These are illustrative recipe amplitudes, not calibrated luminosities. Fixed
admitted anchor members determine attachment positions; subdividing a rendered
curve does not create extra disk emitters or change a group's budget. Distinct
physical model curves can still contribute additional coronal emission.

The browser evaluates this shared hierarchical surface recipe analytically at
display pixels using the admitted packet. Its coronal path combines analytic
Gaussian strands, including per-point emissivity gains and finite local pulses,
with a **diffuse-only** background. It does not add the complete fallback volume
on top of those strands. The hierarchy transfer ID is
`hierarchical-euv-linear-v1`; emission remains linear/relative until presentation.
There is no calibrated AIA response, measured magnetogram, or plasma inversion.

A bounded worker supplies time descriptors; offline attachment anchors remain
owned by admitted geometry. A cool-material option is a phenomenological sheet,
not non-LTE prominence synthesis. HDR composition, palette, exposure and bloom
affect presentation and add no physical provenance. Visible photospheric
granulation is a separate recipe/path. Observed, illustrative and research states
retain their separate clocks and authority.

### Artistic detail layer

An optional **artistic detail** layer (`apps/web/js/solarLookShaders.js`, the
"Artistic detail" checkbox, on by default, EUV only) ports the look-development
target in `tools/lookdev/` into the dynamic renderer. It replaces the disk's
presented EUV intensity and adds coronal emission; it changes no packet, field,
hash or recipe, and it carries no physical provenance.

- **Surface.** A Worley network with bright points, ridged flame texture and
  mottling on integer-hashed flow noise, evolving with model time. Level of detail
  follows the disk's radius in pixels.
- **Dark regions.** Placement comes from the model's coronal-hole field, with
  the lab's domain warp. A wide threshold, fibrous noise acting only near the
  boundary and a faint dimmed surround give soft, frayed edges. Inside, the
  network gives way to a dim wispy glow with a few surviving bright points,
  rather than a dimmed copy of the network.
- **Active regions.** Each emission region's two footpoint-group centroids drive
  a plage, uneven hot cores and a thin, frayed dipole fan on the surface, plus
  thin 3-D loops in eight tilted planes that the photosphere occludes.
- **Limb and fur.** Limb brightening and an emissive rim whose strength follows
  the local surface. Off-limb radial fur reads its brightness from the surface
  directly beneath it, so coronal holes starve it and network and active regions
  feed it, instead of an even rim around the circumference.
- **Prominence.** One thin, three-thread braided arch with a faint hedgerow, in a
  vertical sheet at an illustrative Carrington site. It is not the absorbing
  cool-material sheet and does not replace it.
- **Presentation.** The composite adds quarter-resolution bloom and maps
  intensity through the lab's palette. The palette is pre-inverted through the
  existing Reinhard presentation, so it displays as designed at zero exposure
  stops; exposure stops still apply. Bloom layers count toward the transfer
  target's 48 MiB budget.
- **Thinner strands.** While the layer is on, analytic strand cross-sections are
  drawn at 0.45 of their admitted width at unchanged emissivity.

With the layer off, or in the visible channel, the dynamic shader output is
unchanged: the shader validation reproduces the same CPU/GPU hierarchy error as
before the layer existed. Widths, gains, rates and sites live in the frozen
`LOOK_RECIPE`; they are art direction and are not accepted appearance.

The layer is expensive. Under SwiftShader (CPU rendering) the staged validation's
median frame rose from about 0.85 s to 3.3 s. It has not been measured on a
physical GPU or mobile device.

### Reference rasters and resolution limits

Each final scene exports 2048×1024 float32 linear surface references at t0 and
t900 seconds. The manifest's base `surface` record aliases the exact t0 reference
path, bytes and hash. This removes the earlier 512-grid under-resolution from the
offline base surface. The **production R4 browser branch does not sample or fetch
this 2K reference map**; it evaluates the analytic hierarchy instead. The map is
an offline reference/authoring product, not an extra browser detail layer.

The scoped spherical-area test for a 0.0035 R Gaussian found 512-grid alignment
ratios of approximately 0.362–1.973. The 2048 grid passed the tested 0°, 45° and
75° latitude cases within about 4e-7 of the analytic integrated area. Near-polar
cases still showed up to 3.44% error and remain unqualified. This evidence concerns
integrated area in specified fixtures; it does not establish peak reconstruction,
all viewing-angle filtering, instrument resolution or observed morphology.

### Corrected coarse fallback deposition

The optional 64³/96³ total fallback exports reconstruct strands using analytic
Gaussian voxel-cell integrals. Separable normal-CDF differences use the physical
width as sigma, with no added h²/12 variance. Each line midpoint carries its
emission, arc-length weight, altitude attenuation and interpolated point gain.
Exact ±5-sigma support omits `1.719908445219076e-6` of the unclipped mass.

The manifest records strand-only target, retained, tail and clipped mass before
float32 accumulation, plus midpoint sample count. The helper never renormalizes
surviving cells after clipping. The grid cube and the existing voxel-center shell
mask can remove mass; exact curved sphere/voxel intersection is not implemented.
Near-boundary losses therefore remain grid-dependent and are reported explicitly.
Background is supplied once by its independent diffuse-field owner.

The prior center-sampled implementation produced interior narrow-kernel mass
ratios of approximately 1.859/0.426 on 64³ and 1.727/0.464 on 96³ as alignment
changed. Twelve corrected interior cases across those grids and widths
0.005/0.02/0.05 R retained 0.9999982800915547–0.9999982800915550 of target mass,
matching the declared tail omission. The actual active 64³ export records target
0.00179183100078955, retained 0.00154671931436903, tails 3.08178527066e-9 and
clipping 0.00024510860463526 in its declared relative-emission mass units.
Float32 reintegration after background subtraction was reported within 8.67e-9
relative to retained mass. This corrects export conservation; it does not make a
coarse fallback volume a thin-strand-resolution-qualified renderer.

## Final generated R4 identity

Both generated packs contain 25 L32 geometry keys and pass the core workstream's
public Python/Rust admission, with 35 resource records each. The generated
qualification summary and manifest bytes identify:

| Scene | Manifest SHA-256 | Recipe SHA-256 |
|---|---|---|
| active-v1 | `e3c773128ffd7124740600a8ca7103865bc85b64a4a90dd035c7509d44f90140` | `28d73c04ee871367dda18edbc03095efaf8075ac4026e5f962430585aad08787` |
| quiet-v1 | `1108ac80731f3316b87dfb756f8ee1ce13524068caaa394e233d5ababcfc9174` | `8bd0922001b6a98a2ad5f5ca4b777b6a139b94cb7d05e3d2269832fa8d42a6c1` |

Producer input identity is
`b99eeb3b6591c8afb38bd512fc4c7c78e3f34f334f40309831c5f70f65997858`;
the executed isolated producer binary SHA-256 is
`b1bcc202b6f165aeaf2616b0d962fe8937f7e01fee102ca6fa86e11951c4980a`.
Receipts inventory transitive Rust/Cargo/recipe inputs, the generator and the new
Gaussian deposition helper. These are local build receipts, not signed release
attestations. The independently checked stage06 artifact is described below;
product identity and successful admission do not establish visual acceptance.

## Preparation and validation

Preparation is local and immutable. Existing output with identical bytes is a
verified no-op; conflicting output requires a new directory. Source acquisition is
an explicit separate option and never occurs inside browser rendering.

```powershell
# Replay preparation from already retained archive inputs; needs existing Pillow
# with JPEG2000 support. No new dependency is installed by the script.
python tools/prepare_solar_sequence.py --source-root build/solar-sequence-source-121 --out build/solar-sequence-prepared-121

# Explicit bounded public acquisition, only when a new source capture is intended.
python tools/prepare_solar_sequence.py --source-root build/solar-sequence-source-121 --acquire --count 121

# Offline dynamic validation; uses repository-owned native validation, not a
# binary selected by input metadata. Requires the installed Rust toolchain and
# already available locked workspace dependencies; no live network is required.
python tools/validate_solar_dynamic.py apps/web/solar-dynamic/quiet-v1/manifest.json --web-root apps/web
python tools/validate_solar_dynamic.py apps/web/solar-dynamic/active-v1/manifest.json --web-root apps/web

# Validate the preserved final generated candidates before adoption/staging.
python tools/validate_solar_dynamic.py build/solar-dynamic-r4-final/solar-dynamic/quiet-v1/manifest.json --web-root build/solar-dynamic-r4-final
python tools/validate_solar_dynamic.py build/solar-dynamic-r4-final/solar-dynamic/active-v1/manifest.json --web-root build/solar-dynamic-r4-final

node --test tests/web/solarSequencePlayer.test.mjs tests/web/solarSequenceControls.test.mjs
python -m unittest discover -s tests/python -p test_solar_sequence.py
python -m unittest discover -s tests/python -p test_solar_dynamic_build.py
python -m unittest discover -s tests/python -p test_solar_deposition.py
python -m unittest discover -s tests/python -p test_solar_dynamic_deposition.py
```

Archive admission parses JP2 box framing and its embedded XML; the separately
retained header must agree on capture, channel, quality, exposure, geometry and
identity. Closest-image records bind the archive ID and whole-second UTC capture
time; the more precise XML capture timestamp is preserved. Corresponding source,
metadata and closest-image URL parameters are checked. Separate file hashes alone
are not treated as proof that the records describe the same observation.

The web build validates archive schema/hash/pins and dynamic manifest index/resource
integrity **before copying and again against staged bytes**. Dynamic packet
validation delegates to the shared native validator through the Python tooling.
All new solar scientific JavaScript modules are included in the release science
fingerprint, including source-selection and layer dispatch. Archive JPEGs and
large dynamic payloads are on-demand assets; manifests and runtime code remain
critical assets. This avoids installing the entire movie or every model resource
when the service worker installs.

## Final stage06 and local validation evidence

The immutable release is `local-dynamic-sun-06` under
`build/site-dynamic-sun-06/`. Its release-manifest SHA-256 is
`d9350b523b79de7be00c110cea7895587adbccd4cf1ceeadbf289827a7aa1730`.
The manifest binds actual staged bytes; its Git source SHA identifies base lineage,
not the entire uncommitted implementation. The model and source harnesses each
passed six actual-browser checks with empty error arrays. Evidence is retained in
`build/dynamic-sun-browser-06/evidence.json` and
`build/solar-sequence-browser-06/evidence.json`.

The source harness uses a loopback server, blocks external requests, verifies
release/asset hashes, interacts with actual controls and reads decoded canvas
pixels. Reproduce it against the unchanged artifact:

```powershell
node tools/solar_sequence_browser_validation.mjs --web-root=build/site-dynamic-sun-06 --out=build/solar-sequence-browser-06-repeat
```

The source run passed six checks: first source frame paused; playback and
pause holding exact pixels/time; endpoint scrubbing with no loop; navigation pause
without catch-up; reduced-motion pause; and a bounded 390-pixel layout with return
to the original still image. It retained evidence JSON and first/last-frame and
layout screenshots under the output directory. The 390-pixel check is a responsive
desktop-browser viewport, not a physical mobile-device qualification. Stage06
contains the repaired reduced-motion policy guard; the harness confirms a real
preference transition followed by paused source time and pixels.

The model run passed fixed-camera time-varying pixels, exposure/corona-free disk
diagnostics, context-loss recovery while paused, reduced-motion pause, responsive
layout with the model explicitly ready, and native short-run cadence. The observed
Adreno/D3D11 context produced **301 frames over five seconds**, with p50 and p95
frame intervals both approximately **16.7 ms**. This is a short cadence observation,
not a two-/ten-minute thermal, memory or physical mobile-device qualification.
Final sampled hierarchy CPU/GPU maximum absolute error was
`6.1600864846855785e-6`, with GL error zero. This scoped comparison is not whole-image
Blender/browser parity or universal cross-device precision qualification.

Local regression results recorded for the final handoff are:

| Check | Recorded result and scope |
|---|---|
| Node suite | 1,360 tests passed, zero failures. |
| Full Python suite | 446 tests plus 1,555 subtests passed before the latest Blender alias-metadata fix; the full suite was not rerun after that fix. |
| Blender helper rerun | All 14 helper tests passed after the alias-metadata fix. |
| Rust workspace | 229 tests passed; two default-ignored offline qualifications were separately run in release mode and both passed. |
| Other local gates | Formatting, clippy, 127-file web typecheck, static-web, UX and governance checks passed. |

Logs and final source inventory are under `build/dynamic-sun-final/`. These are
local results, not hosted CI or a fresh-machine qualification.

## Final Blender reference evidence

The corrected Cycles importer combines exactly coincident unordered endpoint
terms in one support and sums their original Gaussian contributions. It preserves
each term's width, gain, radial cutoff, arc direction and pulse; it neither moves
endpoints by epsilon nor compensates brightness. Axial, transverse, reversed
insertion and reversed pulse-orientation fixtures pass. This resolves the
reproduced common-endcap loss, including the weak-envelope case that previously
lost about 92.6% of its expected emission. Arbitrary partial coincidences between
other segments were not exhaustively enumerated.

The final hash index at `build/solar-authoring/r4-final-summary/evidence-index.json`
contains **336 artifacts** and explicitly records `appearance_accepted=false`.
Actual front, limb, back and north references, quiet front, active t900, raw linear
transfer/palette EXRs, display PNGs and an editable beauty companion are retained.
The beauty companion has its own rendered verification; it is not visual acceptance.

The t900 front positive-pulse expectation produced exactly zero difference and is
retained as a no-signal result. The active pulses lie on the far side within the
projected disk and are correctly occulted. At the **same t900**, the back pulse/control
pair passes unchanged locality thresholds: maximum added corona approximately
0.0151633620, no negative difference, 179 of 262,144 pixels above 2e-6, and **surface
channel difference exactly zero**. No model timing or exposure was changed to
obtain that visibility. This establishes a local pulse in the tested visible
configuration, not a globally realistic dynamic corona.

Blender consumes the admitted 2K baked field in a Carrington-corotating reference
camera; the browser evaluates the analytic field. Their sampling/camera contracts
differ, so whole-image numerical equivalence is not claimed. Both currently show
the unaccepted rounded masks and isolated bright arcs documented in the handoff.

Unit tests additionally exercise corrupted data, stale seeks, early HTTP response
cleanup, stream cancellation, source-record contradictions, strict own-key schema
admission and held-frame failures. Tests do not substitute for science review or
sustained device qualification.

## Rollback and remaining acceptance

Rollback selects an entire prior immutable release namespace and its matching
manifest, code, WASM and assets. Do not mix an older shader/runtime with newer packs,
or change the pinned archive digest without reviewing the corresponding manifest.
No scientific snapshot migration is introduced by the archive player.

Open acceptance includes source quality-bit interpretation, provider transfer/flicker
qualification, empirical morphology comparisons, sustained GPU/memory measurements,
physical device testing, complete reference-render acceptance and final hosted
release checks. The combined appearance target remains explicitly unaccepted;
irregular multiscale emission and richer neighboring loop families require further
model work and renewed acceptance. Final stage06 checks and the scoped Blender
overlap correction are complete, while physical-device, sustained thermal/memory,
hosted CI and deployment checks have not occurred. Optional
1024-pixel archive frames were not generated. A successful
local build, test suite or screenshot is not deployment or scientific calibration.

The immutable planning documents under `docs/plans/2026-09-23-dynamic-sun/` describe
the intended larger scope. This implementation document does not mark their pending
scientific or operational gates accepted.
