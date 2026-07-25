# Sol status

Updated: 2026-07-25  
Production branch: `master` (the only branch; all release work is merged)  
Published crate: [`solar-ephemeris` 0.2.0](https://crates.io/crates/solar-ephemeris)

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
- Real star catalogue behind every surface that draws stars: the naked-eye Hipparcos
  set (8,867 stars, V ≤ 6.5 — true J2000 positions, parallax distances, B−V colours)
  generated deterministically from committed sources by `tools/generate_star_catalog.py`
  and gated by `tools/validate_star_catalog.py`. The on-device engine reduces the
  108-star bright subset with proper motion.
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
- Solar System 3-D and top-down views rendered with WebGL2 (the earlier WebGPU path was
  retired during the orrery rewrite; see SOLAR_SYSTEM_SPEC P5 note).
- Milky-Way (galactic-scale) view with the Sun's orbit, differential-rotation shear, and
  deep-sky landmarks, plus a light-year-scale **Solar neighbourhood** sub-view placing the
  catalogue stars at their true parallax-derived 3-D positions around the Sun.
- Star rendering is catalogue-backed, not procedural: real positions, magnitudes, and B−V
  colours. Derived physics (luminosity, temperature, radius, and a labelled main-sequence
  mass estimate) lives in `apps/web/js/starphysics.js`.
- All 88 IAU constellation figures on both the 3-D sky and the My Sky dome, generated from
  committed IAU line data as RA/Dec polylines (`tools/generate_constellations.py`) rather
  than joined by star name.
- The 21 major moons of Mars, Jupiter, Saturn, Uranus and Neptune are drawn in their real
  orbits, lit and clickable. Orbits are JPL Horizons osculating elements with the mean motion
  refitted against Horizons vectors; `tools/validate_moons.py` gates the result in CI at worst
  4.09° across 105 held-out checks. Satellite systems are inflated by one factor each so the
  inner moons clear their planet's disc *and rings* without distorting the spacing between them.
  This is a view, not a satellite ephemeris — not for occultations or mutual events, and the
  layer withholds itself rather than extrapolate: moons are drawn only within ±1.25 yr of the
  element epoch, and a moon is dropped when the animation clock outruns its orbit past the
  Nyquist rate. Both suppressions are explained in the accuracy line rather than left silent.
  Moons appear in the keyboard/screen-reader positions list, nested under their planet.
- Real surface geography ships with the repository rather than depending on the optional,
  gitignored texture download: Earth's coastlines, lakes and permanent ice come from committed
  Natural Earth 1:110m vectors and the Moon's maria from the IAU/USGS gazetteer, generated by
  `tools/generate_geography.py` and rasterised in the browser by `apps/web/js/surfacemap.js`.
  Mars and Mercury deliberately stay procedural — the catalogue gives their features' positions
  and sizes but never their albedo, and a type-based guess gets Hellas Planitia backwards.
  Polygon interiors are honoured: GeoJSON inner rings subtract via an even-odd fill rather than
  being painted solid. The generated maps are independent of the optional "NASA textures"
  control, which governs only the photographic downloads it names.
  A real photographic map from `tools/fetch_textures.py` still takes priority wherever present.
- Body orientation follows the full IAU WGCCRE convention, including the secular α0/δ0 rates that
  were previously omitted. Earth's axis precesses on its true cone rather than along the IAU's
  linear tangent, which is only valid near J2000 and would otherwise invert the prime meridian
  across the whole pre-J2000 half of the ±5000-year date slider.
- Clicking a body in the 3-D view opens a facts card built from `apps/web/js/bodyData.js`.
  The Moon's card states that its rotation is synchronous with its orbit and reports
  libration, so that the Moon visibly turning in the view reads as tidal locking rather
  than as a contradiction of it. Locking is emergent from the IAU rotation elements, not a
  stored flag, and `tests/web/moonlock.test.mjs` gates the sub-Earth point against winding.
- Named stars are clickable in both the sky and the neighbourhood view, opening a facts
  card that separates measured catalogue rows from derived ones, names the method for each,
  and withholds what it cannot honestly compute — everything distance-dependent when a star
  has no usable parallax, and the mass of an evolved star, where the main-sequence
  mass–luminosity relation does not apply.
- The ~370 KB catalogue module is lazy-loaded only when the 3-D view opens, so the Sun and
  My Sky first paint are unaffected — enforced by the `@lazy-module` rule in
  `tools/validate_web_static.py`.
- Keyboard-accessible region/body lists and canvas alternatives.
- Focus-trapped onboarding dialog with focus restoration.
- Reduced-motion CSS and 3-D auto-animation gating.
- Browser/device timezone disclosure for civil event times; UTC/JD remain authoritative in exports.
- Explicit remote-provider privacy disclosure.

Known product limitations:

- Observer IANA timezone is not inferred from coordinates; displayed civil times use the browser/device timezone.
- Deep-time topocentric precision is EOP/delta-T limited.
- Remote photographic textures are optional and are not part of the deterministic core deployment;
  the committed geography covers Earth and the Moon, and the remaining bodies render procedurally.
- Deep-time axis orientation is first-order. Earth precesses on its true cone, but nutation, the
  slow change in obliquity, and the non-Earth bodies' linear IAU rates all remain approximations
  that soften toward the ends of the ±5000-year range.
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
