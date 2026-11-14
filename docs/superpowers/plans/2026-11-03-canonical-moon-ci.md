# Canonical Moon CI Evidence Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task. No commit, push, hosted job or production deployment is authorized by this plan. Canonical metadata changes must follow the existing two-run and independent-review conditions.

**Goal:** Make the remaining native pinned-image moon comparison concrete and reviewable, retaining evidence from two fresh containers without mutating authoritative files or qualification status.

**Architecture:** A standard-library collector validates the pinned image assertion, Linux x86_64 CPython runtime, current source identities and generated/committed hashes, then invokes the complete existing numerical validator. A two-entry CI matrix runs it in the exact existing image with a read-only mount containing only ten public inputs, no container network and fixed resource bounds. Successful collection while status is pending remains candidate evidence, not qualification.

**Tech Stack:** Existing Python generator/validator, Docker and pinned GitHub Actions. No application dependency or network behavior change.

## Tasks

- [x] Add failing collector tests for runtime/image/source refusal, output or numerical failure and unchanged pending qualification.
- [x] Implement the read-only JSON collector and two-container CI evidence job using the manifest's existing image digest.
- [x] Run focused/full Python and workflow/docs checks; independently review the collector, workflow and claims. Review found a release-inventory integration defect, corrected with fail-closed publication/gate regressions; follow-up review found no remaining issue. The full Python suite passes 550 tests. Fresh configured Python coverage also passes at 91% across 550 tool tests and 39 provider tests; the local coverage.py version remains 7.13.5 versus CI's 7.15.2 pin.
- [x] Retain Rust LLD coverage evidence and update readiness/current-state docs. The unchanged 90% line gate passes at 95.32% with 196 tests.
- [x] Complete the user-authorized Google Cloud native VM comparisons, retrieve the source-bound evidence and obtain independent review before qualification promotion. Both native image runs passed; the complete passing OCI upload/load/registration/launcher chain was independently verified. Twelve byte-exact evidence files are retained under `tests/fixtures/canonical-moon-20261103`. Only canonical metadata was promoted; source/model/output bytes and budgets were preserved.
- [x] Complete strict post-promotion native reruns and the final Python/workflow/docs checks. Two fresh strict native runs passed and their eight raw files are retained under the fixture's `strict/` inventory. The final full Python suite passes 554 tests. CI refuses pending qualification and the duplicate uncontrolled host regeneration is replaced by the two required full pinned-image validations. Final review found one fixture EOL portability issue, corrected with raw-byte Git attributes and verified across all 22 fixture paths; follow-up review reports no remaining actionable findings.
