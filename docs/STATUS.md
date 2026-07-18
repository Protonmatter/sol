# Sol status

Updated: 2026-07-10  
Release branch under review: `precision/p0-hardening` (PR #7)  
Production branch: `master`

This document reports implemented behavior. Historical design intent remains in `WEB_REDESIGN_SPEC.md` and `SOLAR_SYSTEM_SPEC.md`; current normative decisions are in `SPEC.md`, `RFC_ALIGNMENT.md`, and `docs/adr/`.

## Current architecture

- Dependency-free static web application using native ES modules.
- Two audited Rust engines compiled to raw WebAssembly:
  - `solar-wasm` for deterministic reduced solar-surface simulation.
  - `solar-ephemeris` for local sky and solar-system calculations.
- Optional Python JPL Horizons/DE441 provider implementing the same provider-neutral ephemeris contract.
- Immutable, versioned JSON boundaries:
  - `solar-state-snapshot.v2`
  - `ephemeris-snapshot.v2`
  - `system-snapshot.v1`
- Python generators and validators for deterministic fixtures, public-data normalization, schemas, semantic invariants, and external evidence.

## Precision-hardening status

### Solar engine

Implemented:

- Explicit west-positive heliographic Carrington coordinates.
- Explicit latitude-major, longitude-contiguous grid storage.
- Carrington-relative differential rotation.
- Partition-invariant Poisson event scheduling.
- Fixed-clock transport checkpoint/replay so target state does not depend on caller partitioning.
- Event-timed bipolar source injection.
- Exact exponential decay per integration segment.
- Strict finite/range checks before serialization.
- Readiness metadata derived from actual source and observation state.
- Complete semantic validation of all readiness gates.

Limits remain explicit:

- Magnetic fields are normalized, not calibrated Gauss/Mx.
- Diffusion is a tuned reduced flat-grid operator, not the exact spherical Laplacian.
- Meridional circulation is not implemented.
- No operational forecast authority is claimed.

### Ephemeris engine

Implemented:

- Separate geocentric and topocentric apparent RA/Dec.
- Explicit UTC, TAI, TT, UT1, DUT1, leap-second, polar-motion, and EOP-quality metadata.
- Bundled IERS Bulletin A rapid/predicted EOP data with explicit degradation outside coverage.
- Release and weekly gates requiring at least 90 days of remaining EOP prediction coverage.
- VSOP2013/ELP-MPP02 apparent-place path and TOP2013 orbit-view support.
- JPL Horizons validation tooling.
- Body-specific rise/set thresholds:
  - planets/stars: standard refraction threshold;
  - Sun/Moon: refraction plus instantaneous apparent semidiameter after topocentric parallax.
- Rise/transit/set solved within the observer's local mean-solar day.
- Transit altitude reports the true topocentric centre altitude rather than the crossing margin.
- Nullable events where no event occurs; no fabricated values.

Accuracy scope remains explicit:

- Near-present apparent-place claims depend on current EOP coverage and the committed validation matrix.
- Deep-time heliocentric geometry does not imply deep-time topocentric pointing accuracy.
- Not for navigation, occultation prediction, mission safety, or safety-critical timing.

### Provider continuity

Implemented:

- Local WASM and optional JPL server both emit `ephemeris-snapshot.v2`.
- The browser validates either provider through one runtime guard.
- Mixed v1/v2 responses are rejected.
- Geocentric/topocentric lunar aliasing is rejected.
- The optional server does not fabricate rise/transit/set values.
- The public web app no longer defaults to `localhost` for the remote provider.
- Remote provider controls are disabled unless a deployment explicitly configures an endpoint.
- First remote use requires consent to transmit selected latitude, longitude, elevation, and time.

## Web and UX status

Implemented:

- Real NASA/SDO solar imagery with deterministic synthetic fallback.
- Sun-first newcomer path and progressively disclosed research details.
- Solar cycle playback and idealized latitude-vs-time butterfly diagram.
- Wavelength views, active-region inspection, space-weather learning context, and provenance/readiness display.
- My Sky observer view with geolocation/manual coordinates, time selection, share links, and JSON export.
- Solar System 3-D and top-down views with WebGL2/WebGPU-compatible rendering paths.
- Keyboard-accessible region/body lists and canvas alternatives.
- Focus-trapped onboarding dialog with focus restoration.
- Reduced-motion CSS and 3-D auto-animation gating.
- Browser/device timezone disclosure for civil event times; UTC/JD remain authoritative in exports.
- Explicit remote-provider privacy disclosure.

Known product limitations:

- Observer IANA timezone is not inferred from coordinates; displayed civil times use the browser/device timezone.
- Deep-time topocentric precision is EOP/delta-T limited.
- Remote textures are optional and are not part of the deterministic core deployment.
- The remote DE441 provider requires a separately deployed endpoint.

## Build and release integrity

Implemented:

- Rust workspace tests with locked dependencies.
- rustfmt and Clippy with warnings denied.
- WASM builds for both engines.
- Solar and ephemeris schema/semantic validation.
- Deterministic fixture and cycle-series regeneration.
- Offline local/server provider compatibility tests.
- EOP freshness gate.
- Native ES-module syntax checks.
- Built-WASM headless Chromium smoke tests for the Sun and My Sky paths.
- Immutable commit-SHA pins for external GitHub Actions.
- Pages deployment only after successful CI on `master` and only for the exact tested SHA.
- Procedural texture fallback by default; mutable remote texture fetching is reviewed opt-in behavior.

## Release boundary

The application is research- and learning-ready. `space_weather_operational` remains `false` until all of the following exist:

1. Calibrated physical magnetic units.
2. Historical forecast validation and published skill evidence.
3. Comparison against operational SWPC products.
4. Adapter freshness monitoring and alerting.
5. Documented operational ownership, approval, and incident response.

No UI, snapshot, or deployment may represent Sol as an operational warning or mission-safety system before those gates pass.
