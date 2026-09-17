# Frame-cost attribution after an original failure

`tools/frame_cost_diagnostic.mjs` provides a separate instrumented replay after
`browser_validation.mjs` fails its original Earth draw count or additional Earth
physical-preparation gate. The original exception, failed status and exit code
remain authoritative. The helper does not change renderer code, settings,
coverage collection, detail, integration bounds or acceptance deadlines.

Run the existing validator against an immutable stage and new output directory:

```text
node tools/browser_validation.mjs --web-root=build/<immutable-stage> --output-dir=coverage/<new-run>
```

The existing `--physical-spin=true` option additionally exercises physical
preparation. The diagnostic automatically runs only after either named failure.
It writes `frame-cost-after-failure.json`; the original `browser-evidence.json`,
`failure.json` and original spin receipt remain separate. A diagnostic status of
`captured` means attribution was recorded, never that rendering passed.

The independent replay stops after two rAF heartbeats or 15 seconds, with at most
160 recorded draws and 20 observed program versions. Its optional timer drain is
at most three seconds. The Node caller additionally bounds waiting to 25 seconds;
the existing generic failure snapshot and cleanup then proceed. Browser timers
cannot preempt a synchronous driver call. An outer timeout does not cancel the
in-page promise or prove GPU preemption: closing the owned browser is the hard
cleanup boundary. Report actual elapsed times and retain overruns.

The receipt records:

- CPU time inside original GL calls, including exclusive and inclusive totals;
  diagnostic state reads are separately accounted. These times can include a
  driver wait or existing validation observers and are not GPU execution times.
- Actual current program, observed linked vertex/fragment hashes, generator
  pass, framebuffer identity, viewport, and current plan/profile/camera/Sun
  uniforms. In particular, `[128,193,1]` identifies the smooth single-plane Earth
  atlas without inferring it from readiness metadata.
- Generator, physical-surface and physical-shell roles matched to current
  production fragment sources. Other programs retain separate observed hashes
  and framebuffer identities. This is timing classification, not a new physical
  source-admission gate.
- Optional `EXT_disjoint_timer_query_webgl2` elapsed results per draw. Borrowed
  active queries are left alone; diagnostic queries do not nest. Results are
  requested only after availability, pending handles are deleted after the
  drain, and a disjoint observation invalidates every GPU duration. A query
  measures its inclusive GPU command interval, including any nested original
  draws; do not sum overlapping intervals as independent work.
- Application state and rAF heartbeat timestamps before/after the replay.
  The instrumentation adds work and queries; it cannot establish uninstrumented
  throughput or replace the original five-second gate.

Method wrappers restore their prior descriptors in `finally` and do not replace
later owners. No `gl.finish`, framebuffer resizing, forced program readiness,
optics disablement or reuse of stale fields is used. Query/read failures must not
suppress original renderer calls. The helper hash is bound in the initial
validation inventory and the diagnostic record. No new runtime resource,
dependency, provider or telemetry endpoint is introduced.

CPU regression validation:

```text
node --test tests/web/frameCostDiagnostic.test.mjs
node --check tools/frame_cost_diagnostic.mjs
node --check tools/browser_validation.mjs
git diff --check
```

Tests cover actual callback execution, original return/throw behavior, borrowed
query ownership, absent/pending/disjoint/failing timers, bounded sampling,
source/plan attribution, descriptor cleanup, and preservation of the original
failure when replay throws, expires, or cannot write its report. GPU attribution
on the failing hosted Chrome 152/Subzero workload remains required before a
renderer optimization is selected.
