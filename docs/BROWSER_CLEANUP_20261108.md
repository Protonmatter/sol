# Verified QA browser retirement - 2026-11-08

Browser validation previously used a best-effort cleanup helper whose resolving
fallback could request an owned-process kill without confirming exit. The caller
could then record browser cleanup as completed while omitting the graceful-close
failure from structured acceptance. This P2 affects a failure path; the retained
older captures do not establish that it happened during those captures.

The existing closeOwnedBrowser API retains its previous behavior for existing
callers. The new closeOwnedBrowserVerified entry point is for qualification:

- Require the process handle captured from that browser's launch. Refuse missing
  ownership or invalid process state before closing anything.
- Retain graceful-close rejection/deadline details even if forced retirement
  subsequently succeeds.
- Wait for confirmed owned-child exit. An acknowledgement alone cannot qualify.
- If exit stalls, retain the failure, request retirement only through the same
  captured child, and wait again within a separate deadline.
- Remove only listeners installed by this helper and preserve unrelated listeners.
- Treat a known exited owned child idempotently. No process discovery is used.

The default deadline is 10 seconds per phase, with a worst case of approximately
30 seconds. Invalid deadlines are rejected. Failures are actionable aggregate
errors. The browser validator's existing finalizer records failure, continues its
other cleanup, saves final evidence and suppresses a success announcement.

The workflow-closure test supplies the new helper name at its existing external
I/O boundary. Its legacy binding remains for the other validators. The physical
owned-process behavior is tested separately; the VM boundary does not claim to
exercise real browser retirement.

## Evidence and validation

The isolated proposal retains the initial seven-case baseline (one pass and six
expected failures), the invalid-process-state regression, and the consumer-fixture
failure before correction. Its final focused suite passes 98 cases: eleven new
retirement cases, 56 existing worker-coverage cases and 31 workflow-finalization
cases. Legacy helper and worker-instrumentation bytes remain unchanged.

Three actual launch-owned Chrome 156.0.8078.80 cases also pass: normal closure,
injected graceful-close refusal, and acknowledgement without exit. The negative
cases remain failures while their owned processes exit. No rescue operation or
unrelated browser termination is needed. These are retirement tests, with no
application, rendering, astronomical, performance or descendant-process claim.

Local commands, source pins, logs, review, integration and application backups
are retained under build/browser-cleanup-20261108-01. Run the existing Node suite,
documentation/static checks, and a fresh named-artifact browser/touch validation
after application. Keep all input and output cohorts explicit.

## Scope and rollback

This changes qualification tooling and its tests. Application modules, startup
imports, visual defaults, original numerical WASMs and orbital data are unchanged.
Sites v7 Illustrative Earth remains preserved. It grants no 200 ms rendering
waiver, scientific qualification, operational approval or release permission.

To roll back, restore only the backed-up worker_coverage.mjs,
browser_validation.mjs, workflowClosure.test.mjs and readiness note, then remove
the newly added retirement test and this note. Preserve unrelated dirty work and
historical evidence. No dependency installation, application network call,
license change, commit, push or deployment is part of this correction.

## Observation-startup follow-up

The observation-startup validator now also uses verified launch-owned browser
retirement. Its finalizer records browser, server-connection and server-close
results independently, attempts all cleanup owners after a failure, and writes
the final receipt before announcing its result. Page errors arriving during
shutdown are included in acceptance. A failed graceful close remains failed even
when the owned process is subsequently retired.

The new observationClosure.test.mjs executes the actual caller finalizer with
external I/O boundaries. Nine cases cover clean ordering, each cleanup failure,
combined primary/cleanup failure, a late page error, launch failure, evidence
write failure and falsy cleanup rejections. The retained red baseline has one
pass and eight expected failures; all nine pass after correction. Together with
the existing observation and owned-process unit cases, 25 focused tests pass.
This boundary fixture does not establish physical browser exit; that behavior
is covered separately by the verified helper's real-browser integration.

Commands, exact backups, source maps and actual staged observation evidence for
this follow-up are retained under build/observation-cleanup-20261108-01. The
four functional scenarios keep service-worker bypass and make no loading-time
or 200 ms response claim. Other legacy cleanup callers have not been migrated
by this change and need individual finalization/admission review.

To roll back this follow-up, restore only its backed-up observation validator
and the two documentation files, then remove observationClosure.test.mjs.
Preserve the earlier verified helper correction and unrelated dirty work.

Independent review additionally reproduced original-error masking at the
per-case context-close boundary. The case finalizer now records its own cleanup
status, retains the original assertion when closure also fails, and rejects a
context failure after clean work. The outer catch safely records falsy rejection
values. Three additional tests execute the actual per-case catch/finalizer;
their retained baseline passes nine and fails three before this refinement.
All twelve observation-finalizer cases and 28 focused cases pass afterward.
Earlier validation receipts remain immutable; the refined source uses the
separate validation-receipt-v2.json and main-after-case-fix.json cohort.
