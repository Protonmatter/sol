# Repository RFC process

Status: current  
Updated: 2026-07-28

Repository RFCs are internal change proposals. They are not IETF publications. They use
BCP 14 requirement language so expectations are precise and reviewable.

## When an RFC is required

Write an RFC before implementation for:

- new or changed cross-component behavior;
- public schema, provider, compatibility, or privacy changes;
- changes to scientific/accuracy claims or operational boundaries;
- a new user workflow or disclosure hierarchy;
- build, deployment, supply-chain, or release-policy changes;
- work that contradicts a current specification or accepted decision.

A focused bug fix that restores specified behavior does not require an RFC. It still links
the affected requirement and adds a regression test. A durable architectural decision also
receives an ADR after its RFC is accepted.

## States

`Draft` → `Accepted` → `Implemented`

An RFC may instead become `Rejected` or `Superseded`. The status records a decision, not
implementation progress. `Implemented` requires merged code, tests, traceability, and
documentation. A superseded RFC links its replacement.

## Workflow

1. Copy `0000-template.md` to the next four-digit number and a short slug.
2. Fill every section; use `None` only with a reason.
3. Add or update `SOL-*` requirements and acceptance evidence.
4. Open the RFC for review before depending implementation is complete.
5. Resolve normative questions and record alternatives, risk, migration, and rollback.
6. Mark accepted only after the decision owner approves the direction.
7. Implement in reviewable changes and preserve requirement-to-test traceability.
8. Mark implemented after all acceptance criteria and CI gates pass.
9. Add an ADR for durable architecture and update `RFC_ALIGNMENT.md` if prior intent drifts.

CI validates metadata, required sections, status vocabulary, and referenced requirement IDs.

