"""Independent raw range identities, quantity binding and offline replay checks."""
from __future__ import annotations
import copy
import csv
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock
import urllib.parse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import validate_ranges as gate
from horizons_ranges import load_range_pack, range_from_response

PACK = ROOT / 'tests/fixtures/horizons-ranges-20261103'
MANIFEST_SHA = '3fb7c133e71f070aa9bef087425ab13450e4b419bcb44d0c4117fad8d8f50285'


class RangeReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.provider = gate.provider_module()
        cls.requests = gate.expected_requests(cls.provider)

    def load(self, directory=PACK):
        return load_range_pack(directory, self.requests)

    def test_accepted_range_matrix_has_pinned_identity_and_immutable_exact_queries(self):
        pack = self.load(); self.assertEqual(pack.manifest_sha256, MANIFEST_SHA)
        self.assertEqual(len(pack.ranges), 72); self.assertEqual(len(pack.responses), 72)
        url = next(iter(self.requests.values()))
        self.assertEqual(pack.fetch(url), (PACK / 'boston-sun-observer.txt').read_text())
        with self.assertRaises(ValueError): pack.fetch(url + '&wrong=1')
        with self.assertRaises(TypeError): pack.ranges[('Boston', 'Sun', 'observer')] = 1.0

    def test_every_derived_range_and_site_is_bound_to_raw_and_crate_copy(self):
        pack = self.load(); raw = (PACK / 'ranges.csv').read_bytes()
        self.assertEqual(raw, (ROOT / 'crates/solar-ephemeris/data/horizons-ranges-20261103.csv').read_bytes())
        rows = list(csv.DictReader(raw.decode().splitlines())); self.assertEqual(len(rows), 36)
        seen = set()
        for row in rows:
            label, body = row['case'], row['body']; self.assertNotIn((label, body), seen); seen.add((label, body))
            case = next(case for case in gate.CASES if case[0] == label)
            _, when, lat, lon, elev = case
            self.assertEqual(float(row['jd_utc']), when.timestamp() / 86400 + 2440587.5)
            for key, value in [('latitude_deg', lat), ('longitude_deg_east', lon), ('elevation_m', elev)]:
                self.assertEqual(float(row[key]), value)
            for kind in ('geocentric', 'observer'):
                self.assertEqual(float(row[kind + '_range_km']), pack.ranges[(label, body, kind)])
                response = pack.fetch(self.requests[(label, body, kind)]).encode()
                self.assertEqual(row[kind + '_raw_sha256'], hashlib.sha256(response).hexdigest())

    def test_provider_replays_all_original_queries_without_network(self):
        pack = self.load()
        def replay(params):
            return pack.fetch(self.provider.HORIZONS + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote))
        with mock.patch.object(self.provider, '_request_text', side_effect=replay):
            for label, when, lat, lon, elev in gate.CASES:
                for body, command in gate.BODIES.items():
                    result = self.provider.fetch_body(when, lat, lon, elev, command)
                    self.assertEqual(result['geocentric_range_km'], pack.ranges[(label, body, 'geocentric')])
                    self.assertEqual(result['observer_range_km'], pack.ranges[(label, body, 'observer')])

    def test_malformed_metadata_or_changed_budgets_fail_closed(self):
        changes = [lambda m: m['records'].pop(), lambda m: m['records'].__setitem__(1, m['records'][0]),
                   lambda m: m['records'][0].__setitem__('kind', 'geocentric'),
                   lambda m: m['records'][0].__setitem__('path', '../outside.txt'),
                   lambda m: m['acceptance'].__setitem__('relative_range', .001),
                   lambda m: m['acceptance'].__setitem__('absolute_floor_km', True)]
        for index, change in enumerate(changes):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as folder:
                target = Path(folder) / 'pack'; shutil.copytree(PACK, target)
                manifest = json.loads((target / 'manifest.json').read_text()); change(manifest)
                (target / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): self.load(target)

    def test_raw_mutation_and_rehashed_origin_or_target_changes_fail(self):
        changes = [(None, None), (b'Sun (10)', b'Sun (301)'),
                   (b'GEOCENTRIC', b'USERDEFINED'), (b'NO (AIRLESS)', b'YES (REFRACTED)')]
        for old, new in changes:
            with self.subTest(old=old), tempfile.TemporaryDirectory() as folder:
                target = Path(folder) / 'pack'; shutil.copytree(PACK, target)
                manifest = json.loads((target / 'manifest.json').read_text())
                record = next(r for r in manifest['records'] if r['case'] == 'Boston' and r['body'] == 'Sun' and r['kind'] == 'geocentric')
                path = target / record['path']; raw = path.read_bytes()
                raw = raw + b'changed' if old is None else raw.replace(old, new, 1)
                path.write_bytes(raw)
                if old is not None:
                    record.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
                    (target / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): self.load(target)

    def test_plain_text_quantity_parser_rejects_fragments_extra_rows_and_overflow(self):
        text = (PACK / 'boston-moon-geocentric.txt').read_text()
        wrong = [text.replace('293.61386', 'NaN(293.61386)'),
                 text.replace('0.00269794566147', '1e308'),
                 text.replace('0.00269794566147', '-0.00269794566147'),
                 text.replace('$$EOE', '2461222.592905093 1 2 3 4\n$$EOE'),
                 text.split('$$SOE')[0] + '$$EOE\n$$SOE\n' + text.split('$$SOE')[1].split('$$EOE')[0].strip() + '\n']
        for payload in wrong:
            with self.subTest(payload=payload[-80:]), self.assertRaises(ValueError):
                range_from_response(payload, 2461222.5929050925, 'geocentric')

    def test_validator_has_no_network_fallback_and_detects_a_finite_range_regression(self):
        pack = self.load()
        def snapshot(_binary, when, lat, lon, elev):
            label = next(case[0] for case in gate.CASES if case[1] == when)
            # Transport/negative-control test only; the native Rust regression
            # separately establishes the actual scientific comparison.
            return {'bodies': [{'name': body, 'geocentric_range_km': pack.ranges[(label, body, 'geocentric')],
                    'observer_range_km': pack.ranges[(label, body, 'observer')]} for body in gate.BODIES]}
        with mock.patch.object(gate, 'engine_snapshot', side_effect=snapshot), \
             mock.patch.object(gate, 'provider_module', return_value=self.provider), \
             mock.patch.object(self.provider, '_request_text', side_effect=AssertionError('unexpected network')) as network:
            report = gate.validate(Path('unused'), PACK)
            self.assertTrue(report['passed']); self.assertEqual(report['matrix_size'], 72)
            network.assert_not_called()
        def regressed(*args):
            result = snapshot(*args); result['bodies'][1]['geocentric_range_km'] += 20.0
            return result
        with mock.patch.object(gate, 'engine_snapshot', side_effect=regressed):
            self.assertFalse(gate.validate(Path('unused'), PACK)['passed'])


if __name__ == '__main__': unittest.main()
