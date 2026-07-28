from __future__ import annotations

import copy
import contextlib
import io
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import jsonschema_min
import validate_ephemeris_snapshot as validator


class JsonSchemaSubsetTests(unittest.TestCase):
    def test_types_const_enum_refs_objects_and_arrays(self):
        schema = {
            "$defs": {"tag": {"type": "string", "enum": ["ok", "warn"]}},
            "type": "object",
            "required": ["count", "tags"],
            "additionalProperties": False,
            "properties": {
                "count": {"type": "integer", "const": 2},
                "tags": {"type": "array", "minItems": 2, "items": {"$ref": "#/$defs/tag"}},
            },
        }
        self.assertEqual(jsonschema_min.validate({"count": 2, "tags": ["ok", "warn"]}, schema), [])
        errors = jsonschema_min.validate({"count": True, "tags": ["bad"], "extra": 1}, schema)
        self.assertTrue(any("expected type integer" in error for error in errors))
        self.assertTrue(any("at least 2" in error for error in errors))
        self.assertTrue(any("not one of" in error for error in errors))
        self.assertTrue(any("unexpected property" in error for error in errors))
        self.assertTrue(jsonschema_min.validate({}, schema))

    def test_union_additional_schema_bool_equality_and_bad_refs(self):
        schema = {
            "type": ["object", "null"],
            "additionalProperties": {"type": "number"},
        }
        self.assertEqual(jsonschema_min.validate(None, schema), [])
        self.assertEqual(jsonschema_min.validate({"x": 1.5}, schema), [])
        self.assertTrue(jsonschema_min.validate({"x": "no"}, schema))
        self.assertTrue(jsonschema_min.validate(True, {"const": 1}))
        self.assertTrue(jsonschema_min.validate(1, {"enum": [True]}))
        self.assertTrue(jsonschema_min.validate(1, {"$ref": "other.json"}))
        self.assertEqual(jsonschema_min.validate(1, "not a schema"), [])

    def test_diagnostics_cover_all_json_type_names_and_pointer_escaping(self):
        class Custom:
            pass
        for value, name in [
            (False, "boolean"), (1, "integer"), (1.5, "number"), ("x", "string"),
            ({}, "object"), ([], "array"), (None, "null"), (Custom(), "Custom"),
        ]:
            self.assertEqual(jsonschema_min._type_name(value), name)
        long_value = "x" * 100
        self.assertTrue(jsonschema_min._short(long_value).endswith("..."))
        schema = {"$defs": {"a/b": {"~key": {"const": 1}}}}
        self.assertEqual(
            jsonschema_min.validate(1, {"$ref": "#/$defs/a~1b/~0key"}, schema), [],
        )


class EphemerisSemanticTests(unittest.TestCase):
    def test_scalar_helpers_and_finite_tree(self):
        with self.assertRaises(ValueError):
            validator.reject_constant("NaN")
        self.assertTrue(validator.finite(1.0))
        self.assertFalse(validator.finite(True))
        self.assertTrue(validator.close(1, 1.01, 0.02))
        self.assertAlmostEqual(validator.local_solar_day_start(2460000.7, 0), 2460000.5)
        errors = validator.finite_tree({"x": [1, float("nan")], "y": float("inf")})
        self.assertEqual(len(errors), 2)

    def test_time_semantics_reports_every_inconsistency(self):
        time = {
            "jd_utc": 2460000.0, "jd_ut1": 2460001.0, "dut1_seconds": 2.0,
            "jd_tai": 2460000.0, "tai_minus_utc_seconds": 37.0,
            "jd_tt": 2460002.0, "delta_t_seconds": 1.0,
            "earth_orientation": {
                "quality": "rapid", "source": "unknown",
                "dut1_uncertainty_seconds": -1,
            },
        }
        errors = validator.check_time(time)
        self.assertGreaterEqual(len(errors), 6)
        mismatch = dict(time, jd_tai=None)
        self.assertTrue(any("both be null" in error for error in validator.check_time(mismatch)))
        valid_null = dict(time, jd_tai=None, tai_minus_utc_seconds=None)
        validator.check_time(valid_null)

    def test_body_semantics_catches_alias_horizon_distance_events_and_moon(self):
        body = {
            "name": "Moon", "kind": "moon", "ra_deg": 1, "dec_deg": 2,
            "topocentric_apparent_ra_deg": 3, "topocentric_apparent_dec_deg": 4,
            "geocentric_apparent_ra_deg": 3, "geocentric_apparent_dec_deg": 4,
            "alt_refracted_deg": 1, "above_horizon": False, "distance_km": None,
            "rise_jd": 2460002.0, "transit_jd": None, "set_jd": None,
        }
        errors = validator.check_bodies(
            [body, dict(body)], {"jd_utc": 2460000.7}, {"terrestrial_lon_deg_east": 0},
        )
        expected = ["unique", "missing major", "ra_deg", "dec_deg", "above_horizon",
                    "distance_km", "outside", "Moon topocentric"]
        for fragment in expected:
            self.assertTrue(any(fragment in error for error in errors), fragment)

        star = {
            "name": "Sirius", "kind": "star", "distance_km": None,
            "ra_deg": 1, "dec_deg": 2, "topocentric_apparent_ra_deg": 1,
            "topocentric_apparent_dec_deg": 2, "geocentric_apparent_ra_deg": 2,
            "geocentric_apparent_dec_deg": 3, "alt_refracted_deg": -1,
            "above_horizon": False,
        }
        star_errors = validator.check_bodies([star], None, None)
        self.assertTrue(any("infinite-distance" in error for error in star_errors))
        validator.check_bodies(["not a mapping"], None, None)

    def test_semantic_checks_accuracy_observer_and_non_mapping_guards(self):
        data = {
            "time": {"earth_orientation": {"quality": "degraded"}},
            "observer": {"terrestrial_lat_deg": float("nan")},
            "accuracy": {"eop_status": "rapid", "class": "precise"},
            "warnings": [],
            "bodies": [],
        }
        errors = validator.semantic_checks(data)
        self.assertTrue(any("must be finite" in error for error in errors))
        self.assertTrue(any("eop_status" in error for error in errors))
        self.assertTrue(any("degraded accuracy" in error for error in errors))
        self.assertTrue(any("explicit warning" in error for error in errors))
        self.assertEqual(validator.semantic_checks([]), [])

    def test_main_accepts_valid_json_and_rejects_non_json_numbers(self):
        good = ROOT / "apps" / "web" / "data" / "latest-state.json"
        # The CLI path is exercised with a deliberately small invalid contract; this
        # covers I/O and diagnostics without coupling this validator to solar-state.
        bad = ROOT / "tests" / "fixtures" / "_ephemeris_bad_tmp.json"
        try:
            bad.write_text('{"value": NaN}', encoding="utf-8")
            old_argv = sys.argv
            sys.argv = ["validate_ephemeris_snapshot.py", str(bad)]
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(validator.main(), 1)
            bad.write_text("{}", encoding="utf-8")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(validator.main(), 1)
        finally:
            sys.argv = old_argv
            bad.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
