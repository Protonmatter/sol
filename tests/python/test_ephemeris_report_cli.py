"""Observer CLI report safety; native I/O is isolated, not numerical qualification."""
from __future__ import annotations

import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import validate_ephemeris as gate
from horizons_reference import load_reference_pack

PACK = ROOT / 'tests/fixtures/horizons-observer-20261103'


class EphemerisReportCliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        requests = {(label, body): gate.horizons_request_url(code, when, lat, lon, elev)
                    for label, when, lat, lon, elev in gate.CASES for body, code in gate.BODIES.items()}
        cls.pack = load_reference_pack(PACK, requests)

    def snapshot(self, _binary, when, lat, lon, elev, *, failed=False, nonfinite=False):
        refs = {name: gate.horizons_observation(code, when, lat, lon, elev, fetch=self.pack.fetch)
                for name, code in gate.BODIES.items()}
        return {'time': {'dut1_seconds': float('nan') if nonfinite else refs['Sun']['dut1_seconds']},
                'bodies': [{'name': name, 'topocentric_apparent_ra_deg': ref['ra_deg'],
                            'topocentric_apparent_dec_deg': ref['dec_deg'], 'az_deg': ref['az_deg'],
                            'alt_deg': ref['el_deg'] + (1 if failed and name == 'Sun' else 0)}
                           for name, ref in refs.items()]}

    def invoke(self, root, target=None, *, effect=None, failed=False, nonfinite=False):
        output, errors = io.StringIO(), io.StringIO()
        args = ['validate_ephemeris.py', '--binary', 'unused', '--reference-dir', str(PACK)]
        if target is not None: args += ['--report', str(target)]
        def snapshot(*args):
            if effect is not None: effect()
            return self.snapshot(*args, failed=failed, nonfinite=nonfinite)
        with (mock.patch.object(gate, 'ROOT', root, create=True), mock.patch.object(sys, 'argv', args),
              mock.patch.object(gate, 'engine_snapshot', side_effect=snapshot) as engine,
              mock.patch.object(gate, 'fetch_with_retry', side_effect=AssertionError('unexpected network')) as network,
              contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors)):
            status = gate.main()
        network.assert_not_called()
        return status, output.getvalue(), errors.getvalue(), engine

    def test_existing_report_is_preserved_before_native_work(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); target = root / 'build/prior.json'
            target.parent.mkdir(); target.write_bytes(b'prior evidence')
            result = self.invoke(root, target)
            self.assertEqual(result[0], 1); self.assertEqual(target.read_bytes(), b'prior evidence')
            result[3].assert_not_called()

    def test_source_and_external_paths_are_rejected_before_native_work(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); source = root / 'apps/web/data/state.json'
            source.parent.mkdir(parents=True); source.write_bytes(b'authoritative')
            for target in (source, root / 'new-source.json'):
                with self.subTest(target=target):
                    result = self.invoke(root, target)
                    self.assertEqual(result[0], 1); result[3].assert_not_called()
            self.assertEqual(source.read_bytes(), b'authoritative')
            self.assertFalse((root / 'new-source.json').exists())

    def test_reserved_output_roots_cannot_become_report_files(self):
        for name in ('build', 'coverage'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve(); target = root / name
                result = self.invoke(root, target)
                self.assertEqual(result[0], 1); self.assertFalse(target.exists()); result[3].assert_not_called()

    def test_report_created_during_calculation_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); target = root / 'coverage/new.json'; target.parent.mkdir()
            result = self.invoke(root, target, effect=lambda: target.write_bytes(b'concurrent evidence'))
            self.assertEqual(result[0], 1); self.assertEqual(target.read_bytes(), b'concurrent evidence')
            self.assertEqual(result[3].call_count, 4)

    def test_pass_and_failed_comparisons_keep_report_schema_and_exit_status(self):
        for failed in (False, True):
            with self.subTest(failed=failed), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve(); target = root / 'build/nested/report.json'
                result = self.invoke(root, target, failed=failed)
                self.assertEqual(result[0], 1 if failed else 0)
                report = json.loads(target.read_bytes())
                self.assertEqual(report['schema_version'], 'ephemeris-validation-report.v2')
                self.assertEqual(report['passed'], not failed); self.assertEqual(report['matrix_size'], 36)

    def test_nonfinite_report_is_not_published(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); target = root / 'build/nonfinite.json'
            result = self.invoke(root, target, nonfinite=True)
            self.assertEqual(result[0], 1); self.assertFalse(target.exists())

    def test_publication_io_failure_returns_one_without_success_message(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); target = root / 'coverage/result.json'
            with mock.patch.object(gate, 'write_report', side_effect=PermissionError('controlled output failure'), create=True):
                result = self.invoke(root, target)
            self.assertEqual(result[0], 1); self.assertFalse(target.exists())
            self.assertIn('controlled output failure', result[2]); self.assertNotIn('OK:', result[1])

    def test_no_report_mode_remains_available(self):
        with tempfile.TemporaryDirectory() as folder:
            result = self.invoke(Path(folder).resolve())
            self.assertEqual(result[0], 0); self.assertEqual(result[3].call_count, 4)


if __name__ == '__main__': unittest.main()
