# Solar Maximum Engine Specification

Status: current architecture contract  
Updated: 2026-09-11

This contract describes implemented-local behavior and required gates. RFC 0002 remains
Accepted; manual/scientific qualification and production activation are not implied.

Normative architectural decisions are recorded under `docs/adr/`. Repository RFCs,
standards scope, and requirement-to-evidence traceability are defined by `docs/rfcs/`,
`docs/STANDARDS.md`, and `docs/requirements.json`.

## Design principle

Build an uncertainty-aware state-estimation and learning system:

```text
reduced solar-surface physics -> forecast
observations -> correction
illustrative scalar activity variance + explicit unavailable magnetic uncertainty -> state
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
- Full solar/Sky work and System metadata use bounded latest-intent workers; structured replies are validated before publication. A fixed nine-body raw position path is the documented System rendering exception.
- Source and derived data are immutable hash-bound bundles. Readers select once and publish a complete validated bundle; malformed/mixed input retains the last valid state.
- Production is static, but CI success alone does not authorize promotion. Protected exact-artifact qualification, settings and served verification are separate gates; promotion never rebuilds source.

## Canonical solar state

```rust
SolarState {
  time_seconds,
  mode,
  grid,
  br,
  scalar_activity_variance_and_forecast_anchor,
  continuum,
  confidence,
  active_regions,
  private deterministic transport checkpoint state
}
```

The private transport checkpoint makes the state at a requested target time invariant to how a caller partitions the interval. External assimilation or replacement of transport fields must explicitly rebase that checkpoint.

## Snapshot contracts

### `solar-state-snapshot.v3`

```text
SolarStateSnapshotV3 {
  schema_version = "solar-state-snapshot.v3"
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
  active_regions { immutable birth, current model_position }
  uncertainty { illustrative scalar activity, unavailable magnetic }
  learning
  observed_context?
  observations: ObservationFrameV1[]
  warnings
}
```

The v3 solar contract retains west-positive Carrington coordinates and latitude-major,
longitude-contiguous storage. It removes the old spatial magnetic-variance field.
Confidence is explicitly heuristic, not probability. Birth positions remain immutable;
current model anchors share the snapshot epoch. Every producer and parsed worker result
must pass the canonical closed schema and cross-field semantics before recursive freezing.
See [solar v3](SOLAR_V3_MIGRATION.md) and ADR 0006 for units and exact conventions.

### `ephemeris-snapshot.v3`

Both the local Rust/WASM engine and optional JPL Horizons provider emit:

```text
EphemerisSnapshotV3 {
  schema_version = "ephemeris-snapshot.v3"
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
    geocentric_range_km, observer_range_km, true and refracted alt/az,
    visibility, compass, angular size, parallax,
    events with separate calculation_status and occurrence_status,
    nullable rise/transit/set values bound to a half-open mean-solar-day window
  }
  warnings
}
```

Unsupported live versions are rejected. Historical v2 is explicit, not an automatic adapter.
Missing values are `null`, never fabricated. Calculated absence is `none_in_window`;
uncomputed events are `not_calculated`/`unknown`; unresolved numerical ambiguity is
`failed`/`unknown`. Observer range controls apparent angular size; geocentric range controls
parallax. Stars retain the documented null-range pair. Exact observer and request epoch
binding precedes acceptance; hybrid merges also bind instantaneous epochs and day windows.
See [ephemeris v3](EPHEMERIS_V3.md) for strict schemas, bounds and evidence limitations.

Snapshot, observations, feed status, source manifest and all available cycle frames form
one `research-data-bundle.v1`. A local `bundle-pointer.v1` or immutable release descriptor
binds its manifest hash. `daily-ingest-status.v2` says validated, not deployed; acquisition,
observation, derivation and served time are distinct. Failure cannot partially replace the
browser store or make old observations appear current.

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

Sol uses an illustrative scalar activity correction (not spatial magnetic covariance):

```text
K_i = P_f / (P_f + R)
g_i = freshness * K_i
x_a = x_f + g_i * (y - x_f)
P_a = (1 - g_i) * P_f
```

This is intentionally simpler than an Ensemble Kalman Filter. Forecast variance is
`P(anchor) + q * elapsed_days`; default q is zero/disabled and positive q is labelled
illustrative, not empirically calibrated. Accepted analysis rebases the forecast anchor;
invalid/stale/unattributable data does not create an analysis. Observation provenance,
quality, freshness and active-source metadata remain attached. Magnetic uncertainty
remains unavailable; scalar assimilation must not invent a magnetic variance field.

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

Canvas views require keyboard-native alternatives and persistent selected facts. The tour
is modal, focus-trapped and skippable. Current source/epoch/observer/provider/limits are
presented independently from pending work. Cancellation and failure retain valid state.
Sky groups use geometric altitude strictly greater than zero, not refraction. Invalid
observer/time input is rejected rather than clamped; device civil timezone or UTC is
explicit and observer timezone is not inferred.

Remote Sky is disabled unless configured and requires session-only recipient-specific
consent before health or snapshot calls. Both fetches reject redirects before another
recipient is contacted. Endpoint changes revoke permission. Recovery to local is explicit,
not hidden fallback. Share/export previews disclose a captured snapshot's exact location
and time before copying/downloading.

Observed imagery cannot be composited with model geometry unless separately qualified.
The current registration assessor always returns `compositing_permitted: false`, even
when synthetic structure/epoch metadata agrees. The cycle is idealized and missing frames
remain gaps, not silently connected observed history. These implemented structures are
not a complete manual accessibility or scientific registration qualification.

The initial view exposes the primary task and current source/feed/readiness state. Advanced,
rare, and research controls use clearly labelled disclosure controls and do not normally
exceed two disclosure levels. Accuracy, privacy, degraded-state, and consent information
must remain visible at the point a user needs it.

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
- SDLC requirements/RFC/evidence validation and progressive-disclosure structure checks.
- real-browser progressive-disclosure, worker cancellation/identity, explicit provider recovery, WASM, and WebGL flows.
- semantic Sun/Earth/camera visual assertions with retained diagnostics.
- Rust, Python, Node, and denominator-complete Node+Chromium coverage gates.
- independent scientific references within declared quantity/epoch/platform scope, acquired only with network authorization; unavailable required evidence holds qualification.

GitHub Pages promotion uses the exact verified candidate artifact for the selected master
SHA, complete same-run jobs, protected accepted evidence and a post-approval eligibility
recheck. Missing manual/scientific/settings evidence is a hold. Registry publication is
separately held. See [release delivery](RELEASE_DELIVERY.md). Source tests, historical
accuracy numbers, coefficient hashes and workflow definitions do not prove those gates
passed. The [coefficient inventory](COEFFICIENT_PROVENANCE.md) explicitly identifies
non-regenerable assets; current TOP2013 evidence is source parity, not independent accuracy.

## Non-goals

- No full 3-D radiative MHD.
- No operational flare, CME, navigation, occultation, mission-safety, or warning claims.
- No ML output promoted to truth without source, uncertainty, and validation metadata.
- No claim that deep-time apparent topocentric accuracy equals near-present accuracy.
