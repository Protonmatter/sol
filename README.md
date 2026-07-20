# Solar Maximum Engine ("Sol")

[![CI](https://github.com/Protonmatter/sol/actions/workflows/ci.yml/badge.svg)](https://github.com/Protonmatter/sol/actions/workflows/ci.yml)
[![Ephemeris accuracy](https://github.com/Protonmatter/sol/actions/workflows/ephemeris-accuracy.yml/badge.svg)](https://github.com/Protonmatter/sol/actions/workflows/ephemeris-accuracy.yml)
[![crates.io](https://img.shields.io/crates/v/solar-ephemeris.svg)](https://crates.io/crates/solar-ephemeris)

**Live app: <https://protonmatter.github.io/sol/>**

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
     assimilation primitive), `solar-ingest`, `solar-cli`, and `solar-ephemeris` — a
     zero-dependency VSOP2013 / ELP-MPP02 / TOP2013 ephemeris + topocentric sky engine,
     [published on crates.io](https://crates.io/crates/solar-ephemeris).
   - Python tooling for deterministic fixtures, public-data ingest (NOAA/SWPC,
     Helioviewer, JPL Horizons), snapshot-series generation, and validation.
   - Versioned JSON contracts: `solar-state-snapshot.v2`, `ephemeris-snapshot.v2`,
     `observation-frame.v1`, `model-run-manifest.v1`, `operational-readiness.v1`, plus
     `series-manifest.v1`. The snapshot shapes are each defined once —
     [`docs/solar-state-snapshot-v2.schema.json`](docs/solar-state-snapshot-v2.schema.json)
     and [`docs/ephemeris-snapshot-v2.schema.json`](docs/ephemeris-snapshot-v2.schema.json) —
     and enforced across Rust, Python, and the browser via `tools/validate_snapshot.py`
     and `tools/validate_ephemeris_snapshot.py`.

2. **Web app** (`apps/web/`) — a dependency-free, no-build static app that renders the
   snapshots (the redesign is merged; `master` is the only branch and deploys to
   GitHub Pages):
   - **Real NASA SDO/HMI imagery** as the observed photosphere, with the model's
     active-regions / magnetic field / confidence composited on top (observed-vs-model
     always labelled).
   - **A real star catalogue everywhere stars appear**: the naked-eye Hipparcos
     catalogue (8,867 stars, V ≤ 6.5 — true positions, parallax distances, B−V colours)
     backs the Solar-System view's sky, the Milky-Way view, and a light-year-scale
     **Solar neighbourhood** view; the on-device engine reduces 107 bright stars with
     proper motion for My Sky.
   - **Three destinations** (**The Sun · My Sky · Solar System**), with the Sun surface
     layered through progressive-disclosure drawers (layers & region inspection →
     space-weather impact → the model under the hood); a beginner "glance" by default,
     research depth on request.
   - **Onboarding tour**, a glossary of every science term, an interactive cycle **stage
     rail**, a **time scrubber / playback** of an idealized 11-year cycle, and a **real
     butterfly diagram** (sunspot latitude vs. time).
   - **The real engine in the browser**: `solar-core` is compiled to **WebAssembly**
     (`crates/solar-wasm`) and loaded as an ES module, so a "Run the engine live" control
     re-solves the actual model in ~2 ms — same validated snapshot contract, no Node/bundler.

See **[docs/STATUS.md](docs/STATUS.md)** for exactly what's done and what's left, and
**[docs/WEB_REDESIGN_SPEC.md](docs/WEB_REDESIGN_SPEC.md)** for the full redesign plan.
A proposed next direction — a solar-system + local-sky (ephemeris) engine, "NASA Eyes meets
SkyView, grounded in facts" — is specced in **[docs/SOLAR_SYSTEM_SPEC.md](docs/SOLAR_SYSTEM_SPEC.md)**.

---

## Quick start

### Run the web app

```bash
# Serve it (required — the app is native ES modules, which browsers block over file://)
python -m http.server 8000 --directory apps/web
# then open http://localhost:8000
```

**My Sky**, **Solar System**, and the "Run the engine live" control run the real Rust
engines compiled to WebAssembly. The `.wasm` binaries are **not committed** (they are
built from source at deploy); build them once locally or those surfaces will explain
they're unavailable and fall back:

```bash
rustup target add wasm32-unknown-unknown   # one-time
python tools/build_wasm.py                 # stages apps/web/pkg/*.wasm
```

The **3-D View** wraps real planetary maps (NASA Blue Marble + Solar System Scope, CC-BY) onto its
spheres. They are not committed (gitignored under `apps/web/textures/`); fetch them once with:

```bash
python tools/fetch_textures.py     # ~4 MB; without it the 3-D View falls back to procedural surfaces
```

### Regenerate the data the app reads (Python stdlib only)

```bash
# The live "today" snapshot — a deterministic ILLUSTRATIVE fixture (static bipole
# painting; its manifest says so). The real flux-transport engine is `solar-cli simulate`
# (below) and the in-browser WASM run.
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

### Use the ephemeris as a library

The `solar-ephemeris` engine (zero-dependency positions + topocentric sky) is published
on crates.io:

```bash
cargo add solar-ephemeris    # https://crates.io/crates/solar-ephemeris
```

See **[crates/solar-ephemeris/README.md](crates/solar-ephemeris/README.md)** for install
and usage.

Full developer instructions: **[docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md)**.

---

## Repository layout

```text
apps/web/            Static web app (index.html, app.js, styles.css)
apps/web/data/       Snapshots the app reads: latest-state.json, feed-status.json,
                     latest-observations.json, series/ (cycle frames + manifest)
crates/              Rust workspace (solar-core, solar-ingest, solar-cli, …)
python/              Runnable prototype (synthetic solar maximum image)
tools/               Python generators, ingest, validators + shell helpers (watch-ci.sh)
docs/                Spec, status, handoff, instructions, data-source + ops notes
tests/               Fixtures and golden snapshots
```

---

## Modes (engine)

### Synthetic mode
A reproducible solar-maximum state from a solar-cycle activity index, a bipolar
active-region birth model, differential rotation, surface flux transport, and
probabilistic flare/CME hazard fields.

### Assimilation mode (scalar activity, v1 scope)
`solar-cli simulate --observations <report.json>` corrects the scalar activity forecast
with the daily pipeline's observed activity index through the diagonal Kalman-style
update below — freshness-damped from the report's own staleness evaluation, and gated on
attributable provenance (frames without a source are disclosed, not embedded). The
snapshot is emitted in `Assimilation` mode with the evidence frames attached; the **Br
grid remains synthetic and says so** — spatial assimilation waits for real magnetogram
frames (ROADMAP v0.4). Unusable observations leave the run `Synthetic` with a warning
saying why; degraded inputs never inflate the mode. See ADR 0005.

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
