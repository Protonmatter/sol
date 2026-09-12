from __future__ import annotations

import hashlib
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import data_bundles as bundles


class BundleTests(unittest.TestCase):
    def test_metadata_and_component_failures_have_no_alias_fallback(self):
        selected=self.derived();manifest=json.loads(selected.manifest_raw)
        root=selected.manifest_path.parent
        original={p:p.read_bytes() for p in root.rglob("*.json")}
        pointer=self.root/"derived/current.json"
        cases=[("source",lambda v:v.update(source_bundle_id="wrong")),("time",lambda v:v.update(generated_at_utc="not UTC")),
            ("roles",lambda v:v["components"].pop()),("duplicate",lambda v:v["components"].append(v["components"][0])),
            ("unknown",lambda v:v["components"][0].update(role="unknown")),("path",lambda v:v["components"][0].update(path="../outside.json")),
            ("schema",lambda v:v["components"][0].update(schema_version="wrong"))]
        for name,mutate in cases:
            with self.subTest(name=name):
                value=copy.deepcopy(manifest);mutate(value);raw=bundles.json_bytes(value);selected.manifest_path.write_bytes(raw)
                pointer.write_bytes(bundles.json_bytes({"schema_version":"bundle-pointer.v1","bundle_id":selected.bundle_id,"manifest_path":"bundles/derived-a/manifest.json","manifest_sha256":bundles.digest(raw)}))
                with self.assertRaises(ValueError):bundles.resolve_derived_bundle(pointer)
        for path,raw in original.items():path.write_bytes(raw)
        for role,change in [("feed_status",lambda v:v.update(bundle_id="other")),("feed_status",lambda v:v.update(status="ok")),("feed_status",lambda v:v.update(observation_time_utc="bad")),
                            ("observations",lambda v:v.update(frames=None)),("snapshot",lambda v:v.update(schema_version="wrong")),
                            ("series_manifest",lambda v:v.update(frames=None)),("series_manifest",lambda v:v.update(frames=[{"file":"x.json","months":-0.5,"availability":"unavailable","reason":"test gap"}])),
                            ("series_manifest",lambda v:v.update(frames=[{"file":"x.json","months":0,"availability":"unavailable"}]))]:
            with self.subTest(role=role):
                for path,raw in original.items():path.write_bytes(raw)
                value=copy.deepcopy(manifest);entry=next(e for e in value["components"] if e["role"]==role)
                component=root/entry["path"];data=json.loads(component.read_bytes());change(data);raw=bundles.json_bytes(data);component.write_bytes(raw)
                entry.update(size_bytes=len(raw),sha256=bundles.digest(raw));mraw=bundles.json_bytes(value);selected.manifest_path.write_bytes(mraw)
                pointer.write_bytes(bundles.json_bytes({"schema_version":"bundle-pointer.v1","bundle_id":selected.bundle_id,"manifest_path":"bundles/derived-a/manifest.json","manifest_sha256":bundles.digest(mraw)}))
                with self.assertRaises(ValueError):bundles.resolve_derived_bundle(pointer)

    def test_source_schema_hash_path_and_identity_guards(self):
        selected=self.source();value=json.loads(selected.manifest_raw)
        for mutate in (lambda v:v.update(acquired_at_utc="bad"),lambda v:v["products"][0].update(source=" unknown "),lambda v:v["products"][0].update(sha256="X"*64),lambda v:v["products"].append(v["products"][0]),lambda v:v["products"][0].update(retrieved_at_utc="bad")):
            changed=copy.deepcopy(value);mutate(changed)
            with self.assertRaises(ValueError):bundles.validate_source_manifest(changed)
        with self.assertRaises(ValueError):self.source()
        with self.assertRaises(ValueError):bundles.select_bundle(self.root/"source/current.json",selected,expected=b"stale pointer")
        pointer=self.root/"source/current.json";current=json.loads(pointer.read_bytes());current["manifest_sha256"]="0"*64;pointer.write_bytes(bundles.json_bytes(current))
        with self.assertRaises(ValueError):bundles.resolve_source_bundle(pointer)
        current["bundle_id"]="../wrong";pointer.write_bytes(bundles.json_bytes(current))
        with self.assertRaises(ValueError):bundles.resolve_source_bundle(pointer)
        with mock.patch.object(bundles,"LIMIT",1),self.assertRaises(ValueError):bundles.read_bytes(selected.manifest_path)
        with mock.patch.object(Path,"is_symlink",return_value=True),self.assertRaises(ValueError):bundles.safe_path(self.root,"file.json")
        for path in ("/absolute","a//b","a/../b","a\\b",""):
            with self.assertRaises(ValueError):bundles.safe_path(self.root,path)

    def test_paths_and_timestamps_use_shared_strict_grammar(self):
        for value in ("payloads/a%20b.json", "payloads/a?.json", "payloads/a#.json"):
            with self.subTest(path=value),self.assertRaises(ValueError):bundles.safe_path(Path.cwd(),value)
        for value in ("2026-02-30T00:00:00Z","2026-09-11 00:00:00Z","2026-09-11T00:00Z"):
            with self.subTest(timestamp=value),self.assertRaises(ValueError):bundles.timestamp(value)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sol-bundles-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def source(self, name="source-a"):
        return bundles.create_source_bundle(self.root / "source", bundle_id=name,
            acquired_at_utc="2026-09-11T12:00:00Z", products=[{
                "product_id": "rtsw_mag_1m.json", "source": "fixture NOAA magnetometer",
                "origin": "fixture", "observation_time_utc": None, "retrieved_at_utc": None,
                "quality": ["fixture; unknown observation time"], "failure": None,
                "license": "public source; upstream terms retained", "critical": True,
                "payload": b'[{"source":"fixture","active":true}]'}])

    def components(self):
        snapshot = (ROOT / "apps/web/data/latest-state.json").read_bytes()
        observations = json.loads(snapshot)["observations"][0]
        return {
            "snapshot": ("snapshot.json", "solar-state-snapshot.v3", snapshot),
            "observations": ("observations.json", "observation-frame.v1", bundles.json_bytes(observations)),
            "feed_status": ("feed-status.json", "daily-ingest-status.v2", bundles.json_bytes({
                "schema_version": "daily-ingest-status.v2", "bundle_id": "derived-a", "source_bundle_id": "source-a",
                "status": "degraded", "generated_at_utc": "2026-09-11T12:00:00Z",
                "observation_time_utc": None, "delivery_state": "validated", "warnings": ["fixture"]})),
            "series_manifest": ("series/manifest.json", "series-manifest.v1", bundles.json_bytes({"schema_version":"series-manifest.v1","frames":[]})),
        }

    def derived(self, name="derived-a", source=None, hook=None):
        components = self.components()
        status = json.loads(components["feed_status"][2]); status["bundle_id"] = name
        components["feed_status"] = (*components["feed_status"][:2], bundles.json_bytes(status))
        return bundles.create_derived_bundle(self.root / "derived", bundle_id=name,
            source=source or self.source(), generated_at_utc="2026-09-11T12:00:00Z",
            components=components, stage_hook=hook)

    def test_source_products_share_attribution_and_preserve_bytes_and_selection(self):
        selected = self.source()
        pointer = self.root / "source/current.json"
        before = pointer.read_bytes()
        manifest = json.loads(selected.manifest_raw)
        accepted = ["\ufeff", "\ufeffUNKNOWN", "UNKNOWN\ufeff", "\u001cNOAA\u0085"]
        rejected = ["\u001c", "\u001d", "\u001e", "\u001f", "\u0085", "\u001c UnKnOwN\u001f", "un\u212anown"]
        for source in accepted + rejected:
            with self.subTest(source=source):
                value = copy.deepcopy(manifest)
                value["products"][0]["source"] = source
                raw = bundles.json_bytes(value)
                selected.manifest_path.write_bytes(raw)
                candidate = self.root / "source/candidate.json"
                descriptor = json.loads(before)
                descriptor["manifest_sha256"] = bundles.digest(raw)
                candidate.write_bytes(bundles.json_bytes(descriptor))
                if source in accepted:
                    resolved = bundles.resolve_source_bundle(candidate)
                    self.assertEqual(resolved.manifest_raw, raw)
                    derived = self.derived("attribution-" + str(accepted.index(source)), source=resolved)
                    self.assertEqual(derived.component("source_manifest").raw, raw)
                else:
                    with self.assertRaisesRegex(ValueError, "unattributable"):
                        bundles.resolve_source_bundle(candidate)
                self.assertEqual(selected.manifest_path.read_bytes(), raw)
                self.assertEqual(pointer.read_bytes(), before)
        selected.manifest_path.write_bytes(selected.manifest_raw)
        self.assertEqual(bundles.resolve_source_bundle(pointer).bundle_id, selected.bundle_id)

    def test_resolve_once_survives_pointer_switch_and_rollback(self):
        a = self.derived()
        b = self.derived("derived-b", source=bundles.resolve_source_bundle(self.root / "source/current.json"))
        bundles.select_bundle(self.root / "derived/current.json", a)
        def barrier(role):
            if role == "snapshot": bundles.select_bundle(self.root / "derived/current.json", b)
        pinned = bundles.resolve_derived_bundle(self.root / "derived/current.json", component_hook=barrier)
        self.assertEqual(pinned.bundle_id, "derived-a")
        self.assertEqual(json.loads(pinned.component("feed_status").raw)["bundle_id"], "derived-a")
        bundles.select_bundle(self.root / "derived/current.json", a)
        self.assertEqual(b.bundle_id, "derived-b")
        self.assertEqual(bundles.resolve_derived_bundle(self.root / "derived/current.json").bundle_id, "derived-a")

    def test_fail_at_each_stage_preserves_selected_bundle(self):
        a = self.derived()
        before = (self.root / "derived/current.json").read_bytes()
        for stage in ("staged", "components-written", "manifest-written", "validated", "before-select"):
            with self.subTest(stage=stage):
                def fail(current):
                    if current == stage: raise RuntimeError("injected " + stage)
                with self.assertRaises(RuntimeError): self.derived("failed-" + stage, source=bundles.resolve_source_bundle(self.root / "source/current.json"), hook=fail)
                self.assertEqual((self.root / "derived/current.json").read_bytes(), before)
                self.assertEqual(bundles.resolve_derived_bundle(self.root / "derived/current.json").bundle_id, a.bundle_id)
        self.assertEqual(len(list((self.root / "derived/attempts").glob("*.json"))), 5)

    def test_coherent_hashes_do_not_admit_conflicting_observation_evidence(self):
        selected = self.derived()
        pointer = self.root / "derived/current.json"
        before = pointer.read_bytes()
        source = bundles.resolve_source_bundle(self.root / "source/current.json")
        changes = {
            "frame-source": lambda report: report["frames"][0]["provenance"].update(source="other instrument"),
            "frame-order": lambda report: report["frames"].reverse(),
            "missing-frame": lambda report: report["frames"].pop(),
            "mode": lambda report: report.update(source_mode="cached"),
            "context": lambda report: report["observed_context"].update(activity_index=0.2),
            "typed-raw": lambda report: report["frames"][0]["provenance"]["raw_source_metadata"].update(active=1),
        }
        for name, change in changes.items():
            with self.subTest(name=name):
                components = self.components()
                report = json.loads(components["observations"][2])
                change(report)
                components["observations"] = (*components["observations"][:2], bundles.json_bytes(report))
                status = json.loads(components["feed_status"][2]); status["bundle_id"] = name
                components["feed_status"] = (*components["feed_status"][:2], bundles.json_bytes(status))
                with self.assertRaisesRegex(ValueError, "snapshot.*observations|observation.*context"):
                    bundles.create_derived_bundle(self.root / "derived", bundle_id=name, source=source,
                        generated_at_utc="2026-09-11T12:00:00Z", components=components)
                self.assertEqual(pointer.read_bytes(), before)
                self.assertEqual(bundles.resolve_derived_bundle(pointer).bundle_id, selected.bundle_id)

    def test_rehashed_wrong_longitude_retains_selected_bundle(self):
        selected = self.derived()
        pointer = self.root / "derived/current.json"
        before = pointer.read_bytes()
        components = self.components()
        snapshot = json.loads(components["snapshot"][2])
        position = snapshot["active_regions"][0]["model_position"]
        position["lon_deg"] = (position["lon_deg"] + 30) % 360
        components["snapshot"] = (*components["snapshot"][:2], bundles.json_bytes(snapshot))
        status = json.loads(components["feed_status"][2]); status["bundle_id"] = "wrong-longitude"
        components["feed_status"] = (*components["feed_status"][:2], bundles.json_bytes(status))
        with self.assertRaisesRegex(ValueError, "longitude"):
            bundles.create_derived_bundle(self.root / "derived", bundle_id="wrong-longitude",
                source=bundles.resolve_source_bundle(self.root / "source/current.json"),
                generated_at_utc="2026-09-11T12:00:00Z", components=components)
        self.assertEqual(pointer.read_bytes(), before)
        self.assertEqual(bundles.resolve_derived_bundle(pointer).bundle_id, selected.bundle_id)

    def test_top_level_context_must_match_even_when_embedded_report_agrees(self):
        components = self.components()
        snapshot = json.loads(components["snapshot"][2])
        snapshot["observed_context"]["activity_index"] = 0.2
        components["snapshot"] = (*components["snapshot"][:2], bundles.json_bytes(snapshot))
        with self.assertRaisesRegex(ValueError, "observation.*context"):
            bundles.create_derived_bundle(self.root / "derived", bundle_id="derived-a", source=self.source(),
                generated_at_utc="2026-09-11T12:00:00Z", components=components)
        self.assertFalse((self.root / "derived/current.json").exists())

    def test_equivalent_report_key_order_and_unattributed_frame_projection_are_accepted(self):
        components = self.components()
        report = json.loads(components["observations"][2])
        for invalid in (None, "", "  ", " unknown ", 17, False):
            frame = copy.deepcopy(report["frames"][0])
            frame["provenance"]["source"] = invalid
            report["frames"].append(frame)
        # Object member order is not evidence order; numeric JSON spellings are equivalent.
        report["observed_context"]["synthetic_region_count"] = float(report["observed_context"]["synthetic_region_count"])
        def reorder(value):
            if isinstance(value, dict): return {k: reorder(v) for k, v in reversed(list(value.items()))}
            if isinstance(value, list): return [reorder(v) for v in value]
            return value
        raw = (json.dumps(reorder(report)) + "\n").encode()
        components["observations"] = (*components["observations"][:2], raw)
        result = bundles.create_derived_bundle(self.root / "derived", bundle_id="derived-a", source=self.source(),
            generated_at_utc="2026-09-11T12:00:00Z", components=components)
        self.assertEqual(result.component("observations").raw, raw)

    def test_numeric_evidence_outside_cross_runtime_exact_integer_range_is_rejected(self):
        source = self.source()
        for index, number in enumerate((9007199254740992, 9007199254740993, -9007199254740992)):
            with self.subTest(number=number):
                components = self.components()
                snapshot = json.loads(components["snapshot"][2])
                report = json.loads(components["observations"][2])
                snapshot["observations"][0]["frames"][0]["provenance"]["raw_source_metadata"]["counter"] = number
                report["frames"][0]["provenance"]["raw_source_metadata"]["counter"] = number
                name = f"unsafe-{index}"
                status = json.loads(components["feed_status"][2]); status["bundle_id"] = name
                for role, value in (("snapshot", snapshot), ("observations", report), ("feed_status", status)):
                    components[role] = (*components[role][:2], bundles.json_bytes(value))
                with self.assertRaisesRegex(ValueError, "snapshot.*observations"):
                    bundles.create_derived_bundle(self.root / "derived", bundle_id=name, source=source,
                        generated_at_utc="2026-09-11T12:00:00Z", components=components)
                self.assertFalse((self.root / "derived/current.json").exists())

    def test_locked_pointer_preserves_previous_and_after_select_is_complete(self):
        self.derived()
        before = (self.root / "derived/current.json").read_bytes()
        with mock.patch.object(bundles.os, "replace", side_effect=PermissionError("locked pointer")):
            with self.assertRaises(PermissionError): self.derived("locked", source=bundles.resolve_source_bundle(self.root / "source/current.json"))
        self.assertEqual((self.root / "derived/current.json").read_bytes(), before)
        def interrupt(stage):
            if stage == "after-select": raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt): self.derived("selected", source=bundles.resolve_source_bundle(self.root / "source/current.json"), hook=interrupt)
        self.assertEqual(bundles.resolve_derived_bundle(self.root / "derived/current.json").bundle_id, "selected")

    def test_exact_series_roles_reject_rehashed_aliases_without_replacing_selection(self):
        source = self.source()
        components = self.components()
        entries = [{"file": f"frame-{index}.json", "months": index * 12,
                    **({} if index in (0, 10) else {"availability": "unavailable", "reason": "declared gap"})}
                   for index in range(11)]
        components["series_manifest"] = ("series/manifest.json", "series-manifest.v1",
            bundles.json_bytes({"schema_version": "series-manifest.v1", "frames": entries}))
        for index in (0, 10):
            components[f"series_frame:{index}"] = (f"series/frame-{index}.json", "solar-state-snapshot.v3", components["snapshot"][2])
        accepted = bundles.create_derived_bundle(self.root / "derived", bundle_id="derived-a", source=source,
            generated_at_utc="2026-09-11T12:00:00Z", components=components)
        self.assertEqual(accepted.component("series_frame:10").raw, components["snapshot"][2])
        pointer = self.root / "derived/current.json"
        before = pointer.read_bytes()
        for index, suffix in enumerate(("00", "000", "010", "01", "1", "11", "999")):
            with self.subTest(suffix=suffix):
                bundles.select_bundle(pointer, accepted)
                changed = dict(components)
                changed[f"series_frame:{suffix}"] = (f"series/frame-{suffix}.json", "solar-state-snapshot.v3", components["snapshot"][2])
                name = f"orphan-{index}"
                status = json.loads(changed["feed_status"][2]); status["bundle_id"] = name
                changed["feed_status"] = (*changed["feed_status"][:2], bundles.json_bytes(status))
                with self.assertRaisesRegex(ValueError, "orphan series|unavailable series"):
                    bundles.create_derived_bundle(self.root / "derived", bundle_id=name, source=source,
                        generated_at_utc="2026-09-11T12:00:00Z", components=changed)
                self.assertEqual(pointer.read_bytes(), before)
                self.assertEqual(bundles.resolve_derived_bundle(pointer).bundle_id, accepted.bundle_id)

    def test_hash_corruption_and_traversal_reject_without_fallback(self):
        selected = self.derived()
        selected.component("snapshot").path.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "hash|size"): bundles.resolve_derived_bundle(self.root / "derived/current.json")
        for path in ("../elsewhere.json", "/absolute.json", "C:/absolute.json", "a\\b.json"):
            with self.subTest(path=path), self.assertRaises(ValueError): bundles.safe_path(self.root, path)

    def test_post_replace_sync_and_cleanup_failures_report_committed_selection(self):
        self.derived()
        source=bundles.resolve_source_bundle(self.root/"source/current.json")
        original_sync=bundles._sync_directory
        original_unlink=Path.unlink
        for phase in ("directory-sync","cleanup"):
            name="committed-"+phase
            def sync(path):
                if phase=="directory-sync" and path==self.root/"derived":raise OSError("sync failed")
                return original_sync(path)
            def unlink(path,*args,**kwargs):
                if phase=="cleanup" and path==self.root/"derived/.bundle-select.lock":raise OSError("cleanup failed")
                return original_unlink(path,*args,**kwargs)
            with self.subTest(phase=phase),mock.patch.object(bundles,"_sync_directory",side_effect=sync),mock.patch.object(Path,"unlink",unlink):
                with self.assertRaises(OSError):self.derived(name,source=source)
            self.assertEqual(bundles.resolve_derived_bundle(self.root/"derived/current.json").bundle_id,name)
            attempt=next(json.loads(p.read_bytes()) for p in (self.root/"derived/attempts").glob("*.json") if json.loads(p.read_bytes())["bundle_id"]==name)
            self.assertTrue(attempt["selected"])
            self.assertEqual(attempt["status"],"committed-uncertain")
            self.assertEqual(attempt["phase"],phase)
            self.assertEqual(attempt["committed_bundle_id"],name)
            self.assertEqual(attempt["durability_uncertain"],phase=="directory-sync")

    def test_legacy_inventory_is_read_only_and_does_not_invent_times(self):
        old = self.root / "legacy"; old.mkdir()
        raw = b'{"schema_version":"public-data-cache-manifest.v1","fetched": [{"file":"rtsw_mag_1m.json","source":"NOAA","ok":true}]}'
        (old / "manifest.json").write_bytes(raw)
        (old / "rtsw_mag_1m.json").write_bytes(b'[{"source":"NOAA","active":true}]')
        records = bundles.inventory_legacy_cache(old)
        self.assertEqual((old / "manifest.json").read_bytes(), raw)
        self.assertIsNone(records[0]["observation_time_utc"])
        self.assertIsNone(records[0]["retrieved_at_utc"])
        self.assertEqual(records[0]["origin"], "cached-fallback")
        self.assertEqual(records[0]["payload"], (old / "rtsw_mag_1m.json").read_bytes())


if __name__ == "__main__": unittest.main()
