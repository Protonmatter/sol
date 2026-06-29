# Solar Maximum Engine ("Sol")

A deterministic, math-first **solar-cycle / space-weather** simulation engine and a
**layered learning + research web app** built on top of it. *Sol* is Latin for the Sun —
this is not a file explorer.

The design goal is a **state-estimation engine, not a shader**: a reduced solar-surface
physics model produces immutable, versioned `SolarState` snapshots, and the renderer only
ever *consumes* those snapshots. The UI never invents physical values.

> **Product north star:** *See the real Sun → understand what's happening on it → then see
> exactly what the model knows, how it knows it, and what it still can't claim.*

---

## Two layers

1. **Engine + data pipeline** (Rust + Python)
   - Rust workspace: `solar-core` (reduced flux-transport model + diagonal Kalman-style
     assimilation primitive), `solar-ingest`, `solar-cli`.
   - Python tooling for deterministic fixtures, public-data ingest (NOAA/SWPC,
     Helioviewer, JPL Horizons), snapshot-series generation, and validation.
   - Versioned JSON contracts: `solar-state-snapshot.v1`, `observation-frame.v1`,
     `model-run-manifest.v1`, `operational-readiness.v1`, plus `series-manifest.v1`.

2. **Web app** (`apps/web/`) — a dependency-free, no-build static app that renders the
   snapshots, currently under a **v0.2 redesign** (branch `redesign/web-v0.2`):
   - **Real NASA SDO/HMI imagery** as the observed photosphere, with the model's
     active-regions / magnetic field / confidence composited on top (observed-vs-model
     always labelled).
   - **Layered progressive disclosure** — four intent surfaces (**Today · Explore · Space
     Weather · Research**); a beginner "glance" by default, research depth on request.
   - **Onboarding tour**, a glossary of every science term, an interactive cycle **stage
     rail**, a **time scrubber / playback** of an idealized 11-year cycle, and a **real
     butterfly diagram** (sunspot latitude vs. time).

See **[docs/STATUS.md](docs/STATUS.md)** for exactly what's done and what's left, and
**[docs/WEB_REDESIGN_SPEC.md](docs/WEB_REDESIGN_SPEC.md)** for the full redesign plan.

---

## Quick start

### Run the web app

```bash
# Option A: open the file directly (works offline; uses the checked-in fallback state)
#   apps/web/index.html

# Option B: serve it so the browser can fetch data/*.json (recommended)
python -m http.server 8000 --directory apps/web
# then open http://localhost:8000
```

### Regenerate the data the app reads (Python stdlib only)

```bash
# The live "today" snapshot
python tools/generate_fixture_snapshot.py \
  --out apps/web/data/latest-state.json \
  --observations-out tests/fixtures/live-swpc-normalized.json --seed 42

# The solar-cycle series for timeline playback + the butterfly diagram
python tools/generate_series.py

# Validate everything
python tools/validate_snapshot.py apps/web/data/latest-state.json
python tools/validate_operational_readiness.py apps/web/data/latest-state.json
python tools/validate_web_static.py --root apps/web
```

### Rust engine (requires a local Rust toolchain)

```bash
cargo test --workspace
cargo run -p solar-cli -- simulate --steps 48 --dt-hours 1 --seed 42 \
  --out apps/web/data/latest-state.json
```

Full developer instructions: **[docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md)**.

---

## Repository layout

```
apps/web/            Static web app (index.html, app.js, styles.css)
apps/web/data/       Snapshots the app reads: latest-state.json, feed-status.json,
                     latest-observations.json, series/ (cycle frames + manifest)
crates/              Rust workspace (solar-core, solar-ingest, solar-cli, …)
python/              Runnable prototype (synthetic solar maximum image)
tools/               Python: fixture + series generators, ingest, validators
docs/                Spec, status, handoff, instructions, data-source + ops notes
tests/               Fixtures and golden snapshots
```

---

## Modes (engine)

### Synthetic mode
A reproducible solar-maximum state from a solar-cycle activity index, a bipolar
active-region birth model, differential rotation, surface flux transport, and
probabilistic flare/CME hazard fields.

### Assimilation mode
The same forecast model, corrected by observation frames with a diagonal Kalman-style update:

```text
forecast  x_f = M(x_t)
residual  r   = y - H(x_f)
gain      K   = P_f / (P_f + R)
analysis  x_a = x_f + freshness_gain * K * r
variance  P_a = (1 - K) * P_f
```

---

## Operational boundary (read this)

This app is operational for **deterministic research and learning** workflows only. It is
**not** operational space-weather forecasting. `operational_readiness.space_weather_operational`
stays `false` until calibrated physical units, historical validation, comparison against
operational SWPC products, adapter-freshness monitoring, alerting, and approval evidence
exist. Normalized magnetic values are labelled normalized — never asserted as Gauss/Mx.

## Public-method anchors

Claims are anchored to public, inspectable products: [NOAA SWPC](https://www.swpc.noaa.gov/products-and-data),
[Helioviewer](https://api.helioviewer.org/docs/v2/), NASA [SDO](https://sdo.gsfc.nasa.gov/)
browse imagery, [JPL/NAIF SPICE](https://naif.jpl.nasa.gov/naif/), and
[NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
No SpaceX equivalence or proprietary internal JPL/SpaceX algorithm is claimed.

## License

MIT OR Apache-2.0.
