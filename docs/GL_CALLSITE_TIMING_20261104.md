# Linux error-check callsite timing — 2026-11-04

All five recorded long waits occur at the scattering target's **entry error
check**, before the current generation program is bound or either current pass
is submitted. The original Earth spin assertion remains failed with one sample.
This identifies the queue boundary where waiting is observed; it does not identify
the earlier queued work or prove a causal shader/pass.

## Captured source and intervals

The actual staged stack chain is:

```text
paint:1836 → drawBody:2219 → generateBodyScattering:1747
→ profiledScatteringTargets.generate:29
→ scatteringTargets.generate:225 → checkedError:184 → getError
```

In the admitted staged `scatteringTargets.js` (`529ea988…`), line 225 executes
`checkedError(entry,'entry')` after validation but before allocation, generator
binding at line 229 and both pass submissions. Caller construction also submits
the renderer boundary state first. The `submitted-null` program hint therefore
has no object from which the private observer can record a linked source; an
empty `programs` array is expected, rather than a metadata or record-limit failure.

| Slow call | Start relative to spin | End | Observed duration |
| --- | ---: | ---: | ---: |
| `getError #1` | −7,579.9 ms | −3,685.2 ms | 3,894.7 ms |
| `getError #11` | −3,493.3 ms | −84.4 ms | 3,408.9 ms |
| `getError #21` | 89.9 ms | 3,806.7 ms | 3,716.8 ms |
| `getError #31` | 3,992.0 ms | 7,362.1 ms | 3,370.1 ms |
| `getError #41` | 7,466.3 ms | 10,884.0 ms | 3,417.7 ms |

All 50 observed error-check returns are numeric zero; all 11,237 measured calls
complete without a recorded JavaScript throw. The broader API capture is
18,572.8 ms, including 7,621.0 ms before the 10,949.4 ms spin observation and
2.4 ms after it. `getError` totals 17,846.6 ms, or 96.089981% of that broader
capture. The first two long calls are excluded from spin-window claims.

Recorded slow-call overlap with the nominal five-second admission interval is
**4,724.8 ms (94.496%)**. The call starting at 3,992 ms crosses the cutoff.
Three independent RAF callbacks occur at 3,902.9, 7,433.8 and 10,938.1 ms; only
one Earth sample is admitted, with 69 indexed draws bypassed after the deadline.
Blocked timer delivery does not extend admission. The prior passive probe's
96.794% overlap is a different capture, not a substituted denominator here.

The command ring records CPU submissions only. Its opaque program tokens cannot
identify a preceding shader. Its numeric argument projection also maps both
objects and literal null to null; a framebuffer marker alone does not establish
an intended or actual null binding. Source and HDR-off state explain the intended
boundary, but none of these hints proves actual GPU state or completion.
The reported 20.4 ms metadata counter may overlap outer API timing and must not be
added or subtracted as a separate wall-time partition.

## Experiment and admission

The private timer adds no GL query, draw, upload, timer query, finish or wait.
It forwards existing receiver/arguments/results/exceptions. Limits are 200 slow
events, 4,096 stack characters, a 32-command ring and 20 source/version records
with at most two 131,072-character sources each. Source hashing and fragment-role
hints run in Node after page timing stops; source text is removed before persistence.
The source observer itself performs only JS bookkeeping. Labels never promote
submitted hints into GPU-state or pass-cause proof.

Ten CPU tests and independent regeneration/source-processing controls pass. A
separate real-WebGL semantic smoke uses a synthetic clock: it forwards error 0
and `INVALID_OPERATION`, shows that an invalid submitted program hint can differ
from the actual retained program, and records no `getParameter` query during
capture. It is neither an app-prefix pass nor a performance measurement.

The Windows prefix preflight fails earlier in disclosure, before this timer runs.
Its failure remains preserved; the separately corrected
[mobile fixture](MOBILE_UPDATE_FIXTURE_20261104.md) receives its own current Windows
full-browser validation. This Linux experiment keeps all old frozen helper bytes,
including that original mobile check, and reaches the callsite capture.

The saved Linux packet under `build/gl-callsite-timing-20261104/linux-returned/`
has 28 ordinary members, 27 inventoried payloads and 2,136,995 expanded bytes:

- Archive: 1,798,852 bytes, SHA-256
  `912ee618746c4711d488754817d53053e0bb549d0d2d96d44dedf314cd48236a`.
- Original controller receipt:
  `e057f0a6caaffcd08be28ffac0deb1c5ed8f2d80c6280956f24ff8bd947173e2`.
- Parent saved-byte admission:
  `9cc35186d1b2b93c64793bf0e0803843d4880b89a5310070d4ef8c1aca8c97f8`.
- Independent packet review:
  `b742a1b31cbdc49de251ea90ee127dd0ed9aa3d7ccc01cb6251b4a3736e8c42a`.
- Independent callsite/source/interval review:
  `8a0dce21152aa0790dc20a6972329fe52c30b9b6f62bedd8c96e3ff3fb9231ab`.

Admission checks all 604 mappings: 602 current sources and the two retained
historical frame-cost/mobile helpers. Controller `8ddb5767…`, timer `6fcf2faf…`,
clone `48cbd47f…`, input `8f890f78…` and unchanged stage `9dd2d12c…` are explicit.
The original failed full-browser receipt is unchanged. Cleanup, owned Node group
and source/private-file postchecks pass. Separate parent observations confirm
controller 9855, child 9860 and transfer 10096 absent, port 8081 closed and preview
closed; offline reviews do not constitute a second live scan.

```text
node --test build/gl-callsite-timing-20261104/passive_gl_callsite.test.mjs
python build/gl-callsite-timing-20261104/admit_linux_callsite_packet.py
python build/gl-callsite-timing-20261104/analyze_callsites.py build/gl-callsite-timing-20261104/linux-returned/unpacked/coverage build/gl-callsite-timing-20261104/analysis-01
```

Use fresh output destinations; retained packets/analysis must not be overwritten.
The output includes bounded JSON, CSV and an inspected interval plot. Diagnostic
completion remains separate from the failed assertion and qualification false.

## Next action

The [separate bounded GPU-query control](GPU_DRAW_TIMING_20261104.md) now passes
its Windows preflight. Its first Linux run stops in the old frozen mobile fixture
before querying; that failed packet is preserved and admitted. The distinct
current-fixture control reaches System, fails the original camera-image gate
before spin/querying, and has its actual packet/images admitted as failed.
The final guarded replay then passes the original image gate, reproduces the
one-draw spin failure and reaches its separate query deadline without an
observation. That actual failed packet is saved/admitted; no shader/pass GPU
duration is established. A bounded phase ledger within the probe is next;
original gates remain unchanged.

Capture bounded GPU/pass timing with source correspondence and explicit
unavailable, pending and disjoint outcomes. Include potential carry-in from an
earlier frame and the wider queue; do not label the current generator as the cause
from its enclosing function name. Keep error checks, formulas, fields, detail,
resolution and original gates. A corrective optimization still needs numerical
and visual equivalence followed by the original complete Linux qualification.
No application, shader, model, coefficient, dependency, licensing, global software,
cloud credential, commit, push or deployment changes occur in this experiment.
