# Solar Maximum Engine Spec

## Design principle

Build a state-estimation engine:

```text
reduced solar-surface physics -> forecast
observations -> correction
confidence model -> uncertainty-aware state
renderer -> view
```

Use progressive disclosure in the NN/g sense: the first view teaches with the Sun, stage, and one insight; equations, adapter health, raw provenance, and caveats stay behind explicit user intent in the Research panel.

Scientific and source claims must stay anchored to public sources: NOAA/SWPC products for public space-weather context, Helioviewer for quicklook imagery and metadata, JPL/NAIF SPICE-style tooling for observer geometry, and NOAA WSA-Enlil as a public operational product family for future comparison context. Do not claim SpaceX equivalence or proprietary internal JPL/SpaceX algorithms.

## Canonical state

```rust
SolarState {
  time_seconds,
  mode,
  grid,
  br,
  br_variance,
  continuum,
  confidence,
  active_regions
}
```

## Snapshot contracts

The renderer consumes versioned immutable JSON snapshots:

```text
SolarStateSnapshotV1 {
  schema_version = "solar-state-snapshot.v1"
  model_version
  source_mode
  operational_use = false
  calibration_state
  operational_readiness
  manifest: ModelRunManifestV1
  run
  grid
  layers
  fields
  active_regions
  learning
  observations: ObservationFrameV1[]
  warnings
}
```

`ObservationFrameV1` must preserve source URL, source mode, timestamp, source/active metadata when present, quality flags, and raw-reference metadata. `ModelRunManifestV1` must describe model basis and rendering rules. Normalized magnetic values must remain labeled as normalized until calibrated physical units are implemented.

`operational_readiness` uses `operational-readiness.v1` and separates two tracks:

1. Research/learning readiness: deterministic replay, valid snapshot contract, retained public-data provenance, and visible normalized-unit caveats.
2. Space-weather operational readiness: blocked until calibrated physical units, historical validation, SWPC product comparison, adapter freshness monitoring, alerting, and approval evidence exist.

## Forecast model

The reduced surface magnetic flux transport equation:

```text
dB_r/dt =
  - Omega(theta) dB_r/dphi
  - meridional_advection
  + eta_h Laplace_s B_r
  + S(theta,phi,t)
  - B_r/tau
```

v0.1 implements:

1. Latitude-dependent differential rotation.
2. Grid diffusion.
3. Bipolar active-region source injection.
4. Exponential decay.
5. Continuum derivation from magnetic-field strength.

## Assimilation model

Use diagonal Kalman-style correction:

```text
K_i = P_f / (P_f + R)
x_a = x_f + freshness_gain * K_i * (y - x_f)
P_a = (1 - K_i) * P_f
```

This is intentionally simpler than a full Ensemble Kalman Filter. It is stable, explainable, and GPU-friendly.

## UI contract

The UI receives immutable state snapshots and must label each rendered layer as one of:

- synthetic
- observed
- blended
- inferred
- degraded

Progressive disclosure requirements:

1. Default view: solar disk, cycle stage, source mode, and one plain-language insight.
2. User-selected layers: continuum, magnetogram, confidence, and active-region markers.
3. Mode views: cycle lab, region explorer, weather sandbox, geometry viewer, schema harness, and classroom journey.
4. Research panel: equations, calibration state, layer labels, observation state, adapter health, and caveats.
5. Readiness display: first-screen research/data state, with detailed gates and blockers behind the research panel.

## High-value applications

1. Solar-cycle learning lab: stage progression, active-region growth, rotation, uncertainty, and explainable equations.
2. Research-grade model bench: deterministic seeded simulations, immutable snapshots, provenance labels, exportable scenario state, and golden tests.
3. Space-weather impact explorer: SWPC-backed Kp, F10.7, GOES/X-ray, and real-time solar-wind context mapped to satellite, GNSS, HF radio, aurora, and grid-risk learning panels.
4. Incident replay / classroom kiosk: public event context replay with progressive disclosure from visual story to raw data and equations.

## Non-goals

- No full 3D radiative MHD in this build.
- No operational flare/CME forecasting claims.
- No ML output promoted to truth without source/confidence metadata.
