from __future__ import annotations

import json
import math
import contextlib
import copy
import io
import tempfile
from unittest.mock import patch
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import jsonschema_min
import validate_snapshot
from snapshot_semantics import semantic_checks


class StrictIntakeTests(unittest.TestCase):
    def test_shared_longitude_semantics(self):
        baseline = json.loads((ROOT / "apps/web/data/latest-state.json").read_text())
        cases = json.loads((ROOT / "tests/fixtures/solar-longitude-intake.json").read_text())
        for case in cases:
            with self.subTest(case=case["id"]):
                data = copy.deepcopy(baseline)
                epoch = case["at_time_seconds"]
                data["run"].update(steps=1, dt_hours=epoch / 3600, time_seconds=epoch)
                data["uncertainty"]["activity"]["at_time_seconds"] = epoch
                data["active_regions"] = [data["active_regions"][0]]
                region = data["active_regions"][0]
                region["birth"] = {"time_seconds": case["birth_time_seconds"], "lat_deg": case["lat_deg"], "lon_deg": case["birth_lon_deg"]}
                region["model_position"].update(at_time_seconds=epoch, lat_deg=case["lat_deg"], lon_deg=case["model_lon_deg"])
                errors = validate_snapshot.validate(validate_snapshot.loads_strict(json.dumps(data)))
                if case["accepted"]:
                    self.assertEqual(errors, [])
                else:
                    expected = case.get("error_contains", "longitude")
                    self.assertTrue(any(expected in error for error in errors), errors)

    def test_shared_snapshot_mutations(self):
        baseline = json.loads((ROOT / "apps/web/data/latest-state.json").read_text())
        cases = json.loads((ROOT / "tests/fixtures/snapshot-intake.json").read_text())
        for case in cases:
            with self.subTest(case=case["id"]):
                data = copy.deepcopy(baseline)
                for mutation in case.get("mutations", [case]):
                    parent = data
                    for key in mutation["path"][:-1]:
                        parent = parent[key]
                    if mutation.get("remove"):
                        del parent[mutation["path"][-1]]
                    else:
                        parent[mutation["path"][-1]] = mutation["value"]
                self.assertEqual(not validate_snapshot.validate(data), case["accepted"])

    def test_shared_lexical_corpus_through_cli_intake(self):
        # Embed each lexical value into a valid snapshot's observed_context.
        baseline = json.loads((ROOT / "apps/web/data/latest-state.json").read_text())
        for case in json.loads((ROOT / "tests/fixtures/strict-intake.json").read_text()):
            with self.subTest(case=case["id"]), tempfile.TemporaryDirectory() as directory:
                baseline["observed_context"] = {"lexical": "SENTINEL"}
                raw = json.dumps(baseline).replace('"SENTINEL"', case["text"])
                path = Path(directory) / "input.json"
                path.write_text(raw, encoding="utf-8")
                with patch.object(sys, "argv", ["validate_snapshot", str(path)]), contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                    result = validate_snapshot.main()
                self.assertEqual(result == 0, case["accepted"])

    def test_schema_bounds_and_conditionals_are_enforced(self):
        for value, schema in [
            (-1, {"minimum": 0}), (2, {"maximum": 1}),
            (0, {"exclusiveMinimum": 0}), (1, {"exclusiveMaximum": 1}),
            ("", {"minLength": 1}), (math.inf, {"type": "number"}),
            (1, {"if": {"const": 1}, "then": {"const": 2}}),
            (2, {"if": {"const": 1}, "else": {"const": 3}}),
            (1, {"unknownAssertion": True}),
        ]:
            with self.subTest(value=value, schema=schema):
                self.assertTrue(jsonschema_min.validate(value, schema))
        self.assertEqual(jsonschema_min.validate(0, {"minimum": 0, "maximum": 1}), [])

    def test_invalid_structures_return_diagnostics(self):
        for key in ("run", "coordinates", "grid", "fields"):
            with self.subTest(key=key):
                self.assertTrue(validate_snapshot.validate({key: [1]}))

    def test_schema_unknown_keyword_in_inactive_branch_is_rejected(self):
        for schema in [
            {"if": {"unknown": 1}, "else": {}},
            {"properties": {"absent": {"pattern": "x"}}},
            {"anyOf": [{}, {"unknown": 1}]},
        ]:
            self.assertTrue(jsonschema_min.validate({}, schema))

    def test_json_integer_semantics_and_nested_nonfinite_values(self):
        self.assertEqual(jsonschema_min.validate(1.0, {"type": "integer"}), [])
        self.assertTrue(jsonschema_min.validate({"free": {"value": math.inf}}, {}))

    def test_semantic_entrypoint_handles_wrong_shapes(self):
        for key in ("run", "coordinates", "grid", "fields"):
            self.assertTrue(semantic_checks({key: [1]}))


if __name__ == "__main__":
    unittest.main()
