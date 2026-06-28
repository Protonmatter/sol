# Operational Readiness

## Current Status

Solar Maximum Engine v1 is a research and learning application. It can be operated as a deterministic snapshot viewer and teaching lab when the offline validation commands pass.

It is not an operational space-weather warning or mission-safety system.

## Research/Learning Gates

Required passing gates:

- `solar-state-snapshot.v1` validates.
- `operational-readiness.v1` is present.
- Deterministic fixture replay is available.
- Public-data provenance is retained for observed or cached context.
- Normalized magnetic units are visible in the snapshot and UI.
- Research panel keeps equations, provenance, adapter health, warnings, and readiness gates behind user intent.
- Browser smoke test confirms visible solar rendering, responsive layout, hidden research panel by default, and readable degraded/fixture/cached states.

## Space-Weather Operational Blockers

These are intentionally failing gates in v1:

- Calibrated physical magnetic units such as Gauss or Mx.
- Historical validation and skill scores against known periods.
- Comparison against operational NOAA/SWPC products.
- Freshness monitoring and schema-regression alerting for live adapters.
- Alerting, on-call ownership, incident response, rollback, and audit logs.
- External approval to use outputs for warnings, mission safety, or fleet decisions.

## Validation Commands

Research/learning validation:

```bash
python tools/generate_fixture_snapshot.py --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
python tools/validate_snapshot.py apps/web/data/latest-state.json
python tools/validate_operational_readiness.py apps/web/data/latest-state.json
python tools/validate_web_static.py --root apps/web
python tools/validate_notebook.py notebooks/solar-maximum-lab.ipynb
```

Future operational validation, expected to fail in v1:

```bash
python tools/validate_operational_readiness.py apps/web/data/latest-state.json --require-space-weather-operational
```
