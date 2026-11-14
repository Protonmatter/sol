# Surface-interpolation unroll controls — 2026-11-05

The private depth-one specialization preserves the sampled helper bits and captured
Earth material pixels on all three backends, but is rejected as an optimization:
the Linux/Subzero material median increases from 1586.650 to 1816.876 ms. All six
paired Linux material blocks are slower. The candidate remains outside the app.
Application shaders, fields, models, quality settings and staged bytes are unchanged.
This follows the [matched-material controls](MATCHED_MATERIAL_COST_20261105.md).

## Candidate and preserved failures

The first candidate replaces the depth-one stencil's temporary arrays with static
values and rows, while retaining the mathematical expressions and first-event
fallback. It passes the separate-operation CPU model but fails native exact GPU
equality in 10 of 90 recorded rows. Restoring the original altitude loop and plane
array leaves nine failed rows, with maximum observed difference three ULPs.
Those failed receipts remain failed; characterization does not grant acceptance.

The third candidate also restores the original row array, row loop and polar
expressions. Only the four horizontal reads and their temporary values are
unrolled. Its separate helper is selected at exactly one field layer; removing
that dispatch restores the original generic declaration byte for byte. Removing
the inserted helper/entry restores the entire original scattering GLSL string.
The first invalid/zero-source knot still selects one linear fallback, and the
original final altitude cubic is retained. No field format, sample, resolution,
source map, optical equation or numerical threshold is reduced.

Independent CPU checks retain 569 bit/read fixtures, 32 explicit first-event/read
cases, numerical/read mutation witnesses and the exact-depth guard control. Ten
supplied test groups pass. The CPU adapter models separate binary32 operations
and rounded JS transcendentals; it does not model every GPU contraction or
transcendental implementation. [GLSL ES 3.00 section 5.11](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf)
permits some arithmetic reassociation and varying operation precision. Those
permissions do not identify the specific cause of either observed native failure.

## Actual helper and material observations

The final helper passes 90 exact RGBA32F comparisons on Windows Chrome156 native
Adreno, Windows Chrome156 SwiftShader LLVM, and Linux Chrome157 SwiftShader Subzero.
Ten fields at depths 1/9/17 and three altitude settings produce 90 recorded rows,
80 distinct name/depth/altitude combinations, and 1,474,560 scalar pairs per run.
Common subnormal flushing is not evidence of subnormal preservation.

Every comparison draw clears a distinct alpha sentinel before submission. An
actual held candidate draw must expose all 4,096 sentinel pixels and be rejected.
Per-draw finite/nonnegative/alpha-domain checks prevent reuse of the baseline
pixels. The driver also binds the timer helper's release dependency explicitly.
Both gaps were reproduced against the earlier private driver and corrected before
GPU execution. Query ownership, compound errors and cleanup checks remain active.

The full-material control captures the actual ready Source-qualified Earth draw,
68 uniforms, ten texture bindings and exact sphere buffers. It tests the intended
128 × 193 × 1 branch at fixed epoch 2026-07-08T12:00:00Z and matched camera/quality.
Original versus cloned baseline, and original versus candidate, each report zero
raw RGBA byte differences before PNG conversion. Each backend retains one separate
warmup and 24 queries in six baseline/candidate/candidate/baseline blocks.

| Backend | Helper median baseline → candidate, ms | Material median baseline → candidate, ms |
| --- | ---: | ---: |
| Windows Adreno D3D11 | 0.429479 → 0.334245 | 7.139687 → 6.983489 |
| Windows SwiftShader LLVM | 2.664650 → 2.514150 | 38.137950 → 37.602250 |
| Linux SwiftShader Subzero | 82.014121 → 116.423959 | 1586.649739 → 1816.875919 |

These are medians of retained isolated query envelopes, not application frame
rates. One Windows software material block regresses despite its lower median.
Linux regresses in both helper blocks and all six material blocks. Its material
ratio-of-medians regression is 14.510208%; median paired regression is 14.607157%.
The Windows improvement does not justify promoting a regression on the target
Linux backend. No source transformation or failed threshold is relabeled as passing.

The owned target is 796 × 612 RGBA8/depth24 with four samples and isolated cleared
depth; the captured default framebuffer has no alpha channel and other scene
geometry is omitted. Equality is per backend at this pose, not cross-backend or
full-frame parity. Saved opaque PNGs independently preserve RGB; raw alpha remains
a source-bound pre-PNG postcondition. Optical truth and original app gates remain
separate. The approved Illustrative appearance is untouched.

## Linux execution and saved evidence

The old temporary VM runtime is gone on resumption. An old numeric PID is present
again and is not targeted. A fresh `/tmp/sol-unr-5pmhg88o` root uses a fresh
UID/PID/start baseline and the reviewed process-handle cleanup. It reconstructs
the same 604 inputs/429 blobs and exact stage with stock Node26.13.0/npm12.2.1 and
pinned Chrome157. Cloud API authorization is rejected. Existing locked npm
dependencies install with scripts disabled in isolated HOME/cache/configuration.

All eight commands exit zero: tool versions, locked install, browser version,
stage admission, ten CPU tests, helper comparison and paired material comparison.
This procedural/equality success is distinct from optimization acceptance.

Local evidence is ignored and not published:

- Final prototype `b61bc961f1d0598e445ee303ef0497d70012e6202745f281cc86cc053155de21`,
  helper driver `ea9ae3e6470edd02e1f03dfb24e8026071e8e03115c8286aa090ac5d559a9610`,
  inspector `f321628708187fb0a874a2ecd5890fb46bc1fb3ef17cf1c51f0b68029748bd48`.
  Source snapshots and all failed/passing receipts remain under
  `build/surface-unroll-20261105/`.
- Paired material sources/Windows results:
  `build/surface-unroll-material-20261105/`. Shared vertex is `1b76a5a1…`, baseline
  fragment `1719c0a4…`, and candidate fragment `1670a640…`. The full hashes and
  exact generation inverses are retained with source-review receipt
  `813fd9391e9858ccd1506c21a9c158da8c1c2d8276e684d5cafe547f97d335b2`.
- Actual download: `C:/Users/mkang/Downloads/linux-surface-unroll-20261105.tar.gz`,
  759,459 bytes, SHA `78f271256d38f0e4a0c84e8c45554447de429ed6d0488fa05a51752ff26713cd`.
  Its 30 ordinary members total 1,261,722 payload bytes and match the inventory.
  A retained copy and admitted extraction are in
  `build/surface-unroll-20261105/linux-returned/`.
- Linux controller receipt:
  `7dcd7c6daa7f3a5fe6ca3b69aae0d51a2b4680380e5af6b450b192da79ef0340`;
  helper receipt `3ff1e85c83b4eb2c0fcb9ffc116b3d97e0d28aac3925cf674096d198e2215b6d`;
  material receipt `3d66feffc07b1f5493ffd7ec250ececad2dd11351b6c5e963760cc9df6c648bb`.
- Independent Windows saved-result review receipt:
  `5242b3de95e7133cc70c2d2b7f4462ff159a14256f4e2f4cd3b1143a24d61ac1`.
  Independent Linux archive/result review receipt:
  `19217e245fb9579d9fd237d61873f79b6f5d40220fac3f90e4c6e5185a761946`.
- Linux source and return helpers have separate pre-execution reviews. Actual
  saved-byte admission is separate from the server's successful local write/flush.

A separate parent read-only live check confirms all fresh test PIDs absent,
no owned browser processes, no scan errors and port8081 refusing connections.
The preview is closed. Ten baseline-protected processes remain exempt. All 13
private sources, 604 reconstructed inputs and 429 blobs remain unchanged. A
self-process descriptor open/close succeeds with zero signals sent. These live
observations are in `live-closure.json`, separate from offline result review.

## Next architecture control

The later [shared-body control](SURFACE_SHARED_20261105.md) now executes this
comparison. It preserves sampled helper/material equality but also regresses
Linux material timing. Removing the extra helper/dispatch does not eliminate
the observed regression; neither design is promoted.

Stop the two-body specialization design. Duplicated generic/specialized shader
paths are a plausible code-generation or masked-execution cost, but no disassembly
or path-execution evidence establishes that cause. The next controlled design is
one shared interpolation body with horizontal reads unrolled for all field depths,
compared against the unchanged generic oracle. Retain the same arithmetic,
first-event fallback, fields, memory, detail and original acceptance gates.

Only a measured equivalent improvement should enter a rebuilt artifact and the
original complete Windows/Linux validation. No application optimization, gate
relaxation, dependency addition, orbit-model change, commit, push or deployment
is made by this investigation. Production qualification remains open.
