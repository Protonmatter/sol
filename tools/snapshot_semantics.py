"""Cross-field checks for live solar-state-snapshot.v3."""

from __future__ import annotations

import math
from typing import Any

from observation_provenance import attributable_source

ALLOWED_LAYER_KINDS = {"synthetic", "observed", "blended", "inferred", "degraded"}
REQUIRED_FIELDS = {
    "br_normalized",
    "continuum_proxy",
    "confidence",
}
REQUIRED_GATE_IDS = (
    "snapshot_contract",
    "coordinate_frame_explicit",
    "deterministic_replay",
    "public_data_provenance",
    "normalized_units_disclosed",
    "calibrated_physical_units",
    "historical_validation",
    "swpc_product_comparison",
    "operational_monitoring",
)
# Rust f32 births are serialized to six decimals. Their rounding changes the
# derived longitude by <1.3e-6 degrees over the producer's 14-day region lifetime.
# A fixed allowance prevents a large age from hiding an inconsistent anchor.
LONGITUDE_TOLERANCE_DEG = 1.0e-5


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def positive_int(value: Any) -> bool:
    return finite_number(value) and value > 0 and int(value) == value


def semantic_checks(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return errors
    for key in ("run", "coordinates", "grid", "fields"):
        if key in data and not isinstance(data[key], dict):
            errors.append(f"{key} must be an object")
    fields = data.get("fields", {})
    if isinstance(fields, dict):
        for key, field in fields.items():
            if not isinstance(field, dict):
                errors.append(f"fields.{key} must be an object")
    if errors:
        return errors

    if data.get("schema_version") != "solar-state-snapshot.v3":
        errors.append("schema_version must be solar-state-snapshot.v3; historical v2 has a separate validator")
    if "normalized" not in str(data.get("calibration_state", "")).lower():
        errors.append("calibration_state must disclose normalized units")

    source_mode = data.get("source_mode")
    if not isinstance(source_mode, str) or not source_mode.strip():
        errors.append("source_mode must be a non-empty string")

    run = data.get("run") or {}
    steps = run.get("steps")
    dt_hours = run.get("dt_hours")
    time_seconds = run.get("time_seconds")
    if all(finite_number(value) for value in (steps, dt_hours, time_seconds)):
        expected_time = float(steps) * float(dt_hours) * 3600.0
        tolerance = max(1.0e-6, abs(expected_time) * 1.0e-12)
        if not math.isfinite(expected_time):
            errors.append("run.steps*dt_hours*3600 must produce a finite duration")
        elif abs(float(time_seconds) - expected_time) > tolerance:
            errors.append(
                f"run.time_seconds {time_seconds} != steps*dt_hours*3600 {expected_time}"
            )

    coordinates = data.get("coordinates") or {}
    if coordinates.get("frame") != "heliographic_carrington":
        errors.append("coordinates.frame must be heliographic_carrington")
    if coordinates.get("longitude_positive") != "west":
        errors.append("coordinates.longitude_positive must be west")
    rate = coordinates.get("rotation_reference_deg_per_day")
    if finite_number(rate) and abs(float(rate) - 14.1844) > 1.0e-9:
        errors.append("coordinates.rotation_reference_deg_per_day must be 14.1844")
    central_meridian = coordinates.get("central_meridian_longitude_deg")
    if finite_number(central_meridian) and not 0.0 <= float(central_meridian) < 360.0:
        errors.append("coordinates.central_meridian_longitude_deg must be in [0, 360)")

    grid = data.get("grid") or {}
    lon_count = grid.get("lon_count")
    lat_count = grid.get("lat_count")
    expected_len: int | None = None
    if positive_int(lon_count) and positive_int(lat_count):
        expected_len = int(lon_count) * int(lat_count)
        dlon = grid.get("dlon_deg")
        dlat = grid.get("dlat_deg")
        if finite_number(dlon) and abs(float(dlon) - 360.0 / int(lon_count)) > 1.0e-5:
            errors.append("grid.dlon_deg is inconsistent with lon_count")
        if finite_number(dlat) and abs(float(dlat) - 180.0 / int(lat_count)) > 1.0e-5:
            errors.append("grid.dlat_deg is inconsistent with lat_count")

    fields = data.get("fields") or {}
    for field_id in sorted(REQUIRED_FIELDS):
        values = (fields.get(field_id) or {}).get("values")
        if not isinstance(values, list):
            continue
        if expected_len is not None and len(values) != expected_len:
            errors.append(
                f"fields.{field_id}.values length {len(values)} != grid length {expected_len}"
            )
        if not all(finite_number(value) for value in values):
            errors.append(f"fields.{field_id}.values must contain only finite JSON numbers")
            continue
        if field_id == "confidence" and any(not 0.0 <= float(value) <= 1.0 for value in values):
            errors.append("fields.confidence.values must be in [0, 1]")

    layers = data.get("layers")
    if isinstance(layers, list):
        layer_ids = [layer.get("id") for layer in layers if isinstance(layer, dict)]
        if len(layer_ids) != len(set(layer_ids)):
            errors.append("layers ids must be unique")
        for index, layer in enumerate(layers):
            if not isinstance(layer, dict):
                continue
            if layer.get("kind") not in ALLOWED_LAYER_KINDS:
                errors.append(f"layers[{index}].kind is invalid")
        for field_id in ("br_normalized", "continuum_proxy", "confidence"):
            if field_id not in layer_ids:
                errors.append(f"layers missing field declaration {field_id}")

    active_regions = data.get("active_regions")
    if isinstance(active_regions, list):
        ids: list[Any] = []
        for index, region in enumerate(active_regions):
            if not isinstance(region, dict):
                continue
            ids.append(region.get("id"))
            birth_info = region.get("birth") or {}
            position = region.get("model_position") or {}
            if not isinstance(birth_info, dict) or not isinstance(position, dict):
                errors.append("active region birth/model_position must be objects")
                continue
            birth = birth_info.get("time_seconds")
            if finite_number(birth) and finite_number(time_seconds):
                if float(birth) > float(time_seconds):
                    errors.append(f"active_regions[{index}].birth is in the future")
            if position.get("at_time_seconds") != time_seconds or position.get("lat_deg") != birth_info.get("lat_deg"):
                errors.append(f"active_regions[{index}].model_position current time/latitude mismatch")
            birth_latitude = birth_info.get("lat_deg")
            birth_longitude = birth_info.get("lon_deg")
            current_longitude = position.get("lon_deg")
            if all(finite_number(value) for value in (birth, time_seconds, birth_latitude, birth_longitude, current_longitude)):
                # Match solar-core's fixed law without evolving or repairing data.
                sine = math.sin(math.radians(birth_latitude))
                rate = 14.713 - 2.396 * sine * sine - 1.787 * sine ** 4 - 14.1844
                longitude = birth_longitude + rate * (time_seconds - birth) / 86400.0
                if not math.isfinite(longitude) or math.ulp(1.0) * max(1.0, abs(longitude)) > LONGITUDE_TOLERANCE_DEG:
                    errors.append(f"active_regions[{index}].model_position longitude exceeds numeric precision")
                else:
                    difference = abs(current_longitude - longitude % 360.0)
                    if min(difference, 360.0 - difference) > LONGITUDE_TOLERANCE_DEG:
                        errors.append(f"active_regions[{index}].model_position longitude inconsistent with birth and model age")
        if len(ids) != len(set(ids)):
            errors.append("active_regions ids must be unique")

    uncertainty = data.get("uncertainty") or {}
    activity = uncertainty.get("activity") if isinstance(uncertainty, dict) else None
    if isinstance(activity, dict):
        if activity.get("at_time_seconds") != time_seconds:
            errors.append("uncertainty.activity.at_time_seconds must equal run.time_seconds")
        analysis_time = activity.get("last_analysis_time_seconds")
        if analysis_time is not None and finite_number(analysis_time) and finite_number(time_seconds) and analysis_time > time_seconds:
            errors.append("uncertainty.activity last analysis time is in the future")
        if (activity.get("process_noise_per_day") == 0) != (activity.get("process_noise_status") == "disabled"):
            errors.append("uncertainty.activity process noise status disagrees with rate")

    observation_reports = data.get("observations")
    observation_errors: list[str] = []
    if isinstance(observation_reports, list):
        for index, observation in enumerate(observation_reports):
            observation_errors.extend(validate_observation_report(index, observation))
        errors.extend(observation_errors)

    readiness = data.get("operational_readiness")
    if isinstance(readiness, dict):
        data_state = readiness.get("data_state")
        if isinstance(data_state, dict):
            if isinstance(source_mode, str) and data_state.get("source_mode") != source_mode:
                errors.append("operational_readiness.data_state.source_mode must match source_mode")
            has_observations = isinstance(observation_reports, list) and bool(observation_reports)
            observation_mode = data_state.get("observation_mode")
            if has_observations and observation_mode == "none":
                errors.append("attached observations require a non-none observation_mode")
            if not has_observations and observation_mode != "none":
                errors.append("observation_mode must be none when observations are absent")
            live_data_present = data_state.get("live_data_present")
            if live_data_present is True and not has_observations:
                errors.append("live_data_present cannot be true without observations")

        gates = readiness.get("gates")
        if isinstance(gates, list):
            gate_ids = [gate.get("id") for gate in gates if isinstance(gate, dict)]
            if len(gate_ids) != len(set(gate_ids)):
                errors.append("operational_readiness.gates ids must be unique")
            for required in REQUIRED_GATE_IDS:
                if required not in gate_ids:
                    errors.append(f"operational_readiness.gates missing {required}")

            gate_map = {
                gate.get("id"): gate.get("passed")
                for gate in gates
                if isinstance(gate, dict)
            }
            provenance_expected = not observation_errors
            if gate_map.get("public_data_provenance") != provenance_expected:
                errors.append(
                    "public_data_provenance gate must reflect attached observation provenance validity"
                )

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
            if not attributable_source(provenance.get("source")):
                errors.append(
                    f"observations[{index}].frames[{frame_index}].provenance.source must be attributable"
                )
            if "active" not in provenance:
                errors.append(
                    f"observations[{index}].frames[{frame_index}].provenance.active is required"
                )
            if not isinstance(provenance.get("raw_source_metadata"), dict):
                errors.append(
                    f"observations[{index}].frames[{frame_index}].provenance.raw_source_metadata must be an object"
                )
        quality_flags = frame.get("quality_flags")
        if not isinstance(quality_flags, list) or not quality_flags:
            errors.append(
                f"observations[{index}].frames[{frame_index}].quality_flags must be non-empty"
            )
    return errors
