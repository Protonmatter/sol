#!/usr/bin/env python3
"""Optional high-precision ephemeris provider for Sol.

The server emits the same ``ephemeris-snapshot.v2`` contract as the in-browser
Rust/WASM engine. Planet, Moon, and Sun positions are sourced from JPL Horizons
(DE441). The server does not synthesize rise/transit/set events; those nullable
fields are intentionally backfilled by the browser's local engine when the
hybrid provider is selected.

Stdlib only. Run:

    python services/ephemeris-server/server.py [--host 127.0.0.1] [--port 8787]

Endpoints:

    GET /health
    GET /v2/sky?unix=<sec>&lat=<deg>&lon=<degE>&elev=<m>
    GET /v1/sky?...   # compatibility alias; response is still schema v2
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
from typing import Any

AU_KM = 149_597_870.7
EARTH_R_KM = 6378.14
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
SCHEMA_VERSION = "ephemeris-snapshot.v2"
CACHE_VERSION = "v3"
CACHE_MAX_ENTRIES = 4096
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
USER_AGENT = "Protonmatter-Sol/0.3 (+https://github.com/Protonmatter/sol)"

# name -> (Horizons command id, kind, mean radius km)
BODIES = [
    ("Sun", "10", "star", 695_700.0),
    ("Moon", "301", "moon", 1_737.4),
    ("Mercury", "199", "planet", 2_439.7),
    ("Venus", "299", "planet", 6_051.8),
    ("Mars", "499", "planet", 3_389.5),
    ("Jupiter", "599", "planet", 69_911.0),
    ("Saturn", "699", "planet", 58_232.0),
    ("Uranus", "799", "planet", 25_362.0),
    ("Neptune", "899", "planet", 24_622.0),
]

# TAI-UTC at each effective UTC date. This mirrors the Rust engine.
LEAP_SECONDS = [
    (1972, 1, 1, 10.0), (1972, 7, 1, 11.0), (1973, 1, 1, 12.0),
    (1974, 1, 1, 13.0), (1975, 1, 1, 14.0), (1976, 1, 1, 15.0),
    (1977, 1, 1, 16.0), (1978, 1, 1, 17.0), (1979, 1, 1, 18.0),
    (1980, 1, 1, 19.0), (1981, 7, 1, 20.0), (1982, 7, 1, 21.0),
    (1983, 7, 1, 22.0), (1985, 7, 1, 23.0), (1988, 1, 1, 24.0),
    (1990, 1, 1, 25.0), (1991, 1, 1, 26.0), (1992, 7, 1, 27.0),
    (1993, 7, 1, 28.0), (1994, 7, 1, 29.0), (1996, 1, 1, 30.0),
    (1997, 7, 1, 31.0), (1999, 1, 1, 32.0), (2006, 1, 1, 33.0),
    (2009, 1, 1, 34.0), (2012, 7, 1, 35.0), (2015, 7, 1, 36.0),
    (2017, 1, 1, 37.0),
]


def gregorian_to_jd(year: int, month: int, day: int) -> float:
    y = year
    m = month
    if m <= 2:
        y -= 1
        m += 12
    a = math.floor(y / 100)
    b = 2 - a + math.floor(a / 4)
    return (
        math.floor(365.25 * (y + 4716))
        + math.floor(30.6001 * (m + 1))
        + day
        + b
        - 1524.5
    )


def tai_minus_utc_seconds(jd_utc: float) -> float | None:
    offset = None
    for year, month, day, value in LEAP_SECONDS:
        if jd_utc >= gregorian_to_jd(year, month, day):
            offset = value
        else:
            break
    return offset


def mean_obliquity_deg(jd_tt: float) -> float:
    t = (jd_tt - 2_451_545.0) / 36_525.0
    arcsec = 84_381.406 - 46.836769 * t - 0.0001831 * t * t + 0.00200340 * t**3
    return arcsec / 3600.0


def gmst_deg(jd_ut1: float) -> float:
    t = (jd_ut1 - 2_451_545.0) / 36_525.0
    return (
        280.46061837
        + 360.98564736629 * (jd_ut1 - 2_451_545.0)
        + 0.000387933 * t * t
        - t**3 / 38_710_000.0
    ) % 360.0


def time_block(jd_utc: float, lon_east: float) -> dict[str, Any]:
    """Build internally consistent v2 time metadata.

    Horizons supplies the body coordinates directly. Because this service does
    not independently ingest IERS EOP, DUT1 and polar motion are explicitly
    degraded rather than silently presented as precision values.
    """
    dut1 = 0.0
    jd_ut1 = jd_utc
    tai_minus_utc = tai_minus_utc_seconds(jd_utc)
    if tai_minus_utc is None:
        jd_tai = None
        jd_tt = jd_ut1
        delta_t = 0.0
        quality = "pre_utc_ut1_proxy"
        source = "pre-1972 UTC treated as UT1 proxy; body coordinates supplied directly by JPL Horizons"
    else:
        jd_tai = jd_utc + tai_minus_utc / 86_400.0
        jd_tt = jd_tai + 32.184 / 86_400.0
        delta_t = (jd_tt - jd_ut1) * 86_400.0
        quality = "degraded"
        source = "JPL Horizons coordinates; no independent IERS EOP table loaded by server"
    return {
        "jd_utc": round(jd_utc, 10),
        "jd_tai": None if jd_tai is None else round(jd_tai, 10),
        "jd_tt": round(jd_tt, 10),
        "jd_ut1": round(jd_ut1, 10),
        "tai_minus_utc_seconds": tai_minus_utc,
        "dut1_seconds": dut1,
        "delta_t_seconds": round(delta_t, 9),
        "lst_deg": round((gmst_deg(jd_ut1) + lon_east) % 360.0, 9),
        "obliquity_deg": round(mean_obliquity_deg(jd_tt), 9),
        "earth_orientation": {
            "source": source,
            "quality": quality,
            "xp_arcsec": 0.0,
            "yp_arcsec": 0.0,
            "dut1_uncertainty_seconds": 0.9,
        },
    }


def refraction_deg(alt_deg: float) -> float:
    """Sæmundsson atmospheric refraction lift from true altitude."""
    if alt_deg < -1.0:
        return 0.0
    r_arcmin = 1.02 / math.tan(math.radians(alt_deg + 10.3 / (alt_deg + 5.11)))
    return r_arcmin / 60.0


def compass(az_deg: float) -> str:
    pts = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    ]
    return pts[int(((az_deg + 11.25) % 360.0) / 22.5) % 16]


def _request_text(params: dict[str, str]) -> str:
    url = HORIZONS + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503) and attempt < 3:
                time.sleep(0.8 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < 3:
                time.sleep(0.8 * (attempt + 1))
                continue
            raise
    raise RuntimeError("Horizons request exhausted retries")


def _horizons_params(
    when: dt.datetime,
    hid: str,
    center: str,
    quantities: str,
    site_coord: str | None = None,
) -> dict[str, str]:
    params = {
        "format": "text",
        "COMMAND": f"'{hid}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": f"'{center}'",
        "START_TIME": "'" + when.strftime("%Y-%m-%d %H:%M:%S") + "'",
        "STOP_TIME": "'" + (when + dt.timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M:%S") + "'",
        "STEP_SIZE": "'1'",
        "QUANTITIES": f"'{quantities}'",
        "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'",
    }
    if site_coord is not None:
        params["COORD_TYPE"] = "'GEODETIC'"
        params["SITE_COORD"] = f"'{site_coord}'"
    return params


def _data_row(text: str) -> str:
    try:
        return text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip().splitlines()[0]
    except (IndexError, AttributeError) as exc:
        raise ValueError("Horizons response did not contain an ephemeris row") from exc


def fetch_body(
    when: dt.datetime,
    lat: float,
    lon_east: float,
    elev_m: float,
    hid: str,
) -> dict[str, float]:
    """Fetch geocentric and topocentric apparent coordinates for one body."""
    site = f"{lon_east},{lat},{elev_m / 1000.0}"
    topo_text = _request_text(_horizons_params(when, hid, "coord@399", "2,4,20", site))
    topo_numbers = re.findall(r"[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?", _data_row(topo_text))
    if len(topo_numbers) < 6:
        raise ValueError("Horizons topocentric row has too few numeric fields")
    topo = [float(value) for value in topo_numbers[-6:]]
    top_ra, top_dec, az, alt, distance_au = topo[:5]

    geo_text = _request_text(_horizons_params(when, hid, "500@399", "2,20"))
    geo_numbers = re.findall(r"[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?", _data_row(geo_text))
    if len(geo_numbers) < 4:
        raise ValueError("Horizons geocentric row has too few numeric fields")
    geo = [float(value) for value in geo_numbers[-4:]]
    geo_ra, geo_dec = geo[:2]

    return {
        "geocentric_ra": geo_ra,
        "geocentric_dec": geo_dec,
        "topocentric_ra": top_ra,
        "topocentric_dec": top_dec,
        "az": az,
        "alt": alt,
        "distance_au": distance_au,
    }


def definitive_positions(when: dt.datetime, lat: float, lon: float, elev: float) -> dict[str, dict[str, float]]:
    """Provider seam for a future local SPICE/DE440 reader."""
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {
            name: pool.submit(fetch_body, when, lat, lon, elev, hid)
            for name, hid, _, _ in BODIES
        }
        return {name: future.result() for name, future in futures.items()}


def build_snapshot(unix: float, lat: float, lon: float, elev: float) -> dict[str, Any]:
    when = dt.datetime.fromtimestamp(unix, tz=dt.timezone.utc)
    raw = definitive_positions(when, lat, lon, elev)
    jd_utc = unix / 86_400.0 + 2_440_587.5
    time_meta = time_block(jd_utc, lon)
    corrected_lon = lon % 360.0
    bodies: list[dict[str, Any]] = []

    for name, _hid, kind, radius_km in BODIES:
        item = raw[name]
        distance_km = item["distance_au"] * AU_KM
        alt = item["alt"]
        alt_refracted = alt + refraction_deg(alt)
        angular_size = (
            2.0
            * math.degrees(math.asin(min(1.0, radius_km / distance_km)))
            * 3600.0
        )
        horizontal_parallax = math.degrees(
            math.asin(min(1.0, EARTH_R_KM / distance_km))
        )
        bodies.append(
            {
                "name": name,
                "kind": kind,
                "coordinate_frame": "true_equator_and_equinox_of_date",
                "ra_deg": round(item["topocentric_ra"] % 360.0, 9),
                "dec_deg": round(item["topocentric_dec"], 9),
                "geocentric_apparent_ra_deg": round(item["geocentric_ra"] % 360.0, 9),
                "geocentric_apparent_dec_deg": round(item["geocentric_dec"], 9),
                "topocentric_apparent_ra_deg": round(item["topocentric_ra"] % 360.0, 9),
                "topocentric_apparent_dec_deg": round(item["topocentric_dec"], 9),
                "distance_km": round(distance_km, 3),
                "alt_deg": round(alt, 7),
                "az_deg": round(item["az"] % 360.0, 7),
                "alt_refracted_deg": round(alt_refracted, 7),
                "above_horizon": alt_refracted > 0.0,
                "compass": compass(item["az"]),
                "angular_size_arcsec": round(angular_size, 4),
                "horizontal_parallax_deg": round(horizontal_parallax, 9),
                "rise_jd": None,
                "transit_jd": None,
                "set_jd": None,
                "transit_alt_deg": None,
            }
        )

    eop_quality = time_meta["earth_orientation"]["quality"]
    accuracy_class = (
        "definitive DE441 body coordinates with degraded standalone Earth-orientation metadata"
        if eop_quality == "degraded"
        else "definitive DE441 body coordinates with pre-UTC time metadata"
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "engine_version": "ephemeris-server (JPL Horizons / DE441)",
        "provider": {
            "tier": "server",
            "source": "JPL Horizons",
            "ephemeris": "DE441",
            "endpoint_contract": "ephemeris-snapshot.v2",
        },
        "time": time_meta,
        "observer": {
            "terrestrial_lat_deg": lat,
            "terrestrial_lon_deg_east": lon,
            "polar_motion_corrected_lat_deg": lat,
            "polar_motion_corrected_lon_deg_east": corrected_lon,
            "elev_m": elev,
        },
        "accuracy": {
            "class": accuracy_class,
            "coordinate_semantics": (
                "ra_deg and dec_deg are apparent topocentric coordinates; "
                "geocentric and topocentric values are emitted separately"
            ),
            "time_scales": (
                "Body coordinates are supplied directly by Horizons; UTC/TAI/TT metadata "
                "uses the bundled leap-second table and UT1 defaults to UTC"
            ),
            "eop_status": eop_quality,
            "validation_scope": (
                "DE441 apparent coordinates from JPL Horizons; contract compatibility "
                "validated locally; rise/transit/set intentionally unavailable server-side"
            ),
            "valid_epoch": "JPL Horizons DE441 supported interval, subject to upstream service availability",
            "non_goal": "navigation, occultation prediction, or safety-critical timing",
        },
        "bodies": bodies,
        "warnings": [
            "Earth orientation metadata is degraded because this server does not independently ingest IERS EOP.",
            "Rise, transit, and set fields are null; the browser may backfill them from the on-device engine.",
            "Observing-planning and research use only; not for navigation or safety-critical timing.",
        ],
    }


def evict_cache(max_entries: int = CACHE_MAX_ENTRIES) -> None:
    try:
        entries = [
            os.path.join(CACHE_DIR, name)
            for name in os.listdir(CACHE_DIR)
            if name.endswith(".json")
        ]
        if len(entries) <= max_entries:
            return
        entries.sort(key=os.path.getmtime)
        for path in entries[: len(entries) - max_entries]:
            try:
                os.remove(path)
            except OSError:
                pass
    except OSError:
        pass


def cache_path(unix: float, lat: float, lon: float, elev: float) -> str:
    key = f"{CACHE_VERSION}|{int(unix)}|{lat:.4f}|{lon:.4f}|{elev:.1f}"
    return os.path.join(CACHE_DIR, hashlib.sha256(key.encode()).hexdigest() + ".json")


def snapshot_cached(unix: float, lat: float, lon: float, elev: float) -> dict[str, Any]:
    unix = float(int(unix))
    path = cache_path(unix, lat, lon, elev)
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as handle:
                cached = json.load(handle)
            if cached.get("schema_version") == SCHEMA_VERSION:
                return cached
        except (json.JSONDecodeError, OSError, AttributeError):
            pass
        try:
            os.remove(path)
        except OSError:
            pass

    snapshot = build_snapshot(unix, lat, lon, elev)
    os.makedirs(CACHE_DIR, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=CACHE_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(snapshot, handle, separators=(",", ":"), allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except OSError:
        try:
            os.remove(temporary)
        except OSError:
            pass
    evict_cache()
    return snapshot


def validate_params(unix: float, lat: float, lon: float, elev: float) -> str | None:
    if not all(math.isfinite(value) for value in (unix, lat, lon, elev)):
        return "unix, lat, lon, and elev must be finite numbers"
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

    def _send(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send(204, {})

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            self._send(
                200,
                {
                    "status": "ok",
                    "provider": "horizons-de441",
                    "schema_version": SCHEMA_VERSION,
                    "endpoints": ["/v2/sky", "/v1/sky"],
                    "bodies": [body[0] for body in BODIES],
                },
            )
            return

        if parsed.path in {"/v2/sky", "/v1/sky"}:
            query = urllib.parse.parse_qs(parsed.query)
            try:
                unix = float(query.get("unix", [None])[0])
                lat = float(query.get("lat", ["0"])[0])
                lon = float(query.get("lon", ["0"])[0])
                elev = float(query.get("elev", ["0"])[0])
            except (TypeError, ValueError):
                self._send(400, {"error": "require numeric unix, lat, lon, elev query params"})
                return
            problem = validate_params(unix, lat, lon, elev)
            if problem:
                self._send(400, {"error": problem})
                return
            try:
                self._send(200, snapshot_cached(unix, lat, lon, elev))
            except Exception as exc:
                self._send(
                    502,
                    {
                        "error": "upstream ephemeris (Horizons) failed",
                        "detail": str(exc),
                    },
                )
            return

        self._send(404, {"error": "not found", "endpoints": ["/health", "/v2/sky"]})

    def log_message(self, fmt: str, *args: Any) -> None:
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("EPHEM_PORT", "8787")))
    parser.add_argument("--host", default=os.environ.get("EPHEM_HOST", "127.0.0.1"))
    args = parser.parse_args()
    os.makedirs(CACHE_DIR, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(
        f"ephemeris-server (DE441 via Horizons) on http://{args.host}:{args.port} "
        "— GET /v2/sky?unix&lat&lon&elev"
    )
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
