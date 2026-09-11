from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import io
import sys
import contextlib
from unittest.mock import patch
import test_release_artifact
import xml.etree.ElementTree as ET


class EvidenceTests(unittest.TestCase):
    def test_python_source_resolution_rejects_ambiguous_unresolved_and_escaping_roots(self):
        import release_evidence as evidence
        self.assertTrue(hasattr(evidence, "python_denominator"), "Python XML sources are not resolved")
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / "tools").mkdir()
            (repo / "services/ephemeris-server").mkdir(parents=True)
            (repo / "tools/one.py").write_text("x=1\n")
            (repo / "services/ephemeris-server/server.py").write_text("x=1\n")
            def report(sources, names):
                xml = ET.Element("coverage")
                roots = ET.SubElement(xml, "sources")
                for source in sources: ET.SubElement(roots, "source").text = source
                for name in names: ET.SubElement(xml, "class", filename=name)
                return xml
            sources = [str(repo / "tools"), str(repo / "services/ephemeris-server")]
            self.assertEqual(evidence.python_denominator(report(sources, ["one.py", "server.py"]), repo),
                ["services/ephemeris-server/server.py", "tools/one.py"])
            (repo / "tools/server.py").write_text("x=2\n")
            with self.assertRaisesRegex(ValueError, "ambiguous"):
                evidence.python_denominator(report(sources, ["server.py"]), repo)
            for roots, names in ((sources, ["missing.py"]), ([], ["one.py"]),
                    ([sources[0], sources[0]], ["one.py"]), ([""], ["one.py"]), (sources, ["one.py", "one.py"]),
                    ([str(repo / "../outside")], ["one.py"]), (["../outside"], ["one.py"]),
                    (sources, ["../escape.py"]), (sources, [str(repo / "tools/one.py")])):
                with self.assertRaises(ValueError):
                    evidence.python_denominator(report(roots, names), repo)

    def test_capture_actual_local_toolchain_and_locks_cli(self):
        import release_evidence as evidence
        root = Path(__file__).resolve().parents[2]
        with patch.object(sys, "argv", ["release_evidence.py", "--capture-build", "--source-root", str(root)]), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(evidence.main(), 0)
        data = json.loads(output.getvalue())
        self.assertRegex(data["toolchains"]["rustc"], r"^rustc \d")
        self.assertEqual(set(data["locks"]), {"Cargo.lock", "package-lock.json"})
        with patch.object(sys, "argv", ["release_evidence.py"]), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                evidence.main()
            self.assertEqual(error.exception.code, 1)

    def test_outer_evidence_retains_actual_tool_locks_mapping_and_all_coverage_denominators(self):
        self.assertIsNotNone(importlib.util.find_spec("release_evidence"), "rich evidence collector missing")
        import release_evidence as evidence
        fixture = test_release_artifact.ReleaseArtifactTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        site = fixture.build()
        root = fixture.root / "coverage"
        root.mkdir()
        (root / "rust.lcov").write_text("SF:crates/core/src/lib.rs\nLF:10\nLH:9\nend_of_record\n")
        repository = Path(__file__).resolve().parents[2]
        try:
            import coverage
        except ImportError:
            self.skipTest("actual reporter shape runs in the mandatory pinned coverage job")
        # Use the actual workflow source roots and installed reporter, without
        # executing provider/network code. The denominator is intentionally real.
        selected = [repository / "tools/release_changes.py", repository / "services/ephemeris-server/server.py"]
        measured = coverage.Coverage(data_file=None, source=[str(repository / "tools"), str(repository / "services/ephemeris-server")])
        measured.get_data().add_lines({str(path): set(range(1, len(path.read_text(encoding="utf-8").splitlines()) + 1)) for path in selected})
        measured.xml_report(outfile=str(root / "python.xml"), include=[str(path) for path in selected])
        (root / "combined").mkdir()
        (root / "browser").mkdir()
        (root / "browser/coverage-summary.json").write_text('{"total":{"lines":{"total":100,"covered":0}}}')
        (root / "combined/coverage-summary.json").write_text(json.dumps({"total": {"lines": {"total": 10, "covered": 9, "pct": 90}}, "/checkout/apps/web/app.js": {"lines": {"total": 10, "covered": 9, "pct": 90}}}))
        provenance = {"schema_version": "build-provenance.v1", "source_sha": "a" * 40,
            "toolchains": {"rustc": "rustc 1.96.0", "cargo": "cargo 1.96.0", "python": "Python 3.12.12"},
            "locks": {"Cargo.lock": "c" * 64, "package-lock.json": "d" * 64}}
        result = evidence.collect(site / "web-release-manifest.json", root, provenance)
        self.assertEqual(result["coverage"]["rust"]["lines_total"], 10)
        self.assertEqual(result["coverage"]["python"]["denominator"], ["services/ephemeris-server/server.py", "tools/release_changes.py"])
        self.assertEqual(result["coverage"]["web"]["denominator"], ["apps/web/app.js"])
        self.assertEqual(result["source_mapping"]["releases/ci-abc-123-1/app.js"]["source_path"], "apps/web/app.js")
        self.assertEqual(result["toolchains"], provenance["toolchains"])
        self.assertTrue(hasattr(evidence, "validate_outer"), "promotion does not verify rich outer evidence against staged bytes")
        evidence.validate_outer(result, site / "web-release-manifest.json")
        unresolved = dict(result, coverage={**result["coverage"], "python": {
            **result["coverage"]["python"], "denominator": ["server.py", "release_changes.py"]}})
        with self.assertRaisesRegex(ValueError, "Python coverage"):
            evidence.validate_outer(unresolved, site / "web-release-manifest.json")
        for field, value in (("wasm_sha256", {}), ("source_mapping", {}), ("coverage", {}), ("toolchains", {})):
            with self.assertRaises(ValueError):
                evidence.validate_outer(dict(result, **{field: value}), site / "web-release-manifest.json")
        (root / "rust.lcov").write_text("SF:crates/core/src/lib.rs\nLF:10\nLH:8\nend_of_record\n")
        with self.assertRaisesRegex(ValueError, "coverage"):
            evidence.collect(site / "web-release-manifest.json", root, provenance)
        with self.assertRaisesRegex(ValueError, "source"):
            evidence.collect(site / "web-release-manifest.json", root, dict(provenance, source_sha="0" * 40))
        with self.assertRaisesRegex(ValueError, "toolchain"):
            evidence.collect(site / "web-release-manifest.json", root, dict(provenance, locks={}))
        (root / "python.xml").write_text('<!DOCTYPE x><coverage/>')
        with self.assertRaisesRegex(ValueError, "XML"):
            evidence.collect(site / "web-release-manifest.json", root, provenance)
        (root / "python.xml").unlink()
        with self.assertRaisesRegex(ValueError, "report"):
            evidence.collect(site / "web-release-manifest.json", root, provenance)
