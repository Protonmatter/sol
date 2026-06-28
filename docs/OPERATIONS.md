# Solar Maximum Engine Operations

## Purpose

Run deterministic research and learning workflows for the Solar Maximum Engine. This app is not approved for operational space-weather warning, fleet safety decisions, or mission-critical forecasting.

The workflow is anchored to public sources and methods: NOAA/SWPC data products, Helioviewer metadata/quicklooks, JPL/NAIF SPICE-style observer geometry, and NOAA WSA-Enlil as a public operational product family for future comparison learning. Do not describe outputs as SpaceX-equivalent or proprietary JPL/SpaceX-derived.

## Preconditions

- Python 3.11+ for fixture generation, validation, notebooks, and public-data cache helpers.
- Rust toolchain for `cargo test --workspace` and `solar-cli`.
- Network access only when running `tools/fetch_public_data.py`.

## Deterministic Offline Run

```bash
python tools/generate_fixture_snapshot.py --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
python tools/validate_snapshot.py apps/web/data/latest-state.json
python tools/validate_operational_readiness.py apps/web/data/latest-state.json
python tools/validate_web_static.py --root apps/web
python tools/validate_notebook.py notebooks/solar-maximum-lab.ipynb
```

Expected result: exit code `0` from validation commands and an updated static web fixture. This validates the research/learning track only.

## Rust Run

```bash
cargo test --workspace
cargo run -p solar-cli -- simulate --steps 48 --dt-hours 1 --seed 42 --out apps/web/data/latest-state.json
cargo run -p solar-cli -- ingest swpc --cache .cache/solar-data --out tests/fixtures/live-swpc-normalized.json --fallback-fixtures tests/swpc_scn26_21
cargo run -p solar-cli -- replay --snapshot apps/web/data/latest-state.json --out apps/web/data
```

Expected result: Rust tests pass, snapshot is written, SWPC observation frame is fixture-backed or cache-backed with provenance retained, and `apps/web/data/latest-state.json` is ready for the web app.

## Optional Live Cache

```bash
python tools/fetch_public_data.py --cache .cache/solar-data
python tools/generate_fixture_snapshot.py --cache .cache/solar-data --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
```

This command fetches public NOAA/SWPC Kp, F10.7, GOES/X-ray, real-time solar-wind, solar-region, cycle, and Helioviewer context. Add `--include-jpl` only when JPL Horizons geometry context is needed. Cache files are local working data and should not be treated as validated truth.

## Daily Research Feed

Run one daily ingest/update cycle:

```bash
python tools/run_daily_ingest.py --include-jpl
```

Expected result:

- Public source files are written under `.cache/solar-data`.
- A daily archive is written under `.cache/solar-data/history/<YYYY-MM-DD>`.
- `apps/web/data/latest-state.json` is regenerated from the cache.
- `apps/web/data/latest-observations.json` stores normalized observation provenance.
- `apps/web/data/feed-status.json` records source health, failures, validation commands, last run, and next recommended run.

The daily feed updates research context. It does not make `operational_readiness.space_weather_operational` true.

On Windows, schedule a per-user daily task:

```powershell
.\tools\install_daily_ingest_task.ps1 -Time 06:15 -IncludeJpl
```

Rollback the scheduled task:

```powershell
.\tools\install_daily_ingest_task.ps1 -Uninstall
```

## Readiness Gates

The app has two operational tracks:

- Research/learning operation is allowed when deterministic replay, snapshot validation, static web checks, notebook validation, and browser smoke checks pass.
- Space-weather operational use remains blocked while `operational_readiness.space_weather_operational` is `false`.

To verify that the app remains honest about this boundary:

```bash
python tools/validate_operational_readiness.py apps/web/data/latest-state.json
```

To test a future release that claims operational status, the stricter gate must pass:

```bash
python tools/validate_operational_readiness.py apps/web/data/latest-state.json --require-space-weather-operational
```

That stricter command is expected to fail for v1 because calibrated physical units, historical validation, SWPC product comparison, and operational monitoring are not implemented.

## Rollback

Restore the deterministic fixture:

```bash
python tools/generate_fixture_snapshot.py --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
```

Delete `.cache/solar-data` to remove live public-data cache state.

## Known Risks

- Magnetic fields are normalized demonstration units, not calibrated Gauss or Mx.
- Live public endpoints can change schema or availability.
- Helioviewer quicklook imagery is useful for overlays, not calibrated FITS analysis.
- The web app is static and renders snapshots; it does not run the physics model in the browser.
- `operational_readiness` must remain visible in research tooling and must not be flipped to operational without evidence.
