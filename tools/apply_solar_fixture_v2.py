#!/usr/bin/env python3
"""One-shot fixture/series source migration; removed after application."""

from pathlib import Path

fixture_path = Path("tools/generate_fixture_snapshot.py")
text = fixture_path.read_text(encoding="utf-8")
text = text.replace('"schema_version": "solar-state-snapshot.v1",', '"schema_version": "solar-state-snapshot.v2",')
text = text.replace('"model_version": "0.1.1",', '"model_version": "0.2.0",')
text = text.replace(
    '        "grid": {\n'
    '            "lon_count": lon_count,\n',
    '        "coordinates": {\n'
    '            "frame": "heliographic_carrington",\n'
    '            "longitude_positive": "west",\n'
    '            "latitude_type": "heliographic",\n'
    '            "reference_epoch_jd_tt": 2451545.0,\n'
    '            "central_meridian_longitude_deg": 0.0,\n'
    '            "rotation_reference_deg_per_day": 14.1844,\n'
    '            "observer": "sun_center",\n'
    '        },\n'
    '        "grid": {\n'
    '            "lon_count": lon_count,\n',
)
text = text.replace(
    '            "dlat_deg": round(180.0 / lat_count, 6),\n'
    '        },\n'
    '        "layers": [',
    '            "dlat_deg": round(180.0 / lat_count, 6),\n'
    '            "storage_order": "lat_major_lon_contiguous",\n'
    '            "index_formula": "lat_i * lon_count + lon_i",\n'
    '        },\n'
    '        "layers": [',
    1,
)
text = text.replace('"birth_seconds": round(idx * 3600.0, 6),', '"birth_seconds": 0.0,', 1)
text = text.replace(
    '            {"id": "snapshot_contract", "label": "Versioned snapshot contract present", "passed": True},\n',
    '            {"id": "snapshot_contract", "label": "Versioned snapshot contract present", "passed": True},\n'
    '            {"id": "coordinate_frame_explicit", "label": "Solar coordinate frame and storage order explicit", "passed": True},\n',
)
text = text.replace(
    '            "Static deterministic fixture in normalized magnetic units (not a flux-transport run).",\n',
    '            "Static deterministic fixture in normalized magnetic units (not a flux-transport run).",\n'
    '            "Coordinates are west-positive heliographic Carrington coordinates.",\n',
)
if '"schema_version": "solar-state-snapshot.v2"' not in text or '"coordinates": {' not in text:
    raise SystemExit("fixture v2 migration postcondition failed")
fixture_path.write_text(text, encoding="utf-8")

series_path = Path("tools/generate_series.py")
text = series_path.read_text(encoding="utf-8")
text = text.replace("solar-state-snapshot.v1", "solar-state-snapshot.v2")
text = text.replace('"birth_seconds": round(idx * 3600.0, 6),', '"birth_seconds": 0.0,')
text = text.replace(
    '            "dlat_deg": round(180.0 / lat, 6),\n'
    '        }',
    '            "dlat_deg": round(180.0 / lat, 6),\n'
    '            "storage_order": "lat_major_lon_contiguous",\n'
    '            "index_formula": "lat_i * lon_count + lon_i",\n'
    '        }',
)
text = text.replace(
    '        frame["run"]["activity_index"] = activity\n'
    '        frame["run"]["time_seconds"] = round(months * 30.0 * 86400.0, 1)\n',
    '        frame["run"]["activity_index"] = activity\n'
    '        frame["run"]["steps"] = 0\n'
    '        frame["run"]["dt_hours"] = 0.0\n'
    '        frame["run"]["time_seconds"] = 0.0\n',
)
if "solar-state-snapshot.v2" not in text or '"storage_order": "lat_major_lon_contiguous"' not in text:
    raise SystemExit("series v2 migration postcondition failed")
series_path.write_text(text, encoding="utf-8")

schema_path = Path("docs/solar-state-snapshot-v2.schema.json")
schema = schema_path.read_text(encoding="utf-8")
schema = schema.replace('"dt_hours": { "type": "number", "exclusiveMinimum": 0 }', '"dt_hours": { "type": "number", "minimum": 0 }')
if '"dt_hours": { "type": "number", "minimum": 0 }' not in schema:
    raise SystemExit("schema dt_hours migration postcondition failed")
schema_path.write_text(schema, encoding="utf-8")
