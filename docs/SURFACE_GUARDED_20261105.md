# Guarded interpolation control — 2026-11-05

The private guarded-read candidate preserves sampled helper bits and captured
Earth material pixels on Windows native/software and Linux software rendering.
The first Linux material timing cohort is mixed: three paired blocks are faster
and three slower. A fresh same-source repeat has five of six faster blocks.
Across both complete cohorts, eight of twelve blocks are faster and the median
paired candidate change is −2.634941%. This supports advancing the candidate to
separate full application testing, without granting optimization acceptance.
Both cohorts and every sample remain retained. Original application gates remain open.

This follows the [shader-translation observations](SHADER_TRANSLATION_20261105.md).
Application shaders, models, fields, resolution, memory limits and approved
Illustrative Earth appearance are unchanged.

## Transformation and actual checks

The candidate replaces the horizontal four-read loop with nested guards. Each
read checks invalid alpha first, nonpositive RGB second, and reaches the next
read only through its valid branch. It removes the rejected unroll's one-iteration
wrapper. There is one shared residual body, with no extra helper or depth dispatch.
Original row/plane arrays, y/z loops, polar/final arithmetic, event precedence and
one linear fallback remain. Reversing only the horizontal block and row arguments
restores the original helper and entire scattering GLSL byte for byte. The actual
Earth fragment is unchanged outside that helper; its vertex is unchanged.

Ten CPU groups pass before and after the refactor. Independent checks pass 1,128
bit/read fixtures across depths 1/2/9/17, 288 explicit read/fallback oracles and
24 competing-event cases. Source-model ordered access is distinct from actual
GPU speculative execution. Both software translations show eight baseline loop
records and seven candidate loop records. Windows candidate static instruction
count is 6,835 versus 6,723 baseline; counts do not establish runtime cost.

All three helper runs pass 90 configured RGBA32F comparisons: 80 distinct
field/depth/altitude combinations and 1,474,560 paired scalar values per backend.
Finite/domain and held-draw sentinel checks pass. Matching subnormal outputs do
not prove subnormal preservation. The complete material comparison retains
zero original-to-clone differences and two zero-difference raw RGBA8 rows before
PNG conversion. Both PNGs are equal and nonblank within each backend.

The captured Source-qualified Earth pose retains epoch, camera, 68 uniforms,
ten texture bindings, exact sphere buffers, `[128,193,1]` field branch and six
ABBA blocks/24 timings. The isolated target is 796 × 612 RGBA8/depth24 with four
samples. Other geometry/occlusion is omitted. Equality is per backend at this
pose; it does not establish full-frame or unquantized material parity. Opaque
PNGs independently retain RGB, while raw-alpha equality remains source-bound.

## Retained timing cohorts

| Backend | Helper median baseline → candidate, ms | Material median baseline → candidate, ms |
| --- | ---: | ---: |
| Windows Adreno D3D11 | 0.430807 → 0.356692 | 7.127161 → 6.989791 |
| Windows SwiftShader LLVM | 2.663300 → 1.889400 | 37.524400 → 33.742600 |
| Linux SwiftShader Subzero, first cohort | 78.117970 → 68.573239 | 1512.774084 → 1468.616461 |
| Linux SwiftShader Subzero, fresh material repeat | Not repeated | 1538.752672 → 1507.558193 |

These are isolated query envelopes, not application frame rates. Windows native
material block five is 6.886250 / 5.423802 / 5.400312 / 5.514114 ms in ABBA order;
block six stays at the lower timing level. Retain every sample and do not infer
a stable small native material improvement. Windows software has all six paired
blocks faster: 10.078242% ratio-of-medians saving, 7.975246% median paired saving.

First Linux helper ratio-of-medians saving is 12.218356%. Its material median is
2.918983% lower, but median paired candidate change is **+0.199004%**, or
+3.47576125 ms. The six material changes are +3.308831%, −3.735406%, +2.955972%,
−11.865069%, −2.557963% and +3.844581%. No optimization acceptance follows.
The fresh material-only repeat retains the exact same source pair, inputs and
six ABBA blocks. Its median paired change is −4.154085%; its third block is
6.443422% slower and remains included. Across all 48 timed queries and twelve
blocks, the pooled medians are 1530.1586825 → 1494.6908105 ms. These descriptive
statistics do not establish application frame rate, source portability or stable
native performance. No cohort or sample is filtered or replaced.

## Verified P2 in private evidence admission

- **File/symbol:** preserved `build/surface-guarded-20261105/inspect-translation.before-source-guard.py:25`, receipt input-map admission.
- **Problem:** the original inspector hashes only the input entries supplied by the receipt. An empty map and the older compiler experiment's real existing map both pass.
- **Impact:** a supplied result can receive the guarded structural-target label without establishing the expected producer/corpus. The witness changes only the map; it does not claim that the older producer generated the actual guarded rows.
- **Fix:** the corrected inspector requires the exact five guarded capture/corpus/helper identities, v1 receipt/schema/backend and literal state types, clean compile-only results, integer-zero counters, compiled/linked rows and canonical availability.
- **Validation:** the initial ten-group suite records 14 failures. The corrected ten groups pass, including additional type controls. Independent replay of the exact two original witness maps rejects both before any parser call. The unchanged valid capture still yields eight-to-seven loops; target02 differs from target01 only in inspector identity.
- **Boundary:** inspector `f4b79d09…`, its report and first prepared 90,335-byte payload remain preserved and unexecuted on Linux. Only the separately reviewed corrected v2 payload is uploaded and run. Completed Windows GPU evidence has its own correct source identities and remains independently valid.

The original P2 review receipt is `2447aee2…`; correction review is
`e6adc08c…`. Corrected inspector SHA-256:
`ff38870641301df5b8d4a5a89d55a777efe7bdef4f4a93ed75e7592d426f8a7b`.
The actual Windows capture remains `59fec164…`; corrected target02 is
`6f316f88…`. No original app gate, numerical tolerance or failed source version
is relabeled as passing.

## First Linux cohort provenance and closure

Cloud Shell reconnects to a recycled runtime: the prior compiler temporary root
is gone. The optional Cloud API credential grant is rejected. A fresh
`/tmp/sol-grd-uj1yx4p3` root reconstructs the same 604 files/429 blobs with stock
Node26.13.0/npm12.2.1 and pinned official Chrome157. The exact 90,781-byte v2
upload contains 18 ordinary members/17 sources, including the corrected inspector.
All six protected pidfd/process/lifecycle functions match the reviewed base.
Only the private corpus bounds rise to 262,144 bytes for the literal 169,968-byte
input. All ten commands exit zero with source/frozen postchecks passing.

The actual downloaded `linux-surface-guarded-20261105.tar.gz` is 921,523 bytes,
SHA-256 `1bf163b925c21b430b07c2a9e383e53a1ee773da626906962833e61071bb167d`.
Parent admission verifies all 38 ordinary members, 2,229,356 payload bytes,
2,263,040 tar bytes, complete inventory, exact source closure, three decoded
translations, target binding, helper fields/equality and material results before
extraction. It records `qualification:false` and `optimization_accepted:false`.
Independent first-packet review verifies the source, structural target, equality
and mixed timing interpretation without granting optimization acceptance.

Key identities:

- Prototype `6cc4e50b…`; GPU driver `057c2186…`; actual candidate fragment `dae80fa7…`.
- Material core `4a9cdf8b…`, run `d2409895…`, corpus `f05ab849…`, capture `a7e1a9f8…`.
- V2 controller receipt `30ac2871e885e6af97b48e4fbdeb89f3c063554a56608bc68bcf31bb58c380f6`.
- Linux translation `5922badb…`, target `dc22b890…`, helper `054af78a…`.
- Linux material receipt `55e84080b0232b36290f6b482ee3dec36c6ed49388b51aefd1a9877686b2ba45`.
- Independent CPU source review `86539ee4…`, material wiring `35f47110…`, Windows results `5b29924c…`, v2 Linux source `a914d628…`, return source `82f021cc…`.
- Independent first Linux packet review: `965d055676ac6d1f58e2f5bbcb43124d508f5d9f27cedc0cb98bb267d73529b0`.

Separate live closure confirms all twelve fresh controller/command/return PIDs
absent, no owned browsers, no scan errors and port8081 refusing connections.
Ten protected baseline processes remain exempt. All 17 private sources, 604 files
and 429 blobs remain unchanged; self-descriptor open/close passes with zero
signals sent. Preview 47 is closed. Live receipt SHA-256:
`c8101e552498c3ab10164cb7e6bed2e82ac775ba6cc2c240bfb3d4c15f696563`.

## Fresh repeat provenance and closure

The separately reviewed material-only controller uses a fresh
`/tmp/sol-gmr-539zif88` root, the same frozen inputs and eight exact private
sources. All six commands exit zero with source and cleanup postchecks passing.
The actual downloaded repeat archive is 743,128 bytes, SHA-256
`84dc6071b74bfdd533065e71c56834890b79eb4bfe9c606b1262bd86e154bdf0`.
Its 22 ordinary members contain 1,137,895 payload bytes in 1,157,120 tar bytes.
The first archive and material receipt remain byte-identical.

Parent admission and independent review verify exact shader-pair bytes, all 68
uniform records by name, target, geometry, draw arguments and recorded epoch,
camera, quality, Earth, maps and optics. PNG bytes match within and across cohorts.
Context-local GL handle labels and scene serials are not physical identities.
Raw material equality, clone equality, restoration and all 24 repeat queries pass.
The independent review recomputes every first, repeat and combined statistic.
Its receipt is `cd3375445b9fcb744a1befd13ae01a15afb4c44d4b9e5e887d9568014e326433`.
Repeat controller and material receipts are `c9ab8c4a…` and `8c77d659…`.

Separate live observation confirms all eight fresh controller/command/return
PIDs absent, no owned browsers or scan errors, and port8081 refusing connections.
All eight private sources, 604 frozen files and 429 blobs remain unchanged.
Self-descriptor open/close passes; zero signals are sent. Preview 48 is closed.
The transfer log's earlier `saved_download_not_yet_admitted:true` describes that
remote observation; subsequent local saved-file admission is a separate record.
Live receipt SHA-256:
`9e5f7de42fe553a85ce4cc59320982b89b4a305fca0d427fec359763d9a38903`.

Artifacts remain under `build/surface-guarded-20261105/` and
`build/surface-guarded-material-20261105/`. A separate source/build snapshot will
test the guarded candidate with the original full Windows/Linux application
gates; see [application qualification](GUARDED_APP_QUALIFICATION_20261105.md).
The current checkout and baseline artifact remain unchanged until that
candidate qualifies; there is no commit, release or deployment.
