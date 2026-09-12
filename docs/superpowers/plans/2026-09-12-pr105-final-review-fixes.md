# PR105 final-review corrections implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development with disjoint task ownership and independent spec/quality review. Root retains commit/push and conditional merge authority.

**Goal:** Correct five verified current-head review findings without weakening coverage or qualification gates.

**Architecture:** Extend the existing pure attribution contract to ingestion, correct one navigation sentinel and one missing UI publication, and share honest feed-clock assessment across UI readers. No model evolution or schema replacement.

**Tech Stack:** Rust workspace, Python validators, native browser ES modules, Node test runner and existing Chromium harness.

**Spec:** docs/SPEC.md Admission consistency and UI contract; SOL-ARCH-001 and existing provenance/UX requirements under RFC 0002.

## Global Constraints
- Scope: PR #105 on codex/sol-correctness-experience; base for this correction 9c90af7fa5ab343412aed30ed4f337ce049daf6e. Repository base master remains 25efcd528c13bb46a0caf364b37b98801232e7be.
- Keep live solar-state-snapshot.v3 and ephemeris-snapshot.v3; historical v2 remains separate.
- Preserve original source evidence, source bundles, numerical methods, dependency locks, public interfaces and all coverage floors/populations.
- The browser MUST render versioned immutable snapshots and MUST NOT invent or silently reinterpret physical values.
- Source attribution uses the explicit set in docs/SPEC.md Admission consistency, including U+001C through U+001F; U+FEFF is deliberately not stripped.
- Compositing permission remains false; operational readiness remains false.
- No network scientific acquisition, production deployment, branch-protection edits, branch deletion or force-push.
- Use apply_patch for edits. Workers do not commit, stage, push, change branches, or spawn helpers/reviewers. Root owns publication and review.
- Follow TDD: retain expected failing output before production edits and passing covering tests afterward. No skipped tests or assertion weakening.

### Task 1: One native attribution predicate for ingestion and simulation
Files: crates/solar-core/src/provenance.rs (new), crates/solar-core/src/lib.rs, crates/solar-ingest/src/lib.rs, crates/solar-cli/src/provenance.rs, and targeted Rust tests under crates/solar-cli/tests or solar-ingest tests.
Finding: comment 3997248175, attributable_source/newest_record admits separator-padded UNKNOWN. Derived F10.7 activity can borrow valid mag/wind evidence later.
Interfaces: expose solar_core::provenance::attributable_source(&str) -> bool using the current CLI predicate unchanged; CLI wrapper/re-export and ingest consume this one implementation through existing solar-core dependency. No new crate dependency.
- [x] Add the shared literal 47-case corpus to actual ingest->simulate coverage. At minimum exercise invalid padded F10.7 with valid mag/wind (cannot tune assimilation), invalid newer versus valid older F10.7 (older wins), valid source retention including U+FEFF, all-invalid and plain valid controls.
- [x] Run cargo test -p solar-cli --test ingest_attribution --locked --offline (or the exact named existing integration target if extended); observe expected behavior failures.
- [x] Move the unchanged predicate into solar-core and replace duplicated ingest/CLI admission without rewriting source strings.
- [x] Run targeted integration and ingestion unit tests, cargo fmt --all -- --check; self-review actual diff.
Expected assertion example:
```rust
assert_eq!(report.get("observed_context").unwrap().get("activity_index").unwrap().as_f64(), None);
```
Use the actual emitted nullable context structure and independently derived expected result; compare simulation with a no-F10.7 baseline when valid mag/wind remain.
Report: build/pr105-round6/task-1-report.md.

### Task 2: Image attribution and reverse cycle navigation
Files: apps/web/js/solarContract.js, apps/web/js/seriesModel.js, tests/web/solarRegistration.test.mjs, tests/web/solarTruth.test.mjs; separate focused new test files allowed. Python registration corpus tests may be added without changing Python runtime.
Findings: comments 3997248180 and 3997248186.
Interfaces: keep assessSolarImageRegistration(registration,snapshot,asset) result unchanged and nextAvailableFrame(records,current,direction=1) result {index,skipped}|null.
- [x] Add literal source corpus tests for registration: shared expected attribution must govern compatibility while compositing remains false and valid source text remains unchanged. Verify Python assessor parity using current helper if practical.
- [x] Add reverse Latest tests, gap/wrap tests, one/empty/all-unavailable controls; preserve forward Latest selection and skipped counts.
```js
assert.deepEqual(nextAvailableFrame([{status:"ready"},{status:"ready"},{status:"ready"}],-1,-1),{index:2,skipped:0});
```
- [x] Run node --experimental-vm-modules --test tests/web/solarRegistration.test.mjs tests/web/solarTruth.test.mjs and record expected red cases.
- [x] Registration: replace custom trim rule with attributableSource(r.source).
- [x] Navigation: normalize current === -1 to records.length for reverse navigation only; preserve current semantics elsewhere.
- [x] Rerun covering tests, then self-review with boundaries and original evidence preservation.
Report: build/pr105-round6/task-2-report.md.

### Task 3: Publish refreshed facts and fail honest on unknown feed clocks
Files: apps/web/js/orrery.js, apps/web/js/presentationState.js, apps/web/js/selectors.js; tests/web/systemPublication.test.mjs or new systemMetadataRefresh.test.mjs; tests/web/selectors.test.mjs; tests/web/solarTruth.test.mjs is OWNED BY TASK 2, so add a separate feedFreshness.test.mjs and optional tests/web/dataBundleFreshness.test.mjs instead.
Findings: comments 3997248188 and 3997248189.
Interfaces: preserve feedOverdueHours(nowMs) nullable legacy public result and existing status values; introduce assessFeedFreshness(feedStatus,nowMs) in existing presentationState.js, returning {freshness:"unknown"|"stale"|"within_refresh_window",overdueHours:number|null}. Both explanatory presentation and selectors consume it. No new module or schema version.
- [x] Use existing real whole-module orreryHarness to show a successful asynchronous refresh changes metadata timestamp and selected body facts together, does not replace current render positions with delayed positions, and cannot publish obsolete/cancelled updates.
- [x] Add tests of omitted/empty/malformed/non-UTC/invalid-calendar refresh clocks yielding unknown and non-healthy pill; explicit valid Z/+00:00 values and fractional seconds remain supported. Strict real UTC calendar verification, not merely permissive Date.parse. Preserve existing six-hour grace and exact endpoint behavior.
- [x] Add synthetic hash-consistent bundle->selector tests using in-memory transport only. Unknown clocks may remain admitted under existing schema but MUST NOT present daily ok/live. No real source bytes altered.
```js
assert.equal(feedStateLabel(),"unknown");
assert.notEqual(feedStateClass(),"live");
```
- [x] Run exact covering Node targets; record expected red output.
- [x] Add updateOrreryAccuracy() after successful current-generation metadata publication. Introduce the shared pure freshness assessment and use it in presentation/selectors. Keep explicit degraded/failed states and last valid data.
- [x] Rerun tests and self-review. No producer/schema edits; explain this compatibility-preserving option in report.
Report: build/pr105-round6/task-3-report.md.

### Integration and delivery
- [x] Independently review each task for spec compliance and code quality, then review the integrated correction and affected consumers.
- [x] Address integrated-review P2 in `panels.js` / `panelCoverage.test.mjs`: consume the shared clock assessment in feed summary and aurora caveat, qualify unknown freshness without rewriting data or normalizing invalid refresh dates; preserve valid fresh/stale and missing-Kp controls. Run one scoped re-review of this final fix wave.
- [x] Update docs/SPEC.md and docs/PR105_REVIEW_ROUND6.md with semantics, exact regressions, commands and limits.
- [x] Run cargo test --workspace --locked --offline, cargo fmt --all -- --check, cargo clippy --workspace --all-targets --locked --offline -- -D warnings.
- [x] Run full Node mandatory 90/90/90 coverage, full Python branch coverage, static/type/SDLC/docs/UX checks, both locked offline WASM builds and staged browser validation.
- [ ] Recompute exact whole-PR file inventory without altering scientific payloads; allowlist stage, commit and push this correction.
- [ ] Re-fetch exact-head CI, all required checks, complete release gate and external review completion. Reply to verified addressed comments, read replies back, then resolve.
- [ ] Conditional merge only after final head/base identity, checks and completed review show no actionable findings; otherwise hold and report. No admin override or deletion.
