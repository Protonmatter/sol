# PR 105 comment contract implementation plan

> **For agentic workers:** Use test-driven-development and independent task review for each scoped correction; use verification-before-completion for publication. Parallel workers have explicit disjoint file ownership. Existing implementation authorization includes updating the PR, not merging or deploying it.

**Goal:** Address the seven distinct actionable review findings on PR 105 at `34f8bc356a002d9bc88804f5052ba45c9c11f125`, including the duplicate standalone replay thread.

**Architecture:** Keep admission at the existing standalone, bundle, and provider boundaries. Share only the pure attribution predicate within each language; bind existing redundant metadata rather than inventing new schema fields. Preserve raw evidence and immutable last-good publications.

**Tech stack:** Existing Rust workspace, Python unittest, Node test runner, locked c8/Chromium tooling and GitHub Actions.

**Spec:** [SPEC](../../SPEC.md), [standards profile](../../STANDARDS.md), [release delivery](../../RELEASE_DELIVERY.md). These existing contracts, including RFC 8259 JSON and explicit timestamp/provenance semantics, remain authoritative.

## Global constraints

- No schema/version or public-interface changes; historical v2 readers remain separate.
- No live feed acquisition, dependencies, deployment, merge, branch-protection changes, or history rewrite.
- No lowered coverage thresholds or hidden runtime code. Include extracted attribution code in the configured Python population and automatic whole-web population.
- Controlled test fixtures may be repaired to satisfy producer metadata; committed scientific payloads must not be rewritten to conceal failures.
- Use the isolated `sol-review-20260911` checkout and explicit staging allowlist; preserve the dirty sibling checkout.

## Task 1: Consistent standalone and bundle attribution

Files: `crates/solar-cli/src/{main,snapshot_validation,provenance,bundle_intake}.rs`, `crates/solar-core/src/contracts.rs`, `tools/{observation_provenance,snapshot_semantics,data_bundles}.py`, `apps/web/js/{sourceAttribution,solarContract,dataBundle}.js`.

Interface: `attributable_source(value)` / `attributableSource(value)` returns a boolean without rewriting the source. Trim the explicit shared whitespace set, reject empty or Unicode-lowercase `unknown`, preserve U+FEFF and all valid original source text.

- [x] Add a literal 47-case shared corpus and actual CLI simulation/replay, Python and raw/structured JS regressions; verify intended RED before implementation.
- [x] Share the pure predicate in each language; retain existing Python exports to avoid call-site/API churn.
- [x] Correct the JSON envelope guard only inside strings: `c < '\u{20}'` rejects unescaped JSON control characters; valid C1 characters remain valid evidence. Prove both sides with serializer tests.
- [x] Run `cargo test -p solar-core -p solar-cli --locked`, `node --test tests/web/standaloneProvenance.test.mjs`, and `python -m unittest discover -s tests/python -p test_standalone_provenance.py`.
- [ ] Independent spec/quality review and integrated verification before explicit-allowlist commit.

## Task 2: Bind feed and series metadata to retained payloads

Files: the three bundle readers in Task 1; `tests/python/test_bundle_semantics.py`, `tests/web/dataBundleSemantics.test.mjs`, and minimal existing bundle fixture repairs.

Interfaces: `feed_status.sources` is the ordered projection of `source.products`; `file = product_id`, with exact source/origin/observation/retrieval values and `ok = failure is null`. Available series entries require `index == array position`, `stage == snapshot.learning.cycle_stage`, `activity_index == snapshot.run.activity_index`, and `region_count == len(snapshot.active_regions)`.

- [x] Rehash otherwise-valid bundles after eight series and eleven feed mutations; prove all three readers previously admitted them.
- [x] Require the exact projection and declared series bindings before publication.
- [x] Preserve gap slots, allowing an omitted gap index but requiring equality if present. Do not equate illustrative months with physical snapshot time.
- [x] Verify last-good browser publication is unchanged on rejection; valid baseline, reordered-source rejection, missing-acquisition failures and product-ID/basename distinctions are tested.
- [x] Run dedicated Node/Python suites and `cargo test -p solar-cli --locked bundle_intake::tests`.
- [ ] Independent spec/quality review and integrated verification before commit.

## Task 3: Compass labels describe the emitted azimuth

Files: `apps/web/js/ephemerisContract.js`, `tools/validate_ephemeris_snapshot.py`, `services/ephemeris-server/server.py`, `tests/web/ephemerisCompass.test.mjs`, `tests/python/test_ephemeris_compass.py`.

Interface: the existing 16 clockwise sectors use `floor((az_deg + 11.25) / 22.5) % 16`. Midpoints select the clockwise sector. Provider labels are computed from the serialized azimuth, and rounded 360 degrees normalizes to zero; full-precision internal physics is unchanged.

- [x] Reproduce mismatched label admission, all midpoint boundaries, and provider rounding before fixing them.
- [x] Enforce the relation in v3 browser/Python guards and normalize the emitted provider pair.
- [x] Invalidate the prior cache namespace (v5 to v6), with an offline old-cache/corrected-cache regression.
- [x] Run the dedicated Node and Python compass suites, v3/request-binding tests and existing provider tests.
- [ ] Independent spec/quality review and integrated verification before commit.

## Task 4: Two-sided freshness and scientific admission identity

Files: `tools/generate_fixture_snapshot.py`, `tools/build_web.py`, `.github/workflows/coverage.yml`, `tests/python/{test_future_freshness,test_release_artifact,test_release_changes,test_standalone_provenance}.py`.

Interfaces: freshness uses `exact_age_hours < 0 or exact_age_hours > limit`; `age_hours` remains rounded only for display. Captured future rows remain available with stale/future warnings. Both `dataBundle.js` and the extracted `sourceAttribution.js` belong to `SCIENCE_MODULES`.

- [x] Prove RED for future values, one-second boundaries at both ends, UI misclassification and unchanged science fingerprint after admission-only edits.
- [x] Implement the two-sided test and explicit future diagnostic without mutating captured data or claiming the illustrative fixture is an assimilated forecast.
- [x] Add both admission files to the scientific fingerprint; test actual built manifest identity and rejection of old scientific qualification while data/WASM remain unchanged. Retain CSS-only qualification behavior.
- [x] Add extracted Python attribution code to both existing coverage includes (19 files, same floor); verify the population regression fails before this update.
- [ ] Run independent review and all final checks below before commit/push.

## Final integration and publication

- [ ] Run syntax, all Rust/unit/integration tests, Node line/branch/function gates, Python branch coverage, fmt/clippy, type/docs/UX/SDLC validators.
- [ ] Build both WASM engines and a fresh immutable web candidate. Run staged smoke, Chromium visual/coverage, experience and Sky checks; merge denominator-complete coverage with the unchanged 90 percent floor.
- [ ] Record evidence, refresh the review inventory and review the allowlisted diff; commit and push only to `codex/sol-correctness-experience`.
- [ ] Verify final-head CI, all four protected checks, complete release-gate prerequisites, downloaded candidate/report identities, and fresh review state. Never infer final-head success from an earlier run.
- [ ] Reply to each actionable inline thread with verified commit/test evidence, resolve addressed threads and the duplicate, and summarize the review-body freshness fix. Re-fetch persisted replies/resolution state.

## Scope decisions and risk

Moderate risk: stricter admission intentionally rejects inconsistent inputs that were previously accepted. Valid source bytes, valid committed bundles, historical v2 and physical calculations are retained. Attribution establishes a usable label, not source authenticity. Future-valued illustrative context is retained and explicitly stale; it is not silently discarded. No new physical epoch binding is inferred for illustrative series.

Self-review: all seven findings map to Tasks 1–4; shared bundle/predicate interfaces are coordinated across workers, Task 4 fingerprints the new helper, and the coverage include follows its extracted code. The final artifact and hosted gate are separate from production qualification.
