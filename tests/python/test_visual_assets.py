"""Offline visual provenance regressions, discoverable by the repository unittest suite."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("validate_visual_assets", ROOT / "tools/validate_visual_assets.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def inventory():
    return json.loads((ROOT / "apps/web/visual-assets.v1.json").read_text(encoding="utf-8"))


class VisualAssetTests(unittest.TestCase):
    def test_official_preview_link_must_bind_verified_source(self):
        data = inventory()
        next(a for a in data["assets"] if a["id"] == "earth")["source_url"] = "https://example.com/unrelated-image.jpg"
        with self.assertRaisesRegex(ValueError, "source URL"):
            mod.validate_inventory(data)

    def test_required_non_raster_collections_cannot_disappear(self):
        for field in ("procedural_assets", "fallbacks", "dynamic_sources"):
            with self.subTest(field=field):
                data = inventory()
                data.pop(field, None)
                with self.assertRaises(ValueError):
                    mod.validate_inventory(data)

    def test_dynamic_policy_rejects_url_or_observation_claim_drift(self):
        for field, value in (("source_url", "https://example.com/image.jpg"), ("registration_verified", True),
                             ("content_sha256", "a" * 64), ("capture_time", "2026-09-13T00:00:00Z"),
                             ("instrument", "unknown"), ("spectral_interpretation", "")):
            with self.subTest(field=field):
                data = inventory()
                data["dynamic_sources"][0][field] = value
                with self.assertRaises(ValueError):
                    mod.validate_dynamic_sources(data)

    def test_dynamic_policy_binds_config_channel_urls(self):
        with tempfile.TemporaryDirectory(prefix="sol-visual-config-") as directory:
            root = Path(directory)
            (root / "js").mkdir()
            source = (ROOT / "apps/web/js/config.js").read_text(encoding="utf-8")
            (root / "js/config.js").write_text(source.replace('"HMIIC.jpg"', '"unapproved.jpg"'), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "config parity"):
                mod.validate_dynamic_sources(inventory(), root)

    def test_required_procedural_records_cannot_disappear(self):
        data = inventory()
        data["procedural_assets"] = [a for a in data["procedural_assets"] if a["id"] != "ring-opacity-profile"]
        with self.assertRaisesRegex(ValueError, "procedural inventory incomplete"):
            mod.validate_inventory(data)

    def test_inventory(self):
        mod.validate_inventory(inventory(), ROOT / "apps/web")

    def test_reject_missing_identity(self):
        for field, value in [("sha256", "bad"), ("label", ""), ("credits", "")]:
            with self.subTest(field=field):
                data = inventory()
                data["assets"][0][field] = value
                with self.assertRaises(ValueError):
                    mod.validate_inventory(data)

    def test_reject_unverified_release_usage(self):
        data = inventory()
        data["assets"][0]["allowed_usages"] = ["global-sphere"]
        data["assets"][0]["source_identity"]["status"] = "unverified"
        with self.assertRaisesRegex(ValueError, "unverified release usage"):
            mod.validate_inventory(data)

    def test_reject_partial_as_global(self):
        data = inventory()
        asset = next(a for a in data["assets"] if a["id"] == "earth")
        asset["allowed_usages"] = ["global-sphere"]
        asset["coverage"] = {"status": "verified", "latitude_deg": [-87.6, 87.6], "longitude_deg": [0, 360]}
        asset["projection"] = "equirectangular"
        asset["mapping_status"] = "qualified"
        with self.assertRaisesRegex(ValueError, "global mapping"):
            mod.validate_inventory(data)

    def test_full_qualification_remains_blocked(self):
        with self.assertRaisesRegex(ValueError, "qualification"):
            mod.validate_inventory(inventory(), require_qualified=True)

    def test_status_and_extents_cannot_promote_unknown_mapping(self):
        data = inventory()
        asset = next(a for a in data["assets"] if a["id"] == "earth")
        asset.update(allowed_usages=["global-sphere"], mapping_status="qualified",
                     projection="equirectangular",
                     coverage={"status": "verified", "latitude_deg": [-90, 90], "longitude_deg": [0, 360]})
        with self.assertRaisesRegex(ValueError, "mapping evidence"):
            mod.validate_inventory(data)

    def test_mapping_evidence_requires_each_coordinate_and_product_binding(self):
        # Contract-only synthetic record; never written into the scientific inventory.
        asset = {"sha256": "a" * 64, "mission": "Synthetic mission", "instrument": "Synthetic instrument",
                 "color_interpretation": "Synthetic grayscale fixture", "product_id": "synthetic-test"}
        evidence = {"asset_sha256": "a" * 64, "renderer_transform_verified": True,
                    "longitude_direction": "east-positive", "vertical_orientation": "north-at-top",
                    "coordinate_frame": "Synthetic frame", "prime_meridian_definition": "Synthetic meridian",
                    "renderer_transform": "Synthetic identity transform", "color_processing": "Synthetic grayscale",
                    "coverage_interpretation": "Synthetic full coverage", "prime_meridian_u": 0.5,
                    "source_urls": ["https://science.nasa.gov/"], "reviewed_at": "2026-09-13T00:00:00Z"}
        asset["mapping_evidence"] = evidence
        mod.validate_mapping_evidence(asset)
        for field in evidence:
            with self.subTest(missing=field):
                asset["mapping_evidence"] = {k: v for k, v in evidence.items() if k != field}
                with self.assertRaisesRegex(ValueError, "mapping evidence"):
                    mod.validate_mapping_evidence(asset)
        asset["mapping_evidence"] = evidence
        for field in ("mission", "instrument", "color_interpretation", "product_id"):
            with self.subTest(unknown=field):
                changed = dict(asset, **{field: "unknown"})
                with self.assertRaisesRegex(ValueError, "mapping evidence"):
                    mod.validate_mapping_evidence(changed)

    def test_reject_invalid_interpretation(self):
        cases = [
            ("mission", ""), ("instrument", None), ("color_interpretation", ""),
            ("projection", "made-up"),
            ("coverage", {"status": "verified", "latitude_deg": [-100, 100], "longitude_deg": [0, 360]}),
            ("coverage", {"status": "unknown", "latitude_deg": [-90, 90], "longitude_deg": [0, 360]}),
            ("fallback", {"rgb": [1.1, 0, 0], "label": "display"}),
            ("fallback", {"rgb": [True, 0, 0], "label": "display"}),
            ("observation_time", "yesterday"),
        ]
        for field, value in cases:
            with self.subTest(field=field, value=value):
                data = inventory()
                data["assets"][0][field] = value
                with self.assertRaises(ValueError):
                    mod.validate_inventory(data)

    def test_raster_hash_is_checked_against_file_bytes(self):
        data = inventory()
        data["assets"] = [data["assets"][0]]
        with tempfile.TemporaryDirectory(prefix="sol-visual-test-") as directory:
            root = Path(directory)
            file = root / data["assets"][0]["path"]
            file.parent.mkdir()
            file.write_bytes(b"changed raster")
            with self.assertRaisesRegex(ValueError, "bytes differ"):
                mod.validate_inventory(data, root)


if __name__ == "__main__":
    unittest.main()
