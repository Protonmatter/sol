from __future__ import annotations
import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"tools"))
import data_bundles as bundles
import fetch_public_data as fetch
import generate_fixture_snapshot as generate
import run_daily_ingest as daily


class FeedCommandTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="sol-feed-cli-");self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)

    def source(self):
        products=[]
        for name in ("rtsw_mag_1m","rtsw_wind_1m"):
            products.append({"product_id":name+".json","source":"NOAA fixture","origin":"fixture","observation_time_utc":None,"retrieved_at_utc":None,"quality":["fixture"],"failure":None,"license":"fixture","critical":True,"payload":(ROOT/f"tests/swpc_scn26_21/{name}_new.json").read_bytes()})
        return bundles.create_source_bundle(self.root/"source",bundle_id="source",acquired_at_utc="2026-09-11T00:00:00Z",products=products)

    def call_main(self,module,args):
        with mock.patch.object(sys,"argv",[module.__name__,*args]),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):return module.main()

    def test_daily_skip_fetch_degraded_hold_and_migration_options(self):
        self.source();out=self.root/"derived"
        args=["--skip-fetch","--cache",str(self.root/"source"),"--web-data",str(out)]
        with mock.patch.object(fetch,"acquire_bundle",side_effect=AssertionError("must not fetch")):
            self.assertEqual(self.call_main(daily,args),0)
            before=(out/"current.json").read_bytes()
            self.assertEqual(self.call_main(daily,[*args,"--fail-on-degraded"]),1)
            self.assertEqual((out/"current.json").read_bytes(),before)
        self.assertEqual(self.call_main(daily,["--migrate-v1","--web-data",str(out)]),1)
        self.assertEqual(self.call_main(daily,["--skip-fetch","--cache",str(self.root/"missing"),"--web-data",str(out)]),1)
        with mock.patch.object(bundles,"inventory_legacy_cache",return_value=[]):
            self.assertEqual(self.call_main(daily,[*args,"--migrate-v1"]),1)

    def test_daily_mocked_acquisition_and_generator_entrypoint(self):
        source=self.source()
        with mock.patch.object(fetch,"acquire_bundle",return_value=source):
            self.assertEqual(self.call_main(daily,["--cache",str(self.root/"source"),"--web-data",str(self.root/"out"),"--date","2026-09-11"]),0)
        output=self.root/"snapshot.json";obs=self.root/"observations.json"
        args=["--source-pointer",str(self.root/"source/current.json"),"--evaluated-at-utc","2026-09-11T00:00:00Z","--out",str(output),"--observations-out",str(obs)]
        self.assertEqual(self.call_main(generate,args),0)
        self.assertEqual(json.loads(output.read_bytes())["schema_version"],"solar-state-snapshot.v3")
        self.assertEqual(self.call_main(generate,["--out",str(output),"--observations-out",str(obs)]),0)
        with self.assertRaises(SystemExit):self.call_main(generate,["--source-pointer",str(self.root/"source/current.json")])

    def test_fetch_entrypoint_and_transport_success_failure_size(self):
        source=self.source();out=self.root/"export.json"
        with mock.patch.object(fetch,"acquire_bundle",return_value=source):
            self.assertEqual(self.call_main(fetch,["--cache",str(self.root/"newcache"),"--date","2026-09-11","--manifest-out",str(out)]),0)
        self.assertEqual(json.loads(out.read_bytes())["bundle_id"],"source")
        self.assertEqual(fetch.parse_date("2026-09-11"),date(2026,9,11))
        endpoints=fetch.build_endpoints(include_jpl=True,start_date=date(2026,9,11));self.assertGreater(len(endpoints),5)
        self.assertTrue(all(e.url.startswith("https://") for e in endpoints))
        self.assertIn("COMMAND",fetch.horizons_url(date(2026,9,11)))
        response=mock.MagicMock();response.__enter__.return_value.read.return_value=b"[]"
        with mock.patch.object(fetch.urllib.request,"urlopen",return_value=response):self.assertEqual(fetch.fetch("https://example.invalid/",timeout_seconds=1),b"[]")
        with mock.patch.object(fetch.urllib.request,"urlopen",side_effect=OSError("offline")),mock.patch.object(fetch.time,"sleep"):
            with self.assertRaises(Exception):fetch.fetch("https://example.invalid/",timeout_seconds=1,attempts=2)
        response.__enter__.return_value.read.return_value=b"x"*(bundles.LIMIT+1)
        with mock.patch.object(fetch.urllib.request,"urlopen",return_value=response),mock.patch.object(fetch.time,"sleep"):
            with self.assertRaises(Exception):fetch.fetch("https://example.invalid/",timeout_seconds=1,attempts=1)
        for raw in (b"{}",b"[]",b"null",b"not JSON",b"[NaN]"):
            with self.subTest(raw=raw),self.assertRaises(ValueError):fetch.validate_payload("x.json",raw)
        self.assertEqual(fetch.display_path(ROOT/"tools/x.json"),"tools/x.json")
        self.assertEqual(fetch.display_path(self.root/"x.json"),"x.json")

    def test_critical_fetch_failure_keeps_old_pointer_and_records_failure(self):
        source=self.source();before=(self.root/"source/current.json").read_bytes()
        endpoint=fetch.Endpoint("new-required.json","https://example.invalid/","NOAA","daily","observed",True,"fixture")
        with mock.patch.object(fetch,"build_endpoints",return_value=[endpoint]),mock.patch.object(fetch,"fetch",side_effect=OSError("offline")):
            with self.assertRaises(ValueError):fetch.acquire_bundle(self.root/"source",bundle_id="failed",stamp=date(2026,9,11),acquired_at_utc="2026-09-11T00:00:00Z")
        self.assertEqual((self.root/"source/current.json").read_bytes(),before)
        self.assertTrue(list((self.root/"source/attempts").glob("*.json")))

    def test_cached_generator_context_and_legacy_shape_helpers(self):
        source=self.source();cache=self.root/"legacy";cache.mkdir()
        for component in source.components:(cache/component.role).write_bytes(component.raw)
        row={"source":"synthetic test fixture","time_tag":"2026-09-11T00:00:00Z","flux":140,"estimated_kp":3,"bz_gsm":-2,"speed":400}
        for descriptor in generate.OPTIONAL_CACHE_SOURCES:(cache/descriptor["cache_name"]).write_text(json.dumps([row]))
        report=generate.build_observation_report(cache)
        self.assertEqual(report["source_mode"],"cached")
        self.assertGreater(report["observed_context"]["activity_index"],0)
        snapshot=generate.build_snapshot(42,12,6,report)
        self.assertIn("cached",snapshot["source_mode"])
        self.assertIn("cached",generate.insight_from_context(report["observed_context"]))
        self.assertEqual(generate.first_row({"rows":[row]}),row)
        self.assertEqual(generate.first_row(row),row)
        self.assertEqual(generate.first_row([]),{})
        self.assertEqual(generate.rows({"rows":[row,1]}),[row]);self.assertEqual(generate.rows(1),[])
        self.assertEqual(generate.rows({"none":None}),[])
        self.assertEqual(generate.latest_numeric([{"time_tag":"2026-09-10","bad":None},{"time_tag":"2026-09-11","bad":"x","good":"4"}],"bad","good"),4)
        self.assertEqual(generate.latest_numeric([{"value":""},{"value":"2"}],"value"),2)
        self.assertEqual(generate.latest_numeric([{"value":"2"},{"time_tag":"not-a-time","value":"9"}],"value"),2)
        self.assertIsNone(generate.latest_numeric([{"time_tag":"not-a-time","value":"9"}],"value"))
        for invalid_time in ("", " ", True, 7, [], {}):
            with self.subTest(invalid_time=invalid_time):
                self.assertEqual(generate.latest_numeric([{"value":"2"},{"time_tag":invalid_time,"value":"9"}],"value"),2)
        self.assertEqual(generate.latest_numeric([{"value":"1"},{"time_tag":None,"value":"2"}],"value"),2)
        self.assertIsNone(generate.numeric("bad"));self.assertIsNone(generate.numeric(""));self.assertIsNone(generate.numeric(None))
        self.assertIsNone(generate.numeric(False));self.assertIsNone(generate.numeric(True))
        for nonfinite in ("NaN", "Infinity", "-Infinity", float("nan"), float("inf"), float("-inf")):
            with self.subTest(nonfinite=nonfinite):
                self.assertIsNone(generate.numeric(nonfinite))
        self.assertEqual(generate.latest_numeric([
            {"time_tag":"2026-09-10T00:00:00Z","value":"150"},
            {"time_tag":"2026-09-11T00:00:00Z","value":"Infinity"},
        ],"value"),150)
        self.assertEqual(generate.clamp_float(None,1,2),1);self.assertEqual(generate.format_optional(None,1),"n/a")
        self.assertIsNone(generate.parse_time_tag("bad"));self.assertIsNone(generate.parse_time_tag(None))
        self.assertIsNotNone(generate.parse_time_tag("2026-09-11T00:00:00"))
        self.assertEqual(generate.row_time({"time":" 2026-09-11 "}),"2026-09-11")
        candidate={"id":"swpc-f107-cm-flux","source_mode":"cached","data":[row],"evaluated_at_utc":"2026-09-14T00:00:00Z"}
        freshness,stale=generate.evaluate_freshness([candidate]);self.assertTrue(stale);self.assertTrue(freshness[candidate["id"]]["stale"])
        candidate["data"]=[{"time_tag":"bad"}];self.assertEqual(generate.evaluate_freshness([candidate]),({},[]))
        cycle={"id":"swpc-observed-cycle-indices","source_mode":"fixture","data":[{"f10.7":140}]}
        self.assertEqual(generate.build_observed_context([cycle])["space_weather_signals"]["latest_f107"],140)

    def test_latest_numeric_orders_utc_equivalents_and_fractional_instants(self):
        rows = [
            {"time_tag": "2026-09-11T00:00:00Z", "value": "1"},
            {"time_tag": "2026-09-11T00:00:00.500000+00:00", "value": "2"},
        ]
        self.assertEqual(generate.latest_numeric(rows, "value"), 2.0)
        self.assertEqual(generate.latest_numeric([{"value": "1"}, {"value": "2"}], "value"), 2.0)

    def test_time_parser_matches_native_explicit_utc_and_legacy_grammar(self):
        valid = (
            "2026-09-11", "2026-09-11Z",
            "2026-09-11T00:00:00", "2026-09-11 00:00:00",
            "2026-09-11T00:00:00Z", "2026-09-11 00:00:00Z",
            "2026-09-11T00:00:00+00:00",
            "2026-09-11T00:00:00.1Z", "2026-09-11T00:00:00.123456789+00:00",
        )
        for value in valid:
            with self.subTest(valid=value):
                self.assertIsNotNone(generate.parse_time_tag(value))
        invalid = (
            "2026-09-11T00:00:00+02:00", "2026-09-11T00:00:00-05:00",
            "2026-09-11T00:00:00-00:00", "2026-09-11T00:00:00.1-00:00",
            "20260911", "20260911T000000Z", "2026-09-11T000000Z",
            "2026-09-11+00:00", "2026-09-11 00:00:00+00:00",
            "2026-09-11T00:00:00.1", "2026-09-11 00:00:00.1Z",
        )
        for value in invalid:
            with self.subTest(invalid=value):
                self.assertIsNone(generate.parse_time_tag(value))

    def test_equal_parsed_instants_select_last_payload_position(self):
        rows = [
            {"time_tag": "2026-09-11T00:00:00Z", "value": 150},
            {"time_tag": "2026-09-11T00:00:00+00:00", "value": 235},
        ]
        value, row = generate.latest_numeric_observation(rows, "value")
        self.assertEqual(value, 235.0)
        self.assertIs(row, rows[-1])

if __name__=="__main__":unittest.main()
