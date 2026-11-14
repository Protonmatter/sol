"""Independent vector identity, strict parsing and offline regression contracts."""
from __future__ import annotations

import csv
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
import horizons_vectors as vectors
import validate_vectors as gate

PACK = ROOT / 'tests/fixtures/horizons-vectors-20261104'


class VectorResponseTests(unittest.TestCase):
    def test_complete_geometric_tdb_matrix_and_documented_mercury_alias(self):
        for case in vectors.CASES:
            text = (PACK / (case[0] + '.txt')).read_text()
            rows = vectors.parse_response(text, case)
            self.assertEqual(list(rows), list(vectors.EPOCHS))
            self.assertTrue(all(len(xyz) == 3 for xyz in rows.values()))

    def test_wrong_target_origin_source_frame_units_correction_and_calendar_fail(self):
        text = (PACK / 'mercury.txt').read_text()
        changes = [('Mercury Barycenter (199)', 'Mercury Barycenter (1)'),
                   ('Sun (10)', 'Sun (0)'), ('{source: DE441}', '{source: OTHER}'),
                   ('AU-D', 'KM-S'), ('GEOMETRIC cartesian states', 'ASTROMETRIC cartesian states'),
                   ('Ecliptic of J2000.0', 'Equatorial of J2000.0'),
                   ('X-axis   : ICRF', 'X-axis   : B1950'), ('Gregorian', 'Mixed'),
                   ('A.D. 0001-Jan-01', 'A.D. 0001-Jan-02')]
        for old, new in changes:
            self.assertIn(old, text)
            with self.subTest(old=old), self.assertRaises(ValueError):
                vectors.parse_response(text.replace(old, new, 1), vectors.CASES[0])

    def test_missing_duplicate_reordered_fragment_and_nonfinite_vector_rows_fail(self):
        text = (PACK / 'mercury.txt').read_text()
        prefix, rest = text.split('$$SOE'); block, suffix = rest.split('$$EOE')
        rows = block.strip().splitlines()
        changed = [rows[1:], rows + [rows[0]], [rows[1], rows[0], *rows[2:]],
                   [rows[0].replace('3.406182928747781E-01', 'NaN(3.406182928747781E-01)'), *rows[1:]],
                   [rows[0].replace('3.406182928747781E-01', '1e309'), *rows[1:]],
                   [rows[0] + ' 9', *rows[1:]]]
        for altered in changed:
            with self.subTest(first=altered[0]), self.assertRaises(ValueError):
                vectors.parse_response(prefix + '$$SOE\n' + '\n'.join(altered) + '\n$$EOE' + suffix, vectors.CASES[0])
        with self.assertRaises(ValueError):
            vectors.parse_response(prefix + '$$EOE\n' + block + '\n$$SOE' + suffix, vectors.CASES[0])
        with self.assertRaises(ValueError):
            vectors.parse_response(text.replace('Calendar Date (TDB),', '"unterminated,', 1), vectors.CASES[0])
        with self.assertRaises(ValueError):
            vectors.parse_response(text.replace('JDTDB,', 'JDTDB,"', 1), vectors.CASES[0])


class VectorPackTests(unittest.TestCase):
    def test_complete_pack_binds_raw_queries_and_both_derived_copies(self):
        pack = vectors.load_vector_pack(PACK)
        self.assertEqual(len(pack.vectors), 160)
        self.assertEqual(pack.manifest_sha256, '263e63ea08502631a56b64adf135b186101ca56a2e19b632ba23d5fe75bb3ac7')
        self.assertEqual((PACK / 'vectors.csv').read_bytes(),
                         (ROOT / 'crates/solar-ephemeris/data/horizons-vectors-20261104.csv').read_bytes())
        with self.assertRaises(TypeError): pack.vectors[('mercury', vectors.EPOCHS[0])] = (1, 2, 3)

    def test_manifest_budget_and_acquisition_identity_fail_closed(self):
        for field, value in [('maximum', 11.0), ('maximum', True), ('metric', 'angular_pointing')]:
            with self.subTest(field=field, value=value), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
                manifest = json.loads((target / 'manifest.json').read_text()); manifest['acceptance'][field] = value
                (target / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): vectors.load_vector_pack(target)
        changes = [lambda a: a['records'].pop(),
                   lambda a: a['records'][0].__setitem__('request_url', a['records'][0]['request_url'].replace('NONE', 'LT')),
                   lambda a: a['records'][0].__setitem__('target', 199),
                   lambda a: a['records'][0].__setitem__('path', '../outside.txt'),
                   lambda a: a['records'][0].__setitem__('api_version', '1.3')]
        for change in changes:
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
                acquisition = json.loads((target / 'acquisition.json').read_text()); change(acquisition)
                raw = json.dumps(acquisition).encode(); (target / 'acquisition.json').write_bytes(raw)
                manifest = json.loads((target / 'manifest.json').read_text())
                manifest['acquisition'].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
                (target / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): vectors.load_vector_pack(target)

    def test_changed_raw_or_rehashed_derived_vector_cannot_pass(self):
        for name in ['mercury.txt', 'vectors.csv']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
                raw = (target / name).read_bytes().replace(b'0.34061829287477807', b'0.44061829287477807')
                if name == 'mercury.txt': raw += b'changed'
                self.assertNotEqual(raw, (target / name).read_bytes())
                (target / name).write_bytes(raw)
                if name == 'vectors.csv':
                    manifest = json.loads((target / 'manifest.json').read_text())
                    manifest['derived_matrix'].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
                    (target / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError): vectors.load_vector_pack(target)


class NativeVectorGateTests(unittest.TestCase):
    def test_retained_historical_baseline_preserves_all_failures_and_full_vector_metric(self):
        raw = (ROOT / 'tests/fixtures/geometric-vector-baseline-20261104.json').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), 'f795db2a59e2ea40e46790e77ff7ede7dbdba09f456e5a163838d2f653cc58a5')
        baseline = json.loads(raw)
        pack = vectors.load_vector_pack(PACK)
        self.assertEqual(baseline['reference_manifest_sha256'], pack.manifest_sha256)
        self.assertEqual(baseline['metric'], 'relative_vector_norm_arcsec')
        self.assertEqual(baseline['maximum_error'], 10.0)
        self.assertEqual(baseline['matrix_size'], 160)
        self.assertFalse(baseline['passed'])
        seen = set()
        for row in baseline['records']:
            key = (row['case'], row['jd_tdb']); self.assertNotIn(key, seen); seen.add(key)
            expected = pack.vectors[key]; self.assertEqual(tuple(row['reference_vector_au']), expected)
            xyz = row['native_vector_au']
            error = math.hypot(*(a-b for a,b in zip(xyz, expected))) / math.hypot(*expected) * vectors.ARCSEC_PER_RADIAN
            self.assertAlmostEqual(error, row['relative_vector_norm_arcsec'], places=8)
            self.assertEqual(row['passed'], error <= 10)
        self.assertEqual(seen, set(pack.vectors))
        self.assertEqual(sum(not row['passed'] for row in baseline['records']), 29)

    @staticmethod
    def protocol(radial_shift_arcsec=0):
        # Admission/metric fixture only; real native runs establish model error.
        pack = vectors.load_vector_pack(PACK)
        lines = ['case,jd_tdb,tt_argument_error_seconds,x_au,y_au,z_au']
        for (case, jd), xyz in pack.vectors.items():
            scale = 1 + radial_shift_arcsec / vectors.ARCSEC_PER_RADIAN if case == 'mercury' else 1
            lines.append(','.join([case, str(jd), '0', *[repr(value * scale) for value in xyz]]))
        return '\n'.join(lines)

    def test_primary_metric_catches_radial_error_even_with_zero_pointing_error(self):
        with mock.patch.object(gate, 'native_output', return_value=self.protocol()):
            report = gate.validate(PACK)
            self.assertTrue(report['passed']); self.assertEqual(report['matrix_size'], 160)
        with mock.patch.object(gate, 'native_output', return_value=self.protocol(20)):
            report = gate.validate(PACK)
            self.assertFalse(report['passed'])
            bad = next(row for row in report['records'] if not row['passed'])
            self.assertGreater(bad['relative_vector_norm_arcsec'], 19.99)
            self.assertLess(bad['angular_error_arcsec'], 1e-6)

    def test_native_output_requires_exact_finite_complete_matrix_and_model_time(self):
        valid = self.protocol(); rows = valid.splitlines()
        bad = ['\n'.join(rows[:-1]), valid + '\n' + rows[1],
               valid.replace('mercury,', 'wrong,', 1), valid.replace(',0,', ',0.002,', 1),
               valid.replace(',0,', ',NaN,', 1), valid.replace('1721425.5', '1721425.6', 1)]
        for text in bad:
            with self.subTest(first=text[:100]), self.assertRaises(ValueError): gate.parse_native(text)

    def test_metric_overflow_refuses_instead_of_serializing_nonfinite_evidence(self):
        rows = self.protocol().splitlines(); fields = rows[1].split(',')
        fields[3:] = ['1e308', '0', '0']; rows[1] = ','.join(fields)
        with mock.patch.object(gate, 'native_output', return_value='\n'.join(rows)), self.assertRaises(ValueError):
            gate.validate(PACK)

    def test_report_refuses_existing_file_or_authoritative_path_before_native_work(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'build') as directory:
            path = Path(directory) / 'report.json'; path.write_text('preserve')
            for target in [path, ROOT / 'apps/web/js/moons.js']:
                with self.subTest(target=target), mock.patch.object(gate, 'validate') as validate, \
                     mock.patch('sys.stderr', new_callable=io.StringIO):
                    self.assertEqual(gate.main(['--report', str(target)]), 1)
                validate.assert_not_called()
            self.assertEqual(path.read_text(), 'preserve')


if __name__ == '__main__': unittest.main()
