"""Incident fields are verified release assets loaded only on optical demand."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import unittest

import test_release_artifact


ROOT = Path(__file__).resolve().parents[2]
FIELDS = ("data/optics/earth-incident-v1.f32", "data/optics/mars-incident-v1.f32")


class IncidentReleaseBuildTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_release_artifact.ReleaseArtifactTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        for name in (*FIELDS, "sw.js", "js/atmosphereIncident.js", "js/atmosphereIncidentManifest.js",
                     "js/atmosphereOptics.js", "js/atmosphereShaders.js"):
            target = self.fixture.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / "apps/web" / name, target)
        # The exception must not make every data/optics asset optional.
        (self.fixture.source / "data/optics/reference.json").write_text("{}", encoding="utf-8")
        (self.fixture.source / "data/optics/unadmitted.f32").write_bytes(b"not an admitted field")

    def test_only_admitted_fields_leave_the_critical_install_set(self):
        output = self.fixture.build("optional-fields")
        manifest = json.loads((output / "web-release-manifest.json").read_text(encoding="utf-8"))
        namespace = manifest["namespace"]
        assets = {asset["path"]: asset for asset in manifest["assets"]}
        self.assertEqual({name for name, asset in assets.items() if asset["role"] == "optional"},
                         {namespace + name for name in FIELDS})
        for name in FIELDS:
            raw = (self.fixture.source / name).read_bytes()
            asset = assets[namespace + name]
            self.assertEqual((output / asset["path"]).read_bytes(), raw)
            self.assertEqual(asset["size"], len(raw))
            self.assertEqual(asset["sha256"], hashlib.sha256(raw).hexdigest())
            self.assertEqual(asset["source_path"], "apps/web/" + name)
            self.assertEqual(asset["source_sha256"], hashlib.sha256(raw).hexdigest())
        for name in ("index.html", "app.js", "js/atmosphereIncident.js", "js/atmosphereIncidentManifest.js",
                     "data/latest-state.json", "data/optics/reference.json", "data/optics/unadmitted.f32",
                     "pkg/solar_wasm.wasm", "pkg/solar_ephemeris.wasm"):
            self.assertEqual(assets[namespace + name]["role"], "critical", name)
        self.assertEqual(assets["index.html"]["role"], "critical")
        self.assertEqual(assets["sw.js"]["role"], "critical")

    def test_real_worker_installs_without_fields_and_verifies_them_on_demand(self):
        output = self.fixture.build("demand-fields")
        # Consume the actual build manifest in the existing real-service-worker
        # harness. Only network and CacheStorage are substituted; no role is edited.
        script = r'''
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harness, origin} from './tests/web/helpers/releaseCacheHarness.mjs';
const output = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'web-release-manifest.json'), 'utf8'));
const files = Object.fromEntries(manifest.assets.map(asset => [asset.path, fs.readFileSync(path.join(output, asset.path))]));
const fields = ['earth', 'mars'].map(body => manifest.namespace + `data/optics/${body}-incident-v1.f32`);
const saved = Object.fromEntries(fields.map(name => [name, files[name]]));
for (const name of fields) delete files[name];
const data = {manifest, files}, worker = harness(manifest.release_id, data, new Map(), manifest.base_path);
await worker.event('install');
await worker.event('activate');
const cache = worker.shared.get('sol-release-' + manifest.release_id);
assert.ok(cache, 'release must complete installation without optional fields');
for (const name of fields) {
  const url = origin + manifest.base_path + name;
  assert.equal(worker.calls.includes(url), false, 'install must not request an optional field');
  assert.equal(cache.has(url), false, 'install must not populate an optional field');
  assert.equal((await worker.request(name)).status, 409, 'missing demand stays unavailable');
  files[name] = Buffer.from(saved[name]);
  files[name][0] ^= 1; // Same length: rejection must verify the digest, not just size.
  assert.equal((await worker.request(name)).status, 409, 'optional demand retains hash admission');
  assert.equal(cache.has(url), false, 'failed admission must not populate the cache');
  files[name] = saved[name];
  assert.deepEqual(Buffer.from(await (await worker.request(name)).arrayBuffer()), saved[name]);
  assert.ok(cache.has(url), 'a verified field is cached only after demand');
}
const missingCore = {manifest, files: {...files}};
delete missingCore.files[manifest.namespace + 'app.js'];
const rejected = harness(manifest.release_id, missingCore, new Map(), manifest.base_path);
await assert.rejects(rejected.event('install'), /fetch/);
assert.equal(rejected.shared.has('sol-release-' + manifest.release_id), false);
'''
        result = subprocess.run(["node", "--input-type=module", "-e", script, str(output)],
                                cwd=ROOT, text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_optional_install_role_does_not_admit_missing_or_corrupt_build_inputs(self):
        field = self.fixture.source / FIELDS[0]
        raw = field.read_bytes()
        for failure in ("missing", "corrupt"):
            with self.subTest(failure=failure):
                if failure == "missing":
                    field.unlink()
                else:
                    field.write_bytes(b"X" + raw[1:])
                try:
                    with self.assertRaisesRegex(ValueError, "missing|hash mismatch"):
                        self.fixture.build("rejected-" + failure)
                    self.assertFalse((self.fixture.root / ("rejected-" + failure)).exists())
                finally:
                    field.write_bytes(raw)


if __name__ == "__main__":
    unittest.main()
