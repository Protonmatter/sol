"""Offline behavioral regressions for manifest attribution during daily derivation."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import data_bundles as bundles
import generate_fixture_snapshot as generator
import run_daily_ingest as daily


class BundleObservationProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sol-attribution-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def source(self, row_source: dict, bundle_id: str = "source", rows_by_name: dict | None = None):
        rows_by_name = rows_by_name or {}
        products = []
        for name in dict.fromkeys(("rtsw_mag_1m.json", "rtsw_wind_1m.json", "f107_cm_flux.json", *rows_by_name)):
            row = {"time_tag": "2026-09-11T00:00:00Z", **row_source}
            if name == "f107_cm_flux.json":
                row["flux"] = 150.0
            products.append({
                "product_id": name, "source": "offline manifest " + name,
                "origin": "cached-fallback", "observation_time_utc": row["time_tag"],
                "retrieved_at_utc": None, "quality": ["synthetic offline regression payload"],
                "failure": "offline test", "license": "synthetic test data", "critical": True,
                "payload": bundles.json_bytes(rows_by_name.get(name, [row])),
            })
        return bundles.create_source_bundle(self.root / "source", bundle_id=bundle_id,
            acquired_at_utc="2026-09-11T00:00:00Z", products=products)

    def report(self, source):
        return generator.build_bundle_observation_report(source, evaluated_at_utc="2026-09-11T01:00:00Z")

    def test_daily_derivation_preserves_manifest_attributed_evidence_and_raw_payloads(self):
        source = self.source({})
        captured = {item.role: item.raw for item in source.components}
        report = self.report(source)
        self.assertEqual(report["observed_context"]["activity_index"], 0.5)
        self.assertEqual(report["frames"][2]["provenance"]["source"], "offline manifest f107_cm_flux.json")
        derived = daily.derive_bundle(source, self.root / "derived", bundle_id="derived",
            generated_at_utc="2026-09-11T01:00:00Z", seed=42)
        snapshot = json.loads(derived.component("snapshot").raw)
        published_report = json.loads(derived.component("observations").raw)
        self.assertEqual(published_report, report)
        self.assertEqual(snapshot["observations"], [report])
        self.assertEqual(snapshot["observed_context"], report["observed_context"])
        self.assertEqual(snapshot["run"]["activity_index"], 0.5)
        self.assertEqual(len(report["frames"]), 3)
        for frame in report["frames"]:
            self.assertNotIn("source", frame["provenance"]["raw_source_metadata"])
        for item in source.components:
            self.assertEqual(item.raw, captured[item.role])
            self.assertEqual(item.path.read_bytes(), captured[item.role])
            self.assertNotIn("source", json.loads(item.raw)[0])

    def test_explicit_row_source_takes_precedence_over_manifest(self):
        report = self.report(self.source({"source": "row observatory"}))
        snapshot = generator.build_snapshot(42, 12, 6, report)
        self.assertEqual(snapshot["observations"], [report])
        for frame in report["frames"]:
            self.assertEqual(frame["provenance"]["source"], "row observatory")
            self.assertEqual(frame["provenance"]["raw_source_metadata"]["source"], "row observatory")

    def test_explicit_invalid_sources_are_never_rescued_or_attached(self):
        for index, invalid in enumerate((None, "", " \t ", "unknown", " UNKNOWN ", 7, True, [], {})):
            with self.subTest(source=invalid):
                report = self.report(self.source({"source": invalid}, bundle_id=f"invalid-{index}"))
                snapshot = generator.build_snapshot(42, 12, 6, report)
                self.assertEqual(len(report["frames"]), 3)
                for frame in report["frames"]:
                    self.assertEqual(frame["provenance"]["source"], invalid)
                    self.assertEqual(frame["provenance"]["raw_source_metadata"]["source"], invalid)
                self.assertEqual(snapshot["observations"][0]["frames"], [])
                context = report["observed_context"]
                self.assertIsNone(context["space_weather_signals"]["latest_f107"])
                self.assertEqual(context["activity_proxy_sources"]["f107_cm_flux_rows"], 0)
                self.assertEqual(context["signal_freshness"], {})
                self.assertEqual(snapshot["run"]["activity_index"], 0.9)
                self.assertEqual(len(snapshot["active_regions"]), 34)

    def test_newer_invalid_row_cannot_override_attributable_context_or_evidence(self):
        payload = [
            {"time_tag": "2026-09-11T00:00:00Z", "source": " UNKNOWN ", "flux": 235.0,
             "active": False, "instrument": "unattributed instrument"},
            {"time_tag": "2026-09-10T00:00:00Z", "source": "older observatory", "flux": 150.0,
             "active": True, "instrument": "attributed instrument"},
        ]
        source = self.source({}, rows_by_name={"f107_cm_flux.json": payload})
        raw = source.component("f107_cm_flux.json").raw
        manifest_raw = source.manifest_raw
        report = self.report(source)
        daily.derive_bundle(source, self.root / "derived", bundle_id="derived",
            generated_at_utc="2026-09-11T01:00:00Z", seed=42)
        derived = bundles.resolve_derived_bundle(self.root / "derived" / "current.json")
        snapshot = json.loads(derived.component("snapshot").raw)
        self.assertEqual(json.loads(derived.component("observations").raw), report)
        context = report["observed_context"]
        self.assertEqual(context["space_weather_signals"]["latest_f107"], 150.0)
        self.assertEqual(context["activity_proxy_sources"]["f107_cm_flux_rows"], 1)
        self.assertEqual(snapshot["run"]["activity_index"], 0.5)
        self.assertEqual(len(snapshot["active_regions"]), 25)
        frame = next(frame for frame in snapshot["observations"][0]["frames"] if frame["id"] == "swpc-f107-cm-flux")
        self.assertEqual(frame["provenance"]["source"], "older observatory")
        self.assertEqual(frame["provenance"]["time_tag"], "2026-09-10T00:00:00Z")
        self.assertEqual(frame["provenance"]["raw_source_metadata"], {
            "source": "older observatory", "active": True, "instrument": "attributed instrument",
        })
        self.assertEqual(context["signal_freshness"]["swpc-f107-cm-flux"]["latest_time_tag"], "2026-09-10T00:00:00Z")
        self.assertEqual(snapshot["observations"], [report])
        self.assertEqual(snapshot["observed_context"], context)
        self.assertEqual(source.component("f107_cm_flux.json").raw, raw)
        self.assertEqual(source.component("f107_cm_flux.json").path.read_bytes(), raw)
        self.assertEqual(json.loads(raw), payload)
        self.assertEqual(source.manifest_raw, manifest_raw)
        self.assertEqual(frame["raw_bytes"], len(raw))

    def test_numeric_evidence_uses_selected_row_with_manifest_fallback(self):
        cases = (
            ("rtsw_mag_1m.json", "swpc-rtsw-mag-1m", "bz_gsm", "latest_bz_gsm_nt"),
            ("rtsw_wind_1m.json", "swpc-rtsw-wind-1m", "speed", "latest_solar_wind_speed_km_s"),
            ("f107_cm_flux.json", "swpc-f107-cm-flux", "flux", "latest_f107"),
            ("observed-solar-cycle-indices.json", "swpc-observed-cycle-indices", "f10.7", "latest_f107"),
            ("planetary_k_index_1m.json", "swpc-planetary-k-index-1m", "estimated_kp", "latest_kp"),
            ("goes_xrays_1_day.json", "swpc-goes-xrays-1-day", "flux", "latest_goes_xray_flux"),
        )
        for index, (name, frame_id, key, signal) in enumerate(cases):
            with self.subTest(feed=name):
                rows_by_name = {name: [
                    {"time_tag": "2026-09-08T00:00:00Z", "source": "oldest source", key: 100.0},
                    {"time_tag": "2026-09-09T00:00:00Z", "instrument": "selected instrument", key: "150.0"},
                    {"time_tag": "2026-09-10T00:00:00Z", "source": " UNKNOWN ", key: 235.0},
                    {"time_tag": "2026-09-11T00:00:00Z", "source": "newer nonnumeric source", key: "missing"},
                    {"time_tag": "not-a-time", "source": "invalid-clock source", key: 250.0},
                ]}
                if name == "observed-solar-cycle-indices.json":
                    rows_by_name["f107_cm_flux.json"] = [{"source": "unknown", "flux": 235.0}]
                report = self.report(self.source({}, bundle_id=f"numeric-{index}", rows_by_name=rows_by_name))
                snapshot = generator.build_snapshot(42, 12, 6, report)
                self.assertEqual(report["observed_context"]["space_weather_signals"][signal], 150.0)
                frame = next(frame for frame in snapshot["observations"][0]["frames"] if frame["id"] == frame_id)
                self.assertEqual(frame["provenance"]["time_tag"], "2026-09-09T00:00:00Z")
                self.assertEqual(frame["provenance"]["source"], "offline manifest " + name)
                self.assertEqual(frame["provenance"]["raw_source_metadata"], {"instrument": "selected instrument"})
                freshness_id = name if name.startswith("rtsw_") else frame_id
                freshness = report["observed_context"]["signal_freshness"][freshness_id]
                self.assertEqual(freshness["latest_time_tag"], "2026-09-09T00:00:00Z")
                self.assertEqual(freshness["age_hours"], 49.0)
                self.assertTrue(freshness["stale"])

    def test_persisted_bundle_ignores_invalid_clock_and_orders_valid_utc_instants(self):
        payload = [
            {"time_tag": "not-a-time", "source": "invalid-clock source", "flux": 235.0},
            {"time_tag": "2026-09-10T23:59:59.750000Z", "source": "fractional source", "flux": 149.0},
            {"time_tag": "2026-09-11T00:00:00+00:00", "source": "selected source", "flux": "150.0"},
        ]
        source = self.source({}, bundle_id="parsed-clock-source", rows_by_name={"f107_cm_flux.json": payload})
        raw = source.component("f107_cm_flux.json").raw
        derived = daily.derive_bundle(source, self.root / "derived", bundle_id="parsed-clock-derived",
            generated_at_utc="2026-09-11T01:00:00Z", seed=42)
        resolved = bundles.resolve_derived_bundle(self.root / "derived" / "current.json")
        self.assertEqual(resolved.manifest_sha256, derived.manifest_sha256)
        report = json.loads(resolved.component("observations").raw)
        snapshot = json.loads(resolved.component("snapshot").raw)
        frame = next(frame for frame in report["frames"] if frame["id"] == "swpc-f107-cm-flux")
        context = report["observed_context"]
        self.assertEqual(frame["provenance"]["time_tag"], "2026-09-11T00:00:00+00:00")
        self.assertEqual(frame["provenance"]["source"], "selected source")
        self.assertEqual(context["space_weather_signals"]["latest_f107"], 150.0)
        self.assertEqual(context["signal_freshness"]["swpc-f107-cm-flux"], {
            "latest_time_tag": "2026-09-11T00:00:00Z", "age_hours": 1.0, "stale": False,
        })
        self.assertEqual(snapshot["run"]["activity_index"], 0.5)
        self.assertEqual(len(snapshot["active_regions"]), 25)
        self.assertEqual(source.component("f107_cm_flux.json").raw, raw)
        self.assertEqual(json.loads(raw), payload)

    def test_persisted_bundle_retains_bools_without_deriving_numeric_context(self):
        for boolean in (False, True):
            with self.subTest(value=boolean):
                payload = [{"time_tag": "2026-09-11T00:00:00Z", "source": "typed source", "flux": boolean}]
                suffix = str(boolean).lower()
                source = self.source({}, bundle_id=f"bool-{suffix}-source",
                    rows_by_name={"f107_cm_flux.json": payload})
                raw = source.component("f107_cm_flux.json").raw
                daily.derive_bundle(source, self.root / "derived", bundle_id=f"bool-{suffix}-derived",
                    generated_at_utc="2026-09-11T01:00:00Z", seed=42)
                resolved = bundles.resolve_derived_bundle(self.root / "derived" / "current.json")
                report = json.loads(resolved.component("observations").raw)
                snapshot = json.loads(resolved.component("snapshot").raw)
                context = report["observed_context"]
                self.assertIsNone(context["space_weather_signals"]["latest_f107"])
                self.assertNotIn("swpc-f107-cm-flux", context["signal_freshness"])
                self.assertEqual(snapshot["run"]["activity_index"], 0.9)
                self.assertEqual(len(snapshot["active_regions"]), 34)
                self.assertEqual(source.component("f107_cm_flux.json").raw, raw)
                self.assertEqual(json.loads(raw), payload)

    def test_persisted_bundle_skips_newer_nonfinite_numeric_string(self):
        payload = [
            {"time_tag": "2026-09-10T00:00:00Z", "source": "finite source", "flux": 150.0},
            {"time_tag": "2026-09-11T00:00:00Z", "source": "nonfinite source", "flux": "Infinity"},
        ]
        source = self.source({}, bundle_id="finite-source", rows_by_name={"f107_cm_flux.json": payload})
        raw = source.component("f107_cm_flux.json").raw
        daily.derive_bundle(source, self.root / "derived", bundle_id="finite-derived",
            generated_at_utc="2026-09-11T01:00:00Z", seed=42)
        resolved = bundles.resolve_derived_bundle(self.root / "derived" / "current.json")
        report = json.loads(resolved.component("observations").raw)
        snapshot = json.loads(resolved.component("snapshot").raw)
        frame = next(frame for frame in report["frames"] if frame["id"] == "swpc-f107-cm-flux")
        self.assertEqual(frame["provenance"]["time_tag"], "2026-09-10T00:00:00Z")
        self.assertEqual(report["observed_context"]["space_weather_signals"]["latest_f107"], 150.0)
        self.assertEqual(snapshot["run"]["activity_index"], 0.5)
        self.assertEqual(len(snapshot["active_regions"]), 25)
        self.assertEqual(source.component("f107_cm_flux.json").raw, raw)
        self.assertEqual(json.loads(raw), payload)

    def test_persisted_bundle_rejects_nonnative_timestamp_spellings(self):
        payload = [
            {"time_tag": "2026-09-10T00:00:00Z", "source": "valid source", "flux": 150.0},
            {"time_tag": "20260912T000000Z", "source": "compact source", "flux": 235.0},
            {"time_tag": "2026-09-13T02:00:00+02:00", "source": "offset source", "flux": 240.0},
        ]
        source = self.source({}, bundle_id="strict-clock-source", rows_by_name={"f107_cm_flux.json": payload})
        raw = source.component("f107_cm_flux.json").raw
        daily.derive_bundle(source, self.root / "derived", bundle_id="strict-clock-derived",
            generated_at_utc="2026-09-11T01:00:00Z", seed=42)
        resolved = bundles.resolve_derived_bundle(self.root / "derived" / "current.json")
        report = json.loads(resolved.component("observations").raw)
        snapshot = json.loads(resolved.component("snapshot").raw)
        frame = next(frame for frame in report["frames"] if frame["id"] == "swpc-f107-cm-flux")
        self.assertEqual(frame["provenance"]["time_tag"], "2026-09-10T00:00:00Z")
        self.assertEqual(report["observed_context"]["space_weather_signals"]["latest_f107"], 150.0)
        self.assertEqual(snapshot["run"]["activity_index"], 0.5)
        self.assertEqual(len(snapshot["active_regions"]), 25)
        self.assertEqual(source.component("f107_cm_flux.json").raw, raw)
        self.assertEqual(json.loads(raw), payload)

    def test_persisted_equal_instants_select_last_payload_position(self):
        payload = [
            {"time_tag": "2026-09-11T00:00:00Z", "source": "first source", "flux": 150.0},
            {"time_tag": "2026-09-11T00:00:00+00:00", "source": "last source", "flux": 235.0},
        ]
        source = self.source({}, bundle_id="equal-clock-source", rows_by_name={"f107_cm_flux.json": payload})
        raw = source.component("f107_cm_flux.json").raw
        daily.derive_bundle(source, self.root / "derived", bundle_id="equal-clock-derived",
            generated_at_utc="2026-09-11T01:00:00Z", seed=42)
        resolved = bundles.resolve_derived_bundle(self.root / "derived" / "current.json")
        report = json.loads(resolved.component("observations").raw)
        snapshot = json.loads(resolved.component("snapshot").raw)
        frame = next(frame for frame in report["frames"] if frame["id"] == "swpc-f107-cm-flux")
        self.assertEqual(frame["provenance"]["time_tag"], "2026-09-11T00:00:00+00:00")
        self.assertEqual(frame["provenance"]["source"], "last source")
        self.assertEqual(report["observed_context"]["space_weather_signals"]["latest_f107"], 235.0)
        self.assertEqual(snapshot["run"]["activity_index"], 1.0)
        self.assertEqual(len(snapshot["active_regions"]), 38)
        self.assertEqual(source.component("f107_cm_flux.json").raw, raw)
        self.assertEqual(json.loads(raw), payload)

    def test_persisted_count_proxies_share_clock_admission(self):
        cases = (
            ("solar_regions.json", "solar_region_rows", 0.375, 22),
            ("sunspot_report.json", "sunspot_rows", 0.375, 22),
            ("goes_xray_flares_7_day.json", "goes_xray_flares_7_day_rows", 0.5375, 26),
        )
        for index, (name, count_key, activity, region_count) in enumerate(cases):
            with self.subTest(feed=name):
                payload = [
                    {"time_tag": "2026-09-10", "source": "valid calendar source"},
                    {"source": "legacy missing-clock source"},
                    {"time_tag": None, "source": "legacy null-clock source"},
                    {"time_tag": "not-a-time", "source": "malformed-clock source"},
                    {"time_tag": "20260912T000000Z", "source": "compact-clock source"},
                    {"time_tag": "2026-09-12T02:00:00+02:00", "source": "offset-clock source"},
                ]
                source = self.source({}, bundle_id=f"count-clock-{index}-source", rows_by_name={name: payload})
                raw = source.component(name).raw
                daily.derive_bundle(source, self.root / "derived", bundle_id=f"count-clock-{index}-derived",
                    generated_at_utc="2026-09-11T01:00:00Z", seed=42)
                resolved = bundles.resolve_derived_bundle(self.root / "derived" / "current.json")
                report = json.loads(resolved.component("observations").raw)
                snapshot = json.loads(resolved.component("snapshot").raw)
                self.assertEqual(report["observed_context"]["activity_proxy_sources"][count_key], 3)
                self.assertEqual(snapshot["run"]["activity_index"], activity)
                self.assertEqual(len(snapshot["active_regions"]), region_count)
                self.assertEqual(source.component(name).raw, raw)
                self.assertEqual(json.loads(raw), payload)

    def test_invalid_rows_do_not_inflate_activity_proxy_counts(self):
        for index, (name, count_key, activity, region_count) in enumerate((
            ("solar_regions.json", "solar_region_rows", 0.375, 22),
            ("sunspot_report.json", "sunspot_rows", 0.375, 22),
            ("goes_xray_flares_7_day.json", "goes_xray_flares_7_day_rows", 0.495833, 25),
        )):
            with self.subTest(feed=name):
                payload = [{"time_tag": "2026-09-10T00:00:00Z", "source": "attributable observatory"}]
                payload.extend({"time_tag": "2026-09-11T00:00:00Z", "source": invalid}
                               for invalid in (None, "", " UNKNOWN ", 7, False))
                report = self.report(self.source({}, bundle_id=f"count-{index}", rows_by_name={name: payload}))
                snapshot = generator.build_snapshot(42, 12, 6, report)
                self.assertEqual(report["observed_context"]["activity_proxy_sources"][count_key], 1)
                self.assertEqual(snapshot["run"]["activity_index"], activity)
                self.assertEqual(len(snapshot["active_regions"]), region_count)

    def test_legacy_candidate_without_manifest_does_not_infer_attribution(self):
        candidate = {"row": {"time_tag": "2026-09-11T00:00:00Z"}, "source_mode": "cached",
                     "local_path": "f107_cm_flux.json", "raw_bytes": 12}
        self.assertIsNone(generator.frame_from_row("swpc-f107-cm-flux", "observed", candidate)["provenance"]["source"])

    def test_explicit_whitespace_projection_matches_bundle_readers(self):
        for index, value in enumerate(("\u0085", "\u001c", "\u001d", "\u001e", "\u001f", "\u0085unknown\u001c", "un\u212anown", "\ufeff")):
            with self.subTest(source=value):
                source = self.source({"source": value}, bundle_id=f"whitespace-{index}")
                derived = daily.derive_bundle(source, self.root / "derived", bundle_id=f"derived-{index}",
                    generated_at_utc="2026-09-11T01:00:00Z", seed=42)
                snapshot = json.loads(derived.component("snapshot").raw)
                self.assertEqual(len(snapshot["observations"][0]["frames"]), 3 if value == "\ufeff" else 0)


if __name__ == "__main__":
    unittest.main()
