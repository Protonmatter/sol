# Native texture and memory qualification

Status: native source replay and diagnostic cache/memory observations completed;
native application startup gate **failed**. SwiftShader comparison passed.
Recorded 2026-09-14 UTC in an isolated checkout based on `34937f1`.

## Result and scope

The actual Windows device is a Qualcomm Adreno X1-85 using driver `31.0.152.1`.
Chrome `151.0.7922.174` reports ANGLE/Direct3D11 and `MAX_TEXTURE_SIZE=16384` for the
native run. The matched software run reports ANGLE/SwiftShader and limit 8192.
Both upload all 24 original source grids without resizing and report a timer-query
extension. The native renderer reports `KHR_parallel_shader_compile` (the software
renderer does not) and BPTC, RGTC, S3TC and S3TC-sRGB compressed texture capabilities.
Capability exposure alone does not qualify any derivative or asynchronous
compilation implementation.

The matched receipts each retain **240 successful source samples**: five
sequential cold/warm browser-cache pairs per source. Each passes all nine
filter/alpha/palette/resize/error controls. All 120 cold responses in each run
report nonzero HTTP transfer sizes; all 120 warm responses report zero transfer
size with a nonzero encoded body size. This concerns browser HTTP cache only.
Neither run clears the OS filesystem cache, decoder code or driver state.

The native receipt is **failed overall** because the existing 30-second
application startup wait timed out at 30,017 ms. A separately labelled diagnostic
continuation then completed the 14-snapshot mapped-image cache tour. It does not
replace or pass the failed startup gate. The matched SwiftShader startup wait
completed in 2,417 ms and its whole diagnostic passed. The application engine
deadline and the original three-final-draws-in-five-seconds performance contract
were not changed, and the latter was not exercised by this texture diagnostic.

Both completed tours retain five mapped handles at first Earth demand and warm
reentry, with no additional mapped upload on reentry. Both finish with 21 mapped
uploads, 13 deleted handles and eight live handles; peak live mapped handles is
eight. Neither reports a page or observed GL error. Terrain, optical transfer
and animation are disabled before entering System for this diagnostic. The
renderer still eagerly compiles its complete initial program set.

## Native startup finding

`apps/web/js/orrery.js::initGL` synchronously constructs eight programs.
The instrumented native `getProgramParameter(program, LINK_STATUS)` waits are:

| Program in the pinned `initGL` construction order | Native wall time | SwiftShader wall time |
|---|---:|---:|
| `P.sphere`, the base material | 4,654.2 ms | 0.7 ms |
| `P.physicalSphere`, the physical material | 26,343.4 ms | 0.7 ms |
| `P.atmosphere` | 1,828.5 ms | 0.3 ms |

The receipt retains every compile/status/link call and its epoch timestamp.
These are blocking API observations, including compiler/driver work; they are not
isolated compiler CPU-cycle measurements. Program attribution follows the exact
manifest-bound `initGL` order, with the eight `LINK_STATUS` calls independently
countable in the ledger.

This is a **P1 native startup reliability/performance finding** at
`orrery.js::program` / `initGL`: unconditional synchronous link-status queries
block the main thread long enough to fail the existing local startup gate on
this host. The source data and texture cache are not the cause established by
this evidence. A bounded final-material representation and separately qualified
nonblocking program completion should be evaluated against the same native
startup deadline, cancellation/context-recovery tests and original draw deadline.
Moving the expensive shader into another eagerly blocked program would move the
delay without resolving the measured behavior.

The first native attempt `texture-native-repeat-a` also failed its startup wait.
Its later diagnostic already had nine bodies, no engine error and valid mapped
uploads, but its original instrumentation did not record compile/link intervals.
It remains a failed receipt. Attempt `b` adds the synchronous call ledger,
disables the already-declared diagnostic controls before entry and records a
bounded diagnostic continuation. Tests ensure this continuation cannot change a
failed original gate into success. No application or staged file was changed.

## Repeated phase timings

The 5400-by-2700 Earth land source is the largest retained image. Values below
are **median [minimum, maximum] in milliseconds**, with five observations in each
cell. The offline comparison retains separate distributions for every one of the
48 source/cache-phase groups; no mean mixes unlike source dimensions.

| Boundary | Native cold | Native warm | SwiftShader cold | SwiftShader warm |
|---|---:|---:|---:|---:|
| Blob `Image.decode()` | 29.2 [28.9, 30.7] | 27.4 [25.7, 30.5] | 28.2 [25.8, 29.3] | 26.3 [25.5, 28.1] |
| `texImage2D` CPU call | 78.8 [74.8, 96.7] | 76.7 [72.7, 78.5] | 68.5 [66.3, 83.8] | 67.1 [65.8, 71.5] |
| Complete `makeTexture` driver query | 1.308 [1.307, 2.008] | 1.308 [1.307, 1.308] | 32.701 [30.992, 34.425] | 31.584 [31.269, 34.692] |
| Fence completion observation | 259.7 [256.5, 277.2] | 266.1 [260.8, 276.7] | 35.3 [33.8, 36.4] | 35.2 [34.5, 39.7] |
| First-sampling readback completion | 1.3 [0.9, 9.0] | 1.1 [1.0, 1.2] | 1.0 [0.5, 27.0] | 0.6 [0.5, 2.7] |

The mip-generation CPU-call median is 0.0 ms in all four cells. This is the
browser timer's unresolved call duration, not a claim that mip construction is
free. Every sample has a signaled completion fence and an available non-disjoint
driver timer. The driver timer brackets the complete uploader, including its
error query, and is not directly comparable to a whole-frame GPU timer.

The large native fence-observation delay coexists with the much smaller driver
query and first-sampling durations. The receipt records the polling counts as
well as elapsed time; this observation does not establish 266 ms of native GPU
execution or a texture-bandwidth bottleneck. These boundaries include different
scheduling and synchronization effects and must not be added together.

Five samples reveal useful spread and first-use outliers. They do not establish
stable tail latency, a cross-device performance guarantee or a general native
speedup. Native then software ran serially, with no cooperating GPU work or
heavy CPU suites. Light source/document work and focused tests continued;
background host load, power/thermal state and host idleness were not measured.
Drivers, graphics settings and power policy were not modified.

## Actual memory observations

The optional `--memory` collector identifies process IDs through the exclusively
launched browser's [CDP `SystemInfo.getProcessInfo`](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/#method-getProcessInfo).
It reads Windows process private bytes/working sets and the `GPU Process Memory`
shared, dedicated and total-committed counters only for those IDs. PID, adapter
instance, counter status and timestamp remain in the receipt. It emits no process
arguments, environment values, machine name, credentials or user-page content.
Each collector invocation is bounded to 15 seconds and starts outside individual
source timing samples. The observed checkpoint collections take about 1.4 to
1.6 seconds, with process and GPU counter observations separately timestamped;
they are not instantaneous or continuous peak-memory measurements.

The following are actual **native GPU-process** counter observations in bytes:

| Checkpoint | Shared Usage | Dedicated Usage | Total Committed | GPU process private bytes |
|---|---:|---:|---:|---:|
| Replay context ready | 54,853,632 | 0 | 55,443,456 | 89,632,768 |
| Replay complete, replay textures deleted | 29,057,024 | 0 | 29,626,368 | 123,260,928 |
| Earth first demand ready | 255,729,664 | 0 | 257,769,472 | 412,692,480 |
| Left System, ready cache retained | 276,242,432 | 0 | 278,147,072 | 409,550,848 |
| Earth warm reentry | 287,506,432 | 0 | 289,411,072 | 410,587,136 |
| Body tour complete | 278,876,160 | 0 | 280,743,936 | 553,078,784 |
| Application page closed | 63,741,952 | 0 | 64,311,296 | 553,250,816 |

These counters account for the GPU process's graphics work, including resources
other than mapped textures. Shared graphics resources can appear in more than
one process. Microsoft describes those attribution limits in
[GPUs in Task Manager](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/).
Committed bytes, working sets, private bytes and graphics usage have different
accounting semantics. Do not add these columns together or rename their values
as exact texture VRAM. Zero dedicated usage on this observation does not mean
zero GPU memory consumption.

For the native tour-end checkpoint, the observed sum of owned-process private
bytes is 932,986,880, and the page's CDP JavaScript heap used value is 13,065,280.
The corresponding submitted mapped RGBA8/mip payload estimate is 157,282,468.
The three numbers measure different things. Decoder intermediates, image pixel
storage, scene resources, browser caches and allocator retention are not isolated
by this experiment. In particular, deleting texture handles or closing the page
does not promise immediate private-memory reclamation.

The SwiftShader receipt has all seven process-memory checkpoints, including
443,228,160 GPU-process private bytes and 851,767,296 total owned-process private
bytes at tour end. **No Windows GPU Process Memory instance was available for
that SwiftShader process.** Its shared/dedicated/committed GPU-counter values are
unavailable, not zero. JS heap is separately recorded for each live page. No
measurement here establishes memory pressure, a memory leak, a process memory
budget or a texture-attributable VRAM saving.

## Derived-format decision

Keep the current registered JPEG/PNG sources and RGBA8 upload path. No derivative
was implemented or admitted. The observed native startup blocker is synchronous
shader linking, and no memory-pressure or compared-format benefit was measured.
The native compressed-format extensions only establish capability. The repository
has no admitted compressed-source derivation contract, and no existing `toktx`,
`basisu`, `compressonatorcli` or `texconv` command was found on this host's PATH.
No tool or dependency was installed.

Revisit a derived format when a reproducible target workload demonstrates an
upload/decode or graphics-memory constraint after the startup blocker is handled.
Use the same manifest/source identities, original grids, backend, cache phases
and workload for baseline/candidate comparisons. Admission then requires a
deterministic existing or separately authorized encoder; source/output hashes;
declared color transfer, alpha/no-data and per-mip filtering semantics; quantified
covered-color/gray/mip error; exact scientific palettes; format capability and
bounded fallback; and context-loss, cancellation, retry and cache-lifecycle tests.
Reduced encoded size alone is insufficient. A candidate must improve the measured
constraining phase without weakening the existing appearance or accuracy contract.

## Reproduction and retained identities

From this isolated checkout, use its existing Node 22 runtime and dependencies.
`WEB_ROOT` below denotes the unchanged absolute `build/pr107-review-p2-final`
stage in the main review checkout. Each output directory must be new.

```powershell
node --check tools/texture_pipeline_validation.mjs
node --experimental-vm-modules --test tests/web/texturePipelineValidation.test.mjs tests/web/textureDeviceTelemetry.test.mjs tests/web/textureQualificationComparison.test.mjs tests/web/referenceDemand.test.mjs tests/web/planetAppearanceRuntime.test.mjs
node tools/texture_pipeline_validation.mjs --web-root=WEB_ROOT --out=build/rendering-qualification-20260914/texture-native-repeat-b --gpu=native --iterations=5 --memory
node tools/texture_pipeline_validation.mjs --web-root=WEB_ROOT --out=build/rendering-qualification-20260914/texture-software-repeat-b --gpu=software --iterations=5 --memory
node tools/compare_texture_qualification.mjs --native=build/rendering-qualification-20260914/texture-native-repeat-b/evidence.json --software=build/rendering-qualification-20260914/texture-software-repeat-b/evidence.json --out=build/rendering-qualification-20260914/texture-backend-comparison-c.json
```

The native command returns exit 1 for its retained startup failure even though
the diagnostic cache continuation completes. The software command returns 0.
The offline comparator validates every source, phase, repetition, original grid,
filter control and common stage/tool/browser identity. It refuses duplicate,
partial or drifted measurements and preserves each overall run status. It returns
0 when comparison is valid; that is not a native startup or release pass.

Receipts live under this worktree's ignored `build/rendering-qualification-20260914`:

| Artifact | SHA-256 |
|---|---|
| `texture-native-repeat-a/evidence.json` (failed startup; earlier harness) | `0ebcbf6006b0ac545661cbdad7b496ac3912852ddfc429ff170ff339ee2036e0` |
| `texture-native-repeat-b/evidence.json` (failed startup; full diagnostic) | `ff10fd9c21e2b28a0cd408011bc822c3d96cea3529028610e7f6efbc8fd164dc` |
| `texture-software-repeat-b/evidence.json` (passed) | `4184dd31d38063860a317ed551f01f05baf4b3c0d16904614929fa6a259250a2` |
| `texture-backend-comparison-b.json` | `a56eab013bb99223bfe5ab3f6e15b44af234964d1eab5733e49d0860b6f8f558` |
| `texture-backend-comparison-c.json` (current comparator, additionally binds its own hash and memory mode) | `5f6b1472cedb8484ee53c8f0955f1b932ce02f7d65a1aefb9a9a8fd905c02a82` |

The paired profiler SHA-256 is
`73808382272611aa679fde0d772590a65de94c7de5e1ec968b2350ffcde2d280`;
telemetry module is
`bd5873ad316fa415505db4ef48d9335952fd80ef8b0629c37e22fd2bc326193f`;
Windows collector is
`d642a461d267050b77ed03d0b73304e85d945944936d000ec43ddfdef6aa21e6`.
The common release manifest hash remains
`1ffe4d1b5e3b2c6fb7626a9d4ea76fb2ae2aaf4baac864afc427660e0b2113ac`,
renderer hash
`37cc7831751bd3dae032e1569a299c5fb2e1a6cffb50bf3093e9d927a2f77817`
and uploader hash
`f024387d47163064c23c3dd7dfadfb99e5b29f49606690f665ada4336a128add`.

After the three runs, all 26 distinct PIDs recorded by their owned-browser CDP
sessions were verified absent. No browser or background collector remains owned
by this work. The changes are qualification tools, tests and documentation only;
reverting them restores the prior harness without changing the application,
source assets, graphics settings, installed tooling or staged release.

Focused validation passes all 46 tests across the five command-listed test files,
including timeout continuation, cache lifecycle, receipt drift/duplication and
unavailable memory cases. All three JavaScript tools pass Node syntax checks.
The collector passes PowerShell parser validation and executed on Windows
PowerShell 5.1 during the real runs. The documentation and SDLC validators pass.
PSScriptAnalyzer was not installed, so no analyzer result is claimed. The full
web/Python suites, hosted CI, whole-application terrain/optics/animation workload,
other native adapters and deployed behavior were not requalified by this slice.
