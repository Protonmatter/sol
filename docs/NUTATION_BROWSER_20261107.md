# ERFA browser and timing characterization - 2026-11-07

Status: private candidate browser checks pass; native timing passes; software
fallback timing fails. Main still uses four-term nutation. No production or
ERFA source/notice adoption acceptance is granted. Requirements:
`SOL-TEST-001`, `SOL-COV-001`, `SOL-VIS-001`, `SOL-UX-003`.

This follows the [source-delivery checks](NUTATION_DELIVERY_20261107.md) and
[numerical candidate](NUTATION_ERFA_CANDIDATE_20261107.md).

## Frozen artifact and browser results

The private v4 artifact is `local-erfa-delivery-20261107-04`, mounted at `/sol/`,
manifest SHA-256
`da783fc4b9e45a84dcf220b76720ecd2e4a6aaeef40125702a27ffa7e87ec9c1`.
All 253 assets/source bindings match the 1,791-file private source freeze.
The base commit label is not a clean-source identity. All 1,772 main source
files also remain equal through execution; these documentation edits follow
that freeze and have a separate snapshot.

The full existing browser suite passes sequentially in native Qualcomm D3D11,
normal SwiftShader fallback and legacy SwiftShader modes, using pinned
Chrome/156.0.8078.80. Each run retains seven touch cases/67 events, preserved
physical epochs/positions, empty runtime errors and completed worker/browser/
server cleanup. Exact completed profiles and matching Chrome processes are gone.

Combined Node/browser line coverage is 97.67 percent native and 97.66 percent in
each software mode, against the unchanged 90 percent floor and exact 130-module
runtime population. Browser-only coverage is 85.98 and 85.80 percent; combined
coverage reuses the hash-matched 1,930-test Node cohort. This is JavaScript,
not Rust/WASM instruction coverage. The bypassed service worker remains zero
in the merged denominator.

Approved Earth, Sun, materials, orbit and moon-shadow gates remain intact.
Native Sun checks cover 1K/2K/4K; software retains the declared 1K workload.
Sites Earth checks preserve 1.6 exposure, distinct live textures and cloud
control effects without changing epoch, positions or camera. This is automated
evidence, not new human appearance approval. Normal fallback records software
compositor/rasterization/Canvas2D features; legacy SwiftShader establishes its
software WebGL identity without independent whole-browser feature attestation.

## Twenty-visit timing campaigns

The original protocol is unchanged: exact browser/backend identity, 1440 by
900 viewport, page CPU slowdown four, native worker CPU, one shared 200,000
response-body-byte/second budget, 150 ms minimum latency, 4,096-byte burst,
10 ms tick, no compression and verified page/service-worker calibration.
Each campaign has ten cold and ten warm visits, six trusted tasks per visit
and all 120 raw feedback observations.

| Per-task p95, ms | Native cold | Native warm | Fallback cold | Fallback warm |
| --- | ---: | ---: | ---: | ---: |
| Research | 140.0 | 84.0 | 92.0 | 84.0 |
| Inspector | 163.6 | 184.0 | **231.5 failed** | **256.2 failed** |
| Timeline | 92.0 | 76.0 | 86.6 | 88.7 |
| Sky | 68.0 | 68.0 | 67.6 | 67.8 |
| System | 67.5 | 65.1 | 112.1 | 65.0 |
| Focus | 109.8 | 111.6 | **228.7 failed** | **244.0 failed** |
| Pooled | 140.0 | 152.7 | **223.6 failed** | **223.1 failed** |

Every task/group retains the 200 ms limit. At ten observations nearest-rank p95
selects the maximum. Fallback retains 16 over-limit samples: four in each
cold/warm Inspector and cold/warm Focus set. Native passes; fallback fails six
feedback gates. Independent recomputation reproduces all statistics and verdicts
using the original maximum of frame latency and correlated native next-render
duration plus its four-millisecond bound. No sample or gate is dropped.

Image LCP p75 is 2,080/292 ms cold/warm native and 2,076/304 ms fallback, with
canonical 1024 by 1024 JPEG identity. CLS passes. Campaign/run/context/cleanup
errors are empty, all 51 worker/service-worker targets per campaign are destroyed,
observation settles, and source/artifact postchecks pass. Raw ERR_ABORTED reports
remain: 124 native and 126 fallback. Their narrow complete/validated JSON-read
classification is independently reproduced, with zero unexpected failures;
one calibration favicon 404 remains recorded. This is not blanket network-clean
evidence. These feedback timings are separate from completed model readiness:
native accepted System readiness is about 26.87-38.97 seconds cold and
11.54-11.75 seconds warm under this paced workload.

## Separate rendering trace and remaining work

After the full campaigns and exact fallback owner closure, a separate one-pair
diagnostic traces Inspector and Focus with the original live clock. Capture
spans the original frame checkpoint and the correlated native event. It completes
with stable source/artifact identity but does not qualify performance.

The cold Inspector trace has a 209.1 ms frame bound, about 82.4 ms initial layout,
and the app's 120 ms resize callback beginning near 124 ms for another 27.1 ms.
The warm trace is faster, so no universal cause of the full failures is proved.
Focus traces include one active orrery ResizeObserver paint and GLES2 compositor
readback/command-buffer waits around 115 ms. Nested CPU-thread trace spans are
not additive GPU execution durations. Duplicate scene paints have not been
demonstrated. No image-quality, shader or CSS shortcut is adopted.

The next step is a narrow controlled layout/resize/presentation experiment that
preserves freshness, image publication, physical centers, visible controls and
render/pick pairing. Any correction needs the original full timing campaign.
The new failure is not proof that ERFA caused a regression. Earlier passing
stage05 fallback evidence and older whole-driver failures remain immutable.

Browser evidence is under `build/nu-browser-20261107-c039934c/`; full timing,
recomputations, owner checks and traces are under
`build/nu-timing-20261107-35348eb4/`. Main ERFA adoption, tighter/continuous
accuracy, software 200 ms qualification, whole-driver timing, physical/manual,
clean-source/hosted and release/deployment acceptance remain open. Illustrative
Earth stays unchanged. No product code, numerical data or binary changes here;
no commit, push, new dependency, external message, release or deployment.
The overall production-readiness goal remains active.
