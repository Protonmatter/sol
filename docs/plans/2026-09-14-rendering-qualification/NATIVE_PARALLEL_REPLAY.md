# Combined-source native and software replay

Status: **native and SwiftShader startup, source replay, cache and memory tours
passed** on the pinned combined stage. This is one startup observation per
backend, with five cold/warm repetitions per texture. Physical optical programs,
terrain and animation are intentionally disabled in this texture diagnostic;
physical frame-performance acceptance remains separate.

## Source and stage identity

The isolated merge commit is `476bc66d60ac849df4fbfcd28bb02a7d87770b97`.
Its tracked tree is identical to parent commit
`833a40f8d3602ae2a084bae8a9ff4283abb80297`: both resolve to tree
`690b04c05e6998f9c102ce9a034dd804568e1bf3`. Merge conflicts in the renderer status
copy and advanced-material evidence were resolved to the parent's already
integrated files, and the complete tracked-tree comparison was empty.

The stage is `build/rendering-qualification-20260914/stage-native-parallel-476bc66`,
release ID `native-parallel-combined-476bc66`, release-manifest SHA-256
`6e32111a9b6a2598e71e638257775c6675119cb5dda833bb1ca3b917e5b033bc`.
The release validator passed. The four numerical field payloads and their metadata
passed the physical-asset validator against the combined source; regeneration was
not needed. All four retained payload identities are unchanged:

| Payload | SHA-256 |
|---|---|
| Earth incident | `4762cc9e49c98c292b412555c75867fce235aaa5f8f8165c78fd593020f06639` |
| Mars incident | `bd22c2568cac1dfcc970501e7c92af734eb089c6a9b52700cc70de46b1d31311` |
| Earth columns | `85605fa0d75feb5186e5b812054bef730726668c3690a2b0cecc592dd50c4893` |
| Mars columns | `12ca78aa470ecb4191c450fa3c1981a48a0f9a049be628473929dfd2f7d8d895` |

The existing staged WASM inputs were reused byte-for-byte. Native and software
replays share the exact stage, browser version, profiler, telemetry module,
Windows collector, asset hashes, source dimensions and color/upload implementation.
The comparator validates all of those identities before producing 48 source/cache
groups. It cannot compare this stage to the historical baseline as though only a
single variable changed: the combined stage also includes other qualified
rendering changes.

## Actual execution and startup

Runs were serialized under the shared GPU slot on 2026-09-14 UTC. The parent
completed and closed its preceding GPU run before granting the slot and suspended
heavy test execution during these timed gates. Other desktop activity and total
host CPU idleness were not measured. No settings, drivers, power policy or
dependencies were changed.

| Observation | Native device | SwiftShader |
|---|---:|---:|
| Chrome version | 151.0.7922.174 | 151.0.7922.174 |
| Renderer | Qualcomm Adreno X1-85, ANGLE D3D11 | ANGLE Vulkan SwiftShader |
| Native driver | 31.0.152.1 | Not applicable |
| `MAX_TEXTURE_SIZE` | 16384 | 8192 |
| `KHR_parallel_shader_compile` | Present | Absent |
| Original startup deadline | 30000 ms | 30000 ms |
| Actual base readiness wait | **5083 ms** | **459 ms** |
| Overall replay | Passed | Passed |
| Source samples | 240 / 240 | 240 / 240 |
| Filter/alpha/palette/resize/error controls | 9 / 9 | 9 / 9 |
| Available nondisjoint driver timers | 240 / 240 | 240 / 240 |
| Memory checkpoints | 7 | 7 |

The native run lasted from 03:42:40.463 to 03:44:25.435 UTC; software from
03:45:07.217 to 03:45:54.970 UTC. Both exited 0. Startup required ready base
programs, not merely nine ephemeris rows. Each cache snapshot records base `ready`
and physical `deferred`; six base program diagnostics are ready with no error.

Native startup recorded 315 `COMPLETION_STATUS_KHR` polls, each at most 0.1 ms
and 3.1 ms summed API wall time. The 12 compile-status reads were at most 0.4 ms
(1.6 ms total). All six final `LINK_STATUS` reads reported 0.0 ms at the browser's
measurement resolution. That means below the reported timing resolution, not
zero driver work. The former 26,343.4 ms eager physical-program link-status wait
does not occur in this base startup because that program is now demand-driven.
The six no-extension link-status reads took at most 0.2 ms in SwiftShader, while
compile-status reads took at most 7.0 ms.

The [historical native baseline](NATIVE_TEXTURE_QUALIFICATION.md) remains a failed
30-second startup receipt. This follow-up demonstrates successful base startup
on the new combined stage; it does not rewrite the failed receipt, measure a
single-variable speedup, or qualify first physical focus/animation performance.

## Repeated texture and cache observations

Every original source grid was preserved, including the 5400-by-2700 Earth day
reference. All 120 cold-browser-cache responses in each run transferred bytes;
all 120 warm-browser-cache responses had zero transfer size and a nonzero encoded
body size. These labels concern browser HTTP cache, not OS/driver/compiler caches.

The following Earth day reference values are median [minimum, maximum] in ms,
five samples in each cell. Complete results for all 48 source/cache groups are
in the bound comparison receipt.

| Metric | Native cold | Native warm | Software cold | Software warm |
|---|---:|---:|---:|---:|
| Decode API | 28.4 [25.7, 29.6] | 25.5 [24.5, 26.5] | 28.5 [27.4, 28.6] | 27.8 [25.5, 28.1] |
| Upload API | 73.0 [65.7, 81.4] | 68.5 [64.8, 75.5] | 67.7 [65.8, 80.3] | 66.6 [64.8, 74.8] |
| Post-upload fence completion wall wait | 271.8 [252.3, 279.1] | 262.1 [168.0, 271.1] | 33.5 [33.0, 39.5] | 35.4 [32.9, 36.2] |
| Driver timer around `makeTexture` | 1.308 [1.307, 1.313] | 1.318 [1.307, 2.107] | 31.317 [31.009, 35.360] | 32.066 [31.000, 35.373] |

Native fence completion remains much longer than its driver timer interval.
Scheduling, submission and completion observation are distinct from the timed
driver interval; these measurements must not be added or relabelled as isolated
GPU upload execution time. Five sequential observations establish comparative
medians and observed ranges, not stable tail latency or fleet guarantees.

Both actual cache tours passed all 14 snapshots. Earth first demand and warm
reentry each had five live mapped handles and five cumulative uploads. The tour
finished with 21 uploads, 13 deleted handles and eight live handles; peak live
mapped handles was eight. There was no new mapped upload on ready-cache reentry,
no unavailable mapped image, and no page or observed GL error. The logical
RGBA8-plus-mips payload estimate is 143,324,608 bytes at Earth first demand and
157,282,468 bytes at the end; neither is measured VRAM.

## Measured process memory

The Windows collector matched the owned native CDP GPU PID 71000 throughout all
seven checkpoints. Its WDDM shared-usage and process-private byte observations
were independently time-stamped. SwiftShader's CDP GPU PID was 41228, with valid
process-private observations but no matching WDDM GPU-process counter instances;
its shared/dedicated values remain unavailable rather than zero.

| Checkpoint | Native GPU-process shared usage, bytes | Native GPU-process private bytes | SwiftShader GPU-process private bytes |
|---|---:|---:|---:|
| Replay context ready | 30,949,376 | 91,119,616 | 156,463,104 |
| Replay complete | 28,925,952 | 202,846,208 | 150,110,208 |
| Earth first demand | 288,669,696 | 441,131,008 | 413,188,096 |
| Left System; cache retained | 292,638,720 | 429,965,312 | 416,743,424 |
| Earth warm reentry | 303,943,680 | 423,526,400 | 422,834,176 |
| Tour complete | 331,563,008 | 632,410,112 | 422,105,088 |
| Application page closed | 91,115,520 | 631,029,760 | 231,776,256 |

Native dedicated usage reported zero at all seven samples. CDP page-JavaScript
heap was measured separately: native Earth first demand used 24,356,852 bytes;
tour completion used 18,366,392 bytes. Those heap values exclude decoded image
pixels, workers, GPU resources and total process memory. Closing the application
page reduced native WDDM shared usage while the process-private allocation stayed
high; this is process telemetry and cannot attribute individual textures or
establish physical residency. Other browser contexts and allocator retention are
part of the process-level measurement.

No allocation failure or memory-pressure failure was demonstrated. The native
compressed-format extensions remain capabilities, not qualified derivatives.
There is no measured format candidate, image-error/color/mip contract or
texture-attributable memory benefit that warrants changing source assets. Revisit
derived formats only with reproducible resource pressure or a measured candidate
benefit and the complete capability fallback, source/derivative identity,
color/alpha/mip, image-error and lifecycle qualification.

## Reproduction and immutable receipts

`WEB_ROOT` denotes the stage path above. Both commands use the same existing
Node 22 executable and Chrome installation; no tools are installed by the replay.

```text
node tools/texture_pipeline_validation.mjs --web-root=WEB_ROOT --out=build/rendering-qualification-20260914/texture-parallel-native-476bc66-a --gpu=native --iterations=5 --memory
node tools/texture_pipeline_validation.mjs --web-root=WEB_ROOT --out=build/rendering-qualification-20260914/texture-parallel-software-476bc66-a --gpu=software --iterations=5 --memory
node tools/compare_texture_qualification.mjs --native=build/rendering-qualification-20260914/texture-parallel-native-476bc66-a/evidence.json --software=build/rendering-qualification-20260914/texture-parallel-software-476bc66-a/evidence.json --out=build/rendering-qualification-20260914/texture-parallel-comparison-476bc66-a.json
```

Those output paths are occupied immutable receipts; choose new paths for another
attempt. The comparator passed all 48 groups. Artifact paths below are relative
to the isolated worktree's `build/rendering-qualification-20260914`.

| Artifact | SHA-256 |
|---|---|
| `stage-preparation-476bc66.json` | `5c149b1a8fb13e69e18109bf239b6d7139b209478189c0440c0098c7d49f06f9` |
| `texture-parallel-native-476bc66-a/evidence.json` | `a5595324851e426bfcf65ad586da439549e46080c66cdeae4536e50745df252c` |
| `texture-parallel-software-476bc66-a/evidence.json` | `33f4fda7321aefc54d62910b8d3774c418e1c2def133c68c9ccf92c358f78992` |
| `texture-parallel-comparison-476bc66-a.json` | `6b13eccb6960cb7d1247f6e2442270440c4ac9ee3a2d60f60e8edade4c25d442` |
| `browser-closure-476bc66.json` | `95585f53a3687c988ed0ab4ebbb45df02cc7a0cce931431a985b4d637c1fa0b3` |

The profiler SHA-256 is
`f9b8d596beb781fbcff505745be421392b2d90b3ce34ab0c96aecc6ecaabf475`;
telemetry module
`bd5873ad316fa415505db4ef48d9335952fd80ef8b0629c37e22fd2bc326193f`;
Windows collector
`d642a461d267050b77ed03d0b73304e85d945944936d000ec43ddfdef6aa21e6`.
Each raw receipt also binds the staged renderer, uploader, visual inventory and
request policy. The comparison binds its own comparator and input receipt hashes.
All 18 distinct observed owned-browser
PIDs were verified absent after completion, and the GPU slot was released before
offline analysis. No background collector remains owned by this replay.

This follow-up changes documentation only. It does not modify the staged release,
runtime, numerical payloads, original failed evidence or installed environment.
Physical focus/animation deadlines, other adapters, repeated startup distributions,
hosted CI and deployed behavior are outside this replay's qualification.
