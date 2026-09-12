#!/usr/bin/env python3
"""Fetch bounded public solar context into a local cache.

The simulator and tests can run without this script. Use it for research
ingest runs that need current public NOAA/SWPC, Helioviewer, and optional
JPL Horizons context. It stages immutable source bundles with provenance,
timestamps and quality flags, then selects one manifest pointer. No latest aliases.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

TIMEOUT_SECONDS = 20
USER_AGENT = "solar-maximum-engine/0.1.3 research-learning-daily-ingest"
LOGGER = logging.getLogger("fetch_public_data")
REPO_ROOT = Path(__file__).resolve().parents[1]


def acquire_bundle(cache: Path, *, bundle_id: str, stamp: date, acquired_at_utc: str,
                   include_jpl: bool = False, timeout_seconds: int = TIMEOUT_SECONDS):
    """One bounded acquisition, with explicit attributable fallback; no aliases."""
    import data_bundles as bundles
    previous = bundles.resolve_source_bundle(cache / "current.json") if (cache / "current.json").exists() else None
    previous_products = {p["product_id"]:p for p in bundles.loads_strict(previous.manifest_raw.decode())["products"]} if previous else {}
    products, failures = [], []
    try:
        for endpoint in build_endpoints(include_jpl=include_jpl, start_date=stamp):
            failure = None
            try:
                raw = fetch(endpoint.url, timeout_seconds=timeout_seconds)
                validate_payload(endpoint.file, raw)
            except Exception as exc:
                failure = type(exc).__name__
                failures.append({"product_id":endpoint.file,"critical":endpoint.critical,"error_type":failure})
                if endpoint.file not in previous_products:
                    if endpoint.critical: raise ValueError("critical fetch failed without attributable fallback: " + endpoint.file) from exc
                    # Record unavailable optional input separately, not as a fabricated payload.
                    bundles._write_new(cache / "attempts" / (uuid.uuid4().hex + ".json"), bundles.json_bytes({"product_id":endpoint.file,"status":"unavailable","error_type":failure}))
                    continue
                old = previous_products[endpoint.file]
                products.append({**{k:v for k,v in old.items() if k not in ("path","size_bytes","sha256")},
                                 "origin":"fixture" if old["origin"] == "fixture" else "cached-fallback", "failure":failure, "payload":previous.component(endpoint.file).raw,
                                 "quality":[*old["quality"], "current fetch failed; original payload timestamps retained"]})
                continue
            data = bundles.loads_strict(raw.decode("utf-8"))
            # Only explicit UTC instants in source rows qualify; never infer from fetch time.
            times = []
            for row in data if isinstance(data,list) else [data]:
                if isinstance(row,dict):
                    value = row.get("time_tag") or row.get("time")
                    try: bundles.timestamp(value)
                    except ValueError: continue
                    times.append(value)
            products.append({"product_id":endpoint.file,"source":endpoint.source,"origin":"current-fetch",
                             "observation_time_utc":max(times,key=lambda t:datetime.fromisoformat(t.replace("Z","+00:00"))) if times else None,"retrieved_at_utc":acquired_at_utc,
                             "quality":[endpoint.quality_note,"not operational truth"],"failure":failure,
                             "license":"public upstream source; original source terms apply", "critical":endpoint.critical,"payload":raw})
        return bundles.create_source_bundle(cache,bundle_id=bundle_id,acquired_at_utc=acquired_at_utc,products=products,failures=failures)
    except BaseException as exc:
        bundles._write_new(cache / "attempts" / (uuid.uuid4().hex + ".json"), bundles.json_bytes({"bundle_id":bundle_id,**bundles.failure_outcome(exc)}))
        raise


def display_path(path: Path) -> str:
    """Repo-relative POSIX path (or basename outside the repo) for manifest records that
    end up committed/deployed via feed-status.json — never absolute local paths."""
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except (ValueError, OSError):
        return path.name


@dataclass(frozen=True)
class Endpoint:
    file: str
    url: str
    source: str
    cadence: str
    layer_kind: str
    critical: bool
    quality_note: str


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", default=".cache/solar-data")
    parser.add_argument("--include-jpl", action="store_true")
    parser.add_argument("--archive-history", action="store_true")
    parser.add_argument("--date", help="UTC date stamp for history folders, YYYY-MM-DD. Defaults to today.")
    parser.add_argument("--manifest-out", help="Optional second path for the generated manifest JSON.")
    parser.add_argument("--timeout-seconds", type=int, default=TIMEOUT_SECONDS)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    stamp = parse_date(args.date) if args.date else datetime.now(UTC).date()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)

    bundle = acquire_bundle(cache, bundle_id="source-" + datetime.now(UTC).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:12],
                            acquired_at_utc=datetime.now(UTC).isoformat(), stamp=stamp,
                            include_jpl=args.include_jpl, timeout_seconds=args.timeout_seconds)
    if args.manifest_out:
        # Explicit export is historical evidence only, never current reader authority.
        write_json(Path(args.manifest_out), json.loads(bundle.manifest_raw))
    LOGGER.info("selected immutable source bundle=%s", bundle.bundle_id)
    return 0




def build_endpoints(*, include_jpl: bool, start_date: date) -> list[Endpoint]:
    endpoints = [
        Endpoint(
            file="rtsw_mag_1m.json",
            url="https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
            source="NOAA/SWPC RTSW magnetometer",
            cadence="1 minute",
            layer_kind="observed",
            critical=True,
            quality_note="Real-time solar wind magnetic-field context; retain source and active flags.",
        ),
        Endpoint(
            file="rtsw_wind_1m.json",
            url="https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
            source="NOAA/SWPC RTSW wind",
            cadence="1 minute",
            layer_kind="observed",
            critical=True,
            quality_note="Real-time plasma context; retain source and active flags.",
        ),
        Endpoint(
            file="rtsw_ephemerides_1h.json",
            url="https://services.swpc.noaa.gov/json/rtsw/rtsw_ephemerides_1h.json",
            source="NOAA/SWPC RTSW ephemerides",
            cadence="1 hour",
            layer_kind="observed",
            critical=False,
            quality_note="Observer/satellite context for RTSW measurements.",
        ),
        Endpoint(
            file="observed-solar-cycle-indices.json",
            url="https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json",
            source="NOAA/SWPC observed solar-cycle indices",
            cadence="monthly",
            layer_kind="observed",
            critical=False,
            quality_note="Solar-cycle context for research trend displays.",
        ),
        Endpoint(
            file="predicted-solar-cycle.json",
            url="https://services.swpc.noaa.gov/json/solar-cycle/predicted-solar-cycle.json",
            source="NOAA/SWPC predicted solar-cycle progression",
            cadence="monthly",
            layer_kind="observed",
            critical=False,
            quality_note="Public NOAA cycle progression context; not an internal forecast model.",
        ),
        Endpoint(
            file="solar_regions.json",
            url="https://services.swpc.noaa.gov/json/solar_regions.json",
            source="NOAA/SWPC solar regions",
            cadence="daily",
            layer_kind="observed",
            critical=False,
            quality_note="Daily active-region context for research model inputs.",
        ),
        Endpoint(
            file="sunspot_report.json",
            url="https://services.swpc.noaa.gov/json/sunspot_report.json",
            source="NOAA/SWPC sunspot report",
            cadence="daily",
            layer_kind="observed",
            critical=False,
            quality_note="Daily sunspot context for cycle-stage teaching displays.",
        ),
        Endpoint(
            file="planetary_k_index_1m.json",
            url="https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
            source="NOAA/SWPC planetary K index",
            cadence="1 minute",
            layer_kind="observed",
            critical=False,
            quality_note="Kp context for impact-learning panels; not an alerting source in this app.",
        ),
        Endpoint(
            file="f107_cm_flux.json",
            url="https://services.swpc.noaa.gov/json/f107_cm_flux.json",
            source="NOAA/SWPC F10.7 cm radio flux",
            cadence="daily",
            layer_kind="observed",
            critical=False,
            quality_note="F10.7 solar-radio proxy context for cycle and impact-learning displays.",
        ),
        Endpoint(
            file="goes_xrays_1_day.json",
            url="https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
            source="NOAA/SWPC GOES primary X-ray flux",
            cadence="1 minute",
            layer_kind="observed",
            critical=False,
            quality_note="GOES XRS context for flare activity research displays.",
        ),
        Endpoint(
            file="goes_xray_flares_7_day.json",
            url="https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json",
            source="NOAA/SWPC GOES X-ray flare events",
            cadence="event",
            layer_kind="observed",
            critical=False,
            quality_note="Recent flare-event context; do not infer warnings from this app.",
        ),
        Endpoint(
            file="helioviewer_datasources.json",
            url="https://api.helioviewer.org/v2/getDataSources/",
            source="Helioviewer API data-source metadata",
            cadence="daily metadata",
            layer_kind="observed",
            critical=False,
            quality_note="Quicklook source metadata for future image overlays; not calibrated FITS analysis.",
        ),
    ]
    if include_jpl:
        endpoints.append(
            Endpoint(
                file="jpl_horizons_sun_earth.json",
                url=horizons_url(start_date),
                source="JPL Horizons Sun/Earth observer geometry",
                cadence="daily",
                layer_kind="inferred",
                critical=False,
                quality_note="Observer geometry context; not a solar magnetic model.",
            )
        )
    return endpoints


def fetch(url: str, *, timeout_seconds: int, attempts: int = 3) -> bytes:
    """Fetch with small retries — one transient blip on a critical feed used to fail the
    whole daily run on the first and only attempt."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                from data_bundles import LIMIT
                raw = response.read(LIMIT + 1)
                if len(raw) > LIMIT: raise ValueError("source response exceeds 16 MiB limit")
                return raw
        except Exception as exc:  # noqa: BLE001 - retried, then recorded by the caller.
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(1.0 * (attempt + 1))
    raise last_error if last_error is not None else RuntimeError(f"fetch failed: {url}")


def validate_payload(file_name: str, raw: bytes) -> None:
    """Refuse to poison the cache with a non-JSON body served under HTTP 200 (SWPC
    maintenance pages do this) — the old code cached it, recorded ok=true, and the
    failure surfaced later as a confusing parse error in the fixture generator."""
    if file_name.endswith(".json"):
        from data_bundles import loads_strict, LIMIT
        if len(raw) > LIMIT: raise ValueError("source payload exceeds size limit")
        value = loads_strict(raw.decode("utf-8"))
        if not isinstance(value, (dict,list)) or not value: raise ValueError("source JSON must be nonempty")


def horizons_url(start: date) -> str:
    stop = start + timedelta(days=1)
    params = {
        "format": "json",
        "COMMAND": "10",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "500@399",
        "START_TIME": start.strftime("%Y-%b-%d"),
        "STOP_TIME": stop.strftime("%Y-%b-%d"),
        "STEP_SIZE": "1 d",
        "QUANTITIES": "4,20",
    }
    return "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def atomic_write_bytes(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp") as handle:
        tmp = Path(handle.name)
        handle.write(raw)
    tmp.replace(path)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=str(path.parent), encoding="utf-8", newline="\n", prefix=f".{path.name}.", suffix=".tmp") as handle:
        tmp = Path(handle.name)
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
    tmp.replace(path)


if __name__ == "__main__":
    raise SystemExit(main())
