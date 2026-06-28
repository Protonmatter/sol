# Daily Public-Data Ingest

## Purpose

Run one bounded daily ingest cycle for Solar Maximum Engine research snapshots. The feed updates cached public context from NOAA/SWPC, Helioviewer, and optional JPL Horizons, then regenerates the static web snapshot from the cache.

This is not an operational warning feed.

## Sources

Critical sources:

- NOAA/SWPC RTSW magnetic field: `https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json`
- NOAA/SWPC RTSW solar wind: `https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json`

Optional research context:

- NOAA/SWPC RTSW ephemerides.
- NOAA/SWPC observed and predicted solar-cycle indices.
- NOAA/SWPC solar regions and sunspot report.
- NOAA/SWPC planetary K index and F10.7 cm flux.
- NOAA/SWPC GOES X-ray flux and 7-day flare events.
- Helioviewer API data-source metadata.
- JPL Horizons Sun/Earth observer geometry when `--include-jpl` is passed.

## One-Time Run

```bash
python tools/run_daily_ingest.py --include-jpl
```

Outputs:

- `.cache/solar-data/manifest.json`
- `.cache/solar-data/history/<YYYY-MM-DD>/...`
- `apps/web/data/latest-state.json`
- `apps/web/data/latest-observations.json`
- `apps/web/data/feed-status.json`

## Offline/Revalidation Run

Use the existing cache without network calls:

```bash
python tools/run_daily_ingest.py --skip-fetch
```

## Windows Daily Schedule

Install a per-user daily task:

```powershell
.\tools\install_daily_ingest_task.ps1 -Time 06:15 -IncludeJpl
```

Preview without changing task state:

```powershell
.\tools\install_daily_ingest_task.ps1 -Time 06:15 -IncludeJpl -WhatIf
```

Rollback:

```powershell
.\tools\install_daily_ingest_task.ps1 -Uninstall
```

## Validation

```bash
python tools/validate_snapshot.py apps/web/data/latest-state.json
python tools/validate_operational_readiness.py apps/web/data/latest-state.json
python tools/validate_web_static.py --root apps/web
```

`feed-status.json` should show `status=ok` when all sources fetch successfully. It may show `degraded` when optional public sources fail but the critical SWPC feed and snapshot validation still pass. It shows `failed` when a critical source or validation step fails.

## Rollback

Restore deterministic fixtures:

```bash
python tools/generate_fixture_snapshot.py --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
```

Delete `.cache/solar-data` to remove cached public-data state.
