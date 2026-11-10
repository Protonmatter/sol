# Bounded atomic model-data loading — 2026-11-06

Model-data loading now has one 30-second transaction budget and cancels an older
load when a newer load starts. Stalled fetches, body reads and hashing settle with
an error. A failed update preserves the last complete publication, and Solar
research exposes the existing Retry action. No scientific formula, accuracy
claim, appearance setting or texture changes. Illustrative Earth is preserved.
Requirements: `SOL-DATA-001`, `SOL-UX-003`, `SOL-TEST-001`.

## Reproduced failure and implementation

P2 — `apps/web/js/dataBundle.js`, `readDataBundle` / transfer helpers, and
`apps/web/js/data.js`, `loadState`:
the original reader bounded each component's bytes but had no deadline or abort
path. A fetch, stream read or hash promise could remain pending indefinitely.
Its overflow path awaited reader cancellation, which could also remain pending.
Generation checks prevented stale publication but left superseded transfers running.

The new reader accepts an optional caller signal and a bounded `timeoutMs` from
1 through 30,000; normal application calls use 30,000. One controller and deadline
cover selection, manifest and component reads, hashing and final validation.
Monotonic checks reject overdue work when execution resumes, including after final
synchronous freezing. JavaScript cannot preempt a blocked synchronous operation.

Every fetch receives the owned signal. Read/hash races settle even if the provider
ignores cancellation. An active reader is cancelled without awaiting its cancellation
promise, its lock is released, and a response arriving after cancellation is closed.
Timers and caller listeners are removed after completion. The existing byte limits,
hashes, schema checks, source coherence, immutable selection and frozen return value
remain in force; no new URL or mutable-alias fallback is introduced.

`loadState()` aborts the previous controller after advancing its generation. Old
completion cannot clear a newer controller. Only the complete current bundle can
reach the existing synchronous publication step. Error handling retains the prior
snapshot, feed, series and selection state, or the declared illustrative fallback
on first load. Saved observations and other destinations retain their separate views.

## Actual browser behavior

The baseline is the retained `local-lgpl-20261106-02` stage with manifest
`4bbebdd5324bae5886933efb5cd09d4f4387e3d4afea0d4ae512f7f7ee41b41a`.
The original loader remains pending beyond **35 seconds**, with no model-data
error or Retry action in Solar research, while its snapshot request is withheld.

The final candidate is `local-bundle-transport-20261106-02`, under
`build/bundle-transport-20261106-01/site-02`, mounted at `/sol/`. Its manifest is
`f67946e6279a5e3c18e99bd495ad51cc6fe9d8a3a0af5db391564079cd26a2ba`.
The owned Chromium protocol executes the staged application and native fetch path.
CDP interception holds only the selected page's snapshot request; it does not
replace the bundle reader, data loader, store, validators or returned JSON.

The final candidate passes all cases:

- First-load failure occurs after **30,007.8 ms** from the first transaction fetch.
  Its signal reason is `TimeoutError`; the message reads “Model data loading timed
  out after 30 seconds”. The declared fallback and Retry action are visible.
- A real Retry click loads and validates the complete bundle, clears the error
  and publishes its release-bound identity.
- A failed refresh preserves all **nine** tracked publication fields by reference
  or exact scalar equality: snapshot, live snapshot, feed, series manifest, frames,
  records, bundle identity, timeline index and selected region.
- The second real Retry recovers that refresh. Both Retry clicks are recorded
  with `isTrusted=true`.
- Starting a newer load cancels the older request with `AbortError`, and the newer
  complete bundle succeeds without a stale error or publication. The three held
  network requests are independently observed cancelled by their exact network IDs.

The original before/after protocol is retained separately from the final candidate
replay. The first private probe inspected Retry in the default observation view,
where model-data errors are intentionally hidden; it failed that assertion. The
corrected probe selects Solar research through its real control. No application
visibility rule was changed to accommodate the probe.

## Verification and source correspondence

| Check | Result |
|---|---|
| Original focused regression run | **10 fail, two pass**; the stalled operations exceed the independent observation watchdog. |
| Final focused Windows and Linux suites | **54 pass** each; Linux is native ARM64, Node 22.23.4 in the pinned read-only/no-network QA container. |
| Fresh complete Node gate and runtime collection | **1,593 pass** in each run, zero failures/skips/cancellations. |
| Independent Node coverage floors | **98.34% lines, 91.31% branches, 96.45% functions**, all above their unchanged 90% floors. |
| Fresh Node plus matching native-browser runtime coverage | **17,963 / 18,408 lines, 97.58%**, with all 117 hand-written runtime modules retained. |
| Application typecheck and static checks | All **125** files typecheck; existing web structure/preload checks pass. |
| Complete native and software browser commands | Both pass the original gates and seven trusted-touch cases. Native Sun qualities are 1K/2K/4K; software retains 1K. Actual application backends are observed. |
| Sky and experience workflows | **Nine** Sky and **24** experience groups pass. The unchanged 300-pair/4x-throttled raw-position gate records **10.3 ms p95**, below 16 ms. |
| Expanded physical rendering | **22 checks pass**, including context recovery, detailed terrain and submitted Mars animation. This command observes software execution. |

The final 12-step campaign retains equal **1,697-entry** source inventories before
and after execution. All 236 staged assets and 214 source owners correspond to the
tested artifact. Both WASM hashes match the preceding artifact; no rebuild or new
numerical claim is inferred. The science and UI fingerprints both change as intended:
`dataBundle.js` remains in the existing science-input footprint, while both changed
application modules remain in the UI footprint. No membership rule is relaxed.

The first Linux run records 53 passes and one test failure: a 20 ms test assumed
hashing began after only one request. On Windows it could pass by expiring before
hashing. The final test requires both pointer and manifest requests, proves entry
to hashing, and delivers the captured deadline callback at that boundary. The
application code is unchanged by this fixture correction. Final Windows and Linux
tests cover the corrected test; earlier browser receipts retain their own source
cohorts. Traceability and this report are added after runtime freezes.

The staged source archive records its construction-time source snapshot, including
the earlier test fixture. Its application/library sources match the executed runtime.
A later publication build must regenerate its delivery artifacts from the final
reviewed checkout, following the existing tested-source release path. These local
stages are retained prototypes and confer no publication authority.

Raw source inventories, original files, commands, exits, screenshots, stage records,
browser receipts, the Linux fixture failure, corrected runs and independent review
are under `build/bundle-transport-20261106-01/`. The immutable final stage and the
two earlier browser experiments retain distinct manifest and producer identities.

## Reproduction, limits and rollback

Use installed locked dependencies and fresh output directories. The retained browser
protocols are experiment commands with fresh UUID outputs; the report does not
instruct replacement of their original receipts.

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$qaReviewRoot = 'build/bundle-review-' + [guid]::NewGuid().ToString('N')
npm test
node --experimental-vm-modules --test tests/web/dataBundleTransport.test.mjs tests/web/dataPublication.test.mjs
python tools/typecheck_web.py
node tools/check_node_coverage.mjs --output-dir="$qaReviewRoot/node-gate"
node tools/browser_validation.mjs --web-root=build/bundle-transport-20261106-01/site-02 --output-dir="$qaReviewRoot/browser" --backend=native --physical-spin=true
python tools/validate_sdlc.py
python tools/validate_docs.py
```

The tests establish logical bounded completion and cancellation requests. They do
not guarantee that a provider which ignores cancellation physically releases its
resources. Physical-device/mobile, manual/accessibility, hosted-current-source,
served-release and separate Google Cloud-result acceptance remain open. Broad
Rust/WASM, Python and astronomical campaigns are unchanged and were not rerun.
The historical export-Cancel timeout remains a separate unresolved investigation.

Rollback reverses only the two application changes, regression/binding updates,
requirement verification paths and related documentation hunks from this pass.
Preserve earlier working changes and all retained experiments. No commit, push,
licensing, external dependency, GitHub workflow or deployment change occurs.
