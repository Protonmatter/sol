# Scattering application consumption receipts

These runs establish the stated application draw, lifecycle and visual gates for
one immutable candidate. They do not establish final numerical accuracy, GPU
texture residency, absolute radiometry or release approval. The later corrected
integrator, Earth grid and Mars interpolation sources require fresh qualification.
HDR remains opt-in.

## Immutable input and tools

The application stage is `build/scattering-runtime-2ba2911-full` in the review
checkout, release `scattering-runtime-2ba2911-full`, source revision
`2ba2911be8385074123c66c9f176ac2b2da3b717`. Its manifest SHA-256 is
`4459d0979ae4059e2bbb494ef195d82b1ac29577b848cc782bdaf7d449925bd7`.
All 205 staged asset hashes were checked after both qualified runs and remained
unchanged. Source byte forms also matched the manifest's source hashes.

The qualification checkout is `sol-color-hdr-20260914`. Native validation used
its frozen `build/source-2ba2911-probe-99da7b4-bytes` snapshot, with probe commit
`99da7b4f66c790e3632507d92085b2f41bfc1fcb`. SwiftShader used a separate frozen
`build/source-2ba2911-probe-3607e0f` snapshot, adding the held-generator control
from `3607e0f7fe3939f4dacda8b21ab961d73bef2d31`. The seven executed validation
tool hashes matched each run's receipt and its before/after integrity audit.
Neither runtime source nor running tool files were edited during either run.

Node was 22.23.2 and Chrome was 151.0.7922.174. The actual application context
reported Qualcomm Adreno X1-85 through ANGLE Direct3D11 in the native run and
SwiftShader through ANGLE Vulkan in the software run. Launch flags alone were
not used to establish the backend. GPU use was serialized and other agents held
heavy CPU work during the original timing windows. Owned browsers were closed
before releasing the GPU slot.

From the corresponding frozen validator snapshot, both qualified runs used:

```powershell
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
& $Node22 tools/browser_validation.mjs --web-root=$ImmutableStage --backend=native --hdr-candidate=true --physical-spin=true --output-dir=$NewNativeReceipt
& $Node22 tools/browser_validation.mjs --web-root=$ImmutableStage --backend=swiftshader --hdr-candidate=true --physical-spin=true --output-dir=$NewSoftwareReceipt
```

Each output directory must be new. `$Node22` names the existing pinned Node
22.23.2 executable; `$ImmutableStage` names the verified stage above. The native
and software commands were separate serialized runs, with the respective tool
snapshots identified above.

## Observed original and physical draw gates

| Observation | Native | SwiftShader |
| --- | ---: | ---: |
| Full application and original visual gate result | Passed | Passed |
| Original accepted Earth final draws | 4 | 4 |
| Last original accepted draw, elapsed ms | 68.5 | 1,032.2 |
| Frozen-transform control rejected | Yes | Yes |
| Held HDR presentation draws / accepted finals | 236 / 0 | 17 / 0 |
| First observed physical readiness from System entry, ms | 36,641.3 | 46,588.2 |
| Additive physical/current-producer/HDR final draws | 4 | 4 |
| Last additive accepted draw, elapsed ms | 97.4 | 1,186.2 |
| Additive collector completion, ms | 98.8 | 1,188.6 |
| Additive physical/program/presentation mismatches | 0 | 0 |
| Additive late readbacks or expired accepted draws | 0 | 0 |

The required original three final Earth draws in five seconds was unchanged.
Physical preparation stayed within the original absolute 75-second System
budget, and all nine programs were ready without extending the shader owner's
30-second request deadline. Readiness latency is the first observed admitted
physical draw; it is not an isolated shader-compiler benchmark.

Every additive accepted sample contains observed exact consumer/generator source,
actual model/normal and camera/Sun geometry, immutable column/incident uploads,
the separately uploaded 3 m Earth datum, both current RGBA32F producer passes,
and the matching HDR final color-writing draw. These are observed submissions;
the timings are not a monitor-refresh or full-field GPU completion measurement.
The surface-side inactive limb uniforms are not required, while both producer
dimensions and storage identities must match the admitted source plan.

Both runs also passed the original Sun color, blue Earth, orbit round-trip,
Io transit, no-transit, eclipse and eclipse-control checks. Sun G/R was 0.991 and
B/R was 0.976. Blue Earth pixels were 3,081 native and 7,307 software; orbit mean
delta was zero. Browser-only execution coverage was 86.64% lines / 74.96%
branches / 81.93% functions native, and 86.45% / 74.97% / 81.45% software. These
are browser-only observations, not the merged repository coverage gate.

## Actual held-generator control and recovery

The software run held 70 full generator triangles only after both immutable
source and actual current program matched. There were zero current-program
mismatches. Normal target clears, bindings and status updates continued. The
physical gate accepted zero samples and rejected 30 candidates because the
actual bound field lacked a current observed producer draw.

The original five-second collector's timer returned after 5,183.7 ms; 40 draws
after its admission deadline were rejected. There were no late readbacks or late
accepted samples. After restoring the original native methods, five fresh
physical/HDR finals were accepted by 1,575.4 ms, with collector completion at
1,577.1 ms. Control plus recovery completed at System +58,401.9 ms, within 75 s.

The positive sample before the control and first recovered sample have the same
context generation 1, generator linked sequence 11, consumer sequence 9, surface
storage sequence 1, limb storage sequence 2 and immutable column upload sequence
25. Their scene serial advances from 165 to 208, and their two observed producer
draw sequences advance from 25/26 to 41/42. Each HDR presentation has the matching
current serial and epoch. This proves recovery refreshed the current field
evidence within the same allocation lifetime. The native run predates this new
negative control; its final-source replay must include it.

## Retained receipts and earlier attempts

Paths below are relative to the qualification checkout:

- `coverage/scattering-runtime-2ba2911-native-hdr-99da7b4/`: qualified native
  `browser-evidence.json`, original spin, physical readiness/spin, visual images
  and `integrity-audit.json`.
- `coverage/scattering-runtime-2ba2911-swiftshader-hdr-3607e0f/`: qualified
  software equivalents plus `earth-held-scattering-producer.json` and
  `earth-scattering-recovery.json` under `visual/`.
- `coverage/scattering-runtime-2ba2911-probe-99da7b4-after-native.json` and
  `coverage/scattering-runtime-2ba2911-probe-3607e0f-after-swiftshader.json`:
  concise extracted timings, identities, receipt digests and hash audits.
- `coverage/scattering-runtime-2ba2911-native-99da7b4.log`: pre-browser setup
  failure when three Git archive source byte forms differed from the manifest.
  A new snapshot used only exact source bytes matching those existing hashes.
- `coverage/scattering-runtime-2ba2911-native-99da7b4-bytes/`: successful default
  SDR application baseline. Its launch omitted the HDR/physical options; the
  retained `scope-audit.json` explicitly excludes additive physical/HDR claims.

The earlier software failure in the review checkout at
`build/pr107-production-20260914/runtime-2ba2911-swiftshader/` is unchanged. It
retained four original final draws but rejected 91 physical candidates because
the first probe required an optimized-out limb-size uniform. That result is a
probe defect, not a passed physical gate. Earlier native 30-second completion
failures for the reference full-integrator surface shader are also retained.

## Remaining qualification

Final corrected scientific source requires new immutable native and software
application runs, the actual level-4 Mars optical/terrain/animation gate, current
color/HDR pixel fixtures, complete numerical domains and hosted checks. The
latest actual native physical memory requirement is still pending: the earlier
texture tour disabled optics/terrain/animation, and logical target byte counts
cannot establish OS process or WDDM memory use.

The memory follow-up will use only the existing validation-side
`captureDeviceMemory` and `texture_device_memory.ps1` collector with exclusively
owned Chromium PIDs obtained from the launched browser's CDP session. It will
take a separate final-stage run's baseline, full Earth/Mars feature, restoration
and cleanup checkpoints outside all original timing windows. Private bytes,
working sets, JS heap and shared/dedicated/committed WDDM counters must remain
separate. Missing counters mean unavailable, and none of these counters is
attributable texture VRAM or a per-allocation physical-residency measurement.
