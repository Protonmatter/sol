from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from datetime import date

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"tools"))
import data_bundles as bundles
import fetch_public_data as acquisition
import generate_fixture_snapshot as generator
import run_daily_ingest as daily


class FeedTransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="sol-feed-");self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)

    def test_fetch_fallback_preserves_original_time_and_payload(self):
        endpoint=acquisition.Endpoint("rtsw_mag_1m.json","https://example.invalid/fixture","NOAA fixture","daily","observed",True,"fixture")
        with mock.patch.object(acquisition,"build_endpoints",return_value=[endpoint]), mock.patch.object(acquisition,"fetch",return_value=b'[{"time_tag":"2026-09-10T01:00:00Z","source":"NOAA","active":true}]'):
            first=acquisition.acquire_bundle(self.root,bundle_id="first",stamp=date(2026,9,11),acquired_at_utc="2026-09-11T00:00:00Z")
        with mock.patch.object(acquisition,"build_endpoints",return_value=[endpoint]), mock.patch.object(acquisition,"fetch",side_effect=OSError("offline")):
            second=acquisition.acquire_bundle(self.root,bundle_id="second",stamp=date(2026,9,12),acquired_at_utc="2026-09-12T00:00:00Z")
        a=json.loads(first.manifest_raw)["products"][0];b=json.loads(second.manifest_raw)["products"][0]
        self.assertEqual(a["sha256"],b["sha256"])
        self.assertEqual(b["retrieved_at_utc"],"2026-09-11T00:00:00Z")
        self.assertEqual(b["observation_time_utc"],"2026-09-10T01:00:00Z")
        self.assertEqual(b["origin"],"cached-fallback")
        self.assertIsNotNone(b["failure"])

    def test_optional_fetch_failure_is_retained_even_without_fallback_payload(self):
        endpoints=[acquisition.Endpoint(name,"https://example.invalid/fixture","fixture","daily","observed",critical,"fixture")
                   for name,critical in [("required.json",True),("optional.json",False)]]
        with mock.patch.object(acquisition,"build_endpoints",return_value=endpoints),mock.patch.object(acquisition,"fetch",side_effect=[b'[{"source":"fixture"}]',OSError("offline")]):
            selected=acquisition.acquire_bundle(self.root,bundle_id="optional-failed",stamp=date(2026,9,11),acquired_at_utc="2026-09-11T00:00:00Z")
        self.assertEqual(json.loads(selected.manifest_raw)["failures"],[{"product_id":"optional.json","critical":False,"error_type":"OSError"}])

    def fixture_source(self):
        products=[]
        for name in ("rtsw_mag_1m","rtsw_wind_1m"):
            products.append({"product_id":name+".json","source":"NOAA fixture","origin":"fixture",
                "observation_time_utc":None,"retrieved_at_utc":None,"quality":["fixture"],"failure":None,
                "license":"public source fixture","critical":True,"payload":(ROOT/f"tests/swpc_scn26_21/{name}_new.json").read_bytes()})
        return bundles.create_source_bundle(self.root/"source",bundle_id="source",acquired_at_utc="2026-09-11T00:00:00Z",products=products)

    def test_failed_refresh_keeps_fixture_origin_through_derivation(self):
        first=self.fixture_source()
        endpoints=[acquisition.Endpoint(c.role,"https://example.invalid/fixture","NOAA fixture","daily","observed",True,"fixture") for c in first.components]
        with mock.patch.object(acquisition,"build_endpoints",return_value=endpoints),mock.patch.object(acquisition,"fetch",side_effect=OSError("offline")):
            second=acquisition.acquire_bundle(self.root/"source",bundle_id="retry",stamp=date(2026,9,12),acquired_at_utc="2026-09-12T00:00:00Z")
        for old,new in zip(json.loads(first.manifest_raw)["products"],json.loads(second.manifest_raw)["products"]):
            self.assertEqual(new["origin"],"fixture")
            for key in ("sha256","observation_time_utc","retrieved_at_utc"):
                self.assertEqual(new[key],old[key])
            self.assertEqual(new["failure"],"OSError")
        self.assertEqual(generator.build_bundle_observation_report(second,evaluated_at_utc="2026-09-12T00:00:00Z")["source_mode"],"fixture")
        derived=daily.derive_bundle(second,self.root/"derived",bundle_id="derived",generated_at_utc="2026-09-12T00:00:00Z",seed=42)
        self.assertEqual(json.loads(derived.component("feed_status").raw)["status"],"degraded")
        self.assertEqual(json.loads(derived.component("snapshot").raw)["source_mode"],"synthetic+fixture-observed-context")

    def test_derivation_uses_captured_source_and_one_selected_output(self):
        source=self.fixture_source()
        for component in source.components: component.path.write_bytes(b"changed after capture")
        selected=daily.derive_bundle(source,self.root/"derived",bundle_id="derived",generated_at_utc="2026-09-11T12:00:00Z",seed=42)
        self.assertEqual(selected.source_bundle_id,"source")
        self.assertEqual(bundles.resolve_derived_bundle(self.root/"derived/current.json").bundle_id,"derived")
        self.assertFalse((self.root/"derived/latest-state.json").exists())
        self.assertIsNone(json.loads(selected.component("feed_status").raw)["observation_time_utc"])

    def test_daily_cli_reports_post_replace_uncertainty_without_retention_claim(self):
        self.fixture_source()
        output=self.root/"derived"
        original_sync=bundles._sync_directory
        def sync(path):
            if path==output:raise OSError("directory sync unavailable")
            return original_sync(path)
        argv=["run_daily_ingest","--skip-fetch","--cache",str(self.root/"source"),"--web-data",str(output)]
        with mock.patch.object(sys,"argv",argv),mock.patch.object(bundles,"_sync_directory",side_effect=sync),self.assertLogs(daily.LOGGER,level="ERROR") as logs:
            self.assertEqual(daily.main(),1)
        selected=bundles.resolve_derived_bundle(output/"current.json")
        attempts=[json.loads(p.read_bytes()) for p in (output/"attempts").glob("*.json")]
        self.assertEqual(len(attempts),3)
        for attempt in attempts:
            self.assertEqual(attempt["status"],"committed-uncertain")
            self.assertTrue(attempt["selected"])
            self.assertTrue(attempt["durability_uncertain"])
            self.assertEqual(attempt["committed_bundle_id"],selected.bundle_id)
            self.assertEqual(attempt["current_selection"],"not-reobserved")
        self.assertIn("no rollback attempted"," ".join(logs.output))
        self.assertNotIn("last selected bundle retained"," ".join(logs.output))

    def test_generator_and_validation_failures_do_not_replace_pointer(self):
        source=self.fixture_source()
        daily.derive_bundle(source,self.root/"derived",bundle_id="valid",generated_at_utc="2026-09-11T12:00:00Z",seed=42)
        before=(self.root/"derived/current.json").read_bytes()
        for replacement in (RuntimeError("generator failed"), {"invalid":True}):
            with self.subTest(replacement=replacement):
                options={"side_effect":replacement} if isinstance(replacement,Exception) else {"return_value":replacement}
                with mock.patch.object(generator,"build_snapshot",**options),self.assertRaises((RuntimeError,ValueError)):
                    daily.derive_bundle(source,self.root/"derived",bundle_id="invalid-"+str(len(str(replacement))),generated_at_utc="2026-09-11T12:00:00Z",seed=42)
                self.assertEqual((self.root/"derived/current.json").read_bytes(),before)

if __name__=="__main__":unittest.main()
