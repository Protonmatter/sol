from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import validate_snapshot
import validate_snapshot_v2
from generate_fixture_snapshot import build_snapshot, build_observation_report, region_snapshot
from observation_provenance import attributable_source
from solar_image_registration import assess_registration


class SolarV3Tests(unittest.TestCase):
    def test_registration_matches_literal_shared_source_attribution_corpus(self):
        sources = json.loads((ROOT / "tests/fixtures/standalone-provenance.json").read_text(encoding="utf-8"))
        corpus = json.loads((ROOT / "tests/fixtures/solar-registration.json").read_text(encoding="utf-8"))
        snapshot = json.loads((ROOT / "apps/web/data/latest-state.json").read_text(encoding="utf-8"))
        snapshot["coordinates"]["reference_epoch_jd_tt"] = corpus["reference_epoch_jd_tt"]
        for source_case in sources:
            with self.subTest(case=source_case["id"]):
                registration = copy.deepcopy(corpus["registration"])
                registration["source"] = copy.deepcopy(source_case["source"])
                original_registration = copy.deepcopy(registration)
                asset = {
                    "image_id": registration["image_id"],
                    "sha256": registration["image_sha256"],
                    "capture_timestamp": registration["capture_timestamp"],
                }

                result = assess_registration(registration, snapshot, asset)

                self.assertEqual(attributable_source(source_case["source"]), source_case["attributable"])
                self.assertEqual(result["status"] == "structure_epoch_compatible", source_case["attributable"], result["reason"])
                self.assertFalse(result["compositing_permitted"])
                self.assertEqual(registration, original_registration)

    def test_shared_registration_corpus_never_permits_compositing(self):
        corpus = json.loads((ROOT / "tests/fixtures/solar-registration.json").read_text(encoding="utf-8"))
        snapshot = json.loads((ROOT / "apps/web/data/latest-state.json").read_text(encoding="utf-8"))
        snapshot["coordinates"]["reference_epoch_jd_tt"] = corpus["reference_epoch_jd_tt"]
        for case in corpus["cases"]:
            with self.subTest(case=case["id"]):
                r = copy.deepcopy(corpus["registration"])
                r[case["path"][0]] = case["value"]
                asset = {"image_id": r["image_id"], "sha256": r["image_sha256"], "capture_timestamp": r["capture_timestamp"]}
                result = assess_registration(r, snapshot, asset)
                self.assertEqual(result["status"] == "structure_epoch_compatible", case["compatible"], result["reason"])
                self.assertFalse(result["compositing_permitted"])
        self.assertEqual(assess_registration(None, None, None)["status"], "unavailable")

    def test_historical_v2_and_live_v3_are_disjoint(self):
        historical = validate_snapshot_v2.loads_strict((ROOT / "tests/fixtures/historical/solar-v2.json").read_text(encoding="utf-8"))
        current = validate_snapshot.loads_strict((ROOT / "apps/web/data/latest-state.json").read_text(encoding="utf-8"))
        self.assertEqual(validate_snapshot_v2.validate(historical), [])
        self.assertTrue(validate_snapshot.validate(historical))
        self.assertEqual(validate_snapshot.validate(current), [])
        self.assertTrue(validate_snapshot_v2.validate(current))

    def test_fixture_generation_keeps_uncertainty_independent_of_spatial_score(self):
        snapshot = build_snapshot(42, 8, 4, build_observation_report(None))
        self.assertEqual(validate_snapshot.validate(snapshot), [])
        self.assertEqual(snapshot["uncertainty"]["activity"]["variance"], 0.04)
        self.assertIsNone(snapshot["uncertainty"]["activity"]["last_analysis_time_seconds"])
        self.assertNotIn("br_variance_normalized", snapshot["fields"])
        self.assertEqual(snapshot["fields"]["confidence"]["semantics"], "heuristic_model_score")

    def test_producer_current_anchor_preserves_birth_with_wraparound(self):
        region = {"id": 1, "birth_seconds": 0.0, "lat_deg": 0.0, "lon_deg": 359.0}
        before = copy.deepcopy(region)
        result = region_snapshot(region, 172800.0)
        self.assertEqual(region, before)
        self.assertEqual(result["birth"], {"time_seconds": 0.0, "lat_deg": 0.0, "lon_deg": 359.0})
        self.assertAlmostEqual(result["model_position"]["lon_deg"], 0.0572, places=10)
        with self.assertRaises(ValueError):
            region_snapshot(region, -1.0)


if __name__ == "__main__":
    unittest.main()
