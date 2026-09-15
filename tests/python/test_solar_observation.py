"""Pinned solar browse imagery retains source identity and cannot become model data."""
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


class SolarObservationTests(unittest.TestCase):
    def test_bundled_observation_is_valid_and_separate_from_surface_assets(self):
        data = inventory()
        mod.validate_inventory(data, ROOT / "apps/web")
        observed = data["observed_images"][0]
        self.assertNotIn(observed["path"], [asset["path"] for asset in data["assets"]])
        self.assertEqual(observed["captured_at"], "2026-09-12T00:07:22Z")
        self.assertNotEqual(observed["captured_at"], observed["retrieved_at"])

    def test_observed_collection_cannot_disappear(self):
        for replacement in (None, [], "not a collection"):
            with self.subTest(replacement=replacement):
                data = inventory()
                data["observed_images"] = replacement
                with self.assertRaisesRegex(ValueError, "observed image"):
                    mod.validate_inventory(data)

    def test_reject_policy_identity_and_clock_drift(self):
        cases = [
            ("source_url", "https://example.com/image.jpg"),
            ("source_url", "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg"),
            ("source_url", "https://sdo.gsfc.nasa.gov/assets/img/browse/2026/09/12/20260912_001710_1024_0171.jpg"),
            ("path", "textures/../outside.jpg"), ("path", "textures\\outside.jpg"),
            ("bytes", 2_000_001), ("sha256", "bad"), ("sha256", "a" * 64),
            ("status", "live"), ("allowed_usages", ["global-sphere"]),
            ("registration_verified", True), ("global_mapping_allowed", True),
            ("scientific_analysis_allowed", True), ("is_false_color", False),
            ("mission", "unknown"), ("instrument", "HMI"), ("wavelength_angstrom", 193),
            ("projection", "equirectangular"), ("interpretation", ""),
            ("retrieved_at", None), ("retrieved_at", "2026-09-13T00:00:00"),
            ("retrieved_at", "2026-09-11T00:00:00Z"),
            ("captured_at", "2026-09-12T00:17:10Z"),
            ("captured_at", None), ("metadata_sources", ["https://example.com/claims"]),
        ]
        for field, value in cases:
            with self.subTest(field=field, value=value):
                data = inventory()
                data["observed_images"][0][field] = value
                with self.assertRaises(ValueError):
                    mod.validate_observed_images(data)

    def test_unknown_capture_time_requires_explicit_unknown_evidence(self):
        data = inventory()
        observed = data["observed_images"][0]
        observed["captured_at"] = None
        observed["capture_time_evidence"] = {"status": "unknown", "caption": None}
        mod.validate_observed_images(data)
        observed["capture_time_evidence"]["caption"] = "invented caption"
        with self.assertRaisesRegex(ValueError, "capture"):
            mod.validate_observed_images(data)

    def test_hash_and_dimensions_are_verified_from_original_bytes(self):
        data = inventory()
        with tempfile.TemporaryDirectory(prefix="sol-observed-test-") as directory:
            root = Path(directory)
            file = root / data["observed_images"][0]["path"]
            file.parent.mkdir()
            file.write_bytes(b"changed raster")
            with self.assertRaisesRegex(ValueError, "bytes differ"):
                mod.validate_observed_images(data, root)
        data["observed_images"][0]["dimensions"] = [2048, 2048]
        with self.assertRaisesRegex(ValueError, "dimensions"):
            mod.validate_observed_images(data, ROOT / "apps/web")

    def test_duplicate_identity_is_rejected_across_raster_collections(self):
        data = inventory()
        data["observed_images"][0]["id"] = data["assets"][0]["id"]
        with self.assertRaisesRegex(ValueError, "duplicate"):
            mod.validate_inventory(data)


if __name__ == "__main__":
    unittest.main()
