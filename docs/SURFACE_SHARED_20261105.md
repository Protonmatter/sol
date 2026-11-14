# Shared-body interpolation control — 2026-11-05

The private shared-body horizontal unroll preserves the sampled helper bits and
captured Earth material pixels across three backends, but is rejected as an
optimization. Linux/Subzero material median rises from 1616.707 to 1776.363 ms,
with five of six paired blocks slower. Removing the extra helper and depth
dispatch from the [previous specialization](SURFACE_UNROLL_20261105.md) does
not eliminate its observed Linux regression. Application and staged bytes are
unchanged, including the approved Illustrative Earth appearance.

## Exact change and controls

One `scatteringResidual` body serves every field depth. The candidate replaces
only the four-iteration horizontal sample loop and its temporary array with
four ordered scalar reads inside a one-iteration event-exit block. The row-cubic
call uses those four values. Reversing those two text replacements restores the
original residual declaration and entire scattering GLSL byte for byte. There
is no added single-layer helper or dispatch into a second helper. Original y/z
loops, row/plane arrays, polar arithmetic, final altitude cubic, first-event
precedence and one linear fallback remain.

Independent CPU review passes 1,128 raw-bit/ordered-read fixtures across depths
1/2/9/17, 288 explicit read oracles and 24 competing-event cases. Every knot in
the full 64-sample multilayer stencil is exercised. Ten supplied test groups
pass. The CPU model retains its separate-binary32/rounded-JS-transcendental
scope; actual GPU controls remain necessary.

The GPU driver is identical to the reviewed prior driver except its schema
label. Both Windows backends and Linux pass all 90 configured RGBA32F
comparisons, representing 80 distinct field/depth/altitude settings and
1,474,560 scalar pairs per backend. Per-draw sentinel, malformed/domain,
finite-value, timer ownership and cleanup controls remain active. Matching
subnormal results do not prove that either backend preserves subnormal inputs.

The material harness directly replaces the same helper in the actual Earth
fragment. The entire outside fragment and vertex are unchanged. It retains
the paused epoch, camera, 68 uniforms, ten texture bindings, exact sphere
buffers, `[128,193,1]` field branch and six ABBA blocks. Original-to-clone and
original-to-each-variant comparisons all have zero raw RGBA byte differences
before PNG conversion; nonblank PNG pairs are identical within each backend.

## Retained timing observations

| Backend | Helper median baseline → candidate, ms | Material median baseline → candidate, ms |
| --- | ---: | ---: |
| Windows Adreno D3D11 | 0.429609 → 0.364193 | 7.128177 → 7.088307 |
| Windows SwiftShader LLVM | 2.672850 → 2.170850 | 38.842350 → 36.715850 |
| Linux SwiftShader Subzero | 83.323638 → 100.251358 | 1616.706591 → 1776.363347 |

These are retained isolated query envelopes, not application frame rates.
Windows software material has all six paired blocks faster: ratio-of-medians
saving 5.474695%, median paired saving 5.730359%. Native material's final block
is 7.122447 / 7.004947 / 5.470625 / 5.501562 ms in ABBA order. Both programs
change absolute timing level within that block. All samples remain included;
the small native median delta does not establish a stable native improvement.

Linux helper ratio-of-medians regression is 20.315627%; material regression is
9.875432%, with median paired regression 10.286107%. Material paired changes
are +17.794830%, +10.118450%, −0.313892%,
+21.563861%, +1.186862% and +10.453765%. Procedural and equality success do
not justify promoting this regression on the target backend.

The material target is an isolated 796 × 612 RGBA8/depth24 framebuffer with
four samples. Other scene geometry and occlusion are omitted. Raw equality is
per backend at this captured pose; opaque PNGs independently retain RGB and
cannot recover original raw alpha. This does not establish full-frame parity,
unquantized material parity, optical truth or original application acceptance.

## Linux execution and evidence

A fresh `/tmp/sol-shr-7xc9ha8n` runtime reconstructs the same 604 frozen inputs
and 429 blobs with a fresh process baseline, stock Node26.13.0/npm12.2.1 and
pinned official Chrome157. The controller's six protected process/pidfd/lifecycle
functions are byte-identical to the previously reviewed base. The 35,441-byte
upload contains exactly 14 ordinary members: driver and 13 private work sources.
All eight bounded commands exit zero, including CPU, strict helper and material
controls. No original application gate is run or granted by this sequence.

The actual saved Windows download is `linux-surface-shared-20261105.tar.gz`,
758,962 bytes, SHA-256
`5160c90d74dba2c3f1e007b71c4c963d76c8697d9f86076c920c8f9282c9a3fe`.
Bounded parent admission verifies all 30 ordinary members, 1,259,658 payload
bytes, exact inventory, source pins, query counts, equality and source postchecks
before extraction. It records `qualification:false` and
`optimization_accepted:false`. Independent saved Linux result review passes the
archive/source/equality checks and independently supports the timing rejection.

Important source and receipt identities:

- Shared prototype: `f89b303c448ba69998c0b9fcccace83e01e390f825c9b83867941d7a693da1d3`.
- GPU driver: `a3495cad5799c871ba5beb4da3f2e549713d679574fcd3aa79e526c5c205a838`.
- Material core: `9c45ce344bdac54c387b34ae7713b0ee0196bfd7e83a8e5966f78e2251adcc9b`.
- Material run: `2d7d421929e42d22eeffae2cffc5a6abbfeb7e9ed8b8ba1a5fbf29f8d9f15c4c`.
- Actual Earth candidate fragment: `662172758c45cc5ce4e0f5927e508a714cf144756fb93894701d9556c4537f0c`.
- Linux controller receipt: `d94256395067e865ec7e13fb67583bc8ca08c6f5935012021b2f5ed7933d93cb`.
- Linux helper receipt: `91097d6206822beb2b1cd1ee27d0eb9c46ee539f5364097120e139cd672dc535`.
- Linux material receipt: `afc0cf138c5d8591170fcfb7bf838ea5e0bf8702819d0a7df73a8e1f7a1fd36e`.
- Independent source review receipts: helper `891eb213…`, material `2dc15e09…`,
  Linux derivation `e0311ff0…`, return helper `9aa2a897…`.
- Independent Windows result review receipt: `3566f67e21682a8baa8f4bf682622afbcfb521bcc77dd227a770fdeb18bee987`.
- Independent Linux result review receipt: `8d166043438d8de17c3c0abdea1e03e9c4fe1f7070a6c1d9af39272ea488491d`.

Separate live closure confirms controller, all eight command leaders and return
process absent, no owned browser processes, no scan errors, and port8081 refusing
connections. Ten protected baseline processes remain exempt. All 13 private
sources, 604 inputs and 429 blobs remain unchanged. A self-process descriptor
open/close passes with zero signals sent. The preview is closed. Parent live
receipt `live-closure.json` has SHA-256
`aae5bbe2c3249362854726428c7c736becc6184e3acd3f22670af3ee77da9305`.

## Decision and next investigation

The later [shader-translation observations](SHADER_TRANSLATION_20261105.md)
capture actual backend output without draws or timing. They retain differing
cross-host words, matching software static counts and the candidate's unchanged
loop count; they do not establish a performance cause.

Stop this unroll candidate. The extra helper/depth dispatch is not required for
the observed regression, and no compiler/disassembly evidence currently proves
its cause. Reassess backend/compiler evidence before selecting another shader
transformation. Preserve mathematical expressions, field formats, detail,
resolution, memory limits and original accuracy/rendering gates.

Artifacts remain under `build/surface-shared-20261105/` and
`build/surface-shared-material-20261105/`. No app optimization, gate relaxation,
dependency, orbit-model change, commit, push or deployment follows. Complete
Windows/Linux application qualification and broader production holds remain open.
