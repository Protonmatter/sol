#!/usr/bin/env python3
"""Offline contract tests for the optional JPL DE441 provider."""

from __future__ import annotations

import importlib.util
import copy
import io
import json
import math
import os
import subprocess
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
    when, lat, lon = _args[:3] if len(_args) >= 3 else (datetime.fromtimestamp(1783569600, timezone.utc), 40.71, -74.01)
    lst = server.time_block(when.timestamp() / 86400 + 2440587.5, lon)["lst_deg"]
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
            "geocentric_range_km": (0.00257 if moon else 0.8 + 0.3 * index) * server.AU_KM,
            "observer_range_km": (0.00254 if moon else 0.8 + 0.3 * index) * server.AU_KM,
        }
        item = result[name]
        hour, dec, phi = map(math.radians, (lst-item["topocentric_ra"], item["topocentric_dec"], lat))
        item["alt"] = math.degrees(math.asin(math.sin(phi)*math.sin(dec)+math.cos(phi)*math.cos(dec)*math.cos(hour)))
        item["az"] = math.degrees(math.atan2(-math.cos(dec)*math.sin(hour), math.sin(dec)*math.cos(phi)-math.sin(phi)*math.cos(dec)*math.cos(hour))) % 360
    return result


class ServerContractTests(unittest.TestCase):
    def build(self):
        with mock.patch.object(server, "definitive_positions", side_effect=fake_positions):
            return server.build_snapshot(1_783_569_600.0, 40.71, -74.01, 12.0)

    def test_server_emits_valid_provider_neutral_v3(self):
        snapshot = self.build()
        self.assertEqual(snapshot["schema_version"], "ephemeris-snapshot.v3")
        self.assertEqual(snapshot["provider"]["endpoint_contract"], "ephemeris-snapshot.v3")
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
            self.assertIn("events", body)
            for event in body["events"].values():
                self.assertIsNone(event["jd"])
                self.assertEqual(event["calculation_status"], "not_calculated")
                self.assertEqual(event["occurrence_status"], "unknown")
            self.assertIsNone(body["events"]["transit"]["altitude_deg"])

    def test_server_ranges_keep_independent_coordinate_origins(self):
        topo = "$$SOE\n2461230.500000000 12.5 -3.25 87.0 45.0 0.0026 0\n$$EOE"
        geo = "$$SOE\n2461230.500000000 11.9 -3.1 0.0027 0\n$$EOE"
        with mock.patch.object(server, "_request_text", side_effect=[topo, geo]):
            item = server.fetch_body(datetime(2026, 7, 9, tzinfo=timezone.utc), 0, 0, 0, "301")
        self.assertIn("geocentric_range_km", item)
        self.assertAlmostEqual(item["geocentric_range_km"], 403914.25089, places=5)
        self.assertAlmostEqual(item["observer_range_km"], 388954.46382, places=5)

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

    def test_historical_calendar_uses_explicit_jd_and_rejects_wrong_epoch(self):
        when = datetime(1500, 3, 1, tzinfo=timezone.utc)
        params = server._horizons_params(when, "301", "500@399", "2,20")
        self.assertEqual(params.get("TLIST_TYPE"), "'JD'")
        self.assertEqual(params.get("TIME_TYPE"), "'UT'")
        self.assertEqual(float(params["TLIST"].strip("'")), 2268982.5)
        self.assertFalse({"START_TIME", "STOP_TIME", "STEP_SIZE"} & params.keys())

    def test_historical_response_epoch_mismatch_is_rejected(self):
        when = datetime(1500, 3, 1, tzinfo=timezone.utc)
        wrong = "$$SOE\n2268992.500000000 12.5 -3.25 87.0 45.0 0.00257 0\n$$EOE"
        with mock.patch.object(server, "_request_text", return_value=wrong):
            with self.assertRaisesRegex(ValueError, "epoch"):
                server.fetch_body(when, 10, 20, 30, "301")

    def test_unsupported_datetime_rejected_before_provider_work(self):
        self.assertIsNotNone(server.validate_params(253402300800.0, 0, 0, 0))

    def test_historical_build_retains_calendar_and_degraded_time(self):
        with mock.patch.object(server, "definitive_positions", side_effect=fake_positions):
            snapshot = server.build_snapshot(-14826672000.0, 42.36, -71.06, 10)
        self.assertEqual(snapshot["time"]["jd_utc"], 2268982.5)
        self.assertEqual(snapshot["time"]["earth_orientation"]["quality"], "pre_utc_ut1_proxy")
        self.assertIsNone(snapshot["time"]["jd_tai"])
        self.assertEqual(validator.validate(snapshot), [])

    def test_response_epoch_precision_and_both_coordinate_rows(self):
        expected = 2461230.500001
        self.assertTrue(server._verified_row("$$SOE\n2461230.50000 1 2\n$$EOE", expected))
        for token in ["2461230.5001", "2461230.5", "2461230.50000101"]:
            with self.subTest(token=token), self.assertRaisesRegex(ValueError, "epoch"):
                server._verified_row(f"$$SOE\n{token} 1 2\n$$EOE", expected + (2/86400 if token == "2461230.5" else 0))
        topo = "$$SOE\n2461230.500000000 12.5 -3.25 87.0 45.0 0.00257 0\n$$EOE"
        for geo in ["2461231.500000000 11.9 -3.1 0 0", "2461230.500000000 1 2"]:
            with mock.patch.object(server, "_request_text", side_effect=[topo, f"$$SOE\n{geo}\n$$EOE"]):
                with self.assertRaises(ValueError):
                    server.fetch_body(datetime(2026, 7, 9, tzinfo=timezone.utc), 10, 20, 30, "301")
        with mock.patch.object(server, "definitive_positions") as provider:
            with self.assertRaises(ValueError):
                server.build_snapshot(253402300800.0, 0, 0, 0)
            provider.assert_not_called()
        self.assertIsNotNone(server.validate_params(253402300800.0, 0, 0, 0))

    def test_fetch_body_parses_topocentric_and_geocentric_rows(self):
        when = datetime(2026, 7, 9, tzinfo=timezone.utc)
        topo = "$$SOE\n2461230.500000000 12.5 -3.25 87.0 45.0 0.00257 0\n$$EOE"
        geo = "$$SOE\n2461230.500000000 11.9 -3.1 0 0\n$$EOE"
        with mock.patch.object(server, "_request_text", side_effect=[topo, geo]):
            body = server.fetch_body(when, 10, 20, 30, "301")
        self.assertEqual(body["topocentric_ra"], 12.5)
        self.assertEqual(body["geocentric_ra"], 11.9)
        self.assertEqual(body["observer_range_km"], 0.00257 * server.AU_KM)
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
                 mock.patch.object(server, "definitive_positions", side_effect=fake_positions) as provider:
                first = server.snapshot_cached(123.9, 1, 2, 3)
                second = server.snapshot_cached(123.9, 1, 2, 3)
                self.assertEqual(first, second)
                self.assertEqual(validator.validate(first), [])
                self.assertEqual(provider.call_count, 1)
                path = server.cache_path(123.9, 1, 2, 3)
                Path(path).write_text("{bad", encoding="utf-8")
                server.snapshot_cached(123.9, 1, 2, 3)
                self.assertEqual(provider.call_count, 2)

                for index in range(4):
                    p = Path(tmp) / f"{index}.json"
                    p.write_text("{}", encoding="utf-8")
                    os.utime(p, (index, index))
                server.evict_cache(2)
                self.assertEqual(len(list(Path(tmp).glob("*.json"))), 2)

    def test_cache_preserves_exact_epoch_and_observer(self):
        self.assertNotEqual(server.cache_path(123.1,1,2,3), server.cache_path(123.9,1,2,3))
        self.assertNotEqual(server.cache_path(123,1.00001,2,3), server.cache_path(123,1.00002,2,3))
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(server,"CACHE_DIR",tmp), mock.patch.object(server,"definitive_positions",side_effect=fake_positions):
            snapshot = server.snapshot_cached(123.9,1.00001,2,3)
            self.assertEqual(snapshot["observer"]["terrestrial_lat_deg"], 1.00001)
            self.assertEqual(snapshot["observer"]["terrestrial_lon_deg_east"], 2)
            self.assertEqual(snapshot["observer"]["elev_m"], 3)
            self.assertEqual(validator.validate(snapshot), [])

    def test_corrupt_cache_is_replaced_once_with_a_complete_valid_snapshot(self):
        args = (1_783_569_600.0, 40.71, -74.01, 12.0)
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(server, "CACHE_DIR", tmp):
            with mock.patch.object(server, "definitive_positions", side_effect=fake_positions):
                healthy = server.snapshot_cached(*args)
            path = Path(server.cache_path(*args))
            stored = json.loads(path.read_bytes())

            def changed_snapshot(edit):
                document = copy.deepcopy(stored)
                # Exercise both the legacy file and the replacement envelope during migration.
                snapshot = document.get("snapshot", document)
                edit(snapshot)
                return json.dumps(document).encode()

            corruptions = {
                "parseable truncated contract": changed_snapshot(lambda snapshot: snapshot.pop("bodies")),
                "wrong version": changed_snapshot(lambda snapshot: snapshot.update(schema_version="ephemeris-snapshot.v2")),
                "wrong epoch": changed_snapshot(lambda snapshot: snapshot["time"].update(jd_utc=2_461_234.5)),
                "wrong latitude": changed_snapshot(lambda snapshot: snapshot["observer"].update(terrestrial_lat_deg=40.72)),
                "wrong longitude": changed_snapshot(lambda snapshot: snapshot["observer"].update(terrestrial_lon_deg_east=-74.02)),
                "wrong elevation": changed_snapshot(lambda snapshot: snapshot["observer"].update(elev_m=13.0)),
                "nonfinite": changed_snapshot(lambda snapshot: snapshot["observer"].update(elev_m=float("nan"))),
                "duplicate key": json.dumps(stored).encode().replace(b'"elev_m": 12.0', b'"elev_m": 13.0, "elev_m": 12.0'),
                "overflow number": json.dumps(stored).encode().replace(b'"elev_m": 12.0', b'"elev_m": 1e999'),
                "integer exceeds binary64": changed_snapshot(lambda snapshot: snapshot["time"].update(jd_tt=10 ** 400)),
                "wrong time container": changed_snapshot(lambda snapshot: snapshot.update(time=[])),
                "wrong observer container": changed_snapshot(lambda snapshot: snapshot.update(observer=None)),
                "oversized": json.dumps(stored).encode() + b" " * (server.MAX_RESPONSE_BYTES + 1),
                "invalid utf8": b"\xff",
                "invalid json": b'{"schema_version":',
                "excessive nesting": b"[" * 2000 + b"]" * 2000,
            }
            for reason, raw in corruptions.items():
                with self.subTest(reason=reason):
                    path.write_bytes(raw)
                    with mock.patch.object(server, "definitive_positions", side_effect=fake_positions) as provider:
                        repaired = server.snapshot_cached(*args)
                        self.assertEqual(repaired, healthy)
                        self.assertEqual(provider.call_count, 1, "corrupt entry must rebuild exactly once")
                    with mock.patch.object(server, "definitive_positions", side_effect=AssertionError("repaired cache missed")):
                        self.assertEqual(server.snapshot_cached(*args), healthy)

    def test_cache_copied_between_exact_requests_is_not_reused(self):
        unix = 1_783_569_600.0
        nearby = math.nextafter(unix, math.inf)
        self.assertEqual(unix / 86400 + 2440587.5, nearby / 86400 + 2440587.5)
        for original, requested in [
            ((unix, 40.71, -74.01, 12.0), (nearby, 40.71, -74.01, 12.0)),
            ((unix, 40.71, -74.01, 12.0), (unix, 40.71, -74.01, 13.0)),
        ]:
            with self.subTest(requested=requested), tempfile.TemporaryDirectory() as tmp, mock.patch.object(server, "CACHE_DIR", tmp):
                with mock.patch.object(server, "definitive_positions", side_effect=fake_positions):
                    server.snapshot_cached(*original)
                source = Path(server.cache_path(*original))
                target = Path(server.cache_path(*requested))
                target.write_bytes(source.read_bytes())
                with mock.patch.object(server, "definitive_positions", side_effect=fake_positions) as provider:
                    actual = server.snapshot_cached(*requested)
                    self.assertEqual(provider.call_count, 1, "exact request identity must match, even when JD rounds identically")
                    self.assertEqual(actual["observer"]["elev_m"], requested[3])
                with mock.patch.object(server, "definitive_positions", side_effect=AssertionError("healthy cache missed")):
                    self.assertEqual(server.snapshot_cached(*requested), actual)

    def test_corrupt_cache_rebuild_failure_does_not_return_corrupt_data(self):
        args = (1_783_569_600.0, 40.71, -74.01, 12.0)
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(server, "CACHE_DIR", tmp):
            path = Path(server.cache_path(*args))
            path.write_text('{"schema_version":"ephemeris-snapshot.v3","corrupt":true}', encoding="utf-8")
            with mock.patch.object(server, "definitive_positions", side_effect=server.ProviderError("upstream_failed", "offline")) as provider:
                with self.assertRaises(server.ProviderError):
                    server.snapshot_cached(*args)
                self.assertEqual(provider.call_count, 1)

    def test_cache_read_is_bounded_before_parsing(self):
        args = (1_783_569_600.0, 40.71, -74.01, 12.0)
        reads = []

        class BoundedReader(io.BytesIO):
            def read(self, size=-1):
                reads.append(size)
                if size < 0 or size > server.MAX_RESPONSE_BYTES + 1:
                    raise AssertionError("cache read must have a finite byte budget")
                return super().read(size)

        original_open = open
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(server, "CACHE_DIR", tmp):
            path = Path(server.cache_path(*args))
            path.write_bytes(b" ")

            def open_cache(filename, *open_args, **kwargs):
                if os.fspath(filename) == str(path):
                    return BoundedReader(b" " * (server.MAX_RESPONSE_BYTES + 1))
                return original_open(filename, *open_args, **kwargs)

            with mock.patch("builtins.open", side_effect=open_cache), mock.patch.object(server, "definitive_positions", side_effect=fake_positions):
                rebuilt = server.snapshot_cached(*args)
            self.assertEqual(reads, [server.MAX_RESPONSE_BYTES + 1])
            self.assertEqual(validator.validate(rebuilt), [])

    def test_invalid_rebuild_is_not_published_or_cached(self):
        args = (1_783_569_600.0, 40.71, -74.01, 12.0)
        healthy = self.build()
        invalid = copy.deepcopy(healthy)
        invalid["observer"]["elev_m"] = 13.0
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(server, "CACHE_DIR", tmp):
            with mock.patch.object(server, "build_snapshot", return_value=invalid):
                with self.assertRaisesRegex(server.ProviderError, "contract or request"):
                    server.snapshot_cached(*args)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_repository_provider_imports_shared_contract_from_another_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [sys.executable, "-I", str(Path(__file__).with_name("server.py")), "--help"],
                cwd=tmp, capture_output=True, text=True, timeout=15, check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--port", result.stdout)

    def test_malformed_rebuild_reports_invalid_snapshot_without_raw_validation_errors(self):
        args = (1_783_569_600.0, 40.71, -74.01, 12.0)
        deep_container = []
        for _ in range(2000):
            deep_container = [deep_container]
        corruptions = {
            "integer exceeds binary64": lambda snapshot: snapshot["time"].update(jd_tt=10 ** 400),
            "wrong time container": lambda snapshot: snapshot.update(time=[]),
            "wrong observer container": lambda snapshot: snapshot.update(observer=None),
            "excessive nesting": lambda snapshot: snapshot.update(warnings=deep_container),
        }
        healthy = self.build()
        for reason, corrupt in corruptions.items():
            with self.subTest(reason=reason), tempfile.TemporaryDirectory() as tmp, mock.patch.object(server, "CACHE_DIR", tmp):
                invalid = copy.deepcopy(healthy)
                corrupt(invalid)
                with mock.patch.object(server, "build_snapshot", return_value=invalid):
                    with self.assertRaises(server.ProviderError) as raised:
                        server.snapshot_cached(*args)
                self.assertEqual(raised.exception.code, "invalid_snapshot")
                self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_contract_resource_io_errors_are_not_classified_as_malformed_snapshot(self):
        with mock.patch.object(server, "validate_snapshot", side_effect=OSError("schema unavailable")):
            with self.assertRaisesRegex(OSError, "schema unavailable"):
                server.snapshot_matches_request(self.build(), 1_783_569_600.0, 40.71, -74.01, 12.0)

    def test_request_retries_transient_errors_and_raises_permanent_errors(self):
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(b"ok")
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
            ("/v2/sky", 409),
            ("/v1/sky", 409),
            ("/v3/sky", 400),
            ("/v3/sky?unix=0&lat=91", 400),
        ]:
            handler.path = path
            handler.do_GET()
            self.assertEqual(sent[-1][0], expected)
        handler.path = "/v3/sky?unix=1783569600&lat=1&lon=2&elev=3"
        with mock.patch.object(server, "snapshot_cached", return_value={"ok": True}):
            handler.do_GET()
        self.assertEqual(sent[-1], (200, {"ok": True}))
        with mock.patch.object(server, "snapshot_cached", side_effect=RuntimeError("offline")):
            handler.do_GET()
        self.assertEqual(sent[-1][0], 502)
        self.assertEqual(sent[-1][1]["code"], "upstream_failed")
        self.assertNotIn("offline", str(sent[-1]))
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
