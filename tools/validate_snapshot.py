#!/usr/bin/env python3
"""Validate the v1 Solar Maximum Engine snapshot contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ALLOWED_LAYER_KINDS = {"synthetic", "observed", "blended", "inferred", "degraded"}
REQUIRED_FIELDS = {"br_normalized", "continuum_proxy", "confidence"}
REQUIRED_TOP_LEVEL = {
    "schema_version",
    "model_version",
    "source_mode",
    "operational_use",
    "calibration_state",
    "operational_readiness",
    "manifest",
    "run",
    "grid",
    "layers",
    "fields",
    "active_regions",
    "learning",
    "observations",
    "warnings",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    args = parser.parse_args()

    path = Path(args.snapshot)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        errors = validate(data)
    except Exception as exc:  # noqa: BLE001 - CLI validation should report any parse failure.
        errors = [f"{path}: {exc}"]

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {path} is solar-state-snapshot.v1")
    return 0


def validate(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    missing = sorted(REQUIRED_TOP_LEVEL.difference(data))
    if missing:
        errors.append(f"missing top-level fields: {', '.join(missing)}")
    if data.get("schema_version") != "solar-state-snapshot.v1":
        errors.append("schema_version must be solar-state-snapshot.v1")
    if data.get("operational_use") is not False:
        errors.append("operational_use must be false")
    if "normalized" not in str(data.get("calibration_state", "")).lower():
        errors.append("calibration_state must disclose normalized units")
    errors.extend(validate_operational_readiness(data.get("operational_readiness")))

    grid = data.get("grid") or {}
    lon_count = grid.get("lon_count")
    lat_count = grid.get("lat_count")
    if not isinstance(lon_count, int) or not isinstance(lat_count, int):
        errors.append("grid.lon_count and grid.lat_count must be integers")
        expected_len = None
    else:
        expected_len = lon_count * lat_count

    fields = data.get("fields") or {}
    for field_id in REQUIRED_FIELDS:
        values = (fields.get(field_id) or {}).get("values")
        if not isinstance(values, list):
            errors.append(f"fields.{field_id}.values must be a list")
        elif expected_len is not None and len(values) != expected_len:
            errors.append(f"fields.{field_id}.values length {len(values)} != grid length {expected_len}")
        elif not all(isinstance(value, (int, float)) for value in values):
            errors.append(f"fields.{field_id}.values must be numeric")

    for layer in data.get("layers") or []:
        kind = layer.get("kind")
        if kind not in ALLOWED_LAYER_KINDS:
            errors.append(f"layer {layer.get('id')} has invalid kind {kind}")

    observations = data.get("observations")
    if not isinstance(observations, list):
        errors.append("observations must be a list")
    else:
        for idx, observation in enumerate(observations):
            errors.extend(validate_observation_report(idx, observation))

    warnings = data.get("warnings")
    if not isinstance(warnings, list) or not warnings:
        errors.append("warnings must be a non-empty list")

    return errors


def validate_operational_readiness(value: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return ["operational_readiness must be an object"]
    if value.get("schema_version") != "operational-readiness.v1":
        errors.append("operational_readiness.schema_version must be operational-readiness.v1")
    if value.get("space_weather_operational") is not False:
        errors.append("operational_readiness.space_weather_operational must be false until externally validated")
    if value.get("research_learning_ready") is not True:
        errors.append("operational_readiness.research_learning_ready must be true for the v1 app fixture")
    gates = value.get("gates")
    if not isinstance(gates, list) or not gates:
        errors.append("operational_readiness.gates must be a non-empty list")
    else:
        gate_ids = {gate.get("id") for gate in gates if isinstance(gate, dict)}
        for required in ("snapshot_contract", "normalized_units_disclosed", "calibrated_physical_units", "historical_validation"):
            if required not in gate_ids:
                errors.append(f"operational_readiness.gates missing {required}")
        for gate in gates:
            if not isinstance(gate, dict):
                errors.append("operational_readiness.gates entries must be objects")
                continue
            if not isinstance(gate.get("passed"), bool):
                errors.append(f"operational_readiness gate {gate.get('id')} must have boolean passed")
    blockers = value.get("blockers")
    if not isinstance(blockers, list) or not blockers:
        errors.append("operational_readiness.blockers must list the operational blockers")
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
