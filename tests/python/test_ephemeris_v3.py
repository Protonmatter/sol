"""Shared v3 schema/semantics and strict JSON cases; fixtures are not accuracy truth."""
import copy
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import validate_ephemeris_snapshot as validator
import validate_ephemeris_snapshot_v2 as historical_validator


CLOCK_BOUNDARY = ROOT / 'tests/fixtures/ephemeris-clock-boundary-20261104.json'


def clock_boundary_v4():
    """The provenance-hashed fixture is an archived v3 document. v4 only adds
    optional fields, so the same content under the live identity tests v4 clocks."""
    snapshot = json.loads(CLOCK_BOUNDARY.read_bytes())
    snapshot['schema_version'] = 'ephemeris-snapshot.v4'
    return snapshot


def parent(data, path):
    keys = path.split(".")
    for key in keys[:-1]:
        data = data[int(key)] if isinstance(data, list) else data[key]
    return data, keys[-1]


class V3Tests(unittest.TestCase):
    def test_archived_v3_validates_only_through_the_historical_v3_mode(self):
        archived = json.loads(CLOCK_BOUNDARY.read_bytes())
        self.assertEqual(archived['schema_version'], 'ephemeris-snapshot.v3')
        self.assertEqual(validator.validate_historical_v3(archived), [])
        self.assertTrue(validator.validate(archived), 'live readers require v4')
        widened = clock_boundary_v4()
        widened['star_frame'] = {'unexpected': True}
        widened['schema_version'] = 'ephemeris-snapshot.v3'
        self.assertTrue(validator.validate_historical_v3(widened), 'the published v3 schema rejects v4 additions')

    def test_clock_residual_adjacent_float_decisions_match_live_js(self):
        snapshot = clock_boundary_v4()
        cases = json.loads((ROOT / 'tests/fixtures/ephemeris-clock-ulp-cases-20261104.json').read_bytes())['cases']
        for case in cases:
            changed = copy.deepcopy(snapshot); changed['time'][case['field']] = case['value']
            with self.subTest(field=case['field'], ulps=case['ulp_shift']):
                self.assertEqual(not validator.validate(changed), case['valid'])
    def test_huge_finite_atomic_offsets_cannot_hide_incoherent_clocks(self):
        snapshot = clock_boundary_v4()
        time = snapshot['time']; time['tai_minus_utc_seconds'] = 1e308
        time['jd_tai'] = time['jd_utc'] + 1e308 / 86400
        time['jd_tt'] = time['jd_tai'] + 32.184 / 86400
        time['delta_t_seconds'] = 1e308
        for _ in range(8): time['delta_t_seconds'] = math.nextafter(time['delta_t_seconds'], math.inf)
        self.assertTrue(all(math.isfinite(time[key]) for key in ('jd_tai', 'jd_tt', 'delta_t_seconds')))
        self.assertTrue(validator.validate(snapshot))
    def test_precise_atomic_delta_t_and_legacy_clock_representation(self):
        snapshot = clock_boundary_v4()
        t = snapshot['time']; expected = t['tai_minus_utc_seconds'] + 32.184 - t['dut1_seconds']
        self.assertGreater(abs(t['delta_t_seconds'] - (t['jd_tt'] - t['jd_ut1']) * 86400), 5e-5)
        self.assertEqual(validator.validate(snapshot), [])
        self.assertTrue(any('delta_t_seconds' in error for error in historical_validator.check_time(t)))
        legacy = copy.deepcopy(snapshot); legacy['time']['delta_t_seconds'] = (t['jd_tt'] - t['jd_ut1']) * 86400
        self.assertEqual(validator.validate(legacy), [])
        allowed = copy.deepcopy(snapshot); allowed['time']['delta_t_seconds'] = expected + .5e-9
        self.assertEqual(validator.validate(allowed), [])
        for offset in (-2e-9, 2e-9, -.001, .001):
            changed = copy.deepcopy(snapshot); changed['time']['delta_t_seconds'] = expected + offset
            self.assertTrue(validator.validate(changed), offset)

    def test_precise_delta_t_cannot_hide_other_clock_changes_or_missing_tai(self):
        snapshot = clock_boundary_v4()
        for field in ('jd_tai', 'jd_tt', 'jd_ut1'):
            changed = copy.deepcopy(snapshot); changed['time'][field] += .001
            self.assertTrue(validator.validate(changed), field)
        changed = copy.deepcopy(snapshot); changed['time']['jd_tai'] = None; changed['time']['tai_minus_utc_seconds'] = None
        changed['time']['input_time_semantics'] = 'historical_ut1_proxy'
        changed['time']['earth_orientation']['quality'] = 'pre_utc_ut1_proxy'; changed['accuracy']['eop_status'] = 'pre_utc_ut1_proxy'
        self.assertTrue(validator.validate(changed))
    def test_future_nominal_clock_rejects_false_precision_and_semantic_relabeling(self):
        future = copy.deepcopy(json.loads((ROOT / 'tests/fixtures/ephemeris-v4-corpus.json').read_bytes())['snapshot'])
        t = future['time']
        t['input_time_semantics'] = 'future_nominal_utc'
        t['delta_t_seconds'] = 442.3803816
        t['dut1_seconds'] = t['tai_minus_utc_seconds'] + 32.184 - t['delta_t_seconds']
        t['jd_ut1'] = t['jd_utc'] + t['dut1_seconds'] / 86400
        t['earth_orientation'].update(quality='modeled_future', source='Endpoint-anchored delta-T model; nominal UTC', dut1_uncertainty_seconds=None)
        future['accuracy']['eop_status'] = 'modeled_future'
        self.assertEqual(validator.validate(future), [])
        for field, value in [('input_time_semantics', 'utc'), ('jd_tai', None)]:
            bad = copy.deepcopy(future); bad['time'][field] = value
            self.assertTrue(validator.validate(bad), field)
        for field, value in [('quality', 'predicted'), ('dut1_uncertainty_seconds', .9)]:
            bad = copy.deepcopy(future); bad['time']['earth_orientation'][field] = value
            self.assertTrue(validator.validate(bad), field)
        bad = copy.deepcopy(future); bad['time']['input_time_semantics'] = 'utc'
        bad['time']['earth_orientation']['quality'] = 'degraded'; bad['accuracy']['eop_status'] = 'degraded'
        self.assertTrue(validator.validate(bad))

    def test_mixed_event_window_discloses_future_model_without_relabeling_instant(self):
        mixed = copy.deepcopy(json.loads((ROOT / 'tests/fixtures/ephemeris-v4-corpus.json').read_bytes())['snapshot'])
        window = mixed['events_window']
        window['future_nominal_utc_after_jd'] = window['start_jd'] + .25
        self.assertEqual(validator.validate(mixed), [])
        self.assertEqual(mixed['time']['input_time_semantics'], 'utc')
        window['future_nominal_utc_after_jd'] = window['end_jd'] + 1 / 144
        self.assertTrue(validator.validate(mixed))

    def test_shared_corpus(self):
        corpus = json.loads((ROOT / "tests/fixtures/ephemeris-v4-corpus.json").read_text())
        for case in corpus["cases"]:
            with self.subTest(case=case["name"]):
                data = copy.deepcopy(corpus["snapshot"])
                for path, value in case["changes"]:
                    node, key = parent(data, path)
                    node[key] = value
                if "remove" in case:
                    node, key = parent(data, case["remove"])
                    del node[key]
                errors = validator.validate(data)
                self.assertEqual(not errors, case["valid"], errors)

    def test_strict_json(self):
        for text in ['{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}', '{"a":1} trailing']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                validator.parse_snapshot(text)


if __name__ == "__main__":
    unittest.main()
