# Bounded GPU draw-query control — 2026-11-04

The later [phase-ledger control](GPU_PHASE_LEDGER_20261104.md) obtains 113 usable
query envelopes in a separate animated replay. This page preserves the preceding
attempts, including the guarded timeout without an observation. The image-gate
precondition gap is now separately [corrected](RENDER_PAIR_STATE_20261104.md).

The [callsite capture](GL_CALLSITE_TIMING_20261104.md) identifies an entry error
check as the long CPU wait site, before the current scattering generator binds
or submits its passes. A separate private GPU-query replay is needed to measure
draws. The Windows preflight completes; the first Linux control fails in the
older frozen mobile fixture before obtaining any spin or GPU result. Its actual
packet is preserved and admitted. The distinct current-fixture Linux control
passes disclosure/Sun/Sky, then fails the original camera-image round-trip gate
before spin/GPU capture. That packet is also preserved and independently admitted.
A private failure-path replay is implemented and its guarded Linux control is
terminal: the original spin gate fails with one draw and the separate query
attempt expires without an observation. No usable Linux GPU timing or rendering
qualification exists yet.

Application, shader, field, coefficient, quality and original gate inputs remain
unchanged. The approved orbit precision target remains 1900–2200 with years
1–9999 approximate outside it. No model or accuracy tolerance changes in this
experiment. No commit, push, deployment, new dependency, cloud credential grant
or production setting change occurs.

## Instrument and evidence boundaries

Private tooling is retained under `build/gpu-pass-timing-20261104/`. The collector
derives from current `tools/frame_cost_diagnostic.mjs` (`9809fe16…`), returns
bounded linked shader text to Node, and hashes both vertex and fragment sources
after page return. Persisted results contain hashes and character counts, not
raw shader text. Source-pair identity is not a body, uniform, correct-content or
causal-speedup qualification.

The replay follows the unchanged original spin assertion, whose result is saved
first. It has a separate 25,000 ms outer budget including Node processing, at
most two heartbeat frames, 15,000 ms sampling, 3,000 ms drain, 160 draw records,
20 program/source versions and two 131,072-character sources per program. It
adds state reads and elapsed-time queries, so this is an instrumented replay,
not a measurement of unmodified production cadence. Potential carry-in from
earlier queued work and untimed commands remains explicit.

The collector reads results only after query availability, does not own borrowed
active queries, restores wrappers before draining, and releases its own query
objects. Pending, disjoint, errored or unverified-context results cannot become
usable durations. Context identity requires explicit safe, nonnegative, equal
initial/final generation IDs and a live endpoint context. A transient loss not
represented by those endpoints or the application's generation remains outside
this endpoint observation. GPU times retain the software renderer, driver and
scheduling limits of the actual environment.

Review reproduced and closed a private context-cohort false-usability P2. The
controller independently checks the cohort and finite, nonnegative numeric
rows, excluding booleans and invalid timer flags. A second private reporting P2
and an old-PID alias guard gap are also closed. Procedure completion, usable GPU
timings, the original spin assertion and rendering qualification are separate
fields. No error check is removed to hide a wait.

The reviewed private identities are:

| Component | SHA-256 |
| --- | --- |
| Raw-source collector | `020dcd55b479ff63906ef6cc7c62ec466b29432f969c05da59f8b9d0402b3fa0` |
| Node source/timing processor | `ce3be5db2db3248247f52581a1e87d8a0ed31ad6266a083755837bc98ae114c9` |
| First private clone | `0a3a1cf61c904ec9cca42d04f0349f0a8c0f08020ecb0f2d317c8d112ac4bae7` |
| First controller | `ad01e7c9e09cde16ae68f8e945eac27b93f23f6c4a6ca5e6221a5dbd0a9aa4ca` |
| Current-fixture private clone | `c7c25de53262e2ffd269853f24ebb8edba2af6b5e471f8e6f1e1ebc194da519e` |
| Current-fixture controller | `c35d3cbc8e6d332c9cd9f8f84d34c5221225003a27576a2a00d923bec4686035` |
| Current private UI copy | `a556416fd9b9cfe523836c2936db935b968a7ff8f956f850dde10c1f3b15c7c9` |

The frozen 604-input manifest is unchanged (`8f890f78…`), including the old
`6bb3bf40…` frame-cost and `30be503c…` UI helpers. Its 16-entry context map remains
separate from the 17-entry actual map containing private substitutions. The
current-fixture control changes the fixture import and metadata identities;
source review reproduces its six changed blocks exactly. All three UI exports
use the exact reviewed [fixture correction](MOBILE_UPDATE_FIXTURE_20261104.md).
The earlier failure is not relabelled as using that correction.

## Completed local controls

The private collector and processor pass 28 focused tests, including serialized
generic/Earth/Mars programs, bounds, native outcomes, wrapper/query lifecycle,
unknown context endpoints and rejected timing cohorts. A real Windows Chrome
156 / SwiftShader triangle smoke returns two completed queries, matches the
linked source pair, preserves the red pixel and original GL method identities,
and returns GL error zero. Its context generation is supplied by the fixture;
this is isolated API/pixel/lifecycle evidence, not application performance.

The first triangle smoke's post-drain pixel check fails because the default
drawing buffer is cleared after compositing. Its failed receipt is retained;
the corrected isolated fixture explicitly preserves its own 64×64 buffer. An
early Windows prefix setup failure without `CHROME_BIN` also remains preserved.
Neither failure changes application settings.

Windows prefix 03 uses the final collector/processor with the old frozen UI.
It passes the original spin assertion with four draws, then records 112 completed
available queries, zero pending, no disjoint, known application context `1 → 1`,
and eight exact source pairs. Prefix 04 uses the current private UI copy and
records the same counts and cohort status. Both exit deliberately after the
diagnostic with qualification false; neither reaches the complete browser-suite
success path. Their animated epochs and query overhead are retained. The
[separate complete Windows run](MOBILE_UPDATE_FIXTURE_20261104.md) remains the
full-suite evidence.

Source/CPU review receipt: `0660c81a56fe2f1b00d912c53b4829a90279ec82c28e8411bdbb0578da425284`.
Current-fixture clone delta review: `b76787af77327382c2769852f0b4084253bf80046d7d2fe43ae83103db837efd`.
Saved Windows-prefix-03 review: `9a64f22a73de724bdea23e2b37b0b983cfacd07061987ef2c28f57b470974f7e`.
The current-UI Windows-prefix-04 analysis independently recomputes 112 eligible
queries and nine source/pass groups, totaling 470.1554 ms of retained query
envelopes. Its receipt is
`c40da482772af8e15bc0c9f6c8d73031def7253ddcac473c317c48b92d0cf53a`.
That sum is neither a full-frame wall time nor shader-only work. The collector's
self-reported query time is not a complete, subtractable observer-overhead budget.

## Preserved first Linux failure

The first GPU control launches the pinned Chrome 157 binary against stage
`9dd2d12c…`, then fails the older mobile fixture's 30-second disclosure wait.
It obtains no Sun, spin or GPU result. A secondary missing timing-file exception
in the controller is not a GPU execution failure. The specific runtime cause of
that fixture timeout is not proven by this packet.

The actual saved archive is 99,420 bytes, SHA-256
`34bd68f5193d56700da4b52a36563eb648d46529d4006d17d29c6cb136b84769`.
It contains 11 ordinary members, 10 inventoried payloads and 350,838 expanded
bytes. The original controller receipt is
`06d8c1d2ada50ab2d97299031e7e6fa23d90eb7e048f405db17831fedc9d944c`.
Parent admission (`0cf39562…`) and independent saved-packet review
(`f6e085b55ad0154cc376bf9902cdaa234fbb9062f6b4101efd36ed3cd3b83434`)
check actual bytes, all members, 604 source mappings, exact private files,
the prior failed full-browser receipt, source postchecks and retained cleanup.
There are 602 current source mappings and two retained pre-fix aliases.

Named controller 10655, child 10658 and transfer 10863 are separately observed
absent after actual download; port 8081 refuses connection and the preview is
closed. Offline review is not a second live cleanup scan. The current-fixture
controller pins, copies and rechecks the failed receipt before/after its own
execution. It uses fresh private filenames and output; no unchanged retry
replaces this failure. Parent saved-byte admission precedes its launch; the
independent failure review completes after that launch and before result status
promotion.

## Preserved current-fixture Linux orbit-gate failure

The next Linux control uses the exact current private UI copy, passes disclosure,
Sun and Sky, and reaches System/WebGL on the same stage and Chrome/Subzero
binary. The original camera round-trip image gate fails before spin or GPU timing.
The actual returned archive is 1,240,683 bytes, SHA-256
`bbbd40d333e4221af5e51b109200c11463d36f4eb99256a6039d0c5e990282ba`.
It contains 24 ordinary members, 23 payloads and 1,552,738 expanded bytes. Original
controller receipt:
`305327c6c20c7834ffc673c4ef4123d5168d8d2475e949545bdbb7d5f0e7b87f`.
Parent admission is `a68a5914…`; independent packet review is
`1559758ae41ee51ce9d3ddd2130f104a1a316fe31446b74228623a1342f77d88`.
Both verify the exact source/stage/private-file/history chain and cleanup/input
postchecks. Controller 10882, child 10885 and transfer 11118 are separately
observed absent after actual download; port 8081 is closed and preview is closed.

The unchanged assertion independently reproduces a mean absolute RGB difference
of 13.203950529971866 over 73,526 sampled central pixels, with zero pixels above
its per-pixel material threshold of 32. The mean exceeds the unchanged limit of
6; the independent changed-fraction limit remains 0.04. Both actual PNGs are
731×612 CSS clips from the recorded 732-pixel backing width. The later image is
predominantly darker. Similar broad geography does not establish equal camera,
epoch, pipeline or optical readiness, and the missing GPU file is secondary to
the failed image gate.

Independent source/CPU review identifies a P2 precondition/evidence gap in
`visualAssertions`: map/layout readiness does not bind optical program/field,
camera, epoch or material state across the two images. Three controls show that
the map-readiness helper can return with optics loading, unavailable or ready.
This does not prove the cause of the actual mismatch or a product camera/optical
defect. The failure and thresholds remain unchanged. Interpretation receipt:
`483214d60ee56ab835e5ff979cc54fc1d4b8ca1230a19de31d6050494c9e4471`.

## Guarded failure-path replay

Private control 03 retains original gate failures and adds a separate replay
only for a System failure before the original spin assertion was attempted.
It first persists that failure, checks the existing Earth/application context,
then uses only the existing seven-day preset and Animate controls. Clock and
animation change explicitly; quality controls are not changed. Before/after
clock, camera, anchor, recorded quality, program, optical and scattering state
are retained. Unknown or changed quality/camera endpoints reject usable timings.
The record explicitly says that the original spin assertion did not run.

The 25-second Node budget includes state acquisition, both UI actions, capture
and Node processing. Expiring attempt identities and a page-monotonic deadline
guard queued controls and collector entry. The private raw collector also checks
after asynchronous setup and before each subsequent noncleanup GL operation or
wrapper installation. A call already executing cannot be preempted, and owned
query/wrapper cleanup may overrun; expired cohorts cannot retain usable durations.
The original post-spin replay now uses the anchored page deadline as well.

The revised private collector/processor/failure-path controls pass 51 focused
tests. Independent tests of five native-read expiry boundaries find zero further
noncleanup calls/installations and zero retained expired durations, with native
forwarding, wrapper restoration and owned cleanup intact. This corrects the
private queued-action, unknown-endpoint and native-read continuation P2s; earlier
red evidence and source versions remain preserved. Final raw-expiry review:
`1df8ac8dea8f30506082f82a2b43e3b937205978b4f7c6993da6426f09db7d94`.

| Final private component | SHA-256 |
| --- | --- |
| Deadline-guarded raw collector | `bbb9f58e895d0bc0dc84f7e836af45245b1da63afb3ee6ea9427a7a567a72823` |
| Failure-path helper | `f2e4e952e84b9ac4d5ca1afcaf82c7b78ea7247dee5da23e80e0fec5ae571754` |
| Clone with both guarded capture paths | `fb5df47fb2824824d7f1e08d3c230ae0870b567b305a66bf292161c8fa7cd43b` |
| Controller | `551f3692dba4944e1079557a41c669f0905bfb6220eb2cae556c7389d2915ad3` |

Processor `ce3be5db…` and UI `a556416f…` remain unchanged. The five private imports
are recorded in an 18-entry actual map, separately from the 16-entry frozen map.
The controller distinguishes an actual original spin result from an earlier
failed System gate, rejects synthetic-origin admission, and preserves the prior
orbit-failure receipt and 604 inputs before/after execution.

An explicit Windows synthetic negative control exercises the default failure
path with the final raw/helper and the earlier `7ad08b4e…` clone. It preserves its
labelled synthetic error before replay, records 113 completed available queries,
zero pending, no disjoint, known context `1 → 1`, unchanged recorded quality and
camera, and no runtime errors. Neither the original camera assertion nor the
original spin assertion is executed in that control. Its five exact source files
are preserved with its result. The final clone changes only the unused post-spin
deadline block relative to that result. Independent negative-control review is
`21a98892b68e93fbc6f9a756eb87ecb07ab634c1c0fb01bcd5985d30c532af64`.
The separate final-clone Windows post-spin control also completes: five original
spin samples pass and its frozen-transform negative rejects, followed by 112
completed available queries with zero pending/disjoint/context changes. Its
unchanged orbit PNGs are byte identical. Its elapsed diagnostic time is
2,063.8559 ms; it stops deliberately as a nonqualifying prefix. Independent
saved-result review:
`86b2ace401a9393b3fb0545c18a645db1a7e6aa13d8216b5264c1b49651b0cd3`.
The final post-spin deadline-block review is `0f7f4ad2…` and controller review is
`dcf931e5…`. No synthetic switch is passed to the Linux command.

## Actual guarded Linux outcome

Control 03 runs the final source set on the same pinned stage and browser. Its
two original camera-orbit PNGs are byte identical and pass the unchanged gate.
The original spin probe returns one accepted sample, so the unchanged three-draw
minimum fails again. The separate post-spin query attempt reaches the Node-side
25-second deadline at 25,003.951867 ms. Its JSON contains no observation, program
records or draw durations. `diagnostic_completed`, `gpu_timing_usable` and
qualification are false, with zero timed rows.

The exact error is `Separate GPU-query diagnostic deadline`. It establishes the
outer timer winning while the clock/collector chain is pending. It does not
identify clock delivery, module setup, metadata, sampling or drain as the cause,
nor establish whether any diagnostic GL operation executed. Windows timings,
earlier CPU synchronization sites, and this timeout cannot supply a Linux shader
cost, original-frame GPU time, throughput or causal speedup.

The actual saved archive is 1,807,078 bytes, SHA-256
`4178c35a9768bbb503b0abe9f3a1cde898683a4c8b511fcaf419715b9c1c43b3`.
It has 32 ordinary members, 31 payloads and 2,139,945 expanded bytes. The original
receipt is `6d0587b61d33e03786ea1b3c54c3fde116fdcba55c0450bf00e939d4dea59610`.
Parent admission is `7a074173…`; independent saved-byte/source/assertion review is
`203fe8096a3cf1f85748bc82731a7546ab848bb6d7fc0e2dc28c1eb2ad078c60`.
All 604 input mappings, five private sources, 18/16 helper bindings, 207 app
mappings and the prior failed-receipt chain match. Recorded cleanup/input
postchecks pass. Separate parent observations confirm controller 11196, child
11199 and transfer 11421 absent, port 8081 closed and preview closed after actual
download. The prior orbit-failure receipt is unchanged.

```text
node --experimental-vm-modules --test build/gpu-pass-timing-20261104/frameCostRawSources.test.mjs build/gpu-pass-timing-20261104/diagnostic_sources.test.mjs
python -m py_compile build/gpu-pass-timing-20261104/run_linux_gpu_draw_20261104_02.py
python -I build/gpu-pass-timing-20261104/admit_early_failure.py
python -I build/gpu-pass-timing-20261104/admit_orbit_failure.py
```

Admission and generation destinations must be fresh; do not overwrite retained
packets or earlier observations. The next control should persist a bounded Node
phase ledger immediately around its existing clock await, collector await,
processing and timeout, without adding a GL or protocol query. That can separate
clock delivery from the remaining collector chain; it cannot itself split raw
metadata/sampling/drain. Preparing the four exact cached module namespaces after
Sky, before heavy System work, is a separately bounded preparation hypothesis.
Such a variant must validate cache version, current script token/URLs and required
exports, read the live cached store, and explicitly fail on a cache miss. No cause
or improvement is asserted before that controlled result. Keep the 25-second
budget, original gates and quality. A rendering correction still needs numerical/
visual equivalence and the original complete Linux gate; the image-gate state
precondition gap also remains to be corrected separately.

Rollback removes these private diagnostics and documentation links while keeping
original failed evidence. No runtime rollback is required because application,
shader, field and staged artifact bytes are unchanged.
