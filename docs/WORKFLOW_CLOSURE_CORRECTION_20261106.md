# Integrated workflow terminal-error correction — 2026-11-06

The Sky, main browser and full physical-rendering checkers now include late runtime
errors and cleanup failures in their terminal results. Each original checker
accepts a real browser exception injected at finalization; each corrected checker
rejects it with exit1 and a failed receipt. The ordinary staged workflows pass.
Illustrative Earth, rendering, orbital models, source assets and WASM are unchanged.
Requirements: `SOL-TEST-001`, `SOL-REL-001`, `SOL-DOC-001`.

This extends the separately verified
[experience-checker correction](EXPERIENCE_CLOSURE_CORRECTION_20261106.md).
It establishes bounded local validation-tool correctness. Production and release
acceptance retain their separate requirements.

## Reproduced defects and changes

| Caller | Reproduced terminal gap | Corrected behavior |
|---|---|---|
| `sky_validation.mjs` | Passing summary and output preceded browser/server shutdown. A late page error escaped acceptance; rejected browser cleanup skipped the two servers. | Attempts browser, application-server and redirect-server cleanup independently, checks errors afterward, saves the complete result and then prints overall success. |
| `browser_validation.mjs` | Runtime errors arriving during cleanup escaped its last acceptance check. Cleanup failures could replace the original gate error. Worker errors recorded during fulfilled disposal could be missed, including after optional-memory cleanup released the owner. | Preserves the primary error, records three cleanup actions, retains the actual worker error-array reference, saves all final runtime errors and rejects late errors before overall success. The original-gates result remains separate. |
| `physical_rendering_validation.mjs` | `passed=true` preceded shutdown; later page/console errors could coexist with acceptance. Server close was requested without awaiting its callback. | Attempts both cleanup actions, awaits server closure, checks page/console errors afterward and records `passed=false` with exit1 on a terminal failure. |

All original interaction, image, worker, privacy, source, deadline and performance
assertions remain. The existing owned-browser helper and its bounded fallback are
unchanged. A cleanup status of `completed` records fulfillment of that API action;
six separate process readbacks establish absence of the observed control-browser
roots. These observations do not measure physical memory or every descendant process.

Catch handling also retains failures represented by `null`, `undefined`, `false`,
zero or an empty string. The built-in `node:util` native-error check preserves
native `Error` identity across JavaScript contexts while normalizing those primitive
rejections. No external package is added. Existing exact error-identity assertions
remain unchanged; their VM receives the same real built-in used by the caller.

## Final ordinary and unit results

All workflows use the existing `local-lgpl-20261106-02` artifact at
`build/lgpl-component-20261106-01/site-final`, mounted at `/sol/`, with manifest
SHA-256 `4bbebdd5324bae5886933efb5cd09d4f4387e3d4afea0d4ae512f7f7ee41b41a`.
All 236 assets and 214 source owners match. The artifact's base revision records
lineage; the uncommitted working candidate retains its separate file identities.

| Verification | Result |
|---|---|
| Fresh complete Windows Node suite | **1,583 pass**, zero failures, skips or cancellations, Node 24.18.0. |
| New source-backed finalization tests | **31 pass**, including cleanup rejection, original-error priority, receipt/output ordering, falsy primitive failures and actual worker-reference setup. |
| Existing late-follow-up tests | **11 pass** alongside the new suite. |
| Linux focused compatibility | **138 pass**, zero failures, skips or cancellations, Node 22.23.4 on native Linux ARM64. Source/dependency mounts are read-only; network is disabled; the exact owned container is absent afterward. |
| Main staged browser workflow | Original image, source, worker and camera checks plus seven trusted-touch cases pass. Observed backend is software; final runtime errors are empty and all three cleanup APIs complete. |
| Sky workflow | **Nine groups pass**, including actual worker execution, focus, consent/recovery, share/reload and reflow. Exactly one mock request and zero redirect-target requests remain. All three cleanup APIs complete. |
| Expanded physical-rendering workflow | **22 checks pass**, including active context recovery, Moon/Mars level-4 geometry, pinned terrain/optical sources and five submitted Mars animation draws. Observed backend is software; page/console errors are empty and both cleanup APIs complete. |

The current Earth capture was visually inspected and retains the crisp Sites v7
Illustrative appearance. Rendering pixels and calculations receive no new calibration
or accuracy claim from this tool change.

Each selected run retains equal **1,695-entry** source inventories before and after
execution. The ordinary workflow campaign predates a two-line test-fixture exit-flag
correction. Its three caller hashes, application sources and other executable inputs
match the final files. Fresh full Node and Linux tests cover the final fixture.
The earlier snapshots retain their own test versions; documentation is added after
the runtime freezes.

## Real browser error controls

The test-owned loader schedules a real browser microtask exception at entry to
the finalizer, after the original checks. It changes only the checker source returned
in memory. Repository and staged bytes remain unchanged. Each case records the
original and transformed source hashes and an independently observed `pageerror`.

| Same injected error | Original | Corrected |
|---|---|---|
| Sky | Exit0 and passing final check | Exit1, `status=failed`, error retained, three completed cleanup actions |
| Main browser | Exit0 and `status=passed` | Exit1, `status=failed`, runtime error retained, three completed cleanup actions |
| Full physical rendering | Exit0 and `passed=true` | Exit1, `passed=false`, error retained, two completed cleanup actions |

The corrected commands suppress their overall completion messages. Successful
preflight and individual original checks retain their own results. In particular,
the main browser's manifest precheck legitimately prints its own `OK` before the
workflow; it cannot substitute for the final Chromium completion message.

The strict combined admission selects six raw cases across three preserved
invocations, checks exact owner populations and command-specific terminal output,
and binds every case to reconstructed source. Both private loader versions produce
identical Sky bytes. Executing the actual loader hooks in an isolated module context
reconstructs eight source variants and parses them without running the checkers.
The negative receipts' self-declared producer hashes describe disk sources; the
loader's original/transformed hashes bind the deliberately instrumented execution.
These controlled receipts remain separate from ordinary release evidence.

## Retained failures and evidence

The complete record is `build/workflow-closure-20261106-01/`, with selected paths
and raw hashes in `admission.json`, final checks, scoped diff and independent review.
Failed attempts retain their own source cohorts and decisions:

- Initial fixture extraction did not handle CRLF boundaries and modeled the main
  browser server as a callback API. Corrected fixtures execute the real owner API
  shape, actual worker-reference setup, actual catch blocks and finalizers.
- Against the frozen original callers, the final 31-case fixture records **29
  failures and two passes**. The two final-write protections already existed.
  Removing only the worker-error reference from source returned to the fixture
  causes exactly its two relevant regression cases to fail.
- The first correction passes a complete ordinary campaign but fails six later
  adversarial groups. The same-realm normalizer then passes focused cases but
  fails two unchanged cross-realm identity tests in the full suite. Both source
  versions and failed logs remain. The built-in error check resolves those cases.
- The first Linux helper stops during host path translation before creating a
  container. The corrected file-backed Linux driver completes the selected tests.
- The first negative protocol records the Sky pair, then stops before launching
  the main browser because its injected helper displaced the script hashbang.
  The corrected loader preserves the first line. The second protocol records both
  expected browser outcomes but rejects the manifest precheck's unrelated `OK`.
  Exact terminal-message admission resolves that checker mistake without changing
  raw receipts. The physical pair completes under the corrected protocol.

The failed whole-protocol statuses remain failed. The combined admission verifies
the individual observed outcomes and source correspondence explicitly.

## Reproduction and limits

Use the installed locked tooling and fresh output directories:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$qaReviewRoot = 'build/workflow-review-' + [guid]::NewGuid().ToString('N')
npm test
node --experimental-vm-modules --test tests/web/workflowClosure.test.mjs tests/web/validationLateErrors.test.mjs
node tools/browser_validation.mjs --web-root=build/lgpl-component-20261106-01/site-final --output-dir="$qaReviewRoot/browser" --backend=swiftshader --physical-spin=true
node tools/sky_validation.mjs --web-root=build/lgpl-component-20261106-01/site-final --out="$qaReviewRoot/sky"
node tools/physical_rendering_validation.mjs --web-root=build/lgpl-component-20261106-01/site-final --out="$qaReviewRoot/physical" --backend=swiftshader --context-loss --mars-optical-animation --terrain-close-detail
python tools/validate_sdlc.py
python tools/validate_docs.py
```

Current-source native GPU, whole coverage, Rust/WASM, broad Python, hosted CI,
served-release, physical-device/manual and separate Google Cloud-result acceptance
retain their own evidence requirements. Startup and indefinitely hanging cleanup
are outside the focused finalizer cases. Installed dependencies are pinned and
mounted as recorded; a hostile-install attestation is outside this work. Standalone
GPU programs retain their separate source and acceptance scopes. The historical
export-Cancel timeout remains unexplained.

Only three checkers, two tests and three documentation files change. No application,
accuracy contract, license, external dependency, workflow, commit, push or deployment
changes. Rollback reverses only this pass's recorded eight-file diff; preserve all
earlier working changes and retained evidence.
