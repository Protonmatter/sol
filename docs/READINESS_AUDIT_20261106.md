# Local readiness audit — 2026-11-06

The current complete native-GPU and SwiftShader browser runs and the deeper Sky
workflow pass. The deeper experience workflow remains **held** after fresh
focus, label-clearance and diagnostic performance failures. Rust and JavaScript coverage meet
the unchanged floors. This audit grants no production, scientific, hosted,
cross-platform or operational qualification. Illustrative Earth, JavaScript,
orbital models, generated data and both WASM binaries are unchanged. The single
application change adds a required orbit-guide module preload to the HTML page.

The final tested stage is `build/readiness-preview-20261106-02/site`, release
`local-readiness-preview-20261106-02`, mounted at `/sol/`. Its manifest SHA-256 is
`550a4fc66e20c3efa0bd701bf27e189b92800894cc3127e4cab7a6c13546268b`.
The manifest's source SHA identifies the existing Git baseline; the dirty working
candidate is not thereby a clean or published revision. The manifest validator and
staged-source coverage checks pass. Both fresh browser cohorts retain the exact
manifest and all 19 current validation-tool hashes. All 208 source owners are
retained; only `apps/web/index.html` changed from the prior fingerprinted stage.
All 126 JavaScript source owners, 66 texture owners and the scientific component
fingerprint are identical. Served query-token changes follow the new release ID.

## Corrections and observed evidence

`tools/sky_validation.mjs` and `tools/experience_validation.mjs` previously served
staged files without stripping the declared mount. The staged root's `/sol/`
redirect therefore missed the immutable application. Both now use the preview
server's shared validated resolver, including the experience tool's independent
failure and entry pages. Raw-source experience previews retain their `/` default.
Sky mock and redirect fixtures retain their separate origin-root routes.

The existing static web gate exposed the missing `js/orbitLines.js` preload. The
added HTML hint uses the same bare module URL as the renderer's import, within
the immutable namespace. An intermediate query-stamped hint passed the path-only
static check but would not preload the actual import; that finding and the
intermediate artifact remain retained. The final preload and import resolve to
exactly the same URL, and the unchanged static check passes.

Context checks previously included Sun controls intentionally hidden under their
own explicit `hidden` ancestors. The shared `readContextLayout` excludes only that
conditional context population. An active action hidden accidentally by CSS still
fails its zero-width check; required navigation and System shortcuts remain
mandatory. Sky records the excluded IDs and ancestors. A reviewed initial
alternative that filtered every empty client rectangle is retained as rejected
evidence because it could conceal an accidental CSS-hidden action.

The experience check's 16-label cap also predated the renderer's explicit 14/24
narrow/desktop policy. The saved failure contains 17 separated labels; both the
current Git baseline and the September baseline already use 14/24. The corrected
check uses the renderer's integer `clientWidth` for that breakpoint, including the
599.6-pixel DOM rectangle / 600-client-pixel boundary found during independent
review. Actual fractional rectangles separately determine clipping. The existing
3.9-pixel pairwise clearance remains; new assertions reject clipped labels,
duplicate IDs, invalid geometry and empty populations. Desktop and 390-pixel
captures are checked independently. The app's label policy is unchanged.

The experience tool now saves System state before label assertions and records
the error, viewport, relevant element/scroll geometry and a screenshot on failure
when the browser remains available. A bounded 256-entry pointer/click/focus trail
records event targets and coordinates without input values or changing events.
Evidence is written in `finally`; browser and local-server cleanup remain in place.

## Completed local checks

| Check | Result and scope |
|---|---|
| Rust workspace / all features, locked and offline | 228 tests pass; 8,798/9,170 lines, **95.94329%**, at the unchanged 90% floor. All 68 source/data input hashes remain stable. Local Windows ARM64, Rust 1.96.0 and the installed native LLVM toolchain. |
| Complete Node suite | **1,514 pass**, zero failures, skips or cancellations. |
| Independent Node coverage gate | Lines **98.34%** (27,488/27,952), branches **91.32%** (7,599/8,321), functions **96.41%** (994/1,031); all existing 90% floors pass. |
| Whole web runtime coverage | **97.57% lines** (17,900/18,345) after fresh Node collection plus the fresh final-stage native Chromium cohort. All hand-written runtime modules remain in the denominator. |
| Web typecheck | All 125 JavaScript files pass the existing pinned TypeScript check. |
| Complete native and SwiftShader browser runs | Both pass original gates with physical spin, Earth/Sun semantic visuals, moon shadows, camera continuity and the permanent orbit-guide regression. Guide differences are 1,295 native / 1,075 software pixels, with all 34 expected curve samples matched and zero opaque-core changes. |
| Sky workflow | Nine check groups pass, no browser errors; 1 mock request and **0 redirect-target requests**. Original consent/denial/recovery, actual workers, keyed focus, sharing/reload and 1440/900/390/320 reflow assertions retained. |
| Initial experience cohort | The preceding `local-orbit-fingerprint-20261105-01` stage passes all 24 groups, with 17/24 desktop and 12/14 mobile labels. That completed run does not override the later final-stage failures below. |
| Final-stage experience workflow | **Held:** one run retains focus on `orreryDetail` after the Date & time click; the later traced run fails the unchanged 3.9-pixel clearance gate for Mercury/Venus and Earth/Moon. No browser console errors accompany those failures. |
| Local raw-position microprofile | The preceding completed cohort records **6.2 ms p95** below the unchanged 16 ms cap. The final-stage frame diagnostic later reaches the same 300-pair / 4x-throttled check and **fails at 22.1 ms p95** (median 18.25 ms, max 40.6 ms); all samples are retained. No cause or general device-performance bound is established. |
| Export resize diagnostic | Twenty additional phone-to-desktop export/Cancel sequences complete with no browser errors; see the unresolved earlier timeout below. |
| Focus diagnostics | Two separate 30-iteration context-action diagnostics complete, one with click geometry and one with immediate repeated resizing. They do not reproduce or resolve the failed full-run focus step. |
| Consecutive label frames | Twelve retained final-stage frames have stable model/metadata times, no first/second rectangle drift and no spacing failures. Their diagnostic run still exits1 at the original raw-position performance cap, and they do not erase the earlier overlap. |

The targeted regression groups cover `/` and `/sol/` resolution and escaping,
explicit-hidden versus accidentally CSS-hidden context actions, mandatory controls,
label caps and their fractional breakpoint, clipping, clearance and invalid inputs.
Failed routing, hidden-control, label and review experiments remain separate from
the accepted cohorts under `build/readiness-audit-20261106-01/`.

Independent review records are `review.json`, `final-review.json` and
`label-review.json` in that directory. The latter accepts the bounded correction
and initial completed local experience run with SHA-256
`0bef34d5b7e93164cdca834c46534fa6ba2b99bcb7ff0fb0ed5d4a8c3c0df97a`.
It retains the initial breakpoint finding and its resolution; no original report
is overwritten. Each report explicitly withholds release qualification.

## Reproduction

Use installed locked dependencies and the existing staged artifact. Choose new
output directories rather than replacing the retained audit. Set `CHROME_BIN` to
the installed Chromium executable before running the two workflow tools.

```powershell
node tools/sky_validation.mjs --web-root=build/readiness-preview-20261106-02/site --out=build/sky-review-new
node tools/experience_validation.mjs --web-root=build/readiness-preview-20261106-02/site --out=build/experience-review-new
node tools/check_node_coverage.mjs --output-dir=build/node-gate-new
node tools/collect_node_coverage.mjs --web-root=build/readiness-preview-20261106-02/site --output-dir=build/node-runtime-new
python tools/typecheck_web.py
python tools/validate_docs.py
python tools/validate_sdlc.py
python tools/validate_ux_contract.py
```

The Rust receipt retains the exact locked/offline all-features command, child-only
linker/coverage environment, source inventory and native LCOV summary. The coverage
floor uses LLVM's native line totals, not a different count reconstructed from
individual LCOV `DA` rows.

## Remaining evidence and release holds

The two final-stage experience failures remain unresolved. The first failure
records Earth details focus after clicking Date & time, before event tracing was
added. Its screenshot cannot identify which control received the pointer click.
The synchronous application handler and passed focused repetitions do not prove
a cause. The second failure retains a coincident Mercury/Venus pair and an
overlapping Earth/Moon pair in `system-state.json`, with screenshots and the new
event trail. Neither the geometry tolerance nor any action, assertion or timeout
was relaxed. The subsequent twelve-frame diagnostic does not reproduce the
overlap, but records the separate 22.1 ms p95 performance failure. Further cause
isolation is needed before deciding on an application or harness correction;
no speculative rendering or numerical fix is applied.

One intervening full experience run timed out waiting for the export Cancel
button to fit vertically after a phone-to-desktop resize. That run preceded the
new failure-geometry capture. The completed full run and twenty focused repetitions
did not reproduce it. Its cause remains **unresolved and intermittent**; neither
the timeout nor the viewport assertion was relaxed. A later recurrence should use
the new failure artifact to distinguish product clipping from test timing.

The label check measures count and geometry. It does not qualify opacity or
`visibility` states with positive bounding boxes, all label readability, screen
readers, touch devices or every GPU/browser. The local Chrome version is
156.0.8078.80; hosted execution and broader device acceptance remain separate.

The existing Google Cloud Linux job is retained. Supported browser discovery
still reports `Local browser use is disabled in Work settings`; its terminal result
could not be retrieved. This is an unavailable capability, not missing user
authorization. No replacement VM job or browser-policy workaround was started.
The guarded rendering candidate remains unpromoted pending its actual result.

The [precision target](PRECISION_WINDOW_20261104.md) remains 1900–2200, with
years 1–9999 approximate outside that target. The completed
[System](SYSTEM_WASM_PRECISION_20261105.md) and
[Sky](SKY_WASM_PRECISION_20261105.md) WASM studies retain their finite sample,
quantity, frame and clock limits. This tooling audit adds no new astrometric
samples, continuous error guarantee or deep sub-arcsecond claim.

[Coefficient/package notice clearance](PACKAGE_NOTICE_AUDIT_20261104.md),
exact-source hosted CI, cross-platform/manual acceptance, release approval and
served verification remain held or missing. No commit, push, publication,
licensing change or deployment occurred. Rollback of this audit is limited to
reviewed tool/test/document hunks; preserve unrelated working changes and all
failed evidence. The single HTML insertion can be reverted independently; no
deployed-state rollback is required.
