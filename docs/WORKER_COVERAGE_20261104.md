# Worker coverage and deadline follow-up — 2026-11-04

The collector now arms Profiler before execution and enables Debugger only during
source collection. Current Windows/SwiftShader validation passes. The separate
v7 intercepted Linux production-client probe fails before collection and remains
failed. The [later fresh original full-browser command](WORKER_STARTUP_CONTROL_20261104.md)
uses the validator's existing Network blocking policy, passes Sun/Sky and reaches
System/WebGL, then fails the original Earth draw gate. These are separate runs.
No application asset, numerical model, coefficient tier or product deadline
changes in this follow-up.

## Reproduced defects and scoped corrections

The [original Linux diagnostic](LINUX_BROWSER_20261104.md) measures about 6 seconds
of raw computation without Debugger and about 13 seconds with Debugger plus
Profiler. The old collector enabled Debugger before resuming every worker.

The corrected collector takes precise coverage before late Debugger activation,
then verifies covered module URL/script identities and retrieves source text.
Debugger shutdown runs in `finally`. A source or shutdown failure cannot publish
that worker's partial collection. Cancellation still requires both a matching
detach and Puppeteer's actual `TargetCloseError`; other errors/deadlines remain
visible.

Review reproduced a race in the initial candidate: the script clicked local Sky
recovery and immediately collected while its snapshot could still be computing.
That candidate/reproduction remain preserved. The corrected script waits for
fresh on-device provenance and an empty input error, then the worker-activity
barrier, including follow-on trajectory work. The observer preserves native
arguments, returns and exceptions, and tracks by Worker instance, full protocol
identity and generation. Stale responses cannot clear current work; observer
errors block idle acceptance. The barrier is not a lock: callers must prevent
new requests during collection. After exercising Now, the script freezes the
same displayed epoch to prevent the known 60-second refresh race.

Launch evidence also had a reproduced aliasing defect: Puppeteer mutates its
argument array while merging feature switches. Requested flags are now copied;
actual process arguments are recorded separately. Both worker helpers are added
to the source digest inventory, expanding it from 14 to 16.

| Candidate helper | SHA-256 |
| --- | --- |
| Worker coverage | `c70c0507f47c38247dda408550b13625816eab6a486ec9081deb74ba6c9df921` |
| Worker activity | `ad998978b4c37fa43e80825fbb45230d67f8904308b15871861b250f59a36060` |
| Browser validator | `40566300d9063ab7720cc3c8a538c695a5a145c8b5de9bba787412b5cd5c1ad0` |

All 65 focused tests pass, including recovery/trajectory barriers, source/shutdown
failure, real installed Puppeteer normalization and strict cancellation/deadline
controls. Independent source review and ten additional controls pass; receipt:
`514d62ae4126523931cbc52d5b3c575b06a20858e5d7ebd866d86bd4278ee5de`.
The initial open-P2 receipt remains unchanged.

## Actual Windows execution

The module probe uses the exact staged Sky client, worker, imports and WASM with
the unchanged 10-second timer. Three requests through one worker, collecting
between them, take 1,971.4, 1,900.8 and 1,945.8 ms. Their structured JSON outputs
are identical, with 117 unique bodies and strict epoch/observer binding. The
10/5/5 covered module entries match staged source bytes and each collection
records one executed `skySnapshot` call. Later requests are warm repeated calls,
not independent cold-browser measurements.

The full browser command passes with Chrome 156.0.8078.48 and actual SwiftShader
contexts against unchanged stage manifest
`9dd2d12c14eeda5a385d5c48002abd71da3c0fe39b93ede4952cf02bff15d65a`.
It retains the original Sky, System/WebGL, physical-spin, producer, visual and
coverage gates, finishes in 109.924 seconds and passes source postchecks.
Browser-evidence SHA-256:
`5dc18af09ef6adfaac17d1638fbc520a0a5b5ce94eafaa1168085823782952e6`.
The first Windows wrapper fails before Chrome launch because its absolute Node
watchdog import needs a file URL. That failure is separate and preserved.

Fresh Node coverage runs all 1,453 tests successfully. The new merged report
retains 116 handwritten runtime files: 17,802 / 18,249 lines (97.55%), at the
unchanged 90% floor; branches are 8,098 / 8,564 (94.55%). Independent saved-evidence
review checks strict snapshots, source-exact modules, physical records, 16 helper
pins and every file's remerged counters. Review receipt:
`cc27418f776be58eb0094913d4e396eaa31bbcdb0ae5c316a59be924be31e58c`.
Its initial unsuitable large-object verifier assertions are preserved. The final
bounded verifier passes in 1.77 seconds with a 512 MiB heap cap and 30-second
timeout; its owned verifier is absent. No foreign process is signalled.

## Earlier v7 intercepted Linux probe remains failed

The new 604-file/429-blob input manifest is
`8f890f782f01922ed831d25c217130fb710d36a3df6c7292bfc0272db3abda66`.
Pre-execution review reproduces and closes a missing output parent and missing
returned probe directory. Only final v7/archive03/bootstrap03 executes; earlier
candidates stay preserved. Review receipt:
`254df3c38791b729f12b109737cc9be41b2b26bba70c7d98e829e1b7f7ff004e`.

Chrome 157.0.8103.38 passes identity and unchanged-stage admission after the
locked install. Its production-client diagnostic returns 1 with `Engine exceeded
its wall deadline` on the first request: zero completed requests, zero collections.
In the exact probe control flow this precedes `collect()` and its Debugger
activation. There is no protocol trace or actual V8-tier attestation. The full
UI command is never executed. Actual private-browser cleanup passes with no
remaining owned processes/errors and 11 recorded pre-existing protected-process
exemptions. All frozen/reconstructed input postchecks pass; the job stays failed.

The actual saved failed archive is 71,250 bytes, 11 ordinary members and ten
inventory-bound payloads, SHA-256
`6d7a3ad1bfc2331af04a28ab04569a488866bce35554246878957984253a3833`.
Parent admission checks every payload, all 604 current source mappings, exact
v7/input identities, six command statuses, probe failure, cleanup and the absence
of a full-browser result. Admission receipt:
`5bb98c6a37463e6b3d8723d15862b3970f0597ab9dff8ab9d28b4666a96763df`.

Independent saved-packet review reproduces those checks and preserves the failed
status; receipt:
`544b8c7edfe9367253c54dec135cd901bf50b88923449b15d068b41e3b3b83e3`.
Separate parent observations confirm driver PID 7437 and transfer PID 7667
absent, port 8081 closed, the archive unchanged and the preview closed. The
offline review does not represent a second live process scan.

This v7 probe does not establish a successful Linux client or the cause of its
deadline. The [later controlled follow-up](WORKER_STARTUP_CONTROL_20261104.md)
compares the actual production client and network policy, then runs the original
Linux browser command directly. That fresh run reaches System/WebGL and fails
the original Earth draw gate. Its separate packet preserves current rendering
and post-failure diagnostic outcomes without changing the model or deadlines.

## Reproduction and limits

```text
node --test tests/web/workerCoverage.test.mjs tests/web/workerActivity.test.mjs tests/web/browserSkyRecovery.test.mjs tests/web/browserLaunchEvidence.test.mjs
node tools/collect_node_coverage.mjs --output-dir=coverage/NEW-worker-node
node tools/browser_validation.mjs --web-root=build/production-20261104-canvas-focus-site --output-dir=coverage/NEW-worker-browser --backend=swiftshader --physical-spin=true
node tools/merge_web_coverage.mjs --node-input=coverage/NEW-worker-node/coverage-final.json --browser-input=coverage/NEW-worker-browser/coverage-final.json --output-dir=coverage/NEW-worker-combined
```

Set `CHROME_BIN` to the installed browser. Use new output names. Evidence is under
`build/worker-coverage-late-debugger-20261104/`; Linux inputs/failed results are
under `build/linux-browser-collector-20261104/`.

Rollback restores only the scoped before snapshots for the collector, validator
and existing test, then removes this follow-up's activity helper/new tests/docs
and matching status entries. Preserve unrelated work and raw evidence; do not
reset the shared tree. No new dependency, application network call, Rust/WASM,
coefficient, licensing, commit, push or deployment changes here. Windows software
rendering evidence does not qualify Linux, native GPU, hosted CI, continuous
scientific accuracy or release eligibility.
