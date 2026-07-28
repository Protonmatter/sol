# End-to-end validation and regression plan

Status: current  
Updated: 2026-07-28

The validation strategy follows the data and user flow from source input through contracts,
engines, WASM, browser interaction, coverage, and deployment. No single test tier is treated
as proof of the whole system.

## Validation layers

| Layer | Purpose | Primary evidence |
|---|---|---|
| Governance | Requirements, RFCs, docs, dependency and workflow integrity | `validate_sdlc.py`, `validate_docs.py` |
| Unit | Pure math, parsers, rendering helpers, state transitions | Rust, Python, and Node tests |
| Contract | Schema plus cross-field semantics across every producer/consumer | snapshot validators, runtime guard, provider tests |
| Integration | CLI ingest/simulate, WASM build, provider continuity, generated data | CI web job and Rust workspace |
| End-to-end | Served app with built WASM, Chromium, WebGL, user interactions, fallbacks | `browser_smoke.py`, `browser_validation.mjs` |
| Visual regression | Semantic colour, visibility, and camera continuity | PNG assertions and retained artifacts |
| Determinism | Repeatability within and across operating systems | CI matrix and byte comparison |
| Accuracy | Public-reference scientific envelope and freshness | Horizons and EOP workflows |
| Release | Exact tested SHA, reproducible build, artifact and environment evidence | Pages workflow |

## Change-to-test mapping

| Change | Required minimum evidence |
|---|---|
| Pure Rust/Python/JS logic | Unit tests with positive, boundary, and negative cases |
| JSON contract or provider | New version/compatibility policy, fixtures, schema and semantic tests, browser guard |
| Scientific constants or algorithms | Source edition, dimensional/range tests, accuracy-budget update, external evidence where available |
| Generated data | Generator test, provenance, deterministic regeneration, committed-output diff |
| UI structure or copy | UX contract, keyboard/status assertions, narrow/wide manual check |
| Canvas/WebGL behavior | Pure geometry tests, real-browser flow, semantic image assertion |
| Privacy or remote request | Consent, payload, unavailable/error, and local-fallback tests |
| Workflow/deployment | SDLC workflow validator, least privilege, immutable pins, rollback/evidence update |
| Documentation only | Offline link/style validation and claim-to-tree review |

## Browser and visual regression

CI builds both WASM engines, serves the production static files, blocks uncontrolled
external requests, freezes time, and exercises the Sun, My Sky, Solar System, timeline,
tour, provider fallback, selection, camera, and disclosure controls in Chromium.

The visual checks are semantic rather than brittle full-page golden screenshots:

- the Sun must remain warm white instead of an incorrect orange cast;
- Earth must contain a meaningful visible blue-ocean population;
- a mathematically exact full camera orbit must return to a materially equivalent image.

Screenshots and browser coverage are uploaded even when the job fails. A future visual
assertion must explain the user-visible invariant, deterministic setup, tolerance, and
expected diagnostic image.

## Coverage policy

- Rust workspace line coverage: **at least 90%**.
- Python selected production validator/provider line coverage: **at least 90%**.
- Node-executed production modules: **at least 90% lines, branches, and functions**.
- Whole hand-written web runtime after Node plus Chromium merge: **at least 90% lines**.

The whole-web denominator seeds browser-only and WebGL modules at zero before merging
Chromium execution. Generated catalogues must load in Chromium but are excluded from the
percentage so data rows cannot inflate application coverage. Coverage is a guardrail, not
a substitute for assertions or risk-based tests.

## Determinism and generated data

- Fixture and cycle-series generators run twice and compare byte-for-byte.
- Regenerated output must also match committed output.
- Reference Rust simulations run twice on Linux, macOS, and Windows.
- The three operating-system snapshots compare byte-for-byte and pass the shared schema.
- Cache tokens are derived from content, stamped, checked against the committed files, and
  proven idempotent.

## Failure injection and degraded paths

Regression validation includes malformed and semantically invalid JSON, stale/future data,
missing optional values, remote-provider failure, absent network assets, unavailable remote
textures, invalid observer input, optional event absence, and explicit research-only
readiness blockers. An unavailable optional dependency must not corrupt the deterministic
core path.

## Release evidence

For every candidate SHA, GitHub Actions retains:

- Rust, JavaScript, and Python coverage reports;
- Chromium screenshots and browser execution coverage;
- cross-OS deterministic snapshots;
- crash artifacts from scheduled fuzzing when present;
- workflow logs that identify commands, toolchains, and the source SHA.

GitHub Pages checks out the successful CI `head_sha`, rebuilds WASM and deterministic data,
validates the artifact, and deploys through the `github-pages` environment. Repository
settings should require CI, Coverage, and Docs checks on `master`; environment protection
and required reviewers are configured in GitHub settings, not asserted by repository files.

## Local validation

Use the commands in `INSTRUCTIONS.md`. A developer without Rust or Chromium can run the
governance, docs, Python, Node unit, type, static-web, and deterministic generator checks,
but MUST state which toolchain-dependent gates were left to CI.

