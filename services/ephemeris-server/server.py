#!/usr/bin/env python3
"""Ephemeris server — the hybrid "high-precision" tier (docs/SOLAR_SYSTEM_SPEC.md §2.1, P7).

Serves the SAME `ephemeris-snapshot.v1` contract as the in-browser WASM engine, but sourced
from **JPL Horizons (DE441)** — the definitive ephemeris. The client engine stays the offline
default; the frontend escalates here only when it wants definitive precision / deep time.

Why Horizons rather than shipping DE440/DE441 kernels: the kernels are 0.1–3 GB and need a SPICE
reader. Horizons runs DE441 and is the source this project already validates against. The
`definitive_positions()` function is the provider seam — a local SPICE/DE440 reader could replace
it without changing the HTTP contract.

Stdlib only (no pip). Run:  python services/ephemeris-server/server.py [--port 8787]
Then:  GET /health   ·   GET /v1/sky?unix=<sec>&lat=<deg>&lon=<degE>&elev=<m>
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AU_KM = 149_597_870.7
EARTH_R_KM = 6378.14
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"

# name -> (Horizons COMMAND id, kind, mean radius km). Order matches the WASM engine's ALL_BODIES.
BODIES = [
    ("Sun", "10", "star", 696000.0),
    ("Moon", "301", "moon", 1737.4),
    ("Mercury", "199", "planet", 2439.7),
    ("Venus", "299", "planet", 6051.8),
    ("Mars", "499", "planet", 3389.5),
    ("Jupiter", "599", "planet", 69911.0),
    ("Saturn", "699", "planet", 58232.0),
    ("Uranus", "799", "planet", 25362.0),
    ("Neptune", "899", "planet", 24622.0),
]
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")


def refraction_deg(alt_deg: float) -> float:
    """Sæmundsson atmospheric refraction lift (deg) from a TRUE altitude — kept in sync with
    the Rust engine's coords::refraction_deg. (Bennett's coefficients expect the APPARENT
    altitude; using them here left the two providers ~5.5 arcmin apart at the horizon, so
    switching tiers could flip above_horizon while rise/set said otherwise.)"""
    if alt_deg < -1.0:
        return 0.0
    r_arcmin = 1.02 / math.tan(math.radians(alt_deg + 10.3 / (alt_deg + 5.11)))
    return r_arcmin / 60.0


def compass(az_deg: float) -> str:
    # 16-point, matching the WASM engine's compass() exactly — the provider toggle used to
    # change "NNE" to "NE" with no position change (8-point here vs 16-point on-device).
    pts = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return pts[int(((az_deg + 11.25) % 360.0) / 22.5) % 16]


def fetch_body(when: dt.datetime, lat: float, lon_east: float, elev_m: float, hid: str) -> dict:
    """One Horizons OBSERVER query: apparent RA/Dec (2), airless Az/El (4), range (20)."""
    params = {
        "format": "text", "COMMAND": f"'{hid}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@399'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_east},{lat},{elev_m / 1000.0}'",
        # Seconds precision. The old %H:%M silently floored the request to the whole minute
        # while the payload claimed "definitive apparent place" for the exact instant —
        # Earth rotates ~15″/s, so hh:mm:59 requests came back up to ~15′ off in az/el
        # (worse than the on-device engine this tier exists to upgrade).
        "START_TIME": "'" + when.strftime("%Y-%m-%d %H:%M:%S") + "'",
        "STOP_TIME": "'" + (when + dt.timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M:%S") + "'",
        "STEP_SIZE": "'1'", "QUANTITIES": "'2,4,20'", "ANG_FORMAT": "'DEG'", "APPARENT": "'AIRLESS'",
    }
    url = HORIZONS + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    text = None
    for attempt in range(4):
        try:
            text = urllib.request.urlopen(url, timeout=40).read().decode()
            break
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503) and attempt < 3:  # rate limit / transient — back off and retry
                time.sleep(0.6 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError:
            # Socket timeouts / transient network — the most retryable class of all.
            if attempt < 3:
                time.sleep(0.6 * (attempt + 1))
                continue
            raise
    row = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()[0]
    f = re.findall(r"[-+]?\d+\.\d+", row)[-6:]  # RA, Dec, Az, El, range(AU), range-rate
    ra, dec, az, el, delta_au = float(f[0]), float(f[1]), float(f[2]), float(f[3]), float(f[4])
    return {"ra": ra, "dec": dec, "az": az, "el": el, "delta_au": delta_au}


def definitive_positions(when: dt.datetime, lat: float, lon: float, elev: float) -> dict:
    """Provider seam: fetch all bodies' definitive positions (parallel). Swap for SPICE/DE440 later."""
    with ThreadPoolExecutor(max_workers=3) as pool:  # gentle on the Horizons rate limiter
        futures = {name: pool.submit(fetch_body, when, lat, lon, elev, hid) for name, hid, _, _ in BODIES}
        return {name: fut.result() for name, fut in futures.items()}


def build_snapshot(unix: float, lat: float, lon: float, elev: float) -> dict:
    when = dt.datetime.fromtimestamp(unix, tz=dt.timezone.utc)
    raw = definitive_positions(when, lat, lon, elev)
    jd_utc = unix / 86400.0 + 2440587.5
    bodies = []
    for name, _hid, kind, radius_km in BODIES:
        b = raw[name]
        dist_km = b["delta_au"] * AU_KM
        alt = b["el"]
        alt_ref = alt + refraction_deg(alt)
        ang = 2.0 * math.degrees(math.asin(min(1.0, radius_km / dist_km))) * 3600.0
        hp = math.degrees(math.asin(min(1.0, EARTH_R_KM / dist_km)))
        bodies.append({
            "name": name, "kind": kind,
            "ra_deg": round(b["ra"], 6), "dec_deg": round(b["dec"], 6), "distance_km": round(dist_km, 1),
            "alt_deg": round(alt, 5), "az_deg": round(b["az"], 5), "alt_refracted_deg": round(alt_ref, 5),
            "above_horizon": alt_ref > 0.0, "compass": compass(b["az"]),
            "angular_size_arcsec": round(ang, 2), "horizontal_parallax_deg": round(hp, 6),
            "rise_jd": None, "transit_jd": None, "set_jd": None, "transit_alt_deg": None,
        })
    return {
        "schema_version": "ephemeris-snapshot.v1",
        "engine_version": "ephemeris-server (JPL Horizons / DE441)",
        "time": {"jd_utc": round(jd_utc, 8)},
        "observer": {"lat_deg": lat, "lon_deg": lon, "elev_m": elev},
        "provider": {
            "tier": "server", "source": "JPL Horizons", "ephemeris": "DE441",
            "class": "definitive apparent place (full numerical integration)",
            "note": "Topocentric apparent positions from Horizons; rise/transit/set are not computed server-side.",
        },
        "accuracy": {"class": "definitive (DE441 via JPL Horizons)", "validated_against": "JPL Horizons DE441",
                     "non_goal": "navigation / occultation timing"},
        "bodies": bodies,
        "warnings": ["High-precision server tier (DE441). Rise/set fields are null; use the on-device engine for those."],
    }


CACHE_VERSION = "v2"  # bump when the snapshot format changes so stale-schema entries can't serve
CACHE_MAX_ENTRIES = 4096  # a client polling "now" writes ~1 entry/min → cap ≈ 3 days of live use


def evict_cache(max_entries: int = CACHE_MAX_ENTRIES) -> None:
    """Drop the oldest entries (by mtime) once the cache exceeds the cap. Runs only on a
    cache MISS (writes are the rare path), so the listdir cost is amortized; without this
    the on-disk cache grew one file per distinct minute/site forever."""
    try:
        entries = [
            os.path.join(CACHE_DIR, name)
            for name in os.listdir(CACHE_DIR)
            if name.endswith(".json")
        ]
        if len(entries) <= max_entries:
            return
        entries.sort(key=lambda p: os.path.getmtime(p))
        for path in entries[: len(entries) - max_entries]:
            try:
                os.remove(path)
            except OSError:
                pass  # concurrent eviction/read — someone else won, fine
    except OSError:
        pass  # cache dir unreadable — eviction is best-effort


def cache_path(unix: float, lat: float, lon: float, elev: float) -> str:
    # The key and the Horizons query MUST share one quantization. The old key rounded to
    # the NEAREST minute while the query floored — adjacent requests collided onto the
    # wrong minute's sky, stamped with another request's timestamp.
    key = f"{CACHE_VERSION}|{int(unix)}|{lat:.4f}|{lon:.4f}|{elev:.1f}"
    return os.path.join(CACHE_DIR, hashlib.sha1(key.encode()).hexdigest() + ".json")


def snapshot_cached(unix: float, lat: float, lon: float, elev: float) -> dict:
    unix = float(int(unix))  # whole-second quantization, shared by key, query, and jd_utc
    path = cache_path(unix, lat, lon, elev)
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            # A corrupt/truncated entry used to 502 this key forever; treat it as a miss.
            try:
                os.remove(path)
            except OSError:
                pass
    snap = build_snapshot(unix, lat, lon, elev)
    os.makedirs(CACHE_DIR, exist_ok=True)
    # Unique temp name per writer: two concurrent misses for the same key used to share
    # one fixed ".tmp" path — interleaved writes could persist garbage (or raise
    # PermissionError on Windows while the other thread held the handle).
    fd, tmp = tempfile.mkstemp(dir=CACHE_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(snap, fh)
        os.replace(tmp, path)
    except OSError:
        try:
            os.remove(tmp)
        except OSError:
            pass
    evict_cache()
    return snap


def validate_params(unix: float, lat: float, lon: float, elev: float) -> str | None:
    """Return an error message for out-of-range/non-finite params, or None when valid."""
    if not all(math.isfinite(v) for v in (unix, lat, lon, elev)):
        return "unix, lat, lon, and elev must be finite numbers"
    # Horizons runs DE441 (roughly −13200..+17191); keep a generous but sane window.
    if not -4.0e12 < unix < 4.0e12:
        return "unix is outside the supported time range"
    if not -90.0 <= lat <= 90.0:
        return "lat must be within [-90, 90] degrees"
    if not -360.0 <= lon <= 360.0:
        return "lon must be within [-360, 360] degrees east"
    if not -12_000.0 <= elev <= 100_000.0:
        return "elev must be within [-12000, 100000] metres"
    return None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # CORS preflight
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            self._send(200, {"status": "ok", "provider": "horizons-de441",
                             "bodies": [b[0] for b in BODIES]})
            return
        if parsed.path == "/v1/sky":
            q = urllib.parse.parse_qs(parsed.query)
            try:
                unix = float(q.get("unix", [None])[0])
                lat = float(q.get("lat", ["0"])[0])
                lon = float(q.get("lon", ["0"])[0])
                elev = float(q.get("elev", ["0"])[0])
            except (TypeError, ValueError):
                self._send(400, {"error": "require numeric unix, lat, lon, elev query params"})
                return
            # Bounds check BEFORE spending nine Horizons queries: garbage like lat=91 or
            # unix=nan used to be forwarded upstream and come back as a misleading 502.
            problem = validate_params(unix, lat, lon, elev)
            if problem:
                self._send(400, {"error": problem})
                return
            try:
                self._send(200, snapshot_cached(unix, lat, lon, elev))
            except Exception as exc:  # Horizons unreachable / parse error
                self._send(502, {"error": "upstream ephemeris (Horizons) failed", "detail": str(exc)})
            return
        self._send(404, {"error": "not found", "endpoints": ["/health", "/v1/sky"]})

    def log_message(self, fmt, *args):  # quieter logging
        pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("EPHEM_PORT", "8787")))
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    os.makedirs(CACHE_DIR, exist_ok=True)
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"ephemeris-server (DE441 via Horizons) on http://{args.host}:{args.port}  "
          f"— GET /v1/sky?unix&lat&lon&elev")
    srv.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
