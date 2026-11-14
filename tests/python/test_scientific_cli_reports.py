"""Scientific CLI result/error propagation with native comparison I/O isolated."""
from __future__ import annotations

import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import validate_apparent
import validate_vectors


class ScientificCliReportTests(unittest.TestCase):
    modules=(validate_apparent,validate_vectors)

    def report(self,module,passed):
        row=({'body':'Sun','jd_tt':2451545.,'angular_error_arcsec':0. if passed else 11.}
             if module is validate_apparent else
             {'case':'mercury','jd_tdb':2451545.,'relative_vector_norm_arcsec':0. if passed else 11.})
        row['passed']=passed
        return {'passed':passed,'matrix_size':1,'records':[row]}

    def invoke(self,module,root,target,*,value=None,error=None):
        output,errors=io.StringIO(),io.StringIO()
        with (mock.patch.object(module,'ROOT',root),mock.patch.object(module,'validate',return_value=value,side_effect=error) as native,
              contextlib.redirect_stdout(output),contextlib.redirect_stderr(errors)):
            status=module.main(['--reference-dir','unused-reference','--report',str(target)])
        return status,output.getvalue(),errors.getvalue(),native

    def test_pass_and_failed_comparisons_write_consistent_new_reports(self):
        for module in self.modules:
            for passed in (True,False):
                with self.subTest(module=module.__name__,passed=passed),tempfile.TemporaryDirectory() as folder:
                    root=Path(folder);target=root/'build/nested/report.json';expected=self.report(module,passed)
                    result=self.invoke(module,root,target,value=expected)
                    self.assertEqual(result[0],0 if passed else 1)
                    self.assertEqual(json.loads(target.read_text()),expected)
                    self.assertIn('PASS:' if passed else 'FAIL:',result[1])
                    result[3].assert_called_once_with(Path('unused-reference'))

    def test_backend_and_reference_errors_never_publish_a_success_report(self):
        for module in self.modules:
            for error in (ValueError('reference admission failed'),OSError('input missing'),
                          subprocess.TimeoutExpired(['native'],1),
                          subprocess.CalledProcessError(1,['native'],stderr='controlled failure')):
                with self.subTest(module=module.__name__,error=error),tempfile.TemporaryDirectory() as folder:
                    root=Path(folder);target=root/'coverage/result.json'
                    result=self.invoke(module,root,target,error=error)
                    self.assertEqual(result[0],1);self.assertFalse(target.exists())
                    self.assertIn('validation failed',result[2])

    def test_each_caller_rejects_reserved_or_existing_targets_before_native_work(self):
        for module in self.modules:
            with self.subTest(module=module.__name__),tempfile.TemporaryDirectory() as folder:
                root=Path(folder)
                result=self.invoke(module,root,root/'build',value=self.report(module,True))
                self.assertEqual(result[0],1);result[3].assert_not_called()
                target=root/'coverage/prior.json';target.parent.mkdir();target.write_text('preserve')
                result=self.invoke(module,root,target,value=self.report(module,True))
                self.assertEqual(result[0],1);result[3].assert_not_called();self.assertEqual(target.read_text(),'preserve')


if __name__=='__main__':unittest.main()
