"""Incident and column fields are verified assets loaded only on optical demand."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import unittest
from unittest.mock import patch

import test_release_artifact


ROOT = Path(__file__).resolve().parents[2]
FIELDS = tuple(f"data/optics/{body}-{kind}-v1.f32"
               for body in ("earth", "mars") for kind in ("incident", "columns"))
OPTICAL_MODULES = ("atmosphereIncident.js", "atmosphereIncidentManifest.js", "atmosphereOptics.js",
                   "atmosphereShaders.js", "atmosphereColumnField.js", "atmosphereColumnManifest.js")


class IncidentReleaseBuildTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_release_artifact.ReleaseArtifactTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        for name in (*FIELDS, "sw.js", *("js/" + name for name in OPTICAL_MODULES)):
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
        for name in ("index.html", "app.js", *("js/" + name for name in OPTICAL_MODULES),
                     "data/latest-state.json", "data/optics/reference.json", "data/optics/unadmitted.f32",
                     "pkg/solar_wasm.wasm", "pkg/solar_ephemeris.wasm"):
            self.assertEqual(assets[namespace + name]["role"], "critical", name)
        self.assertEqual(assets["index.html"]["role"], "critical")
        self.assertEqual(assets["sw.js"]["role"], "critical")

    def test_every_optical_module_contributes_to_the_science_fingerprint(self):
        output = self.fixture.build("science-fields")
        manifest = json.loads((output / "web-release-manifest.json").read_text(encoding="utf-8"))
        # This minimal fixture has exactly these six scientific modules. Compute
        # their expected fingerprint without consulting build_web.SCIENCE_MODULES.
        science = [("apps/web/js/" + name,
                    hashlib.sha256((self.fixture.source / "js" / name).read_bytes()).hexdigest())
                   for name in sorted(OPTICAL_MODULES)]
        expected = hashlib.sha256(json.dumps({"wasm": manifest["wasm_sha256"],
            "schemas": manifest["schemas"], "methods_contracts_coefficients": science}, sort_keys=True).encode()).hexdigest()
        self.assertEqual(manifest["components"]["science"], expected)

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
const fields = ['earth', 'mars'].flatMap(body => ['incident', 'columns'].map(kind => manifest.namespace + `data/optics/${body}-${kind}-v1.f32`));
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
        for name in FIELDS:
            field = self.fixture.source / name
            raw = field.read_bytes()
            for failure in ("missing", "corrupt"):
                with self.subTest(name=name, failure=failure):
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

    def test_copied_columns_are_read_back_before_the_release_is_published(self):
        original = Path.write_bytes
        changed = []

        def corrupt_staged_column(file, raw):
            if file.name == "earth-columns-v1.f32" and any(part.name.startswith(".sol-stage-") for part in file.parents):
                changed.append(file)
                altered = bytearray(raw); altered[20] ^= 1
                return original(file, altered)
            return original(file, raw)

        with patch.object(Path, "write_bytes", corrupt_staged_column):
            with self.assertRaisesRegex(ValueError, "column field hash mismatch"):
                self.fixture.build("corrupt-staged-columns")
        self.assertEqual(len(changed), 1, "the fault must target copied bytes after source admission")
        self.assertFalse((self.fixture.root / "corrupt-staged-columns").exists())


if __name__ == "__main__":
    unittest.main()
