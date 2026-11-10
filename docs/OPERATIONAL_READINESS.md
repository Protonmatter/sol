# Operational Readiness

## Current Status

Solar Maximum Engine is a research and learning application. Its live contract is
`solar-state-snapshot.v3`, including `operational-readiness.v1`. The checks below
verify declared research gates and snapshot consistency. Full production release
acceptance also requires the evidence in [the validation plan](VALIDATION_PLAN.md).

It is not an operational space-weather warning or mission-safety system.

## Research/Learning Gates

Required passing gates:

- `solar-state-snapshot.v3` passes the current structure and semantic validator.
- `operational-readiness.v1` is present.
- All nine required gate identifiers are present exactly once, with boolean states.
- The coordinate frame is explicit, and all five required research gates pass.
- Deterministic fixture replay is available.
- Public-data provenance is retained for observed or cached context.
- Normalized magnetic units are visible in the snapshot and UI.
- Research panel keeps equations, provenance, adapter health, warnings, and readiness gates behind user intent.
- Governance and traceability contracts resolve every implemented requirement to current
  specifications, implementation, verification, and CI evidence.
- Browser validation confirms visible rendering, progressive-disclosure defaults and
  toggling, responsive structure, provider recovery, WASM/WebGL behavior, and readable
  degraded/fixture/cached states.
- Rust, Python, and the denominator-complete hand-written web runtime meet the 90% line
  coverage policy.

## Space-Weather Operational Blockers

These are intentionally failing gates in `operational-readiness.v1`:

- Calibrated physical magnetic units such as Gauss or Mx.
- Historical validation and skill scores against known periods.
- Comparison against operational NOAA/SWPC products.
- Freshness monitoring and schema-regression alerting for live adapters.
- Alerting, on-call ownership, incident response, rollback, and audit logs.
- External approval to use outputs for warnings, mission safety, or fleet decisions.

## Validation Commands

Research/learning validation uses new review outputs under `build/`. Run the
commands in order and stop if any command exits nonzero. Choose a new directory;
the guard below refuses an existing one. These commands do not replace application
snapshots or committed observation fixtures.

```bash
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_ux_contract.py
python -c "from pathlib import Path; Path('build/readiness-review').mkdir(parents=True, exist_ok=False)"
python tools/generate_fixture_snapshot.py --out build/readiness-review/snapshot.json --observations-out build/readiness-review/observations.json --seed 42
python tools/validate_snapshot.py build/readiness-review/snapshot.json
python tools/validate_operational_readiness.py build/readiness-review/snapshot.json
python tools/validate_web_static.py --root apps/web
python tools/validate_notebook.py notebooks/solar-maximum-lab.ipynb
```

The full release assessment additionally requires the Rust/WASM, Chromium/WebGL, coverage,
cross-OS determinism, and tested-SHA deployment gates in `VALIDATION_PLAN.md`.

The readiness checker accepts a valid research declaration with exit0. Invalid
JSON, unreadable input, malformed or ambiguous gates, unsupported readiness versions
and an unsupported operational assertion return exit1. Invalid CLI usage returns
exit2. Duplicate keys, nonfinite JSON values and invalid gate identifiers are
rejected without printing the supplied payload. The checker does not replace
full snapshot validation or prove independent scientific qualification.

The operational assertion is expected to fail for every current v1 declaration,
including reports that flip all operational booleans. Support for operational
use requires a future qualified contract and actual supporting evidence:

```bash
python tools/validate_operational_readiness.py build/readiness-review/snapshot.json --require-space-weather-operational
```

## Checker verification — 2026-11-05

The standalone checker previously accepted a failed gate followed by a passing
duplicate, skipped malformed rows and a missing coordinate-frame gate, and raised
an exception for unhashable identifiers. A v1 report could also flip all operational
booleans and pass the operational assertion. The corrected checker rejects those
inputs before accepting a declaration and uses strict JSON intake.

All 14 new regression groups pass after an initial run with 27 failed subcases
and eight errors. The complete coverage run passes 743 Python tests and 39 server
tests. The affected checker is enrolled alongside the existing 50 modules, with
identical 51-module scope in both JSON/XML evidence and CI report declarations.
The existing 90% gate passes at 90.37% including branches; line coverage is 92.80%.
The checker itself has 96.39% line and 93.18% branch coverage. No coverage floor or
pre-existing module is removed. Independent scoped review finds no actionable issue.

The scratch runbook sequence passes live v3 snapshot and research-declaration
validation; the operational assertion returns the expected exit1. Original
application data and browser source hashes remain unchanged. Retained local
evidence is `build/readiness-gate-20261105-01/`, with summary SHA-256
`a39a76412715d1fb7b6d67efb6b067b20eb1969b9c091aa1843d116fb78ae98c`.
This check grants no operational, scientific or production release qualification.
