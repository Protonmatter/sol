# Solar Maximum Engine Specification

Status: current architecture contract  
Updated: 2026-07-10

Normative architectural decisions are recorded under `docs/adr/`.

## Design principle

Build an uncertainty-aware state-estimation and learning system:

```text
reduced solar-surface physics -> forecast
observations -> correction
confidence model -> uncertainty-aware state
versioned snapshots -> browser views
```

The first view teaches with the Sun, stage, and one plain-language insight. Equations, adapter health, raw provenance, accuracy limits, and caveats remain behind deliberate user intent.

Scientific and source claims remain anchored to public methods and data: NOAA/SWPC products, Helioviewer quicklook imagery and metadata, IERS Earth-orientation data, JPL Horizons/DE441 validation, published analytic ephemerides, and NASA/IAU constants. Sol does not claim proprietary JPL, NOAA, or commercial forecasting algorithms.

## Architecture

- Rust CPU-reference engines are the mathematical source of truth.
- The browser runs audited Rust engines through raw WebAssembly ABIs.
- The frontend uses native ES modules and consumes immutable JSON snapshots.
- Python tools generate deterministic fixtures, validate schemas and semantics, and perform external evidence checks.
- The optional JPL server and local WASM ephemeris implement the same provider-neutral contract.
- Production deployment is static and is permitted only for a commit that passed the complete CI gate.

## Canonical solar state

```rust
SolarState {
  time_seconds,
  mode,
  grid,
  br,
  br_variance,
  continuum,
  confidence,
  active_regions,
  private deterministic transport checkpoint state
}
```

The private transport checkpoint makes the state at a requested target time invariant to how a caller partitions the interval. External assimilation or replacement of transport fields must explicitly rebase that checkpoint.

## Snapshot contracts

### `solar-state-snapshot.v2`

```text
SolarStateSnapshotV2 {
  schema_version = "solar-state-snapshot.v2"
  model_version
  source_mode
  operational_use = false
  calibration_state
  operational_readiness: OperationalReadinessV1
  manifest: ModelRunManifestV1
  run
  coordinates
  grid
  layers
  fields
  active_regions
  learning
  observed_context?
  observations: ObservationFrameV1[]
  warnings
}
```

The v2 solar contract explicitly declares west-positive heliographic Carrington coordinates and latitude-major, longitude-contiguous storage. Every producer must pass the same JSON Schema and cross-field semantic validator.

### `ephemeris-snapshot.v2`

Both the local Rust/WASM engine and optional JPL Horizons provider emit:

```text
EphemerisSnapshotV2 {
  schema_version = "ephemeris-snapshot.v2"
  engine_version
  provider?
  time {
    jd_utc, jd_tai?, jd_tt, jd_ut1,
    tai_minus_utc_seconds?, dut1_seconds, delta_t_seconds,
    lst_deg, obliquity_deg, earth_orientation
  }
  observer {
    terrestrial coordinates,
    polar-motion-corrected coordinates,
    elevation
  }
  accuracy
  bodies[] {
    apparent topocentric aliases ra_deg/dec_deg,
    explicit geocentric apparent RA/Dec,
    explicit topocentric apparent RA/Dec,
    distance, true and refracted alt/az,
    visibility, compass, angular size, parallax,
    nullable rise/transit/set fields
  }
  warnings
}
```

Mixed v1/v2 providers are rejected. Missing values are `null`; they are never fabricated.

## Operational boundary

`operational-readiness.v1` separates two tracks:

1. Research/learning readiness: deterministic replay, valid contracts, explicit coordinates, retained provenance, finite values, and visible normalized-unit caveats.
2. Space-weather operational readiness: remains blocked until calibrated physical units, historical forecast validation, SWPC product comparison, adapter monitoring/alerting, and documented operational approval exist.

`space_weather_operational` must remain `false` until every operational gate is satisfied. Browser copy and exports must not imply warning authority.

## Solar forecast model

The intended surface magnetic flux-transport equation is:

```text
dB_r/dt =
  - Omega(theta) dB_r/dphi
  - meridional_advection
  + eta_h Laplace_s B_r
  + S(theta, phi, t)
  - B_r/tau
```

The current reduced model implements:

1. Latitude-dependent differential rotation relative to the Carrington frame.
2. Tuned flat-grid diffusion; it is not represented as an exact spherical Laplacian.
3. Event-timed bipolar active-region source injection.
4. Exact exponential decay over each integration segment.
5. Continuum derivation from normalized magnetic-field strength.
6. Fixed-clock replay of partial integration intervals for caller-partition invariance.

Meridional circulation, spherical metric factors, and calibrated Gauss/Mx units are not yet implemented and must not be implied.

## Assimilation model

Sol uses a diagonal Kalman-style correction:

```text
K_i = P_f / (P_f + R)
g_i = freshness * K_i
x_a = x_f + g_i * (y - x_f)
P_a = (1 - g_i) * P_f
```

This is intentionally simpler than an Ensemble Kalman Filter. Observation provenance, quality, freshness, and active-source metadata remain attached to the resulting snapshot.

## UI contract

Rendered layers are labeled as exactly one of:

- synthetic
- observed
- blended
- inferred
- degraded

Current top-level destinations are:

1. **The Sun** — newcomer front door, wavelength views, overlays, cycle playback, impact learning, and research disclosure.
2. **My Sky** — observer-centric local horizon using the on-device engine by default.
3. **Solar System** — 3-D and top-down heliocentric views with progressive detail.

Canvas views require keyboard-accessible or textual alternatives. The tour is modal, focus-trapped, and skippable. The remote ephemeris provider is disabled unless explicitly configured and requires location-sharing consent.

## Validation and release gates

A releasable commit must pass:

- Rust workspace tests.
- rustfmt and Clippy with warnings denied.
- both WASM builds.
- solar and ephemeris JSON Schema validation.
- cross-field semantic validation.
- deterministic fixture and cycle-series regeneration.
- local/server ephemeris provider compatibility tests.
- EOP prediction-window freshness.
- static web/module validation and content-derived cache stamping.
- independent external Horizons evidence workflow where network access is available.

GitHub Pages deploys only the exact `master` SHA whose CI workflow succeeded.

## Non-goals

- No full 3-D radiative MHD.
- No operational flare, CME, navigation, occultation, mission-safety, or warning claims.
- No ML output promoted to truth without source, uncertainty, and validation metadata.
- No claim that deep-time apparent topocentric accuracy equals near-present accuracy.
