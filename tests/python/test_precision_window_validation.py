"""Metric edge cases and fail-closed source/output admission for the offline gate."""
from __future__ import annotations

import csv
import io
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import precision_window_reference as reference
import validate_precision_window as gate


def native_rows():
    return [['V', case[0], '2451545.0', '0', '1', '0', '0'] for case in reference.VECTOR_CASES] + [
        ['A', case[0], '2451545.0', '0', '0', '0', '14959.78707'] for case in reference.APPARENT_CASES]


def native_text(rows):
    stream = io.StringIO(); writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(gate.HEADER); writer.writerows(rows)
    return stream.getvalue()


def small_pack():
    vectors = {(case[0], 2451545.0): (1., 0., 0.) for case in reference.VECTOR_CASES}
    apparent = {(case[0], 2451545.0): reference.ApparentReference(0., 0., .0001, 0., 64., 0., 0.) for case in reference.APPARENT_CASES}
    keys = [('vectors', *key) for key in vectors] + [('apparent', *key) for key in apparent]
    epoch = reference.ReferenceEpoch(2451545., '2451545.000000000', 2451545., '2451545.000000000', .0001)
    return reference.PrecisionReferencePack(vectors, apparent, dict.fromkeys(keys, 'a' * 64), dict.fromkeys(keys, epoch), 'b' * 64)


class NativeMatrixTests(unittest.TestCase):
    @mock.patch.object(reference, 'EPOCHS', (2451545.0,))
    def test_complete_matrix_accepts_the_clock_budget_boundary(self):
        rows = native_rows(); rows[0][3] = '.001'
        actual = gate.parse_native(native_text(rows))
        self.assertEqual(len(actual), 19)
        self.assertEqual(actual['V', 'mercury', 2451545.][3], .001)

    @mock.patch.object(reference, 'EPOCHS', (2451545.0,))
    def test_missing_duplicate_nonfinite_wrong_epoch_clock_or_domain_fail(self):
        original = native_rows()
        variants = [original[1:], original + [original[0]], [original[1], *original[1:]]]
        for row_index, column, token in ((0, 2, '2451546'), (0, 3, '.001001'), (0, 4, 'NaN'),
                (0, 4, '1e309'), (0, 4, '0'), (10, 4, '360'), (10, 5, '-90.01'), (10, 6, '-1'), (0, 4, '1 extra')):
            rows = [row.copy() for row in original]; rows[row_index][column] = token; variants.append(rows)
        for rows in variants:
            with self.subTest(first=rows[0]), self.assertRaises(ValueError): gate.parse_native(native_text(rows))
        with self.assertRaises(ValueError): gate.parse_native(native_text(original).replace('jd_model', 'jd_utc'))

    @mock.patch.object(reference, 'EPOCHS', (2451545.0,))
    def test_full_vector_metric_detects_pure_radial_error(self):
        actual = gate.parse_native(native_text(native_rows())); actual['V', 'mercury', 2451545.] = (1.0001, 0., 0., 0.)
        rows = list(gate.comparisons(small_pack(), actual))
        vector = next(r for r in rows if r['case'] == 'mercury' and r['kind'] == 'V')
        self.assertFalse(vector['passed'])
        self.assertAlmostEqual(vector['measured'], 20.6264806247, places=8)
        self.assertEqual(vector['maximum'], 10.)
        self.assertEqual(len(rows), 28)

    @mock.patch.object(reference, 'EPOCHS', (2451545.0,))
    def test_distinct_pointing_budgets_and_range_floor_are_not_loosened(self):
        actual = gate.parse_native(native_text(native_rows()))
        actual['A', 'sun', 2451545.] = (11 / 3600, 0., 14959.78707, 0.)
        actual['A', 'moon', 2451545.] = (11 / 3600, 0., 14961.78707, 0.)
        rows = list(gate.comparisons(small_pack(), actual))
        selected = {(r['case'], r['metric']): r for r in rows if r['kind'] == 'A'}
        self.assertFalse(selected['sun', 'great_circle_arcsec']['passed'])
        self.assertTrue(selected['moon', 'great_circle_arcsec']['passed'])
        self.assertFalse(selected['moon', 'absolute_range_km']['passed'])
        self.assertEqual(selected['moon', 'absolute_range_km']['maximum'], 1.)
        self.assertAlmostEqual(selected['moon', 'absolute_range_km']['measured'], 2., places=8)

    @mock.patch.object(reference, 'EPOCHS', (2451545.0,))
    def test_ra_wrap_uses_great_circle_distance_and_far_range_uses_10ppm(self):
        pack = small_pack(); actual = gate.parse_native(native_text(native_rows()))
        pack.apparent['sun', 2451545.] = reference.ApparentReference(.00001, 0., 1., 0., 64., 0., 0.)
        actual['A', 'sun', 2451545.] = (359.99999, 0., 149597870.7 + 1500., 0.)
        rows = [r for r in gate.comparisons(pack, actual) if r['case'] == 'sun']
        angle, distance = rows
        self.assertAlmostEqual(angle['measured'], .072, places=6)
        self.assertTrue(angle['passed'])
        self.assertFalse(distance['passed'])
        self.assertAlmostEqual(distance['maximum'], 1495.978707)
        with self.assertRaises(ValueError): list(gate.comparisons(pack, {}))

    @mock.patch.object(reference, 'EPOCHS', (2451545.0,))
    def test_largest_range_residual_and_worst_budget_fraction_are_distinct(self):
        pack = small_pack(); actual = gate.parse_native(native_text(native_rows()))
        actual['A', 'mercury', 2451545.] = (0., 0., 14959.78707 + .5, 0.)
        second = ('mercury', 2451546.)
        pack.apparent[second] = reference.ApparentReference(0., 0., 2., 0., 64., 0., 0.)
        pack.reference_epochs['apparent', *second] = reference.ReferenceEpoch(2451546., '2451546.000000000', 2451546., '2451546.000000000', .0001)
        pack.raw_hashes['apparent', *second] = 'c' * 64
        actual['A', *second] = (0., 0., 2 * 149597870.7 + 100., 0.)
        maxima = {}; fractions = {}
        for row in gate.comparisons(pack, actual): gate.record_extrema(row, maxima, fractions)
        key = 'absolute_range_km:mercury'
        self.assertEqual(maxima[key]['jd_model'], 2451546.)
        self.assertEqual(maxima[key]['measured'], 100.)
        self.assertEqual(fractions[key]['jd_model'], 2451545.)
        self.assertAlmostEqual(fractions[key]['budget_fraction'], .5)


class OutputAdmissionTests(unittest.TestCase):
    def test_existing_and_non_build_destinations_are_refused(self):
        for path in (ROOT / 'apps/web', ROOT / 'build', ROOT / 'new-output', ROOT / '../outside-output'):
            with self.subTest(path=path), self.assertRaises(ValueError): gate.output_directory(path)
        with tempfile.TemporaryDirectory(dir=ROOT / 'build') as directory:
            with self.assertRaises(ValueError): gate.output_directory(Path(directory))

    @mock.patch.object(reference, 'EPOCHS', (2451545.0,))
    def test_source_drift_retains_incomplete_output_without_success_marker(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'build') as directory:
            out = Path(directory) / 'new-run'
            def fake_observe(path, before):
                path.mkdir(); (path / 'native.csv').write_text(native_text(native_rows()), encoding='utf-8')
                return {'native_csv_sha256': gate.sha(path / 'native.csv')}
            with mock.patch.object(reference, 'load_precision_pack', return_value=small_pack()), \
                 mock.patch.object(gate, 'source_hashes', side_effect=[{'source': 'before'}, {'source': 'after'}]), \
                 mock.patch.object(gate, 'validation_hashes', return_value={'validator': 'stable'}), \
                 mock.patch.object(gate, 'observe', side_effect=fake_observe), self.assertRaisesRegex(ValueError, 'changed'):
                gate.validate(PACK_PLACEHOLDER, out)
            self.assertTrue((out / 'all-comparisons.csv').is_file())
            self.assertFalse((out / 'summary.json').exists())


class PrecisionCliTests(unittest.TestCase):
    def test_recorded_numerical_failure_propagates_to_process_exit_status(self):
        for passed in (False, True):
            report = {'passed': passed, 'checks': 28, 'epochs': 1, 'failure_count': 0 if passed else 1}
            with self.subTest(passed=passed), mock.patch.object(gate, 'validate', return_value=report) as replay:
                self.assertEqual(gate.main(['--out-dir', 'build/unused-cli-control']), 0 if passed else 1)
                replay.assert_called_once_with(PACK_PLACEHOLDER, Path('build/unused-cli-control'))

    def test_admission_and_native_process_failures_are_nonzero_and_actionable(self):
        for error in (ValueError('reference identity differs'),
                      gate.subprocess.CalledProcessError(1, ['cargo'], stderr='native calculation failed')):
            with self.subTest(error=type(error)), mock.patch.object(gate, 'validate', side_effect=error), \
                 self.assertLogs(gate.LOGGER, level='ERROR') as logs:
                self.assertEqual(gate.main(['--out-dir', 'build/unused-cli-control']), 1)
            self.assertTrue(any('Precision validation failed' in line for line in logs.output))


PACK_PLACEHOLDER = ROOT / 'tests/fixtures/horizons-precision-1900-2200-20261104'
if __name__ == '__main__': unittest.main()
