#!/usr/bin/env python3
"""Validate live solar-state-snapshot.v3 structure and semantic invariants."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import jsonschema_min
from snapshot_semantics import semantic_checks

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "docs" / "solar-state-snapshot-v3.schema.json"
ACTIVE_REGION_LIFETIME_SECONDS = 14.0 * 86400.0


def load_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def reject_non_json_number(value: str) -> None:
    raise ValueError(f"non-JSON numeric constant {value}")


def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate object key {key!r}")
        result[key] = value
    return result


def finite_float(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise ValueError(f"nonfinite JSON number {text}")
    return value


def loads_strict(text: str) -> Any:
    return json.loads(text, parse_constant=reject_non_json_number,
                      parse_float=finite_float, object_pairs_hook=reject_duplicate_keys)


def validate(data: Any, schema: dict[str, Any] | None = None) -> list[str]:
    if schema is None:
        schema = load_schema()
    errors = jsonschema_min.validate(data, schema)
    # Cross-field checks require the schema's object/array shapes first.
    if errors:
        return errors
    errors = semantic_checks(data)
    return errors if errors else live_admission_checks(data)


def live_admission_checks(data: dict[str, Any]) -> list[str]:
    """Checks tied to producer lifecycle and evidence-bearing live run modes."""
    errors: list[str] = []
    run = data["run"]
    for index, region in enumerate(data["active_regions"]):
        age_seconds = run["time_seconds"] - region["birth"]["time_seconds"]
        if age_seconds > ACTIVE_REGION_LIFETIME_SECONDS:
            errors.append(f"active_regions[{index}] age exceeds active-region lifetime")

    attached_frames = sum(len(report["frames"]) for report in data["observations"])
    if run["mode"] == "Assimilation" and attached_frames == 0:
        errors.append("run.mode Assimilation requires an attributable attached observation frame")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    args = parser.parse_args()

    path = Path(args.snapshot)
    try:
        data = loads_strict(path.read_text(encoding="utf-8"))
        errors = validate(data)
    except Exception as exc:  # noqa: BLE001
        errors = [f"{path}: {exc}"]

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {path} is solar-state-snapshot.v3")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
