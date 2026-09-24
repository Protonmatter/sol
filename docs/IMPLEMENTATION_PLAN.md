# Implementation plan

Status: active  
Updated: 2026-09-23

This plan describes delivery work, while `STATUS.md` describes implemented product behavior
and `ROADMAP.md` records longer-horizon product direction.

## Active milestone: correctness, delivery integrity and experience

The September 11 review is translated into a detailed, specification-driven
[implementation package](plans/2026-09-11-correctness-and-experience/README.md) and
[Accepted RFC 0002](rfcs/0002-correctness-delivery-and-experience.md). It covers all 22 review
findings, 35 acceptance criteria, atomic scientific contract migrations, a material
three-destination UI/UX redesign, complete test traceability and tested-artifact CI/CD.

The user authorized local implementation on September 11. The source candidate now includes
v3 contracts, the redesigned interface, worker lifecycle controls, immutable feed/artifact
transactions, regression tests and gated workflow definitions. RFC status remains Accepted,
not Implemented: full scientific/manual/cross-platform qualification and production promotion
are not established by local source changes. No commit, push, settings change or deployment
was performed. See `STATUS.md` and the implementation package for evidence boundaries.

## Prior objective: executable SDLC and full validation

Acceptance outcome: a contributor can move from requirement to design, implementation,
verification, review, and tested-SHA deployment using repository guidance and CI evidence.

Completed in this change:

- define the repository SDLC, standards boundary, UX contract, and validation matrix;
- establish stable machine-readable `SOL-*` traceability;
- add an internal RFC process and a concrete RFC for the governance change;
- add contributor and pull-request evidence workflows;
- enforce requirements, RFC structure, dependency hygiene, immutable action pins, coverage
  thresholds, tested-SHA deployment, and UX structure in CI;
- extend real-browser validation to assert progressive-disclosure runtime behavior;
- update README, instructions, operations, readiness, status, and handoff documentation.

Exit criteria:

- governance, docs, UX, unit, type, static-web, contract, deterministic, browser, visual,
  coverage, and deployment workflow checks are documented and connected to CI;
- all locally available validations pass;
- toolchain-dependent Rust/WASM/Chromium checks pass on GitHub Actions before merge;
- no documentation claims a gate that the workflow does not enforce.

## Next product increments

### Enhanced Earth review candidate

The user approved the bounded optional mode in [RFC 0008](rfcs/0008-enhanced-earth.md).
Implementation includes guarded ocean grading, a nominal 8 km cloud shell,
Sun-directed shadows, independent rotation-gated drift, lifecycle recovery and
release-fingerprint coverage for the new rendering modules. The default remains off.
See [validation evidence](validation/enhanced-earth/README.md) for the comparison and
exact scope. Next gates are draft review, CI Rust/WASM/browser and coverage checks,
then native/mobile appearance and performance. Local source completion does not
authorize merge or production promotion.

### Operational evidence

- Calibrate physical magnetic units and publish the method.
- Add historical forecast validation and SWPC product comparison.
- Define monitored adapter service levels, incident ownership, and rollback drills.
- Keep `space_weather_operational=false` until every operational gate has independent
  evidence and approval.

### Accessibility and usability evidence

- Run a scoped WCAG 2.2 AA manual audit across wide, narrow, keyboard-only, zoomed, and
  screen-reader flows.
- Conduct task-based tests for first-time Sun interpretation and advanced research use.
- Turn validated findings into `SOL-UX-*` requirements and regression tests.

### Security ownership

- Have repository owners approve system scope, threat model, reporting route, supported
  versions, severity context, and response expectations before adding a root `SECURITY.md`.
- Perform a versioned OWASP ASVS assessment only for controls applicable to the deployed
  static application and optional provider.

## Plan maintenance

Each pull request updates this file when it completes, adds, removes, or materially changes
an objective or exit criterion. Do not use completion percentages without a defined
denominator. Completed historical implementation detail belongs in `STATUS.md`, an RFC, or
an ADR rather than accumulating indefinitely here.
