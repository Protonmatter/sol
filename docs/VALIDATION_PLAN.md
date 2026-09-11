# End-to-end validation and regression plan

Status: current  
Updated: 2026-09-11

This is a required validation plan, not a report that every gate passed. The current
working tree is implemented-local; RFC 0002 remains Accepted. Full manual/scientific,
coverage/platform and release qualifications must retain explicit held/pending results.

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
| Generated data | Generator test, immutable source/output hashes, qualified runtime and output diff; explicitly held where regeneration inputs are missing |
| UI structure or copy | UX contract, keyboard/status assertions, narrow/wide manual check |
| Canvas/WebGL behavior | Pure geometry tests, real-browser flow, semantic image assertion |
| Privacy or remote request | Exact-recipient consent, deny/revoke zero calls, pre-transmission redirect rejection, payload binding, last-valid retention and explicit recovery |
| Workflow/deployment | SDLC workflow validator, least privilege, immutable pins, rollback/evidence update |
| Documentation only | Offline link/style validation and claim-to-tree review |

## Browser and visual regression

Browser validation builds both WASM engines and serves the staged candidate, blocks uncontrolled
external requests, freezes time, and exercises the Sun, My Sky, Solar System, timeline,
tour, explicit provider recovery, selection, camera, and disclosure controls in Chromium.
Additional Sky and experience harnesses exercise actual worker scheduling/identity/cancel,
keyed focus, pending/errors, privacy previews and narrow reflow. The Sky redirect fixture
uses two local origins and requires zero requests to the unapproved destination.
These checks do not certify actual screen readers, touch platforms, contrast, system
clipboard permissions or general performance SLOs.

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
percentage so data rows cannot inflate application coverage. Generated schema objects
require canonical-equality tests for exclusion; hand-written guards and workers stay in
the denominator. Coverage is a guardrail, not
a substitute for assertions or risk-based tests.

## Determinism and generated data

- Fixture and cycle-series generators run twice and compare byte-for-byte.
- Regenerated output must also match committed output.
- Reference Rust simulations run twice on Linux, macOS, and Windows.
- The three operating-system snapshots compare byte-for-byte and pass the shared schema.
- Cache tokens and manifest hashes bind final staged bytes; builds leave source unchanged.
- Canonical moon generation is a separately held Linux x86_64 qualification. Noncanonical
  diagnostic comparisons cannot authorize overwrites.
- Coefficient source/output identity and non-regenerable gaps are explicit in
  [COEFFICIENT_PROVENANCE.md](COEFFICIENT_PROVENANCE.md). No regeneration claim is made
  for missing raw inputs or serializer correspondence.

## Failure injection and degraded paths

Regression validation includes malformed and semantically invalid JSON, stale/future data,
missing optional values, remote-provider failure, absent network assets, unavailable remote
textures, invalid observer input, optional event absence, and explicit research-only
readiness blockers. An unavailable optional dependency must not corrupt the deterministic
core path. Include sparse/duplicate-key input, worker stale replies/wrong identity/deadlines,
bounded admission, queue cancellation, out-of-window/ambiguous event states, mixed bundle
hashes/identity, interrupted writes and pointer switches. Source/derived bundle faults
must preserve the old selection; browser intake must publish no partial store.

## Scientific and performance qualification

The current eight immutable TOP2013 vector cases establish source-theory parity at their
recorded epochs only. They do not qualify apparent place, observer/geocentric range or
event accuracy. New references must retain original immutable bytes, acquisition time,
quantity and frame/time-scale conventions, bounds and predeclared thresholds. Missing or
malformed reference/measured-threshold evidence fails closed. No external call is required
for the default offline suite; absence of required independent evidence remains a hold.

Measure fixed workloads with platform/browser/CPU conditions and source/artifact identity.
The System nine-body raw-position exception was locally profiled; it is not evidence for
all devices or the whole-app interaction budget. Full solves/metadata remain in workers.
Manual evidence must name actual cases, devices and source fingerprints; never replace
missing cases with broad accessibility or responsiveness claims.

## Release evidence

For every candidate SHA, GitHub Actions retains:

- Rust, JavaScript, and Python coverage reports;
- Chromium screenshots and browser execution coverage;
- cross-OS deterministic snapshots;
- crash artifacts from scheduled fuzzing when present;
- workflow logs that identify commands, toolchains, and the source SHA.

GitHub Pages verifies and promotes the exact same candidate artifact, with no source
rebuild on the privileged runner. Same-run mandatory jobs, artifact identity, protected
profiles/accepted evidence, reference freshness and settings are checked before and after
environment approval. Served critical-byte verification is a further distinct result.
Repository settings, accepted manual/scientific evidence, registry status and actual
rollback require independent authoritative evidence; missing inputs hold promotion.
See [RELEASE_DELIVERY.md](RELEASE_DELIVERY.md). Local synthetic policy fixtures do not
qualify hosted execution.

## Local validation

Use the commands in `INSTRUCTIONS.md`. A developer without Rust or Chromium can run the
governance, docs, Python, Node unit, type, static-web, and deterministic generator checks,
but MUST state which toolchain-dependent gates were left to CI.
