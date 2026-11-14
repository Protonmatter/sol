from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import validate_operational_readiness as validator
from snapshot_semantics import REQUIRED_GATE_IDS


class OperationalReadinessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.snapshot = json.loads((ROOT / 'apps/web/data/latest-state.json').read_bytes())
        self.value = self.snapshot['operational_readiness']

    def cli(self, payload: str | bytes | None, *, operational: bool = False) -> tuple[int, str]:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'snapshot.json'
            if isinstance(payload, bytes):
                path.write_bytes(payload)
            elif payload is not None:
                path.write_text(payload, encoding='utf-8')
            args = ['validate_operational_readiness.py', str(path)]
            if operational:
                args.append('--require-space-weather-operational')
            with mock.patch.object(sys, 'argv', args), self.assertLogs(validator.LOGGER, level='INFO') as logs:
                code = validator.main()
            return code, '\n'.join(logs.output)

    def test_current_research_contract_is_accepted_without_mutation(self) -> None:
        before = copy.deepcopy(self.value)
        self.assertEqual(validator.validate_readiness(self.value, False), [])
        self.assertEqual(self.value, before)
        self.assertEqual(self.cli(json.dumps(self.snapshot))[0], 0)

    def test_required_gates_cannot_disappear(self) -> None:
        for identity in REQUIRED_GATE_IDS:
            with self.subTest(identity=identity):
                value = copy.deepcopy(self.value)
                value['gates'] = [gate for gate in value['gates'] if gate['id'] != identity]
                self.assertTrue(validator.validate_readiness(value, False))

    def test_conflicting_duplicate_gate_is_rejected_in_both_orders(self) -> None:
        for first in [True, False]:
            with self.subTest(failure_first=first):
                value = copy.deepcopy(self.value)
                failure = {'id': 'snapshot_contract', 'label': 'failure', 'passed': False}
                value['gates'].insert(0 if first else len(value['gates']), failure)
                errors = validator.validate_readiness(value, False)
                self.assertTrue(any('unique' in error or 'duplicate' in error for error in errors), errors)

    def test_identical_duplicate_gate_is_also_rejected(self) -> None:
        self.value['gates'].append(copy.deepcopy(self.value['gates'][0]))
        self.assertTrue(validator.validate_readiness(self.value, False))

    def test_malformed_gate_objects_are_not_ignored(self) -> None:
        for gate in [None, [], 'not a gate', 3]:
            with self.subTest(gate=gate):
                value = copy.deepcopy(self.value)
                value['gates'].append(gate)
                self.assertTrue(validator.validate_readiness(value, False))

    def test_gate_identifiers_are_validated_before_hash_lookup(self) -> None:
        for identity in [[], {}, None, 3, '', '   ']:
            with self.subTest(identity=identity):
                value = copy.deepcopy(self.value)
                value['gates'].append({'id': identity, 'label': 'bad id', 'passed': True})
                self.assertTrue(validator.validate_readiness(value, False))

    def test_extra_gate_values_must_be_boolean(self) -> None:
        for passed in [None, 1, 0, 'true', []]:
            with self.subTest(passed=passed):
                value = copy.deepcopy(self.value)
                value['gates'].append({'id': 'extra_gate', 'label': 'additional information', 'passed': passed})
                self.assertTrue(validator.validate_readiness(value, False))
        self.value['gates'].append({'id': 'extra_gate', 'label': 'additional information', 'passed': True})
        self.assertEqual(validator.validate_readiness(self.value, False), [])

    def test_required_research_gates_must_pass_and_operational_gates_stay_blocked(self) -> None:
        for gate in self.value['gates']:
            value = copy.deepcopy(self.value)
            next(row for row in value['gates'] if row['id'] == gate['id'])['passed'] = not gate['passed']
            with self.subTest(identity=gate['id']):
                self.assertTrue(validator.validate_readiness(value, False))

    def test_version_and_status_are_required(self) -> None:
        for key, invalid in [('schema_version', 'operational-readiness.v2'), ('schema_version', None),
                             ('status', None), ('status', ''), ('status', {})]:
            with self.subTest(key=key, invalid=invalid):
                value = copy.deepcopy(self.value)
                value[key] = invalid
                self.assertTrue(validator.validate_readiness(value, False))

    def test_current_v1_cannot_be_promoted_by_flipping_booleans(self) -> None:
        self.value['space_weather_operational'] = True
        for gate in self.value['gates']:
            gate['passed'] = True
        self.assertTrue(validator.validate_readiness(self.value, True))
        self.assertEqual(self.cli(json.dumps(self.snapshot), operational=True)[0], 1)

    def test_operational_mode_rejects_the_real_research_snapshot(self) -> None:
        self.assertEqual(self.cli(json.dumps(self.snapshot), operational=True)[0], 1)

    def test_missing_readiness_and_non_array_gates_are_rejected(self) -> None:
        for value in [None, [], {}, {**self.value, 'gates': None}, {**self.value, 'gates': {}}]:
            with self.subTest(value_type=type(value).__name__):
                self.assertTrue(validator.validate_readiness(value, False))

    def test_cli_rejects_unreadable_malformed_or_non_object_json_without_traceback(self) -> None:
        for payload in [None, b'\xff', '{', '[]', 'null', '3', '{}', '[' * 1500 + '0' + ']' * 1500]:
            with self.subTest(payload=payload):
                code, log = self.cli(payload)
                self.assertEqual(code, 1)
                self.assertNotIn('Traceback', log)

    def test_cli_rejects_duplicate_keys_and_non_json_numbers_without_payload_echo(self) -> None:
        ready = json.dumps(self.value)
        cases = ['{"operational_readiness":null,"operational_readiness":' + ready + '}',
                 '{"operational_readiness":' + ready + ',"DO_NOT_ECHO_TEST_PAYLOAD":NaN}',
                 '{"operational_readiness":' + ready + ',"DO_NOT_ECHO_TEST_PAYLOAD":1e999}']
        for payload in cases:
            with self.subTest(payload_kind=payload[-10:]):
                code, log = self.cli(payload)
                self.assertEqual(code, 1)
                self.assertNotIn('DO_NOT_ECHO_TEST_PAYLOAD', log)


if __name__ == '__main__':
    unittest.main()
