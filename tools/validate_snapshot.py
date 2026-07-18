#!/usr/bin/env python3
"""Validate solar-state-snapshot.v2 structure and semantic invariants."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import jsonschema_min
from snapshot_semantics import semantic_checks

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "docs" / "solar-state-snapshot-v2.schema.json"


def load_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def reject_non_json_number(value: str) -> None:
    raise ValueError(f"non-JSON numeric constant {value}")


def validate(data: Any, schema: dict[str, Any] | None = None) -> list[str]:
    if schema is None:
        schema = load_schema()
    return [*jsonschema_min.validate(data, schema), *semantic_checks(data)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    args = parser.parse_args()

    path = Path(args.snapshot)
    try:
        data = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=reject_non_json_number,
        )
        errors = validate(data)
    except Exception as exc:  # noqa: BLE001
        errors = [f"{path}: {exc}"]

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {path} is solar-state-snapshot.v2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
