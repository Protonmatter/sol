# Major-moon source data (pristine, committed)

Raw upstream data for `tools/generate_moons.py`. Committed so the derived module
(`apps/web/js/moons.js`) is reproducible offline forever; do not edit these by hand — re-run
`tools/fetch_moons.py`, the only networked step, which CI never runs.

| File | Upstream | License | sha256 |
|---|---|---|---|
| `jpl_satellite_physical.csv` | [JPL SSD satellite physical parameters](https://ssd.jpl.nasa.gov/sats/phys_par/) — GM, mean radius, mean density; row subset | public domain (US Government) | `03c688bca6064568665a396ec9c189dcdb2d169fe782e90b3660a72c99a00a99` |
| `horizons_satellite_elements.csv` | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) osculating elements, planetocentric, ecliptic J2000 — **mean motion refitted**, see below | public domain (US Government) | `a866df1383c21506c53802acb49563d51c14f22077fe067eeed35ce310cc161b` |
| `horizons_satellite_vectors.csv` | JPL Horizons state vectors on five held-out dates, the ground truth `tools/validate_moons.py` gates against | public domain (US Government) | `0fb6a170bd105efee5f8d6da50c8be43f2e28a0b2dd69c011856167b2abbac90` |

> A `0.00000` GM or an `n/a` density in the physical-parameters file means **not measured**, not
> zero. Nereid is the case here: carried through as a number it put "0.0000 km³/s²" on the facts
> card, which reads as a physical claim about a 170 km moon. `generate_moons.py` normalises
> non-positive values to `null` so the row is omitted instead.

Which moons: every satellite with a mean radius of at least 150 km — roughly "large enough to
have relaxed into a sphere" — plus Phobos and Deimos, which are famous enough that their absence
would be conspicuous. That is 21 moons: Mars 2, Jupiter 4, Saturn 7, Uranus 5, Neptune 3. Earth's
Moon is excluded because the engine already has a full ELP-MPP02 solution for it, and Charon
because Pluto is drawn as a small-body marker rather than a sphere, so it would have nothing to
orbit.

## Why not JPL's satellite mean-elements table

[Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/) is the page you reach
for first, and it does not work. Two things go wrong.

**Its angles are not all in the same plane.** A `Frame` column says which of three each satellite
uses — the local Laplace plane (with its pole given), the planet's equator, or the ecliptic. That
part is at least documented and implementable.

**Even implemented correctly, it does not reproduce the positions.** With all three frames handled
and every combination of node/apsis precession sign searched, propagating those elements gives, at
their own J2000 epoch, measured against Horizons:

| System | Error at epoch |
|---|---|
| Mars, Jupiter | 0.01–0.14° ✅ |
| Neptune (Triton, Proteus) | 3–4° |
| Saturn | 5–157° ❌ |
| Uranus | 24–165° ❌ |

Radii come out right, so the shape and size of each orbit are fine; it is purely the angular
placement that fails, and only for Saturn and Uranus. Those fitted mean angles evidently carry
conventions specific to each satellite ephemeris (`SAT441`, `URA182`) that a plain Kepler
propagation does not honour. Searching the 18 plausible convention combinations found no setting
better than 63° mean error across the set — that is, no convention makes the table work.

Horizons osculating elements have none of this ambiguity: ask for `REF_PLANE='ECLIPTIC'` and they
arrive in the renderer's own frame in the textbook convention, and can be checked directly against
Horizons vectors.

## Why the mean motion is refitted

The one value in `horizons_satellite_elements.csv` that is not verbatim Horizons output is
`n_deg_per_day`. Horizons reports the **osculating** mean motion — the rate a moon has at that
instant, on the orbit it is instantaneously on. Satellite orbits are perturbed hard enough that
this is not the rate they keep, and the error compounds once per orbit. Mimas laps Saturn about
195 times in six months, so being 0.25% fast puts it on the wrong side of the planet:

| Moon | worst error over ±1 yr, osculating `n` | refitted `n` |
|---|---|---|
| Enceladus | 177.58° | 0.84° |
| Phobos | 177.26° | 2.15° |
| Mimas | 127.98° | 4.34° |
| Io | 84.79° | 0.77° |
| Proteus | 49.25° | 0.02° |
| Titan | 0.98° | 0.02° |

`tools/fetch_moons.py` scans for the mean motion that best predicts real Horizons positions across
eight **fit** dates spanning ±1 year, coarse-to-fine because the number of whole revolutions
between samples is itself unknown. The five dates in `horizons_satellite_vectors.csv` are disjoint
from those eight, so `validate_moons.py` measures prediction rather than self-agreement.

## Accuracy, stated plainly

Held-out validation: **worst 4.09°** (Phobos) and **2.61%** in radius across 105 checks spanning
2025-04 to 2027-02. Every other moon is under ~1.5°.

The renderer takes that seriously rather than treating it as a footnote: `moonorbits.js` exports
`MOON_VALID_YEARS = 1.25` and the 3-D view **withholds the moons entirely** outside that window,
explaining itself in the accuracy line. The date slider reaches ±5000 years, where these elements
mean nothing at all.

This is a budget for a **view**: which side of its planet a moon is on, how the system is laid
out, how fast things go round. It is not an ephemeris. Do not use it for an occultation, a mutual
event, an eclipse timing, or anything that must be right to the arcminute. Error grows away from
the epoch, fastest for the short-period inner moons; re-running `tools/fetch_moons.py` moves the
epoch forward, which is a deliberate act with a visible diff rather than a silent drift.
