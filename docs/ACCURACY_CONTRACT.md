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

| Quantity | Source of truth | Tolerance | Enforced by | When |
| --- | --- | --- | --- | --- |
| Heliocentric planet positions | VSOP2013 (inner) / TOP2013 (giants) vs JPL Horizons **DE441** | measured ≤ ~4″ near-present pointing (`sep`); **enforced gate 10″** (≈2× measured worst, so a real regression can never hide in the margin); sub-arcsec vs theory sources at ±5000 yr | `cargo test --workspace`; `tools/validate_ephemeris.py` | every PR (cargo); weekly + manual (Horizons, networked) |
| Moon (Luna) topocentric position | ELP-MPP02 vs JPL Horizons DE441 | measured ≤ ~5.2″ near-present, syzygy ≤ ~5″; **enforced gates 12″ (general) / 10″ (syzygy)** — the historical +20″ aberration mistake must always fail | `tools/validate_ephemeris.py`, `tools/stress_moon_syzygy.py` | weekly + manual (networked) |
| The 21 major-moon orbits | JPL Horizons osculating elements, weekly knots (3.5-day for Mimas/Enceladus) | validated against committed Horizons state vectors between knots; positions honest to “which side of the planet”, never occultation-grade | `tools/validate_moons.py` (regen-stable + byte-identity + interpolation check, offline) | every PR |
| Moon validity window | elements are only trusted where validated | outside the window moons are hidden, never guessed | `MOON_VALID_MIN_JD`/`MAX_JD` runtime guard + browser smoke `data-smoke-validity` | every PR |
| Rotational elements (pole α₀/δ₀ + rates, W₀, Ẇ, periodic terms) | **IAU WGCCRE 2015** (Archinal et al. 2018 + 2019 correction), as distributed in NAIF `pck00011.tpc` | exact transcription (rel. 1e-12) of everything the renderer applies — including Neptune's single-term `poleNut` correction and Earth's rendered `precession` model; a `poleNut`/`precession` object present in code but absent from the pin fails | `tools/validate_body_constants.py` | every PR |
| Rotation-model truncations | series terms the linear(+`poleNut`) model deliberately omits | Mars: 2015 multi-term series omitted (kept self-consistent 2009 constants; §2.1); Moon: IAU libration series omitted (~1–3° meridian; libration shown numerically on the card); Mercury: five forced-libration W terms omitted (≤ ~0.011° ≈ 40″ combined — 60× below Neptune's corrected term); Jupiter: sub-millidegree nut-prec terms omitted | documented here; Mars additionally pinned + comment-guarded | — |
| Sidereal periods shown in UI (`rotationHours`) | must agree with the Ẇ actually rendered | ≤ 0.15 h of 360/\|Ẇ\| (fact-sheet rounding), same sign as Ẇ | `tools/validate_body_constants.py` | every PR |
| Radii, oblateness, masses, axial tilts | NASA planetary fact sheets (NSSDC) | exact transcription at the fact sheet's full published precision (e.g. Earth 5.9722×10²⁴ kg, not 5.972); polar ≤ equatorial | `tools/validate_body_constants.py` | every PR |
| Detail-card scalars (surface gravity, escape velocity, density, mean temperature, geometric albedo, magnetic dipole ratio) | NASA planetary fact sheets (NSSDC) | exact transcription | `tools/validate_body_constants.py` | every PR |
| Descriptive text (atmosphere composition strings, blurbs) | NASA fact sheets / mission literature | prose, not pinned — reviewed, and any number quoted inside must not contradict a pinned value | review | every PR |
| Ring radii + Cassini Division | NASA/Cassini ring structure | exact transcription; gap strictly inside the annulus; drawn edges land on the true radii (midpoint-coloured breakpoint bands) | `tools/validate_body_constants.py` (radii); geometry by construction in `orreryMath.buildRing` | every PR |
| Star catalogue (positions, distances, physics) | Hipparcos; literature spot values | regen byte-identity + physics spot-checks | `tools/validate_star_catalog.py` | every PR |
| Surface geography (coastlines, maria) | committed pristine sources | regen byte-identity | `tools/generate_geography.py --check` | every PR |
| Earth orientation (ΔT / EOP) | measured IERS knots + plateau | prediction coverage ≥ 90 days | `tools/check_eop_freshness.py` | every PR |
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
  than fakes**: moons below the Nyquist rate are hidden with the reason in the accuracy
  line; spin advancing more than ~15°/frame freezes its phase with the reason in the
  accuracy line. Pausing or slowing always returns the true epoch-exact state.
- Small bodies (dwarfs, comets, probes) and belts are the *illustrative* tier: real orbital
  elements, two-body propagation, ~degree-level markers — their cards carry that caveat and
  they are excluded from arcsecond claims.
- Every accuracy claim shown in the UI (snapshot `accuracy` block, epoch-accuracy readout)
  must be worded to match the *measured* numbers above, never the theoretical best.

## 4. Amendment procedure

To change any governed value: update the code, update the pin in
`tools/validate_body_constants.py` (or the relevant regen source), and cite the new source
edition in the PR — all in the same PR. The gate turns red on half-updates automatically;
the citation is verified by review (see the header note on what is machine- vs
human-enforced). Details and current source editions:
[DATA_UPDATE_PLAYBOOK.md](DATA_UPDATE_PLAYBOOK.md).
