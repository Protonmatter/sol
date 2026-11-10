# Saved Sun observation startup correction

The default archival Sun image can load and show its source, capture time and
failure/retry controls before the main application initializes. The main explorer
adopts that image's existing state without starting a second request. The measured
cold image paint improves, while the proposed 2.5-second budget remains open.

This is local implementation and validation evidence. The production-readiness
goal remains active. Publication and broader platform acceptance are separate.

## Cause and change

Previously, `initExplorer` assigned the image URL only after the complete main
module graph loaded. In the retained cold diagnostic, the image request started
at 8,507.8 ms and the actual `observationImage` Largest Contentful Paint (LCP)
entry arrived at 10,280 ms.

The page now declares the same pinned image URL and a high-priority image preload.
A small independent module starts one shared image controller. It handles pending,
decoded, failed and explicit-retry states. `complete` alone never establishes
success: the controller checks the decoded image's natural width. The explorer
subscribes to the controller, including a request that finished before startup.

Initial HTML contains the original source link, capture time, credits, archival
status and false-color interpretation. The build binds these values, the image
URL and preload to `observed_images[0]`. It rejects duplicate attributes, alternate
image selectors, enclosing picture sources and base URLs. It repeats visual and
early-markup validation against the copied output before publishing the stage.

The original NASA JPEG remains 182,246 bytes, SHA-256
`7429a6b0cebf8b61d4a35783937836ebc5218dd194de9508a6c3da848aa55c99`.
Its capture remains **2026-09-12 00:07:22 UTC**, and its use remains archival,
false-color EUV browsing with no model overlays. Illustrative Earth, its Sites v7
recipe, rendering shaders, orbital coefficients and numerical binaries retain
their earlier identities.

## Measured loading evidence

| Actual Sun image LCP | Earlier stage | Final application stage |
| --- | ---: | ---: |
| Cold visit | 10,280 ms | 4,184 ms |
| Warm visit | 384 ms | 288 ms |

These are individual diagnostic pairs on Chrome `156.0.8078.80`, 1440 × 900,
reduced motion, 4× page CPU emulation, 150 ms page-network latency and 200,000
bytes/second downlink. The final image entry is identified by its actual IMG ID,
URL and paint timestamp. The later `meaningful.observed_ms` polling value in the
receipt waits for the main document's module completion and is not the paint time.

LCP uses the browser's contentful-paint entries; its candidate history matters when
separating early text from the larger image. See the [W3C LCP working draft](https://www.w3.org/TR/largest-contentful-paint/).

The loopback server supplies uncompressed assets and records all requests.
Service-worker traffic throttling was not established by this page-only CDP
experiment. These pairs do not establish the proposed ten-cold/ten-warm profile,
p75, a physical-device result, field performance or an accepted P00 byte baseline.
The recorded final cold sample still exceeds 2.5 seconds. Interaction latency,
session-window CLS and physical animation budgets require their own qualification.

An intermediate image-only stage recorded 4,080/308 ms. A subsequent experiment
lowering 117 module-preload priorities recorded 4,064/212 ms and showed no material
cold improvement. That priority change was removed, restoring the earlier exact
image-only HTML hash before the metadata correction. Both experiments are retained.

## Verification

The final application stage is
`build/startup-performance-20261107-01/site-final-02`, release
`local-sun-startup-20261107-final-02`, base path `/sol/`.

- Manifest SHA-256: `73c1a4f0bb4bbdf6696fede07d754b05d7b98d734f360117beb0a424a46d8aa2`.
- All 238 assets and 216 source owners pass size/hash and source correspondence.
- Both WASM hashes match the approved dependency stage. The science fingerprint
  remains `05443ad60cda7113601ab7ce689d77ba442e702cf11d2c51ee9f381da2573d22`.
- The UI fingerprint is `970d61f93c9592bb14d1ca2ecd7e98a3b8ef95bd74b46e9bf5eda1cbb8b37ca0`.
- The 16-step application run passes with equal before/after inventories of 1,708
  source files: 1,602 Node tests in each source/staged run, 33 artifact tests,
  25 distribution tests, six observation tests, 127 JavaScript typechecked files,
  static/UX checks, staging, startup, native/software rendering and 24 experience
  checks. Each rendering backend also passes seven trusted-touch cases.
- Combined runtime line coverage is **18,007 / 18,452 = 97.58%**, above the existing
  90% floor. Node-only line, branch and function floors also pass.

Independent review identified two missing guards: early source/capture metadata
and browser source selectors. Their added negative tests first failed and then
passed after correction. The earlier 12-step run remains retained as an earlier
cohort, not final evidence for those missing guards.

A later review found that static metadata could satisfy the original adoption
predicate. Only the validation tool changed after the final application run.
Its corrected probe reads the actual tokened explorer module without initializing
it. The final four actual-browser cases pass:

1. Ready before main initialization: ready state adopted, one image request.
2. Failed request and trusted retry before main initialization: ready adopted,
   two image requests and one trusted retry.
3. Failed request adopted by the main application, followed by trusted retry:
   failed becomes ready, two requests and one trusted retry.
4. Pending request adopted by the main application: loading becomes ready when
   the same one held image request completes.

The corrected tool rejects an intentionally empty main entry: the early image is
visible with correct metadata, while the real explorer remains `loading`. This
negative exits 1 as required. It also rejects the retained earlier stage that
lacked early provenance. Neither negative grants acceptance to a failed probe.

`validation-02/results.json`, `probe-final/results.json`, `stage-integrity.json`
and `final-diagnostic-41bbb7d6-2547-49c7-bee9-619d40bfed03/evidence.json` retain the
commands, hashes, snapshots, assertions and source boundaries under
`build/startup-performance-20261107-01/`. The final diagnostic ends with unchanged
source and staged bytes. A private orchestration script's initial parse failure
is also retained; it occurred before any child command launched.

The staged source archive predates the validation-tool correction and final
documentation. Current application owner hashes still match. Regenerate delivery
artifacts from the final reviewed checkout before any authorized publication.

## Repeating the focused browser checks

Use the existing locked development tools, Python and Node 22.12 or later. Set
`CHROME_BIN` to an installed compatible Chromium executable. The tool serves the
retained stage on an owned loopback server, blocks external page requests and
closes its own browser. Service-worker bypass is explicit functional-test scope.

```powershell
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node tools/observation_startup_validation.mjs --web-root=build/startup-performance-20261107-01/site-final-02 --out=coverage/observation-startup
```

Normal execution exits 0 after all four cases. The explicit local negative below
must exit 1 and record `Main application did not adopt the shared observation
state`; its visible early image alone must never satisfy adoption.

```powershell
node tools/observation_startup_validation.mjs --web-root=build/startup-performance-20261107-01/site-final-02 --out=coverage/observation-startup-no-init --fault=main-no-init
```

## Open requirements and rollback

Offline installation still precaches Moon elements, full star catalogue and
geography as critical data. Their roles and the worker roles are unchanged. This
conflicts with the proposed initial-Sun demand-loading target. A future cache
change must preserve or explicitly revise first-offline-entry guarantees, and
handle visible failure and recovery for catalogue/geography requests. Existing
star/geography console-only failure paths and the latched geography retry remain
open findings. This pass does not resolve them.

The [accuracy contract](ACCURACY_CONTRACT.md) and [TOP2013 report](TOP2013_PRECISION_20261106.md)
retain sampled 1900–2200 evidence and approximate exploration across years 1–9999.
This UI change adds no new orbit-accuracy bound. The deep sub-arcsecond objective,
manual device/accessibility acceptance, current-source hosted/served proof,
qualified rollback and outstanding cloud-result acceptance remain separate work.
No commit, push, publication or production deployment occurred.

The exact pass changes eleven files listed below. Original versions of the six
pre-existing files are retained under this audit's `original/` directory. Rollback
requires checking current hashes against this pass, restoring only those original
files and removing only the four newly added code/test files and this new report.
Preserve later edits and all unrelated working-tree changes. Rebuild and rerun
the relevant checks after rollback; do not reset the repository or remove the audit.

## Changed files

- `apps/web/index.html`: early pinned image request, small entry and provenance.
- `apps/web/js/explorer.js`: adopt the existing media controller.
- `apps/web/js/observationMedia.js`: shared pending/ready/failed/retry lifecycle.
- `apps/web/js/observationBoot.js`: independent early-media entry.
- `tools/build_web.py`: source/metadata/selector and copied-output validation.
- `tools/observation_startup_validation.mjs`: actual-browser positive and negative checks.
- `tests/web/explorer.test.mjs`: already-completed image adoption regression.
- `tests/web/observationMedia.test.mjs`: lifecycle, retry, stale-source and idempotence cases.
- `tests/python/test_release_artifact.py`: fifteen invalid-source and four copied-readback cases.
- `docs/STATUS.md`: current result and open loading budget.
- `docs/SUN_STARTUP_20261107.md`: this evidence, workflow, limits and rollback record.
