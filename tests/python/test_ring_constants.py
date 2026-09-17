"""Independent pin failures for documented ring geometry and display opacity."""
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import validate_body_constants as validator


class RingConstantsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.current = validator.dump_body_module()

    def test_documented_snapshot_passes(self) -> None:
        self.assertEqual(validator.check_bodies(self.current), [])

    def test_ring_centre_cannot_replace_outer_edge(self) -> None:
        changed = copy.deepcopy(self.current)
        changed["BODY"]["Neptune"]["rings"]["outerKm"] = 62930
        self.assertTrue(any("Neptune.rings.outerKm" in item for item in validator.check_bodies(changed)))

    def test_removed_gap_and_added_unsupported_band_fail(self) -> None:
        changed = copy.deepcopy(self.current)
        changed["BODY"]["Saturn"]["rings"]["gaps"].pop()
        changed["BODY"]["Uranus"]["rings"]["bands"].append(
            {"name": "unqualified", "innerKm": 40000, "outerKm": 41000, "opacity": .16})
        errors = validator.check_bodies(changed)
        self.assertTrue(any("Saturn.rings.gaps" in item for item in errors))
        self.assertTrue(any("Uranus.rings.bands" in item for item in errors))

    def test_width_opacity_and_name_drift_fail(self) -> None:
        for field, value in [("outerKm", 43000), ("opacity", .8), ("name", "invented")]:
            with self.subTest(field=field):
                changed = copy.deepcopy(self.current)
                changed["BODY"]["Neptune"]["rings"]["bands"][0][field] = value
                self.assertTrue(any("Neptune.rings.bands" in item for item in validator.check_bodies(changed)))


if __name__ == "__main__":
    unittest.main()
