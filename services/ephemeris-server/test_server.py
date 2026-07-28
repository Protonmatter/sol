#!/usr/bin/env python3
"""Offline contract tests for the optional JPL DE441 provider."""

from __future__ import annotations

import importlib.util
import json
import math
import os
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timezone
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
        self.assertIsNotNone(server.validate_params(4.0e12, 0, 0, 0))
        self.assertIsNotNone(server.validate_params(0, 90.1, 0, 0))
        self.assertIsNotNone(server.validate_params(0, 0, 361, 0))
        self.assertIsNotNone(server.validate_params(0, 0, 0, 100_001))
        self.assertIsNone(server.validate_params(1_783_569_600, 40.71, -74.01, 12))

    def test_time_and_observer_math_known_values_and_pre_utc_branch(self):
        self.assertAlmostEqual(server.gregorian_to_jd(2000, 1, 1), 2451544.5)
        self.assertEqual(server.tai_minus_utc_seconds(2441317.5), 10.0)
        self.assertIsNone(server.tai_minus_utc_seconds(2400000.5))
        self.assertAlmostEqual(server.mean_obliquity_deg(2451545.0), 23.4392794, places=6)
        self.assertAlmostEqual(server.gmst_deg(2451545.0), 280.46061837)
        pre = server.time_block(server.gregorian_to_jd(1960, 1, 1), -74.0)
        self.assertIsNone(pre["jd_tai"])
        self.assertEqual(pre["earth_orientation"]["quality"], "pre_utc_ut1_proxy")
        self.assertEqual(server.refraction_deg(-2), 0)
        self.assertGreater(server.refraction_deg(0), 0)
        self.assertEqual(server.compass(0), "N")
        self.assertEqual(server.compass(90), "E")
        self.assertEqual(server.compass(-90), "W")

    def test_horizons_params_and_row_parsing(self):
        when = datetime(2026, 7, 9, tzinfo=timezone.utc)
        params = server._horizons_params(when, "301", "coord@399", "2,4,20", "1,2,0")
        self.assertEqual(params["COMMAND"], "'301'")
        self.assertEqual(params["COORD_TYPE"], "'GEODETIC'")
        self.assertNotIn("SITE_COORD", server._horizons_params(when, "301", "500@399", "2,20"))
        self.assertEqual(server._data_row("head\n$$SOE\n first\nsecond\n$$EOE\n"), "first")
        with self.assertRaises(ValueError):
            server._data_row("missing markers")

    def test_fetch_body_parses_topocentric_and_geocentric_rows(self):
        topo = "$$SOE\n2026 1 2 3 4 12.5 -3.25 87.0 45.0 0.00257 0\n$$EOE"
        geo = "$$SOE\n2026 1 2 3 4 11.9 -3.1 0 0\n$$EOE"
        with mock.patch.object(server, "_request_text", side_effect=[topo, geo]):
            body = server.fetch_body(datetime.now(timezone.utc), 10, 20, 30, "301")
        self.assertEqual(body["topocentric_ra"], 12.5)
        self.assertEqual(body["geocentric_ra"], 11.9)
        self.assertEqual(body["distance_au"], 0.00257)
        with mock.patch.object(server, "_request_text", return_value="$$SOE\n1 2\n$$EOE"):
            with self.assertRaises(ValueError):
                server.fetch_body(datetime.now(timezone.utc), 0, 0, 0, "301")
        enough_topo = "$$SOE\n1 2 3 4 5 6\n$$EOE"
        with mock.patch.object(server, "_request_text", side_effect=[enough_topo, "$$SOE\n1 2\n$$EOE"]):
            with self.assertRaises(ValueError):
                server.fetch_body(datetime.now(timezone.utc), 0, 0, 0, "301")

    def test_definitive_positions_runs_every_body(self):
        def one(_when, _lat, _lon, _elev, hid):
            return {"hid": hid}
        with mock.patch.object(server, "fetch_body", side_effect=one):
            positions = server.definitive_positions(datetime.now(timezone.utc), 0, 0, 0)
        self.assertEqual(set(positions), {body[0] for body in server.BODIES})
        self.assertEqual(positions["Moon"]["hid"], "301")

    def test_cache_round_trip_bad_entry_and_eviction(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(server, "CACHE_DIR", tmp), \
                 mock.patch.object(server, "build_snapshot", return_value={"schema_version": server.SCHEMA_VERSION, "value": 1}) as build:
                first = server.snapshot_cached(123.9, 1, 2, 3)
                second = server.snapshot_cached(123.1, 1, 2, 3)
                self.assertEqual(first, second)
                self.assertEqual(build.call_count, 1)
                path = server.cache_path(123, 1, 2, 3)
                Path(path).write_text("{bad", encoding="utf-8")
                server.snapshot_cached(123, 1, 2, 3)
                self.assertEqual(build.call_count, 2)

                for index in range(4):
                    p = Path(tmp) / f"{index}.json"
                    p.write_text("{}", encoding="utf-8")
                    os.utime(p, (index, index))
                server.evict_cache(2)
                self.assertEqual(len(list(Path(tmp).glob("*.json"))), 2)

    def test_request_retries_transient_errors_and_raises_permanent_errors(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"ok"
        with mock.patch.object(server.urllib.request, "urlopen", side_effect=[urllib.error.URLError("late"), response]), \
             mock.patch.object(server.time, "sleep") as sleep:
            self.assertEqual(server._request_text({"a": "b"}), "ok")
            sleep.assert_called_once()
        permanent = urllib.error.HTTPError("url", 400, "bad", {}, None)
        with mock.patch.object(server.urllib.request, "urlopen", side_effect=permanent):
            with self.assertRaises(urllib.error.HTTPError):
                server._request_text({})
        transient_http = urllib.error.HTTPError("url", 429, "late", {}, None)
        with mock.patch.object(server.urllib.request, "urlopen", side_effect=transient_http), \
             mock.patch.object(server.time, "sleep"):
            with self.assertRaises(urllib.error.HTTPError):
                server._request_text({})
        with mock.patch.object(server.urllib.request, "urlopen", side_effect=TimeoutError()), \
             mock.patch.object(server.time, "sleep"):
            with self.assertRaises(TimeoutError):
                server._request_text({})

    def test_handler_routes_and_failure_contract(self):
        handler = object.__new__(server.Handler)
        sent = []
        handler._send = lambda code, payload: sent.append((code, payload))
        for path, expected in [
            ("/health", 200),
            ("/missing", 404),
            ("/v2/sky", 400),
            ("/v2/sky?unix=0&lat=91", 400),
        ]:
            handler.path = path
            handler.do_GET()
            self.assertEqual(sent[-1][0], expected)
        handler.path = "/v1/sky?unix=1783569600&lat=1&lon=2&elev=3"
        with mock.patch.object(server, "snapshot_cached", return_value={"ok": True}):
            handler.do_GET()
        self.assertEqual(sent[-1], (200, {"ok": True}))
        with mock.patch.object(server, "snapshot_cached", side_effect=RuntimeError("offline")):
            handler.do_GET()
        self.assertEqual(sent[-1][0], 502)
        self.assertEqual(sent[-1][1]["detail"], "offline")
        handler.do_OPTIONS()
        self.assertEqual(sent[-1], (204, {}))

    def test_handler_serialization_headers_and_quiet_logging(self):
        handler = object.__new__(server.Handler)
        calls = []
        handler.send_response = lambda code: calls.append(("status", code))
        handler.send_header = lambda key, value: calls.append((key, value))
        handler.end_headers = lambda: calls.append(("end",))
        handler.wfile = mock.MagicMock()
        handler._send(200, {"ok": True})
        self.assertIn(("Content-Type", "application/json"), calls)
        self.assertIn(("Access-Control-Allow-Origin", "*"), calls)
        handler.wfile.write.assert_called_once_with(b'{"ok": true}')
        self.assertIsNone(handler.log_message("ignored %s", "line"))


if __name__ == "__main__":
    unittest.main()
