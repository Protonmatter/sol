#!/usr/bin/env python3
"""Lightweight SWPC schema probe for SCN 26-21 migration.

Usage:
  python python/swpc_schema_probe.py sample.json

This intentionally avoids network access. Feed it captured SWPC JSON samples from CI.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

DEPRECATED_RTSW_PREFIXES = (
    "/products/solar-wind/mag-",
    "/products/solar-wind/plasma-",
)

FIELD_MAP_WIND = {
    "density": "proton_density",
    "speed": "proton_speed",
    "temperature": "proton_temperature",
}

FIELD_MAP_MAG = {
    "lon_gsm": "phi_gsm",
    "lat_gsm": "theta_bsm",
}


def coerce_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        value = value.strip().strip('"')
        if not value or value.lower() in {"null", "nan"}:
            return None
        try:
            return float(value)
        except ValueError:
            return None
    return None


def classify_shape(payload: Any) -> str:
    if isinstance(payload, list):
        if not payload:
            return "empty-array"
        if isinstance(payload[0], list):
            return "legacy-header-row-array"
        if isinstance(payload[0], dict):
            return "object-array"
        return f"array-of-{type(payload[0]).__name__}"
    if isinstance(payload, dict):
        return "object"
    return type(payload).__name__


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 2

    payload = json.loads(Path(sys.argv[1]).read_text())
    shape = classify_shape(payload)
    print(f"shape={shape}")

    if shape == "legacy-header-row-array":
        print("warning=legacy header-row shape; normalize before assimilation")
    elif shape == "object-array":
        first = payload[0]
        numeric_fields = [k for k, v in first.items() if k != "time_tag" and coerce_number(v) is not None]
        print(f"numeric_fields={','.join(numeric_fields)}")
        for field in ("source", "active"):
            if field in first:
                print(f"metadata_{field}=present")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
