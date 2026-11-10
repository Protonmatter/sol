#!/usr/bin/env python3
"""Validate operational-readiness.v1 gate declarations.

Default mode checks research/learning declarations while retaining the current
contract's explicit operational block. Full snapshot validation and external
qualification remain separate. The operational assertion cannot pass this v1
research-only contract, even if a supplied report flips its booleans.
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Any

from validate_snapshot import loads_strict

LOGGER = logging.getLogger("validate_operational_readiness")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    parser.add_argument("--require-space-weather-operational", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    try:
        data = loads_strict(Path(args.snapshot).read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError) as exc:
        LOGGER.error("cannot load valid readiness snapshot JSON (%s)", type(exc).__name__)
        return 1
    if not isinstance(data, dict):
        LOGGER.error("snapshot must be an object")
        return 1
    readiness = data.get("operational_readiness")
    errors = validate_readiness(readiness, args.require_space_weather_operational)
    if errors:
        for error in errors:
            LOGGER.error("%s", error)
        return 1
    report(readiness)
    LOGGER.info("readiness gates match requested mode")
    return 0


def validate_readiness(value: Any, require_space_weather: bool) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return ["operational_readiness is missing"]
    if value.get("schema_version") != "operational-readiness.v1":
        errors.append("schema_version must be operational-readiness.v1")
    status = value.get("status")
    if not isinstance(status, str) or not status.strip():
        errors.append("status must be a nonempty string")
    if value.get("research_learning_ready") is not True:
        errors.append("research_learning_ready must be true")
    if require_space_weather:
        errors.append("operational-readiness.v1 cannot qualify space-weather operations")
    if value.get("space_weather_operational") is not False:
        errors.append("space_weather_operational must remain false for research-only validation")
    gates = value.get("gates")
    if not isinstance(gates, list):
        errors.append("gates must be a list")
        return errors
    gate_map: dict[str, dict[str, Any]] = {}
    for index, gate in enumerate(gates):
        if not isinstance(gate, dict):
            errors.append(f"gates[{index}] must be an object")
            continue
        identity = gate.get("id")
        if not isinstance(identity, str) or not identity.strip():
            errors.append(f"gates[{index}].id must be a nonempty string")
            continue
        if identity in gate_map:
            errors.append("gate ids must be unique")
            continue
        if type(gate.get("passed")) is not bool:
            errors.append(f"gates[{index}].passed must be boolean")
        gate_map[identity] = gate
    for gate_id in ("snapshot_contract", "coordinate_frame_explicit", "deterministic_replay", "public_data_provenance", "normalized_units_disclosed"):
        if gate_map.get(gate_id, {}).get("passed") is not True:
            errors.append(f"{gate_id} gate must pass")
    for gate_id in ("calibrated_physical_units", "historical_validation", "swpc_product_comparison", "operational_monitoring"):
        if gate_map.get(gate_id, {}).get("passed") is not False:
            errors.append(f"{gate_id} gate must remain false for research-only validation")
    return errors


def report(value: Any) -> None:
    if not isinstance(value, dict):
        LOGGER.info("readiness: missing")
        return
    LOGGER.info("status=%s", value.get("status", "unknown"))
    LOGGER.info("research_learning_ready=%s", value.get("research_learning_ready"))
    LOGGER.info("space_weather_operational=%s", value.get("space_weather_operational"))
    blockers = value.get("blockers") if isinstance(value.get("blockers"), list) else []
    if blockers:
        LOGGER.info("operational blockers=%s", "; ".join(str(item) for item in blockers))


if __name__ == "__main__":
    raise SystemExit(main())
