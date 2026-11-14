# Accuracy Contract

This document is the binding statement of what "correct" means for the quantities the app
renders, which source of truth defines each, what tolerance is acceptable, and which
automated gate enforces it. The governed set is exactly the table in §1 — every numeric
value the detail cards and the renderer consume is in it; free prose (blurbs, composition
strings) is review-governed only. **What CI machine-enforces:** a PR that changes a governed value
in only one place — code without pin, or pin without code — fails. **What review enforces:**
a PR that changes value and pin together must cite the source edition in its description;
no gate can verify a citation's truth, so that remains a human check, aided by the per-value
provenance comments the pins carry. The procedure for intentional changes is in
[DATA_UPDATE_PLAYBOOK.md](DATA_UPDATE_PLAYBOOK.md).

## 1. Governed quantities, sources, tolerances, gates

The approved precision target is complete UTC years **1900–2200**,
`1900-01-01T00:00:00Z <= input < 2201-01-01T00:00:00Z`. Years1–9999 remain
supported; dates outside that target are approximate exploration. The
[dense reference report](PRECISION_WINDOW_20261104.md) records 109,900 passing
sampled model checks at 3,925 padded/irregular model epochs after a VSOP-only
coefficient increase. This does not prove a continuous error bound or promote
the current unvalidated UI/registry status. Earth rotation and physical
observer/event accuracy retain their separate limits.

The later [TOP2013 08-big follow-up](TOP2013_PRECISION_20261106.md) renews
all 109,900 sampled checks through its actual staged WASM and reduces the worst
System full-vector residual to 1.5650″-equivalent. Current source-parity records
identify the exact immutable upstream TOP08 source/function and independently
reduced literals; the normal-tier catalogue remains historical. The source-parity
0.5″ gate, the 10″-equivalent geometric-vector budget and original computational/performance
limits are unchanged; apparent pointing budgets remain 10″ for the Sun/planets and 12″
for the Moon.
Sky's separate VSOP path, observer/event limits and unvalidated UI status remain.
Neither coefficient growth nor sampled maxima establish a sub-0.1″ or continuous
1900–2200 guarantee; years 1–9999 outside the target remain approximate.

Unit-vector coordinate transforms bound inverse-sine inputs to `[-1, 1]` so
floating-point roundoff at a pole or zenith cannot invalidate a supported Sky
snapshot. Nonfinite angular inputs remain invalid. The
[coordinate-pole correction](COORDINATE_POLES_20261106.md) reproduces the original
native/WASM failure, verifies actual browser recovery and renews all 109,900
sampled checks on the corrected binary. It changes no orbital coefficients,
error budget or UI qualification status, and establishes no tighter error bound.

The [initial nutation characterization](NUTATION_CHARACTERIZATION_20261107.md)
compares the four-term approximation with an isolated full-IAU1980 prototype
against the actual Horizons frame convention. That original prototype cohort's
three unit-test failures remain retained. The later
[model-independent regression oracles](NUTATION_REGRESSIONS_20261107.md) and
[ERFA source candidate](NUTATION_ERFA_CANDIDATE_20261107.md) pass separate native,
WASM and source-delivery checks. Sampled residuals remain mixed. These private
candidate results do not apply a product algorithm change, tighten any budget
or promote the scientific/UI registry's qualification status.

| Quantity | Source of truth | Tolerance | Enforced by | When |
| --- | --- | --- | --- | --- |
| Heliocentric planet positions | VSOP2013 (inner) / TOP2013 (giants); independent JPL vector qualification remains held | Intended independent 10″ budget is **not qualified** by the observer gate. Eight deep-time samples enforce TOP2013 source-theory parity at relative vector-norm error < 0.5″; they do not establish independent accuracy throughout ±5000 years | `cargo test --workspace`; `tools/validate_accuracy_evidence.py` | every PR (cargo); parity validator manual |
| Independent geometric-vector characterization | Captured DE441 geometric ecliptic-J2000/TDB vectors, explicit origins and planetary system identities | The earlier normal-profile baseline fails29/160 full-calendar samples at10-arcsecond-equivalent **full-vector** error. The current approved-window sweep keeps that budget; angular/radial diagnostics are separate. Passing samples qualify no continuous interval | `tools/validate_vectors.py` (full-calendar characterization); `tools/validate_precision_window.py` (approved-window samples); [measured limits](GEOMETRIC_VECTORS_20261104.md) | manual scientific gate; raw-admission and interface tests every PR |
| Geocentric apparent directions at matched TT | Captured Horizons Q2 true-equator/equinox-of-date directions; explicit DE441 targets, Earth geocenter and JD/TT | The earlier normal-profile baseline fails27/144 full-calendar samples. Fixed10″ Sun/planet and12″ Moon budgets remain in the current approved-window sweep. Q30/Q45 are separate diagnostics; matched TT qualifies no historical UTC/UT1 or continuous interval | `tools/validate_apparent.py` (full-calendar characterization); `tools/validate_precision_window.py`; [apparent limits and model paths](APPARENT_EPOCHS_20261104.md) | manual scientific gate; raw/native admission and metric tests every PR |
| Sun/planet apparent topocentric pointing and DUT1 | JPL Horizons observer quantities 2/4/49; per-target source identity retained in the raw responses | **Enforced gates 10″ pointing / 3 ms DUT1** at sampled instants/sites; the raw 2026-11-03 corpus covers four instants on one day, not a continuous orbit span | native captured-matrix regression; `tools/validate_ephemeris.py --reference-dir tests/fixtures/horizons-observer-20261103` (offline), default helper (live) | every PR (cargo); weekly + manual (live) |
| Moon (Luna) topocentric position | ELP-MPP02 vs JPL Horizons observer quantities; captured Moon responses identify DE441 | **Enforced gates 12″ (general) / 10″ (syzygy)** at sampled instants/sites; range regression is separately scoped below | captured-matrix regression; `tools/validate_ephemeris.py` (live/offline), `tools/stress_moon_syzygy.py` (live) | every PR (captured matrix); weekly + manual (live) |
| Geocentric and observer apparent ranges | Retained JPL Horizons Q20 tables at Earth center and the terrestrial site | **Enforced sampled gate max(1 km, 10 ppm × reference range)**, declared before acquisition; four instants on one day do not qualify continuous ranges. Native observer range retains apparent-direction geometry; see [range report](LUNAR_RANGE_20261103.md) | native captured-range matrix; `tools/validate_ranges.py` (offline) | every PR (cargo); manual (offline CLI) |
| Rise/altitude-peak/set numerical search (`events.transit` retains its v3 key) | Retained native standard-threshold model and analytic crossing/boundary regressions | Half-open mean-solar-day membership, sign-changing grazing roots, earliest event per direction and genuine altitude maxima; these are numerical tests, **not independent physical event accuracy** | `cargo test --workspace`; [grazing-event report](GRAZING_EVENTS_20261104.md); [event quantity semantics](EPHEMERIS_V3.md#event-window-and-availability) | every PR (cargo) |
| Selected Sun/Moon configured-model event characterization | Retained DE441 airless elevation and Q20 observer range,32 fine windows in12 selected March/June2026 cases | Fixed10s maximum distance from native time to both reference endpoints;1s crossing and2s conditional sampled-unimodal peak intervals. All32 pass. This establishes no continuous, whole-day absence, earliest-event or physical visibility guarantee | Native captured-event regression; `tests/python/test_horizons_events.py` admits all raw replies and exact derived CSV; [fine reference scope](FINE_EVENTS_20261104.md) | every PR (Cargo/Python) |
| The 21 major-moon orbits | JPL Horizons osculating elements, weekly knots (3.5-day for Mimas/Enceladus) | validated against committed Horizons state vectors between knots; positions honest to “which side of the planet”, never occultation-grade | `tools/validate_moons.py` (regen-stable + byte-identity + interpolation check, offline) | every PR |
| Moon validity window | elements are only trusted where validated | outside the window moons are hidden, never guessed | `MOON_VALID_MIN_JD`/`MAX_JD` runtime guard + browser smoke `data-smoke-validity` | every PR |
| Rotational elements (pole α₀/δ₀ + rates, W₀, Ẇ, periodic terms) | **IAU WGCCRE 2015** (Archinal et al. 2018 + 2019 correction), as distributed in NAIF `pck00011.tpc` | exact transcription (rel. 1e-12) of everything the renderer applies — including Neptune's and the Moon's single-term `poleNut` corrections and Earth's rendered `precession` model; a `poleNut`/`precession` object present in code but absent from the pin fails | `tools/validate_body_constants.py` | every PR |
| Rotation-model truncations | series terms the linear(+`poleNut`) model deliberately omits | Mars: 2015 multi-term series omitted (kept self-consistent 2009 constants; §2.1); Moon: E1 (the dominant libration term, ∓3.88° RA / ±1.54° Dec / ±3.56° W) **is applied** as `poleNut`, E2–E13 omitted (≤ ~0.2° combined); Mercury: five forced-libration W terms omitted (≤ ~0.011° ≈ 40″ combined — 60× below Neptune's corrected term); Jupiter: sub-millidegree nut-prec terms omitted | documented here; Mars additionally pinned + comment-guarded | — |
| Rendered motion (what the clock actually produces) | the elements above, measured back out of `rotationPhase()`/`poleVector()` | sidereal period within 0.15 h of the card; spin sense matches WGCCRE 2015 (Venus and Uranus retrograde, nobody else); every IAU pole in the ecliptic-northern hemisphere; axis-to-ecliptic-pole angle inside the spherical-triangle bound set by the fact-sheet obliquity-to-orbit and orbital inclination (±0.15°); each of the 21 moon periods within 1e-4 d of the published `P` implied by its own shipped knots | `tools/validate_body_motion.py`, `tests/web/motionContract.test.mjs` | every PR |
| Visible-spin presentation cap | deliberate display limit, `MAX_DISPLAY_ROTATION_TPS` | pinned at 0.2 turn/s; must engage exactly when true spin exceeds it, deliver exactly that rate when engaged, and never stop or reverse a body — checked across all seven shipped speed presets | `tools/validate_body_motion.py` | every PR |
| Sidereal periods shown in UI (`rotationHours`) | must agree with the Ẇ actually rendered | ≤ 0.15 h of 360/\|Ẇ\| (fact-sheet rounding), same sign as Ẇ | `tools/validate_body_constants.py` | every PR |
| Radii, oblateness, masses, axial tilts | NASA planetary fact sheets (NSSDC) | exact transcription at the fact sheet's full published precision (e.g. Earth 5.9722×10²⁴ kg, not 5.972); polar ≤ equatorial | `tools/validate_body_constants.py` | every PR |
| Detail-card scalars (surface gravity, escape velocity, density, mean temperature, geometric albedo, magnetic dipole ratio) | NASA planetary fact sheets (NSSDC) | exact transcription | `tools/validate_body_constants.py` | every PR |
| Descriptive text (atmosphere composition strings, blurbs) | NASA fact sheets / mission literature | prose, not pinned — reviewed, and any number quoted inside must not contradict a pinned value | review | every PR |
| Ring radii + Cassini Division | NASA/Cassini ring structure | exact transcription; gap strictly inside the annulus; drawn edges land on the true radii (midpoint-coloured breakpoint bands) | `tools/validate_body_constants.py` (radii); geometry by construction in `orreryMath.buildRing` | every PR |
| Star catalogue (positions, distances, physics) | Hipparcos; literature spot values | regen byte-identity + physics spot-checks | `tools/validate_star_catalog.py` | every PR |
| Surface geography (coastlines, maria) | committed pristine sources | regen byte-identity | `tools/generate_geography.py --check` | every PR |
| Earth orientation (ΔT / EOP) | Pinned USNO Bulletin A daily history,1973-01-02–2027-11-05; observed through2026-10-29, then explicitly predicted | Exact source/blob correspondence, leap-safe bounded four-point interpolation and explicit degraded status outside coverage; DUT1 formal error excludes interpolation/subdaily terms. Prediction coverage ≥90 days is a freshness control, not an accuracy bound | `tools/generate_eop.py --check`; native knot/leap/quality regressions; `tools/check_eop_freshness.py`; [measured evidence and limits](EOP_HISTORY_20261104.md) | every PR |
| GLSL hygiene | GLSL ES 3.00 spec | `smoothstep` literal edges strictly increasing (reversed edges are undefined and have shipped visible bugs) | `tools/validate_body_constants.py` | every PR |
| True-scale unit | IAU 2012 AU definition (149,597,870.7 km) | `AU_KM` pinned exactly — true-scale mode divides real radii by it | `tools/validate_body_constants.py` | every PR |
| Sun surface imagery epoch | SDO/HMI frame + `sun.jpg.json` `fetched_unix` | the disk basis is computed for the recorded FETCH epoch — an upper bound on capture time; SDO's "latest" endpoint lags by up to ~1 h (≤ ~0.6° of solar rotation), which is the accepted error. If the metadata is absent (pre-metadata builds), the load time is the documented fallback | code path (`sunDiskBasis`); metadata written by `tools/fetch_textures.py` | every deploy |

## 2. Documented exceptions — do not "fix" these

These look like errors to a reviewer with the source table open. They are deliberate, each
protected by a comment in the code and (where applicable) by the constants gate.

1. **Mars uses the IAU 2009 rotational constants, not 2015.** The 2015 Mars model
   (α₀ 317.269202, δ₀ 54.432516, W₀ 176.049863) is only valid together with its ~10-term
   trigonometric series; the series' J2000 sum moves the pole back near the 2009 values.
   Taking the 2015 constant terms alone into the linear `poleAt()` model would put the pole
   ~1.5° off — worse than 2009. Upgrading Mars requires implementing the series first.
   Gate: `tools/validate_body_constants.py` pins the 2009 values and requires the warning
   comment in `bodyData.js` to survive.
2. **`elpmpp02.rs` omits annual aberration for the Moon.** ELP-MPP02 yields a *geocentric*
   position that already co-moves with the observer; adding annual aberration double-counts
   Earth's velocity (measured: it degraded the Horizons gate from ~5″ to ~23″). The
   heliocentric VSOP2013 planets *do* receive annual aberration.
3. **Neptune's `rotationHours` (15.9663 h) disagrees with NASA's fact sheet (16.11 h)** on
   purpose: WGCCRE 2015 adopted the updated rate (Ẇ = 541.1397757°/day) over the Voyager
   radio period the fact sheet still quotes, and this app's card, spin-freeze threshold and
   rendered spin must all describe the same rotation.

## 3. Display honesty rules (rendering may simplify, but must say so)

- Body sizes and moon orbital distances are exaggerated for legibility; the detail cards say
  so, and **true-scale mode must remain exact** (real radius/AU).
- When the animation clock outpaces what a frame can resolve, the app **withholds rather
  than fakes**: moons below the Nyquist rate (fewer than three samples per revolution) are
  hidden with the reason in the accuracy line; spin that would exceed one visible turn per
  five real seconds keeps turning, in the correct direction, at exactly that capped rate,
  with the reason in the accuracy line. The cap is presentation only — the simulation epoch,
  every orbital position, and the detail cards stay exact, and pausing or slowing returns the
  true phase. Measured engagement points, per body per speed preset, are in
  `tools/validate_body_motion.py`; Earth crosses the threshold between the 1 h/s preset
  (23.9 real seconds per turn, honest) and 1 d/s (5.0 s per turn, capped from 1.0).
- Small bodies (dwarfs, comets, probes) and belts are the *illustrative* tier: real orbital
  elements, two-body propagation, ~degree-level markers — their cards carry that caveat and
  they are excluded from arcsecond claims.
- Independent sample evidence is separately typed in
  `apps/web/data/independent-vector-evidence.json`; source-theory parity stays in
  `apps/web/data/accuracy-evidence.json`. The independent registry retains all 160
  native f64 geometric observations, including failed samples. Release builds reject
  stale scientific-source inventories, reference artifacts and browser byte bindings.
  Only an admitted, passing record with exact body/case, quantity, epoch, frame,
  time scale, origin and model-argument policy may return `sampled`; a current UTC
  display selection does not inherit a TDB sample's result. Native evidence and
  corresponding WASM source provenance do not establish measured WASM parity.
  See [INDEPENDENT_VECTOR_EVIDENCE.md](INDEPENDENT_VECTOR_EVIDENCE.md) and the
  [public evidence page](../apps/web/accuracy/index.html). Unmatched selections and
  source-theory parity remain independently unvalidated.
- Catalogue-moon knots and validity bounds use TDB. The renderer converts the UTC
  scene epoch to TT using the engine's latest known TAI−UTC offset (37 seconds)
  plus TT−TAI (32.184 seconds). TT approximates TDB within 2 milliseconds, below
  the interpolation budget. This conversion is scoped to the 2021–2030 moon
  tables; future leap seconds remain unknown and require the same update as the
  engine. Held-out vectors must be compared at the corresponding UTC instant,
  rather than treating their TDB date as UTC. See the
  [Horizons time-scale definitions](https://ssd.jpl.nasa.gov/horizons/manual.html#time-scales).

## 4. Amendment procedure

To change any governed value: update the code, update the pin in
`tools/validate_body_constants.py` (or the relevant regen source), and cite the new source
edition in the PR — all in the same PR. The gate turns red on half-updates automatically;
the citation is verified by review (see the header note on what is machine- vs
human-enforced). Details and current source editions:
[DATA_UPDATE_PLAYBOOK.md](DATA_UPDATE_PLAYBOOK.md).
