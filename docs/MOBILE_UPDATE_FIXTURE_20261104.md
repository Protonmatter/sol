# Mobile update fixture ownership — 2026-11-04

The browser fixture now isolates its mock update controls from real startup
registration callbacks. The reproduced shared-control race is closed in CPU
regressions, independent replay and a fresh complete Windows browser run.
The earlier failed preflight remains failed; its missing fixture state prevents
proving that this race caused that particular timeout.

## Defect and correction

The original callsite preflight stops during disclosure, waiting 30 seconds for
the mock's `ACTIVATE_RELEASE` message. It never executes the callsite timer.
Its browser receipt `69e2e32bfcc40548d8b1ee04aad6e194f1e856f7d9048717e9de4d54834bb951`
and failure `a59a88c7581189f547a8307c6f2442f9bf16eed077465d6480efb97233aaf8df`
are retained under `build/gl-callsite-timing-20261104/windows-preflight/`.

Source review reproduces a P2 in `assertMobileOfflineUpdate`: the mock and the
app's real registration share `releaseUpdate` and `releaseStatus`. A late real
registration resolution or installed-state callback replaces the mock handler
while the generic verified-status assertion still passes. The click can target
the real registration, leaving the mock activation predicate false. Cleanup then
restores saved stale properties over the newer real handler and status.

The corrected helper:

1. Awaits the exact existing app module URL before replacing controls. The
   current app has one immediate top-level registration; its DOM references are
   captured synchronously before its first await. A source regression guards that
   ownership contract against deferred or repeated registration.
2. Replaces the button/status with fixture-owned clones retaining their IDs,
   attributes and mobile layout. Real registration callbacks retain the detached
   original nodes. The mock uses the actual production registration function.
3. Publishes restoration and snapshot guards before any partial replacement or
   awaited mock setup. Restoration reinserts original nodes with their latest
   real state, rather than restoring stale handler/text snapshots.
4. Captures bounded synthetic fixture status, message types, handler ownership
   and control flags before teardown when a check fails. The original Error is
   retained; control and viewport cleanup are both attempted, and cleanup failure
   cannot report success.

The 390px viewport, 44px target, native disclosure/keyboard, verified identity,
activation wait and fragment-navigation assertions remain unchanged. Application
and release-client source, protocol, service-worker code and dependencies are
unchanged. This is test tooling, with no new product telemetry or network call.

## Verification

The new tests fail on the old helper and pass on the correction. They cover the
two callback races, no activation of the simulated real worker, latest-state
restoration, exact-module ordering, partial setup, retained failure state and
both primary-error and successful-run cleanup failures. Fourteen focused tests
include the five existing release-client cases.

Independent source/CPU closure receipt:
`9cc63066483ef0692afa8b76b573112335ab204f5f6b4ee42f8e051d7672f11e`.
It independently replays all three original positive/race scenarios against the
exact new setup and actual production registration function. Only mock `review-B`
activates; the simulated real registration receives no activation.

The actual complete current browser run is
`coverage/mobile-fixture-browser-20261104/browser-evidence.json`, SHA-256
`27f51a6e12effbe8e1a2c5e16ea400f6c73985a87152e35dfe0461fae8c9edfb`.
Windows Chrome 156.0.8078.48 / observed SwiftShader LLVM passes all original gates
against unchanged stage manifest
`9dd2d12c14eeda5a385d5c48002abd71da3c0fe39b93ede4952cf02bff15d65a`.
The fixture's `review-B` identity and `/#sky=0,0,0,0` navigation are retained;
physical spin/recovery and held-producer negative controls also pass.

Independent saved-runtime/coverage review receipt:
`e3d2470b5547a30bd1b1cbaac4b265d36eff53010251fbf059b4caf109cca554`.
It verifies current 16 helper hashes, all 207 original source mappings, 127 staged
JS/WASM assets, fresh profile/chronology, original gate records and exact per-file
coverage remerge. It does not rerun a browser or establish Linux qualification.

```text
node --check tools/review_ui_contract.mjs
node --experimental-vm-modules --test tests/web/mobileOfflineUpdateFixture.test.mjs tests/web/releaseClient.test.mjs
node tools/collect_node_coverage.mjs --output-dir=coverage/mobile-fixture-node-20261104
python tools/typecheck_web.py
node tools/browser_validation.mjs --web-root=build/production-20261104-canvas-focus-site --output-dir=coverage/mobile-fixture-browser-20261104 --backend=swiftshader --physical-spin=true
node tools/merge_web_coverage.mjs --node-input=coverage/mobile-fixture-node-20261104/coverage-final.json --browser-input=coverage/mobile-fixture-browser-20261104/coverage-final.json --output-dir=coverage/mobile-fixture-combined-20261104
```

Results: 1,465 Node tests, 124-file typecheck and complete Windows browser command
pass. Combined runtime coverage is 17,802 / 18,249 lines (97.55%) and
8,097 / 8,565 branches (94.53%) across 116 modules; the 90% line floor is unchanged.
Existing evidence output names are retained; use fresh destinations for another run.

## Scope and rollback

Before-helper bytes `30be503c…` are retained under
`build/mobile-update-fixture-fix-20261104/review_ui_contract.before.mjs` for scoped
rollback. Restore only this helper's before snapshot and remove this follow-up's
new test/doc entries if needed; preserve prior work and original failed evidence.
The current helper is `a556416f…`; its new test is `e1d76c37…`.

The separate [Linux callsite experiment](GL_CALLSITE_TIMING_20261104.md) deliberately
uses the old frozen mobile helper and retains its own outcome. The production
rendering stall, native GPU/broader platform/manual, scientific and release holds
remain. No commit, push, deployment, licensing, model or coefficient change occurs.
