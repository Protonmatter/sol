from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
import urllib.request
import contextlib
import io
import os
import runpy
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import build_web
import validate_release_manifest as validator
import browser_smoke
import release_policy
import build_wasm


class ReleaseArtifactTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        (self.source / "index.html").write_text('<script type="module" src="app.js?v=old"></script>', encoding="utf-8")
        (self.source / "app.js").write_text('fetch("pkg/solar_wasm.wasm?v=old"); const release="__SOL_RELEASE_ID__";', encoding="utf-8")
        (self.source / "sw.js").write_text('const release="__SOL_RELEASE_ID__";', encoding="utf-8")
        (self.source / "data").mkdir()
        (self.source / "data" / "latest-state.json").write_text('{}', encoding="utf-8")
        self.wasm = self.root / "wasm"
        self.wasm.mkdir()
        for name in ("solar_wasm.wasm", "solar_ephemeris.wasm"):
            (self.wasm / name).write_bytes(b"\0asm\1\0\0\0")

    def build(self, name="ci-abc-123-1", previous=None):
        out = self.root / name
        build_web.build_site(self.source, self.wasm, out, release_id=name,
            source_sha="a" * 40, repository="owner/repo", run_id=123, run_attempt=1,
            base_path="/sol/", previous_root=previous,
            schemas=["solar-state-snapshot.v2", "ephemeris-snapshot.v2"])
        return out

    def test_final_bytes_and_namespace_manifest_validate_without_source_mutation(self):
        before = (self.source / "app.js").read_bytes()
        out = self.build()
        manifest = validator.validate_manifest(out / "web-release-manifest.json")
        self.assertEqual((self.source / "app.js").read_bytes(), before)
        self.assertEqual(manifest["namespace"], "releases/ci-abc-123-1/")
        self.assertIn(b"releases/ci-abc-123-1/index.html", (out / "index.html").read_bytes())
        self.assertFalse((out / manifest["namespace"] / "sw.js").exists())
        self.assertEqual((out / "web-release-manifest.json").read_bytes(),
            (out / manifest["namespace"] / "web-release-manifest.json").read_bytes())
        self.assertTrue(any(asset["path"] == "index.html" and asset["role"] == "critical" for asset in manifest["assets"]))

    def test_asset_tampering_and_unlisted_files_fail(self):
        out = self.build()
        (out / "releases/ci-abc-123-1/app.js").write_text("tampered", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "digest|size"):
            validator.validate_manifest(out / "web-release-manifest.json")
        out2 = self.build("ci-second")
        (out2 / "unexpected.js").write_text("foreign code", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "inventory"):
            validator.validate_manifest(out2 / "web-release-manifest.json")

    def test_scientific_schema_changes_invalidate_science_but_css_only_does_not(self):
        initial = validator.validate_manifest(self.build() / "web-release-manifest.json")
        (self.source / "style.css").write_text("body { color: blue; }")
        css = validator.validate_manifest(self.build("css-change") / "web-release-manifest.json")
        self.assertNotEqual(initial["components"]["ui"], css["components"]["ui"])
        self.assertEqual(initial["components"]["science"], css["components"]["science"])
        (self.source / "js").mkdir()
        (self.source / "js/solarSchema.js").write_text('export const solarSchema = {"different":"contract"};')
        schema = validator.validate_manifest(self.build("schema-change") / "web-release-manifest.json")
        self.assertNotEqual(css["components"]["science"], schema["components"]["science"])

    def test_solar_contract_only_change_invalidates_old_scientific_qualification(self):
        import test_release_policy
        (self.source / "js").mkdir()
        contract = self.source / "js/solarContract.js"
        contract.write_text("export const durationTolerance = 0.01;")
        original = validator.validate_manifest(self.build("contract-before") / "web-release-manifest.json")
        contract.write_text("export const durationTolerance = 0.02;")
        changed = validator.validate_manifest(self.build("contract-after") / "web-release-manifest.json")
        self.assertNotEqual(original["components"]["science"], changed["components"]["science"])
        fixture = test_release_policy.ReleasePolicyTests()
        fixture.setUp()
        fixture.candidate["components"] = original["components"]
        fixture.trusted["components"] = original["components"]
        records = fixture.qualify()
        fixture.candidate["components"] = changed["components"]
        fixture.trusted["components"] = changed["components"]
        decision = release_policy.evaluate(fixture.candidate, fixture.trusted, records, fixture.today)
        self.assertIn("qualification-missing:scientific", decision.reasons)

    def test_path_baseurl_source_run_identity_and_collisions_fail_closed(self):
        out = self.build()
        manifest_path = out / "web-release-manifest.json"
        original = json.loads(manifest_path.read_text())
        for value in ("../escape.js", "/absolute.js", "a\\b.js", "https://host/code.js", "a%2fb.js"):
            bad = copy.deepcopy(original)
            bad["assets"][0]["path"] = value
            with self.assertRaises(ValueError):
                validator.validate_data(bad, out)
        for field, value in (("base_path", "//foreign/"), ("source_sha", "bad"), ("run_id", 0), ("run_attempt", -1)):
            bad = dict(original, **{field: value})
            with self.assertRaises(ValueError):
                validator.validate_data(bad, out)
        with self.assertRaisesRegex(ValueError, "exists"):
            self.build()

    def test_same_js_new_wasm_changes_final_manifest_identity(self):
        out1 = self.build()
        first = validator.validate_manifest(out1 / "web-release-manifest.json")
        (self.wasm / "solar_wasm.wasm").write_bytes(b"\0asm\1\0\0\0changed")
        out2 = self.build("ci-second")
        second = validator.validate_manifest(out2 / "web-release-manifest.json")
        self.assertNotEqual(first["wasm_sha256"], second["wasm_sha256"])

    def test_missing_wasm_or_symlink_source_is_rejected(self):
        (self.wasm / "solar_wasm.wasm").unlink()
        with self.assertRaises(ValueError):
            self.build()

    def test_previous_namespace_is_retained_only_from_verified_artifact(self):
        prior = self.build()
        out = self.build("ci-second", prior)
        manifest = validator.validate_manifest(out / "web-release-manifest.json")
        self.assertTrue((out / "releases/ci-abc-123-1/app.js").is_file())
        self.assertEqual(manifest["previous_release_id"], "ci-abc-123-1")
        (prior / "index.html").write_text("tampered", encoding="utf-8")
        with self.assertRaises(ValueError):
            self.build("ci-third", prior)

    def test_recognized_v2_to_v3_transition_retains_separate_namespace(self):
        prior = self.build()
        out = self.root / "v3"
        build_web.build_site(self.source, self.wasm, out, release_id="v3", source_sha="b" * 40,
            repository="owner/repo", run_id=124, run_attempt=1, base_path="/sol/", previous_root=prior,
            schemas=["solar-state-snapshot.v2", "ephemeris-snapshot.v3"])
        manifest = validator.validate_manifest(out / "web-release-manifest.json")
        historical = json.loads((out / "releases/ci-abc-123-1/web-release-manifest.json").read_text())
        self.assertIn("ephemeris-snapshot.v3", manifest["schemas"])
        self.assertIn("ephemeris-snapshot.v2", historical["schemas"])
        self.assertEqual((out / "releases/ci-abc-123-1/app.js").read_bytes(),
                         (prior / "releases/ci-abc-123-1/app.js").read_bytes())
        old = json.loads((prior / "web-release-manifest.json").read_text())
        old["abi_versions"]["solar"] = 99
        for path in (prior / "web-release-manifest.json", prior / old["namespace"] / "web-release-manifest.json"):
            path.write_text(json.dumps(old), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "abi_versions|ABI"):
            build_web.build_site(self.source, self.wasm, self.root / "unsupported-abi", release_id="abi",
                source_sha="b" * 40, repository="owner/repo", run_id=124, run_attempt=1, base_path="/sol/",
                previous_root=prior, schemas=["solar-state-snapshot.v2", "ephemeris-snapshot.v3"])

    def test_solar_v3_transition_preserves_prior_solar_v2_namespace(self):
        prior = self.build()
        result = build_web.build_site(self.source,self.wasm,self.root/"solar-v3",release_id="solar-v3",
            source_sha="b"*40,repository="owner/repo",run_id=124,run_attempt=1,base_path="/sol/",previous_root=prior,
            schemas=["solar-state-snapshot.v3","ephemeris-snapshot.v3"],
            bundle_pointer=Path(__file__).resolve().parents[2]/"apps/web/data/current.json")
        self.assertIn("solar-state-snapshot.v3",result["schemas"])
        self.assertTrue((self.root/"solar-v3/releases/ci-abc-123-1/app.js").is_file())

    def test_smoke_accepts_current_solar_v3_keyed_rows_before_advancing_to_sky(self):
        rendered = '<div>solar-state-snapshot.v3</div><div id="regionList"><button data-object-id="AR1">AR1</button></div>'
        # The external Chromium process is replaced at its text-output seam;
        # reaching the next surface proves actual Sun assertions accepted v3.
        with patch.object(browser_smoke,"dump_dom",side_effect=[(rendered,""),RuntimeError("next surface")]):
            with self.assertRaisesRegex(RuntimeError,"next surface"):
                browser_smoke.run_smoke("http://127.0.0.1", "fixture-chromium")

    def test_smoke_server_serves_staged_namespace_under_base_path(self):
        out = self.build()
        with browser_smoke.serve(out, "/sol/", "releases/ci-abc-123-1/") as url:
            with urllib.request.urlopen(url + "/app.js", timeout=2) as response:
                self.assertEqual(response.read(), (out / "releases/ci-abc-123-1/app.js").read_bytes())
            with urllib.request.urlopen(url + "/index.html", timeout=2) as response:
                self.assertIn(b"app.js?v=ci-abc-123-1", response.read())

    def test_automated_gate_cli_emits_exact_artifact_identity_and_rejects_missing_gate(self):
        out = self.build()
        env = {"NEEDS_JSON": json.dumps({name: {"result": "success"} for name in release_policy.REQUIRED_JOBS}),
            "GITHUB_EVENT_NAME": "push", "GITHUB_REF": "refs/heads/master", "ARTIFACT_ID": "456",
            "GITHUB_REPOSITORY": "owner/repo", "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1",
            "MANIFEST_SHA256": validator.digest(out / "web-release-manifest.json")}
        evidence = self.root / "release-evidence.json"
        argv = ["release_policy.py", "--ci-evidence", str(evidence), "--manifest", str(out / "web-release-manifest.json")]
        with patch.dict(os.environ, env), patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(release_policy.main(), 0)
        self.assertEqual(json.loads(evidence.read_text())["artifact_id"], 456)
        self.assertTrue(json.loads(output.getvalue())["candidate_verified"])
        env["NEEDS_JSON"] = "{}"
        with patch.dict(os.environ, env), patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(release_policy.main(), 1)

    def test_validator_cli_trusted_identity_checks_and_manifest_copy_rejection(self):
        out = self.build()
        manifest = out / "web-release-manifest.json"
        argv = ["validate_release_manifest.py", str(manifest), "--source-sha", "a" * 40,
            "--run-id", "123", "--run-attempt", "1", "--repository", "owner/repo",
            "--expected-sha256", validator.digest(manifest)]
        with patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(validator.main(), 0)
        for badargs in ([str(manifest), "--run-id", "999"], [str(manifest), "--expected-sha256", "0" * 64]):
            with patch.object(sys, "argv", ["validator", *badargs]), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    validator.main()
            self.assertEqual(error.exception.code, 1)
        (out / "releases/ci-abc-123-1/web-release-manifest.json").write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "copy"):
            validator.validate_manifest(manifest)

    def test_build_cli_discovers_live_schemas_and_rejects_existing_output(self):
        (self.source / "js").mkdir()
        (self.source / "js/solarSchema.js").write_text('export const solarSchema = {"properties":{"schema_version":{"const":"solar-state-snapshot.v3"}}};\nexport const SOLAR_STATE_SNAPSHOT_SCHEMA = solarSchema.properties.schema_version.const;\nexport const solarImageRegistrationSchema = {};')
        (self.source / "js/ephemerisContract.js").write_text('if (snapshot.schema_version !== "ephemeris-snapshot.v3") throw Error();')
        target = self.root / "cli-output"
        argv = ["build_web.py", "--source-root", str(self.source), "--wasm-dir", str(self.wasm),
            "--out-dir", str(target), "--release-id", "ci-cli", "--source-sha", "a" * 40,
            "--repository", "owner/repo", "--run-id", "123", "--bundle-pointer", str(Path(__file__).resolve().parents[2]/"apps/web/data/current.json")]
        with patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(build_web.main(), 0)
        self.assertIn("ephemeris-snapshot.v3", validator.validate_manifest(target / "web-release-manifest.json")["schemas"])
        with patch.object(sys, "argv", argv), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                build_web.main()
        self.assertEqual(error.exception.code, 1)

    def test_wasm_wrapper_copies_compiler_outputs_and_always_enforces_lockfile(self):
        # Cargo is the external compiler boundary. Its known side effect is a
        # target/release WASM file; the fixture models that output explicitly.
        def compiler(command, *, cwd, check):
            self.assertIn("--locked", command)
            self.assertTrue(check)
            crate = command[command.index("-p") + 1]
            target = cwd / "target/wasm32-unknown-unknown/release" / (crate.replace("-", "_") + ".wasm")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"\0asm\1\0\0\0")
        output = self.root / "compiled-wasm"
        with patch.object(build_wasm, "ROOT", self.root), patch.object(build_wasm.subprocess, "run", compiler), \
            patch.object(sys, "argv", ["build_wasm.py", "--out-root", str(output), "--locked"]), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(build_wasm.main(), 0)
        self.assertEqual((output / "solar_wasm.wasm").read_bytes(), b"\0asm\1\0\0\0")
        with patch.object(build_wasm, "ROOT", self.root), patch.object(sys, "argv", ["build_wasm.py", "--out-root", str(self.root / "apps/web/pkg")]), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                build_wasm.main()

    def test_semantic_manifest_negatives_remain_rejected_after_schema_validation(self):
        out = self.build()
        original = validator.validate_manifest(out / "web-release-manifest.json")
        mutations = [
            ("release_id", "!"), ("namespace", "releases/foreign/"),
            ("source_sha", "z" * 40), ("repository", "invalid repository"),
            ("base_path", "relative/"),
        ]
        for key, value in mutations:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validator.validate_data(dict(original, **{key: value}), out)
        for kind in ("collision", "digest", "missing", "source", "critical", "wasm"):
            bad = copy.deepcopy(original)
            if kind == "collision":
                bad["assets"].append(dict(bad["assets"][0]))
            elif kind == "digest":
                bad["assets"][0]["sha256"] = "z" * 64
            elif kind == "missing":
                bad["assets"][0]["path"] = "absent.js"
            elif kind == "source":
                bad["assets"][1]["source_path"] = "foreign/code.js"
            elif kind == "critical":
                next(item for item in bad["assets"] if item["path"] == "index.html")["role"] = "optional"
            else:
                bad["wasm_sha256"]["solar_wasm.wasm"] = "0" * 64
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                validator.validate_data(bad, out)
        wasm = out / original["namespace"] / "pkg/solar_wasm.wasm"
        wasm.write_bytes(b"invalid!")
        asset = next(item for item in original["assets"] if item["path"].endswith("solar_wasm.wasm"))
        asset.update(size=wasm.stat().st_size, sha256=validator.digest(wasm))
        original["wasm_sha256"]["solar_wasm.wasm"] = asset["sha256"]
        with self.assertRaisesRegex(ValueError, "header"):
            validator.validate_data(original, out)

    def test_json_loader_rejects_duplicates_nonobjects_and_nonfinite_values(self):
        path = self.root / "invalid.json"
        for value in ('{"x":1,"x":2}', '[]', '{"x":NaN}'):
            path.write_text(value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                validator.load_json(path)
        with patch.object(Path, "stat") as stat:
            stat.return_value.st_size = 16 * 1024 * 1024 + 1
            with self.assertRaisesRegex(ValueError, "size limit"):
                validator.load_json(path)

    def test_builder_rejects_overlap_bad_id_and_incompatible_previous_release(self):
        common = dict(source_sha="a" * 40, repository="owner/repo", run_id=123, run_attempt=1,
                      schemas=["solar-state-snapshot.v2", "ephemeris-snapshot.v2"])
        for output, name in ((self.source / "output", "valid"), (self.root / "invalid", "!")):
            with self.assertRaises(ValueError):
                build_web.build_site(self.source, self.wasm, output, release_id=name, **common)
        previous = self.build()
        for name, changes in (("ci-abc-123-1", {}), ("wrong-base", {"base_path": "/"}),
                              ("wrong-schema", {"schemas": ["future.v9"]})):
            args = dict(common, base_path="/sol/", **{})
            args.update(changes)
            with self.subTest(name=name), self.assertRaises(ValueError):
                build_web.build_site(self.source, self.wasm, self.root / (name + "-out"),
                    release_id=name, previous_root=previous, **args)
        (self.source / "pkg").mkdir()
        (self.source / "pkg/old.wasm").write_bytes(b"ignored")
        output = self.build("excludes-old")
        self.assertFalse((output / "releases/excludes-old/pkg/old.wasm").exists())


if __name__ == "__main__":
    unittest.main()
