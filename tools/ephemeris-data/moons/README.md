# Major-moon source data (pristine, committed)

Raw upstream data for `tools/generate_moons.py`. Committed so the derived module
(`apps/web/js/moons.js`) is reproducible offline forever; do not edit these by hand — re-run
`tools/fetch_moons.py`, the only networked step, which CI never runs.

| File | Upstream | License | sha256 |
|---|---|---|---|
| `jpl_satellite_physical.csv` | [JPL SSD satellite physical parameters](https://ssd.jpl.nasa.gov/sats/phys_par/) — GM, mean radius, mean density; row subset | public domain (US Government) | `03c688bca6064568665a396ec9c189dcdb2d169fe782e90b3660a72c99a00a99` |
| `horizons_satellite_elements.csv` | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) osculating elements, planetocentric, ecliptic J2000, sampled across the supported interval | public domain (US Government) | `da120c34abac6de490bfebba5d85613d4a6e8fe3cb3ef0e8f96d38bb99221e26` |
| `horizons_satellite_vectors.csv` | JPL Horizons state vectors at times interleaved between the element knots, the ground truth `tools/validate_moons.py` gates against | public domain (US Government) | `a0b5f8884f8d4eae5a594903a8356ed36c3664ec8d173c8132f8192c20546508` |

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

## Why the model uses multiple epochs

One osculating element set is only a snapshot. Satellite orbits are perturbed hard enough that
Kepler-propagating it for months compounds both phase and radius error. Mimas laps Saturn about
195 times in six months, so even a small instantaneous-rate mismatch eventually puts it on the
wrong side of the planet.

`tools/fetch_moons.py` therefore records fresh Horizons elements every seven days from 2025-03-01
through 2027-03-01. Mimas and Enceladus use 84-hour knots because their short, strongly perturbed
orbits need the finer cadence. The generator converts the classical elements to modified
equinoctial values `[a,h,k,p,q,L]` before interpolation. That avoids the meaningless 180° jumps in
node and argument of periapsis that occur for nearly circular or low-inclination orbits.

Validation vectors are requested halfway between element knots — never at a knot — so the gate
measures interpolation against independent Horizons positions rather than reproducing its inputs.

## Accuracy, stated plainly

Held-out validation: **worst 0.0887°** (Nereid) and **0.1891%** in radius (Enceladus) across
2,392 checks spanning 2025-03-04 12:00 to 2027-02-23 12:00 TDB. CI fails above 0.15° angular
or 0.25% radial error, if any check coincides with an element knot, or if a moon has fewer than
100 independent checks.

The generated module exports the exact intersection of the per-moon validation intervals, and the
3-D view **withholds the moons entirely** outside it, explaining itself in the accuracy line. The
date slider reaches ±5000 years, where these elements mean nothing at all.

This is a budget for a **view**: which side of its planet a moon is on, how the system is laid
out, how fast things go round. It is not an ephemeris. Do not use it for an occultation, a mutual
event, an eclipse timing, or anything that must be right to the arcminute. Re-running
`tools/fetch_moons.py` moves the supported interval forward, which is a deliberate act with a
visible diff rather than a silent drift.
