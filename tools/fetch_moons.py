#!/usr/bin/env python3
"""Refresh the pristine satellite sources in tools/ephemeris-data/moons/ — needs network.

The only networked step in the moon pipeline, and not run by CI. `tools/generate_moons.py`
derives the shipped module from what this writes, offline and deterministically, and
`tools/validate_moons.py` checks it against the ground truth this also captures.

Sources (public domain, NASA/JPL Solar System Dynamics):
  • Satellite physical parameters   https://ssd.jpl.nasa.gov/sats/phys_par/   (radius, GM, density)
  • JPL Horizons API                https://ssd.jpl.nasa.gov/api/horizons.api (elements + vectors)

WHY HORIZONS ELEMENTS AND NOT THE MEAN-ELEMENTS TABLE. JPL also publishes a "Planetary Satellite
Mean Elements" page, which looks like the obvious source and is a trap. Its angles are referred to
three different planes depending on the satellite (the local Laplace plane, the planet's equator,
or the ecliptic), and even with all three implemented and every combination of node/apsis
precession sign searched, it reproduces Mars's and Jupiter's moons to ~0.1° while missing
Saturn's and Uranus's by 24–165° AT THEIR OWN EPOCH. Those fitted mean angles evidently carry
conventions specific to each satellite ephemeris (SAT441, URA182) that a plain Kepler propagation
does not honour.

Horizons osculating elements have no such ambiguity: request REF_PLANE='ECLIPTIC' and they arrive
in exactly the frame the renderer uses, in the textbook convention. Propagated with Kepler they
hold Titan to 0.6° over seven months where the mean elements were 157° out.

Usage:  python tools/fetch_moons.py [--check]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import math
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "ephemeris-data" / "moons"

PHYS_URL = "https://ssd.jpl.nasa.gov/sats/phys_par/"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Epoch of the committed osculating elements. Fixed and explicit: re-running this script moves it,
# which is a deliberate act with a visible diff, not a silent drift.
EPOCH = "2026-01-01"
# Dates used to REFIT the mean motion (below), and a disjoint set the committed elements are
# validated against. Keeping them separate matters: fitting and checking on the same dates would
# measure how well a curve reproduces its own input, not how well it predicts.
FIT_DATES = ["2025-03-01", "2025-06-01", "2025-09-01", "2025-12-01",
             "2026-03-01", "2026-06-01", "2026-09-01", "2026-12-01"]
CHECK_DATES = ["2025-04-15", "2025-10-15", "2026-04-15", "2026-10-15", "2027-02-15"]

# Moons worth drawing: mean radius >= 150 km — roughly "large enough to have relaxed into a
# sphere" — plus Mars's two, which are famous enough that their absence would be conspicuous.
MIN_RADIUS_KM = 150.0
ALWAYS = {"Phobos", "Deimos"}
# Earth's Moon has a full ELP-MPP02 solution in the engine and is not driven from here. Pluto is
# drawn as a small-body marker rather than a sphere, so Charon would have nothing to orbit.
EXCLUDE_PLANETS = {"Earth", "Pluto"}

PLANET_CENTER = {"Mars": "500@499", "Jupiter": "500@599", "Saturn": "500@699",
                 "Uranus": "500@799", "Neptune": "500@899"}

PHYS_COLS = ["Planet", "Satellite", "Code", "GM_km3_s2", "mean_radius_km", "mean_density_g_cm3"]
ELEM_COLS = ["Planet", "Satellite", "Code", "epoch_jd_tdb", "a_km", "e", "i_deg",
             "node_deg", "argp_deg", "M_deg", "n_deg_per_day"]
VEC_COLS = ["Satellite", "Code", "jd_tdb", "x_km", "y_km", "z_km"]


def get(url: str, params: dict[str, str] | None = None) -> str:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Sol moon fetcher)"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read().decode("utf-8", "replace")


def horizons(code: str, center: str, ephem_type: str, start: str, stop: str, step: str) -> str:
    doc = get(HORIZONS, {
        "format": "text", "COMMAND": f"'{code}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": f"'{ephem_type}'", "CENTER": f"'{center}'", "REF_PLANE": "'ECLIPTIC'",
        "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": f"'{step}'",
        "OUT_UNITS": "'KM-S'", "VEC_TABLE": "'1'",
    })
    body = re.search(r"\$\$SOE(.*?)\$\$EOE", doc, re.S)
    if not body:
        raise SystemExit(f"Horizons returned no ephemeris for {code}:\n{doc[:400]}")
    return body.group(1)


def phys_table() -> dict[str, list[str]]:
    doc = get(PHYS_URL)
    out: dict[str, list[str]] = {}
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", doc, re.S):
        cells = []
        for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S):
            parts = html.unescape(re.sub(r"<[^>]+>", " ", c)).replace("\xa0", " ").split()
            cells.append(parts[0] if parts else "")
        if len(cells) >= 6 and cells[2].isdigit():
            out[cells[2]] = cells[:6]
    if not out:
        raise SystemExit("could not parse the satellite physical-parameters table")
    return out


def kepler_xyz(el: dict[str, float], jd: float) -> tuple[float, float, float]:
    """Planetocentric ecliptic-J2000 position (km) from an element set at Julian date `jd`."""
    days = jd - el["epoch"]
    M = math.radians(el["M0"] + el["n"] * days)
    M = math.fmod(M, 2 * math.pi)
    if M > math.pi:
        M -= 2 * math.pi
    elif M < -math.pi:
        M += 2 * math.pi
    E = M + 0.85 * el["e"] * (-1 if M < 0 else 1)
    for _ in range(60):
        d = (E - el["e"] * math.sin(E) - M) / (1 - el["e"] * math.cos(E))
        E -= d
        if abs(d) < 1e-14:
            break
    xp = el["a"] * (math.cos(E) - el["e"])
    yp = el["a"] * math.sqrt(1 - el["e"] ** 2) * math.sin(E)
    inc, node, argp = map(math.radians, (el["i"], el["node"], el["argp"]))
    co, so = math.cos(argp), math.sin(argp)
    cn, sn = math.cos(node), math.sin(node)
    ci, si = math.cos(inc), math.sin(inc)
    return (
        (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
        (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
        (so * si) * xp + (co * si) * yp,
    )


def worst_angle(el: dict[str, float], samples: list[tuple[float, tuple[float, float, float]]]) -> float:
    worst = 0.0
    for jd, truth in samples:
        got = kepler_xyz(el, jd)
        rg = math.dist((0, 0, 0), got)
        rt = math.dist((0, 0, 0), truth)
        if rg == 0 or rt == 0:
            return 1e9
        c = sum(a * b for a, b in zip(got, truth)) / (rg * rt)
        worst = max(worst, math.degrees(math.acos(max(-1.0, min(1.0, c)))))
    return worst


def refit_mean_motion(el: dict[str, float], samples) -> float:
    """Find the mean motion that best predicts real positions across the fit window.

    Horizons reports the OSCULATING mean motion — the rate the moon has at that instant, on the
    orbit it is instantaneously on. Satellite orbits are perturbed hard enough that this is not
    the rate they actually keep: Mimas laps its planet ~195 times in six months, so its osculating
    n is 0.25% fast and the moon ends up on the wrong SIDE of Saturn (175° out) within weeks.

    A coarse scan then a local refinement finds the mean rate instead. The scan has to be coarse-
    to-fine rather than a straight least-squares fit because the number of whole revolutions
    between samples is itself unknown — there are many candidate n values that fit any single
    date, and only the right one fits them all.
    """
    best_n, best_err = el["n"], worst_angle(el, samples)
    span = 0.01 * el["n"]
    steps = 40001
    for k in range(steps):
        n = el["n"] - span + 2 * span * k / (steps - 1)
        err = worst_angle({**el, "n": n}, samples)
        if err < best_err:
            best_n, best_err = n, err
    for scale in (1e-4, 1e-6, 1e-8):
        window = scale * el["n"]
        for k in range(-200, 201):
            n = best_n + window * k / 200
            err = worst_angle({**el, "n": n}, samples)
            if err < best_err:
                best_n, best_err = n, err
    return best_n


def parse_elements(block: str) -> tuple[float, dict[str, float]]:
    """First record of a Horizons ELEMENTS block → (jd, {EC, IN, OM, W, N, MA, A})."""
    jd = float(re.search(r"^\s*([\d.]+) = A\.D\.", block, re.M).group(1))
    vals = {k: float(v) for k, v in re.findall(r"([A-Z]{1,2})\s*=\s*(-?[\d.]+E?[-+]?\d*)", block)}
    for key in ("EC", "IN", "OM", "W", "N", "MA", "A"):
        if key not in vals:
            raise SystemExit(f"Horizons elements missing {key}")
    return jd, vals


def build() -> dict[str, bytes]:
    phys = phys_table()
    chosen = []
    for code, p in phys.items():
        planet, name = p[0], p[1]
        if planet in EXCLUDE_PLANETS or planet not in PLANET_CENTER:
            continue
        try:
            radius = float(p[4])
        except ValueError:
            continue
        if radius >= MIN_RADIUS_KM or name in ALWAYS:
            chosen.append((code, p))
    chosen.sort(key=lambda cp: int(cp[0]))

    def vectors_at(code: str, center: str, dates: list[str], name: str):
        out = []
        for date in dates:
            block = horizons(code, center, "VECTORS", date, date + " 01:00", "1 d")
            m = re.search(r"([\d.]+) = A\.D\.[^\n]*\n\s*X =\s*(-?[\d.E+]+)\s*Y =\s*(-?[\d.E+]+)\s*Z =\s*(-?[\d.E+]+)", block)
            if not m:
                raise SystemExit(f"could not parse vectors for {name} at {date}")
            out.append((float(m.group(1)),
                        (float(m.group(2)), float(m.group(3)), float(m.group(4)))))
            time.sleep(0.2)
        return out

    elems, vectors = [], []
    for code, p in chosen:
        planet, name = p[0], p[1]
        center = PLANET_CENTER[planet]
        jd, v = parse_elements(horizons(code, center, "ELEMENTS", EPOCH, EPOCH + " 01:00", "1 d"))
        el = {"epoch": jd, "a": v["A"], "e": v["EC"], "i": v["IN"], "node": v["OM"],
              "argp": v["W"], "M0": v["MA"], "n": v["N"] * 86400}
        fit_samples = vectors_at(code, center, FIT_DATES, name)
        osc_err = worst_angle(el, fit_samples)
        el["n"] = refit_mean_motion(el, fit_samples)
        fit_err = worst_angle(el, fit_samples)
        elems.append([planet, name, code, f"{jd:.6f}", f"{el['a']:.4f}", f"{el['e']:.8f}",
                      f"{el['i']:.6f}", f"{el['node']:.6f}", f"{el['argp']:.6f}",
                      f"{el['M0']:.6f}", f"{el['n']:.9f}"])
        for j, truth in vectors_at(code, center, CHECK_DATES, name):
            vectors.append([name, code, f"{j:.6f}",
                            f"{truth[0]:.3f}", f"{truth[1]:.3f}", f"{truth[2]:.3f}"])
        print(f"  {name:10s} a={el['a']:11.1f} km  worst-fit error: osculating n {osc_err:7.2f}° "
              f"-> refitted {fit_err:5.2f}°")
        time.sleep(0.2)

    def to_csv(header, rows):
        buf = io.StringIO(newline="")
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
        return buf.getvalue().encode("utf-8")

    return {
        "jpl_satellite_physical.csv": to_csv(PHYS_COLS, [p for _, p in chosen]),
        "horizons_satellite_elements.csv": to_csv(ELEM_COLS, elems),
        "horizons_satellite_vectors.csv": to_csv(VEC_COLS, vectors),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the committed sources differ")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    payloads = build()
    bad = False
    for name, data in payloads.items():
        dst = OUT / name
        if args.check:
            if (dst.read_bytes() if dst.exists() else b"") != data:
                print(f"DRIFT: {name} differs from upstream")
                bad = True
        else:
            dst.write_bytes(data)
        print(f"  {name}: {len(data)} bytes  sha256 {hashlib.sha256(data).hexdigest()}")
    if args.check and bad:
        return 1
    print("OK" if args.check else f"wrote {len(payloads)} files to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
