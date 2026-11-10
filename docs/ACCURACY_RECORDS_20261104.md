# Accuracy record attribution — 2026-11-04

Both quoted records belong to Uranus. They are measured differences from the
retained Horizons replies, not physical uncertainty estimates or continuous
guarantees. The approved precision target remains 1900–2200; years 1–9999 remain
approximate outside that target. No model, tolerance or qualification is changed
by this diagnosis.

## Exact records and decomposition

| Comparison | Body | Epoch/site | Recorded difference |
| --- | --- | --- | ---: |
| Geometric full vector | Uranus | JD 2473519.5, 2060-03-01 00:00 at the matched dynamical/TDB argument | 6.418395785 arcsec-equivalent |
| Geocentric apparent direction, full target sweep | Uranus | JD 2524189.5, 2198-11-23 at the matched model/TT argument | 1.939378246 arcsec |
| Seasonal topocentric RA/Dec | Uranus | Reykjavik, 2026-11-15T14:44:03Z | 0.819566194 arcsec |
| Seasonal airless alt/az | Uranus | Boston, 2026-06-15T02:13:47Z | 0.856446487 arcsec |

The full-vector metric is `norm(model - reference) / norm(reference)` converted
from radians to arcseconds. It includes radial and transverse position error.
At the 2060 maximum, an independent `atan2(norm(cross), dot)` decomposition gives:

- Direction separation: 6.402776031 arcsec.
- Signed radius difference, model minus reference: +6,004.885615 km.
- Full position-vector difference: 86,144.333622 km.

The maximum occurs inside the target window. The plotted geometric residuals
oscillate; this record alone does not establish century-boundary secular drift.
The 3,925 retained epochs include guards from 1899-12-31 through 2201-01-02.

The Reykjavik record has `delta(RA) * cos(reference Dec)` = +0.803085848 arcsec,
and `delta(Dec)` = +0.163530000 arcsec. Its airless alt/az separation is
0.647947302 arcsec. At the Boston alt/az maximum, RA/Dec separation is
0.640436790 arcsec. Subtracting the two independent maxima (about 0.03688 arcsec)
does not measure a paired horizontal-versus-equatorial transformation error.

The Moon's maximum seasonal RA/Dec separation is 0.684617513 arcsec. It does not
hold either quoted record.

## Source paths and testable hypotheses

The geometric outer-planet System path in `system_helio_xyz` uses truncated
TOP2013 normal-tier coefficients. The apparent Sky path in
`planet_apparent_ecliptic` uses VSOP2013 08-big. Their common maximum body does
not establish one shared implementation defect. Separate the geometric theory
residual from observer-reduction residuals before fitting corrections.

Source inspection identifies specific approximations worth controlled ablations:

- `planets::reduce` adds a first-order velocity/c aberration displacement using
  heliocentric Earth-centre velocity. The Earth-centre function already splits
  the Earth-Moon barycentre using the lunar vector; that reflex displacement is
  not wholly missing. The path has one planetary light-time iteration and no
  explicit gravitational-deflection step.
- `time::nutation_deg` uses four abridged terms, with an approximately 0.5 arcsec
  accuracy comment. This is a concrete truncation to test against the full
  reference convention.
- `topocentric_sky_at_time` applies polar-motion-corrected station geometry and
  parallax, then converts to alt/az. It has no explicit station-velocity diurnal
  aberration step. `coords::topocentric` uses an atan2 parallax formula; it is not
  simply a first-order angular-parallax subtraction.

These source facts do not quantify each approximation's contribution. The signed
monthly plots show positive RA residuals across several bodies, with site and
epoch variation; they do not isolate a single formula. No coefficients, empirical
offsets or backend replacement have been fitted to these observations.

The [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) specifies
EOP-corrected IAU76/80 for Earth-based apparent RA/Dec, including the target
1900–2200 interval. A direct switch to IAU2006/2000A must not silently change the
comparison convention. A modern-frame output could be separately defined and
tested using a consistent reference reduction.

ELP-MPP02 already declares the upstream normal-tier JPL/DE405 fit. That is not a
DE440 fit and does not prove a specific tidal term is correct, but the current
Moon cannot be diagnosed as the default historical mode from its name alone.

## Earth rotation and precision limits

The application already interpolates four consecutive daily EOP rows using
leap-safe Lagrange weights and applies polar motion. The 1.432404 ms maximum DUT1
comparison difference is Nairobi on 2026-12-15T20:57:41Z, a predicted EOP epoch.
It is not evidence by itself of missing zonal tides, and the same clock repeated
for nine targets is not nine independent clock observations. Source formal-error
propagation excludes interpolation error and unmodelled subdaily terms.

The [IERS conventions](https://iers-conventions.obspm.fr/content/chapter5/icc5.pdf)
distinguish subdaily terms added after interpolation from the distributed EOP
values. Any additional tidal model must match the input series convention and be
validated separately. Forecast differences cannot support a 50 microsecond
physical guarantee over future centuries.

A DE ephemeris backend is a plausible route to much tighter agreement of
geometric vectors with a matching DE reference. The claimed download sizes,
compression bounds, degree-five decade residual accuracy and runtime speedups
remain unmeasured here. They need explicit frame/time/origin definitions,
component-wise error controls and held-out validation before becoming a contract.
Ephemeris agreement also does not remove future Earth-orientation uncertainty.

## Reproduction and retained analysis

The ignored script `build/analyze_accuracy_records_20261104.py` reads the pinned
current model report, current original-CLI seasonal report, derived reference CSV
and 48 exact native snapshots. It checks input hashes before analyzing them.

```text
python -m py_compile build/analyze_accuracy_records_20261104.py
python build/analyze_accuracy_records_20261104.py
```

The output directory must be new. The first generation is retained unchanged;
the second corrects boundary-guard labels and explicitly asserts all 864 angular
metric crosschecks. Both CSVs retain the same numerical rows.

Current analysis: `build/accuracy-records-20261104-02/`. It contains 432 signed
seasonal rows, all 3,925 Uranus geometric decompositions, two PNG plots and an
input/output-bound receipt, SHA-256
`986b9b56f9e1e65af1bdbad72ce9653a0dbea5e04958a3dd01b84bc8457d93c9`.
All 864 RA/Dec and alt/az comparisons are recomputed using stable cross/dot
angles; the difference from the existing acos report remains below 0.001 arcsec.

Independent offline review binds all 432 observations to 36 original raw replies
and 48 hashed snapshots, checks all 2,160 prior metrics and reconstructs all
3,925 vector decompositions against ten original raw vector files. It finds no
actionable P0–P2 issue. Review receipt SHA-256 is
`69fdfb4ead9f35f3eb5926fdd784648d3164ba4382b4c72d90ed71978eb63fb3`.
Three nonmaximum irregular geometric samples retain printed-reference offsets
of at most 80.466 microseconds within the original admission; the quoted
geometric maximum has zero offset. Model components were read from the pinned
comparison payload rather than regenerated in this visualization review.

This is an attribution/visualization result. The prior sampled scientific
acceptance remains separate; continuous accuracy, physical uncertainty,
50–100 milliarcsecond qualification, rendering, release and licensing are not
promoted. Rollback removes this document and status link; preserve raw evidence.
