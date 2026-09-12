"""Direction-coherence admission, not external ephemeris accuracy evidence."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import validate_ephemeris_snapshot as validator

SNAPSHOT = json.loads((ROOT / "tests/fixtures/ephemeris-v3-corpus.json").read_text())["snapshot"]


class HorizontalTests(unittest.TestCase):
    def test_literal_cardinal_polar_and_zenith_directions(self):
        for latitude, ra, dec, altitude, azimuth in [(0,0,0,90,137),(0,180,0,-90,257),(0,90,0,0,90),(0,270,0,0,270),(0,0,90,0,359.99999999),(0,0,-90,0,180),(90,0,0,0,180),(-90,0,0,0,0)]:
            body = dict(topocentric_apparent_ra_deg=ra, topocentric_apparent_dec_deg=dec, alt_deg=altitude, az_deg=azimuth)
            self.assertTrue(validator.horizontal_direction_agrees(body, {"lst_deg":0}, {"polar_motion_corrected_lat_deg":latitude}))

    def test_exact_one_arcminute_limit_and_neighbors(self):
        for arcminutes, valid in [(0.999, True), (1, True), (1.001, False)]:
            body = dict(topocentric_apparent_ra_deg=0, topocentric_apparent_dec_deg=90, alt_deg=arcminutes/60, az_deg=0)
            self.assertEqual(validator.horizontal_direction_agrees(body, {"lst_deg":0}, {"polar_motion_corrected_lat_deg":0}), valid)

    def test_unrelated_altitude_and_sidereal_time_fail_admission(self):
        for field in ("altitude", "sidereal", "latitude"):
            with self.subTest(field=field):
                data = copy.deepcopy(SNAPSHOT)
                if field == "altitude":
                    data["bodies"][0]["alt_deg"] += 10
                elif field == "sidereal":
                    data["time"]["lst_deg"] = (data["time"]["lst_deg"] + 30) % 360
                else:
                    data["observer"]["polar_motion_corrected_lat_deg"] = 45
                self.assertTrue(any("horizontal" in error and "equatorial" in error for error in validator.validate(data)))


if __name__ == "__main__":
    unittest.main()
