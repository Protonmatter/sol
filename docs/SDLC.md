# Software development lifecycle

Status: current  
Updated: 2026-07-28

This is the repository-wide delivery contract. It integrates specification-driven
development with the secure-development vocabulary in `STANDARDS.md`. The canonical
traceability records are `requirements.json`; CI rejects missing or dangling evidence.

## Lifecycle

### 1. Frame the change

Start with the user problem, scope, non-goals, operational risk, data/privacy impact, and
measurable outcome. Link an existing `SOL-*` requirement or propose a new one.

Classify the change:

- **Patch:** local defect or documentation correction that preserves architecture and
  public contracts. Update requirements/tests if its acceptance evidence changes.
- **Feature:** new behavior within accepted architecture. Update a current specification
  and add acceptance criteria before implementation.
- **Design change:** new cross-component behavior, user workflow, provider, standard, or
  compatibility policy. Write an RFC under `docs/rfcs/`.
- **Architecture change:** a durable choice, reversal, or exception affecting system
  boundaries. Write an RFC and an ADR; the ADR records the final decision.
- **Contract or operational-boundary change:** always treated as a design change, even
  when the diff is small.

### 2. Specify before implementation

A change specification MUST define:

- requirement IDs and BCP 14 statements;
- personas or callers and the primary workflow;
- inputs, outputs, failure modes, trust boundaries, privacy, and compatibility;
- accuracy, provenance, calibration, or performance limits where applicable;
- acceptance criteria that are observable and testable;
- rollout, monitoring, rollback, and documentation impact.

Open questions stay explicit. Implementation must not silently decide a normative question.

### 3. Design and review

Record alternatives and material trade-offs. For UI work, apply `UX_GUIDELINES.md`. For a
new external interface, map applicable RFC or W3C requirements from `STANDARDS.md`. For a
security-sensitive surface, identify attacker-controlled input, protected assets, failure
behavior, and dependency risk.

Accepted RFCs authorize implementation. Accepted ADRs supersede conflicting historical
design intent. Neither artifact replaces executable acceptance tests.

### 4. Implement in reviewable increments

- Preserve the snapshot boundary and operational disclaimers.
- Keep generated data reproducible and source-attributed.
- Pin dependencies and actions; avoid unnecessary runtime dependencies.
- Keep a patch focused. Do not mix unrelated cleanup with a behavior change.
- Add tests with the implementation, not as a later hardening phase.
- Update user, developer, operator, and release documentation in the same pull request.

### 5. Verify

Run the change-specific tests first, then the full local validation in `INSTRUCTIONS.md`.
CI owns toolchain-dependent Rust, WASM, Chromium/WebGL, cross-OS, coverage, and deployment
validation. A failure must be fixed or explicitly re-scoped; required gates are not waived
by prose.

### 6. Review and merge

The pull request template is the evidence packet. Reviewers verify:

- requirement and specification traceability;
- correctness, negative cases, and regression impact;
- scientific/accuracy claims and operational boundaries;
- UX, accessibility, privacy, security, and data-provenance impact;
- CI evidence, release risk, rollback, and documentation.

Approval means the evidence supports the change, not merely that the code appears plausible.
Merge only after required checks pass and review threads are resolved.

### 7. Release and operate

GitHub Pages builds and deploys the exact successful `master` CI SHA. Coverage, browser
visuals, deterministic snapshots, and validation logs are retained as workflow evidence.
Operational incidents and escaped defects must produce a regression test and, when the root
cause is systemic, an updated requirement, RFC, ADR, or lifecycle check.

## Contract and schema changes

A schema change MUST update in one pull request:

1. a new contract version or a documented backward-compatible extension;
2. schema and semantic rules;
3. all in-repository producers and consumers;
4. browser runtime guards and optional providers;
5. fixtures, positive/boundary/negative tests, and migration behavior;
6. current specification, accuracy notes, instructions, and traceability evidence.

Mixed versions fail closed unless an explicitly tested compatibility adapter exists.

## Documentation as code

The following are release artifacts:

- `README.md`: product boundary, quick start, and documentation map;
- `CONTRIBUTING.md`: contributor workflow and definition of done;
- `SPEC.md`: current architecture and product contract;
- `requirements.json` and `REQUIREMENTS.md`: normative traceability;
- `rfcs/` and `adr/`: proposals and durable decisions;
- `UX_GUIDELINES.md`: current interaction contract;
- `VALIDATION_PLAN.md`: test strategy and CI evidence;
- `IMPLEMENTATION_PLAN.md`, `ROADMAP.md`, and `STATUS.md`: delivery intent and current state;
- `OPERATIONS.md` and `OPERATIONAL_READINESS.md`: deployment and operating boundary.

Claims, commands, file names, workflow names, and status MUST match the repository in the
same commit. CI validates structure, links, evidence paths, and critical workflow contracts.

## Secure development and supply chain

The lifecycle maps to NIST SSDF 1.1 without claiming certification:

| SSDF practice group | Sol implementation |
|---|---|
| Prepare the Organization | requirements, RFC/ADR process, contributor workflow, defined release boundary |
| Protect the Software | least-privilege Actions, SHA-pinned actions, lockfiles, reviewed dependency updates |
| Produce Well-Secured Software | threat-boundary notes, validation, finite/bounded parsers, tests, coverage, reproducible builds |
| Respond to Vulnerabilities | private reporting when enabled, regression tests, corrective requirement/ADR updates |

Potential vulnerabilities should use GitHub private vulnerability reporting when enabled.
If unavailable, request a private maintainer route without posting vulnerability details.
Do not include secrets, personal data, or unnecessary exploit details in issues or pull
requests. A maintainer-owned response SLA and security-policy scope remain an owner decision
and are not invented here.

## Definition of done

A change is done only when:

- its requirement and specification are current;
- implementation and failure behavior match the acceptance criteria;
- unit, integration, contract, browser, and regression tests are added as applicable;
- coverage and deterministic gates remain green;
- UI changes pass disclosure, keyboard, responsive, reduced-motion, and status checks;
- privacy, security, provenance, and operational limits are documented;
- docs, instructions, status, and implementation plan are accurate;
- rollback is practical and the release evidence identifies the tested commit.
