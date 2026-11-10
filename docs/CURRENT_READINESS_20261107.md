# Current local readiness — 2026-11-07

Later local source corrections are documented in
[responsive DOM and Research rendering](RESPONSIVE_RENDERING_20261108.md).
The named stage05 results below remain historical, source-bound evidence and
do not qualify the subsequently updated checkout.

Sol remains implemented locally, with release qualification held. This checkpoint
reconciles the current stage05 browser artifact with the newer local Linux and
physical-rendering checks. It supersedes earlier pending labels only for the
specific checks below. Historical failures and earlier source cohorts remain
unchanged. All 27 requirements being marked implemented does not mean all
qualification evidence has been accepted.

## Tested identity and preserved behavior

The artifact is `local-startup-demand-20261107-profile-05`, mounted at `/sol/`.
Its manifest SHA-256 is
`6dc64e5da37e4a7dc9247b0cb4e8140dfbcaf906c26de48adeb142fcc9d168ac`.
It has exactly 250 assets and two identical manifest copies. All 228 declared
source-owner bindings matched the checkpoint's frozen source cohort. The later
[source-delivery fixes](NUTATION_DELIVERY_20261107.md) intentionally update the
source-rebuild instructions and create a fresh main source-materials artifact;
all stage05 files remain immutable. Its original timings and source bindings
retain their own cohort. The manifest's base revision identifies the underlying
commit, not the dirty working-tree snapshot or a new hosted build.

The approved Sites v7 Illustrative Earth remains the default. The July 2004
surface, historical cloud/night maps, exposure and display recipe are retained;
the separate source-qualified physical-rendering checks explicitly select their
reference modes. No graphics, numerical, image or application code changes in
this documentation pass. Both WASM binaries retain their prior tested bytes.
See [the Earth contract](rfcs/0009-sites-earth-v7.md),
[startup work](STARTUP_DEMAND_20261107.md) and
[the DOM-write correction](INSPECTOR_LAYOUT_20261107.md).

## Completed local checks

| Check | Current result | Scope |
| --- | --- | --- |
| Hardware response | Ten cold and ten warm visits pass; pooled feedback p95 124/108 ms; largest per-task p95 132/124 ms | Actual Qualcomm Adreno D3D11 renderer; named local lab campaign |
| Normal software fallback response | Ten cold and ten warm visits pass; pooled p95 172/165.3 ms; Focus p95 197/195.6 ms | Actual SwiftShader WebGL with observed software compositor/rasterizer; only 3/4.4 ms Focus margin |
| Startup image and layout | Original observation IMG LCP p75 2,076 ms cold in both campaigns; 308/336 ms warm hardware/fallback; maximum CLS 0.032875 cold, 0.005534 warm | Same pinned browser, fourfold page CPU slowdown and shared paced body budget; no field or physical-device claim |
| Full browser regression | Original gates and seven trusted-touch cases pass in all three rendering modes; 67 trusted pointer events per mode; errors empty and owners closed | Hardware, normal fallback and whole-driver emulation are separate cohorts |
| Combined runtime line coverage | Hardware 18,849/19,297 (97.67%); each software mode 18,847/19,297 (97.66%) | Existing complete hand-written web denominator and unchanged 90% floor |
| Linux Node unit suite | All 1,930 pass; zero failures, skips or cancellations | Native local Linux ARM64 Node 22.23.4, current full test glob, network disabled |
| Linux provider/tool suite | All 39 provider and 812 tool tests pass, without skips; combined statement-and-branch coverage 12,867/14,136 (91.02292%) across 54 modules | Python 3.12.14, coverage 7.15.2, exact current CI module scope and unchanged floor |
| Physical rendering | 22 checks pass in each of the three modes; no source differences, page or console errors; browser/server cleanup completed | Actual staged app, context loss/restoration, close Moon/Mars terrain, animated Mars optics and 390px layout |
| Artifact integrity | Complete manifest validation passes; all asset sizes/digests, exact 252-file inventory and 228 owner bindings match | Selected stage05 artifact; source archive retains its separately recorded construction cohort |

The hardware physical-rendering receipt retains four raw cancelled asset
requests. The other two retain none. These records have no standalone
unexpected-request classifier; the clean page/console error fields above do
not mean every request completed. The separate timing campaigns retain their
own validated-read classification and raw cancellation records.

The performance metric includes both the frame probe and correlated native event
timing; every declared task must pass separately in cold and warm groups at the
unchanged 200 ms limit. These results measure visible feedback after verified
core installation. Accepted model/catalogue readiness is separate: cold System
readiness reaches about 37.94 seconds in the native campaign. No timing target,
task, percentile, source image or native timing check was relaxed.

The Linux runs use a cached immutable ARM64 image, read-only source mounts and
network-disabled disposable containers. Their commands, complete logs, exits,
versions and source identities are retained. Linux CLI building and all Python
native/CLI cases run offline rather than being skipped. The source inventory
contains 1,767 entries and remains equal before/after the tests. Documentation
edits follow that freeze and have their own snapshot. These are local ARM64
results, separate from x86 canonical generation, Linux browser, macOS,
cross-OS snapshot determinism and exact-source hosted acceptance.

## Open work and acceptance boundaries

| Area | Current hold | Required next evidence |
| --- | --- | --- |
| Whole-driver software response | Recorded Research/Inspector responses still exceed 200 ms; preparation, context hints and backdrop experiments do not qualify | A correct, visually reviewed solution followed by the unchanged full timing campaign; no software target waiver |
| Astronomical qualification | The retained actual-WASM replay passes 109,900 sampled comparisons at 3,925 model epochs; geometric worst case is Uranus at about 1.5650 arcseconds-equivalent | Approved evidence for the exact body, quantity, date and observer claim; sampled maxima do not prove a continuous or sub-0.1-arcsecond bound |
| Physical and manual experience | Automated browser emulation and rendered-pixel checks are bounded local evidence | Physical mobile/browser, screen-reader, focus, contrast, full accessibility and accepted P00 baseline evidence |
| Platform and hosted validation | Current local Windows/Linux results do not identify a successful hosted run for the dirty checkout | Exact reviewed source and accepted native platform, canonical-generation, deterministic-snapshot and hosted run/artifact identities |
| Component distribution | Owner approval of the LGPL component is complete; notices and local replacement/rebuild proofs exist | Actual supporting rights/attribution, legal sufficiency, recipient delivery and final selected source/archive/package/artifact correspondence |
| Delivery and operations | Nothing in this checkpoint grants release or publication | Accepted settings/profile/registry evidence, exact served-byte readback, returning-client transition and executed production rollback |

The accuracy target remains complete UTC years 1900–2200, with years 1–9999
outside that target explicitly approximate. Sun/planet apparent budgets remain
10 arcseconds and the Moon 12 arcseconds; observer rotation and event accuracy
have their own limits. The eight UI registry records remain source-theory parity
records, and unmatched claims remain unvalidated. See
[the accuracy contract](ACCURACY_CONTRACT.md),
[the current binary replay](COORDINATE_POLES_20261106.md) and
[TOP2013 precision evidence](TOP2013_PRECISION_20261106.md).

Research/learning release readiness is distinct from operational space-weather
or mission-safety use. `space_weather_operational` stays false; normalized
magnetic units, reduced solar transport and intentionally failing operational
gates are documented limitations, not flags to clear as bug fixes. See
[operational readiness](OPERATIONAL_READINESS.md),
[component delivery limits](LGPL_COMPONENT_20261106.md) and
[the required validation plan](VALIDATION_PLAN.md).

## Retained evidence and rollback

Local evidence is under `build/startup-demand-20261107-01/`:

- `dom-write-profile-native-10pairs-01` and
  `dom-write-profile-fallback-10pairs-01`: immutable twenty-visit timing reports
  and their independently reviewed identities in the Inspector report.
- `dom-write-browser-{native,fallback,driver}-01` and matching merged coverage
  directories: full browser/touch and denominator-complete coverage.
- `linux-current-c006a2d8160042d39e0e21c807c7dedb`: full Node command, log, exit,
  before/after source inventories and container-removal readback.
- `linux-python-current-a4302ab69a694edb9e765ef0d6f53210`: provider/tool/coverage
  commands, step logs and JSON/XML reports, exact CI scope and owner cleanup.
- `current-physical-{native,fallback,driver}-01`: all 66 automated rendering
  checks, captured views and cleanup receipts against the same stage05 manifest.
- `current-readiness-cc362bd08ec642f897795941d825ab33`: independent readback,
  before/after documentation snapshots, exact change list and validation logs.

This pass changes only this checkpoint and the opening current-status summary.
Restore their exact backed-up bytes to roll it back; remove only this newly
added checkpoint. Preserve all unrelated dirty files and historical evidence.
No commit, push, dependency installation, public-source runtime change or
deployment is part of this checkpoint. The production-readiness goal is active.

## Later canvas-size correction

The [narrow backing-size correction](CANVAS_BACKING_RESIZE_20261108.md) removes
redundant canvas dimension assignments. Its isolated source/visual checks and
the retained native Sky deadline failure are documented separately. The 200 ms
response target still applies to hardware and software rendering. No timing
waiver, new astronomy adoption or production-readiness approval is granted.

## Later panel-focus correction

The [panel keyboard-focus correction](PANEL_FOCUS_20261108.md) retains the legend,
signal and Aurora glossary controls across refreshes while recomputing current
facts and freshness. Its named candidate passes native/software browser checks.
This addresses a reproduced accessibility defect; the 200 ms response requirement
and broader release/scientific acceptance remain held.

## Later verified QA browser retirement

The [verified browser-retirement correction](BROWSER_CLEANUP_20261108.md) makes
qualification retain graceful-close failures and confirm launch-owned process
exit. The legacy helper interface remains available. Its focused failure-path,
consumer and real-owned-browser evidence is separate from application rendering
or scientific acceptance. Rendering response and broader release holds remain.

## Observation-startup cleanup follow-up

The [observation-startup finalizer correction](BROWSER_CLEANUP_20261108.md)
extends verified browser retirement to that validator, retains cleanup failures,
continues server retirement and rejects late page errors before saving final
acceptance. It changes QA tooling, tests and documentation only. Rendering,
astronomical, hosted release and 200 ms response holds remain unchanged.

## All-mode startup graphics execution readback

The [graphics execution readback correction](GRAPHICS_EXECUTION_20261108.md)
records browser compositor, rasterizer and Canvas2D status after measured tasks
in all three profiler modes. It preserves the legacy helper's no-I/O behavior,
original launch flags, response metric and all acceptance gates. New profiler
runs retain their own source cohort. Application rendering, Illustrative Earth,
numerical binaries and scientific/operational/release holds remain unchanged.

## WASM source-material admission

The [WASM source-binding correction](WASM_SOURCE_BINDING_20261108.md) ties current
component-bearing builds to the successful local build's exact source materials
and both binaries. It rejects missing/stale receipts before staging and retains
critical receipt/source bindings in the artifact. This is an accidental-staleness
guard, not compiler attestation or scientific/release qualification. Application,
Rust calculation code, Illustrative Earth and rendering-response holds remain.

## Procedural Sun resize invalidation

The [resize-only invalidation change](RESIZE_CANVAS_INVALIDATION_20261108.md)
retains successful procedural Sun pixels only for unchanged immutable inputs and
backing geometry. Full clock-dependent preparation, panels and headers still run;
observed images and ordinary draws remain complete. Native reset/context/failure
guards preserve redraw recovery without offscreen copies or changed drawing math.
The isolated exact-code cohort passes 1,999 Node tests, all three automated browser
and touch gate sets, 126 exact compositor cases and 18 native reset recoveries.
Its complete source/artifact identities and limits are recorded in the change note.
The actual default UI still has 596/252/204 ms cold Research/Inspector/Focus and
284 ms warm Sky diagnostic failures. Pending-UI experiments remain unadopted;
200 ms all-mode response, scientific/manual/platform and release holds remain.


## First view presentation and activation ownership

The [initial-view presentation change](INITIAL_VIEW_PRESENTATION_20261108.md)
keeps uninitialized scene placeholders hidden while reserving canvas/card geometry
and retaining loading/error/retry controls. Successful current entry, rather than
module caching, establishes initialization. Previously entered scenes stay visible
on re-entry. Hidden entry pauses, and current pause-publication errors remain
observable without replacing a newer same-view activation's failure.
The isolated final cohort passes 2,018 Node tests, all three full browser/touch
gates, actual loading/failure/retry geometry and the existing coverage floor.
Its source/artifact/response identities and retained failed attempts are recorded
separately. The 200 ms target remains binding in hardware and both software modes;
the one-pair diagnostic does not grant qualification. Illustrative Earth and all
scientific/manual/platform/hosted/release holds remain preserved.
