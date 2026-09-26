# Solar Maximum Engine Specification

Status: current architecture contract  
Updated: 2026-09-13

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

The first view teaches with an original NASA Sun observation, its capture/source context,
and one plain-language insight. An explicit Research mode retains the model's stage,
uncertainty, feed state and scientific controls without attaching them to the observation.
Sky and Solar System retain this visual hierarchy through concise contextual cards and
explicit search, location, time and details actions. Cards summarize admitted scene state;
they never substitute pending observer/provider input or reference constants for a computed
quantity. Selection does not automatically open all scientific controls. Camera shortcuts
reuse the existing view transform without moving physical bodies.

Scientific and source claims remain anchored to public methods and data: NOAA/SWPC products, Helioviewer quicklook imagery and metadata, IERS Earth-orientation data, JPL Horizons/DE441 validation, published analytic ephemerides, and NASA/IAU constants. Sol does not claim proprietary JPL, NOAA, or commercial forecasting algorithms.

The illustrative appearance proposal in [RFC 0007](rfcs/0007-illustrative-planet-looks.md)
adds the default fresh-session artistic mode for seven planets. Source-qualified
remains selectable; the artistic maps carry no geographic, color or observation qualification.
Measured terrain stays suspended for the whole time Illustrative look is selected,
including loading, failure, and eviction, not only while an artistic map is shown.
Venus with Magellan radar keeps that registered ground and draws the artistic
atmosphere above it. Sun and moons retain their existing materials. Earth now follows
[RFC 0009](rfcs/0009-sites-earth-v7.md): Illustrative look uses the recovered Sites v7
July 2004 surface, selective ocean grading, 1.6 display exposure, cloud volume and
local cloud shading. The volume's height/density and 35-percent relative display
drift are illustrative. Source-qualified retains the prior Earth, and remains the
path for daily swaths, sea-ice analysis and HDR. This candidate requires RFC
review and the existing CI/release gates before promotion.

Planetary appearance follows [RFC 0004](rfcs/0004-registered-planetary-appearance.md).
Registered, dated mission display maps are separate from calibrated or complete
observations. Earth layers distinguish land/ice, annual night lights, dated satellite
clouds/surface and sea-ice analysis. The default cloud view draws NASA's complete
historical Blue Marble 2002 cloud layer over the land map. Dated MODIS swaths are an explicit
source choice with visible seams/gaps disclosed. Their epochs do not follow model time. Source
coverage masks preserve missing observations; no procedural geography or polar caps
fill gaps. [RFC 0005](rfcs/0005-physical-rendering.md) adds qualified physical rendering:
Moon LOLA and Mars MOLA radial terrain, bounded Earth/Mars reference optical transfer,
and source-registered AIA 171 imagery with explicitly modeled elevated solar emission.
These appearance models do not evolve the state estimator or replace physical orbits.
Other atmospheres retain their disclosed illustrative treatment until qualified.

Terrain is prepared in cancellable workers, uses physical kilometre heights, and changes
both geometry and normals. Up to two detail entries are resident, with bounded LOD and
directional terrain shadows. Source-cell resolution limits narrow geological features.
Moon/Mars terrain now uses 0.125-degree derivatives of exact 0.0625-degree numerical
source products. A close view at projected diameter >=1500 pixels selects a fourth
256-by-512 segment mesh; the earlier three levels and immutable v1 assets remain
available. One terrain worker runs at a time within explicit CPU/GPU byte admission.
The [advanced material evidence](plans/2026-09-14-rendering-qualification/ADVANCED_MATERIALS_EVIDENCE.md)
distinguishes source sampling, derivative spacing, source interpolation and pending
runtime qualification. This complete-globe route does not claim regional tiling.
Unsupported bodies retain their source maps and smooth reference geometry. Missing or
invalid optional products retain a usable, disclosed fallback. Release staging verifies
the terrain/solar manifests, numeric products, hashes and generated browser metadata.

Atmosphere uses distinct incident attenuation and view-path transmission/scattering in
linear color. Physical distance determines solar flux; adaptive display exposure is
separate. Qualified Earth/Mars incident rays use profile-bound precomputed fields;
their apparent solar direction and curved-path attenuation drive direct illumination.
Ray shooting runs during explicit offline preparation, not per vertex or animation
frame. Field loading, fallback and retry remain explicit, with bounded same-origin
assets and independent direction/transmission admission before enablement.
The observer/scattered-light density integrals use fixed 512-by-512 paired
molecular/aerosol column fields. Their exact oblate coordinate reduction retains
physical path lengths and signed terrain endpoints. Production fragments retain
bounded scattering samples but must not run nested density-column quadrature or
generate a field at runtime. Source textures, terrain LOD and numerical acceptance
tolerances remain unchanged. Both incident and column fields must pass admission;
failed or pending fields retain the explicitly illustrative limb. Companion loads
share cancellation, and upload failure releases both numerical textures.
Graphics programs use a context-owned, bounded completion lifecycle. Where
`KHR_parallel_shader_compile` is available, compile/link status and uniform
locations are queried only after its completion signal. Six base programs enable
the scene; the physical sphere and atmosphere programs load on qualified close
view demand. Both programs and both numerical fields must be ready before physical
transfer is reported or drawn. Pending/failed programs retain the disclosed
illustrative route, with explicit retry after failure. The supported no-extension
path completes synchronously. Context loss disposes all programs; leave, hide and
obsolete demand cancel pending work. The 30-second qualification startup gate is
unchanged. The [program lifecycle record](plans/2026-09-14-rendering-qualification/SHADER_PROGRAM_LIFECYCLE.md)
separates CPU lifecycle proof from pending native performance qualification.
The two incident and two density-column binaries are optional in the immutable release
inventory: installation does not fetch them, and demand-time loading verifies their
bytes before caching or upload. Their absence does not block core installation.
Field identity binds exact binary32 profile values and complete semantic metadata
using versioned, typed canonical encoding. Values must be finite before and after
`Math.fround`; missing or unsupported encodings and hash mismatches are rejected.
Reference formulas, uniform uploads and numerical tolerances remain unchanged.
Separate source/generator hashes, exact domain checks and data hashes remain required; the
[optics source record](plans/2026-09-13-physical-rendering/OPTICS_SOURCES.md) defines
the encoding without arbitrary decimal rounding or epsilon-based hash comparison.
Observer and scattered-light rays remain straight. Reference profiles are not present
weather or dense-cloud radiative transfer; there is no qualified ocean glint mask.
The Sun's EUV source playback is finite, reproducible, and independent of orbital time;
restarting playback retains a ready or loading atlas and retries only a failed entry.
The source-facing coverage remains fixed to its observation frame. Gold is an assigned
EUV color. Elevated arcs are an educational model. Twelve follow source-bright anchors on
the observed face. Twelve quieter arches continue around the whole star, and their
brightness travels while that view is showing. The live EUV view lifts the gold map
and adds a breathing limb glow so the star stays luminous; a shared pulse also
raises and lowers that glow so arches which would otherwise sit fully bright still
change. Three educational bipoles use the NSSDC latitude law
(14.37 - 2.33 sin^2 L - 1.56 sin^4 L) deg/day, with one displayed second standing
for two solar hours, so the higher-latitude footpoint lags. About every 22 displayed
seconds one pair opens and a front leaves the star; that front is not a measured CME,
and its timing is illustrative rather than on the compressed clock (a typical CME would
cross the modeled volume in minutes). The visible-light approximation draws convective
cells and the same spot groups, in the same source frame as the EUV bipoles, carried by
the same latitude law. Neither layer is calibrated radiance, fluid dynamics, PFSS, MHD,
or a magnetogram, and neither paints far-side active regions. Reduced motion shows the
activity clock at zero. The unobserved hemisphere uses the observed disk's radial median:
the limb value eases to the disk-center value past the limb, so 171 limb brightening is
not repeated on the far side, and no invented structure is added. The live lift uses a
normalized soft shoulder rather than a linear gain, so bright observed structure is not clipped. The visible-light
approximation and all optical limitations stay identifiable.
The Sun inspection hides other display bodies and guides without moving any engine
state; returning to Our system restores the scene. A source/date/band-aware observation
gallery presents Jupiter storms/aurorae, Saturn's north hexagon and south decagon, and
Neptune's aurora in their published views. It does not claim globally registered weather.
Failed mission images expose an in-place native Retry image action, including galleries
with one observation. Loading and verified images cannot be restarted by that action;
selection changes and departure still cancel work and reject stale completion callbacks.
Leaving the System view also cancels pending mapped-image requests while retaining
ready textures in the existing bounded cache. Reentry issues fresh demand for cancelled
images and may explicitly retry failed references.

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
Pending source events remain queued until their birth epoch. An intermediate snapshot's
active regions include only events born at or before its epoch and within the existing
lifetime bound; hiding future regions must not discard their eventual source injection.
Live snapshot admission MUST also enforce the producer's inclusive 14-day active-region
lifetime. `Assimilation` mode requires at least one fully validated, attributable attached
observation frame; an empty report cannot establish an assimilated result.

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
Live intake also checks circular longitude agreement with the declared fixed
differential-rotation law; a hash-valid but inconsistent model anchor is not publishable.
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

## Admission consistency

Standalone v3 snapshots, native ingestion and simulation, image registration and bundle intake MUST apply the same
source-attribution predicate without rewriting retained source evidence. It requires
a string that is nonempty after removing the shared boundary-whitespace set and whose
Unicode lowercase form is not `unknown`. The set is U+0009–U+000D, U+001C–U+0020,
U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F and U+3000.
U+FEFF is deliberately not removed. This is an admission rule, not proof of source
authenticity. RFC 8259 permits C1 characters inside JSON strings; only unescaped
U+0000–U+001F are rejected by the serializer's string-envelope guard.

Cached-feed freshness MUST use the unrounded age relative to the report evaluation
clock. Negative ages and ages above the existing per-feed limit are stale; zero and
the exact upper limit remain admissible. The rounded display age does not determine
classification. Future-dated rows remain retained and explicitly warned, including
in illustrative fixture context; all-stale reports do not create a scalar analysis.
Ingestion MUST reject unattributable records before selecting the newest usable row
or deriving observed activity. Valid magnetic or wind evidence cannot authorize an
activity value derived from an unattributable F10.7 row.
Explicitly malformed clocks MUST be excluded from count-based region, sunspot and flare
proxies as well as numeric signals. Python row-time parsing retains only native-supported
calendar date/whole-second legacy forms and full explicit-UTC `Z`/`+00:00` forms with
optional fractions; compact ISO and nonzero/negative-zero offsets do not qualify.
Timestamp strings are checked exactly as retained: surrounding whitespace does not
qualify and MUST NOT be stripped into a usable clock.
Missing/null clocks retain the existing legacy unstamped path. Equal parsed instants
select the last original payload position, consistently with native ingestion, without
rewriting the selected source strings or immutable source bytes.

Native simulation MUST validate observation envelopes and frames before they influence
assimilation or enter an exported v3 snapshot. Accepted aggregate observation context,
including the activity value and per-signal freshness used by assimilation, MUST remain
attached to the result without rewriting its values. Projecting admissible frames MUST
preserve their order and the accepted report's other provenance metadata.

Numeric signal selection MUST reject booleans and nonfinite values. Declared timestamps
must parse before a row can supply a signal; malformed timestamps cannot become an
unstamped fallback or disappear from freshness while still affecting activity. Selection
orders parsed instants, not timestamp spellings. Native source intake supports the source
contract's fractional-second `Z` and `+00:00` forms with precision retained for ordering
and unrounded freshness. Original timestamp/source evidence remains unchanged.
F10.7 scalar selection MUST also exclude rows whose `active` value is the literal
JSON boolean `false`, matching native ingestion. Missing or other legacy activity
metadata does not mean false. Inactive records remain available as diagnostic source
evidence, but cannot bind a selected F10.7 value or its signal freshness.

Derived bundle `feed_status.sources` MUST equal the ordered projection of retained
`source.products`: `file` is `product_id`, `ok` is whether `failure` is null, and source,
origin, observation time and retrieval time retain their exact declared values.
Unavailable acquisitions recorded only in `source.failures` do not imply invented
product rows. Every available series entry MUST bind its index to its array position,
stage to `learning.cycle_stage`, activity to `run.activity_index`, and region count
to `active_regions.length`. Gaps retain their positions and may omit their index;
a declared index still MUST match. Illustrative cycle months are not physical elapsed
snapshot time. Rejection MUST preserve the prior complete browser publication.

Each ephemeris v3 body's `compass` MUST describe its serialized `az_deg` using the 16
clockwise sectors of width 22.5 degrees, with exact midpoints (11.25 degrees from a
sector center) assigned clockwise. A provider's rounded 360 degrees normalizes to
zero before deriving the label; internal full-precision physics remains unchanged.

Browser admission code (`dataBundle.js` and its shared `sourceAttribution.js` helper)
MUST participate in the scientific component fingerprint. Admission-only edits
invalidate prior scientific qualification even if WASM and data bytes are unchanged.

## UI contract

RFC 0003 adds an observation-led workspace and visual provenance contract. Observe presents
a preserved NASA image in its original plane, with archival time, false-color interpretation
and unavailable/retry behavior. Research exposes the model with initially closed inspector
and timeline; navigation and relevant source/time/feed/readiness remain outside them.
Observation summary exports carry no model bundle identity. Physical-scale rendering ignores display
exaggeration. Display clearance may constrain enlarged radii but cannot change physical
centers, orbital evolution or real transits. Scientific textures require per-use identity,
coverage and interpretation evidence; unverifiable global mapping uses a labeled neutral
fallback. Official source-byte correspondence alone is not global-map qualification.
The pinned default observation MUST be part of the current release's verified critical
cache set so a first offline return can retain the image and its archival provenance.
Other raster previews remain optional. Missing surface detail MUST preserve the existing
moon albedo display scale without adding unqualified patterns. Physical-scale controls
MUST refresh even when a hidden or zero-size canvas cannot paint.

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
Only an actually pending solar calculation may be reported as cancelled. Hiding the
document or changing surfaces MUST preserve completed, failed and idle statuses; an
obsolete request's settlement cannot clear a replacement request's pending identity.
System animation validates each proposed epoch before changing displayed time or invoking
the raw position path. An unsupported step pauses at the last valid epoch with an
actionable status. Returning to a visible System view supersedes an entry cancelled
while hidden; an obsolete completion cannot publish or clear the replacement entry.
An accepted asynchronous System metadata refresh MUST update its visible metadata
epoch and selected-body facts together. Delayed metadata cannot rewind positions
already rendered for a newer valid epoch.
Sky groups use geometric altitude strictly greater than zero, not refraction. Invalid
observer/time input is rejected rather than clamped; device civil timezone or UTC is
explicit and observer timezone is not inferred.
Live Sky admission MUST reconcile geometric horizontal and topocentric equatorial
directions using the declared sidereal angle and polar-motion-corrected latitude.
The consistency limit is one arcminute in unit-vector angular separation, plus a
`1e-12` chord-distance roundoff margin. This bounded consistency rule accommodates
the optional server's disclosed approximate mean sidereal/EOP metadata; it is not
an external accuracy or calibration guarantee. A vector comparison avoids singular
azimuth differences at zenith/nadir and handles the 0/360-degree wrap.
Constellation and fixed-star trajectory overlays use the displayed v3 snapshot's
`observer.terrestrial_lat_deg`, not pending input or a removed historical observer alias.

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
From the separate Latest state, Previous MUST select the last available cycle frame
and Next MUST select the first; unavailable slots count as skipped, and wraparound
within the cycle retains its existing order.

The initial view exposes the primary task and its source, capture time and availability.
Research exposes model source/feed/readiness state. Advanced,
rare, and research controls use clearly labelled disclosure controls and do not normally
exceed two disclosure levels. Accuracy, privacy, degraded-state, and consent information
must remain visible at the point a user needs it.
The feed pill, detailed feed summary, retained-Kp aurora caveat and explanatory
presentation MUST share one refresh-clock assessment. Unknown current freshness must
qualify previously reported health/source availability and retained Kp; invalid refresh
dates must not be normalized into seemingly valid next-run dates.
A missing, empty, malformed, non-UTC or invalid-calendar `next_recommended_run_utc` is unknown
and MUST NOT present as daily ok/live. Existing optional-field bundle admission is
unchanged. Valid explicit UTC timestamps support fractional seconds, and the existing
six-hour overdue grace is inclusive at its exact endpoint. Explicit failed/degraded
feed states and the last valid publication remain distinct from clock uncertainty.

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
