"""Independent apparent reference identity, time/frame admission and spherical metric."""
from __future__ import annotations

import hashlib
import io
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import horizons_apparent as reference
import validate_apparent as gate

PACK = ROOT / 'tests/fixtures/horizons-apparent-20261104'


class ApparentResponseTests(unittest.TestCase):
    def test_all_targets_have_complete_tt_matrix_and_separate_inertial_diagnostic(self):
        for case in reference.CASES:
            rows = reference.parse_response((PACK / (case[0]+'.txt')).read_text(), case)
            self.assertEqual(list(rows), list(reference.EPOCHS))
            self.assertTrue(all(all(math.isfinite(value) for value in row.values()) for row in rows.values()))
        sun = reference.parse_response((PACK / 'sun.txt').read_text(), reference.CASES[0])
        self.assertNotEqual(sun[reference.EPOCHS[-1]].ra_deg, sun[reference.EPOCHS[-1]].icrf_ra_deg)

    def test_wrong_identity_observer_refraction_units_time_and_calendar_fail(self):
        text = (PACK / 'sun.txt').read_text()
        changes = [('Sun (10)', 'Sun (0)'), ('Earth (399)', 'Earth (3)'),
                   ('{source: DE441}', '{source: OTHER}'), ('GEOCENTRIC', 'BODY CENTER'),
                   ('NO (AIRLESS)', 'YES'), ('RA format       : DEG', 'RA format       : HMS'),
                   ('Calendar mode   : Gregorian', 'Calendar mode   : Mixed'),
                   ('00:00:00.0000 TT', '00:00:00.0000 UT'), ('Date_________JDTT', 'Date_________JDUT'),
                   ('RA_(ICRF-a-app)', 'RA_(B1950-a-app)'), ('0.0, 0.0, -6378.137', '0.0, 0.0, 0.0')]
        for before, after in changes:
            with self.subTest(before=before), self.assertRaises(ValueError):
                reference.parse_response(text.replace(before, after, 1), reference.CASES[0])

    def test_epoch_cardinality_order_and_numeric_corruption_are_rejected(self):
        text = (PACK / 'sun.txt').read_text()
        prefix, rest = text.split('$$SOE'); block, suffix = rest.split('$$EOE')
        rows = block.strip().splitlines()
        mutations = [rows[:-1], rows + [rows[0]], [rows[1], rows[0], *rows[2:]]]
        for value in ['NaN', 'NaN(283.403352227)', '1e309', '360.1', '-0.01', '283.403352227oops']:
            mutations.append([rows[0].replace('283.403352227', value), *rows[1:]])
        mutations.append([rows[0].replace('-23.117997158', '-91.0'), *rows[1:]])
        mutations.append([rows[0] + ',9', *rows[1:]])
        for altered in mutations:
            with self.subTest(first=altered[0]), self.assertRaises(ValueError):
                reference.parse_response(prefix+'$$SOE\n'+'\n'.join(altered)+'\n$$EOE'+suffix, reference.CASES[0])
        with self.assertRaises(ValueError):
            reference.parse_response(prefix+'$$EOE'+block+'$$SOE'+suffix, reference.CASES[0])
        with self.assertRaises(ValueError):
            reference.parse_response(text.replace('TDB-UT,', '"unterminated,', 1), reference.CASES[0])


class ApparentPackTests(unittest.TestCase):
    def test_pack_binds_all_raw_queries_and_both_derived_copies_without_network(self):
        with mock.patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
            pack = reference.load_apparent_pack(PACK)
        self.assertEqual(len(pack.places), 144)
        self.assertEqual(pack.manifest_sha256, '3b9a11e641cdf6471f6833a1c80ff5d15eaffd67e3e61c21f9696a457b0f98c9')
        self.assertEqual((PACK / 'apparent.csv').read_bytes(),
                         (ROOT / 'crates/solar-ephemeris/data/horizons-apparent-20261104.csv').read_bytes())
        with self.assertRaises(TypeError): pack.places[('sun', reference.EPOCHS[0])] = None

    def test_budget_and_acquisition_query_identity_fail_closed_even_if_rehashed(self):
        for field, value in [('sun_planet_arcsec', 11.0), ('moon_arcsec', 13.0), ('metric', 'ra_difference')]:
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
                manifest = json.loads((target/'manifest.json').read_text()); manifest['acceptance'][field] = value
                (target/'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): reference.load_apparent_pack(target)
        changes = [lambda a: a['records'].pop(),
                   lambda a: a['records'][0].__setitem__('request_url', a['records'][0]['request_url'].replace('TT', 'UT')),
                   lambda a: a['records'][0].__setitem__('target', 0),
                   lambda a: a['records'][0].__setitem__('center', 399.0),
                   lambda a: a['records'][0].__setitem__('path', '../outside.txt'),
                   lambda a: a['records'][0].__setitem__('api_version', '1.3')]
        for change in changes:
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
                acquisition = json.loads((target/'acquisition.json').read_text()); change(acquisition)
                raw = json.dumps(acquisition).encode(); (target/'acquisition.json').write_bytes(raw)
                manifest = json.loads((target/'manifest.json').read_text())
                manifest['acquisition'].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
                (target/'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): reference.load_apparent_pack(target)

    def test_raw_changes_rehashed_derived_changes_and_rewritten_plan_do_not_pass(self):
        for name, key in [('sun.txt', None), ('apparent.csv', 'derived_matrix'), ('predeclared-plan.txt', 'predeclared_plan')]:
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
                raw = (target/name).read_bytes()
                raw = raw.replace(b'283.403352227', b'284.403352227') if name != 'predeclared-plan.txt' else raw+b'changed\n'
                self.assertNotEqual(raw, (target/name).read_bytes()); (target/name).write_bytes(raw)
                if key:
                    manifest = json.loads((target/'manifest.json').read_text())
                    manifest[key].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
                    (target/'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): reference.load_apparent_pack(target)


class ApparentGateTests(unittest.TestCase):
    def test_historical_baseline_preserves_every_independent_failure(self):
        raw = (ROOT/'tests/fixtures/geocentric-apparent-baseline-20261104.json').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), '5c45699b9267e4437af170eb94a94a05d7bb098ee7684ce0abccdad93068ce65')
        baseline = json.loads(raw)
        self.assertEqual(baseline['reference_manifest_sha256'], reference.load_apparent_pack(PACK).manifest_sha256)
        self.assertEqual(baseline['matrix_size'], 144)
        self.assertEqual(baseline['metric'], 'great_circle_arcsec')
        self.assertEqual((baseline['sun_planet_arcsec'], baseline['moon_arcsec']), (10, 12))
        self.assertFalse(baseline['passed'])
        pack = reference.load_apparent_pack(PACK); seen = set()
        for row in baseline['records']:
            key = (row['case'], row['jd_tt']); self.assertNotIn(key, seen); seen.add(key)
            place = pack.places[key]
            self.assertEqual((row['reference_ra_deg'], row['reference_dec_deg']), (place.ra_deg, place.dec_deg))
            error = gate.separation_arcsec(row['native_ra_deg'], row['native_dec_deg'], place.ra_deg, place.dec_deg)
            self.assertAlmostEqual(error, row['angular_error_arcsec'], places=8)
            maximum = 12 if row['body'] == 'Moon' else 10
            self.assertEqual(row['maximum_error_arcsec'], maximum)
            self.assertEqual(row['passed'], error <= maximum)
        self.assertEqual(seen, set(pack.places))
        self.assertEqual(sum(not row['passed'] for row in baseline['records']), 27)

    @staticmethod
    def protocol(offsets: dict[str, float] | None = None) -> str:
        # Synthetic projection protocol tests admission/metrics only. Real
        # native output is measured separately; this is not accuracy evidence.
        pack = reference.load_apparent_pack(PACK); rows = []
        for jd in reference.EPOCHS:
            bodies = []
            for case, body, _ in reference.CASES:
                place = pack.places[(case, jd)]
                bodies.append({'name': body, 'coordinate_frame': 'true_equator_and_equinox_of_date',
                    'geocentric_apparent_ra_deg': place.ra_deg,
                    'geocentric_apparent_dec_deg': place.dec_deg + (offsets or {}).get(case, 0) / 3600})
            rows.append(json.dumps({'requested_jd_tt': jd, 'tt_argument_error_seconds': 0,
                'snapshot': {'schema_version': 'ephemeris-snapshot.v3',
                    'time': {'jd_tt': jd, 'jd_utc': jd-69.184/86400},
                    'observer': {'terrestrial_lat_deg': 0, 'terrestrial_lon_deg_east': 0, 'elev_m': 0}, 'bodies': bodies}}))
        return '\n'.join(rows)

    def test_spherical_metric_wrap_poles_opposite_directions_and_hostile_values(self):
        self.assertAlmostEqual(gate.separation_arcsec(359.999, 0, .001, 0), 7.2, places=7)
        self.assertAlmostEqual(gate.separation_arcsec(0, 89.999, 180, 89.999), 7.2, places=7)
        self.assertAlmostEqual(gate.separation_arcsec(0, 0, 180, 0), 648000, places=7)
        for ra, dec in [(math.nan, 0), (math.inf, 0), (True, 0), (0, -91), (360, 0)]:
            with self.assertRaises(ValueError): gate.separation_arcsec(ra, dec, 0, 0)

    def test_actual_metric_rejects_bad_directions_at_unchanged_body_budgets(self):
        for offsets, expected in [({}, True), ({'sun': 11}, False), ({'moon': 11}, True), ({'moon': 13}, False)]:
            with self.subTest(offsets=offsets), mock.patch.object(gate, 'native_output', return_value=self.protocol(offsets)):
                report = gate.validate(PACK)
                self.assertEqual(report['passed'], expected)
                self.assertEqual(report['matrix_size'], 144)

    def test_native_projection_rejects_wrong_epoch_time_frame_missing_duplicate_or_nonfinite(self):
        valid = self.protocol(); lines = valid.splitlines()
        mutations = [lambda row: row.__setitem__('requested_jd_tt', row['requested_jd_tt']+1),
                     lambda row: row.__setitem__('tt_argument_error_seconds', .002),
                     lambda row: row['snapshot']['time'].__setitem__('jd_tt', row['requested_jd_tt']+.01),
                     lambda row: row['snapshot']['observer'].__setitem__('elev_m', 1),
                     lambda row: row['snapshot']['bodies'][0].__setitem__('coordinate_frame', 'ICRF'),
                     lambda row: row['snapshot']['bodies'][0].__setitem__('geocentric_apparent_ra_deg', math.nan),
                     lambda row: row['snapshot']['bodies'][0].__setitem__('geocentric_apparent_dec_deg', True),
                     lambda row: row['snapshot']['bodies'].pop(),
                     lambda row: row['snapshot']['bodies'].append(row['snapshot']['bodies'][0])]
        for mutate in mutations:
            row = json.loads(lines[0]); mutate(row)
            with self.assertRaises(ValueError): gate.parse_native('\n'.join([json.dumps(row), *lines[1:]]))
        for bad in ['\n'.join(lines[:-1]), '\n'.join([lines[1], lines[0], *lines[2:]]),
                    valid.replace('"requested_jd_tt":', '"requested_jd_tt": 1, "requested_jd_tt":', 1)]:
            with self.assertRaises(ValueError): gate.parse_native(bad)

    def test_report_refuses_existing_or_authoritative_path_before_native_work(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'build') as directory:
            path = Path(directory)/'report.json'; path.write_text('preserve')
            for target in [path, ROOT/'apps/web/js/moons.js']:
                with mock.patch.object(gate, 'validate') as validate, mock.patch('sys.stderr', new_callable=io.StringIO):
                    self.assertEqual(gate.main(['--report', str(target)]), 1)
                validate.assert_not_called()
            self.assertEqual(path.read_text(), 'preserve')


if __name__ == '__main__': unittest.main()
