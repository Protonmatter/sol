"""Offline aggregation/publication controls with the native observer isolated."""
from __future__ import annotations

from dataclasses import replace
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import validate_precision_window as gate
from test_precision_window_validation import small_pack,native_rows,native_text


class PrecisionOrchestrationTests(unittest.TestCase):
    def observe(self,directory,before,*,regressed=False):
        directory.mkdir(parents=True)
        rows=native_rows()
        if regressed:rows[0][4]='1.0001'
        data=native_text(rows).encode();(directory/'native.csv').write_bytes(data)
        receipt={'native_csv_sha256':hashlib.sha256(data).hexdigest(),'scope':'Synthetic transport boundary, not native science evidence'}
        (directory/'receipt.json').write_text(json.dumps(receipt),encoding='utf-8')
        return receipt

    def test_real_aggregation_publishes_complete_pass_and_failed_comparisons(self):
        for failed in (False,True):
            with self.subTest(failed=failed),tempfile.TemporaryDirectory(dir=ROOT/'build') as folder:
                target=Path(folder)/'result';pack=small_pack()
                with (mock.patch.object(gate.reference,'EPOCHS',(2451545.,)),
                      mock.patch.object(gate.reference,'load_precision_pack',return_value=pack),
                      mock.patch.object(gate,'observe',side_effect=lambda p,b:self.observe(p,b,regressed=failed))):
                    report=gate.validate(Path('unused-reference'),target)
                self.assertEqual(report['passed'],not failed)
                self.assertEqual(report['native_records'],19);self.assertEqual(report['checks'],28)
                self.assertEqual(report['failure_count'],1 if failed else 0)
                self.assertEqual(json.loads((target/'summary.json').read_text()),report)
                self.assertEqual(len((target/'all-comparisons.csv').read_text().splitlines()),29)
                self.assertEqual(report['native_source_sha256'],gate.source_hashes())
                self.assertEqual(report['validation_source_sha256'],gate.validation_hashes())

    def test_source_validator_or_reference_drift_prevents_successful_summary(self):
        for changed in ('source','validator','reference'):
            with self.subTest(changed=changed),tempfile.TemporaryDirectory(dir=ROOT/'build') as folder:
                target=Path(folder)/'result';pack=small_pack()
                before=gate.source_hashes();validators=gate.validation_hashes()
                after={**before,'changed':'0'*64} if changed=='source' else before
                after_validators={**validators,'changed':'0'*64} if changed=='validator' else validators
                packs=[pack,replace(pack,manifest_sha256='c'*64)] if changed=='reference' else [pack,pack]
                with (mock.patch.object(gate.reference,'EPOCHS',(2451545.,)),
                      mock.patch.object(gate.reference,'load_precision_pack',side_effect=packs),
                      mock.patch.object(gate,'source_hashes',side_effect=[before,after]),
                      mock.patch.object(gate,'validation_hashes',side_effect=[validators,after_validators]),
                      mock.patch.object(gate,'observe',side_effect=self.observe)):
                    with self.assertRaisesRegex(ValueError,'changed during comparison'):
                        gate.validate(Path('unused-reference'),target)
                self.assertFalse((target/'summary.json').exists())

    def test_cli_propagates_sample_failures_and_admission_or_backend_errors(self):
        for passed in (True,False):
            report={'passed':passed,'checks':28,'epochs':1,'failure_count':0 if passed else 1}
            with mock.patch.object(gate,'validate',return_value=report),self.assertLogs(gate.LOGGER,level='INFO'):
                self.assertEqual(gate.main(['--out-dir','build/unused-control']),0 if passed else 1)
        for error in (ValueError('admission'),OSError('input missing'),subprocess.TimeoutExpired(['native'],1),
                      subprocess.CalledProcessError(1,['native'],stderr='controlled native failure')):
            with self.subTest(error=error),mock.patch.object(gate,'validate',side_effect=error),self.assertLogs(gate.LOGGER,level='ERROR'):
                self.assertEqual(gate.main(['--out-dir','build/unused-control']),1)


if __name__=='__main__':unittest.main()
