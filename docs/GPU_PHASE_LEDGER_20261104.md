# Linux GPU phase-ledger control — 2026-11-04

This follow-up obtains usable draw-query observations in a separate animated
Linux replay. It does not override the original failed image gate or supply an
original spin result. The [preceding guarded attempt](GPU_DRAW_TIMING_20261104.md)
remains a timeout without an observation; its cause is not established by a
different later workload.

## Control and admission

The private `04` source adds a capped, in-memory Node phase ledger around existing
await/processing/timeout boundaries. No extra page, protocol, GL or per-stage file
operation is introduced. The cap is 24 events; snapshots close before the existing
final write and late completions cannot mutate them. Source review passes 21
supplied tests, 15 independent controls and exact inverse/generation checks.
Controller lifecycle, gates, budgets, GPU admission and cleanup remain unchanged;
the ledger is informational only.

Final clone/leaf/controller hashes are `8a488e78…`, `b3e50147…`, `5b4196d2…`.
Raw collector `bbb9f58e…`, processor `ce3be5db…` and UI `a556416f…` are unchanged.
Actual/frozen helper maps remain 18/16. Source review is `4c9a19ef…`; controller
review is `e5406949…`. Windows preflight passes original spin and obtains 112
queries, with seven ordered ledger events and no drops; it is a nonqualifying
prefix rather than the complete browser command.

The actual Linux archive is 1,253,859 bytes, SHA-256
`41bd89d2836e99f5161c674b46268bb4f2b3a198be1fc288fef226d635ad4756`.
It contains 27 ordinary members, 26 payloads and 1,663,133 expanded bytes. The
original receipt is `0ff43f6ae3d6e22dc0a3c1cb8b316009072a492ed371966d6dc635db561a634d`;
parent admission is `6b13f8cd…`. Independent source/query/ledger review is
`5c8350e60123d310641596b9572648b6bd80bad9137062f939653866914c70b0`.
All 604 inputs / 429 blobs, five private modules, helper maps, 207 owning app
mappings, stage `9dd2d12c…` and prior failed-receipt chain correspond.

The original camera image gate again fails at 13.204 / 0.00%, before spin. The
separate replay explicitly uses the seven-day preset and Animate controls.
Before/after quality and camera settings match; epochs advance. It records 113
finite completed queries, zero pending, no disjoint, no errors and known context
generation 1→1. All eight observed linked shader pairs match owning exports.
The 11-event ledger has no drops; Node collector await is 7,918.481742 ms and
processing is 14.853475 ms. These are receipt boundaries, not page-entry or GPU
durations. Procedure completion and usable timing are true; qualification remains
false. No original spin assertion ran.

## Retained query envelopes

| Source pair / observed pass | Queries | Sum (ms) | Per-query range (ms) |
| --- | ---: | ---: | ---: |
| Earth physical surface | 2 | 3,713.943938 | 1,839.143806–1,874.800132 |
| Earth atmosphere shell | 2 | 1,292.323381 | 641.939961–650.383420 |
| Earth generator / pass 0 | 2 | 1,240.643415 | 474.207061–766.436354 |
| Ordinary sphere | 69 | 465.209132 | 5.526473–16.487847 |
| Earth generator / pass 1 | 2 | 267.383216 | 108.568130–158.815086 |

The nine groups total 7,083.431670 ms over 57 and 56 retained draws. The saved
analysis under `build/gpu-phase-ledger-20261104/analysis-01/` includes all 113 rows,
all nine groups and a viewed plot. Independent arithmetic/source-pair/output
review is `842a02ea14eb98f01caa7bcac8beb85f287a0e1d318937224335af8e38058dfc`.

The physical-surface source has the largest measured query sum and maximum in
this replay. That supports investigating equivalent optimization of its consumer
work next. Query envelopes include the actual software renderer/driver/scheduling
effects; they are not shader-only cost, net frame time, a partition of wall time,
original-failure cost or causal speedup. Source labels do not prove body/uniform/
content correctness. Keep fields, grids, resolution, formulas and original gates;
any optimization needs numerical/visual equivalence and the full Linux replay.

## Closure and next work

Recorded cleanup, group reap and all 604 input postchecks pass. Separate parent
observations confirm controller 11911, child 11914 and transfer 12147 absent,
port 8081 refusing connection and the preview closed after actual saved download.
Offline reviews are not a second live scan.

The image-gate state precondition is now separately corrected and validated on
Windows; see [render-pair state correction](RENDER_PAIR_STATE_20261104.md). Old
Linux inputs and failed images remain preserved. No shader, model, coefficient,
dependency, licensing or deployment change occurs in this experiment. The orbit
qualification target remains 1900–2200, with years 1–9999 approximate outside it.
Production readiness and a passing full Linux rendering gate remain open.
