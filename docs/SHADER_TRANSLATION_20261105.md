# Shader translation observations — 2026-11-05

The compile-only control captures actual HLSL on native Adreno and SPIR-V word
dumps on Windows/Linux software rendering for the exact baseline and rejected
[shared-body candidate](SURFACE_SHARED_20261105.md). Both software observations
have the same static instruction counts and selected candidate deltas, but their
word streams differ. The candidate adds 118 instruction records and six
conditional branches while retaining eight loop records. These observations
establish neither runtime cost nor the cause of the opposite timing outcomes.
Application, stage, quality settings and approved Illustrative Earth appearance
remain unchanged. The shared-body optimization remains rejected.

## Observation contract

The private tool admits the exact 169,907-byte captured shader corpus, compiles
one shared vertex and two fragment shaders, links two programs and asks the
optional `WEBGL_debug_shaders` extension for translated text. The
[Khronos extension specification](https://registry.khronos.org/webgl/extensions/WEBGL_debug_shaders/)
defines that observation API and its empty-result behavior. Missing extension
and empty output have explicit recorded reasons. The tool submits no draw or
timer-query calls and makes no performance or application-acceptance inference.

Shader/program handles receive cleanup attempts, and browser cleanup and five
input hashes are checked in `finally`. Compile/link failure, cleanup exception,
context loss, GL error or input drift prevents completion. Returned text is
bounded per shader and as a serialized receipt. The final output-size rejection
can leave no evidence file; it is not a truncation or successful observation.
The page deadline is cooperative, with a separate 90-second browser protocol
timeout and a 150-second VM command bound.

All three actual backends complete three compiles and two links with 68 active
uniforms per program. Translation is available in these observed runs:

| Backend | Vertex text bytes | Baseline fragment bytes | Candidate fragment bytes | Returned representation |
| --- | ---: | ---: | ---: | --- |
| Windows Chrome156 Adreno D3D11 | 16,561 | 61,496 | 62,751 | HLSL |
| Windows Chrome156 SwiftShader LLVM | 79,477 | 301,508 | 306,370 | SPIR-V words |
| Linux Chrome157 SwiftShader Subzero | 79,477 | 301,508 | 306,370 | SPIR-V words |

Both native fragment link logs retain X4000 for `f_terrainHeightKm`. The
[owning GLSL](../apps/web/js/terrainShadowShaders.js) and both returned HLSL
function bodies have two conditional returns and an unconditional final return.
The HLSL bodies match after generated local identifiers are normalized. This
does not prove an application defect or a compiler false positive; no terrain
code is changed in response to the warning alone.

## Structural word inspection

A dependency-free, bounded parser inspects the returned hexadecimal words. Its
header and instruction framing use the
[Khronos SPIR-V header definitions](https://raw.githubusercontent.com/KhronosGroup/SPIRV-Headers/main/include/spirv/unified1/spirv.hpp11):
five header words, high 16-bit instruction word count and low 16-bit opcode.
It rejects malformed tokens, missing/short headers, zero-width or truncated
records and inconsistent function boundaries/IDs. It deliberately does not
validate complete opcode grammar, types, capabilities, dominance or semantics.
It writes no binary shader artifact.

The initial stub fails eight test groups with 20 `NotImplementedError` cases.
The implementation passes all eight groups. Independent review adds 12 malformed
controls and separately reproduces every record/function count and little-endian
word digest. Both software observations have these counts:

| Stream | Words | Instruction records | Function records |
| --- | ---: | ---: | ---: |
| Shared vertex | 7,072 | 1,708 | 19 |
| Baseline fragment | 27,020 | 6,723 | 55 |
| Candidate fragment | 27,458 | 6,841 | 55 |

Selected candidate-minus-baseline records are `OpFunctionCall +3`, `OpStore +19`,
`OpSelectionMerge +6` and `OpBranchConditional +6`. Both fragments retain eight
`OpLoopMerge` records. The source replaces the horizontal loop with another
one-iteration loop to retain first-event exits; the source change does not remove
that loop record in either observed software translation.

Cross-backend word comparison retains 279 differing vertex words, 681 differing
baseline words and 690 differing candidate words, with no unpaired words.
Opcode counts and per-function opcode maps match for each corresponding stream.
The streams are not relabeled as identical or semantically equivalent. Static
counts cannot isolate later compilation, operands, runtime paths, scheduling,
OS/architecture or browser-version effects. No JIT/machine-code or performance
cause is established by this observation.

## Source, execution and saved evidence

Important identities:

- Capture tool: `2e65640d3c249d86d51bde982bfc00a902275b837ceb2887e48baf6fce25ed5c`.
- Captured corpus: `fdb8452c75a0d0db6978ee8ba78a4b37f165271af860398a02260bc1a7d52cfc`.
- Baseline fragment: `1719c0a4ae51d9d95c94da0e658b4a6efcc7ba7946030eae51f2eb1398a83799`.
- Candidate fragment: `662172758c45cc5ce4e0f5927e508a714cf144756fb93894701d9556c4537f0c`.
- Windows native receipt: `6444b4969602635b724ca4d59da2c1c0dbfce25dfa15db168294192842551330`.
- Windows software receipt: `d53b79023608a56d632306ccf8783f03e70eb851af44fff576a9a8d71d5b196f`.
- Linux compile receipt: `326a0a4eb89dd1424138c877b0c7ca35ad058b1416971e3be12699af6719ef90`.
- Structural parser: `7132f1b49c4d643552d3dc0c7290f1a1d7d2a624e3c9a81a3cfdbcc0d16af1fe`.

The fresh `/tmp/sol-cmp-2mpd_7n3` runtime reconstructs the same 604 frozen inputs
and 429 blobs, stock Node26.13.0/npm12.2.1 and pinned official Chrome157. All six
protected process/pidfd/lifecycle functions match the reviewed prior controller.
The exact 60,160-byte upload has three ordinary members: driver and two private
sources. Only its private source/member caps rise to 262,144 bytes to admit the
literal 169,907-byte captured corpus. No application accuracy, quality or
acceptance threshold changes. Five prerequisite commands and the compile-only
observation exit zero with input postchecks and saved cleanup records passing.

The actual Windows download is `linux-compiler-observation-20261105.tar.gz`,
218,908 bytes, SHA-256
`d17a9df4913c51c1ff47af25b274e6c02238e45346ce54864fb32a799eccd752`.
Parent bounded admission verifies 13 ordinary members, 1,116,359 payload bytes,
1,136,640 tar bytes, exact inventory, sources, six commands and all returned
text hashes/counts before extraction. Controller receipt:
`97614c60b82fc7545e0d8fc7bf73582559fe3e643f28cb5b2a2d65ebfbab473f`.
Independent saved Linux packet and cross-backend comparison reviews pass within
their stated provenance and structural scopes.

Completed independent review receipts: capture source `075cf702…`, Linux
controller source `ae6d902c…`, return source `098be385…`, Windows results
`2f3c26a5…`, and structural parser/Windows summary `fd128a46…`. Reviews inspect
saved bytes and source-bound postconditions; missing VM binaries/input blobs and
unretained final machine code limit independent reconstruction.

Independent Linux packet review receipt:
`92be4ee6bf0e144e746f5ad6ac4391c1462b79020890f0ddb1f873487c3049fe`.
Independent cross-backend comparison review receipt:
`67430790ff1c650c14099535b8b7f05e467370bbdebc17185b6441a4ce81babf`.

Separate live closure confirms the controller, six command leaders and return
process absent, no owned browsers, no scan errors and port8081 refusing
connections. Ten protected baseline processes remain exempt. The two private
sources, 604 frozen files and 429 blobs remain unchanged. Self-descriptor
open/close succeeds with zero signals sent. Preview 46 is closed. Parent live
receipt SHA-256:
`e6a76a37c5604ca31d2a6036aa0d0cfda7f7d7fb93a3607ee29fb92a88d46589`.

## Next controlled question

The later [guarded-read control](SURFACE_GUARDED_20261105.md) now implements this
question. It preserves sampled helper/material equality and the intended loop
reduction, but its first Linux material cohort is mixed. Its private provenance
checker defect is corrected before VM use; a fresh material repeat remains open.

The existing unroll keeps its wrapper loop and adds static branches/calls.
Compare a private guarded-read structure that removes that wrapper while
retaining original row/plane arithmetic, ordered reads and first-event behavior.
First verify the intended translated-loop reduction, then require the unchanged
CPU, strict GPU, material-pixel and paired-timing controls. This is a hypothesis,
not a proven cause or accepted optimization. Keep the current production shader
until an equivalent measured improvement passes the original application gates.
