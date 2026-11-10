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


def parent(data, path):
    keys = path.split(".")
    for key in keys[:-1]:
        data = data[int(key)] if isinstance(data, list) else data[key]
    return data, keys[-1]


class V3Tests(unittest.TestCase):
    def test_clock_residual_adjacent_float_decisions_match_live_js(self):
        snapshot = json.loads((ROOT / 'tests/fixtures/ephemeris-clock-boundary-20261104.json').read_bytes())
        cases = json.loads((ROOT / 'tests/fixtures/ephemeris-clock-ulp-cases-20261104.json').read_bytes())['cases']
        for case in cases:
            changed = copy.deepcopy(snapshot); changed['time'][case['field']] = case['value']
            with self.subTest(field=case['field'], ulps=case['ulp_shift']):
                self.assertEqual(not validator.validate(changed), case['valid'])
    def test_huge_finite_atomic_offsets_cannot_hide_incoherent_clocks(self):
        snapshot = json.loads((ROOT / 'tests/fixtures/ephemeris-clock-boundary-20261104.json').read_bytes())
        time = snapshot['time']; time['tai_minus_utc_seconds'] = 1e308
        time['jd_tai'] = time['jd_utc'] + 1e308 / 86400
        time['jd_tt'] = time['jd_tai'] + 32.184 / 86400
        time['delta_t_seconds'] = 1e308
        for _ in range(8): time['delta_t_seconds'] = math.nextafter(time['delta_t_seconds'], math.inf)
        self.assertTrue(all(math.isfinite(time[key]) for key in ('jd_tai', 'jd_tt', 'delta_t_seconds')))
        self.assertTrue(validator.validate(snapshot))
    def test_precise_atomic_delta_t_and_legacy_clock_representation(self):
        snapshot = json.loads((ROOT / 'tests/fixtures/ephemeris-clock-boundary-20261104.json').read_bytes())
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
        snapshot = json.loads((ROOT / 'tests/fixtures/ephemeris-clock-boundary-20261104.json').read_bytes())
        for field in ('jd_tai', 'jd_tt', 'jd_ut1'):
            changed = copy.deepcopy(snapshot); changed['time'][field] += .001
            self.assertTrue(validator.validate(changed), field)
        changed = copy.deepcopy(snapshot); changed['time']['jd_tai'] = None; changed['time']['tai_minus_utc_seconds'] = None
        changed['time']['input_time_semantics'] = 'historical_ut1_proxy'
        changed['time']['earth_orientation']['quality'] = 'pre_utc_ut1_proxy'; changed['accuracy']['eop_status'] = 'pre_utc_ut1_proxy'
        self.assertTrue(validator.validate(changed))
    def test_shared_corpus(self):
        corpus = json.loads((ROOT / "tests/fixtures/ephemeris-v3-corpus.json").read_text())
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
