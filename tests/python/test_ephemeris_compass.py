"""Offline v3 compass semantics; literal bearings are contract cases, not accuracy truth."""
from __future__ import annotations

import copy
import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import validate_ephemeris_snapshot as validator

SPEC = importlib.util.spec_from_file_location("compass_ephemeris_server", ROOT / "services/ephemeris-server/server.py")
assert SPEC is not None and SPEC.loader is not None
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)

SNAPSHOT = json.loads((ROOT / "tests/fixtures/ephemeris-v3-corpus.json").read_text(encoding="utf-8"))["snapshot"]
# North is zero, increasing clockwise through east; each midpoint selects clockwise.
DIRECTIONS = [
    (0, "N"), (22.5, "NNE"), (45, "NE"), (67.5, "ENE"),
    (90, "E"), (112.5, "ESE"), (135, "SE"), (157.5, "SSE"),
    (180, "S"), (202.5, "SSW"), (225, "SW"), (247.5, "WSW"),
    (270, "W"), (292.5, "WNW"), (315, "NW"), (337.5, "NNW"),
]
BOUNDARIES = [
    (11.2499999, 11.25, 11.2500001, "N", "NNE"),
    (33.7499999, 33.75, 33.7500001, "NNE", "NE"),
    (56.2499999, 56.25, 56.2500001, "NE", "ENE"),
    (78.7499999, 78.75, 78.7500001, "ENE", "E"),
    (101.2499999, 101.25, 101.2500001, "E", "ESE"),
    (123.7499999, 123.75, 123.7500001, "ESE", "SE"),
    (146.2499999, 146.25, 146.2500001, "SE", "SSE"),
    (168.7499999, 168.75, 168.7500001, "SSE", "S"),
    (191.2499999, 191.25, 191.2500001, "S", "SSW"),
    (213.7499999, 213.75, 213.7500001, "SSW", "SW"),
    (236.2499999, 236.25, 236.2500001, "SW", "WSW"),
    (258.7499999, 258.75, 258.7500001, "WSW", "W"),
    (281.2499999, 281.25, 281.2500001, "W", "WNW"),
    (303.7499999, 303.75, 303.7500001, "WNW", "NW"),
    (326.2499999, 326.25, 326.2500001, "NW", "NNW"),
    (348.7499999, 348.75, 348.7500001, "NNW", "N"),
]


def with_bearing(azimuth: float, compass: str, body_name: str = "Sun") -> dict:
    data = copy.deepcopy(SNAPSHOT)
    body = next(body for body in data["bodies"] if body["name"] == body_name)
    body.update(az_deg=azimuth, compass=compass)
    ra, dec = equatorial_for_bearing(body["alt_deg"], azimuth, data["observer"]["polar_motion_corrected_lat_deg"], data["time"]["lst_deg"])
    body.update(ra_deg=ra, dec_deg=dec, topocentric_apparent_ra_deg=ra, topocentric_apparent_dec_deg=dec)
    if body["range_approximation"] == "infinite_catalogue_star":
        body.update(geocentric_apparent_ra_deg=ra, geocentric_apparent_dec_deg=dec)
    return data


def equatorial_for_bearing(altitude, azimuth, latitude, lst):
    alt, az, lat = map(math.radians, (altitude, azimuth, latitude))
    dec = math.asin(math.sin(alt)*math.sin(lat)+math.cos(alt)*math.cos(az)*math.cos(lat))
    hour = math.atan2(-math.cos(alt)*math.sin(az), math.sin(alt)*math.cos(lat)-math.cos(alt)*math.cos(az)*math.sin(lat))
    return (lst-math.degrees(hour)) % 360, math.degrees(dec)


def provider_positions(unix=1783569600.0) -> dict[str, dict[str, float]]:
    result = {
        body["name"]: {
            "geocentric_ra": body["geocentric_apparent_ra_deg"],
            "geocentric_dec": body["geocentric_apparent_dec_deg"],
            "topocentric_ra": body["topocentric_apparent_ra_deg"],
            "topocentric_dec": body["topocentric_apparent_dec_deg"],
            "geocentric_range_km": body["geocentric_range_km"],
            "observer_range_km": body["observer_range_km"],
            "az": body["az_deg"], "alt": body["alt_deg"],
        }
        for body in SNAPSHOT["bodies"] if body["range_approximation"] == "finite"
    }
    # Keep synthetic provider directions coherent at the actual requested epoch.
    for item in result.values():
        point_at_azimuth(item, item["az"], unix)
    return result


def point_at_azimuth(item, azimuth, unix=1783569600.0):
    lst = server.time_block(unix / 86400 + 2440587.5, 0)["lst_deg"]
    ra, dec = equatorial_for_bearing(item["alt"], azimuth, 0, lst)
    item.update(az=azimuth, topocentric_ra=ra, topocentric_dec=dec)


class CompassContractTests(unittest.TestCase):
    def test_all_sixteen_compass_directions_preserve_valid_snapshots(self):
        for azimuth, compass in [*DIRECTIONS, (359.9999999, "N")]:
            with self.subTest(azimuth=azimuth, compass=compass):
                data = with_bearing(azimuth, compass)
                before = copy.deepcopy(data)
                self.assertEqual(validator.validate(data), [])
                self.assertEqual(data, before)
                self.assertEqual(server.compass(azimuth), compass)

    def test_exact_clockwise_boundaries_and_both_sides(self):
        for before, midpoint, after, previous, following in BOUNDARIES:
            for azimuth, compass in [(before, previous), (midpoint, following), (after, following)]:
                with self.subTest(azimuth=azimuth, compass=compass):
                    self.assertEqual(validator.validate(with_bearing(azimuth, compass)), [])
                    self.assertEqual(server.compass(azimuth), compass)

    def test_mislabeled_cardinal_intercardinal_and_catalogue_star_bearings_are_rejected(self):
        for azimuth, compass in DIRECTIONS:
            wrong = "S" if compass == "N" else "N"
            with self.subTest(azimuth=azimuth, compass=wrong):
                self.assertTrue(any("compass" in error and "az_deg" in error for error in validator.validate(with_bearing(azimuth, wrong))))
        for compass in ["north", "n", " N", "N ", "unknown"]:
            with self.subTest(compass=compass):
                self.assertTrue(any("compass" in error and "az_deg" in error for error in validator.validate(with_bearing(0, compass))))
        self.assertTrue(any("Sirius.compass" in error for error in validator.validate(with_bearing(0, "S", "Sirius"))))

    def test_adjacent_sector_is_rejected_on_each_side_of_every_midpoint(self):
        for before, midpoint, after, previous, following in BOUNDARIES:
            for azimuth, compass in [(before, following), (midpoint, previous), (after, previous)]:
                with self.subTest(azimuth=azimuth, compass=compass):
                    self.assertTrue(any("compass" in error and "az_deg" in error for error in validator.validate(with_bearing(azimuth, compass))))

    def test_server_serialization_keeps_rounded_azimuth_and_compass_in_the_same_sector(self):
        raw = provider_positions()
        # Seven-decimal serialization can cross a compass boundary or round to 360.
        for source_az, emitted_az, compass in [
            (11.24999994, 11.2499999, "N"),
            (11.24999999, 11.25, "NNE"),
            (11.25, 11.25, "NNE"),
            (11.25000001, 11.25, "NNE"),
            (348.74999999, 348.75, "N"),
            (359.99999994, 359.9999999, "N"),
            (359.99999999, 0.0, "N"),
            (-0.00000001, 0.0, "N"),
            (-90.0, 270.0, "W"),
        ]:
            with self.subTest(source_az=source_az):
                point_at_azimuth(raw["Sun"], source_az)
                before = copy.deepcopy(raw)
                with mock.patch.object(server, "definitive_positions", return_value=raw):
                    emitted = server.build_snapshot(1783569600.0, 0, 0, 0)
                sun = next(body for body in emitted["bodies"] if body["name"] == "Sun")
                self.assertEqual(sun["az_deg"], emitted_az)
                self.assertEqual(sun["compass"], compass)
                self.assertEqual(validator.validate(emitted), [])
                self.assertEqual(raw, before)

    def test_server_does_not_reuse_pre_normalization_cached_compass_pair(self):
        unix = (SNAPSHOT["time"]["jd_utc"] - 2440587.5) * 86400
        raw = provider_positions(unix)
        point_at_azimuth(raw["Sun"], 11.24999999, unix)
        old_text = json.dumps(with_bearing(11.25, "N"))
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(server, "CACHE_DIR", directory):
            # Reproduce the cache identity used before this serialization fix.
            with mock.patch.object(server, "CACHE_VERSION", "v5"):
                old_path = Path(server.cache_path(unix, 0, 0, 0))
            old_path.write_text(old_text, encoding="utf-8")
            with mock.patch.object(server, "definitive_positions", return_value=raw):
                emitted = server.snapshot_cached(unix, 0, 0, 0)
            sun = next(body for body in emitted["bodies"] if body["name"] == "Sun")
            self.assertEqual(sun["az_deg"], 11.25)
            self.assertEqual(sun["compass"], "NNE")
            self.assertEqual(validator.validate(emitted), [])
            self.assertEqual(old_path.read_text(encoding="utf-8"), old_text)
            # The replacement is reusable without another provider calculation.
            with mock.patch.object(server, "definitive_positions", side_effect=AssertionError("cache miss")):
                self.assertEqual(server.snapshot_cached(unix, 0, 0, 0), emitted)


if __name__ == "__main__":
    unittest.main()
