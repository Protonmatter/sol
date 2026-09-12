from __future__ import annotations
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import sys
import contextlib
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))


class CrateTests(unittest.TestCase):
    def test_registry_only_404_is_absent_not_auth_or_outage(self):
        self.assertIsNotNone(importlib.util.find_spec("release_crate"), "registry hold/package evidence missing")
        import release_crate as crate
        self.assertEqual(crate.registry_state(404, b"", "solar-ephemeris", "1.0.0"), "absent")
        body = b'{"version":{"crate":"solar-ephemeris","num":"1.0.0"}}'
        self.assertEqual(crate.registry_state(200, body, "solar-ephemeris", "1.0.0"), "present")
        for status in (0, 201, 301, 401, 403, 429, 500, 503):
            with self.assertRaises(ValueError):
                crate.registry_state(status, body, "solar-ephemeris", "1.0.0")
        with self.assertRaises(ValueError):
            crate.registry_state(200, b'{}', "solar-ephemeris", "1.0.0")

    def test_package_inventory_binds_sources_notices_and_dry_run_without_publication(self):
        self.assertIsNotNone(importlib.util.find_spec("release_crate"), "registry hold/package evidence missing")
        import release_crate as crate
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "crates/solar-ephemeris"
            source.mkdir(parents=True)
            package = root / "solar-ephemeris-1.0.0.crate"
            files = {"Cargo.toml.orig": b'[package]\nname="solar-ephemeris"\nversion="1.0.0"\n',
                "Cargo.toml": b'[package]\nname="solar-ephemeris"\nversion="1.0.0"\n',
                "src/lib.rs": b"pub fn engine() {}", "LICENSE-MIT": b"MIT license", "LICENSE-APACHE": b"Apache license",
                ".cargo_vcs_info.json": json.dumps({"git": {"sha1": "a" * 40, "dirty": False}, "path_in_vcs": "crates/solar-ephemeris"}).encode()}
            for name, data in files.items():
                if name == ".cargo_vcs_info.json": continue
                target = source / ("Cargo.toml" if name == "Cargo.toml.orig" else name)
                target.parent.mkdir(exist_ok=True)
                target.write_bytes(data)
            def archive():
                with tarfile.open(package, "w:gz") as tar:
                    for name, data in files.items():
                        member = tarfile.TarInfo("solar-ephemeris-1.0.0/" + name)
                        member.size = len(data)
                        tar.addfile(member, io.BytesIO(data))
            archive()
            log = root / "dry-run.txt"
            log.write_text("cargo publish --dry-run completed (fixture)")
            result = crate.package_evidence(package, root, "a" * 40, log, dry_run_exit=0)
            self.assertEqual(result["publication"], "held")
            self.assertEqual(result["registry"], "not_checked")
            self.assertEqual(result["notices"], ["LICENSE-APACHE", "LICENSE-MIT"])
            argv = ["release_crate.py", "--package", str(package), "--source-root", str(root), "--source-sha", "a" * 40, "--dry-run-log", str(log), "--dry-run-exit", "0"]
            with patch.object(sys, "argv", argv), patch("release_crate.subprocess.run", return_value=SimpleNamespace(stdout="a" * 40)), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(crate.main(), 0)
                self.assertEqual(json.loads(output.getvalue())["publication"], "held")
            with patch.object(sys, "argv", argv), patch("release_crate.subprocess.run", return_value=SimpleNamespace(stdout="b" * 40)), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    crate.main()
                self.assertEqual(error.exception.code, 1)
            for args in ([], ["--registry-status", "404"], ["--registry-status", "404", "--registry-body", str(log), "--version", "1.0.0"]):
                with patch.object(sys, "argv", ["release_crate.py", *args]), contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()):
                    if len(args) == 6:
                        self.assertEqual(crate.main(), 0)
                        self.assertEqual(json.loads(output.getvalue())["registry"], "absent")
                    else:
                        with self.assertRaises(SystemExit): crate.main()
            (source / "src/lib.rs").write_text("changed source")
            with self.assertRaisesRegex(ValueError, "source"):
                crate.package_evidence(package, root, "a" * 40, log, dry_run_exit=0)
            with self.assertRaisesRegex(ValueError, "dry-run"):
                crate.package_evidence(package, root, "a" * 40, log, dry_run_exit=1)
            files["../escape"] = b"bad"
            archive()
            with self.assertRaises(ValueError):
                crate.package_evidence(package, root, "a" * 40, log, dry_run_exit=0)
