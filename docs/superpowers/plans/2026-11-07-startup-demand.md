# Observation-led startup implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Review independently at task boundaries. Capture diffs instead of committing: the user forbids commits and publication without instruction.

**Goal:** Meet the accepted startup contract by loading only the observation/workspace shell initially and loading Research, My Sky and Solar System code on intent.

**Architecture:** Retain the existing native modules, DOM, source identities, workers and rendering formulas. Extract solar-research bindings/rendering into a deferred module and introduce a small owned view-code controller. Keep verified core offline installation, with the original Sun image and both engines critical; full star/Moon catalogues become verified on-use enrichment with explicit availability/retry.

**Tech stack:** Native JavaScript modules, JSDoc, existing pinned TypeScript tooling for AST validation, Python build validation, Rust/WASM and the existing locked Chromium driver. No added external dependency or bundler.

**Spec:** [Accepted correctness/experience design](../../plans/2026-09-11-correctness-and-experience/design-review.md), [RFC 0002](../../rfcs/0002-correctness-delivery-and-experience.md), [RFC 0003](../../rfcs/0003-scientific-workspace-and-visual-provenance.md), and [SPEC](../../SPEC.md). This plan implements the active production-readiness goal; it grants no publication or production qualification.

## Global constraints

- Preserve Illustrative Earth, image pixels/resolution, rendering formulas, orbital coefficients, numerical binaries and public snapshot/ABI contracts.
- Keep native modules and the existing package manager; add no external dependencies, production telemetry, credentials or endpoints.
- Keep the 2.5-second p75 meaningful-Sun LCP, 0.1 CLS and 200-ms p95 visible-feedback targets. Do not change quantities or metric meaning to pass.
- Use Node 22.12 or later and existing locked tools. Include all hand-written runtime logic in the existing coverage floors.
- First offline Sun return retains the original image and its provenance. Core Research data, both engines, code and schemas remain one verified release.
- Additional Moon/full-star data receives verified on-use cache admission for service-worker-controlled clients. First visits can fetch online before control; no universal pre-execution verification or `clients.claim()` is introduced. Missing enrichment produces explicit unavailable/retry; it cannot alter planetary positions or imply accuracy qualification.
- Preserve latest navigation/focus intent, share-link precedence, local-only location and existing consent, last-valid publication and worker cancellation.
- Keep all unrelated working-tree changes. No commit, push, merge, publication or deployment.

## Measured need and scope

The current AST graph has 115 statically reachable modules totaling 1,257,047 raw bytes. Deferring only the two destination renderers still leaves 441,551 bytes. Deferring their overview and extracting small source records leaves approximately 220 KB.

A throwaway initial-observation diagnostic with those latter cuts recorded image LCP 3,044 ms versus 4,156 ms on the current application, under the same page CPU/network settings. It stubs inactive destination functions and excludes service-worker installation, so it qualifies neither navigation nor offline behavior. It establishes that renderer-only cuts are insufficient for the 2.5-second target.

The retained shell therefore owns observation, navigation, workspace, explanatory headers and view-summary export. Research-specific handlers and canvas work load with Research. Destination-specific code loads with its destination. Existing algorithms are moved intact rather than replaced.

## Task 1: Small immutable source and Sun-reference records

**Files:**
- Create `apps/web/js/sunFacts.js`, `apps/web/js/sourceRecords.js` and `tests/web/sourceRecords.test.mjs`.
- Modify `apps/web/js/bodyData.js`, `apps/web/js/explorer.js`, `apps/web/js/solarObservation.js`.
- Modify `tools/validate_visual_assets.py`, `tools/build_web.py`, `tests/python/test_release_artifact.py`.

**Interfaces:** `SUN_RADIUS_KM=695700`, `SUN_MEAN_TEMP_K=5772`; retain `bodyData.js`'s existing `SUN_RADIUS_KM` export and every `BODY` value. Generate `defaultObservationRecord` from `observed_images[0]` with immutable nested contents. Keep `getSolarObservation()`'s current interface and values.

- [ ] Add tests comparing the small record with the authoritative inventory and checking immutable contents and unchanged Sun facts:

```js
assert.deepEqual(defaultObservationRecord, inventory.observed_images[0]);
assert.equal(SUN_RADIUS_KM, BODY.Sun.radiusKm);
assert.equal(SUN_MEAN_TEMP_K, BODY.Sun.meanTempK);
assert.throws(() => defaultObservationRecord.allowed_usages.push('global-sphere'));
```

- [ ] Run `node --test tests/web/sourceRecords.test.mjs` and retain its failing result.
- [ ] Generate the source record with the existing visual-assets writer, validate its exact regeneration before staging, and consume the small references from Explorer. Re-export the original Sun-radius name from `bodyData.js`.
- [ ] Run the focused tests, `python tools/validate_visual_assets.py`, type checking and the existing artifact/observation tests. Record the byte-identical `BODY` value comparison and reviewed diff.

## Task 2: Owned view-code activation and deferred Research

**Files:**
- Create `apps/web/js/viewLoader.js`, `apps/web/js/viewRegistry.js`, `apps/web/js/research.js`, `apps/web/js/surfaceNavigation.js` and focused tests under `tests/web/`.
- Modify `apps/web/{app.js,index.html,styles.css}` and `apps/web/js/{view.js,panels.js,catalogueLoader.js}`.
- Update affected whole-source and browser fixtures while preserving their original scientific assertions.

**Interfaces:**
- Re-export the existing owned import implementation as `createModuleLoader`, preserving `createCatalogueLoader`.
- `createViewLoader({loaders,onState,onReady})` owns one latest selected code-loading intent. `activate(name)`, `retry()`, `pauseLoading()` and `resumeLoading()` never mutate source/time/consent/coordinates. `activate('observe')` permanently clears a pending lazy-view intent; hiding the document only pauses that intent. Resume must never revive a view the user left.
- Research exports `enterResearch()`, `leaveResearch()`, `showResearchTourStep()` and `endResearchTour()`.
- The registry exposes registration/read access for a Research adapter `{prepare,draw}` and a destination overview function. Its single untokened URL is shared within each immutable release namespace even when legacy query-token imports differ; releases never share mutable registry state.
- Preserve Sky/System's existing `enter`, `leave` and resize functions. Only the current, visible intent can call entry after import.

- [ ] Write controller tests with held promises and fake clocks. Require loading/failed/cached states, retry, deadline, A→B→late-A suppression, hide/return, no reentry after cancellation and callback ownership:

```js
const a = controller.activate('sky').catch(error => { if (error.name !== 'AbortError') throw error; });
controller.activate('orrery');
resolveSky(oldSkyModule);
await a;
assert.deepEqual(entered, ['orrery']);
```

- [ ] Retain failure evidence before implementing the controller. Use the already-tested module-import deadline/cancellation implementation, not another independent timer protocol. Guard asynchronous entry and callback publication as well as import resolution; observe all rejected entry/cancellation outcomes.
- [ ] Extract existing Research event handlers and rendering code, retaining function bodies, transaction/worker calls and parameters. Research preparation remains before header updates; drawing remains after visibility/header updates.
- [ ] Keep global glossary, navigation, workspace and observed-image export usable in the shell. Preserve tour cancellation through the deferred Research API.
- [ ] Make model/view controls inert or disabled during code loading, while navigation and inspector close remain usable. Show a plain-language loading/failure/Retry status outside the inspector. Avoid lost input, stale labels and focus theft.
- [ ] Do not fetch the synthetic Research bundle until Research is requested. Returning to cached views retains accepted state; source kinds and location consent remain unchanged.
- [ ] Run the controller, workspace, presentation, transactional-data and view-summary tests. Update browser readiness checks to actual shell readiness and require Research activation before model-schema assertions.

## Task 3: Exact startup preload contract

**Files:**
- Create `tools/module_graph.mjs`, `tools/validate_module_graph.mjs`, `apps/web/startup-modules.v1.json`, `tests/web/moduleGraph.test.mjs`.
- Modify `tools/validate_web_static.py`, `apps/web/index.html`, `.github/workflows/ci.yml` and relevant validation documentation/tests.

**Interfaces:** `analyzeModules(webRoot, roots)` parses static imports and re-exports using the existing pinned TypeScript AST. A generated, sorted `startup-modules.v1` descriptor names HTML script roots and their static closure, binding source hashes and URL identities so stale import edges fail Python-only staging too. Staging verifies source identities before deterministic query-token stamping and binds the copied representation afterward. The Python gate compares the actual HTML script/preload sets with that descriptor; the independent Node gate compares the descriptor with parsed source. Legacy fixtures without the new startup contract retain their existing gate.

- [ ] Test cycles, re-exports, comments/string lookalikes, missing files, wrong case, malformed JavaScript, URL escapes and unsupported external/bare imports. Dynamic imports must not become startup edges.

```js
assert.deepEqual(analyzeModules(fixture, ['app.js']).startup, ['app.js','js/shared.js']);
assert.throws(() => analyzeModules(escapedFixture, ['app.js']), /boundary/);
```

- [ ] Implement generation and exact validation. Never execute application source to discover its graph. Keep lazy-leaf restrictions and reject stale/extra preload entries.
- [ ] Add the Node graph gate after locked tooling installation in the existing web CI job. No new dependency is required.
- [ ] Regenerate only the initial shell's hints. Explicitly test that Research, Sky, Orrery, full catalogues and their inactive rendering dependencies are outside startup reachability. All runtime files remain in the coverage denominator.

## Task 4: Verified offline core and on-use enrichment

**Files:**
- Modify `tools/build_web.py`, `apps/web/js/releaseClient.js`, `apps/web/app.js`, `docs/RELEASE_DELIVERY.md` and release/cache tests.
- Extend `tools/release_cache_validation.mjs` and appropriate actual-browser coverage.

**Interfaces:** Keep manifest schema and `critical`/`optional` role names. The original Sun image, both engines, all executable infrastructure and Research bundle remain critical. Only the named data-only enrichment modules are optional. Existing SW on-fetch verification/caching admits their exact bytes on use by controlled clients; uncontrolled first visits are tested separately and cannot be described as verified cache admission.

- [ ] Add failing role/admission tests and actual-browser cases for first offline Sun/core return, initially missing enrichment, verified online use followed by offline reuse, corrupt enrichment and upgrade/previous-client coherence.

```js
assert.equal(await offlineSunDecodes(), true);
assert.equal(await offlinePlanetaryEngineAvailable(), true);
assert.equal(await uncachedAdditionalMoonStatus(), 'failed');
```

- [ ] Apply the two catalogue exceptions and retain worker/core critical roles. Treat geography as unused data under the existing policy, without enabling generated maps.
- [ ] Begin automatic offline installation after the observation has had a paint opportunity, preserving the existing explicit unavailable state when its original bytes cannot be fetched.
- [ ] State the core/enrichment distinction accurately in offline status and delivery docs. No partial cache may be marked complete; old complete releases remain protected.
- [ ] Run unit and actual returning/offline/upgrade cases against one immutable stage. Verify original image/engine/role/namespace identities and source hashes.

## Task 5: Controlled profile and final acceptance evidence

**Files:**
- Add a local-only startup performance tool and its deterministic rate/acceptance tests under `tools/` and `tests/web/`.
- Update actual-browser validation/readiness checks, status and an evidence report.

**Interfaces:** Ten cold and ten warm runs; pinned Chromium, 4× page CPU, 1.6 Mbps aggregate downlink and 150 ms latency; actual observation IMG LCP, session-window CLS, declared trusted interaction feedback, byte classes and worker/request ledgers. Rate limiting must cover SW traffic too. The fixture and calibration protocol must be declared; no production SDK is added.

- [ ] Test the rate/latency model with a known local payload and both page/SW requests. Reject wrong metric element, missing runs, unexpected errors, cleanup failures and source/asset drift.
- [ ] Measure the unchanged image under the full protocol, reporting cold and warm percentiles separately and retaining request recording through offline-install terminal state. Require p75 LCP ≤2.5 s and CLS ≤0.1. Require p95 visible feedback ≤200 ms for the declared navigation/workspace tasks. Keep physical-device animation/manual conformance separate.
- [ ] Verify no initial-Sun Moon/full-star/planetary-texture requests, including SW install. Retain all raw runs and the accepted P00-baseline identity if available; a new engineering baseline cannot invent that approval.
- [ ] Run current Node, type/static/graph, artifact/source-distribution, native/software/touch, Sky, experience, physical-rendering and merged coverage checks. Preserve numerical binaries and data identities and all unchanged floors.
- [ ] Request independent review of exact code, source snapshots, staged assets, receipts, deadline/focus negatives and report boundaries. Resolve substantive findings and rerun affected checks.
- [ ] Record limitations and rollback without promoting manual/hosted/cloud/astronomical acceptance. Keep the full production-readiness goal active until every required boundary is proven. Do not commit or publish.


## Execution checkpoint after the reviewed mesh application

Tasks 1 through 4 are locally implemented with their retained intermediate
evidence; no publication follows. The later sphere-mesh and graphics-recovery
changes are applied with exact backups, frozen reviews and a new stage04 artifact.
See [the current evidence and remaining holds](../../STARTUP_DEMAND_20261107.md).

Task 5 remains open. The applied renderer passes native, whole-driver software
and explicit software-fallback browser/touch checks and all three expanded
22-case physical-rendering/context-restoration runs. The source-frozen fallback
campaign completed ten cold and ten warm visits. Its pooled p95 passes, but
warm Inspector has a per-task p95 of 206.7 ms. The assessor now additionally
requires each declared task to meet the same 200-ms target. The original receipt
is preserved; a separate pure reassessment correctly retains that performance
hold. Current full Node tests pass 1,910 cases.

Next: diagnose the Inspector layout/paint/frame tail without reducing the
visibility probe or timing target; then rerun affected full timing cohorts.
Fresh native timing qualification of stage04, earlier whole-driver timing
failures, accepted P00 identity, physical/manual/scientific and hosted/deployed
acceptance remain separate open work. Keep the production-readiness goal active.
