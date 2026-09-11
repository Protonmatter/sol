# Correctness, delivery integrity and experience implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans when implementation is explicitly authorized. Execute the accepted specification task by task. The checkboxes below track future work; no source implementation is completed by this document.

Implementation began under the September 11 local authorization. The original checklists
remain the requirements catalogue, not a current completion ledger. Use
[LOCAL_IMPLEMENTATION](../../LOCAL_IMPLEMENTATION.md) for source changes, bounded evidence
and explicitly open qualification/coverage work. Do not mark unchecked manual or hosted
requirements complete from local source tests.

**Goal:** Close F01–F22 and AC-01–AC-35 while materially improving all three primary workflows and enforcing tested-artifact delivery.

**Architecture:** Rust CPU engines remain authoritative; versioned immutable snapshots pass shared validation before one presentation revision reaches native-ESM views. Bounded workers execute WASM. CI builds and tests one artifact and promotes those exact bytes through explicit eligibility.

**Tech Stack:** Existing Rust workspace, Python stdlib production tools, native JavaScript/JSDoc, CSS, raw WASM, existing Node/Puppeteer validation tools and GitHub Actions. No new runtime dependencies or framework migration.

**Spec:** [Problem and scope](problem-and-scope.md), [design review](design-review.md), [delivery design](devex-review.md), [RFC 0002](../../rfcs/0002-correctness-delivery-and-experience.md).

## Global constraints

- Rebase the plan against the actual chosen source SHA before execution; preserve unrelated work.
- Accept applicable RFC clauses before design-changing slices. Existing-contract restorations may proceed as focused patches after scope authorization.
- Add regression tests before or alongside each change. Do not defer correctness tests to P16.
- Keep public contracts coherent; solar v3 and ephemeris v3 each migrate all in-repo producers/consumers in one atomic PR.
- Do not lower numerical tolerances, coverage floors, source truth or privacy to get a green build.
- Use existing package manager, exact pins and task-local output directories. No speculative cleanup.
- Do not commit, push, publish, merge, alter settings or deploy without the corresponding execution authorization.
- Every slice updates its real requirement/test/CI evidence and relevant docs. Paths labeled new are planned, not currently existing files.

## Delivery graph and milestones

| Slice | Deliverable | Depends on | Risk / acceptance owner |
|---|---|---|---|
| P00 | Accepted scope, baseline and evidence scaffold | Planning review | Low / maintainer |
| P01 | Minimum release-path enforcement | P00 release clause | High / delivery |
| P02 | Solar exactly-once event restoration | P00 | High numerical / scientific |
| P03 | Strict intake, safe replay, trustworthy ingest | P00 | High contract / scientific |
| P04 | Immediate web truth, projection, cache and timeline corrections | P00 | High scientific presentation / UX + scientific |
| P05 | Ephemeris date, poles and event restoration | P00 | High numerical / scientific |
| P06 | Canonical generation and dependency hygiene | P00 | Medium / scientific + delivery |
| P07 | Atomic solar v3 semantics | P02, P03, P04; P09 before activation | High public contract / scientific |
| P08 | Atomic ephemeris v3 semantics and evidence | P03, P05; P09 before activation | High public contract / scientific |
| P09 | Same-run CI and immutable artifact promotion | P01, P04, P06 | High delivery / delivery |
| P10 | Shared presentation model and responsive shell | P04; accepted UX clause | High UX integration / UX |
| P11 | Sun workflow and learning redesign | P07, P10 | Medium / UX + scientific |
| P12 | My Sky workflow and privacy redesign | P08, P10 | High privacy / UX + scientific |
| P13 | Solar System selection/time/label redesign | P08, P10 | Medium / UX |
| P14 | Worker execution and bounded provider work | P07, P08, P10 | High lifecycle / scientific + UX |
| P15 | Transactional feed and rolling PR lifecycle | P03, P07, P09 | High operational / delivery |
| P16 | Complete regression, performance and manual qualification | P06–P15 | Medium / all reviewers |
| P17 | GitHub/docs alignment and qualified release handoff | P16 | High release / maintainer |

After P00, science, web and delivery lanes can proceed independently, but serialize edits to shared schemas, `store.js`, workflow orchestration and the shell. P04 is an early corrective release candidate, not the final overhaul. P10 can prototype against corrected v2 using an internal resolver; P07/P08 must update that resolver atomically when switching contracts. Do not retain a live multi-version compatibility path accidentally.

P09's coherent upgrade path is a production prerequisite for P07/P08, not merely final qualification. Prefer landing P09 on corrected v2 first, then the two v3 migrations. If a v3 development branch is ready sooner, keep it as a preview; do not merge into an auto-promoted production path until P09 is verified. P09 has no dependency on v3, so this ordering is acyclic.

Milestone M1: P01–P06 restores priority boundaries and narrows false claims. M2: P07–P10 establishes explicit contracts and delivery/UX foundations. M3: P11–P15 provides the redesigned workflows and robust execution/feed lifecycle. M4: P16–P17 qualifies and promotes. One slice is a logical review unit; split unrelated changes into smaller PRs without separating an atomic schema migration or deferring its tests. The F22 lockfile update in P06 should be a small independent PR, not mixed with moon numerical changes.

## P00 — Baseline, specification acceptance and test scaffolding

Files: this package; `docs/rfcs/0002-correctness-delivery-and-experience.md`; later accepted ADRs; `docs/IMPLEMENTATION_PLAN.md`; new `tests/fixtures/contracts/README.md` and `docs/validation/README.md`.

- [ ] Record source SHA, clean/dirty state, toolchain versions and live remote baseline using read-only queries. Do not reset another checkout.
- [ ] Assign scientific, UX and delivery reviewers; record D01–D16 acceptance or explicit amendments in the RFC. Capture a desktop/narrow feature inventory and measured baseline before redesign.
- [ ] Copy minimal non-sensitive review counterexamples into focused regression fixtures with provenance, fixed clock/seed and expected outcomes. No live credentials or personal location history.
- [ ] Record baseline failing new tests separately from existing passing tests. Establish evidence metadata and expected CI jobs; keep future paths out of implemented requirement records.
- [ ] Run `python tools/validate_sdlc.py`, `python tools/validate_docs.py`, `python tools/validate_ux_contract.py` and `git diff --check`.

Exit: agreed scope, reproducible counterexamples, accepted dependent decisions and no fabricated implementation status. Rollback: documentation-only revision; no product state changed.

## P01 — Close release bypasses before expanding delivery

Files: `.github/workflows/{ci,coverage,docs,deploy-pages,publish-crate}.yml`, `tools/validate_sdlc.py`, `tests/python/test_sdlc_contract.py`; new `tools/release_policy.py`, `tests/python/test_release_policy.py`.

- [ ] Write policy tests rejecting failed/absent Coverage/Docs/governance, skipped prerequisites, wrong repository/SHA, branch dispatch substituted for PR checks, and untested manual deployment.
- [ ] Route substantive required checks into a same-candidate dependency gate; keep Pages disabled for manual bypass and keep crate publication behind explicit release authority. P09 adds full immutable artifact promotion.
- [ ] Replace token-presence-only assurance for consequential conditions with executable policy tests and negative workflow fixtures. Inspect permissions and action pins.
- [ ] Define the reviewed `corrective` and `experience-milestone` qualification profiles; distinguish passing PR candidate validation from master promotion eligibility. Add missing/failed/inapplicable manual/scientific qualification rejection cases before enabling promotion.
- [ ] With separate settings authorization, add the new required gate, verify exact check context and branch/environment controls live, then remove obsolete requirements only after equivalence is demonstrated. Do not weaken protection to unblock a bot PR.
- [ ] Run Python policy/governance tests and full governance/docs checks; exercise one intentionally failing candidate in a nonproduction validation path before authorizing deployment.

AC-26, AC-31. Exit: no known manual shortcut and no eligible incomplete candidate. If settings authority is unavailable, report deployment blocked; source changes alone do not close F07. Rollback must preserve the stricter production hold.

## P02 — Repair source-event scheduling and checkpoint ownership

Files: `crates/solar-core/src/{flux_transport,lib,active_region,synthetic}.rs`, `crates/solar-cli/tests/cli.rs`; new `crates/solar-core/tests/event_ownership.rs` if public API access is sufficient, otherwise colocated tests.

- [ ] Add F01's two independent regressions: birth at 3600 advanced to 7200 in one versus two calls; births at 0 and 1800 versus only 0. Assert actual field difference, not just nonempty metadata.
- [ ] Add simultaneous IDs, exact fixed boundaries, tiny positive intervals, zero duration, irregular partition sets, event rejection behind anchor and rebase cases. Make the new tests fail on baseline.
- [ ] Implement explicit consumed-event/checkpoint ownership and progress that cannot step over the next event. Preserve deterministic ID ordering and endpoint rules; keep internal helpers private unless an interface change is accepted.
- [ ] Verify Br, continuum, confidence and source ledger at equal targets; document justified floating tolerance separately from required serialized-byte equality for canonical runs.
- [ ] Run `cargo test -p solar-core --locked`, `cargo test -p solar-cli --locked`, format/lint and cross-OS deterministic fixtures. Update SPEC's event interval wording.

AC-01. Exit: both original counterexamples and partition corpus pass. No unrelated diffusion/model refactor. Rollback uses an earlier corrected model version or blocks the affected operation, not the defective scheduler.

## P03 — Strict JSON, atomic replay and actual observation semantics

Files: `crates/solar-core/src/{json_read,assimilation}.rs`, `crates/solar-cli/src/main.rs`, `crates/solar-ingest/src/lib.rs`, `tools/{jsonschema_min,snapshot_semantics,validate_snapshot}.py`; new replay/corpus tests listed in the matrix.

- [ ] Add accepted/rejected lexical neighbors, duplicate keys, dimensions, nonfinite and variance-vector mismatch cases; require actionable errors without panic at public intake boundaries.
- [ ] Add replay test with a pre-existing output sentinel: malformed/incomplete input fails and sentinel hash is unchanged; a fully valid differently spaced JSON succeeds.
- [ ] Parse and fully validate before writing a sibling temporary file and atomic replacement; clean only owned temporary files. Distinguish snapshot copy from resumable checkpoint restoration in CLI help.
- [ ] Replace substring metadata scanning with structural record selection; choose newest time-ordered attributable signal, use existing documented normalization/freshness policy, and test ingest -> simulate actually changes scalar activity. If a source is metadata-only, report that and remain synthetic instead of claiming assimilation.
- [ ] Implement or reject active-schema keywords in the lightweight validator; run the same semantic corpus through Rust, Python and Node adapters. Preserve no-dependency production constraint.
- [ ] Run Rust workspace tests and both Python suites; extend fuzz corpus with parser edge classes using existing local fuzz infrastructure, without offensive payload reproduction.

AC-02, AC-03, AC-28. Exit: no half-written output, cross-language agreement, attributable actual scalar ingestion. Keep frozen v2 historical validation while preparing v3.

## P04 — Immediate browser truth, projection, timeline and cache repairs

Files: `apps/web/sw.js`, `apps/web/engine.js`, `apps/web/js/{data,selectors,render,panels,config,timeline,wavelength,accuracy,orrery,orreryTime}.js`; new `solarContract.js`, `solarProjection.js`, `seriesModel.js` and focused web tests.

- [ ] Add F02–F05 and F13–F14 regressions before edits: tokened WASM A/B, declared meridian, confidence-only variation, truthful stale/synthetic copy, malformed solar data and missing middle frame.
- [ ] Route engine requests correctly; validate raw solar payload before store publication; keep last-valid state on failure.
- [ ] Project model geometry from declared coordinates. Disable observed blending without registration; until P07 label existing region positions as birth positions. Render actual heuristic score or mark the control unavailable, never constant complexity glow labeled confidence.
- [ ] Preserve frame/manifest records, gaps and true temporal spacing. Narrow claims to measured evidence and use actual rendered instant in epoch readouts.
- [ ] Stabilize focused nodes in animated lists as a small correction before later object-browser redesign. Use one small pure presentation adapter to remove competing source-copy branches.
- [ ] Run targeted Node tests, `npm test`, web type/static/UX checks and browser assertions for corrected modes; save before/after semantic images.

AC-05, AC-06, AC-11–AC-14, AC-18, AC-19, AC-22, AC-25. Exit: correctness improvements can ship within existing shell; do not declare final UX acceptance yet.

## P05 — Restore supported ephemeris date, pole and event behavior

Files: `services/ephemeris-server/{server,test_server}.py`, `crates/solar-ephemeris/src/{lib,earth_orientation}.rs`, `tools/validate_ephemeris_snapshot.py`, `apps/web/js/ephemerisContract.js`; new event boundary fixtures/tests.

- [ ] Preserve historical 1500-03-01 returned-epoch mismatch, July 2026 Boston Moon day cases and nonzero polar-motion exact-pole counterexamples.
- [ ] Use explicit JD/time-scale remote parameters, verify response epoch and reject unsupported dates before requests. Retain degraded historical time metadata.
- [ ] Replace singular geodetic correction with finite Cartesian observer rotation and documented longitude convention at poles. Do not merely relax validator latitude limits.
- [ ] Find bounded real culmination; return null when none exists in the local mean-solar day. Apply matching event-bound checks in all consumers; no endpoint clamping.
- [ ] Run `cargo test -p solar-ephemeris --locked`, optional-server tests and cross-language event fixtures; retain existing near-present accuracy gates and obtain scoped external evidence when authorized.

AC-08–AC-10. Exit: supported input/output contract restored. P08 separately makes range/event provenance explicit in v3; it must not delay these independently valid corrections.

## P06 — Reproducible generated assets and scoped dependency hygiene

Files: `tools/{generate_moons,moon_model,validate_moons}.py`, `.github/workflows/ci.yml`, `package-lock.json`, `docs/DATA_UPDATE_PLAYBOOK.md`; new `tests/python/test_moon_generation.py`, `tools/ephemeris-data/generation-manifest.json`.

- [ ] Run the Oberon knot 320 reproduction on at least two supported runtime/architecture combinations and retain exact inputs/outputs; do not claim the cross-platform cause before evidence.
- [ ] Select and record the canonical Linux x86_64 image digest, Python version, source hashes and serialization policy. Reproduce full canonical output twice; keep independent angular/radial bounds unchanged. Noncanonical generation cannot overwrite authoritative artifacts automatically.
- [ ] Separate reference-simulation cross-OS byte identity from canonical asset-generation identity in requirements, workflow names and docs. No silent tolerance replacement.
- [ ] In an independent narrow dependency PR, update the affected `brace-expansion` resolution to a currently verified patched version within the approved graph; run `npm ci --ignore-scripts`, `npm audit`, unit and coverage tests. Do not run a broad `npm audit fix --force`.
- [ ] Verify star/geography/body/motion/moon checks and retain generated diff/source correspondence for review.

AC-29, AC-31, AC-33. Exit: canonical output reproducible and intended lock resolution verified. Any scientific output change needs independent review, even if only one rounding token changed.

## P07 — Atomic solar v3 contract and uncertainty correction

Files: new `docs/solar-state-snapshot-v3.schema.json`, `docs/adr/0006-scientific-contract-semantics.md`; core `{lib,contracts,assimilation,grid}.rs`, CLI/ingest/WASM producers, Python fixture/series/semantic validators, browser guard/JSDoc/presentation, all solar fixtures/examples/docs.

- [ ] Define closed v3 schema and shared positive/negative corpus exactly as AC-04–AC-06; preserve frozen v2 historical validator.
- [ ] Add scalar-noise elapsed-time tests, stale/no-provenance no-op, scalar/spatial independence, immutable birth/current-anchor and supported-rate tests before replacing serialized fields.
- [ ] Implement scalar illustrative uncertainty with disabled zero-q default; remove false Br covariance output; preserve heuristic spatial score without scalar-assimilation confidence inflation.
- [ ] Derive current modeled anchors in Rust and equivalent fixture producers under the declared model method; do not implement physical evolution in browser JS. Add registration evidence guard with absent-registration fallback.
- [ ] Migrate every producer/consumer/fixture in the same PR; regenerate changed fixtures only with recorded seed/source/version; test v2 historical copy separately and reject live v2/v3 mixing.
- [ ] Require P09 and prove an actual v2-to-v3 release transition with old open/warm/offline clients before production activation; same-PR source migration alone is insufficient.
- [ ] Run full Rust/Python/Node/schema/WASM/browser/determinism gates and update SPEC, MATH, README equations, accuracy limits, requirements and RFC alignment.

AC-04–AC-06, AC-14. Exit: v3 is coherent end to end with no fabricated magnetic uncertainty. Schema version is independent of release semver; choose the published package version through normal maintainer policy.

## P08 — Atomic ephemeris v3 ranges, events and evidence

Files: new `docs/ephemeris-snapshot-v3.schema.json`; `crates/solar-ephemeris/src/{lib,stars,timescales}.rs`, provider server, Python validator, `apps/web/js/{ephemerisContract,sky,accuracy}.js`, fixtures/examples, ADR 0006 amendment; new `docs/accuracy-evidence.schema.json`, `apps/web/data/accuracy-evidence.json`.

- [ ] Add independent geocentric/observer range fixtures, Moon angular-size/phase frame tests and event source/window/null-status corpus.
- [ ] Emit explicit ranges and event metadata from both providers; retrieve geocentric range already available in Horizons instead of discarding it.
- [ ] Validate any local-event backfill against observer/window and retain local attribution; validate the resulting composite snapshot again.
- [ ] Replace broad accuracy bands with evidence records indexed by body, quantity, epoch set/range, method, observer domain, reference identity and measured error. Outside recorded scope says unvalidated/degraded.
- [ ] Migrate all producers/consumers/fixtures together, freeze v2 historical validation, and update phase consumers with frame-correct geometry rather than blind renames.
- [ ] Preserve refracted `above_horizon` meaning and explicitly test geometric grouping from `alt_deg`; qualify actual v2-to-v3 clients under P09 before activating this provider contract.
- [ ] Run Rust, provider, contract, Node, WASM and browser suites. Obtain reference evidence for changed quantities; preserve existing near-present thresholds and distinguish source-theory parity from independent accuracy.

AC-07–AC-11. Exit: interchangeable provider meanings and evidence-bounded claims. No century-wide accuracy statement based on one date.

## P09 — Build once, validate staged bytes, promote exact artifact

Files: `tools/{build_wasm,build_web,validate_sdlc}.py`, `tools/{browser_validation,merge_web_coverage,collect_node_coverage}.mjs`, `.github/workflows/{ci,coverage,docs,deploy-pages}.yml`, `apps/web/sw.js`; new manifest schemas/validator and release tests.

- [ ] Add artifact SHA/run/policy negative tests, same-JS/new-WASM upgrade, interrupted install, multi-tab, stale HTTP cache, `/` and `/sol/` base paths, and rollback fixtures.
- [ ] Implement the planned output-root/locked interfaces and source mapping specified in DevEx. Hash final built bytes after stamping; ensure no digest cycle.
- [ ] Make browser/coverage jobs consume the same staged artifact. Preserve complete source denominator across namespace/token changes and workers.
- [ ] Implement same-run release evidence and trusted eligibility; deployment downloads verified artifact without rebuild, mutable data fetch or manual bypass.
- [ ] Implement versioned qualification records, protected acceptance provenance, component-fingerprint reuse/invalidation and both release profiles; reject an all-green candidate missing required qualification. A served-verified qualified artifact, not merely an uploaded artifact, becomes rollback-eligible.
- [ ] Bind build/data loaders to one selected manifest and component hash set; P15 later migrates mutable local acquisition/derived pointers using the same reader contract.
- [ ] Install caches transactionally and bind clients to release identity. Verify obsolete/partial release behavior and update reload UX.
- [ ] Run full CI with deliberately failing/skipped prerequisite cases in mocked policy tests, then a nonproduction end-to-end artifact rehearsal. Configure/verify settings only under explicit authority.

AC-25, AC-26, AC-30, AC-35. Exit: source-to-tested-bytes-to-served-bytes chain and coherent recovery are demonstrable.

## P10 — Shared presentation revision and redesigned shell

Files: `apps/web/{index.html,styles.css,app.js}`, `apps/web/js/{store,selectors,view,dom,tour}.js`; new `presentationState.js`, `objectBrowser.js`, component/UX tests; `docs/UX_GUIDELINES.md`.

- [ ] Define resolver types and table-driven source/time/freshness/provider/availability cases. Verify snapshot immutability and no network/DOM/math side effects in the resolver.
- [ ] Build the component sheet and desktop/narrow compositions from the design review; keep navigation outside the inspector, hero first on mobile, and tour opt-in.
- [ ] Pass a single resolved revision to labels/canvas/accessible summary/evidence export; leave view clocks distinct. Preserve raw snapshot download semantics.
- [ ] Introduce keyed object browser and explicit surface disposal incrementally; do not rewrite every store consumer or renderer in one pass.
- [ ] Update static UX checks to the new DOM contract and add runtime reflow, navigation, focus return and disclosure tests.
- [ ] Produce a separate preview artifact and complete feature-parity checklist for all existing destinations before selecting the new shell default.

AC-13, AC-15, AC-19–AC-22. Exit: materially improved shell and consistent meanings, verified in desktop/narrow scenarios. Rollback is presentation-only within corrected compatible code.

## P11 — Sun workflow overhaul

Files: `apps/web/js/{render,panels,timeline,wavelength,sunlayers,config}.js`, projection/series/presentation modules, Sun DOM/CSS; projection/confidence/narrative/series tests.

- [ ] Implement observed/model separation and registration-gated comparison; show capture/model/cycle times without conflation.
- [ ] Replace constant confidence glow with declared score encoding/legend; preserve normalized magnetic-field labels and separate unavailable magnetic uncertainty.
- [ ] Implement stable region inspector and true-time cycle/butterfly interaction with visible gaps and textual alternatives.
- [ ] Move learning/research content into named shallow disclosures; test all copy against resolved state including stale/failed/offline paths.
- [ ] Run Node/contract/browser semantic visuals and keyboard/mobile task tests. Review snapshots for meaning as well as appearance.

AC-05, AC-06, AC-12–AC-16, AC-20, AC-22. Exit: newcomer can explain what the view actually represents; no extra physics or observation claim is introduced.

## P12 — My Sky workflow overhaul

Files: `apps/web/js/{sky,skyEngine,accuracy,ephemerisContract}.js`, object browser/presentation modules, Sky DOM/CSS; privacy/object/event browser scenarios.

- [ ] Build search/filter/selected-object flow with stable rows and above-horizon wording; retain non-canvas facts.
- [ ] Use `alt_deg > 0` for geometric groups, zero in at-or-below, and independently label apparent/refracted altitude. Test negative-geometric/positive-refracted cases without changing the existing flag's meaning.
- [ ] Present actual observer/provider/timezone, explicit example location, UTC option and null-event reasons.
- [ ] Add recipient-specific consent and share-preview cases: initial no-consent, deny, allow, changed endpoint, revoked consent, request failure and local recovery.
- [ ] Keep selected valid state when input/provider fails; reject late replies and invalid composite event data.
- [ ] Run unit/provider/browser tests and keyboard/screen-reader task review with actual consent paths, not pre-granted fixtures only.

AC-07–AC-11, AC-17, AC-19–AC-22. Exit: useful local sky task without hidden location transmission or implied observability.

## P13 — Solar System workflow overhaul

Files: `apps/web/js/{orrery,orreryTime,orreryDetail,starDetail}.js`, new `labelLayout.js`, object browser/presentation modules, Solar System DOM/CSS; clock/label/focus tests.

- [ ] Use actual render instant for all date/accuracy/validity surfaces; test New Year and moon validity crossings at fast speed.
- [ ] Add focused-object inspector and deterministic label priority/collision clearance/caps; all bodies remain searchable in text.
- [ ] Stabilize live rows and selected details; announce user actions only. Separate galaxy/neighbourhood scene units and clock semantics.
- [ ] Reorganize 3-D/top-down, play/speed, search/focus and scale into primary controls; disclose free-flight/advanced options.
- [ ] Run real WebGL semantic assertions, 360-degree camera continuity, keyboard through ten active updates, narrow touch alternatives and paused/hidden lifecycle checks.

AC-18–AC-20, AC-22. Exit: uncluttered selection and faithful time/scale with no renderer physics rewrite.

## P14 — Bounded asynchronous engines and provider resilience

Files: `apps/web/engine.js`, `apps/web/js/skyEngine.js`, new solar/sky worker clients/workers, raw WASM boundary code, provider server; worker/browser/server tests and build module recognition.

- [ ] Add deterministic request-generation tests, cancel/replace/deadline/dispose cases, dimension and aggregate-cost boundaries, memory failure and stale-result rejection.
- [ ] Move solar WASM execution to a worker; use the same protocol for ephemeris where profiling identifies synchronous cost. If keeping an ephemeris call on-main, prove it respects the declared task budget at accepted limits and document the exception before acceptance.
- [ ] Implement one active/one latest pending intent, bounded allocation/work admission, typed errors and explicit capability display. Terminate uncooperative workers on cancel/deadline.
- [ ] Add bounded server admission, coalescing and overall deadlines with mock upstream, independent subscriber cancellation and safe retry policy.
- [ ] Run worker Node/browser lifecycle tests, server tests, complete runtime coverage and physical-device responsiveness scenarios. Do not load-test public providers.

AC-21–AC-24. Exit: supported work remains controllable; UI does not silently clamp inputs or transmit remotely to hide local delay.

## P15 — Transactional ingest and publication lifecycle

Files: `tools/{fetch_public_data,run_daily_ingest,generate_fixture_snapshot,build_web}.py`, `apps/web/js/data.js`, CLI bundle intake, `.github/workflows/daily-ingest.yml`, new source/derived-bundle/pointer schemas, `tools/delivery_lifecycle.py`, transaction/lifecycle tests; feed presentation and operations docs.

- [ ] Write fail-at-each-stage tests: fetch error with older cached bytes, malformed source, generator failure, validation failure, locked pointer, interruption before/after select and rollback.
- [ ] Implement closed immutable source bundles, attributable fallback and atomic multi-file selection; retain old cache v1 read-only migration path and failed-attempt evidence.
- [ ] Migrate CLI/build/browser readers to resolve once, pin bundle identity and validate all components before publication; remove live reliance on mutable root aliases. Test pointer A-to-B switch during a paused reader, mismatched component hashes and rollback with an in-flight pinned reader.
- [ ] Replace per-run/direct-push behavior with one exact owned rolling PR, data allowlist, expected-head concurrency and current-base regeneration. Preserve human approval/merge default.
- [ ] Record all lifecycle identities/states and served freshness; no-op, awaiting approval, blocked, deployed and verified remain distinct.
- [ ] Run mock lifecycle and Windows/POSIX transaction tests; under explicit authority rehearse one real data PR -> approval -> merge -> master CI -> deploy -> served verification. Do not close accumulated PRs automatically.

AC-27, AC-28, AC-35. Exit: a successful refresh is explainable end to end, and interrupted generation cannot corrupt the selected feed.

## P16 — Regression, coverage, accessibility and performance qualification

Files: browser/visual harness, Python coverage configuration, affected tests, `tools/{build_wasm,install_daily_ingest_task}.ps1`, new `tests/powershell/HelperContracts.Tests.ps1`, provenance manifests, `docs/VALIDATION_PLAN.md`, new `docs/validation/` release evidence.

- [ ] Run every F01–F22 regression and AC-01–AC-35 case; retain failures with source SHA and deterministic replay inputs.
- [ ] Extend Python denominator to all new/affected behavioral production paths; preserve Rust/Node/complete-web coverage floors and enumerate exclusions. Test wrapper exit behavior and skipped/applied task removal with mocks, never real scheduled tasks.
- [ ] Reconstruct missing coefficient generation/source correspondence or explicitly document non-regenerable assets; record immutable sources/hashes/notices, not mutable branch URLs alone.
- [ ] Run the declared browser/physical-device profiles, complete keyboard/zoom/touch/screen-reader audit, privacy flows and formative task study. Fix failed tasks before default redesign promotion.
- [ ] Measure cold/warm performance, idle/hidden work, bytes and animation. Tune presentation cost only, keeping scientific calculations unchanged.
- [ ] Obtain new scoped external accuracy evidence for changed numerical contracts, execute compatible artifact/cache/data rollback and record manual reviewer acceptance.

AC-20, AC-24, AC-29–AC-35. Exit: no unqualified acceptance case or disguised external/manual failure. P16 closes evidence gaps; it is not the first time tests are added.

## P17 — GitHub presentation and qualified release handoff

Files: `README.md`, `docs/{SPEC,STATUS,ROADMAP,RFC_ALIGNMENT,IMPLEMENTATION_PLAN,OPERATIONS,INSTRUCTIONS,VALIDATION_PLAN,ACCURACY_CONTRACT,DATA_SOURCES}.md`, requirements/catalogue, RFC status, contribution/PR template and crate release workflow.

- [ ] Replace stale branch/proposed-feature/performance/butterfly/variance claims with exact released behavior and evidence scope. Explain illustrative cycle versus observed sources prominently.
- [ ] Capture real desktop/mobile screenshots from the qualified artifact, add concise three-task quick start, verified build commands, source limitations and current release/evidence links. No stock mockups presented as implemented UI.
- [ ] Propose About/topics/pinned documentation and branch-scoped badges; remote edits occur only with authorization. Show code/deployed/source-data freshness separately.
- [ ] Re-fetch required settings/checks, validate qualified current-master artifact and perform authorized served verification. Preserve limitations and rollback identity in handoff.
- [ ] Mark RFC Implemented only when merged implementation, tests, traceability and docs actually satisfy its criteria. Crate publication remains a separately authorized package release; absence of a new crate does not prevent documentation from accurately stating its current version.

AC-31, AC-34, AC-35. Exit: repository presentation, live artifact and assurance claims agree. Handoff includes exact source/artifact/data identities, remaining limitations and tested recovery steps.

## Per-slice execution checklist

- [ ] Confirm scoped files, accepted requirement/AC IDs, risk and validation commands before edits.
- [ ] Demonstrate the meaningful new test fails on the prior behavior where applicable.
- [ ] Implement the smallest change matching the accepted design.
- [ ] Run targeted unit tests, cross-component functional tests and failure/regression cases.
- [ ] Run full affected CI-equivalent gates and inspect the diff; preserve unrelated changes.
- [ ] Update docs/requirements with real evidence, record unrun/manual/live checks honestly.
- [ ] Obtain required independent review and execute only authorized publication actions.
- [ ] Close a finding only after its named regression, consumer behavior and release boundary are evidenced.
