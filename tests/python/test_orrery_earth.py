"""Offline daily Earth admission and exact staging boundaries, synthetic imagery."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import importlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

from tools import fetch_earth_reference as fetch
from tools import validate_visual_assets as visual
from test_fetch_earth_reference import PALETTE, capabilities
from test_mapped_references import reference

NOW = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)


class DailyEarthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = tempfile.TemporaryDirectory()
        cls.fixture = Path(cls.archive.name) / "candidate"
        # Real acquisition/derivation with a bounded synthetic provider response.
        weather = fetch.encode_rgba(2048, 1024, bytes([10, 20, 30, 255]) * (2048 * 1024))
        mask = fetch.encode_rgba(2048, 1024, bytes(2048 * 1024 * 4))
        def provider(url, limit):
            layer = parse_qs(urlsplit(url).query).get("LAYERS", [""])[0]
            raw = (capabilities("2026-09-25/2026-09-27/P1D", aqua="2026-09-25/2026-09-27/P1D")
                   if url == fetch.CAPABILITIES_URL else PALETTE if url == fetch.PALETTE_URL
                   else mask if "Data_No_Data" in layer else weather)
            return raw, {"url": url, "final_url": url, "content_type": "image/png", "http_last_modified": None}
        fetch.refresh(cls.fixture, "previous-day", 2048, NOW, build_root=Path(cls.archive.name), fetcher=provider, aqua_fill=True)

    @classmethod
    def tearDownClass(cls):
        cls.archive.cleanup()

    def setUp(self):
        self.assertTrue((ROOT / "tools/orrery_earth.py").exists(), "daily Earth validator implementation is missing")
        self.mod = importlib.import_module("tools.orrery_earth")
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.candidate = Path(self.temp.name) / "candidate"
        shutil.copytree(self.fixture, self.candidate)

    def edit(self, change):
        path = self.candidate / "earth-reference.json"
        data = json.loads(path.read_text(encoding="utf-8")); change(data)
        path.write_text(json.dumps(data), encoding="utf-8")

    def checkout(self):
        root = Path(self.temp.name) / "checkout"
        web = root / "apps/web"; (web / "js").mkdir(parents=True)
        data = json.loads((ROOT / "apps/web/visual-assets.v1.json").read_text(encoding="utf-8"))
        old = next(r for r in data["mapped_references"] if r["body"] == "Earth" and r["role"] == "weather")
        raw = b"previous raster fixture"
        # Daily data changes must not move the synthetic migration's baseline.
        # Start from a historical manual record; the tests below explicitly
        # stage once when they need an existing automated daily reference.
        baseline = reference(raw)
        baseline.update(id="synthetic-earth-weather", role="weather", nodata="alpha",
            path="textures/reference/earth-weather-20260912.png", dimensions=[2048, 1024],
            source_url=fetch.BASE + "?TIME=2026-09-12",
            observation_label="12 September 2026 synthetic reference")
        data["mapped_references"][data["mapped_references"].index(old)] = baseline
        old = baseline
        target = web / old["path"]; target.parent.mkdir(parents=True); target.write_bytes(raw)
        (web / "visual-assets.v1.json").write_text(json.dumps(data), encoding="utf-8")
        (web / "js/visualAssetManifest.js").write_text(visual.browser_module(data), encoding="utf-8")
        (web / "textures/reference/keep.txt").write_bytes(b"unrelated")
        return root, data

    def test_accepts_rederived_pixels_without_editing_candidate(self):
        before = {p.name: p.read_bytes() for p in self.candidate.iterdir()}
        result = self.mod.validate_candidate(self.candidate, NOW)
        self.assertEqual(result.data_date, "2026-09-27")
        self.assertEqual(result.sha256, hashlib.sha256(before["weather-rgba.png"]).hexdigest())
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.candidate.iterdir()})

    def test_fixture_migration_is_independent_of_newer_live_weather(self):
        source = json.loads((ROOT / "apps/web/visual-assets.v1.json").read_text(encoding="utf-8"))
        for daily in (False, True):
            with self.subTest(daily=daily), tempfile.TemporaryDirectory() as current, tempfile.TemporaryDirectory() as work:
                data = deepcopy(source)
                weather = self.mod.get_weather(data)
                weather.pop("automated_refresh", None)
                weather.update(source_url=fetch.BASE + "?TIME=2030-01-01",
                    source_retrieved_at="2030-01-02T00:00:00Z", reviewed_at="2030-01-02T01:00:00Z",
                    observation_label="1 January 2030 synthetic accepted reference",
                    path="textures/reference/earth-weather-20300101.png")
                weather["derivation_inputs"][0]["url"] = weather["source_url"]
                if daily:
                    weather.update(path="textures/reference/earth-weather-daily.png", reviewed_at=None,
                        automated_refresh={"recipe_id": "earth-modis-terra-aqua.v1",
                            "data_date": "2030-01-01", "validated_at": "2030-01-02T01:00:00Z",
                            "source_manifest_sha256": "a" * 64, "semantic_id": "b" * 64})
                visual.validate_inventory(data)
                path = Path(current) / "apps/web/visual-assets.v1.json"
                path.parent.mkdir(parents=True); path.write_text(json.dumps(data), encoding="utf-8")
                with patch.dict(globals(), ROOT=Path(current)), patch.object(self.temp, "name", work):
                    root, _ = self.checkout()
                result = self.mod.stage_candidate(root, self.candidate, NOW, apply=True)
                self.assertEqual(result["state"], "validated")
                self.assertIn("apps/web/textures/reference/earth-weather-20260912.png", result["changed_paths"])
                self.assertFalse((root / "apps/web/textures/reference/earth-weather-20260912.png").exists())
                self.assertEqual(self.mod.stage_candidate(root, self.candidate, NOW)["state"], "no-op")

    def test_candidate_json_rejects_overflow_nested_duplicates_and_depth_without_echoing_payload(self):
        manifest = self.candidate / "earth-reference.json"
        original = manifest.read_bytes().rstrip()[:-1]
        malformed = [original + b',"ignored":' + value + b'}' for value in
                     (b'NaN', b'Infinity', b'-Infinity', b'1e999',
                      b'{"PRIVATE_SENTINEL":1,"PRIVATE_SENTINEL":2}')]
        malformed += [b'[]', b'null', b'{"ignored":"\xff"}',
                      b'{"ignored":' + b'[' * 20000 + b'0' + b']' * 20000 + b'}']
        for index, raw in enumerate(malformed):
            manifest.write_bytes(raw)
            with self.subTest(index=index):
                with self.assertRaises(ValueError) as caught:
                    self.mod.validate_candidate(self.candidate, NOW)
                self.assertNotIn('PRIVATE_SENTINEL', str(caught.exception))

    def test_rejects_raw_tamper_even_when_derived_is_unchanged(self):
        (self.candidate / "weather-original.png").write_bytes(b"wrong")
        with self.assertRaises(ValueError): self.mod.validate_candidate(self.candidate, NOW)

    def test_rejects_forged_derived_hash_and_coverage(self):
        for kind in ("derived", "coverage"):
            with self.subTest(kind=kind):
                shutil.copytree(self.fixture, self.candidate, dirs_exist_ok=True)
                if kind == "derived":
                    raw = fetch.encode_rgba(2048, 1024, bytes([99, 20, 30, 255]) * (2048 * 1024))
                    (self.candidate / "weather-rgba.png").write_bytes(raw)
                    self.edit(lambda d: d["derived"].update(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw)))
                else: self.edit(lambda d: d["coverage"].update(valid_pixels=1))
                with self.assertRaises(ValueError): self.mod.validate_candidate(self.candidate, NOW)

    def test_rejects_unsafe_paths_urls_grids_clock_and_missing_aqua(self):
        changes = [lambda d: d["original"].update(path="../outside.png"),
                   lambda d: d["original"].update(final_url="https://example.org/evil"),
                   lambda d: d["original"].update(url=d["original"]["url"] + "&TIME=2026-09-26"),
                   lambda d: d["mask"].update(url=d["mask"]["url"].replace("2026-09-27", "2026-09-26")),
                   lambda d: d["grid"].update(north_up=False), lambda d: d.pop("aqua"),
                   lambda d: d.update(retrieved_at="2026-09-29T00:00:00Z")]
        for change in changes:
            shutil.copytree(self.fixture, self.candidate, dirs_exist_ok=True); self.edit(change)
            with self.subTest(change=change), self.assertRaises(ValueError): self.mod.validate_candidate(self.candidate, NOW)
        shutil.copytree(self.fixture, self.candidate, dirs_exist_ok=True)
        for now in (datetime(2026, 9, 27, tzinfo=timezone.utc), datetime(2026, 10, 1, tzinfo=timezone.utc), datetime(2026, 9, 28)):
            with self.subTest(now=now), self.assertRaises(ValueError): self.mod.validate_candidate(self.candidate, now)

    def test_preview_is_read_only_and_stage_preserves_every_other_record(self):
        root, before = self.checkout()
        snapshot = {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()}
        preview = self.mod.stage_candidate(root, self.candidate, NOW)
        self.assertEqual(preview["state"], "validated")
        self.assertEqual(preview["manifest_sha256"], hashlib.sha256((self.candidate / "earth-reference.json").read_bytes()).hexdigest())
        self.assertEqual(snapshot, {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()})
        applied = self.mod.stage_candidate(root, self.candidate, NOW, apply=True)
        self.assertEqual(preview, applied)
        after = json.loads((root / "apps/web/visual-assets.v1.json").read_text(encoding="utf-8"))
        old = next(r for r in before["mapped_references"] if r["role"] == "weather")
        new = next(r for r in after["mapped_references"] if r["role"] == "weather")
        self.assertIsNone(new["reviewed_at"])
        self.assertEqual(new["automated_refresh"]["recipe_id"], "earth-modis-terra-aqua.v1")
        self.assertEqual([r for r in before["mapped_references"] if r != old], [r for r in after["mapped_references"] if r != new])
        self.assertFalse((root / "apps/web" / old["path"]).exists())
        self.assertEqual((root / "apps/web/textures/reference/keep.txt").read_bytes(), b"unrelated")
        self.assertEqual(self.mod.stage_candidate(root, self.candidate, NOW, apply=True)["state"], "no-op")

    def test_retrieval_and_capabilities_changes_do_not_create_refreshes(self):
        root, _ = self.checkout(); self.mod.stage_candidate(root, self.candidate, NOW, apply=True)
        raw = (self.candidate / "capabilities.xml").read_bytes() + b"\n"
        (self.candidate / "capabilities.xml").write_bytes(raw)
        self.edit(lambda d: (d.update(retrieved_at="2026-09-28T11:00:00Z"), d["capabilities"].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())))
        result = self.mod.stage_candidate(root, self.candidate, NOW)
        self.assertEqual(result["state"], "no-op"); self.assertEqual(result["changed_paths"], [])

    def test_inventory_transition_rejects_unrelated_edits(self):
        root, _ = self.checkout()
        base = (root / "apps/web/visual-assets.v1.json").read_bytes()
        self.mod.stage_candidate(root, self.candidate, NOW, apply=True)
        web = root / "apps/web"; candidate = (web / "visual-assets.v1.json").read_bytes()
        png = (web / "textures/reference/earth-weather-daily.png").read_bytes()
        module = (web / "js/visualAssetManifest.js").read_bytes()
        self.mod.validate_inventory_transition(base, candidate, png, module)
        data = json.loads(candidate); data["mapped_references"][0]["label"] = "unexpected edit"
        with self.assertRaises(ValueError): self.mod.validate_inventory_transition(base, json.dumps(data).encode(), png, visual.browser_module(data).encode())

    def test_transition_rejects_relabelled_machine_recipe_provenance(self):
        root, _ = self.checkout()
        base = (root / "apps/web/visual-assets.v1.json").read_bytes()
        self.mod.stage_candidate(root, self.candidate, NOW, apply=True)
        web = root / "apps/web"; original = json.loads((web / "visual-assets.v1.json").read_text(encoding="utf-8"))
        png = (web / "textures/reference/earth-weather-daily.png").read_bytes()
        changes = [lambda r: r["automated_refresh"].update(semantic_id="a" * 64),
                   lambda r: r["automated_refresh"].update(data_date="2026-09-26"),
                   lambda r: r.update(derivation_inputs=r["derivation_inputs"][:1]),
                   lambda r: r.update(label="Unsupported source label"),
                   lambda r: r["derivation_inputs"][1].update(url="https://gibs.earthdata.nasa.gov/not-the-mask")]
        for change in changes:
            data = deepcopy(original); change(self.mod.get_weather(data))
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.mod.validate_inventory_transition(base, json.dumps(data).encode(), png, visual.browser_module(data).encode())

    def test_same_date_changed_unused_aqua_source_is_a_revision(self):
        root, _ = self.checkout(); first = self.mod.stage_candidate(root, self.candidate, NOW, apply=True)
        raw = fetch.encode_rgba(2048, 1024, bytes([99, 20, 30, 255]) * (2048 * 1024))
        (self.candidate / "aqua-weather-original.png").write_bytes(raw)
        self.edit(lambda d: d["aqua"]["original"].update(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw)))
        revised = self.mod.stage_candidate(root, self.candidate, NOW)
        self.assertEqual(revised["state"], "validated")
        self.assertEqual(first["sha256"], revised["sha256"])
        self.assertNotEqual(first["semantic_id"], revised["semantic_id"])
        self.assertEqual(revised["changed_paths"], ["apps/web/js/visualAssetManifest.js", "apps/web/visual-assets.v1.json"])

    def test_accepted_date_cannot_roll_back(self):
        root, _ = self.checkout(); self.mod.stage_candidate(root, self.candidate, NOW, apply=True)
        self.edit(lambda d: (d.update(data_date="2026-09-26"),
            [item.update(url=item["url"].replace("2026-09-27", "2026-09-26"), final_url=item["final_url"].replace("2026-09-27", "2026-09-26"))
             for item in [d["original"], d["mask"], d["aqua"]["original"], d["aqua"]["mask"]]]))
        with self.assertRaisesRegex(ValueError, "rollback"): self.mod.stage_candidate(root, self.candidate, NOW)

    def test_source_date_must_be_available_in_every_layer(self):
        raw = capabilities("2026-09-26", aqua="2026-09-26")
        (self.candidate / "capabilities.xml").write_bytes(raw)
        self.edit(lambda d: d["capabilities"].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
        with self.assertRaises(ValueError): self.mod.validate_candidate(self.candidate, NOW)

    def test_symlinked_evidence_is_rejected(self):
        source = self.candidate / "weather-original.png"
        outside = Path(self.temp.name) / "outside.png"; source.rename(outside)
        try: source.symlink_to(outside)
        except OSError as exc: self.skipTest("symlink creation not permitted: " + str(exc))
        with self.assertRaisesRegex(ValueError, "symlinks"): self.mod.validate_candidate(self.candidate, NOW)
