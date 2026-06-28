# Data Sources and Cost Status

## Summary

The core data sources for this project are public/free to access, but they are not all identical operationally.

| Source | Cost | Registration | Best use | Caveat |
|---|---:|---:|---|---|
| NOAA/SWPC Data Service | Free/public | No | JSON/text/image space-weather products | Product schemas can change; watch SWPC notices. |
| NOAA/NCEI SWPC Archive | Free/public | Usually no | Historical SWPC data | Archive layout differs from real-time service. |
| NASA Heliophysics data portals | Free/open access | Varies by service | Discovery of heliophysics mission data | Some mission archives/tools have their own access flow. |
| Helioviewer API | Free/public | No | SDO/AIA, SDO/HMI quicklook imagery | Use for visualization/assimilation prototypes; cache politely. |
| JSOC / SDO HMI | Free/public data | Email registration for exports | Science-grade HMI/AIA records, FITS workflows | Staged export flow; large data volumes. |
| GOES XRS via SWPC | Free/public | No | X-ray flux / flare detection | Operational data; account for service changes. |
| NOAA/SWPC Kp and F10.7 JSON | Free/public | No | Space-weather and solar-activity learning context | Use as observed context, not app-owned warning authority. |
| NOAA WSA-Enlil product | Public product page | No | Public operational-model family for education and future comparison | Do not claim this app reproduces WSA-Enlil. |

## Implementation recommendation

Use this order:

1. SWPC JSON/text for low-friction Kp, F10.7, real-time solar wind, solar-region, cycle, and GOES XRS context.
2. Helioviewer for quick HMI/AIA image assimilation and UI overlays.
3. JSOC/SunPy bridge only when higher-fidelity FITS/magnetogram workflows are required.

For v0.1.2, live public-data access is intentionally separated from deterministic validation:

```bash
python tools/fetch_public_data.py --cache .cache/solar-data
python tools/generate_fixture_snapshot.py --cache .cache/solar-data --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
```

The app and notebooks should keep using checked-in fixtures unless a live-cache run is explicitly intended. Cached rows must retain source URL, local path, `source`, `active`, quality flags, and any raw-reference metadata needed to debug schema drift.

For continuous research updates, run:

```bash
python tools/run_daily_ingest.py --include-jpl
```

This writes `apps/web/data/feed-status.json` and archives daily source files under `.cache/solar-data/history/<YYYY-MM-DD>`. Critical failures are limited to SWPC RTSW magnetic-field and solar-wind products; other public sources are optional research context and are reported as degraded feed health if unavailable.

Current optional SWPC impact-learning context includes `planetary_k_index_1m.json`, `f107_cm_flux.json`, `goes/primary/xrays-1-day.json`, and `goes/primary/xray-flares-7-day.json`.

## Do not assume

- Do not assume unlimited rate or bandwidth.
- Do not assume JSON schema stability without tests.
- Do not treat Helioviewer quicklook imagery as a substitute for calibrated science-grade FITS when precision matters.
- Do not use this app for operational warning without validation against SWPC products.
- Do not claim SpaceX equivalence or proprietary internal JPL/SpaceX algorithms.


## SWPC SCN 26-21 impact

The NOAA/SWPC source remains free/public, but the adapter must follow NWS Service Change Notice 26-21:

- Several SWPC products changed to standard JSON object/array forms on/about 2026-03-31.
- Numeric values other than `time_tag` are no longer quoted.
- Deprecated RTSW solar-wind endpoints under `/products/solar-wind/` are removed on/about 2026-04-30.
- Replacement RTSW endpoints are under `/json/rtsw/`:
  - `rtsw_ephemerides_1h.json`
  - `rtsw_mag_1m.json`
  - `rtsw_wind_1m.json`
- Replacement RTSW rows expose `source` and `active` metadata. Preserve both fields in provenance.
- For old 3-day and 7-day windows, retrieve and retain the replacement 1-day file locally.

See `docs/SWPC_SCHEMA_CHANGE_2026_03_31.md` for the implementation checklist and field mapping.
