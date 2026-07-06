#!/usr/bin/env python3
from pathlib import Path

path = Path("tools/validate_ephemeris.py")
text = path.read_text(encoding="utf-8")
text = text.replace(
    '"""Validate the solar-ephemeris engine against JPL Horizons (DE441).',
    '"""Validate ephemeris-snapshot.v2 against JPL Horizons observer quantities 2, 4, and 49.',
)
start = text.index("CASES = [")
end = text.index("# Horizons COMMAND ids", start)
text = text[:start] + '''CASES = [
    ("Boston", dt.datetime(2026, 7, 1, 2, 13, 47, tzinfo=dt.timezone.utc), 42.36, -71.06, 10.0),
    ("Sydney", dt.datetime(2026, 7, 1, 8, 31, 19, tzinfo=dt.timezone.utc), -33.87, 151.21, 20.0),
    ("Reykjavik", dt.datetime(2026, 7, 1, 14, 44, 3, tzinfo=dt.timezone.utc), 64.13, -21.90, 25.0),
    ("Nairobi", dt.datetime(2026, 7, 1, 20, 57, 41, tzinfo=dt.timezone.utc), -1.29, 36.82, 1660.0),
]
''' + text[end:]
text = text.replace(
    'TOL_SEP_DEG = 0.0017  # ~6" pointing error (Sun+planets VSOP2013, Moon ELP-MPP02, Earth-centre observer)\nTOL_ALT_DEG = 0.0017  # ~6"',
    'DEFAULT_TOL_ARCSEC = 30.0\nMOON_TOL_ARCSEC = 60.0\nDUT1_TOL_SECONDS = 0.003',
)
start = text.index("def engine_altaz(")
end = text.index("\n\ndef horizons_altaz", start)
text = text[:start] + '''def engine_snapshot(binary: Path, when: dt.datetime, lat: float, lon: float, elev: float) -> dict:
    out = subprocess.run(
        [str(binary), str(when.timestamp()), str(lat), str(lon), str(elev)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    snapshot = json.loads(out)
    if snapshot.get("schema_version") != "ephemeris-snapshot.v2":
        raise RuntimeError("engine did not emit ephemeris-snapshot.v2")
    return snapshot
''' + text[end:]
start = text.index("def horizons_altaz(")
end = text.index("\n\ndef fetch_with_retry", start)
text = text[:start] + '''def horizons_observation(command: str, when: dt.datetime, lat: float, lon: float, elev_m: float) -> dict:
    jd_utc = when.timestamp() / 86400.0 + 2440587.5
    params = {
        "format": "text", "COMMAND": f"'{command}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@399'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon % 360.0},{lat},{elev_m / 1000.0}'",
        "TLIST": f"'{jd_utc:.12f}'", "TLIST_TYPE": "'JD'", "TIME_TYPE": "'UT'",
        "TIME_DIGITS": "'FRACSEC'", "QUANTITIES": "'2,4,49'", "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'", "EXTRA_PREC": "'YES'", "CSV_FORMAT": "'YES'", "ELEV_CUT": "'-90'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    payload = fetch_with_retry(url)
    if "$$SOE" not in payload or "$$EOE" not in payload:
        raise RuntimeError(f"Horizons response lacks ephemeris block: {payload[:500]}")
    line = payload.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip().splitlines()[0]
    values = [float(value) for value in re.findall(r"[-+]?\\d+(?:\\.\\d+)(?:[Ee][-+]?\\d+)?", line)]
    if len(values) < 5:
        raise RuntimeError(f"could not parse Horizons quantities 2,4,49: {line}")
    ra, dec, az, el, dut1 = values[-5:]
    return {"ra_deg": ra, "dec_deg": dec, "az_deg": az, "el_deg": el, "dut1_seconds": dut1}
''' + text[end:]
path.write_text(text, encoding="utf-8")
