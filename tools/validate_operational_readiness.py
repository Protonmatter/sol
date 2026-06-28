#!/usr/bin/env python3
"""Validate Solar Maximum Engine readiness gates.

Default mode verifies that the app is ready for research/learning use while
remaining explicitly blocked for operational space-weather authority. Pass
--require-space-weather-operational only for a future release that has real
calibration, historical validation, monitoring, and approval evidence.
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger("validate_operational_readiness")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    parser.add_argument("--require-space-weather-operational", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    data = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))
    readiness = data.get("operational_readiness")
    errors = validate_readiness(readiness, args.require_space_weather_operational)
    report(readiness)
    if errors:
        for error in errors:
            LOGGER.error("%s", error)
        return 1
    LOGGER.info("readiness gates match requested mode")
    return 0


def validate_readiness(value: Any, require_space_weather: bool) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return ["operational_readiness is missing"]
    if value.get("research_learning_ready") is not True:
        errors.append("research_learning_ready must be true")
    if require_space_weather and value.get("space_weather_operational") is not True:
        errors.append("space_weather_operational is false")
    if not require_space_weather and value.get("space_weather_operational") is not False:
        errors.append("space_weather_operational must remain false for research-only validation")
    gates = value.get("gates")
    if not isinstance(gates, list):
        errors.append("gates must be a list")
        return errors
    gate_map = {gate.get("id"): gate for gate in gates if isinstance(gate, dict)}
    for gate_id in ("snapshot_contract", "deterministic_replay", "public_data_provenance", "normalized_units_disclosed"):
        if gate_map.get(gate_id, {}).get("passed") is not True:
            errors.append(f"{gate_id} gate must pass")
    for gate_id in ("calibrated_physical_units", "historical_validation", "swpc_product_comparison", "operational_monitoring"):
        if require_space_weather:
            if gate_map.get(gate_id, {}).get("passed") is not True:
                errors.append(f"{gate_id} gate must pass for space-weather operations")
        elif gate_map.get(gate_id, {}).get("passed") is not False:
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
