"""Exact-domain evidence and source binding; synthetic vectors are admission tests only."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import io
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))


class IndependentEvidenceTests(unittest.TestCase):
    def evidence(self):
        spec = importlib.util.find_spec('independent_vector_evidence')
        self.assertIsNotNone(spec, 'typed independent evidence admission must exist')
        import independent_vector_evidence as evidence
        return evidence

    def document(self):
        evidence = self.evidence()
        import validate_vectors as gate
        from test_horizons_vectors import NativeVectorGateTests, PACK
        # These reference-identical vectors deliberately exercise admission only.
        with mock.patch.object(gate, 'native_output', return_value=NativeVectorGateTests.protocol()):
            report = gate.validate(PACK)
        return evidence, evidence.build_document(report)

    def test_complete_native_only_domain_and_reference_provenance(self):
        evidence, document = self.document()
        evidence.validate_document(document)
        self.assertEqual(len(document['records']), 160)
        self.assertEqual(document['execution'], 'native_f64_system_abi')
        self.assertEqual(document['domain']['model_argument_policy'], 'TT_equal_to_reference_TDB')
        self.assertIn('tests/fixtures/horizons-vectors-20261104/mercury.txt', document['reference_artifacts_sha256'])
        self.assertEqual(document['records'][0]['returned_target_id'], 199)
        self.assertEqual(document['records'][9]['center_id'], 399)

    def test_forged_metrics_epochs_origin_reference_and_schema_rejected(self):
        evidence, original = self.document()
        changes = [lambda d: d['records'][0].__setitem__('relative_vector_norm_arcsec', 1),
                   lambda d: d['records'][0].__setitem__('jd_tdb', 2451545),
                   lambda d: d['records'][0].__setitem__('center_id', 399),
                   lambda d: d['records'][0]['reference_vector_au'].__setitem__(0, 3),
                   lambda d: d['records'][0].__setitem__('passed', False),
                   lambda d: d['records'][0].__setitem__('angular_error_arcsec', float('nan')),
                   lambda d: d['records'].pop(),
                   lambda d: d['records'].__setitem__(1, copy.deepcopy(d['records'][0])),
                   lambda d: d['domain'].__setitem__('time_scale', 'UTC'),
                   lambda d: d.__setitem__('execution', 'wasm'),
                   lambda d: d.__setitem__('unrecognized', True),
                   lambda d: d['reference_artifacts_sha256'].pop(next(iter(d['reference_artifacts_sha256']))) ]
        for change in changes:
            document = copy.deepcopy(original); change(document)
            with self.subTest(change=change), self.assertRaises(ValueError):
                evidence.validate_document(document)

    def test_stale_omitted_added_sources_and_changed_tools_fail_closed(self):
        evidence, original = self.document()
        changes = [lambda d: d['native_source_sha256'].__setitem__('crates/solar-ephemeris/src/time.rs', '0' * 64),
                   lambda d: d['native_source_sha256'].pop(next(iter(d['native_source_sha256']))),
                   lambda d: d['native_source_sha256'].__setitem__('new.rs', '0' * 64),
                   lambda d: d['validation_source_sha256'].__setitem__('tools/validate_vectors.py', '0' * 64)]
        for change in changes:
            document = copy.deepcopy(original); change(document)
            # Even a self-consistent aggregate cannot authenticate stale inventories.
            document['native_source_digest'] = evidence.digest_inventory(document['native_source_sha256'])
            document['validation_source_digest'] = evidence.digest_inventory(document['validation_source_sha256'])
            with self.subTest(change=change), self.assertRaises(ValueError):
                evidence.validate_document(document)

    def test_native_replay_cannot_change_recorded_vectors_or_drop_failure(self):
        evidence, document = self.document()
        altered = copy.deepcopy(document)
        altered['records'][0]['native_vector_au'][0] += 0.001
        with self.assertRaises(ValueError): evidence.compare_replay(document, altered)

    def test_browser_binding_is_exact_bytes_not_a_callers_validated_flag(self):
        evidence, document = self.document()
        raw = evidence.serialize(document)
        binding = evidence.binding_source(raw, document)
        self.assertIn(evidence.sha256(raw), binding)
        self.assertIn(document['native_source_digest'], binding)
        self.assertNotEqual(evidence.sha256(raw), evidence.sha256(raw + b' '))

    def test_valid_evidence_preserves_failed_samples_without_passing_the_numerical_gate(self):
        evidence = self.evidence()
        import validate_vectors as gate
        import validate_independent_vector_evidence as validator
        from test_horizons_vectors import NativeVectorGateTests, PACK
        with mock.patch.object(gate, 'native_output', return_value=NativeVectorGateTests.protocol(20)):
            document = evidence.build_document(gate.validate(PACK))
        self.assertEqual(sum(not row['passed'] for row in document['records']), 16)
        with tempfile.TemporaryDirectory() as directory:
            registry, binding = Path(directory)/'evidence.json', Path(directory)/'binding.js'
            raw = evidence.serialize(document)
            registry.write_bytes(raw); binding.write_text(evidence.binding_source(raw, document))
            with mock.patch.object(evidence, 'REGISTRY', registry), mock.patch.object(evidence, 'BINDING', binding), \
                    mock.patch('sys.stdout', new_callable=io.StringIO), mock.patch('sys.stderr', new_callable=io.StringIO):
                self.assertEqual(validator.main([]), 0)
                self.assertEqual(validator.main(['--require-all-pass']), 1)

    def test_receipt_inventory_must_include_every_native_scientific_input(self):
        evidence, document = self.document()
        receipt = {'source_inputs': dict(document['native_source_sha256'])}
        evidence.validate_receipt_binding(document, receipt)
        receipt['source_inputs']['crates/solar-ephemeris/src/time.rs'] = '0' * 64
        with self.assertRaises(ValueError): evidence.validate_receipt_binding(document, receipt)


if __name__ == '__main__': unittest.main()
