"""Shared synthetic event contract cases; no external accuracy claims."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import validate_ephemeris_snapshot_v2 as validator


class EventContractTests(unittest.TestCase):
    def test_half_open_day_and_nullable_culmination_pair(self):
        cases = json.loads((ROOT / "tests/fixtures/ephemeris-event-cases.json").read_text())["cases"]
        for case in cases:
            with self.subTest(case=case["name"]):
                body = {
                    "name": "Venus", "kind": "planet", "distance_km": 100000,
                    "alt_refracted_deg": 1, "above_horizon": True,
                    "transit_jd": case["transit"], "transit_alt_deg": case["altitude"],
                }
                errors = validator.check_bodies([body], {"jd_utc": 2460000.75}, {"terrestrial_lon_deg_east": 90})
                event_errors = [error for error in errors if "transit" in error]
                self.assertEqual(not event_errors, case["valid"], event_errors)

    def test_rise_and_set_also_exclude_day_end(self):
        for field in ["rise_jd", "set_jd"]:
            body = {"name":"Venus", "kind":"planet", "distance_km":1,
                    "above_horizon":False, "alt_refracted_deg":-1, field:2460001.25}
            errors = validator.check_bodies([body], {"jd_utc":2460000.75}, {"terrestrial_lon_deg_east":90})
            self.assertTrue(any(field in error for error in errors))


if __name__ == "__main__":
    unittest.main()
