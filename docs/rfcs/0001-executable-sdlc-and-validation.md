# RFC 0001: Executable SDLC and end-to-end validation

- Status: Implemented
- Authors: Sol maintainers and contributors
- Created: 2026-07-28
- Target: repository governance baseline
- Requirements: `SOL-UX-001`, `SOL-UX-002`, `SOL-UX-003`, `SOL-TEST-001`, `SOL-COV-001`, `SOL-VIS-001`, `SOL-CI-001`, `SOL-DOC-001`, `SOL-SUPPLY-001`, `SOL-REL-001`

## Summary

Sol adopts a specification-driven lifecycle with stable requirement IDs, an RFC/ADR
decision path, contributor evidence, progressive-disclosure acceptance rules, and automated
governance checks. Existing Rust, Python, WASM, browser, visual, accuracy, coverage,
determinism, and tested-SHA deployment gates become one documented end-to-end validation
system.

## Context

The repository already has strong implementation checks and historical ADR/spec records,
but it did not define how a future change moves from requirement to reviewable evidence.
There was no current RFC template, machine-readable traceability, contributor guide, PR
evidence template, or CI validator preventing those artifacts from drifting.

The browser already applies progressive disclosure, but the requirement existed mainly in
historical design prose. Runtime browser tests exercised controls without explicitly
proving the initial disclosure state and accessible open/close behavior.

## Requirements

- Normative behavior MUST have a stable `SOL-*` ID and executable evidence.
- Cross-component, contract, privacy, UX-workflow, and release-policy changes MUST begin
  with an RFC.
- Durable architecture decisions MUST be captured in an ADR.
- Documentation and implementation evidence MUST change together.
- UI validation MUST cover the primary/secondary split, accessible disclosure semantics,
  keyboard paths, error recovery, and meaningful visual invariants.
- Release CI MUST preserve at least 90% coverage gates and deploy only the successful
  `master` CI SHA.

## Design

`docs/requirements.json` is the canonical traceability graph. Human guidance is separated
by purpose: lifecycle, standards, requirements, UX, validation, implementation plan, and
contribution flow. `tools/validate_sdlc.py` validates that graph and critical workflow
properties. `tools/validate_ux_contract.py` validates stable HTML semantics, while Chromium
validates runtime disclosure and user flows.

The governance check runs as its own CI job. Pages continues to trigger only after the
entire CI workflow succeeds, so governance becomes a release gate without coupling it to a
specific language toolchain.

## UX and accessibility

The Sun, current interpretation, and state remain initially visible. Research and rare
controls remain in native, named disclosures. The validator ensures advanced groups are
closed according to policy, the primary overlay workflow stays visible, and canvas views
retain labelled text alternatives. Chromium asserts initial state, disclosure toggling,
panel expanded state, and destination selection before exercising deeper flows.

WCAG 2.2 AA is a target, not a conformance claim. Manual screen-reader and usability
evidence remains necessary.

## Security and privacy

The change adds no production endpoint or secret. Dependency ecosystems receive automated
update configuration, Actions remain SHA-pinned with least privilege, and location stays
local by default. A root security policy is deliberately deferred until owners approve the
threat boundary, supported versions, severity context, and response expectations.

## Alternatives

- **Documentation only:** rejected because it cannot detect drift.
- **Issue labels as requirements:** rejected because release evidence would depend on
  mutable external state.
- **Full requirements-management service:** rejected because it adds access and availability
  dependencies for a small open repository.
- **Full-page pixel goldens:** rejected because they are brittle across rendering engines;
  semantic image assertions identify the scientific/rendering invariants more precisely.

## Risks

- Process can become ceremonial. Mitigation: RFCs are required only for material design
  changes; patches use existing requirement IDs.
- Path existence can be mistaken for proof. Mitigation: review guidance explicitly requires
  inspecting whether evidence proves the statement.
- Automated UX checks can create false confidence. Mitigation: no WCAG claim and explicit
  manual validation requirements.
- Workflow text checks can be brittle. Mitigation: test the small set of release invariants,
  use unit tests, and keep workflow changes reviewable.

## Acceptance criteria

- Required lifecycle documents and templates exist and pass offline documentation checks.
- Every canonical requirement has unique metadata and resolvable evidence paths.
- Every implemented RFC has required metadata, sections, and known requirement IDs.
- CI rejects mutable third-party action tags, missing coverage thresholds, unlocked
  dependency installation, or deployment that does not consume the successful CI SHA.
- Static UX validation rejects disclosure-policy or accessibility-structure regressions.
- Chromium proves the initial and toggled disclosure states before full user-flow coverage.
- README, contributor instructions, operations, readiness, status, and handoff accurately
  describe the workflow.

## Validation

- Python unit tests for valid and intentionally broken SDLC/UX fixtures.
- Offline documentation validation.
- Current repository SDLC and UX validators.
- Node web unit tests, JSDoc typecheck, and static-web validation.
- Built-WASM Chromium smoke and browser coverage with WebGL image assertions.
- Rust, Python, and whole-web coverage gates at or above 90%.
- Cross-operating-system determinism and exact-SHA Pages deployment.

## Rollout and rollback

This is a repository-only governance change plus additional validation. It has no data
migration. If a validator has a false positive, revert the smallest validator rule while
preserving the requirement and document the exception in the pull request; do not bypass
the complete CI workflow. Workflow artifacts allow diagnosis against the exact SHA.

## Documentation

This RFC adds or updates README, contribution guidance, standards, SDLC, requirements, UX,
validation, implementation plan, instructions, operations, readiness, status, handoff, RFC
alignment, and pull-request guidance.
