"""Rehashed input must preserve series labels and the producer's feed projection."""
from __future__ import annotations

import copy
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import data_bundles as bundles


class BundleSemanticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sol-bundle-semantics-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        data = ROOT / "apps/web/data"
        self.pointer = json.loads((data / "current.json").read_bytes())
        self.path = self.root / self.pointer["manifest_path"]
        shutil.copytree((data / self.pointer["manifest_path"]).parent, self.path.parent)
        self.manifest = json.loads(self.path.read_bytes())
        self.values = {c["role"]: json.loads((self.path.parent / c["path"]).read_bytes())
                       for c in self.manifest["components"]}

    def write(self, values):
        manifest = copy.deepcopy(self.manifest)
        manifest["components"] = [c for c in manifest["components"] if c["role"] in values]
        for component in manifest["components"]:
            raw = bundles.json_bytes(values[component["role"]])
            (self.path.parent / component["path"]).write_bytes(raw)
            component.update(size_bytes=len(raw), sha256=bundles.digest(raw))
            if component["role"] == "source_manifest":
                manifest["source_manifest_sha256"] = component["sha256"]
        raw = bundles.json_bytes(manifest)
        self.path.write_bytes(raw)
        pointer = {**self.pointer, "manifest_sha256": bundles.digest(raw)}
        selected = self.root / "current.json"
        selected.write_bytes(bundles.json_bytes(pointer))
        return selected

    def test_rehashed_series_payload_and_metadata_mismatches_are_rejected(self):
        mutations = {
            "valid payload swap": lambda v: v.update({"series_frame:0": copy.deepcopy(v["series_frame:5"])}),
            "stage": lambda v: v["series_manifest"]["frames"][0].update(stage="solar maximum"),
            "activity": lambda v: v["series_manifest"]["frames"][0].update(activity_index=0.95),
            "region count": lambda v: v["series_manifest"]["frames"][0].update(region_count=34),
            "index": lambda v: v["series_manifest"]["frames"][0].update(index=5),
            "boolean index": lambda v: v["series_manifest"]["frames"][0].update(index=False),
            "missing index": lambda v: v["series_manifest"]["frames"][0].pop("index"),
            "missing stage": lambda v: v["series_manifest"]["frames"][0].pop("stage"),
        }
        for name, mutate in mutations.items():
            with self.subTest(mutation=name):
                values = copy.deepcopy(self.values)
                mutate(values)
                with self.assertRaisesRegex(ValueError, "series.*(metadata|index)"):
                    bundles.resolve_derived_bundle(self.write(values))

    def test_rehashed_feed_rows_cannot_omit_invent_or_relabel_source_products(self):
        mutations = {
            "absent": lambda s: s.pop("sources"),
            "missing": lambda s: s["sources"].pop(),
            "empty": lambda s: s.update(sources=[]),
            "duplicate": lambda s: s["sources"].append(copy.deepcopy(s["sources"][0])),
            "order": lambda s: s["sources"].reverse(),
            "file": lambda s: s["sources"][0].update(file="fabricated.json"),
            "source": lambda s: s["sources"][0].update(source="fabricated instrument"),
            "health": lambda s: s["sources"][0].update(ok=False),
            "origin": lambda s: s["sources"][0].update(origin="current-fetch"),
            "observation time": lambda s: s["sources"][0].update(observation_time_utc="2026-09-11T01:00:00Z"),
            "retrieval time": lambda s: s["sources"][0].update(retrieved_at_utc="2026-09-11T01:00:00Z"),
        }
        for name, mutate in mutations.items():
            with self.subTest(mutation=name):
                values = copy.deepcopy(self.values)
                mutate(values["feed_status"])
                with self.assertRaisesRegex(ValueError, "feed.*sources"):
                    bundles.resolve_derived_bundle(self.write(values))

    def test_committed_series_and_declared_gaps_keep_illustrative_time_and_indices(self):
        selected = self.write(self.values)
        self.assertEqual(bundles.resolve_derived_bundle(selected).bundle_id, self.pointer["bundle_id"])
        self.assertEqual(self.values["series_frame:10"]["run"]["time_seconds"], 0.0)
        self.assertEqual(self.values["series_manifest"]["frames"][10]["months"], 132.0)
        self.values["series_manifest"]["frames"][1] = {
            "file": "frame-01.json", "months": 13.2,
            "availability": "unavailable", "reason": "declared regression gap"}
        del self.values["series_frame:1"]
        accepted = bundles.resolve_derived_bundle(self.write(self.values))
        self.assertEqual(accepted.component("series_frame:10").relative_path, "series/frame-10.json")
        self.assertNotIn("series_frame:1", {c.role for c in accepted.components})

    def test_feed_projection_preserves_product_ids_order_failure_and_unknown_times(self):
        source, status = self.values["source_manifest"], self.values["feed_status"]
        product = source["products"][0]
        product.update(product_id="logical-product", path="payloads/physical-file.json", failure="offline fallback")
        status["sources"][0].update(file="logical-product", ok=False)
        source["products"].reverse()
        status["sources"].reverse()
        source["failures"].append({"product_id": "unavailable.json", "critical": False, "error_type": "OfflineFailure"})
        selected = self.write(self.values)
        before = {p: p.read_bytes() for p in self.root.rglob("*.json")}
        accepted = bundles.resolve_derived_bundle(selected)
        self.assertEqual(json.loads(accepted.component("feed_status").raw)["sources"][-1]["file"], "logical-product")
        self.assertEqual({p: p.read_bytes() for p in before}, before)


if __name__ == "__main__":
    unittest.main()
