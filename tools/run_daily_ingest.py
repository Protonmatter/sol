#!/usr/bin/env python3
"""Run one daily Solar Maximum Engine research-ingest cycle.

Each attempt captures immutable source bytes, stages a complete derived bundle,
validates the research contract, then selects apps/web/data/current.json once.
Pre-selection failures preserve the pointer; post-replacement uncertainty is explicit.
No publication or remote git action.
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger("run_daily_ingest")
REPO_ROOT = Path(__file__).resolve().parents[1]


def derive_bundle(source, output_root: Path, *, bundle_id: str, generated_at_utc: str, seed: int,
                  series_root: Path | None = None, stage_hook=None):
    """Generate from pinned source bytes and select only one fully validated result."""
    import data_bundles as bundles
    import generate_fixture_snapshot as generator
    try:
        observations = generator.build_bundle_observation_report(source, evaluated_at_utc=generated_at_utc)
        snapshot = generator.build_snapshot(seed, 72, 36, observations)
        source_manifest = bundles.loads_strict(source.manifest_raw.decode())
        products = source_manifest["products"]
        times = [p["observation_time_utc"] for p in products if p["observation_time_utc"] is not None]
        degraded = bool(source_manifest["failures"]) or any(p["origin"] != "current-fetch" or p["failure"] is not None for p in products)
        now = datetime.fromisoformat(generated_at_utc.replace("Z", "+00:00"))
        status = {"schema_version":"daily-ingest-status.v2", "bundle_id":bundle_id,"source_bundle_id":source.bundle_id,
                  "status":"degraded" if degraded else "ok", "generated_at_utc":generated_at_utc,
                  "observation_time_utc":max(times,key=lambda t:datetime.fromisoformat(t.replace("Z","+00:00"))) if times else None,"delivery_state":"validated",
                  "last_run_utc":generated_at_utc,"next_recommended_run_utc":(now+timedelta(days=1)).isoformat(),
                  "sources":[{"file":p["product_id"],"source":p["source"],"ok":p["failure"] is None,"origin":p["origin"],
                              "observation_time_utc":p["observation_time_utc"],"retrieved_at_utc":p["retrieved_at_utc"]} for p in products],
                  "warnings":["Local generation and validation are not approval, merge, deployment or served verification.",
                              "Research/learning only; no operational forecasting."]}
        components = {"snapshot":("snapshot.json","solar-state-snapshot.v3",bundles.json_bytes(snapshot)),
                      "observations":("observations.json","observation-frame.v1",bundles.json_bytes(observations)),
                      "feed_status":("feed-status.json","daily-ingest-status.v2",bundles.json_bytes(status))}
        # Explicit local migration inputs for idealized cycle data, captured once.
        series_root = series_root or REPO_ROOT / "apps/web/data/series"
        series_raw = bundles.read_bytes(series_root / "manifest.json")
        series = bundles.loads_strict(series_raw.decode("utf-8"))
        components["series_manifest"]=("series/manifest.json","series-manifest.v1",series_raw)
        for index, entry in enumerate(series["frames"]):
            if entry.get("availability") != "unavailable":
                components[f"series_frame:{index}"]=("series/"+entry["file"],"solar-state-snapshot.v3",bundles.read_bytes(bundles.safe_path(series_root,entry["file"])))
        return bundles.create_derived_bundle(output_root,bundle_id=bundle_id,source=source,
            generated_at_utc=generated_at_utc,components=components,stage_hook=stage_hook)
    except BaseException as exc:
        bundles._write_new(output_root / "attempts" / (uuid.uuid4().hex+".json"),bundles.json_bytes({
            "bundle_id":bundle_id,**bundles.failure_outcome(exc,status="derivation-failed")}))
        raise




def main() -> int:
    import data_bundles as bundles
    import fetch_public_data as acquisition
    parser = argparse.ArgumentParser(description="Stage and atomically select one validated research bundle.")
    parser.add_argument("--cache", default=".cache/solar-data")
    parser.add_argument("--web-data", default="apps/web/data")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--include-jpl", action="store_true")
    parser.add_argument("--date")
    parser.add_argument("--skip-fetch", action="store_true")
    parser.add_argument("--migrate-v1", action="store_true", help="Explicit read-only inventory of the original cache manifest.")
    parser.add_argument("--no-archive-history", action="store_true", help="Compatibility flag; immutable bundles are always retained.")
    parser.add_argument("--timeout-seconds", type=int, default=20)
    parser.add_argument("--fail-on-degraded", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    def under_root(value):
        path = Path(value)
        return path if path.is_absolute() else REPO_ROOT / path
    cache, output = under_root(args.cache), under_root(args.web_data)
    now = datetime.now(UTC)
    identity = now.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:12]
    try:
        if args.migrate_v1:
            if not args.skip_fetch:
                raise ValueError("--migrate-v1 requires --skip-fetch; migration never fetches")
            source = bundles.create_source_bundle(cache, bundle_id="source-" + identity,
                acquired_at_utc=now.isoformat(), products=bundles.inventory_legacy_cache(cache))
        elif args.skip_fetch:
            source = bundles.resolve_source_bundle(cache / "current.json")
        else:
            source = acquisition.acquire_bundle(cache, bundle_id="source-" + identity,
                acquired_at_utc=now.isoformat(), stamp=acquisition.parse_date(args.date) if args.date else now.date(),
                include_jpl=args.include_jpl, timeout_seconds=args.timeout_seconds)
        source_manifest = bundles.loads_strict(source.manifest_raw.decode())
        products = source_manifest["products"]
        if args.fail_on_degraded and (source_manifest["failures"] or any(p["origin"] != "current-fetch" or p["failure"] for p in products)):
            raise ValueError("degraded source bundle withheld; last derived pointer unchanged")
        result = derive_bundle(source, output, bundle_id="research-" + identity,
            generated_at_utc=now.isoformat(), seed=args.seed)
        LOGGER.info("validated bundle=%s source_bundle=%s; not published", result.bundle_id, source.bundle_id)
        return 0
    except (ValueError, OSError, RuntimeError) as exc:
        bundles._write_new(output / "attempts" / (uuid.uuid4().hex + ".json"),
            bundles.json_bytes(bundles.failure_outcome(exc)))
        if isinstance(exc,bundles.CommittedSelectionError):
            LOGGER.error("ingest selection committed but completion uncertain: %s; no rollback attempted",exc)
        else:
            LOGGER.error("ingest failed before derived selection completed: %s; inspect attempt evidence",exc)
        return 1




if __name__ == "__main__":
    raise SystemExit(main())
