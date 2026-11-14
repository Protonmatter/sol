"""Admission and status tests; numerical/native evidence requires the real CI image."""
from __future__ import annotations
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import textwrap
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import collect_moon_evidence as collector


class CanonicalMoonEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.manifest = collector.generator.load_generation_manifest()
        # Admission tests must remain independent of the repository's eventual
        # reviewed qualification state and the host running the tests.
        self.manifest['canonical']['status'] = 'pending'
        self.manifest['canonical']['qualification'] = {'identical_runs': 0, 'reviewed_evidence': None}
        self.runtime = {'system': 'Linux', 'machine': 'x86_64', 'implementation': 'CPython', 'python_version': '3.12.12'}
        self.digest = self.manifest['canonical']['image_digest']

    def collect(self, *, runtime=None, digest=None, output_change=False, validator_exit=0):
        # Echoing committed outputs here tests admission/reporting only. The
        # actual unmocked image must supply the independent numerical evidence.
        generated = [(ROOT / name).read_text(encoding='utf-8') for name in collector.OUTPUTS]
        if output_change: generated[0] += 'changed'
        with mock.patch.object(collector.generator, 'load_generation_manifest', return_value=self.manifest), \
             mock.patch.object(collector.generator, 'runtime_identity', return_value=runtime or self.runtime), \
             mock.patch.object(collector.generator, 'build', return_value=tuple(generated)), \
             mock.patch.object(collector.validator, 'main', return_value=validator_exit) as validate, \
             mock.patch.dict(collector.os.environ, {'SOL_MOON_GENERATOR_IMAGE_DIGEST': self.digest if digest is None else digest}, clear=True):
            report = collector.collect()
        validate.assert_called_once_with(['--require-canonical'] if self.manifest['canonical']['status'] == 'qualified' else [])
        return report

    def test_passing_candidate_evidence_does_not_promote_pending_qualification(self):
        report = self.collect()
        self.assertTrue(report['comparison_passed'])
        self.assertEqual(report['qualification_status'], 'pending')
        self.assertFalse(report['qualification_granted'])
        self.assertEqual(report['generated_sha256'], self.manifest['outputs'])
        self.assertEqual(report['source_sha256_before'], report['source_sha256_after'])

    def test_wrong_runtime_or_image_fails_before_generation(self):
        cases = [(dict(self.runtime, system='Windows'), self.digest),
                 (dict(self.runtime, machine='aarch64'), self.digest),
                 (dict(self.runtime, implementation='PyPy'), self.digest),
                 (dict(self.runtime, python_version='3.14.4'), self.digest),
                 (self.runtime, 'sha256:' + '0' * 64)]
        for runtime, digest in cases:
            with self.subTest(runtime=runtime, digest=digest), \
                 mock.patch.object(collector.generator, 'runtime_identity', return_value=runtime), \
                 mock.patch.object(collector.generator, 'build') as build, \
                 mock.patch.dict(collector.os.environ, {'SOL_MOON_GENERATOR_IMAGE_DIGEST': digest}, clear=True), self.assertRaises(ValueError):
                collector.collect()
            build.assert_not_called()

    def test_qualified_comparison_requires_strict_validation_without_granting_status(self):
        self.manifest['canonical']['status'] = 'qualified'
        self.manifest['canonical']['qualification'] = {'identical_runs': 2, 'reviewed_evidence': 'reviewed fixture'}
        report = self.collect()
        self.assertTrue(report['comparison_passed'])
        self.assertEqual(report['qualification_status'], 'qualified')
        self.assertFalse(report['qualification_granted'])

    def test_changed_generated_bytes_or_failed_numerics_cannot_pass(self):
        self.assertFalse(self.collect(output_change=True)['comparison_passed'])
        self.assertFalse(self.collect(validator_exit=1)['comparison_passed'])

    def test_changed_source_refused_before_generation(self):
        with mock.patch.object(collector.generator, 'verify_source_identity', side_effect=ValueError('source drift')), \
             mock.patch.object(collector.generator, 'build') as build, self.assertRaises(ValueError):
            collector.collect()
        build.assert_not_called()

    def test_changed_sources_during_collection_cannot_pass(self):
        real = collector.fingerprints()
        after = dict(real); after['tools/validate_moons.py'] = '0' * 64
        with mock.patch.object(collector, 'fingerprints', side_effect=[real, after]):
            self.assertFalse(self.collect()['comparison_passed'])

    def test_cli_refusal_is_json_and_preserves_files(self):
        before = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in collector.OUTPUTS}
        with mock.patch.object(collector, 'collect', side_effect=ValueError('unqualified runtime')), \
             mock.patch.object(sys, 'stdout', new_callable=io.StringIO) as stdout:
            self.assertEqual(collector.main([]), 2)
        report = json.loads(stdout.getvalue())
        self.assertEqual(report['status'], 'refused')
        self.assertFalse(report['qualification_granted'])
        self.assertEqual(before, {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in collector.OUTPUTS})

    def test_snapshot_contains_only_fixed_inputs_and_never_replaces_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in collector.INPUTS:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(name.encode())
            (root / '.git').mkdir(); (root / '.git/config').write_text('excluded')
            with mock.patch.object(collector, 'ROOT', root), mock.patch.object(collector.generator, 'verify_source_identity'):
                target = root / 'build/inputs'; report = collector.snapshot(target)
                self.assertTrue(report['snapshot_created']); self.assertFalse(report['qualification_granted'])
                self.assertEqual({p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}, set(collector.INPUTS))
                with self.assertRaises(ValueError): collector.snapshot(target)
                with self.assertRaises(ValueError): collector.snapshot(root / 'apps/web/replacement')

    def test_snapshot_source_mutation_refuses_completion(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with mock.patch.object(collector, 'ROOT', root), mock.patch.object(collector.generator, 'verify_source_identity'), \
                 mock.patch.object(collector, 'input_bytes', return_value={'tools/validate_moons.py': b'original'}), \
                 mock.patch.object(collector, 'fingerprints', return_value={'tools/validate_moons.py': 'changed'}), self.assertRaises(ValueError):
                collector.snapshot(root / 'build/inputs')


class CIMoonGateTests(unittest.TestCase):
    def test_actual_ci_admission_script_rejects_pending_or_failed_comparison(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        job = workflow.split('  moon-image-evidence:\n', 1)[1].split('\n  candidate:', 1)[0]
        program = textwrap.dedent(job.split("python3 - <<'PY'\n", 1)[1].split('\n          PY\n', 1)[0])
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / 'build/moon-image-evidence/comparison.json'
            report_path.parent.mkdir(parents=True)
            for passed, status, expected in [(True, 'qualified', 0), (True, 'pending', 1),
                                             (False, 'qualified', 1), (1, 'qualified', 1),
                                             (True, None, 1)]:
                with self.subTest(passed=passed, status=status):
                    report_path.write_text(json.dumps({'comparison_passed': passed, 'qualification_status': status}))
                    result = subprocess.run([sys.executable, '-B', '-c', program], cwd=directory,
                                            capture_output=True, text=True, timeout=10)
                    self.assertEqual(result.returncode, expected, result.stderr)


class RecordedCanonicalEvidenceTests(unittest.TestCase):
    def test_strict_post_qualification_runs_bind_the_final_manifest_and_sources(self):
        fixture = ROOT / 'tests/fixtures/canonical-moon-20261103/strict'
        ledger = json.loads((fixture / 'manifest.json').read_text())
        self.assertEqual(set(ledger['files']), {'native-metadata.json', 'comparison-1.json',
                         'comparison-2.json', 'comparison-1.stderr', 'comparison-2.stderr',
                         'launcher.py.txt', 'launcher.log', 'generation-manifest.qualified.json'})
        for name, expected in ledger['files'].items():
            raw = (fixture / name).read_bytes()
            self.assertEqual({'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}, expected)
        captured = json.loads((fixture / 'generation-manifest.qualified.json').read_text())
        self.assertEqual(captured['canonical']['status'], 'qualified')
        native = json.loads((fixture / 'native-metadata.json').read_text())
        self.assertEqual([run['index'] for run in native['runs']], [1, 2])
        for run in native['runs']:
            name = f"comparison-{run['index']}.json"
            report = json.loads((fixture / name).read_text())
            self.assertEqual(hashlib.sha256((fixture / name).read_bytes()).hexdigest(), run['report_sha256'])
            self.assertEqual(run['exit_code'], 0)
            self.assertTrue(report['comparison_passed'])
            self.assertFalse(report['qualification_granted'])
            self.assertEqual(report['qualification_status'], 'qualified')
            self.assertEqual(report['generated_sha256'], captured['outputs'])
            self.assertEqual(report['source_sha256_before'], report['source_sha256_after'])
            self.assertEqual(report['source_sha256_before'], native['current_source_sha256'])
            self.assertEqual(report['source_sha256_before']['tools/ephemeris-data/generation-manifest.json'],
                             ledger['files']['generation-manifest.qualified.json']['sha256'])
            self.assertEqual(report['numerical_validator_exit'], 0)
            self.assertNotIn('noncanonical comparison', report['validator_log'])
            self.assertIn('11985 interleaved Horizons checks', report['validator_log'])
            self.assertEqual((fixture / name.replace('.json', '.stderr')).read_bytes(), b'')
        canonical = collector.generator.load_generation_manifest()['canonical']
        if canonical['status'] == 'qualified' and canonical['qualification'].get('evidence_id', 'canonical-moon-20261103') == 'canonical-moon-20261103':
            self.assertEqual(collector.fingerprints(), native['current_source_sha256'])

    def test_recorded_runs_and_qualified_sources_match_the_retained_evidence(self):
        fixture = ROOT / 'tests/fixtures/canonical-moon-20261103'
        ledger = json.loads((fixture / 'manifest.json').read_text())
        names = {'native-metadata.json', 'comparison-1.json', 'comparison-2.json',
                 'comparison-1.stderr', 'comparison-2.stderr', 'upload-acquisition.json',
                 'generation-manifest.pending.json', 'launcher-original.py.txt',
                 'launcher-resume.py.txt', 'launcher-resume.log', 'image-load.log',
                 'digest-registration.log'}
        self.assertEqual(set(ledger['files']), names)
        for name, expected in ledger['files'].items():
            raw = (fixture / name).read_bytes()
            self.assertEqual(len(raw), expected['bytes'])
            self.assertEqual(hashlib.sha256(raw).hexdigest(), expected['sha256'])
        original = json.loads((fixture / 'generation-manifest.pending.json').read_text())
        self.assertEqual(original['canonical']['status'], 'pending')
        self.assertEqual(original['validation']['max_angle_deg'], 0.15)
        self.assertEqual(original['validation']['max_radius_fraction'], 0.0025)
        self.assertEqual(original['validation']['minimum_checks_per_moon'], 100)
        self.assertEqual(original['validation']['expected_held_out_checks'], 11985)
        native = json.loads((fixture / 'native-metadata.json').read_text())
        digest = original['canonical']['image_digest']
        self.assertEqual((native['host_system'], native['host_machine']), ('Linux', 'x86_64'))
        self.assertEqual((native['image_os'], native['image_architecture']), ('linux', 'amd64'))
        self.assertTrue(any(value.endswith('@' + digest) for value in native['repo_digests']))
        self.assertEqual([run['index'] for run in native['runs']], [1, 2])
        for run in native['runs']:
            name = f"comparison-{run['index']}.json"
            report = json.loads((fixture / name).read_text())
            self.assertEqual(hashlib.sha256((fixture / name).read_bytes()).hexdigest(), run['report_sha256'])
            self.assertEqual(run['exit_code'], 0)
            self.assertTrue(run['comparison_passed'])
            self.assertTrue(report['comparison_passed'])
            self.assertFalse(report['qualification_granted'])
            self.assertEqual(report['qualification_status'], 'pending')
            self.assertEqual(report['launcher_asserted_image_digest'], digest)
            self.assertEqual(report['runtime'], {'system': 'Linux', 'machine': 'x86_64',
                             'implementation': 'CPython', 'python_version': '3.12.12'})
            self.assertEqual(report['runtime'], run['runtime'])
            self.assertEqual(report['source_sha256_before'], native['current_source_sha256'])
            self.assertEqual(report['source_sha256_before'], report['source_sha256_after'])
            self.assertEqual(report['generated_sha256'], original['outputs'])
            self.assertEqual(report['generated_sha256'], report['committed_sha256'])
            self.assertEqual(report['generated_sha256'], run['generated_sha256'])
            self.assertEqual(report['numerical_validator_exit'], 0)
            self.assertIn('11985 interleaved Horizons checks', report['validator_log'])
            self.assertEqual((fixture / name.replace('.json', '.stderr')).read_bytes(), b'')
        current = collector.generator.load_generation_manifest()
        if current['canonical']['status'] == 'qualified' and current['canonical']['qualification'].get('evidence_id', 'canonical-moon-20261103') == 'canonical-moon-20261103':
            # Qualification metadata changes after review; all numerical inputs,
            # serializer, validator and collector must still match the actual runs.
            for key in ('generator', 'sources', 'outputs', 'serialization', 'validation'):
                self.assertEqual(current[key], original[key])
            for key in ('platform', 'image', 'image_digest', 'python_implementation', 'python_version'):
                self.assertEqual(current['canonical'][key], original['canonical'][key])
            actual = collector.fingerprints()
            actual['tools/ephemeris-data/generation-manifest.json'] = hashlib.sha256(
                (fixture / 'generation-manifest.pending.json').read_bytes()).hexdigest()
            self.assertEqual(actual, native['current_source_sha256'])
            evidence = current['canonical']['qualification']
            self.assertEqual(evidence['identical_runs'], 2)
            self.assertTrue((ROOT / evidence['reviewed_evidence']).is_file())


if __name__ == '__main__': unittest.main()
