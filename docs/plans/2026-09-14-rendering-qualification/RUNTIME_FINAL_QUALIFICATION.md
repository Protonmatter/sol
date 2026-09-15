# Final rendering runtime qualification

All eight source-bound local capture gates passed.

Production revision: `daa1fbec5f6f13333731b0b279fd085926a483ff`.
Release: `pr107-shadow-20260914`; manifest SHA-256 `66bed0d35d930ba834017b6f948aada05c70b47767ab394130d310f54928adf4`.
Corrected Mars validator revision: `7b588c18bdf4a7118e9c9a9c57fcefad2b25ff01`. The `apps/web` diff from the production revision is empty.

The first six passes used the original frozen raw checkout. The Mars runs used a new auditable overlay of seven exact committed validator/test/document files; all production and other execution dependencies stayed byte-identical. Original snapshots and all failed attempts remain preserved.

## Capture results

| Gate | Result | Observed final-frame timing |
|---|---|---|
| earth-native | Complete original application gates | 5 physical final frames in 135.5 ms |
| earth-swiftshader | Complete original application gates | 5 physical final frames in 1623.4 ms |
| material-native | 266/266 checks; reference=fixed-domain | — |
| material-swiftshader | 266/266 checks; reference=uniform | — |
| appearance | 110/110 checks | — |
| hdr | 66/66 checks | — |
| mars-native | 22/22 checks | 5 physical final frames in 131.8 ms |
| mars-swiftshader | 22/22 checks | 5 physical final frames in 1577.8 ms |

## Original timing, physical readiness and controls

| Backend | Original Earth final frames | First actual physical-ready from System entry | Held producer control |
|---|---|---|---|
| earth-native | 4 in 86.0 ms | 22072.8 ms | 446 held calls, 217 rejected / 0 accepted |
| earth-swiftshader | 4 in 981.1 ms | 46151.9 ms | 80 held calls, 34 rejected / 0 accepted |

The original Earth minimum remains three final draws in five seconds. Additional physical draws require current physical shader source, source-bound numeric fields, same-frame producer passes, current camera/Sun/endpoint geometry and matching final HDR presentation. Frozen-motion and held-presentation controls remain active. Both held-producer runs recovered valid physical final frames after release.

Mars also requires actual level-4 source geometry: 131,841 vertices and 783,360 indices, source-derived full buffer hashes, numeric height texture identity, terrain/shadow uniforms and the current physical/HDR draw join. Both backends accepted five frames with zero physical, terrain or presentation mismatches and zero late readbacks.

| Mars backend | Native context event | Terrain/optics actually ready from request |
|---|---:|---:|
| mars-native | 29.6 ms | 387.7 ms |
| mars-swiftshader | 72.5 ms | 13630.9 ms |

The existing 40-second startup, 10-second native restoration event, 40-second restoration readiness from request and 240-second absolute original Mars run limits remain unchanged.

## Native memory checkpoints

Every checkpoint began after that run's original gates completed. Active and restored checkpoints additionally required actual physical/HDR draw evidence, Mars terrain evidence where applicable, and fresh registered imagery readiness before and after sampling.

| Run / checkpoint | Owned process private bytes | GPU process private bytes | WDDM shared usage | WDDM total committed |
|---|---:|---:|---:|---:|
| earth-native / original-gates-complete | 1,070,710,784 | 513,748,992 | 308,273,152 | 326,152,192 |
| earth-native / full-features-active | 1,420,058,624 | 700,080,128 | 471,040,000 | 488,919,040 |
| earth-native / full-features-context-restored | 1,406,754,816 | 682,795,008 | 411,668,480 | 413,548,544 |
| earth-native / system-exited | 1,259,065,344 | 615,075,840 | 450,514,944 | 452,395,008 |
| earth-native / application-page-closed | 773,955,584 | 609,632,256 | 126,550,016 | 127,123,456 |
| mars-native / original-gates-complete | 1,276,567,552 | 755,920,896 | 563,318,784 | 565,215,232 |
| mars-native / full-features-active | 1,339,117,568 | 751,128,576 | 486,653,952 | 488,550,400 |
| mars-native / full-features-context-restored | 1,320,394,752 | 641,503,232 | 324,415,488 | 326,295,552 |
| mars-native / system-exited | 1,121,521,664 | 553,652,224 | 331,939,840 | 333,819,904 |
| mars-native / application-page-closed | 926,867,456 | 416,305,152 | 152,899,584 | 153,473,024 |

These measurements include the instrumented validator workload. They are OS process and WDDM observations, not per-texture VRAM or physical residency. Working-set sums can share pages. Committed bytes do not establish residency. Imagery cache readiness is separate from actual numeric texture/producer binding evidence.

## Source identity and retained failures

- Original execution identity: `0049c618efcddd2be36aedec4b8f1ac1ba3391d6f51acee70a0c16b39a7a8c9d`; 836 tracked files, 218 production files equal committed blobs, 205 stage assets and 185 source bindings.
- Corrected Mars execution identity: `23805fa00a74b4d4c4664b0f063cc08b58c25cace9a23f0e4ed7cfdd1414af7e`; 840 files including the seven documented committed overlays.
- Executed corrected validator: `1098304713a17829411209e047b8229cc90cd749a13658e26bd24a1f2588aa68`. Raw main CRLF hashes are separately recorded in the overlay lineage.
- All eight per-run before/after source, stage and browser audits passed. Evidence, execution receipts, command arguments, child environment, logs and raw file hashes are retained in the JSON companion.
- Retained setup failure: missing Windows browser discovery before launch; subsequent execution supplied a pinned `CHROME_BIN`.
- Retained original Mars failure: bootstrap rounded coordinates promoted at the same epoch after the invariant had been captured too early.
- Retained first corrected Mars failure: temporary source statuses were inspected before asynchronous base restoration completed. Thirteen earlier checks passed in that attempt.
- Validator corrections wait for completed entry and restored base readiness; terminal failures, exact paused-engine equality and original request-time deadlines are retained.

## Separate workspace illustrations

The normal 1440-pixel Earth globe and source-mode Sun workspace captures passed source/tool/browser audits and preserved the same epoch and physical body state across UI camera selections. The Sun's AIA 171 Å source date, assigned EUV color, modeled corona and unobserved hemisphere are disclosed. Screenshots use the default HDR-disabled UI; the candidate HDR runs above are separate. PNG artifacts remain outside the compact documentation record.

Screenshot receipt SHA-256: `78d0b1920e69554a98188211a09915ebfa5d5b53aa89927e06072e86d6f39053`.

## Limits of this record

- These are finite local current-host captures and source-bound program/field/draw observations; they do not establish published-head hosted CI or release deployment.
- Original Earth timing and additional physical timing are distinct; physical readiness has its own existing absolute System-entry bound.
- Native material reference fixes admitted mode/style constants; the separate SwiftShader run compares the uniform unspecialized bounded reference.
- Memory observations include the instrumented validation workload. OS process/WDDM counters are not attributable per-texture VRAM or physical residency; working sets may share pages and committed bytes are not residency.
- Registered imagery readiness brackets memory sampling; it is a source/cache workload assertion, separate from actual numeric field, producer and final-draw evidence.
- Single observed timings do not establish stable latency distributions or performance tails. Numerical tolerances, source/detail contracts and deadlines were not weakened.
- HDR remains an opt-in linear display composition candidate with fixed exposure and SDR output; no calibrated imagery, absolute radiometry or HDR-display calibration claim.
- Normal workspace screenshots use default HDR-disabled UI and source disclosures, separately from the opted-in HDR qualification runs.

Original immutable local capture JSON SHA-256: `6675f1fb0aa26c27cb50acee12de8d96fd3489891d8b33d4b1758fda16a21cab`.

Repository LF-normalized JSON copy SHA-256: `1ea5f9ae9bcec76366ccbab413d6af02df9546eab9b3fccdf1fc9f93837c8002`. Git's declared text policy converts CRLF to LF; the parsed record is identical. The original local capture and its referenced evidence remain unchanged.
