# Worker startup controls and Linux Earth failure — 2026-11-04

The fresh original Linux full-browser command reaches System/WebGL and fails
`insufficient Earth sphere draws: 1`. This is a current configuration failure,
separate from the earlier intercepted worker probe. No Linux pass or production
qualification follows from the diagnostic work here.

## Startup experiment

The private production-client prerequisite used Puppeteer Fetch request
interception. The full validator uses CDP Network blocking instead. A bounded
Windows control keeps the exact staged production client, input tuple, ten-second
request timer, executable and fresh process/profile policy fixed. Each network
policy runs plain, resume-only, Profiler, Profiler, resume-only, plain. The actual
collector is used; the resume-only control suppresses only the two Profiler
enable/start commands. No control collects sources or enables its own Debugger.

| Network policy | Plain | Resume only | Profiler | Profiler | Resume only | Plain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fetch interception | 2,236.3 ms | Deadline | 2,204.8 ms | Deadline | 2,243.8 ms | 2,046.2 ms |
| Existing validator Network blocking | 2,243.2 ms | 2,373.5 ms | 2,595.5 ms | 2,852.2 ms | 2,593.7 ms | 2,477.2 ms |

Both intercepted failures log a requested imported module without the loopback
server receiving it (`skyEngine.js` and `skyPrivacy.js` respectively). Neither
requests WASM. Explicit worker resume completes promptly in both. All ten
completed results contain 117 strictly admitted bodies and are byte-identical:
SHA-256 `c12f0681cbbb8b2c22c1bccd014d7ab337af67c4c253a58ac1a7a9aa11d07368`.
These Windows controls identify an intermittent delivery stall in that tested
interception path. They do not prove the earlier Linux probe's sole cause or
measure raw WASM CPU time. Six runs per policy are not a general timing guarantee.

Retained evidence: `build/worker-startup-control-20261104/windows-preflight/`,
`windows-blocked/`, and `figures/`. The source/control review receipt is
`a1fcdc69da4c635110608a39441d6aefb492b5b818cb85092d03768f6fd532a1`.

## Original Linux replay and preserved launcher failure

The first follow-up launcher reused a nested temporary path. Chrome fails before
opening with `Socket path too long`. Its cleanup scan also fails with 15 recorded
permission errors for five protected PIDs absent from that launcher's old
baseline. Both failures remain recorded; later baseline capture does not repair
or exempt them. The actual 65,590-byte archive is saved under
`build/linux-browser-collector-20261104/launch-failure-returned/`, SHA-256
`45016bdf583b9477185fcde0a86f9a0d8df93221b6e43514902ff55989239502`.
Parent admission `dd8771f85d6d9731fdf39baa8f26c641e1d37c17ebf437fafdfb5b5650820221`
preserves failed startup and failed cleanup. No rendering conclusion belongs to it.

The corrected v8 driver returns to the reviewed short, fresh-runtime layout and
captures its UID/PID/kernel-start baseline before installing a private browser.
It removes only the intercepted prerequisite and its output-parent creation;
the original 1,200-second full-browser command is AST-identical. The archived
v7 input source and executed v8 source retain separate identities. Independent
pre-execution review receipt:
`5d5f23092469f280fa4fd2dc18d88e8fc597f74c7d74d2cf27731e99d5b4bc78`.

The actual Chrome 157.0.8103.38 run completes the Sun/Sky phases and reaches the
original Earth spin assertion. It observes ANGLE Vulkan SwiftShader **Subzero**
in the application's WebGL2 context, at 732 × 612 pixels. The application stage
remains manifest `9dd2d12c14eeda5a385d5c48002abd71da3c0fe39b93ede4952cf02bff15d65a`.
The browser command exits 1 after 460.437 seconds; its outer watchdog does not fire.

| Original spin observation | Value |
| --- | ---: |
| Accepted Earth samples inside five seconds | 1, at 3,749.4 ms |
| RAF callbacks, cumulative elapsed | 3,835.0 / 7,287.6 / 10,785.3 ms |
| Later callback gaps | 3,452.6 / 3,497.7 ms |
| Indexed / array draw calls completed | 108 / 60 |
| Indexed draws bypassed after the deadline | 69 |
| GPU mismatch / late-readback / sample errors | 0 / 0 / 0 |
| Captured page/context endpoints | Active, visible, context live |
| Earth optics and programs at both endpoints | Ready |

The unchanged assertion is independently replayed against the saved spin packet
and rejects it. Sparse completed frames explain the failed count; this is not a
record of plentiful Earth draws rejected for mismatched transforms. Approximately
3.5-second cadence persists after the probe stops candidate GPU readbacks at five
seconds, so those four readbacks alone cannot explain it. Their JS wrappers,
installed texture/FBO observers, coverage, application checks and rendering still
execute. Captured readiness does not exclude driver/JIT or per-draw GPU cost.

The separate frame-cost diagnostic returns only its 25-second deadline error.
It supplies no current per-pass timing. Historical Subzero timings are hypotheses:
the older follow-up also records hosted success and optimizations already present
in current source. Neither old timings nor a Windows LLVM pass attributes this run.

The actual returned archive has 29 ordinary members, 28 inventoried payloads and
1,997,058 expanded bytes. It is retained under
`build/linux-browser-collector-20261104/rendering-failure-returned/`:

- Saved archive: 1,765,925 bytes, SHA-256
  `6c2ce2b06de5c33aaecb5cf000b2e4a08f299e0afb33cc73526447d6807d4a2a`.
- Original driver receipt:
  `f3bff90da71d8c6df549a46b8a49a11c765b7764a70ecf69455cbb67916eafb8`.
- Parent saved-byte admission:
  `89a029586dec95b3df5b03593d731d1ff06f24225da2744fda3e1b24a07810f4`.
- Independent packet review:
  `08bc19379a427990cdee2d1eb836f19da50201a0b38c43c7c2062e8827d4b85a`.

Independent admission checks all 604 source mappings before the diagnostic fix,
16 helper identities, input/stage pins, logs, failed assertion, cleanup and both
source postchecks. Actual fresh-run browser cleanup passes with no remaining
owned processes or errors. Separate parent observations confirm driver and both
return listeners absent, port 8081 closed and preview tabs closed. Offline review
does not constitute a second live process scan. The original gate remains failed.

## P2 diagnostic correction

`tools/frame_cost_diagnostic.mjs` previously classified only generic physical
fragment sources. Production compiles exact Earth/Mars profile variants, so it
labelled all their draws `other`, omitted generator pass IDs and skipped uniform
snapshots. A CPU reproduction using actual shader exports demonstrates this
independently of the VM failure.

The default environment now imports the existing profile source module and
matches exact complete generic/Earth/Mars fragments for each semantic role. It
preserves string-valued synthetic fixtures and leaves altered, absent, null and
non-string fragments unclassified. Source hashing, bounded capture/drain, native
call forwarding, cleanup, failure status and original gates are unchanged.
The function remains self-contained when serialized into `page.evaluate`.

The new serialized default-environment regression fails on Earth before the
change and passes afterward for generic, Earth and Mars. Negative controls and
all prior timer/lifecycle cases pass. The source correction fixes attribution;
it does not fix or explain the one-draw failure or prove the 25-second timeout's
cause. It has not yet run on Linux.

Review also reproduces a test-only asynchronous wait defect: counting empty event
loop turns can exhaust the fake-task budget while native WebCrypto waits. The
fixture now bounds executed synthetic tasks separately from its real monotonic
five-second watchdog. A deterministic 1,100-turn asynchronous-wait regression
passes, retaining real hashing and rejection propagation.
Independent review repeats the original real-WebCrypto contention control,
confirms the failure is closed, and verifies three task/wall-bound/rejection
negative controls. Final closure receipt:
`ed543e6d688fd60cf67f91c57388f578cef4d2990e87ba476c328c04e8448788`.

Validation:

```text
node --check tools/frame_cost_diagnostic.mjs
node --experimental-vm-modules --test tests/web/frameCostDiagnostic.test.mjs tests/web/earthSpinProbe.test.mjs tests/web/physicalProgramSources.test.mjs
node tools/collect_node_coverage.mjs --output-dir=coverage/frame-cost-source-node-20261104-02
python tools/typecheck_web.py
node tools/merge_web_coverage.mjs --node-input=coverage/frame-cost-source-node-20261104-02/coverage-final.json --browser-input=coverage/worker-late-debugger-windows-20261104-02/coverage-final.json --output-dir=coverage/frame-cost-source-combined-20261104-02
```

Results: syntax passes, 53 focused tests, all 1,456 Node tests, 124-file typecheck,
and combined runtime coverage 17,802 / 18,249 lines (97.55%) at the unchanged 90%
floor. The combined result reuses the identified prior Windows browser capture
with unchanged application/source-map bytes; it is not a new browser run.
Runtime/source closure confirms 603 frozen mappings unchanged and only the
intended diagnostic helper changed. Before snapshots and logs are retained under
`build/frame-cost-source-fix-20261104/` for scoped rollback.

## Next attribution and limits

The [subsequent passive timing control](PASSIVE_API_TIMING_20261104.md) now
captures the same scripted prefix on Linux. It reproduces the one-draw assertion
failure and locates long waits inside existing `getError` calls, without adding
GL queries. Its source/admission/cleanup and differing API/spin intervals are
recorded separately. Caller and preceding-queue attribution remain open.

Keep the original failed packet and exact rendering inputs: stage, browser,
viewport/DPR, camera/body, epoch/rate, optics, grids, formulas, textures and detail.
First collect bounded timing/counters that add no GL queries, then vary coverage,
installed mutation observers and spin readbacks individually in fresh matched
processes. Distinguish API inclusive/exclusive wall time from GPU time and host
scheduling. Obtain corrected source-aware pass timing only as a separately
labelled instrumented diagnostic with pending/disjoint outcomes retained.

Controls never substitute for the original three-draw/five-second gate. A passing
original Linux replay, broader platform/manual validation and release eligibility
remain open. No model, coefficient, application asset/network call, dependency,
licensing, global installation, cloud project, credential grant, commit, push or
deployment changes in this follow-up.
