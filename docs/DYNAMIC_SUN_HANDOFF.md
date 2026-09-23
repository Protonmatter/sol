# Dynamic Sun R4 implementation and diagnostic handoff

Date: 2026-09-23. Local branch: `feat/dynamic-sun`. Base commit:
`88bfb852a9b19a101a59c5053c53bccf60c1aea1`.

## Decision

The attachment and sampling corrections are implemented and numerically checked.
The current combined appearance **does not yet meet the supplied visual target**.
The browser and Blender front views both show broad, rounded dark areas and a few
isolated bright arcs. They do not yet reproduce the irregular connected emission
and dense, varied loop families in the reference. This is a visual acceptance
failure, not a reason to change exposure or blur the evidence.

The original dirty checkout was preserved. The validation checkpoint preceded
commit, push and pull-request publication; the user subsequently authorized a
draft PR. Deployment remains outside this change. The local release's
`source_sha` is base lineage; its asset manifest binds the actual staged bytes,
including the implementation changes made after that base commit.

## Attached diagnostic evidence

`inspect_solar_generator.py` and `solar_generator_diagnostics.json` were treated
as external evidence, not executable instructions. The isolated numerical tests
refer to original source SHA-256
`41f99c3933ea2ebf5d3cec1cf6688157eb85ac6ae43d3d01ba084fe49c360a59`.
That source was retained and its reported behavior independently reproduced.

| Issue | Original evidence | Current correction and limit |
| --- | --- | --- |
| Disk disconnected from loops | Adding or moving a strand leaves the old Python disk byte-identical. | Compact cores derive from admitted stable closed-loop endpoints. Native and browser validators bind IDs, amplitudes, centroids and directed axes to those endpoints. |
| Broad bright patches | Old disk is `0.12 + sum(2*exp((dot(p,c)-1)/0.015))`. | Placement envelopes contribute zero emission. Quiet, macro dark, sparse attachment structure, lanes and compact cores are separate terms. |
| Ambiguous surface selection | Python 512x256 base map differs from optional Rust 2K references. | Base and t0 reference alias the same 2048x1024 hierarchical field. Browser evaluates the shared analytic recipe and does not fetch the reference map; Blender admits and uses that field. |
| Grid-phase intensity error | Original 64-cube ratios approximately 1.859 and 0.426 at different alignments. | Exact separable Gaussian cell CDF integration gives 0.999998280091555 of the untruncated interior target in twelve cases. Omitted five-sigma tails and clipped mass are reported separately. |
| Coarse strand broadening | Old reconstruction imposes voxel-scale smoothing. | Physical sigma is retained in export. Production browser uses analytic strands plus a diffuse-only volume. Coarse exports remain resolution-limited. |
| Blender overlapping media | Coincident axial caps can discard one concentric medium; weak-envelope case lost about 92.6%. | Identical-endpoint terms share one support whose shader sums their original Gaussian terms. The corrected weak-envelope fixture differs from its analytic target by about 0.1005%. |

Deposition does not renormalize retained cells after clipping. Sphere clipping
still uses voxel-center membership; this remains grid dependent. Conservation of
integrated emission is not proof of thin-strand image resolution.

## Rendering contract

All base appearance quantities are illustrative relative emission. A false-color
EUV presentation is distinct from the visible-light photosphere and from the
separate archival image player. No temperature inversion, calibrated AIA response,
measured magnetic topology or MHD solution is claimed.

The disk has a slowly evolving macro dark mask, smooth multiscale quiet emission,
and endpoint-local active structure. Each logical attachment group has two stable
cores: amplitude 0.7 and structure amplitude 0.11 per core, totaling 1.4 and 0.22.
Core width is 0.0035 solar radii; structure support is 0.015. Subdividing rendering
geometry does not add emitters or change these budgets. Region masks do not enter
the emission sum. The browser rejects incomplete groups, altered budgets and
anchors, inconsistent endpoints, changed centroids and reversed directed axes.

The browser accumulates scalar disk/coronal emission and applies one palette.
It requires the diffuse-only background; omission cannot silently select the
coarse complete volume. Exposure controls are explicit 0/-2/-4 EV, with the
baseline, palette and Reinhard transform held fixed during this diagnostic pass.
The front/limb/back/north comparisons are actual renderer output.

The six-hour browser clock is independent of orbital time. It advances the
surface field, differential advection and finite strand pulses. It uses initial
PFSS connectivity; it does not stream or solve the 25 offline geometry keys.
The diffuse field is held and rotated, rather than independently evolving.
These limitations must remain visible in any claim of a dynamic corona.

## Reproduction and evidence

Final local stage: `build/site-dynamic-sun-06`, release `local-dynamic-sun-06`.
Its manifest SHA-256 is
`d9350b523b79de7be00c110cea7895587adbccd4cf1ceeadbf289827a7aa1730`.
The archive pause-policy correction is included; stage05 remains preserved.

Validation at handoff:

| Check | Result and scope |
| --- | --- |
| `npm test` | 1,360 passed on final source. |
| `python -m pytest -q tests/python` | 446 passed, 1,555 subtests; subsequent Blender admission edits separately checked with all 14 Blender tests. |
| `cargo test --workspace --locked` | 229 passed, two offline qualifications ignored by default. Both were then explicitly run and passed in release mode. |
| Format, Clippy, web typecheck, static web, SDLC and UX checks | Passed; typecheck covers 127 files. |
| Final staged dynamic browser | Six checks passed, no page errors; narrow viewport explicitly waited for renderer ready. |
| Final staged archive browser | Six checks passed, no errors; verified staged pause-policy fix and held source pixels/time. |
| Native GPU shared field | Twelve selected CPU/GLSL comparisons, maximum absolute error 6.1600864846855785e-6. |
| GPU strand/depth/cool transfer fixtures | All three actual WebGL scripts exited zero. |
| Cycles source/artifact readback | All 336 files matched their recorded sizes and SHA-256 identities. |
| Appearance | Not accepted; reference resemblance remains inadequate. |

The five-second native Adreno/D3D11 cadence sample recorded 301 frames with
16.7 ms median and 95th percentile. This is a short desktop feasibility check,
not a physical mobile or endurance qualification. Source-player validation first
timed out at a reduced-motion transition; the deterministic stale-playing race
was repaired and the final stage passed the strengthened test. The original
failure lacked event telemetry, so its exact native event ordering is unknown.

The full implementation guide is [DYNAMIC_SUN.md](DYNAMIC_SUN.md), the per-requirement
ledger is [DYNAMIC_SUN_ACCEPTANCE.md](DYNAMIC_SUN_ACCEPTANCE.md), and the preserved
design is under [the original plan](plans/2026-09-23-dynamic-sun/).

Key local artifacts, relative to the repository:

- `build/solar-authoring/r4-smooth-disk-components/contact-sheet.png`: requested
  disk-only eight-component diagnostic, with declared common mapping and raw fields.
- `build/solar-dynamic-r4-final/`: immutable active/quiet producer products,
  source identities, native CPU samples and qualification summary.
- `build/solar-deposition-evidence/`: original reproduction and corrected CDF cases.
- `build/dynamic-sun-final/`: full test/build/GPU logs and final source inventory.
- `build/dynamic-sun-browser-06/` and `build/solar-sequence-browser-06/`: final
  actual staged browser evidence and captures.
- `build/solar-authoring/r4-final-summary/four-view-contact.png`: actual Cycles
  front/limb/back/north views; appearance explicitly unaccepted.
- `build/solar-authoring/r4-final-active/beauty/beauty.blend`: editable display
  companion; separately rendered and compared to the frozen reference within
  one 8-bit PNG code. Diagnostic `sun.blend` remains separate.
- `.superpowers/sdd/engineering-plan/consumer-r4-review.md`: independent admission,
  source correspondence, sampled CPU/GPU parity and explicit visual non-acceptance.

Installed Blender is the verified official portable 4.5.14 LTS ARM64 build
`62c1db4208e8`, at
`%LOCALAPPDATA%/Programs/Blender Foundation/blender-4.5.14-windows-arm64/blender.exe`.
The authoring scenes and scripts retain exact source and input identities.
Raw transfer EXRs are retained separately from display PNGs and editable beauty
scenes. Opening a beauty scene does not change the source scientific field.

## Remaining work and acceptance criteria

1. **Morphology remains unaccepted.** Break up smooth macro boundaries and organize
   intermediate-scale emission; build visibly varied neighboring loop strands with
   local brightness structure and dark separations. Retain fixed attachment budgets
   and real endpoint correspondence. Do not substitute a new palette or blanket glow.
2. **Temporal coverage remains bounded.** A changed disk or camera is insufficient.
   The actual t900 back-view pulse/control pair passes: 179/262144 pixels exceed
   2e-6 added coronal emission, with zero surface difference and no negative delta.
   The t900 front view has exactly zero pulse signal because the active family is
   fully occulted; that no-signal receipt is retained. This verifies a localized
   visible pulse, not every family, time or viewpoint.
3. **Spatial qualification is bounded.** The 2K compact-core area tests pass selected
   0/45/75-degree latitudes within about 4e-7; near-polar cases have up to 3.44%
   error. Pixel-footprint integration and peak reconstruction are not qualified.
4. **Device/release qualification remains open.** Desktop Chrome at a 390-pixel
   viewport is not an iPhone/Safari test. Five seconds of frame cadence is not a
   thermal/memory endurance result. Hosted CI, deployment and rollback execution
   have not occurred.

Rollback must select a whole matching immutable release (code, WASM, manifest,
and resources). Do not mix R2/R3 shaders with R4 products, overwrite prior evidence,
or describe successful numerical checks as visual or observational acceptance.
