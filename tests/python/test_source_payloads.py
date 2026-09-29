"""Provider transport success must not be confused with usable observations."""
from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import data_bundles as bundles
import fetch_public_data as acquisition
import run_daily_ingest as daily


class SourcePayloadTests(unittest.TestCase):
    def endpoints(self):
        return acquisition.build_endpoints(include_jpl=False, start_date=date(2026, 9, 28))[:2]

    def payload(self, product: str, **overrides) -> bytes:
        row = {"time_tag": "2026-09-28T12:00:00Z", "source": "fixture", "active": True}
        row["bz_gsm" if product == "rtsw_mag_1m.json" else "proton_speed"] = -2 if product == "rtsw_mag_1m.json" else 400
        row.update(overrides)
        return bundles.json_bytes([row])

    def test_critical_products_reject_error_envelopes_and_unusable_rows(self):
        for endpoint in self.endpoints():
            key = "bz_gsm" if endpoint.file == "rtsw_mag_1m.json" else "proton_speed"
            invalid = [
                b'{"error":"upstream unavailable"}', b'[1,2]', b'[{}]', b'[]',
                self.payload(endpoint.file, time_tag="not-a-time"),
                self.payload(endpoint.file, time_tag=None),
                self.payload(endpoint.file, active=False),
                self.payload(endpoint.file, source="unknown"),
                self.payload(endpoint.file, source="   "),
                self.payload(endpoint.file, source=None),
                self.payload(endpoint.file, source=True),
                self.payload(endpoint.file, **{key: None}),
                self.payload(endpoint.file, **{key: True}),
                self.payload(endpoint.file, **{key: "Infinity"}),
                self.payload(endpoint.file, **{key: "unavailable"}),
            ]
            for raw in invalid:
                with self.subTest(product=endpoint.file, raw=raw), self.assertRaises(ValueError):
                    acquisition.validate_payload(endpoint.file, raw)

    def test_critical_products_accept_real_source_shapes_and_legacy_utc_clocks(self):
        for endpoint in self.endpoints():
            for clock in ("2026-09-28T12:00:00Z", "2026-09-28T12:00:00", "2026-09-28T12:00:00+00:00"):
                with self.subTest(product=endpoint.file, clock=clock):
                    acquisition.validate_payload(endpoint.file, self.payload(endpoint.file, time_tag=clock))
            fixture = ROOT / "tests/swpc_scn26_21" / endpoint.file.replace(".json", "_new.json")
            acquisition.validate_payload(endpoint.file, fixture.read_bytes())
            inherited = json.loads(self.payload(endpoint.file))
            del inherited[0]["source"]  # A missing field inherits endpoint attribution.
            acquisition.validate_payload(endpoint.file, bundles.json_bytes(inherited))
        # A bad or inactive instrument row cannot hide an eligible row in the same product.
        good = json.loads(self.payload("rtsw_mag_1m.json"))[0]
        acquisition.validate_payload("rtsw_mag_1m.json", bundles.json_bytes([
            {"time_tag": "bad", "bz_gsm": None}, {**good, "active": False}, good,
        ]))

    def test_optional_event_absence_is_valid_but_error_objects_are_not(self):
        for product in ("solar_regions.json", "sunspot_report.json", "goes_xray_flares_7_day.json"):
            with self.subTest(product=product):
                acquisition.validate_payload(product, b"[]")
                for raw in (b'{"error":"maintenance"}', b'[{"error":"maintenance"}]', b'[null]'):
                    with self.assertRaises(ValueError):
                        acquisition.validate_payload(product, raw)
        for product in ("helioviewer_datasources.json", "jpl_horizons_sun_earth.json"):
            with self.subTest(product=product), self.assertRaises(ValueError):
                acquisition.validate_payload(product, b'{"error":"maintenance"}')

    def test_invalid_current_payload_keeps_source_and_derived_selection(self):
        with tempfile.TemporaryDirectory(prefix="sol-payload-") as tmp:
            root = Path(tmp)
            endpoints = self.endpoints()
            with mock.patch.object(acquisition, "build_endpoints", return_value=endpoints), mock.patch.object(
                acquisition, "fetch", side_effect=[self.payload(e.file) for e in endpoints]
            ):
                source = acquisition.acquire_bundle(root / "source", bundle_id="accepted", stamp=date(2026, 9, 28), acquired_at_utc="2026-09-28T12:00:00Z")
            daily.derive_bundle(source, root / "derived", bundle_id="accepted", generated_at_utc="2026-09-28T12:00:00Z", seed=42)
            before = (root / "derived/current.json").read_bytes()
            argv = ["daily", "--cache", str(root / "source"), "--web-data", str(root / "derived"), "--fail-on-degraded"]
            with mock.patch.object(sys, "argv", argv), mock.patch.object(acquisition, "build_endpoints", return_value=endpoints), mock.patch.object(
                acquisition, "fetch", return_value=b'{"error":"upstream unavailable"}'
            ), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(daily.main(), 1)
            self.assertEqual((root / "derived/current.json").read_bytes(), before)
            retained = bundles.resolve_source_bundle(root / "source/current.json")
            self.assertEqual([c.raw for c in retained.components], [c.raw for c in source.components])
            products = json.loads(retained.manifest_raw)["products"]
            self.assertTrue(all(p["origin"] == "cached-fallback" and p["failure"] for p in products))
            self.assertTrue(list((root / "derived/attempts").glob("*.json")))

    def test_invalid_first_acquisition_cannot_select_a_candidate(self):
        with tempfile.TemporaryDirectory(prefix="sol-payload-") as tmp:
            root = Path(tmp)
            argv = ["daily", "--cache", str(root / "source"), "--web-data", str(root / "derived"), "--fail-on-degraded"]
            with mock.patch.object(sys, "argv", argv), mock.patch.object(acquisition, "build_endpoints", return_value=self.endpoints()), mock.patch.object(
                acquisition, "fetch", return_value=b'{"error":"upstream unavailable"}'
            ), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(daily.main(), 1)
            self.assertFalse((root / "source/current.json").exists())
            self.assertFalse((root / "derived/current.json").exists())
            self.assertTrue(list((root / "derived/attempts").glob("*.json")))


if __name__ == "__main__":
    unittest.main()
