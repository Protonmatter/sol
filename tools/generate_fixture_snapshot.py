#!/usr/bin/env python3
"""Generate deterministic Solar Maximum Engine web and test fixtures."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import random
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]

# Feeds whose cached copies should be flagged when older than this many hours.
FRESHNESS_LIMITS_HOURS = {
    "rtsw_mag_1m.json": 3.0,
    "rtsw_wind_1m.json": 3.0,
    "swpc-planetary-k-index-1m": 3.0,
    "swpc-goes-xrays-1-day": 3.0,
    "swpc-f107-cm-flux": 48.0,
    "swpc-solar-regions": 48.0,
    "swpc-sunspot-report": 48.0,
    "swpc-goes-xray-flares-7-day": 48.0,
}


def display_path(path: Path) -> str:
    """Repo-relative POSIX path, or just the file name for paths outside the repo.

    Embedding `str(path)` produced Windows backslashes (platform-dependent artifacts)
    and, for cache paths, leaked the local username into committed/deployed JSON.
    """
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.name


def content_bytes(path: Path) -> int:
    """Byte count of the newline-normalized content, so CRLF (Windows autocrlf)
    and LF checkouts report the same number for the same committed file."""
    return len(path.read_bytes().replace(b"\r\n", b"\n"))


def parse_time_tag(value: Any) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed


def row_time(row: dict[str, Any]) -> str | None:
    for key in ("time_tag", "time", "date", "begin_time"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


OPTIONAL_CACHE_SOURCES = [
    {
        "id": "swpc-rtsw-ephemerides-1h",
        "cache_name": "rtsw_ephemerides_1h.json",
        "name": "NOAA/SWPC RTSW ephemerides",
        "url": "https://services.swpc.noaa.gov/json/rtsw/rtsw_ephemerides_1h.json",
        "layer_kind": "observed",
        "default_quality": "satellite/observer context for RTSW measurements",
    },
    {
        "id": "swpc-observed-cycle-indices",
        "cache_name": "observed-solar-cycle-indices.json",
        "name": "NOAA/SWPC observed solar-cycle indices",
        "url": "https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json",
        "layer_kind": "observed",
        "default_quality": "monthly cycle context for research display and activity proxy",
    },
    {
        "id": "swpc-predicted-cycle",
        "cache_name": "predicted-solar-cycle.json",
        "name": "NOAA/SWPC predicted solar-cycle progression",
        "url": "https://services.swpc.noaa.gov/json/solar-cycle/predicted-solar-cycle.json",
        "layer_kind": "observed",
        "default_quality": "public NOAA cycle progression context; not an internal forecast model",
    },
    {
        "id": "swpc-solar-regions",
        "cache_name": "solar_regions.json",
        "name": "NOAA/SWPC solar regions",
        "url": "https://services.swpc.noaa.gov/json/solar_regions.json",
        "layer_kind": "observed",
        "default_quality": "daily active-region context for research model input",
    },
    {
        "id": "swpc-sunspot-report",
        "cache_name": "sunspot_report.json",
        "name": "NOAA/SWPC sunspot report",
        "url": "https://services.swpc.noaa.gov/json/sunspot_report.json",
        "layer_kind": "observed",
        "default_quality": "daily sunspot context for cycle-stage teaching display",
    },
    {
        "id": "swpc-planetary-k-index-1m",
        "cache_name": "planetary_k_index_1m.json",
        "name": "NOAA/SWPC planetary K index",
        "url": "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
        "layer_kind": "observed",
        "default_quality": "Kp context for impact-learning panels; not an alerting source",
    },
    {
        "id": "swpc-f107-cm-flux",
        "cache_name": "f107_cm_flux.json",
        "name": "NOAA/SWPC F10.7 cm radio flux",
        "url": "https://services.swpc.noaa.gov/json/f107_cm_flux.json",
        "layer_kind": "observed",
        "default_quality": "F10.7 solar-radio proxy context for cycle and impact-learning displays",
    },
    {
        "id": "swpc-goes-xrays-1-day",
        "cache_name": "goes_xrays_1_day.json",
        "name": "NOAA/SWPC GOES primary X-ray flux",
        "url": "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
        "layer_kind": "observed",
        "default_quality": "recent XRS context for flare activity research display",
    },
    {
        "id": "swpc-goes-xray-flares-7-day",
        "cache_name": "goes_xray_flares_7_day.json",
        "name": "NOAA/SWPC GOES X-ray flare events",
        "url": "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json",
        "layer_kind": "observed",
        "default_quality": "recent flare-event context; not used for warnings",
    },
    {
        "id": "helioviewer-datasources",
        "cache_name": "helioviewer_datasources.json",
        "name": "Helioviewer API data-source metadata",
        "url": "https://api.helioviewer.org/v2/getDataSources/",
        "layer_kind": "observed",
        "default_quality": "quicklook metadata for future overlays; not calibrated FITS",
    },
    {
        "id": "jpl-horizons-observer-geometry",
        "cache_name": "jpl_horizons_sun_earth.json",
        "name": "JPL Horizons Sun/Earth observer geometry",
        "url": "https://ssd.jpl.nasa.gov/api/horizons.api",
        "layer_kind": "inferred",
        "default_quality": "observer geometry context; not a solar magnetic model",
    },
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="apps/web/data/latest-state.json")
    parser.add_argument("--observations-out", default="tests/fixtures/live-swpc-normalized.json")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--lon-count", type=int, default=72)
    parser.add_argument("--lat-count", type=int, default=36)
    parser.add_argument("--cache", help="Optional public-data cache directory to use before deterministic SWPC fixtures.")
    args = parser.parse_args()

    observations = build_observation_report(Path(args.cache) if args.cache else None)
    snapshot = build_snapshot(args.seed, args.lon_count, args.lat_count, observations)
    write_json(Path(args.out), snapshot)
    write_json(Path(args.observations_out), observations)
    print(f"wrote snapshot={args.out}")
    print(f"wrote observations={args.observations_out}")
    return 0


def build_snapshot(seed: int, lon_count: int, lat_count: int, observations: dict[str, Any]) -> dict[str, Any]:
    rng = random.Random(seed)
    observed_context = observations.get("observed_context") or {}
    # Only frames with attributable provenance qualify as snapshot-embedded evidence —
    # the snapshot schema requires provenance.source on every attached frame (the same
    # rule solar-cli applies): evidence you cannot attribute is not evidence. The full
    # frame set still ships in the observations report file; the snapshot counts and
    # discloses what it left out. (A real 12-feed ingest embeds only the RTSW frames;
    # the schema tightening had previously only ever met the 2-frame fixture fallback,
    # so the first live daily run after it broke here.)
    all_frames = observations.get("frames") or []
    attributable_frames = [
        frame for frame in all_frames
        if str((frame.get("provenance") or {}).get("source") or "").strip()
    ]
    unattributed_count = len(all_frames) - len(attributable_frames)
    snapshot_observations = {**observations, "frames": attributable_frames}
    activity_index = clamp_float(observed_context.get("activity_index", 0.9), 0.2, 1.0)
    region_count = int(clamp_float(observed_context.get("synthetic_region_count", 34), 8, 44))
    active_regions = build_regions(rng, count=region_count)
    br, confidence = build_field(lon_count, lat_count, active_regions)
    continuum = [continuum_from_br(value) for value in br]
    variance = [round(max(0.04, 1.0 - conf), 6) for conf in confidence]

    source_mode = snapshot_source_mode(observations)
    return {
        "schema_version": "solar-state-snapshot.v2",
        "model_version": "0.2.0",
        "source_mode": source_mode,
        "operational_use": False,
        "calibration_state": "normalized magnetic units; physical Gauss/Mx calibration not asserted",
        "operational_readiness": build_operational_readiness(source_mode, observations),
        "manifest": {
            "schema_version": "model-run-manifest.v1",
            "model_name": "Solar Maximum Engine deterministic fixture",
            # Honest provenance: this generator paints static Gaussian bipoles once — it does
            # NOT run the transport model. The previous manifest claimed the full
            # rotation+diffusion+decay math basis and a fabricated 48-step run, which
            # contradicted the project's own rendering rule. `solar-cli simulate` (or the
            # in-browser WASM engine) is the real transport run.
            "math_basis": "static bipolar active-region field painting (illustrative fixture; the flux-transport engine lives in solar-core / solar-cli simulate)",
            "rendering_rule": "UI renders immutable state snapshots and does not own the physics model",
        },
        "run": {
            "seed": seed,
            "steps": 0,
            "dt_hours": 0.0,
            "activity_index": activity_index,
            "time_seconds": 0.0,
            "mode": "SyntheticFixture",
        },
        "coordinates": {
            "frame": "heliographic_carrington",
            "longitude_positive": "west",
            "latitude_type": "heliographic",
            "reference_epoch_jd_tt": 2451545.0,
            "central_meridian_longitude_deg": 0.0,
            "rotation_reference_deg_per_day": 14.1844,
            "observer": "sun_center",
        },
        "grid": {
            "lon_count": lon_count,
            "lat_count": lat_count,
            "dlon_deg": round(360.0 / lon_count, 6),
            "dlat_deg": round(180.0 / lat_count, 6),
            "storage_order": "lat_major_lon_contiguous",
            "index_formula": "lat_i * lon_count + lon_i",
        },
        "layers": [
            {"id": "br_normalized", "label": "Radial magnetic field", "kind": "synthetic", "units": "normalized magnetic field"},
            {"id": "continuum_proxy", "label": "Continuum brightness proxy", "kind": "inferred", "units": "relative intensity"},
            {"id": "confidence", "label": "Model confidence", "kind": "inferred", "units": "0..1"},
            {"id": "active_regions", "label": "Active region births", "kind": "synthetic", "units": "normalized metadata"},
            {"id": "swpc_context", "label": "SWPC solar-wind context", "kind": "observed", "units": "provenance metadata"},
        ],
        "fields": {
            "br_normalized": {"units": "normalized magnetic field", "values": br},
            "br_variance_normalized": {"units": "normalized variance", "values": variance},
            "continuum_proxy": {"units": "relative intensity", "values": continuum},
            "confidence": {"units": "0..1", "values": confidence},
        },
        "active_regions": active_regions,
        "learning": {
            "cycle_stage": "solar maximum",
            "plain_language_insight": insight_from_context(observed_context),
        },
        "observed_context": observed_context,
        "observations": [snapshot_observations],
        "warnings": [
            "Static deterministic fixture in normalized magnetic units (not a flux-transport run).",
            "Coordinates are west-positive heliographic Carrington coordinates.",
            observation_warning(observations),
            *(
                [
                    f"{unattributed_count} of {len(all_frames)} observation frames lacked "
                    "attributable provenance and are not embedded as snapshot evidence "
                    "(they still informed the observed context; see the observations report)."
                ]
                if unattributed_count
                else []
            ),
            *(
                [
                    "Stale cached feeds: "
                    + "; ".join(observed_context.get("stale_feeds", []))
                    + " — 'latest' signals may be out of date."
                ]
                if observed_context.get("stale_feeds")
                else []
            ),
            "Research and learning use only; not operational space-weather forecasting.",
        ],
    }


def hale_polarity(rng: random.Random, hemi: float) -> str:
    """Hale's law: leading polarity is hemisphere-coherent within a cycle (~8% anti-Hale
    exceptions). Mirrors solar-core's synthetic model; a 50/50 coin flip per region
    produced a magnetically impossible Sun."""
    hale = "leading_positive" if hemi > 0.0 else "leading_negative"
    anti = "leading_negative" if hemi > 0.0 else "leading_positive"
    return anti if rng.random() < 0.08 else hale


def build_regions(rng: random.Random, count: int) -> list[dict[str, Any]]:
    regions: list[dict[str, Any]] = []
    for idx in range(count):
        hemi = -1.0 if rng.random() < 0.5 else 1.0
        complexity = 0.35 + 0.65 * rng.random()
        lat = hemi * (10.0 + 18.0 * rng.random())
        lon = 360.0 * rng.random()
        regions.append(
            {
                "id": idx + 1,
                "birth_seconds": 0.0,
                "lat_deg": round(max(-40.0, min(40.0, lat)), 6),
                "lon_deg": round(lon, 6),
                "flux_norm": round(0.45 + 1.1 * rng.random() * (0.75 + complexity), 6),
                "area_msh": round(150.0 + 1800.0 * complexity, 6),
                "tilt_deg": round(hemi * (4.0 + 18.0 * rng.random()), 6),
                "complexity": round(complexity, 6),
                "polarity": hale_polarity(rng, hemi),
                "confidence": 0.65,
            }
        )
    return regions


def build_field(lon_count: int, lat_count: int, regions: list[dict[str, Any]]) -> tuple[list[float], list[float]]:
    br: list[float] = []
    confidence: list[float] = []
    sigma = 2.4
    denom = 2.0 * sigma * sigma
    for lat_i in range(lat_count):
        lat = -90.0 + (lat_i + 0.5) * (180.0 / lat_count)
        for lon_i in range(lon_count):
            lon = (lon_i + 0.5) * (360.0 / lon_count)
            value = 0.0
            conf = 0.22
            for region in regions:
                sep = 3.0 + 5.0 * float(region["complexity"])
                tilt = math.radians(float(region["tilt_deg"]))
                dlat = 0.5 * sep * math.sin(tilt)
                dlon = 0.5 * sep * math.cos(tilt)
                sign = 1.0 if region["polarity"] == "leading_positive" else -1.0
                value += gaussian(lat, lon, float(region["lat_deg"]) + dlat, float(region["lon_deg"]) + dlon, sign * float(region["flux_norm"]), denom)
                value += gaussian(lat, lon, float(region["lat_deg"]) - dlat, float(region["lon_deg"]) - dlon, -sign * float(region["flux_norm"]), denom)
                if abs(lat - float(region["lat_deg"])) < 7.0 and abs(circular_delta(lon, float(region["lon_deg"]))) < 9.0:
                    conf = max(conf, 0.55 + 0.25 * float(region["complexity"]))
            br.append(round(max(-1.25, min(1.25, value)), 6))
            confidence.append(round(min(0.95, conf), 6))
    return br, confidence


def gaussian(lat: float, lon: float, center_lat: float, center_lon: float, amp: float, denom: float) -> float:
    dlat = lat - center_lat
    dlon = circular_delta(lon, center_lon)
    if abs(dlat) > 14.0 or abs(dlon) > 14.0:
        return 0.0
    return amp * math.exp(-((dlat * dlat + dlon * dlon) / denom))


def circular_delta(a: float, b: float) -> float:
    delta = a - b
    while delta > 180.0:
        delta -= 360.0
    while delta < -180.0:
        delta += 360.0
    return delta


def continuum_from_br(value: float) -> float:
    b = abs(value)
    spot = smoothstep(0.30, 1.00, b)
    facula = smoothstep(0.08, 0.35, b) * 0.08
    return round(max(0.05, min(1.25, 1.0 - 0.72 * spot + facula)), 6)


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def build_observation_report(cache_dir: Path | None = None) -> dict[str, Any]:
    mag = read_json_candidate(cache_dir, "rtsw_mag_1m.json", Path("tests/swpc_scn26_21/rtsw_mag_1m_new.json"))
    wind = read_json_candidate(cache_dir, "rtsw_wind_1m.json", Path("tests/swpc_scn26_21/rtsw_wind_1m_new.json"))
    optional_candidates = [read_optional_cache_candidate(cache_dir, source) for source in OPTIONAL_CACHE_SOURCES]
    all_candidates = [mag, wind, *optional_candidates]
    source_mode = "cached" if any(candidate["source_mode"] == "cached" for candidate in all_candidates) else "fixture"
    observed_context = build_observed_context(all_candidates)
    return {
        "schema_version": "observation-frame.v1",
        "generated_by": "tools/generate_fixture_snapshot.py",
        "source_mode": source_mode,
        "adapters": [
            {
                "id": "swpc-rtsw-mag-1m",
                "name": "NOAA/SWPC RTSW magnetometer",
                "url": "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
                "layer_kind": "observed",
                "default_quality": "public real-time solar wind context; preserve source and active flags",
            },
            {
                "id": "swpc-rtsw-wind-1m",
                "name": "NOAA/SWPC RTSW wind",
                "url": "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
                "layer_kind": "observed",
                "default_quality": "public real-time plasma context; preserve source and active flags",
            },
            *[{key: source[key] for key in ("id", "name", "url", "layer_kind", "default_quality")} for source in OPTIONAL_CACHE_SOURCES],
        ],
        "adapter_health": [
            adapter_health("swpc-rtsw-mag-1m", mag),
            adapter_health("swpc-rtsw-wind-1m", wind),
            *[adapter_health(candidate["id"], candidate) for candidate in optional_candidates],
        ],
        "frames": [
            frame_from_row("swpc-rtsw-mag-1m", "observed", mag),
            frame_from_row("swpc-rtsw-wind-1m", "observed", wind),
            *[
                frame_from_row(candidate["id"], candidate["layer_kind"], candidate)
                for candidate in optional_candidates
                if candidate["source_mode"] == "cached"
            ],
        ],
        "observed_context": observed_context,
        "warnings": [observation_warning({"source_mode": source_mode})],
    }


def read_json_fixture(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_json_candidate(cache_dir: Path | None, cache_name: str, fixture_path: Path) -> dict[str, Any]:
    if cache_dir is not None:
        cache_path = cache_dir / cache_name
        if cache_path.is_file():
            data = read_json_fixture(cache_path)
            return {
                "data": data,
                "row": first_row(data),
                "id": cache_name,
                "layer_kind": "observed",
                "source_mode": "cached",
                "local_path": display_path(cache_path),
                "raw_bytes": content_bytes(cache_path),
            }
    data = read_json_fixture(fixture_path)
    return {
        "data": data,
        "row": first_row(data),
        "id": cache_name,
        "layer_kind": "observed",
        "source_mode": "fixture",
        "local_path": display_path(fixture_path),
        "raw_bytes": content_bytes(fixture_path),
    }


def read_optional_cache_candidate(cache_dir: Path | None, source: dict[str, str]) -> dict[str, Any]:
    cache_path = (cache_dir / source["cache_name"]) if cache_dir is not None else Path(source["cache_name"])
    if cache_dir is not None and cache_path.is_file():
        data = read_json_fixture(cache_path)
        source_mode = "cached"
        row = first_row(data)
        raw_bytes = content_bytes(cache_path)
        local_path = display_path(cache_path)
    else:
        data = None
        source_mode = "missing"
        row = {}
        raw_bytes = 0
        local_path = display_path(cache_path) if cache_dir is not None else ""
    return {
        "data": data,
        "row": row,
        "id": source["id"],
        "layer_kind": source["layer_kind"],
        "source_mode": source_mode,
        "local_path": local_path,
        "raw_bytes": raw_bytes,
        "name": source["name"],
        "url": source["url"],
    }


def first_row(value: Any) -> dict[str, Any]:
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return value[0]
    if isinstance(value, dict):
        for candidate in value.values():
            if isinstance(candidate, list) and candidate and isinstance(candidate[0], dict):
                return candidate[0]
        return value
    return {}


def adapter_health(adapter_id: str, candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": adapter_id,
        "state": candidate["source_mode"],
        "local_path": candidate["local_path"],
        "raw_bytes": candidate["raw_bytes"],
        "quality": "source metadata retained; cached data freshness must be evaluated before operational use",
    }


def frame_from_row(frame_id: str, layer_kind: str, candidate: dict[str, Any]) -> dict[str, Any]:
    row = candidate["row"]
    return {
        "id": frame_id,
        "schema_version": "observation-frame.v1",
        "layer_kind": layer_kind,
        "source_mode": candidate["source_mode"],
        "local_path": candidate["local_path"],
        "raw_bytes": candidate["raw_bytes"],
        "provenance": {
            "time_tag": first_non_empty(row, "time_tag", "time", "date", "begin_time", "peak_time", "issue_datetime"),
            "source": row.get("source"),
            "active": row.get("active"),
            "raw_source_metadata": {key: row.get(key) for key in ("source", "active", "satellite", "observatory", "instrument") if key in row},
        },
        "quality_flags": [
            "source metadata retained",
            "schema-era numeric normalization supported",
            "not promoted to operational truth",
        ],
    }


def evaluate_freshness(candidates: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    """Age of each CACHED feed's newest row, with per-feed staleness limits.

    Only cached feeds are evaluated: fixture-mode outputs must stay byte-deterministic
    across runs, and canned fixtures have no meaningful age. The quality flags always
    promised "cached data freshness must be evaluated" — this is the evaluation.
    """
    now = dt.datetime.now(dt.timezone.utc)
    report: dict[str, Any] = {}
    stale: list[str] = []
    for candidate in candidates:
        if candidate.get("source_mode") != "cached":
            continue
        newest: dt.datetime | None = None
        for row in rows(candidate.get("data")):
            parsed = parse_time_tag(row_time(row))
            if parsed is not None and (newest is None or parsed > newest):
                newest = parsed
        if newest is None:
            continue
        age_hours = round((now - newest).total_seconds() / 3600.0, 1)
        limit = FRESHNESS_LIMITS_HOURS.get(candidate["id"], 48.0)
        entry = {
            "latest_time_tag": newest.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "age_hours": age_hours,
            "stale": age_hours > limit,
        }
        report[candidate["id"]] = entry
        if entry["stale"]:
            stale.append(f"{candidate['id']} (newest row {age_hours} h old)")
    return report, stale


def build_observed_context(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {candidate["id"]: candidate for candidate in candidates}
    rtsw_mag = rows(by_id.get("rtsw_mag_1m.json", {}).get("data"))
    rtsw_wind = rows(by_id.get("rtsw_wind_1m.json", {}).get("data"))
    solar_regions = rows(by_id.get("swpc-solar-regions", {}).get("data"))
    sunspots = rows(by_id.get("swpc-sunspot-report", {}).get("data"))
    kp_rows = rows(by_id.get("swpc-planetary-k-index-1m", {}).get("data"))
    f107_rows = rows(by_id.get("swpc-f107-cm-flux", {}).get("data"))
    xray_rows = rows(by_id.get("swpc-goes-xrays-1-day", {}).get("data"))
    xray_flares = rows(by_id.get("swpc-goes-xray-flares-7-day", {}).get("data"))
    cycle_rows = rows(by_id.get("swpc-observed-cycle-indices", {}).get("data"))
    region_count = len(solar_regions)
    sunspot_count = len(sunspots)
    flare_count = len(xray_flares)
    latest_direct_f107 = latest_numeric(f107_rows, "flux")
    latest_f107 = latest_direct_f107
    if latest_f107 is None:
        latest_f107 = latest_numeric(cycle_rows, "f10.7", "f10_7", "observed_f10.7", "f107")
    latest_kp = latest_numeric(kp_rows, "estimated_kp", "kp_index")
    latest_xray_flux = latest_numeric(xray_rows, "flux", "observed_flux")
    latest_wind_speed = latest_numeric(rtsw_wind, "speed", "bulk_speed", "proton_speed", "velocity")
    latest_bz = latest_numeric(rtsw_mag, "bz_gsm", "bz", "bzgsm")

    proxies = []
    if region_count:
        proxies.append(clamp_float(region_count / 14.0, 0.25, 1.0))
    if sunspot_count:
        proxies.append(clamp_float(sunspot_count / 18.0, 0.25, 1.0))
    if flare_count:
        proxies.append(clamp_float(0.45 + flare_count / 24.0, 0.25, 1.0))
    if latest_f107 is not None:
        proxies.append(clamp_float((latest_f107 - 65.0) / 170.0, 0.25, 1.0))
    activity_index = round(sum(proxies) / len(proxies), 6) if proxies else 0.9
    synthetic_region_count = 34 if not proxies else int(round(12 + 26 * activity_index))
    freshness, stale_feeds = evaluate_freshness(candidates)

    return {
        "schema_version": "observed-context.v1",
        "activity_index": activity_index,
        "signal_freshness": freshness,
        "stale_feeds": stale_feeds,
        "activity_proxy_sources": {
            "solar_region_rows": region_count,
            "sunspot_rows": sunspot_count,
            "planetary_k_index_rows": len(kp_rows),
            "f107_cm_flux_rows": len(f107_rows),
            "goes_xrays_1_day_rows": len(xray_rows),
            "goes_xray_flares_7_day_rows": flare_count,
            "latest_f107": latest_f107,
        },
        "space_weather_signals": {
            "latest_kp": latest_kp,
            "latest_f107": latest_f107,
            "latest_goes_xray_flux": latest_xray_flux,
            "latest_solar_wind_speed_km_s": latest_wind_speed,
            "latest_bz_gsm_nt": latest_bz,
            "rtsw_magnetometer_rows": len(rtsw_mag),
            "rtsw_wind_rows": len(rtsw_wind),
        },
        "synthetic_region_count": synthetic_region_count,
        "note": "Observed public context tunes research fixture density only; magnetic fields remain normalized and not operationally calibrated.",
    }


def rows(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for candidate in value.values():
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]
    return []


def latest_numeric(row_values: list[dict[str, Any]], *keys: str) -> float | None:
    """Newest parseable value for any of `keys`.

    SWPC feeds disagree on row order — rtsw_* and f107_cm_flux are NEWEST-first while
    planetary_k_index and the GOES X-ray series are oldest-first — so order by time_tag
    instead of assuming a direction. (Assuming oldest-first shipped a six-week-old F10.7
    labelled "latest" and skewed the derived activity index.) ISO time tags compare
    correctly as strings; rows without a time tag fall back to the old reversed scan.
    """
    stamped = [(tag, row) for row in row_values if (tag := row_time(row)) is not None]
    if stamped:
        ordered = [row for _, row in sorted(stamped, key=lambda pair: pair[0], reverse=True)]
    else:
        ordered = list(reversed(row_values))
    for row in ordered:
        for key in keys:
            if key in row:
                value = numeric(row.get(key))
                if value is not None:
                    return value
    return None


def numeric(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def first_non_empty(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def clamp_float(value: Any, low: float, high: float) -> float:
    parsed = numeric(value)
    if parsed is None:
        parsed = low
    return max(low, min(high, parsed))


def insight_from_context(context: dict[str, Any]) -> str:
    sources = context.get("activity_proxy_sources") or {}
    signals = context.get("space_weather_signals") or {}
    region_rows = int(sources.get("solar_region_rows") or 0)
    flare_rows = int(sources.get("goes_xray_flares_7_day_rows") or 0)
    kp = signals.get("latest_kp")
    f107 = signals.get("latest_f107")
    if region_rows or flare_rows or kp is not None or f107 is not None:
        return (
            f"Daily public context is cached: {region_rows} SWPC region rows, "
            f"{flare_rows} recent GOES flare rows, Kp {format_optional(kp, 1)}, "
            f"and F10.7 {format_optional(f107, 1)} stay separate from the normalized model."
        )
    return "Many active regions are present, so the model shows a busy solar maximum surface while keeping observation provenance separate."


def format_optional(value: Any, digits: int) -> str:
    parsed = numeric(value)
    if parsed is None:
        return "n/a"
    return f"{parsed:.{digits}f}"


def snapshot_source_mode(observations: dict[str, Any]) -> str:
    if observations.get("source_mode") == "cached":
        return "synthetic+cached-observed-context"
    return "synthetic+fixture-observed-context"


def observation_warning(observations: dict[str, Any]) -> str:
    if observations.get("source_mode") == "cached":
        return "SWPC context came from a local public-data cache; freshness must be checked before use."
    return "SWPC records are deterministic fixtures unless a live cache is explicitly generated."


def build_operational_readiness(source_mode: str, observations: dict[str, Any]) -> dict[str, Any]:
    observation_mode = observations.get("source_mode", "none")
    cache_state = "cached" if observation_mode == "cached" else "fixture"
    return {
        "schema_version": "operational-readiness.v1",
        "status": "research_learning_ready",
        "research_learning_ready": True,
        "space_weather_operational": False,
        "data_state": {
            "source_mode": source_mode,
            "observation_mode": observation_mode,
            "cache_state": cache_state,
            "live_data_present": False,
            "daily_cache_present": observation_mode == "cached",
        },
        "gates": [
            {"id": "snapshot_contract", "label": "Versioned snapshot contract present", "passed": True},
            {"id": "coordinate_frame_explicit", "label": "Solar coordinate frame and storage order explicit", "passed": True},
            {"id": "deterministic_replay", "label": "Deterministic fixture replay available", "passed": True},
            {"id": "public_data_provenance", "label": "Public-data provenance retained", "passed": True},
            {"id": "normalized_units_disclosed", "label": "Normalized magnetic units disclosed", "passed": True},
            {"id": "calibrated_physical_units", "label": "Calibrated Gauss/Mx units", "passed": False},
            {"id": "historical_validation", "label": "Historical forecast validation", "passed": False},
            {"id": "swpc_product_comparison", "label": "Comparison against operational SWPC products", "passed": False},
            {"id": "operational_monitoring", "label": "Adapter freshness monitoring and alerting", "passed": False},
        ],
        "blockers": [
            "Calibrated physical magnetic units are not implemented.",
            "No historical validation skill score is present.",
            "No on-call alerting, SLA, or operational authority is configured.",
            "Outputs are not approved for warning, mission safety, or fleet operations.",
        ],
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())
