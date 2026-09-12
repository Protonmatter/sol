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

    def source(self, row_source: dict, bundle_id: str = "source"):
        products = []
        for name in ("rtsw_mag_1m.json", "rtsw_wind_1m.json", "f107_cm_flux.json"):
            row = {"time_tag": "2026-09-11T00:00:00Z", **row_source}
            if name == "f107_cm_flux.json":
                row["flux"] = 150.0
            products.append({
                "product_id": name, "source": "offline manifest " + name,
                "origin": "cached-fallback", "observation_time_utc": row["time_tag"],
                "retrieved_at_utc": None, "quality": ["synthetic offline regression payload"],
                "failure": "offline test", "license": "synthetic test data", "critical": True,
                "payload": bundles.json_bytes([row]),
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
