# Linux passive API timing — 2026-11-04

The current Linux trace locates nearly all of the missed Earth draw interval
inside existing `getError` calls. At least **4,839.7 ms of the nominal five-second
admission window (96.794%)** overlaps recorded slow calls. The original assertion
again fails with one accepted Earth draw. This identifies a synchronization site;
it does not establish which queued pass, software execution or scheduling cost
causes the wait. Error checks remain intact.

## Controlled capture

The private clone runs the original browser scenario through the unchanged Earth
spin assertion, then stops intentionally. Its five changed blocks add the timer,
persist timing and assertion results, label the run nonqualifying and suppress
only the later post-failure diagnostic. The original validator, application,
rendering settings, original deadlines and physical acceptance gates are unchanged.
The original failed full-browser packet remains preserved separately.

The self-contained timer wraps a fixed list of existing context methods. It adds
no GL query, draw, upload, timer query, finish or wait. It forwards native receiver,
arguments, returns and exceptions, subtracts nested measured calls from exclusive
time and bounds slow-event storage to 200 records. Native/observer wall time can
include waits for earlier queued rendering and host scheduling. The method list
does not cover every GL call or all application JavaScript.

The actual Windows preflight and Linux execution use the same scripted prefix and
artifact. They are different hosts, Chrome builds and software backends. Animated
initial `renderUnix` differs by approximately 0.800 days because frame delivery
and the existing simulation clamp affect progress during preparation. Both use
the same 604,800 simulated-seconds/second sample rate and 732 × 612 canvas.
These are single instrumented observations, not a matched-raster benchmark.

| Observation | Windows LLVM | Linux Subzero |
| --- | ---: | ---: |
| Actual Chrome | 156.0.8078.48 | 157.0.8103.38 |
| Passive API capture | 1,027.9 ms | 14,633.0 ms |
| Original spin observation elapsed | 689.4 ms | 10,871.9 ms |
| API capture before spin starts | 337.7 ms | 3,760.6 ms |
| API capture after spin ends | 0.8 ms | 0.5 ms |
| Existing `getError` calls | 60 | 40 |
| Exclusive `getError` wall time | 861.4 ms | 14,106.2 ms |
| Share of broader API capture | 83.802% | 96.400% |
| Accepted original Earth draws | 4 | 1 |
| Original assertion | Passes, then intentional prefix stop | Fails |
| Qualification granted | False | False |

The API timer starts before the collector's awaited store import, so its totals
include work outside the spin interval. API indexed/array calls are 216/120 on
Windows and 144/80 on Linux; the narrower spin records contain 144/80 and 108/60.
Neither count is a claim of physically presented frames. Preserve both intervals
and their counters rather than assigning all API totals to five seconds.

## Linux interval evidence

The four recorded slow `getError` episodes, relative to spin start, are:

| Start | End | Relation to spin/deadline |
| ---: | ---: | --- |
| −3,718.7 ms | −149.7 ms | Before the spin interval |
| 30.6 ms | 3,415.3 ms | Inside the first five seconds |
| 3,545.0 ms | 7,264.2 ms | Crosses the five-second cutoff |
| 7,370.7 ms | 10,776.4 ms | After the cutoff, before collector return |

Intersection with `[spinStart, spinStart + 5000 ms]` gives 4,839.7 ms. This is a
lower bound from the recorded slow events; the other fast error checks are not
included. The three fully contained episodes total 10,509.6 ms of the longer
10,871.9 ms spin observation. The pre-window episode is excluded from both figures.

The independent RAF callbacks occur at 3,503.9, 7,303.5 and 10,860.7 ms. The
unchanged collector admits one sample and bypasses 69 indexed draws after the
deadline. A blocked event loop delays timer delivery but does not extend sample
admission. There are no sample errors, GPU mismatches or late readbacks. Captured
endpoints remain active, visible and context-live, with Earth optics/programs ready.

All 8,993 measured calls complete without a JavaScript exception. The 41 existing
`getParameter` calls total 0.3 ms in this capture. That does not measure all observer
JavaScript or prove that a particular query is intrinsically cheap on every host.
The long `getError` waits can expose earlier queued work; deleting or deferring
correctness checks is not an established solution.

## Admission, lifecycle and reproduction

The actual saved archive has 28 ordinary members, 27 inventoried payloads and
2,096,338 expanded bytes. Evidence is under
`build/passive-gl-timing-20261104/linux-returned/`:

- Archive: 1,793,868 bytes, SHA-256
  `d4ba2770306ec688bd04901bfdd4ec5e092fb17bdac330ed27131c86a9e5fc19`.
- Actual controller receipt:
  `b7f3fed9299a72a32e4614485dc89aa639d723d5a04f0d299692b277782cb00f`.
- Parent saved-byte admission:
  `aaca086efa2236debe94eac33fccbb1775f3b854adf80d700be55ff7db01f7c1`.
- Independent packet review:
  `c8b0f3e92ee2c9464e4740b74beade55dfda6ffa1e204856efa935c71897bdb2`.

Independent arithmetic review recomputes all 112 CSV rows, eight input hashes,
intervals and clipped-overlap metrics. Its machine-readable check is
`bb22df390c5cc7d148a3334fe5d5984cbfb48101f82f36dcc009a89f1694c81e`.

Admission binds controller `38459b81…`, timer `ec78bca3…`, clone `508bbd54…`,
input manifest `8f890f78…` and stage `9dd2d12c…`. All 604 historical source mappings
match: 603 current sources and the retained pre-fix frame-cost helper. The current
classifier fix is separate and does not execute in this private prefix. All 16
historical helper identities and actual Node/Chrome binary identities are retained.

The controller captures a fresh UID/PID/kernel-start baseline and uses the short
runtime temporary directory. Cleanup passes with no remaining owned browser
process or error. Source/private-file postchecks and preservation of the original
failed receipt pass. Separate parent observations confirm controller PID 9063,
child PID 9066 and transfer PID 9320 absent, port 8081 closed and preview closed.
Offline packet review is distinct from those live observations.

Pre-execution review reproduces and closes an uncapped second-read defect in the
unused first controller. Revised source caches capped admitted uploads before
copying to exclusive destinations. Fourteen lifecycle, six copy and seven status
controls pass; receipt
`dd2437fffdd31cab614f45addfb8015d614cdeafda91481cde1ef5289ccbb1d7`.
The separate JS/clone review passes five CPU controls and exact generator/source
checks. The return helper retains its two-slot/240-second/10-second bounds and
passes 15 synthetic controls. No diagnostic completion promotes rendering status.

```text
node --test build/passive-gl-timing-20261104/passive_gl_timing.test.mjs
python build/passive-gl-timing-20261104/admit_linux_packet.py
python build/passive-gl-timing-20261104/analyze_passive_timing.py build/passive-gl-timing-20261104/windows-preflight build/passive-gl-timing-20261104/linux-returned/unpacked/coverage build/passive-gl-timing-20261104/comparison-03
```

The admission and analysis destinations must be fresh; the existing outputs are
retained. Comparison generations 01/02 stay preserved, with generation 03 adding
explicit animated-epoch/interval scope and the clipped deadline-overlap metrics.
The plot labels wall time and the nonqualifying scope. No Rust/Python physics
replay or full Node coverage rerun is needed for these ignored diagnostic files;
the prior 1,456-test and 97.55% coverage records retain their original scope.

## Next action and limits

The [subsequent callsite capture](GL_CALLSITE_TIMING_20261104.md) now identifies
the recurring wait at generation's entry check, before the current generator is
bound or either pass is submitted. Its separate interval/counter results retain
the failed original assertion. GPU/pass attribution remains open.

Capture the slow error-check callers and the preceding queued passes with bounded
instrumentation, then obtain pass timings with explicit pending/disjoint results
if supported. Preserve checks, formulas, fields, quality, resolution and original
gates. An optimization needs numerical/visual equivalence evidence followed by a
passing original Linux full-browser run. Current shader/GPU cost, uninstrumented
throughput, broader hardware/platform qualification and release readiness remain
open. No application, model, coefficient, dependency, licensing, cloud credential,
global installation, commit, push or deployment changes in this follow-up.
