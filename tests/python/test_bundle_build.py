from __future__ import annotations
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

import test_release_artifact
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"tools"))
import build_web
import data_bundles as bundles
import validate_release_manifest as release


class BundleBuildTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_release_artifact.ReleaseArtifactTests();self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def test_build_captures_once_and_materializes_selected_bytes_without_aliases(self):
        pinned=bundles.resolve_derived_bundle(ROOT/"apps/web/data/current.json")
        f=self.fixture
        with mock.patch("data_bundles.resolve_derived_bundle",return_value=pinned) as resolve:
            manifest=build_web.build_site(f.source,f.wasm,f.root/"bundled",release_id="bundle-release",source_sha="a"*40,repository="owner/repo",run_id=1,run_attempt=1,
                schemas=["solar-state-snapshot.v3","ephemeris-snapshot.v3"],bundle_pointer=ROOT/"apps/web/data/current.json")
        self.assertEqual(resolve.call_count,1)
        self.assertEqual(manifest["data_bundle_id"],pinned.bundle_id)
        descriptor=manifest["data_bundle"]
        self.assertEqual((f.root/"bundled"/descriptor["manifest_path"]).read_bytes(),pinned.manifest_raw)
        self.assertFalse((f.root/"bundled"/manifest["namespace"]/"data/latest-state.json").exists())
        self.assertEqual(release.validate_manifest(f.root/"bundled/web-release-manifest.json")["data_bundle"],descriptor)
        invalid=copy.deepcopy(manifest);invalid["data_bundle"]["bundle_id"]="other"
        with self.assertRaises(ValueError):release.validate_data(invalid,f.root/"bundled")

    def test_live_v3_without_bundle_pointer_is_rejected(self):
        f=self.fixture
        with self.assertRaises((ValueError,OSError)):
            build_web.build_site(f.source,f.wasm,f.root/"no-pointer",release_id="missing",source_sha="a"*40,repository="owner/repo",run_id=1,run_attempt=1,schemas=["solar-state-snapshot.v3","ephemeris-snapshot.v3"])
        self.assertFalse((f.root/"no-pointer").exists())

if __name__=="__main__":unittest.main()
