#!/usr/bin/env python3
"""Validate the v1 Solar Maximum Engine snapshot contract.

Structure is enforced by the shared JSON Schema
(``docs/solar-state-snapshot-v1.schema.json``) via the dependency-free
``jsonschema_min`` validator — the single source of truth every producer (Rust
serializer, in-browser WASM, Python fixtures) must satisfy.

This module adds the cross-field / semantic checks JSON Schema can't express:
grid<->field length agreement, finite (non-NaN) numeric values, the required
operational-readiness gate ids, normalized-unit disclosure, and the nested
observation-frame.v1 shape.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import jsonschema_min

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "docs" / "solar-state-snapshot-v1.schema.json"

ALLOWED_LAYER_KINDS = {"synthetic", "observed", "blended", "inferred", "degraded"}
REQUIRED_FIELDS = {"br_normalized", "continuum_proxy", "confidence"}
# A subset of the gate ids must be PRESENT (JSON Schema enums the allowed ids but
# cannot require an array to contain a specific one).
REQUIRED_GATE_IDS = (
    "snapshot_contract",
    "normalized_units_disclosed",
    "calibrated_physical_units",
    "historical_validation",
)


def finite_number(value: Any) -> bool:
    """A real, finite JSON number. Excludes booleans (isinstance(True, int) is True in
    Python) and NaN/Infinity (which json.loads accepts by default but JSON forbids)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def load_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    args = parser.parse_args()

    path = Path(args.snapshot)
    try:
        schema = load_schema()
        data = json.loads(path.read_text(encoding="utf-8"))
        errors = validate(data, schema)
    except Exception as exc:  # noqa: BLE001 - CLI validation should report any parse failure.
        errors = [f"{path}: {exc}"]

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {path} is solar-state-snapshot.v1")
    return 0


def validate(data: Any, schema: dict[str, Any] | None = None) -> list[str]:
    if schema is None:
        schema = load_schema()
    # Structural validation against the shared schema (types, enums, consts,
    # required + additionalProperties). This is where run.mode, gate ids, layer
    # kinds and polarity are now enforced.
    errors = list(jsonschema_min.validate(data, schema))
    errors.extend(semantic_checks(data))
    return errors


def semantic_checks(data: Any) -> list[str]:
    """Cross-field / value checks that JSON Schema (this subset) can't express."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return errors

    if "normalized" not in str(data.get("calibration_state", "")).lower():
        errors.append("calibration_state must disclose normalized units")

    grid = data.get("grid") or {}
    lon_count = grid.get("lon_count")
    lat_count = grid.get("lat_count")
    if (
        isinstance(lon_count, int)
        and not isinstance(lon_count, bool)
        and isinstance(lat_count, int)
        and not isinstance(lat_count, bool)
    ):
        expected_len: int | None = lon_count * lat_count
    else:
        expected_len = None

    fields = data.get("fields") or {}
    for field_id in sorted(REQUIRED_FIELDS):
        values = (fields.get(field_id) or {}).get("values")
        if not isinstance(values, list):
            # The schema already reported the missing/mistyped field.
            continue
        if expected_len is not None and len(values) != expected_len:
            errors.append(f"fields.{field_id}.values length {len(values)} != grid length {expected_len}")
        elif not all(finite_number(value) for value in values):
            errors.append(f"fields.{field_id}.values must be finite numbers (no NaN/Infinity/booleans)")

    readiness = data.get("operational_readiness")
    if isinstance(readiness, dict):
        gates = readiness.get("gates")
        if isinstance(gates, list):
            gate_ids = {gate.get("id") for gate in gates if isinstance(gate, dict)}
            for required in REQUIRED_GATE_IDS:
                if required not in gate_ids:
                    errors.append(f"operational_readiness.gates missing {required}")

    observations = data.get("observations")
    if isinstance(observations, list):
        for idx, observation in enumerate(observations):
            errors.extend(validate_observation_report(idx, observation))

    return errors


def validate_observation_report(index: int, value: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return [f"observations[{index}] must be an object"]
    if value.get("schema_version") != "observation-frame.v1":
        errors.append(f"observations[{index}].schema_version must be observation-frame.v1")
    if not value.get("source_mode"):
        errors.append(f"observations[{index}].source_mode is required")
    frames = value.get("frames")
    if not isinstance(frames, list):
        errors.append(f"observations[{index}].frames must be a list")
        return errors
    for frame_index, frame in enumerate(frames):
        if not isinstance(frame, dict):
            errors.append(f"observations[{index}].frames[{frame_index}] must be an object")
            continue
        if frame.get("layer_kind") not in ALLOWED_LAYER_KINDS:
            errors.append(f"observations[{index}].frames[{frame_index}].layer_kind is invalid")
        if not frame.get("source_mode"):
            errors.append(f"observations[{index}].frames[{frame_index}].source_mode is required")
        provenance = frame.get("provenance")
        if not isinstance(provenance, dict):
            errors.append(f"observations[{index}].frames[{frame_index}].provenance must be an object")
        else:
            if "source" not in provenance:
                errors.append(f"observations[{index}].frames[{frame_index}].provenance.source is required")
            if "active" not in provenance:
                errors.append(f"observations[{index}].frames[{frame_index}].provenance.active is required")
            if not isinstance(provenance.get("raw_source_metadata"), dict):
                errors.append(f"observations[{index}].frames[{frame_index}].provenance.raw_source_metadata must be an object")
        quality_flags = frame.get("quality_flags")
        if not isinstance(quality_flags, list) or not quality_flags:
            errors.append(f"observations[{index}].frames[{frame_index}].quality_flags must be non-empty")
    return errors


if __name__ == "__main__":
    raise SystemExit(main())
