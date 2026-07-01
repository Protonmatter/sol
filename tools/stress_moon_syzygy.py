#!/usr/bin/env python3
"""Stress-test the Moon's apparent position at new/full moon (syzygy).

At new/full moon the Moon sits ~90 deg from Earth's orbital-velocity vector — the geometry where an
(incorrect) annual-aberration term on the Moon would displace it most, by ~20". The Moon's ELP-MPP02
position is *geocentric* (it already co-moves with the observer), so — unlike the *heliocentric*
VSOP2013 planets — it must NOT carry an annual-aberration term. This gate confirms that: the Moon
matches JPL Horizons to a few arcsec at syzygy *without* such a term (adding one regresses it to
~20-25" here, and the standard gate from ~5" to ~23"). The regular `validate_ephemeris.py` runs at
times far from syzygy, where the distinction is invisible.

Gotcha baked in: Horizons START_TIME is minute-resolution, so epochs are snapped to a whole minute —
otherwise the near-horizon Moon's ~15"/s diurnal motion swamps the comparison.

Reuses the engine/Horizons/geometry helpers from validate_ephemeris.py. Needs network.

Build the CLI first:  cargo build --release -p solar-ephemeris --bin sky
Run:                   python tools/stress_moon_syzygy.py
"""

from __future__ import annotations

import datetime as dt
import math

from validate_ephemeris import (
    engine_altaz, horizons_altaz, angular_sep, find_binary,
    TOL_SEP_DEG, TOL_ALT_DEG, BODIES,
)

SYNODIC = 29.530588861          # mean synodic month (days)
NEWMOON0_JD = 2451550.09766     # Meeus mean new moon, k=0 (~2000-01-06)


def jd_to_utc(jd: float) -> dt.datetime:
    return dt.datetime.fromtimestamp((jd - 2440587.5) * 86400.0, tz=dt.timezone.utc)


def sun_moon_elongation_deg(binary, when: dt.datetime) -> float:
    """Topocentric Sun-Moon separation (deg): ~0 at new moon, ~180 at full. Observer is
    irrelevant to within the Moon's ~1 deg parallax, which does not matter for locating syzygy."""
    b = engine_altaz(binary, when, 0.0, 0.0, 0.0)
    m, s = b["Moon"], b["Sun"]
    return angular_sep(m["alt_deg"], m["az_deg"], s["alt_deg"], s["az_deg"])


def refine_syzygy(binary, jd0: float, want_full: bool) -> float:
    """Refine a mean-syzygy JD to true syzygy by extremising the Sun-Moon elongation
    (max for full, min for new) over a +/-0.7 day window."""
    def metric(jd):
        return sun_moon_elongation_deg(binary, jd_to_utc(jd))

    best_jd, best_val = jd0, metric(jd0)
    for steps, span in ((14, 0.7), (16, 0.08)):        # coarse then fine
        c = best_jd
        for i in range(-steps, steps + 1):
            jd = c + span * i / steps
            v = metric(jd)
            if (v > best_val) if want_full else (v < best_val):
                best_jd, best_val = jd, v
    return best_jd


# Two well-separated observers (opposite hemispheres/longitudes). Aberration is a geocentric
# direction effect, so the observer barely matters, but this guards against any one geometry.
OBSERVERS = [
    ("Boston", 42.36, -71.06, 0.0),
    ("Sydney", -33.87, 151.21, 20.0),
]


def main() -> int:
    binary = find_binary(None)

    # Enumerate 2026 new & full moons (mean), then sample a spread across the year so the
    # Earth-velocity direction (hence the aberration vector) varies between epochs.
    events = []
    for k in range(321, 335):
        jd_new = NEWMOON0_JD + SYNODIC * k
        for want_full, jd in ((False, jd_new), (True, jd_new + SYNODIC / 2.0)):
            if jd_to_utc(jd).year == 2026:
                events.append((want_full, jd))
    events.sort(key=lambda e: e[1])
    n = len(events)
    chosen = [events[int(n * f)] for f in (0.08, 0.37, 0.63, 0.9)]  # 4 epochs across the year

    print(f"{'phase':<6}{'UTC (syzygy)':<19}{'observer':<9}{'illum%':>7}{'sep(arcsec)':>13}{'d_alt(arcsec)':>14}")
    worst_sep = worst_alt = 0.0
    fails = []
    for want_full, jd0 in chosen:
        jd = refine_syzygy(binary, jd0, want_full)
        # Snap to a whole minute: Horizons' START_TIME is minute-resolution, while the engine runs
        # at the exact instant. A sub-minute mismatch is ~15"/s for the near-horizon Moon (diurnal
        # motion), which would otherwise swamp the comparison. Phase is unaffected by ~30 s.
        when = jd_to_utc(jd).replace(second=0, microsecond=0)
        elong = sun_moon_elongation_deg(binary, when)
        illum = (1.0 - math.cos(math.radians(elong))) / 2.0  # ~0 at new, ~1 at full
        phase = "full" if want_full else "new"
        for oname, lat, lon, elev in OBSERVERS:
            eng = engine_altaz(binary, when, lat, lon, elev)["Moon"]
            h_az, h_el = horizons_altaz(BODIES["Moon"], when, lat, lon, elev)
            sep = angular_sep(eng["alt_deg"], eng["az_deg"], h_el, h_az)
            d_alt = abs(eng["alt_deg"] - h_el)
            worst_sep = max(worst_sep, sep)
            worst_alt = max(worst_alt, d_alt)
            print(f"{phase:<6}{when.strftime('%Y-%m-%d %H:%M'):<19}{oname:<9}"
                  f"{illum * 100:>7.1f}{sep * 3600:>13.1f}{d_alt * 3600:>14.1f}")
            if sep > TOL_SEP_DEG or d_alt > TOL_ALT_DEG:
                fails.append(f"{phase} {when:%Y-%m-%d}/{oname}: sep={sep * 3600:.1f}\" d_alt={d_alt * 3600:.1f}\"")

    print(f"\nworst pointing error: {worst_sep * 3600:.1f} arcsec | worst d_alt: {worst_alt * 3600:.1f} arcsec"
          f"  (tol: sep {TOL_SEP_DEG * 3600:.0f}arcsec, alt {TOL_ALT_DEG * 3600:.0f}arcsec)")
    print("illum% ~0 = new moon, ~100 = full moon — the geometry where an (erroneous) Moon")
    print("annual-aberration term would peak (~20\"); matching here confirms none is applied.")
    if fails:
        for f in fails:
            print("FAIL:", f)
        return 1
    print("OK: Moon matches JPL Horizons at syzygy within tolerance — confirms NO annual-aberration")
    print("term is needed (its geocentric ELP-MPP02 frame already co-moves with the observer).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
