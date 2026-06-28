#!/usr/bin/env python3
"""Run one daily Solar Maximum Engine research-ingest cycle.

This script is idempotent and safe to schedule. It fetches bounded public data
into the local cache, regenerates the web snapshot from that cache, validates
the research contract, and writes apps/web/data/feed-status.json.
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger("run_daily_ingest")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", default=".cache/solar-data")
    parser.add_argument("--web-data", default="apps/web/data")
    parser.add_argument("--snapshot", default="apps/web/data/latest-state.json")
    parser.add_argument("--observations-out", default="apps/web/data/latest-observations.json")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--include-jpl", action="store_true")
    parser.add_argument("--date", help="UTC date stamp for history folders, YYYY-MM-DD. Defaults to today.")
    parser.add_argument("--skip-fetch", action="store_true", help="Use the existing cache without network calls.")
    parser.add_argument("--no-archive-history", action="store_true")
    parser.add_argument("--timeout-seconds", type=int, default=20)
    parser.add_argument("--fail-on-degraded", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    root = Path.cwd()
    cache = Path(args.cache)
    web_data = Path(args.web_data)
    snapshot = Path(args.snapshot)
    observations = Path(args.observations_out)
    status_path = web_data / "feed-status.json"
    fetched_at = datetime.now(UTC)

    commands: list[dict[str, Any]] = []
    cache_manifest: dict[str, Any] | None = None
    fetch_exit = 0

    try:
        if args.skip_fetch:
            cache_manifest = read_json(cache / "manifest.json")
            commands.append({"name": "fetch_public_data", "skipped": True, "reason": "skip-fetch"})
        else:
            fetch_cmd = [
                sys.executable,
                str(root / "tools" / "fetch_public_data.py"),
                "--cache",
                str(cache),
                "--timeout-seconds",
                str(args.timeout_seconds),
            ]
            if not args.no_archive_history:
                fetch_cmd.append("--archive-history")
            if args.include_jpl:
                fetch_cmd.append("--include-jpl")
            if args.date:
                fetch_cmd.extend(["--date", args.date])
            fetch_result = run_command("fetch_public_data", fetch_cmd)
            commands.append(fetch_result)
            fetch_exit = int(fetch_result["exit_code"])
            cache_manifest = read_json(cache / "manifest.json")

        generate_cmd = [
            sys.executable,
            str(root / "tools" / "generate_fixture_snapshot.py"),
            "--cache",
            str(cache),
            "--out",
            str(snapshot),
            "--observations-out",
            str(observations),
            "--seed",
            str(args.seed),
        ]
        commands.append(run_command("generate_fixture_snapshot", generate_cmd))

        validation_commands = [
            ("validate_snapshot", [sys.executable, str(root / "tools" / "validate_snapshot.py"), str(snapshot)]),
            ("validate_operational_readiness", [sys.executable, str(root / "tools" / "validate_operational_readiness.py"), str(snapshot)]),
            ("validate_web_static", [sys.executable, str(root / "tools" / "validate_web_static.py"), "--root", "apps/web"]),
        ]
        for name, command in validation_commands:
            commands.append(run_command(name, command))
    finally:
        status = build_status(
            fetched_at=fetched_at,
            cache=cache,
            snapshot=snapshot,
            observations=observations,
            cache_manifest=cache_manifest,
            commands=commands,
            fetch_exit=fetch_exit,
        )
        write_json(status_path, status)
        LOGGER.info("wrote feed status=%s status=%s", status_path, status["status"])

    status = read_json(status_path)
    if status["status"] == "failed":
        return 1
    if args.fail_on_degraded and status["status"] == "degraded":
        return 1
    return 0


def run_command(name: str, command: list[str]) -> dict[str, Any]:
    LOGGER.info("running %s", name)
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return {
        "name": name,
        "command": command,
        "exit_code": completed.returncode,
        "stdout_tail": tail(completed.stdout),
        "stderr_tail": tail(completed.stderr),
    }


def build_status(
    *,
    fetched_at: datetime,
    cache: Path,
    snapshot: Path,
    observations: Path,
    cache_manifest: dict[str, Any] | None,
    commands: list[dict[str, Any]],
    fetch_exit: int,
) -> dict[str, Any]:
    command_failures = [item["name"] for item in commands if item.get("exit_code", 0) != 0 and item.get("name") != "fetch_public_data"]
    fetch_manifest_status = (cache_manifest or {}).get("status", "missing")
    critical_failures = list((cache_manifest or {}).get("critical_failures") or [])
    optional_failures = [
        item.get("file")
        for item in (cache_manifest or {}).get("fetched", [])
        if isinstance(item, dict) and not item.get("ok") and not item.get("critical")
    ]

    status = "ok"
    if optional_failures or fetch_manifest_status == "degraded":
        status = "degraded"
    if fetch_exit != 0 or critical_failures or command_failures:
        status = "failed"

    next_run = fetched_at + timedelta(days=1)
    warnings: list[str] = []
    if optional_failures:
        warnings.append(f"Optional sources failed: {', '.join(str(item) for item in optional_failures)}")
    if critical_failures:
        warnings.append(f"Critical sources failed: {', '.join(str(item) for item in critical_failures)}")
    warnings.append("Research/learning ingest only; not operational space-weather forecasting.")

    return {
        "schema_version": "daily-ingest-status.v1",
        "generated_by": "tools/run_daily_ingest.py",
        "status": status,
        "last_run_utc": fetched_at.isoformat(),
        "next_recommended_run_utc": next_run.isoformat(),
        "cache_dir": str(cache),
        "snapshot": str(snapshot),
        "observations": str(observations),
        "cache_manifest_status": fetch_manifest_status,
        "critical_failures": critical_failures,
        "optional_failures": optional_failures,
        "sources": (cache_manifest or {}).get("fetched", []),
        "commands": commands,
        "warnings": warnings,
    }


def tail(value: str, limit: int = 2000) -> str:
    if len(value) <= limit:
        return value
    return value[-limit:]


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=str(path.parent), encoding="utf-8", newline="\n", prefix=f".{path.name}.", suffix=".tmp") as handle:
        tmp = Path(handle.name)
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
    tmp.replace(path)


if __name__ == "__main__":
    raise SystemExit(main())
