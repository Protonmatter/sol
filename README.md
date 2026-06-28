# Solar Maximum Engine

A deterministic, math-first solar maximum simulator and learning app with two operating modes:

- **Synthetic mode**: reduced solar-surface physics plus seeded active-region emergence.
- **Assimilation mode**: the same forecast model corrected by observations from public solar/space-weather sources.

The design goal is a state-estimation engine, not a shader-only visualization. The renderer consumes immutable `SolarState` snapshots; it does not define the physics.

## Current build contents

This repository contains a v1 research + learning application:

- Rust workspace with a CPU-reference solar surface model.
- Deterministic synthetic active-region generator.
- Surface magnetic-field update with rotation, diffusion, source injection, and decay.
- Diagonal Kalman-style assimilation primitive.
- Versioned JSON contracts for `solar-state-snapshot.v1`, `observation-frame.v1`, and `model-run-manifest.v1`.
- `solar-cli` commands for simulation, SWPC fixture/cache normalization, and web replay data.
- Static web app in `apps/web` with progressive disclosure from learning view to research panel.
- Tutorial and experiment notebooks in `notebooks/`.
- Public-data cache helper for NOAA/SWPC, Helioviewer, and optional JPL Horizons context.
- Daily public-data ingest runner that updates the web snapshot and feed-health status from bounded public sources.
- Python runnable prototype that writes a synthetic solar maximum image as a PPM file.
- Data-source and backend design docs.

## Fast start

### Static learning app

Open `apps/web/index.html` directly, or serve the folder if you want the browser to fetch `data/latest-state.json`:

```bash
python -m http.server 8000 --directory apps/web
```

Then open `http://localhost:8000`.

### Deterministic fixture generation

```bash
python tools/generate_fixture_snapshot.py --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
python tools/validate_snapshot.py apps/web/data/latest-state.json
python tools/validate_operational_readiness.py apps/web/data/latest-state.json
python tools/validate_web_static.py --root apps/web
```

The fixture generator uses only the Python standard library.

### Rust CLI

```bash
cargo test --workspace
cargo run -p solar-cli -- simulate --steps 48 --dt-hours 1 --seed 42 --out apps/web/data/latest-state.json
cargo run -p solar-cli -- ingest swpc --cache .cache/solar-data --out tests/fixtures/live-swpc-normalized.json --fallback-fixtures tests/swpc_scn26_21
cargo run -p solar-cli -- replay --snapshot apps/web/data/latest-state.json --out apps/web/data
```

The old summary mode is still available:

```bash
cargo run -p solar-cli -- --steps 48 --dt-hours 1 --seed 42
```

### Optional live public-data cache

```bash
python tools/fetch_public_data.py --cache .cache/solar-data
python tools/generate_fixture_snapshot.py --cache .cache/solar-data --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
```

This only fills a local cache. Tests and notebooks should use fixtures unless a live-data check is explicitly intended.

### Daily research feed

```bash
python tools/run_daily_ingest.py --include-jpl
```

This fetches bounded public sources, archives that day's cache, regenerates `apps/web/data/latest-state.json`, writes `apps/web/data/latest-observations.json`, and writes `apps/web/data/feed-status.json` for the web UI. On Windows, install the optional daily task with:

```powershell
.\tools\install_daily_ingest_task.ps1 -Time 06:15 -IncludeJpl
```

See `docs/DAILY_INGEST.md`.

## Public methods and source anchors

Claims in this project are anchored to public, inspectable methods and products:

- [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) for revealing advanced controls only after user intent.
- [NOAA SWPC products and data](https://www.swpc.noaa.gov/products-and-data) for public Kp, F10.7, GOES/X-ray, solar-wind, region, and cycle context.
- [Helioviewer API](https://api.helioviewer.org/docs/v2/) for quicklook imagery and data-source metadata.
- [JPL/NAIF SPICE](https://naif.jpl.nasa.gov/naif/) for the public geometry/toolkit family used to frame observer-geometry goals.
- [NOAA WSA-Enlil](https://www.swpc.noaa.gov/products/wsa-enlil-solar-wind-prediction) as a public operational product family for education and future comparison context, not as a reproduced model.

No SpaceX equivalence or proprietary internal JPL/SpaceX algorithm claim is made.

## Operational readiness boundary

The current app is operational for deterministic research and learning workflows when the snapshot, readiness, static web, notebook, and browser smoke checks pass. It is not operational space-weather forecasting.

`operational_readiness.space_weather_operational` must stay `false` until calibrated physical units, historical validation, comparison against operational SWPC products, adapter freshness monitoring, alerting, rollback, and approval evidence exist. The stricter future gate is:

```bash
python tools/validate_operational_readiness.py apps/web/data/latest-state.json --require-space-weather-operational
```

That stricter command is expected to fail for this v1 research build.

## Modes

### Synthetic mode

Synthetic mode creates a reproducible solar maximum state from:

- Solar-cycle activity index.
- Bipolar active-region birth model.
- Differential rotation.
- Surface flux transport.
- Probabilistic flare/CME hazard fields.

### Assimilation mode

Assimilation mode uses the same forecast model, then corrects state using observation frames:

```text
forecast x_f = M(x_t)
residual r = y - H(x_f)
gain K = P_f / (P_f + R)
analysis x_a = x_f + K r
variance P_a = (1 - K) P_f
```

## Web app modes

- Solar Cycle Lab
- Active Region Explorer
- Space Weather Impact Explorer
- Mission Geometry Viewer
- SWPC Schema Regression Harness
- Classroom Guided Journey

The first screen shows the solar disk, cycle stage, run state, and one plain-language insight. Advanced equations, layer labels, provenance, and adapter health are in the research panel.

## High-value v1 applications

- Solar-cycle learning lab: interactive minimum/rising/maximum/declining cycle stages with active-region growth, rotation, uncertainty, and explainable equations.
- Research-grade model bench: deterministic seeded simulations, immutable state snapshots, provenance labels, exportable scenario state, and golden tests for algorithm changes.
- Space-weather impact explorer: SWPC-backed Kp, F10.7, GOES/X-ray, and real-time solar-wind context mapped to satellite, GNSS, HF radio, aurora, and grid-risk learning panels.
- Incident replay / classroom kiosk: replay public solar-event context against the reduced model, moving from visual story to raw data, equations, and caveats.

## Hardware plan

- CPU reference is mandatory and authoritative for tests.
- GPU acceleration should use `wgpu` first for Metal, Vulkan, D3D12, and WebGPU portability.
- NPU/ML acceleration should be optional and restricted to ONNX/CoreML/DirectML/OpenVINO inference tasks such as active-region detection and flare/CME surrogate scoring.

## Scientific caveat

This is a reduced surface model. It is not full 3D radiative magnetohydrodynamics and should not be used for operational space-weather forecasting without validation against operational systems.

## v0.1.1 note: SWPC schema changes

This package includes a schema-hardening note for NOAA/SWPC SCN 26-21. The key implementation impact is that old RTSW `/products/solar-wind/` endpoints should not be used. Use `/json/rtsw/rtsw_mag_1m.json`, `/json/rtsw/rtsw_wind_1m.json`, and `/json/rtsw/rtsw_ephemerides_1h.json` instead, preserve `source`/`active` metadata, and locally retain 1-day files to materialize old 3-day/7-day windows.
