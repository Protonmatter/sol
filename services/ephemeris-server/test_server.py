#!/usr/bin/env python3
"""Offline contract tests for the optional JPL DE441 provider."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


server = load_module("sol_ephemeris_server", Path(__file__).with_name("server.py"))
validator = load_module("sol_ephemeris_validator", TOOLS / "validate_ephemeris_snapshot.py")


def fake_positions(*_args):
    result = {}
    for index, (name, _hid, _kind, _radius) in enumerate(server.BODIES):
        moon = name == "Moon"
        result[name] = {
            "geocentric_ra": (12.0 + 31.0 * index) % 360.0,
            "geocentric_dec": -18.0 + 4.0 * index,
            "topocentric_ra": (12.0 + 31.0 * index + (0.55 if moon else 0.002)) % 360.0,
            "topocentric_dec": -18.0 + 4.0 * index + (0.22 if moon else 0.001),
            "az": (17.0 + 37.0 * index) % 360.0,
            "alt": -12.0 + 10.0 * index,
            "distance_au": 0.00257 if moon else 0.8 + 0.3 * index,
        }
    return result


class ServerContractTests(unittest.TestCase):
    def build(self):
        with mock.patch.object(server, "definitive_positions", side_effect=fake_positions):
            return server.build_snapshot(1_783_569_600.0, 40.71, -74.01, 12.0)

    def test_server_emits_valid_provider_neutral_v2(self):
        snapshot = self.build()
        self.assertEqual(snapshot["schema_version"], "ephemeris-snapshot.v2")
        self.assertEqual(snapshot["provider"]["endpoint_contract"], "ephemeris-snapshot.v2")
        self.assertEqual(snapshot["provider"]["tier"], "server")
        self.assertEqual(validator.validate(snapshot), [])

    def test_moon_topocentric_coordinates_are_not_geocentric_aliases(self):
        moon = next(body for body in self.build()["bodies"] if body["name"] == "Moon")
        separation = abs(
            moon["topocentric_apparent_ra_deg"] - moon["geocentric_apparent_ra_deg"]
        ) + abs(
            moon["topocentric_apparent_dec_deg"] - moon["geocentric_apparent_dec_deg"]
        )
        self.assertGreater(separation, 1.0e-6)

    def test_server_declares_nullable_events_instead_of_fabricating_them(self):
        for body in self.build()["bodies"]:
            self.assertIsNone(body["rise_jd"])
            self.assertIsNone(body["transit_jd"])
            self.assertIsNone(body["set_jd"])
            self.assertIsNone(body["transit_alt_deg"])

    def test_time_metadata_is_internally_consistent_and_degraded(self):
        time = self.build()["time"]
        self.assertEqual(time["earth_orientation"]["quality"], "degraded")
        self.assertAlmostEqual(
            time["jd_ut1"],
            time["jd_utc"] + time["dut1_seconds"] / 86_400.0,
            places=9,
        )
        self.assertAlmostEqual(
            time["delta_t_seconds"],
            (time["jd_tt"] - time["jd_ut1"]) * 86_400.0,
            places=4,
        )

    def test_parameter_validation_rejects_nonfinite_and_out_of_range_values(self):
        self.assertIsNotNone(server.validate_params(float("nan"), 0, 0, 0))
        self.assertIsNotNone(server.validate_params(0, 90.1, 0, 0))
        self.assertIsNotNone(server.validate_params(0, 0, 361, 0))
        self.assertIsNone(server.validate_params(1_783_569_600, 40.71, -74.01, 12))


if __name__ == "__main__":
    unittest.main()
