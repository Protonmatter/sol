from __future__ import annotations

import contextlib
import csv
import hashlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import warnings
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import generate_moons


class MoonGenerationTests(unittest.TestCase):
    def test_actual_build_is_repeatable_importable_and_preserves_authoritative_outputs(self):
        # Exercise the real generator in memory on this host. This validates its
        # output contract and read-only behavior, not canonical cross-host bytes.
        sources=[generate_moons.OUT,generate_moons.OUT_ELEMENTS,*generate_moons.SRC.glob('*.csv')]
        before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
        with warnings.catch_warnings(record=True) as observed:
            warnings.simplefilter('always',ResourceWarning)
            identity,elements=generate_moons.build()
            self.assertEqual((identity,elements),generate_moons.build())
        self.assertFalse([w for w in observed if issubclass(w.category,ResourceWarning)],
                         'generation must close source files explicitly')
        dates={}
        with (generate_moons.SRC/'horizons_satellite_vectors.csv').open(encoding='utf-8',newline='') as stream:
            for row in csv.DictReader(stream):dates.setdefault(row['Satellite'],[]).append(float(row['jd_tdb']))
        expected_start=max(min(v) for v in dates.values());expected_end=min(max(v) for v in dates.values())
        script="""import {pathToFileURL} from 'node:url';
const catalog=await import(pathToFileURL(process.argv[1]));
const elements=await import(pathToFileURL(process.argv[2]));
for(const [name,row] of Object.entries(elements.MOON_ELEMENTS)) {
  if(!Number.isFinite(row.t0)||![3.5,7].includes(row.step)||row.el.length<600||row.el.length%6||!row.el.every(Number.isFinite))
    throw new Error('Invalid generated moon element structure: '+name);
}
console.log(JSON.stringify({names:catalog.MOONS.map(m=>m.n).sort(),
  elements:Object.keys(elements.MOON_ELEMENTS).sort(),start:catalog.MOON_VALID_MIN_JD,end:catalog.MOON_VALID_MAX_JD,
  identities:catalog.MOONS.every(m=>Number.isFinite(m.a)&&m.a>m.r&&m.r>0&&m.P>0&&Number.isInteger(m.code))}));"""
        with tempfile.TemporaryDirectory() as folder:
            first,second=Path(folder)/'identity.mjs',Path(folder)/'elements.mjs'
            first.write_text(identity,encoding='utf-8');second.write_text(elements,encoding='utf-8')
            result=subprocess.run(['node','--input-type=module','-e',script,str(first),str(second)],
                capture_output=True,text=True,encoding='utf-8',timeout=30,check=True)
        actual=json.loads(result.stdout)
        self.assertEqual(actual['names'],sorted(dates));self.assertEqual(actual['elements'],sorted(dates))
        self.assertEqual(len(actual['names']),21);self.assertTrue(actual['identities'])
        self.assertEqual((actual['start'],actual['end']),(expected_start,expected_end))
        self.assertEqual(before,{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources})

    @staticmethod
    def pending_manifest():
        manifest = generate_moons.load_generation_manifest()
        manifest['canonical']['status'] = 'pending'
        manifest['canonical']['qualification'] = {'identical_runs': 0, 'reviewed_evidence': None}
        return manifest

    def test_unqualified_generation_preserves_existing_outputs(self):
        manifest = self.pending_manifest()
        with tempfile.TemporaryDirectory() as directory:
            identity = Path(directory) / "moons.js"
            elements = Path(directory) / "moonelements.js"
            identity.write_text("previous identity", encoding="utf-8")
            elements.write_text("previous elements", encoding="utf-8")
            stderr = io.StringIO()
            with patch.object(generate_moons, "load_generation_manifest", return_value=manifest), patch.object(generate_moons, "OUT", identity), patch.object(generate_moons, "OUT_ELEMENTS", elements), patch.object(generate_moons, "build") as build, patch.object(sys, "argv", ["generate_moons.py"]), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(stderr):
                result = generate_moons.main()
            self.assertEqual(result, 2, "unqualified host must refuse authoritative generation")
            self.assertIn("qualification is pending", stderr.getvalue())
            build.assert_not_called()
            self.assertEqual(identity.read_text(), "previous identity")
            self.assertEqual(elements.read_text(), "previous elements")

    def test_check_rejects_changed_source_even_if_rendered_bytes_match(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "sources"
            source.mkdir()
            for path in generate_moons.SRC.glob("*.csv"):
                shutil.copyfile(path, source / path.name)
            with (source / "horizons_satellite_elements.csv").open("a", encoding="utf-8") as stream:
                stream.write("\n")
            identity = Path(directory) / "moons.js"
            elements = Path(directory) / "moonelements.js"
            identity.write_text("identity", encoding="utf-8")
            elements.write_text("elements", encoding="utf-8")
            stderr = io.StringIO()
            with patch.object(generate_moons, "SRC", source), patch.object(generate_moons, "OUT", identity), patch.object(generate_moons, "OUT_ELEMENTS", elements), patch.object(generate_moons, "build", return_value=("identity", "elements")) as build, patch.object(sys, "argv", ["generate_moons.py", "--check"]), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(stderr):
                result = generate_moons.main()
            self.assertNotEqual(result, 0, "source digest drift must fail before matching outputs can pass")
            self.assertIn("source hash mismatch: horizons_satellite_elements.csv", stderr.getvalue())
            build.assert_not_called()

    def test_strict_check_refuses_pending_qualification_before_build(self):
        manifest = self.pending_manifest()
        with patch.object(generate_moons, "load_generation_manifest", return_value=manifest), patch.object(sys, "argv", ["generate_moons.py", "--check", "--require-canonical"]), patch.object(generate_moons, "build") as build, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(generate_moons.main(), 2)
        build.assert_not_called()

    def test_noncanonical_matching_check_labels_its_limit(self):
        manifest = self.pending_manifest()
        manifest["outputs"] = {f"apps/web/js/{name}.js": hashlib.sha256(name.encode()).hexdigest() for name in ("moons", "moonelements")}
        with tempfile.TemporaryDirectory() as directory:
            identity, elements = [Path(directory) / name for name in ("moons.js", "moonelements.js")]
            identity.write_bytes(b"moons")
            elements.write_bytes(b"moonelements")
            stdout = io.StringIO()
            with patch.object(generate_moons, "load_generation_manifest", return_value=manifest), patch.object(generate_moons, "OUT", identity), patch.object(generate_moons, "OUT_ELEMENTS", elements), patch.object(generate_moons, "build", return_value=("moons", "moonelements")), patch.object(sys, "argv", ["generate_moons.py", "--check"]), contextlib.redirect_stdout(stdout):
                self.assertEqual(generate_moons.main(), 0)
            self.assertIn("noncanonical comparison only", stdout.getvalue())

    def test_even_qualified_runtime_cannot_write_unreviewed_output_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            identity, elements = [Path(directory) / name for name in ("moons.js", "moonelements.js")]
            identity.write_bytes(b"old identity")
            elements.write_bytes(b"old elements")
            with patch.object(generate_moons, "canonical_errors", return_value=[]), patch.object(generate_moons, "OUT", identity), patch.object(generate_moons, "OUT_ELEMENTS", elements), patch.object(generate_moons, "build", return_value=("new identity", "new elements")), patch.object(sys, "argv", ["generate_moons.py"]), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(generate_moons.main(), 1)
            self.assertEqual(identity.read_bytes(), b"old identity")
            self.assertEqual(elements.read_bytes(), b"old elements")

    def test_committed_manifest_binds_current_sources_and_generator(self):
        generate_moons.verify_source_identity(generate_moons.load_generation_manifest())

    def test_canonical_checks_require_every_qualification_condition(self):
        digest = "sha256:" + "a" * 64
        canonical = {
            "status": "qualified", "image_digest": digest,
            "python_version": "3.12.12",
            "qualification": {"identical_runs": 2, "reviewed_evidence": "reviewed run log"},
        }
        runtime = {"system": "Linux", "machine": "x86_64", "implementation": "CPython", "python_version": "3.12.12"}
        self.assertEqual(generate_moons.canonical_errors({"canonical": canonical}, runtime, digest), [])
        for key, value in (("system", "Windows"), ("machine", "aarch64"), ("implementation", "PyPy"), ("python_version", "3.14.4")):
            with self.subTest(runtime=key):
                self.assertTrue(generate_moons.canonical_errors({"canonical": canonical}, {**runtime, key: value}, digest))
        for key, value in (("status", "pending"), ("image_digest", "latest"), ("qualification", {"identical_runs": 1, "reviewed_evidence": "log"}), ("qualification", {"identical_runs": 2})):
            with self.subTest(canonical=key, value=value):
                self.assertTrue(generate_moons.canonical_errors({"canonical": {**canonical, key: value}}, runtime, digest))
        self.assertTrue(generate_moons.canonical_errors({"canonical": canonical}, runtime, None))

    def test_changed_model_hash_is_rejected(self):
        manifest = generate_moons.load_generation_manifest()
        manifest["generator"]["files"]["tools/moon_model.py"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "generator hash mismatch: tools/moon_model.py"):
            generate_moons.verify_source_identity(manifest)


if __name__ == "__main__":
    unittest.main()
