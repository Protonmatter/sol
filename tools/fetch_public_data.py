#!/usr/bin/env python3
"""Fetch bounded public solar context into a local cache.

The simulator and tests can run without this script. Use it for research
ingest runs that need current public NOAA/SWPC, Helioviewer, and optional
JPL Horizons context. The script writes latest files plus an optional daily
history copy and a manifest with provenance, timestamps, and quality flags.
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
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

TIMEOUT_SECONDS = 20
USER_AGENT = "solar-maximum-engine/0.1.3 research-learning-daily-ingest"
LOGGER = logging.getLogger("fetch_public_data")


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

    manifest = fetch_cache(
        cache=cache,
        include_jpl=args.include_jpl,
        archive_history=args.archive_history,
        stamp=stamp,
        timeout_seconds=args.timeout_seconds,
    )
    manifest_path = cache / "manifest.json"
    write_json(manifest_path, manifest)
    if args.manifest_out:
        write_json(Path(args.manifest_out), manifest)
    LOGGER.info("wrote cache=%s", cache)
    LOGGER.info("manifest=%s status=%s", manifest_path, manifest["status"])
    return 0 if not manifest["critical_failures"] else 1


def fetch_cache(
    *,
    cache: Path,
    include_jpl: bool,
    archive_history: bool,
    stamp: date,
    timeout_seconds: int = TIMEOUT_SECONDS,
) -> dict[str, Any]:
    fetched_at = datetime.now(UTC)
    history_dir = cache / "history" / stamp.isoformat()
    if archive_history:
        history_dir.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, Any]] = []
    for endpoint in build_endpoints(include_jpl=include_jpl, start_date=stamp):
        target = cache / endpoint.file
        record = {
            **asdict(endpoint),
            "ok": False,
            "bytes": 0,
            "fetched_at_utc": fetched_at.isoformat(),
            "local_path": str(target),
            "history_path": str(history_dir / endpoint.file) if archive_history else None,
            "error": None,
            "quality_flags": [
                endpoint.quality_note,
                "public online source",
                "not promoted to operational truth",
            ],
        }
        try:
            raw = fetch(endpoint.url, timeout_seconds=timeout_seconds)
            atomic_write_bytes(target, raw)
            if archive_history:
                shutil.copy2(target, history_dir / endpoint.file)
            record["ok"] = True
            record["bytes"] = len(raw)
        except Exception as exc:  # noqa: BLE001 - external fetch failures must be recorded.
            record["error"] = str(exc)
            LOGGER.warning("%s fetch failed: %s", endpoint.file, exc)
        records.append(record)
        time.sleep(0.2)

    critical_failures = [item["file"] for item in records if item["critical"] and not item["ok"]]
    failed = [item["file"] for item in records if not item["ok"]]
    status = "ok" if not failed else "degraded"
    if critical_failures:
        status = "failed"
    return {
        "schema_version": "public-data-cache-manifest.v1",
        "generated_by": "tools/fetch_public_data.py",
        "fetched_at_utc": fetched_at.isoformat(),
        "history_date": stamp.isoformat(),
        "cache_dir": str(cache),
        "history_dir": str(history_dir) if archive_history else None,
        "include_jpl": include_jpl,
        "status": status,
        "critical_failures": critical_failures,
        "failed": failed,
        "fetched": records,
    }


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


def fetch(url: str, *, timeout_seconds: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return response.read()


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
