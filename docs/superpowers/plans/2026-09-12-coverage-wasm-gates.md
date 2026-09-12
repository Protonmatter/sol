# Coverage attribution and required WASM gate implementation plan

> Execution: use test-driven development and verify each gate on the final PR head.

## Goal and scope

Restore honest coverage and required-check readiness for PR #105 without lowering
the Node 90/90/90 floors, the whole-runtime 90% line floor, or branch protection.
The starting head is `e09e8bc0f8bbac698dbccb2687fe76741fc8dab5`, targeting `master`.
No merge, deployment, dependency addition, scientific qualification, or protection
change is authorized. Existing production interfaces and unrelated work are preserved.

## Architecture and specification

The existing RFC-aligned release-delivery contract remains authoritative. Tests
must execute actual runtime source and attribute coverage only to byte-identical
source or a verified source mapping. Anonymous, transformed VM test scripts are
not valid evidence of original-file coverage. Generated catalogue exclusions stay
unchanged; every hand-written runtime module, including workers and service worker,
must remain in the combined denominator. New assertions must test actual behavior.

The required `WASM build (wasm32-unknown-unknown)` check will depend on the existing
`Build immutable web artifact` job. It must reject failed, skipped, cancelled, or
identity-less upstream builds, download the same-run artifact, and validate both
WASM binaries against the manifest and trusted SHA/repository/run/attempt/digest.
The complete release gate and promotion job-name policy must require this check.

## Task 1: establish and correct coverage attribution

Files: `tests/web/helpers/sourceModuleHarness.mjs`, affected VM regression test
harnesses, `tools/check_node_coverage.mjs`, `tools/collect_node_coverage.mjs`, `package.json`, coverage/test workflow
commands. First retain baseline native and denominator-complete coverage maps.
Add a failing identity regression, then load unchanged source with SourceTextModule
and canonical file URLs; use SyntheticModule only for existing IO doubles. Enable
the required Node VM flag everywhere tests run. Do not assign original identities
to transformed or release-stamped test source. Re-run all assertions and inspect
coverage totals and per-file missing ranges.

The native reporter also conflates plain and release-query module paths incorrectly.
Preserve distinct ESM execution identities and replace only reporting with the already
locked c8 V8 merger. Keep the original imported `apps/web/**/*.js` population, including
imported generated modules, and independent exact-count 90/90/90 floors. Test real
complementary query instances, ambient configuration, low coverage, failed tests, and
empty/stale reports. Do not substitute merged Chromium coverage for this Node gate.

## Task 2: close measured test gaps

Files: focused `tests/web/*.test.mjs` suites and, only where required for execution
coverage, existing browser-validation scenarios. Use measured uncovered functions,
branches and lines to select tests of success, rejection, cancellation, recovery,
and UI state transitions. Preserve existing behavior and all thresholds. Run Node
Node-only corrected reporting, c8 full-runtime coverage, and Chromium staged-artifact coverage
sequentially, then merge exact-source maps and require the whole-runtime floor.
Keep failed evidence separate from passing evidence.

## Task 3: restore the protected WASM identity

Files: `.github/workflows/ci.yml`, `tools/validate_sdlc.py`,
`tools/release_policy.py`, and their existing Python tests. Write failing negative
tests for absent/weakened/misbound checks, then implement the gate and add it to
release dependencies and mandatory job-name maps. Exercise the actual prerequisite
guard for success, failed/skipped/cancelled builds, missing artifact ID and digest.
Use existing release-manifest tests for mandatory engine bytes/hash validation.

## Task 4: validate, review and publish

Run existing Node unit/coverage gates, Python unit/branch coverage, Rust tests,
fmt/clippy, SDLC/UX/static/type/docs checks, fresh staged WASM/web build and fixture-
only browser validation. Review the focused final diff independently. Update the
implementation inventory and evidence documentation, explicitly distinguishing local
evidence from hosted CI. Commit only intended files and push the existing branch.
Verify the remote head, every required check, the complete release evidence gate,
and all review threads against that head. Address actionable new feedback within
scope, repeating verification after any change. A pending or failed gate remains
a hold; report limitations without bypassing them.

## Local execution result

All four implementation tasks are complete locally; hosted final-head verification
is a separate publication step. The final local suites pass 565 Node and 207 Python
tests. Independent Node-only coverage is 99.25/91.77/96.84 percent; the unchanged
60-file whole-runtime denominator passes at 97.60 percent lines. Rust workspace tests,
fmt/clippy, the two-engine WASM build, and smoke/experience/Sky/visual browser checks
passed. See [coverage and gate evidence](../../PR105_COVERAGE_WASM_GATES.md) for exact
commands, counts, collection corrections, review holds, and non-claims.

## Risk and rollback

Moderate test/CI-policy risk; production source is not planned to change. Exact
source identity regressions protect against false coverage inflation, negative
workflow tests protect against false-green gates, and branch protection remains
unchanged. Revert the scoped commits through a normal PR if needed; do not overwrite
retained evidence, rewrite history, or promote artifacts from an unverified run.
