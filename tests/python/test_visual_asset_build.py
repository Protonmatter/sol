"""Asset identity is checked before publishing an immutable build directory."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest
from unittest import mock

import test_release_artifact

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import build_web


class VisualAssetBuildTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_release_artifact.ReleaseArtifactTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def test_visual_runtime_requires_inventory_before_staging(self):
        f = self.fixture
        (f.source / "js").mkdir(exist_ok=True)
        (f.source / "js/visualAssets.js").write_text("export const enabled = true;", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "visual.*inventory"):
            build_web.validate_visual_source(f.source)

    def test_generated_browser_inventory_must_match_reviewed_manifest(self):
        f = self.fixture
        (f.source / "js").mkdir(exist_ok=True)
        (f.source / "js/visualAssets.js").write_text("", encoding="utf-8")
        (f.source / "visual-assets.v1.json").write_text(json.dumps({"assets": []}), encoding="utf-8")
        (f.source / "js/visualAssetManifest.js").write_text("drift", encoding="utf-8")
        with mock.patch("validate_visual_assets.validate_inventory"):
            with self.assertRaisesRegex(ValueError, "browser visual inventory drift"):
                build_web.validate_visual_source(f.source)

    def test_real_inventory_is_admitted_without_claiming_global_qualification(self):
        build_web.validate_visual_source(ROOT / "apps/web")


if __name__ == "__main__":
    unittest.main()
