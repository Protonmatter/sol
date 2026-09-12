"""Bounded image-evidence compatibility, never permission to composite.

IERS Bulletin C72 verifies TAI-UTC=37s for the accepted [2017,2027) UTC
domain; TT-TAI=32.184s gives TT-UTC=69.184s. No leap-second extrapolation.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
from pathlib import Path
from typing import Any

import jsonschema_min
from validate_snapshot import validate

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "docs/solar-image-registration-v1.schema.json"


def assess_registration(registration: Any, snapshot: Any, asset: Any) -> dict[str, Any]:
    try:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        errors = jsonschema_min.validate(registration, schema) + validate(snapshot)
        if errors:
            raise ValueError("; ".join(errors))
        r = registration
        if not r["source"].strip() or r["source"].strip().lower() == "unknown" or not re.fullmatch(r"[a-f0-9]{64}", r["image_sha256"]):
            raise ValueError("unattributable source or invalid SHA-256")
        if not isinstance(asset, dict) or asset.get("image_id") != r["image_id"] or asset.get("sha256") != r["image_sha256"] or asset.get("capture_timestamp") != r["capture_timestamp"]:
            raise ValueError("selected image identity/capture mismatch")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z", r["capture_timestamp"]):
            raise ValueError("capture timestamp must be a real UTC instant with millisecond-or-coarser precision")
        capture = dt.datetime.fromisoformat(r["capture_timestamp"].replace("Z", "+00:00"))
        if not dt.datetime(2017, 1, 1, tzinfo=dt.timezone.utc) <= capture < dt.datetime(2027, 1, 1, tzinfo=dt.timezone.utc):
            raise ValueError("capture outside verified fixed-offset domain [2017,2027)")
        capture_jd = 2440587.5 + (capture.timestamp() + r["tt_minus_utc_seconds"]) / 86400.0
        model_jd = snapshot["coordinates"]["reference_epoch_jd_tt"] + snapshot["run"]["time_seconds"] / 86400.0
        tolerance = r["timestamp_precision_seconds"] / 86400.0
        if not math.isfinite(model_jd) or abs(capture_jd - r["capture_jd_tt"]) > tolerance or abs(model_jd - r["capture_jd_tt"]) > tolerance:
            raise ValueError("capture UTC/TT or model epoch mismatch")
        clearance = min(r["disk_center_x_px"], r["width_px"] - r["disk_center_x_px"], r["disk_center_y_px"], r["height_px"] - r["disk_center_y_px"])
        if r["disk_radius_px"] > clearance:
            raise ValueError("disk geometry lies outside image dimensions")
        return {"status": "structure_epoch_compatible", "compositing_permitted": False,
                "reason": "Identity, structure and epoch are compatible; actual image geometry calibration remains unverified."}
    except (ValueError, TypeError, KeyError, OverflowError) as exc:
        return {"status": "unavailable", "compositing_permitted": False, "reason": str(exc)}
