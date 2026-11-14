# Catalogue availability and recovery

The Solar System view now distinguishes loading, available and failed star/Moon
catalogue data, bounds each owned wait to 30 seconds, and offers an explicit Retry
outside the inspector. Repaints preserve the explanation for missing additional
moon positions. Retrying one failed resource preserves another resource's work.

This is local implementation and validation evidence. The production-readiness
goal remains active; deployment, scientific/manual acceptance and publication
retain their separate requirements.

## Reproduced problems

The actual staged application reproduced a failed star import followed by a search
message that still said the catalogue was loading. Reopening the view fetched the
same immutable URL and recovered Sirius. A separate fresh-browser Moon case showed
the failure notice disappearing after another repaint. The existing whole-source
Orrery harness reproduced the exact reset: `paint()` cleared `moonsHiddenReason`
while the optional orbital elements remained unavailable.

The geography import is currently unreachable: `textureEligible` rejects
`generated-map`, including for Earth and the Moon. Its legacy failure path was
excluded from this fix. Its data, eligibility policy and cache role are preserved.

## Behavior and ownership

- A small loader owns one request per resource through `idle`, `loading`, `ready`
  and `failed`. Concurrent calls share the pending promise; available data is reused.
- The default logical deadline is 30,000 ms. Both the timer and import settlement
  check a monotonic deadline, including settlement before a delayed timer callback.
- Leaving the view settles and cancels pending ownership, clears its timer and
  preserves already-ready or failed state. Late success, rejection and old wrapper
  finalization cannot replace or clear a newer attempt.
- The browser retains ownership of the physical import. Logical cancellation does
  not abort that fetch, and retry need not create a new transfer. The code retains
  the exact immutable release URL. URL-based module identity is described by the
  [HTML module-map specification](https://html.spec.whatwg.org/multipage/webappapis.html#module-map).
- Module exports must have the expected catalogue structure before adoption.
  Failed or malformed imports remain unavailable rather than manufacturing readiness.
- Retry targets only currently failed resources. A failed star retry remains
  recoverable while a Moon retry is still pending. Ready and loading work is retained.
- Data availability is separate from independent astronomical qualification and
  from the core planetary-engine error state. The existing accuracy notices remain.
- The persistent Moon resource notice is recomputed on repaint, alongside the
  existing visibility, sampling and epoch-window notices. Search retains static
  body facts and identifies unavailable/loading orbital positions.

The new Retry control explicitly enables pointer events inside the otherwise
passive caption and has a 44-pixel minimum height. Status text changes only when
its message changes. Focus intent is captured before disabling the button can blur
it, revoked by later interaction, navigation or a hidden document, and restored
only for the current view and retained intent. Successful data loading through a
hidden/visible cycle does not revive stale focus intent.

The loader belongs to `SCIENCE_MODULES`: helper-only changes now invalidate the
science fingerprint and classify as scientific. Actual staged-fingerprint tests
verify that science/UI fingerprints change while WASM and bundle identities remain
equal. That classification change establishes no new numerical accuracy bound.

## Final validation

The final application stage is
`build/catalogue-recovery-20261107-01/site-final`, release
`local-catalogue-recovery-20261107-final`, base path `/sol/`.

- Manifest SHA-256: `76855c9ec1d3b1002ad4e934fa12595eea183f7ddbb474d832325157efccfed8`.
- All 239 assets and 217 application source-owner hashes match their recorded bytes.
- Science fingerprint: `effe622721ba7010b4b69e926989a82c7530b9c0dfed596da5c2f2701d3b3125`.
- UI fingerprint: `3abbd54f435686c7e10ac60520303316ce560f58284655a9cf5d27654a20abed`.
- Ephemeris WASM remains `344f18dd7ce87a98762e284576a920543740dea3358473541657eab58f642c2c`;
  solar WASM remains `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199`.

The final 15-step follow-up passes with equal before/after inventories of 1,715
source files. It includes 1,633 Node tests in each source/staged run, 128 JavaScript
files typechecked, static/UX checks, staging, eight catalogue cases, two deliberate
failure checks, four saved-image startup cases, native/software rendering, seven
trusted-touch cases per backend, 24 experience checks and coverage merging.
Combined runtime line coverage is **18,145 / 18,590 across 120 modules — 97.60%**.
Existing 90% coverage floors remain unchanged.

The actual browser catalogue cases pass on Chrome `156.0.8078.80`:

1. A real tab becomes hidden and visible before a held retry completes; data
   recovers and focus remains where it was before response release.
2. Star rejection, trusted Retry and recovery at 320 pixels.
3. Moon rejection and recovery at 390 pixels after focus moves to the canvas.
4. A held star import reaches its logical deadline, then recovers on the same URL.
5. A held Moon import reaches its logical deadline, then recovers on the same URL.
6. Star recovery remains usable while Moon data is pending.
7. A star retry fails again while a Moon retry is held; a second star retry recovers
   without restarting the Moon request.
8. Navigation precedes a late Moon response; the inactive view stays hidden and
   focus is preserved, then reentry adopts the available data.

The two final deadline observations are 30,023 ms and 30,091 ms from the fixture's
HTTP request timestamps, including polling/host delay. Each timeout case retains
one physical request through logical retry and release. These observations bound
the declared application behavior, not network or hard real-time performance.
Browser checks compare the accepted epoch, metadata time, camera, selection and
nine planetary position markers around recovery. All catalogue attempts retain
their exact canonical release URLs.

The owned HTTP fixture returns controlled 503 responses or holds response delivery.
It rejects service-worker registration and enables page fetch bypass so offline
precache requests cannot be mistaken for application retries. Worker/engine traffic
is left outside page-wide request interception. Inspector-closed availability,
scrollable Retry access, pointer hit testing, trusted clicks, width/reflow and
focus/navigation outcomes are recorded. A target-module request is mandatory
before attributing failure to that catalogue.

Controlled late page-error and context-close failures both exit 1 as required.
Their receipts retain the injected failure, attempt remaining cleanup owners and
reject acceptance. Runtime errors are checked after cleanup and again before the
final receipt. Neither negative is promoted to a successful application scenario.

Native Linux ARM64 Node `22.23.4` separately passes all **31 focused lifecycle and
ownership tests**. The run pins 140 copied inputs, uses a read-only source mount and
no network, and confirms the exact owned container is absent afterward. The
whole-Orrery tests double engine/GPU I/O boundaries. This does not establish Linux
browser, npm-install, numerical-reference or Google Cloud qualification.

## Source cohorts and retained attempts

An earlier selected 18-command cohort also passes, including 33 artifact tests,
nine actual Sky cases and 22 expanded physical-rendering checks. It combines the
eight successful preparation steps in `validation-03` with `completion`'s ten
steps. The failed earlier catalogue attempt remains retained in its original
receipt. The preparation/continuation boundary changes only the validation tool.

After that cohort, review found one remaining hidden/visible focus boundary. The
final production change is exactly one added visibility-handler line clearing
focus intent. Removing that line reproduces the preceding Orrery source hash
byte-for-byte. A new whole-source test first failed and then passed; the final
15-step follow-up repeats the affected Node, browser, rendering and interaction
checks. Earlier Sky/expanded-physical evidence retains its earlier source cohort.
No numerical or rendering formula changes occur in this final focus correction.

Earlier diagnostics retain their actual limitations: an observation deadline with
no target request; a core System wall-deadline failure before catalogue loading;
the initial passive-caption click miss; disabled-button native focus loss; and
offline precache traffic initially miscounted as application module traffic.
These were not accepted as passing catalogue scenarios. The strict canonical-URL
assertion was preserved while the fixture isolated offline-install traffic.

The complete raw record is under `build/catalogue-recovery-20261107-01/`, including
`source-inputs.json`, original-file backups, red/green tests, `final-validation`,
`completion`, `stage-integrity.json` and
`linux-node22-77d9bf5d3185446b932609fb6cf46df6`. Final documentation is written after
runtime terminal/postchecks. The staged source archive therefore predates this
report and the final status update. Rebuild delivery artifacts from the final
reviewed checkout before any authorized publication.

## Repeating the browser checks

Use the existing locked development tools, Python and Node 22.12 or later. Set
`CHROME_BIN` to an installed compatible Chromium binary. No credentials or cloud
permissions are needed for this owned loopback fixture.

```powershell
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node tools/catalogue_recovery_validation.mjs --web-root=build/catalogue-recovery-20261107-01/site-final --out=coverage/catalogue-recovery
```

Normal execution exits 0 only after its selected checks and cleanup pass. The
default runs all eight cases. `--case=stars-retry-visibility` selects one diagnostic
and records `full_suite: false`; it cannot substitute for the complete suite.
`--out` selects the receipt/screenshot directory. The following deliberate negative
must exit 1 and retain the controlled late runtime error:

```powershell
node tools/catalogue_recovery_validation.mjs --web-root=build/catalogue-recovery-20261107-01/site-final --out=coverage/catalogue-late-error --case=stars-reject-phone --fault=late-pageerror
```

`--fault=context-close` similarly tests cleanup rejection after closing the context.
The tool closes only its owned context/browser/server and attempts remaining owners
when one fails. Its receipt records the exact test conditions and failures.

## Remaining requirements and rollback

Logical deadlines cannot preempt blocked synchronous JavaScript; overdue settlement
is rejected when execution resumes. A canonical retry can remain unavailable if
its source still fails. Offline-critical catalogue roles are unchanged. The initial
Sun demand-loading and controlled performance profile remain open; this pass adds
no new Sun loading-time measurement. Illustrative Earth and original application
licensing are preserved.

The [accuracy contract](ACCURACY_CONTRACT.md) still separates sampled 1900–2200
evidence from approximate years 1–9999. No new orbital-accuracy or physical UTC/UT1
guarantee follows from this UI/data-availability correction. Manual accessibility,
physical-device and broader-browser acceptance, current-source hosted/served proof
and a qualified release rollback remain open. The fresh browser API readback still
returns `Local browser use is disabled in Work settings`; the earlier cloud result
remains unaccepted and no new cloud work was started.

No commit, push, publication or production deployment occurred. Rollback requires
checking current hashes against this pass, restoring only the seven original files
retained under `original/` and removing only the seven additions listed below.
Preserve later edits and unrelated working-tree changes. Rebuild and rerun relevant
checks after rollback; do not reset the repository or remove the audit.

## Changed files

- `apps/web/js/catalogueLoader.js`: bounded, deduplicated ownership and cancellation.
- `apps/web/js/orrery.js`: independent recovery, persistent notices and focus intent.
- `apps/web/index.html`: loader hint and inspector-independent status/Retry controls.
- `apps/web/styles.css`: accessible pointer-enabled Retry target.
- `tools/build_web.py`: scientific fingerprint/category boundary.
- `tools/catalogue_recovery_validation.mjs`: actual browser fault/recovery cases.
- `tools/catalogue_case.mjs`: cleanup and late-error acceptance.
- `tests/web/catalogueLoader.test.mjs`: clock, deadline, cancellation and stale outcomes.
- `tests/web/catalogueCase.test.mjs`: late/falsy cleanup failures and owner completion.
- `tests/web/orreryCatalogueRecovery.test.mjs`: whole-source recovery and focus races.
- `tests/web/helpers/orreryHarness.mjs`: controlled resources, status hosts and cleanup.
- `tests/python/test_release_artifact.py`: actual helper-only fingerprint regression.
- `docs/STATUS.md`: current result and remaining requirements.
- `docs/CATALOGUE_RECOVERY_20261107.md`: this evidence, commands and rollback record.
