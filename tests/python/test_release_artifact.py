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
import subprocess
import shutil
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

    def test_rendering_dependency_changes_invalidate_science_fingerprint(self):
        """Exercise staged digests, not only membership in the classifier's set."""
        import release_changes
        modules = (
            "orrery.js", "moonAppearance.js", "materialColor.js",
            "ringTransport.js", "ringTransportShaders.js",
            "surfaceReflection.js", "surfaceReflectionShaders.js",
            "terrainResources.js", "shaderPrograms.js", "referenceDemand.js",
            "hdrPresentation.js", "hdrPresentationShaders.js",
        )
        actual_web = Path(__file__).resolve().parents[2] / "apps/web/js"
        folder = self.source / "js"
        folder.mkdir()
        for name in modules:
            self.assertTrue((actual_web / name).is_file(), name)
            (folder / name).write_text("export const formula = 1;\n", encoding="utf-8")
        stylesheet = self.source / "style.css"
        stylesheet.write_text("body { color: white; }\n", encoding="utf-8")
        before = validator.validate_manifest(self.build("fingerprint-base") / "web-release-manifest.json")
        for index, name in enumerate(modules):
            with self.subTest(module=name):
                source = folder / name
                original = source.read_bytes()
                source.write_text("export const formula = 2;\n", encoding="utf-8")
                after = validator.validate_manifest(self.build(f"fingerprint-{index}") / "web-release-manifest.json")
                source.write_bytes(original)
                self.assertNotEqual(before["components"]["science"], after["components"]["science"], name)
                self.assertEqual(release_changes.category("apps/web/js/" + name), "scientific", name)
                self.assertEqual(before["wasm_sha256"], after["wasm_sha256"])
                self.assertEqual(before["data_bundle_id"], after["data_bundle_id"])
        stylesheet.write_text("body { color: black; }\n", encoding="utf-8")
        cosmetic = validator.validate_manifest(self.build("fingerprint-ui") / "web-release-manifest.json")
        self.assertEqual(before["components"]["science"], cosmetic["components"]["science"])
        self.assertNotEqual(before["components"]["ui"], cosmetic["components"]["ui"])

    def install_observation_fixture(self):
        """Retain actual reviewed bytes, with two local paths to test default selection."""
        from validate_visual_assets import browser_module
        web = Path(__file__).resolve().parents[2] / "apps/web"
        data = json.loads((web / "visual-assets.v1.json").read_text(encoding="utf-8"))
        primary_source = data["observed_images"][0]["path"]
        primary = data["observed_images"][0]
        primary["path"] = "textures/default-archive-fixture.jpg"
        other = copy.deepcopy(primary)
        other.update(id="secondary-archive-fixture", path="textures/secondary-archive-fixture.jpg")
        data["observed_images"].append(other)
        paths = {asset["path"] for asset in data["assets"]}
        paths.update(asset["path"] for asset in data.get("mapped_references", []))
        paths.update(asset["legend"]["path"] for asset in data.get("mapped_references", []) if "legend" in asset)
        paths.update(asset["path"] for asset in data["procedural_assets"] if "path" in asset)
        paths.update(("js/solarObservation.js", "js/config.js"))
        for path in paths:
            target = self.source / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(web / path, target)
        for observation in data["observed_images"]:
            shutil.copyfile(web / primary_source, self.source / observation["path"])
        (self.source / "visual-assets.v1.json").write_text(json.dumps(data), encoding="utf-8")
        (self.source / "js/visualAssetManifest.js").write_text(browser_module(data), encoding="utf-8")
        return primary["path"], other["path"]

    def test_default_observation_is_critical_without_precaching_other_rasters(self):
        primary, other = self.install_observation_fixture()
        prior = self.build("observation-first")
        original = validator.validate_manifest(prior / "web-release-manifest.json")
        roles = {asset["path"]: asset["role"] for asset in original["assets"]}
        self.assertEqual(roles[original["namespace"] + primary], "critical")
        self.assertEqual(roles[original["namespace"] + other], "optional")
        self.assertEqual(roles[original["namespace"] + "textures/earth.jpg"], "optional")
        self.assertEqual([path for path, role in roles.items() if "/textures/" in path and role == "critical"],
                         [original["namespace"] + primary])
        # An update installs only its own primary image. Previous clients retain
        # their completed caches; old namespaces must not join the new install set.
        updated = validator.validate_manifest(self.build("observation-next", prior) / "web-release-manifest.json")
        updated_roles = {asset["path"]: asset["role"] for asset in updated["assets"]}
        self.assertEqual(updated_roles[updated["namespace"] + primary], "critical")
        self.assertEqual(updated_roles[original["namespace"] + primary], "optional")
        self.assertEqual(updated_roles[updated["namespace"] + other], "optional")

    def test_default_observation_integrity_failure_cannot_produce_a_release(self):
        primary, _ = self.install_observation_fixture()
        (self.source / primary).write_bytes(b"not the reviewed original observation")
        with self.assertRaisesRegex(ValueError, "observed image bytes differ"):
            self.build("observation-corrupt")
        self.assertFalse((self.root / "observation-corrupt").exists())

    def test_historical_texture_name_alone_does_not_enter_the_critical_set(self):
        (self.source / "textures").mkdir()
        (self.source / "textures/solar-observation-171.jpg").write_bytes(b"historical optional fixture")
        manifest = validator.validate_manifest(self.build("historical-texture") / "web-release-manifest.json")
        asset = next(item for item in manifest["assets"] if item["path"].endswith("textures/solar-observation-171.jpg"))
        self.assertEqual(asset["role"], "optional")

    def test_visual_inventory_without_observation_runtime_keeps_images_optional(self):
        self.install_observation_fixture()
        (self.source / "js/solarObservation.js").unlink()
        web = Path(__file__).resolve().parents[2] / "apps/web"
        shutil.copyfile(web / "js/visualAssets.js", self.source / "js/visualAssets.js")
        manifest = validator.validate_manifest(self.build("visual-runtime-only") / "web-release-manifest.json")
        textures = [item for item in manifest["assets"] if "/textures/" in item["path"]]
        self.assertTrue(textures)
        self.assertTrue(all(item["role"] == "optional" for item in textures))

    def test_stable_root_bootstrap_preserves_share_fragment_in_current_release(self):
        # Execute the builder's generated script, not a copy of its routing logic.
        # Chromium coverage separately verifies actual document navigation.
        script = r'''
const fs = require("node:fs"), vm = require("node:vm");
const html = fs.readFileSync(process.argv[1], "utf8");
const location = new URL(process.argv[2]), redirects = [], link = {};
location.replace = url => redirects.push(String(url));
const context = vm.createContext({ URL, location, document: { getElementById: () => link } });
for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
process.stdout.write(JSON.stringify({ redirects, link: link.href }));
'''
        for index, base in enumerate(("/", "/sol/", "/research/sol/")):
            with self.subTest(base=base):
                output = self.root / f"share-{index}"
                build_web.build_site(self.source, self.wasm, output, release_id="new-release",
                    source_sha="a" * 40, repository="owner/repo", run_id=123, run_attempt=1,
                    base_path=base, schemas=["solar-state-snapshot.v2", "ephemeris-snapshot.v2"])
                self.assertFalse((output / "releases/old-release").exists())
                for fragment in ("#sky=12.5,-76,1782872027,10", "", "#sky=%22%3Cscript%3E"):
                    address = "https://example.invalid" + base + fragment
                    result = subprocess.run(["node", "-e", script, str(output / "index.html"), address],
                        text=True, capture_output=True, check=True, timeout=10)
                    expected = "https://example.invalid" + base + "releases/new-release/index.html" + fragment
                    self.assertEqual(json.loads(result.stdout), {"redirects": [expected], "link": expected})
                validator.validate_manifest(output / "web-release-manifest.json")

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

    def test_admission_only_edits_invalidate_scientific_qualification_not_data_or_wasm(self):
        import test_release_policy
        (self.source / "js").mkdir()
        for name in ("dataBundle.js", "sourceAttribution.js"):
            with self.subTest(name=name):
                module = self.source / "js" / name
                module.write_text("export const accepts = value => value !== null;")
                original = validator.validate_manifest(self.build(name + "-before") / "web-release-manifest.json")
                module.write_text("export const accepts = value => typeof value === 'string';")
                changed = validator.validate_manifest(self.build(name + "-after") / "web-release-manifest.json")
                self.assertNotEqual(original["components"]["science"], changed["components"]["science"])
                self.assertEqual(original["data_bundle_id"], changed["data_bundle_id"])
                self.assertEqual(original["wasm_sha256"], changed["wasm_sha256"])
                fixture = test_release_policy.ReleasePolicyTests()
                fixture.setUp()
                fixture.candidate["components"] = original["components"]
                fixture.trusted["components"] = original["components"]
                fixture.trusted["qualification_scope"] = {
                    "manual": {"AC-01": {"components": ["ui"], "platforms": ["chromium-desktop"]}},
                    "scientific": {"F01": {"components": ["science"], "platforms": ["chromium-desktop"]}},
                }
                records = fixture.qualify()
                baseline = release_policy.evaluate(fixture.candidate, fixture.trusted, records, fixture.today)
                self.assertTrue(baseline.promotion_eligible, baseline.reasons)
                fixture.candidate["components"] = {**original["components"], "ui": changed["components"]["ui"]}
                fixture.trusted["components"] = fixture.candidate["components"]
                ui_only = release_policy.evaluate(fixture.candidate, fixture.trusted, records, fixture.today)
                self.assertIn("qualification-missing:manual", ui_only.reasons)
                self.assertNotIn("qualification-missing:scientific", ui_only.reasons)
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
        rendered = ('<body data-experience="research"><div id="baseLabel">Base: synthetic photosphere (synthetic)</div>'
                    '<div>solar-state-snapshot.v3</div><div id="regionList"><button data-object-id="AR1">AR1</button></div></body>')
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
