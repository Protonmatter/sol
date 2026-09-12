# Sol correctness, delivery integrity, and experience implementation plan

Status: Accepted for local engineering; implementation candidate under validation.

Created: 2026-09-11

Source baseline: `917ad5b1c06a5070c371ffb4dc033ae2ffbc83a7`

## Outcome

Repair the 22 findings from the September 11 repository review and deliver a materially clearer, more accessible Sun / My Sky / Solar System experience. Preserve Rust mathematical authority, immutable snapshots, native ES modules, local-first privacy, deterministic research workflows, and the non-operational scientific boundary.

This package is the accepted local specification and delivery plan, not a claim that the complete milestone has passed qualification or that production controls have changed. The baseline review covered 304 tracked files and source, local test, browser, and GitHub evidence. Its passing tests coexisted with the listed defects. Implementation began from `25efcd528c13bb46a0caf364b37b98801232e7be` after one data-only fast-forward; the review baseline above remains historical. Acceptance requires new behavioral assertions, not merely rerunning that suite. Current implemented behavior and limitations are recorded in [STATUS](../../STATUS.md).

## Read in this order

1. [Context map](context-map.md): current architecture, scope, ownership and evidence limits.
2. [Problem and scope specification](problem-and-scope.md): normative acceptance criteria AC-01 through AC-35 and contract proposals.
3. [Design review](design-review.md): preferred redesign, screen compositions, workflows and accessibility.
4. [Engineering plan](engineering-plan.md): 18 reviewable delivery slices, exact affected paths, dependencies, test-first steps and exit gates.
5. [Test matrix](test-matrix.md): all 22 findings, additional hardening, unit/functional/regression/scientific/manual tests and command catalogue.
6. [Delivery and DevEx review](devex-review.md): CI/CD, artifact/data transactions, authorization, release evidence and rollback.
7. [Decision log](decision-log.md): accepted local choices, alternatives and qualification owners.
8. [RFC 0002](../../rfcs/0002-correctness-delivery-and-experience.md): accepted local authority using the existing RFC template and states.
9. [Plan review and validation](plan-review.md): independent review findings, reconciled amendments and document validation limits.

## Recommended sequence

Deliver existing-contract correctness fixes first, alongside the minimum release gate. Verify the release-bound cache/artifact transition before activating solar or ephemeris v3; develop those separate atomic migrations in parallel where safe. Introduce the shared presentation model and redesigned shell, then improve each destination. Complete the data delivery path, performance and accessibility qualification before final production promotion.

Do not hold an independently verified P1 correction until the redesign is finished. Conversely, do not ship new visual confidence, registration, accuracy or freshness claims before their data contracts and tests exist. There were no P0 findings in the reviewed evidence; this plan preserves the review's eight P1 and fourteen P2 classifications.

The proposed overhaul changes information architecture, layout, navigation, control grouping, explanations, selection and failure handling. It does not replace the Rust engines, introduce a frontend framework, or add production telemetry.

## Governance and completion

RFC 0002 is **Accepted** for local engineering under the user's implementation instruction. Its scientific, UX and release clauses still require their separate qualification evidence. ADRs 0006–0008 record the corresponding source decisions; no local author or automated review substitutes for scientific/manual acceptance or deployment authority.

The existing 16 `SOL-*` requirements remain the canonical registry. Plan-local AC identifiers refine them without inventing qualification evidence. Implementation slices update `docs/requirements.json` and `docs/REQUIREMENTS.md` with real files and actual CI job names. Source coverage is not proof that those jobs passed on GitHub.

Completion means all AC-01–AC-35 have linked evidence, all F01–F22 are closed or explicitly retained as release-blocking, the complete current-master release gate passes, the same tested artifact is served, manual qualification is recorded, and rollback to a corrected compatible artifact is demonstrated. A code merge, green fetch job, coverage percentage, or attractive screenshot alone is insufficient.

## Planning assumptions

- Work proceeds from the reviewed clone, not another dirty working copy. Reconcile newer upstream changes before implementation.
- Reviewer roles must be assigned by the maintainer; no person, team, deadline or approval is invented here.
- Estimates are sequencing guidance, not a calendar commitment: three parallel engineering lanes are useful after the foundational decisions, with a single integration owner for shared contracts and the UI shell.
- Commits, pushes, PR writes, settings changes, identities/tokens, merges, deployments and registry publication require the relevant explicit execution authority. This package performs none of them.
