# Experience validation terminal-error correction — 2026-11-06

The local experience checker now rejects page errors arriving during its final
asynchronous state read or browser shutdown. It attempts both owned cleanups,
preserves the original interaction failure, records cleanup failures and saves
the terminal receipt before printing success. The application, Illustrative
Earth, numerical code, WASM and original interaction/performance gates are unchanged.
Requirements: `SOL-TEST-001`, `SOL-REL-001`, `SOL-DOC-001`.

## Reproduced defect

P2 — `tools/experience_validation.mjs`, final acceptance and `finally`:
the original empty-page-error assertion ran before the final awaited interaction
read. The checker then appended a passing result and printed `PASS` before
writing evidence and closing the browser/server. A late page error could therefore
be saved alongside a passing result or arrive after the saved receipt. A rejected
browser close also skipped server closure, and cleanup errors were not saved.

Seven regression groups execute the production listener, ownership declaration
and terminal control flow, with only the expensive interaction body and external
browser/server I/O replaced. All seven fail against the frozen original and pass
after correction. The cases cover errors during the final read and browser close,
each cleanup failing, an original interaction failure plus both cleanup failures,
clean success ordering and capture-only diagnostic behavior. These tests do not
claim real-browser timing coverage; the paired browser control below supplies it.

The change preserves the existing early page-error assertion and every original
interaction, layout, worker and performance assertion. Capture-only mode still
retains diagnostic errors without claiming acceptance. The receipt adds a terminal
`status` and per-owner `cleanup` result; existing successful check groups remain.
Both cleanup attempts precede final serialization. An interaction error remains
the primary error if cleanup also fails; all observed cleanup failures are saved.

## Actual browser sensitivity and ordinary acceptance

All browser executions use the existing `local-lgpl-20261106-02` artifact under
`build/lgpl-component-20261106-01/site-final`, mounted at `/sol/`, with manifest
SHA-256 `4bbebdd5324bae5886933efb5cd09d4f4387e3d4afea0d4ae512f7f7ee41b41a`.
All 236 staged assets and 214 source owners match before the ordinary run.
The stage is unchanged. Its source SHA records the baseline lineage, not a clean
or hosted revision of the dirty working candidate.

The ordinary command completes **24 original check groups**, with no captured
uncaught page errors and both browser/server cleanup calls completed. The final
receipt says `passed`; success is printed after the receipt is written. The
300-pair, 4x-throttled position-only sample records **7.8 ms p95**, below the
unchanged 16 ms gate. Its JSON diagnostic records 25.6 ms p95 and has no new gate.
Chrome reports version 156.0.8078.80. This UI workflow uses the existing software
renderer launch flags; it does not independently attest GPU backend identity.

The test-owned negative protocol injects a browser microtask exception only in
the final interaction read, after the original assertions. A Node loader supplies
the transformed tool source in memory, resolving its original imports normally.
Repository and staged bytes are never patched. A separate observer establishes
that a real browser `pageerror` was delivered. Each variant retains its original
and transformed source hashes, full log, complete workflow and final receipt.

| Same late-error scenario | Original checker | Corrected checker |
|---|---|---|
| Actual page error delivered | Yes | Yes |
| Error saved in receipt | Yes | Yes |
| Terminal result | `passed` | `failed` |
| Process exit | 0 | 1, as required |
| Prints `PASS` | Yes | No |
| Saved browser/server cleanup results | Absent | Both `closed` |

The corrected process's exit1 is the intended sensitivity result. The controlling
protocol exits0 only after validating both variants and unchanged source inventories.
This proves the checker rejects the injected error; it is not an unexplained
application failure or a relaxed interaction gate.

The complete `npm test` run passes **1,552 tests**, with zero failures, skips or
cancellations. Both the ordinary campaign and final paired negative campaign
retain identical inventories of **1,693 repository source entries** before and
after execution. The original checker and first regression failures remain frozen.
The selected source/lock inventory does not attest a hostile installed dependency tree.

## Evidence and reproduction

Evidence is retained under `build/experience-closure-20261106-01/`:

- `before/`, `regressions-before-recorded.log` and its exit record bind the original
  checker and seven failing regressions. The corrected focused run passes seven.
- `invocation-9025dcf1a318457aaaf53e2fbab183af/` contains the complete Node run,
  ordinary experience workflow, terminal exits and equal source inventories.
- `negative-b097fd9ff63a4faa8ef9925a754e437a/` contains the final paired browser
  control, both receipts, logs, injected-source identities and equal inventories.
- The first negative-control attempt fails during Node startup because Windows
  `--import` requires a file URL. The second completes the original browser run
  but fails its extra observer's exact error-string match: Chromium supplies an
  `Uncaught Error:` prefix. Both attempts remain separate. The corrected protocol
  matches the injected marker without weakening any product assertion or deadline.
- Final checks, scoped diff, source readback and independent review retain their
  own hashes. No failed attempt is relabeled as a passing campaign.

Run the normal checker with fresh output directories and the existing stage:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --check tools/experience_validation.mjs
node --test tests/web/experienceClosure.test.mjs
npm test
node tools/experience_validation.mjs --web-root=build/lgpl-component-20261106-01/site-final --out=build/experience-closure-review-new
python tools/validate_sdlc.py
python tools/validate_docs.py
```

## Limits and rollback

The historical export-Cancel timeout remains unexplained. This investigation
found a separate checker defect; passing current interaction cases do not identify
the timeout's cause. Fresh whole-browser GPU, Sky, coverage, Rust/WASM and Python
campaigns were not repeated for this validation-only change. Earlier results
retain their individual source cohorts. No orbital accuracy claim is added.

The seven focused cases do not qualify browser startup, screenshot-capture or
evidence-write failures, or cleanup that never settles. Physical-device, manual,
hosted-current-source, served-release and separate Google Cloud-result acceptance
remain open. The supported browser connection was retried and still reports
disabled local browser use; the existing cloud job was neither restarted nor signaled.

Only the checker, its new regression file and three documentation files change
in this pass. No application, dependency, licensing, workflow, commit, push or
deployment changes. Rollback reverses only this pass's acceptance/cleanup hunks,
test file and documentation additions using the frozen-before diff. Preserve all
earlier working changes and retained evidence.
