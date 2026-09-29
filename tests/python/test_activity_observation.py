"""Actual producer regressions for observation availability and daily stage labels."""
from __future__ import annotations
import json
from pathlib import Path
import sys
import os
import subprocess
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import data_bundles as bundles
import generate_fixture_snapshot as generator
from validate_operational_readiness import validate_readiness
from validate_snapshot import loads_strict, validate

NOW = '2026-09-28T12:00:00Z'

class ActivityObservationTests(unittest.TestCase):
    def cli_binary(self):
        binary = ROOT / 'target/debug' / ('solar-cli.exe' if os.name == 'nt' else 'solar-cli')
        if not binary.is_file():
            message = 'build solar-cli with cargo build -p solar-cli --locked first'
            if os.environ.get('SOL_REQUIRE_CLI') == '1':
                self.fail(message)
            self.skipTest(message)
        return binary

    def report(self, optional_rows=None):
        with tempfile.TemporaryDirectory(prefix='sol-activity-') as directory:
            payloads = {
                'rtsw_mag_1m.json': [{'time_tag': NOW, 'bz_gsm': -2}],
                'rtsw_wind_1m.json': [{'time_tag': NOW, 'speed': 400}],
                **(optional_rows or {}),
            }
            products = [dict(product_id=name, source='synthetic regression source',
                origin='current-fetch', observation_time_utc=NOW, retrieved_at_utc=NOW,
                quality=['offline synthetic regression'], failure=None, license='synthetic',
                critical=name.startswith('rtsw'), payload=bundles.json_bytes(rows))
                for name, rows in payloads.items()]
            source = bundles.create_source_bundle(Path(directory), bundle_id='source',
                acquired_at_utc=NOW, products=products)
            return generator.build_bundle_observation_report(source, evaluated_at_utc=NOW)

    def test_missing_activity_proxies_are_unavailable_despite_fresh_rtsw(self):
        context = self.report()['observed_context']
        self.assertEqual(context['activity_index'], 0.9, 'retain illustrative fixture default')
        self.assertEqual(context.get('activity_observation'),
            {'status': 'unavailable', 'value': None, 'contributors': []})

    def test_stale_future_unknown_and_inactive_f107_cannot_supply_activity(self):
        cases = [
            {'time_tag': '2026-01-01T00:00:00Z', 'flux': 150},
            {'time_tag': '2026-09-28T12:00:01Z', 'flux': 150},
            {'flux': 150},
            {'time_tag': NOW, 'flux': 150, 'active': False},
            {'time_tag': NOW, 'flux': 150, 'source': 'unknown'},
        ]
        for row in cases:
            with self.subTest(row=row):
                context = self.report({'f107_cm_flux.json': [row]})['observed_context']
                self.assertEqual(context.get('activity_observation'),
                    {'status': 'unavailable', 'value': None, 'contributors': []})

    def test_fresh_f107_uses_actual_contributor_and_excludes_stale_count_proxy(self):
        context = self.report({
            'f107_cm_flux.json': [{'time_tag': NOW, 'flux': 150}],
            'solar_regions.json': [{'time_tag': '2026-01-01T00:00:00Z', 'region': 1}],
        })['observed_context']
        self.assertEqual(context.get('activity_observation'), {'status': 'available',
            'value': 0.5, 'contributors': [{'id': 'swpc-f107-cm-flux', 'value': 0.5}]})

    def test_count_proxy_uses_only_fresh_rows(self):
        context = self.report({'solar_regions.json':
            [{'time_tag': NOW, 'region': 1}] +
            [{'time_tag': '2026-01-01T00:00:00Z', 'region': i} for i in range(20)]
        })['observed_context']
        self.assertEqual(context.get('activity_observation'), {'status': 'available',
            'value': 0.25, 'contributors': [{'id': 'swpc-solar-regions', 'value': 0.25}]})

    def test_count_proxy_evidence_uses_an_eligible_active_row(self):
        report = self.report({'solar_regions.json': [
            {'time_tag': NOW, 'region': 1, 'active': False},
            {'time_tag': NOW, 'region': 2, 'active': True},
        ]})
        self.assertEqual(report['observed_context']['activity_observation']['status'], 'available')
        frame = next(frame for frame in report['frames'] if frame['id'] == 'swpc-solar-regions')
        self.assertIs(frame['provenance']['active'], True)

    def test_produced_count_proxy_reaches_cli_analysis(self):
        binary = self.cli_binary()
        report = self.report({'solar_regions.json': [
            {'time_tag': NOW, 'region': 1, 'active': False},
            {'time_tag': NOW, 'region': 2, 'active': True},
        ]})
        with tempfile.TemporaryDirectory(prefix='sol-activity-cli-') as directory:
            report_path = Path(directory)/'report.json'
            output = Path(directory)/'snapshot.json'
            report_path.write_text(json.dumps(report))
            result = subprocess.run([str(binary), 'simulate', '--steps', '0', '--activity', '0.9',
                '--observations', str(report_path), '--out', str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            snapshot = loads_strict(output.read_text(encoding='utf-8'))
            self.assertEqual(snapshot['run']['mode'], 'Assimilation')
            self.assertEqual(snapshot['run']['activity_index'], 0.38)

    def test_producer_cli_roundtrip_validates_analysis_and_withheld_modes(self):
        binary = self.cli_binary()
        # Literal expectations: K=.04/(.04+.01)=.8. Fresh F10.7=150 yields
        # activity .5, so prior .2 becomes .44 with variance .008. Missing or
        # stale activity must leave both prior values unchanged, even after 48h.
        cases = (
            ('fresh', {'f107_cm_flux.json': [{'time_tag': NOW, 'flux': 150}]}, 'Assimilation', 0.44, 0.008),
            ('missing', {}, 'Synthetic', 0.2, 0.04),
            ('stale', {'f107_cm_flux.json': [{'time_tag': '2026-01-01T00:00:00Z', 'flux': 150}]}, 'Synthetic', 0.2, 0.04),
        )
        with tempfile.TemporaryDirectory(prefix='sol-activity-roundtrip-') as directory:
            for name, payloads, mode, activity, variance in cases:
                with self.subTest(case=name):
                    report = self.report(payloads)
                    report_path = Path(directory) / f'{name}-observations.json'
                    output = Path(directory) / f'{name}-snapshot.json'
                    report_path.write_text(json.dumps(report), encoding='utf-8')
                    result = subprocess.run([str(binary), 'simulate', '--steps', '48',
                        '--dt-hours', '1', '--seed', '42', '--activity', '0.2',
                        '--observations', str(report_path), '--out', str(output)],
                        capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    snapshot = loads_strict(output.read_text(encoding='utf-8'))
                    self.assertEqual(snapshot['run']['mode'], mode)
                    self.assertEqual(snapshot['run']['activity_index'], activity)
                    self.assertAlmostEqual(snapshot['uncertainty']['activity']['variance'], variance, places=7)
                    self.assertEqual(validate(snapshot), [])
                    self.assertEqual(validate_readiness(snapshot['operational_readiness'], False), [])

    def test_monthly_fallback_evidence_uses_the_active_numeric_contributor(self):
        report = self.report({'observed-solar-cycle-indices.json': [
            {'time_tag': NOW, 'f10.7': 235, 'active': False},
            {'time_tag': '2026-09-28T11:00:00Z', 'f10.7': 150, 'active': True},
        ]})
        self.assertEqual(report['observed_context']['activity_observation'], {'status': 'available',
            'value': 0.5, 'contributors': [{'id': 'swpc-observed-cycle-indices', 'value': 0.5}]})
        frame = next(frame for frame in report['frames'] if frame['id'] == 'swpc-observed-cycle-indices')
        self.assertIs(frame['provenance']['active'], True)
        self.assertEqual(frame['provenance']['time_tag'], '2026-09-28T11:00:00Z')

    def test_daily_stage_matches_shared_literal_threshold_cases(self):
        report = self.report()
        cases = json.loads((ROOT/'tests/fixtures/activity-stage-cases.json').read_text())
        for case in cases:
            with self.subTest(activity=case['activity']):
                report['observed_context']['activity_index'] = case['activity']
                snapshot = generator.build_snapshot(42, 8, 4, report)
                self.assertEqual(snapshot['learning']['cycle_stage'], case['stage'])

if __name__ == '__main__':
    unittest.main()
