"""Range-report CLI failure propagation and preservation of existing files."""
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
import validate_ranges as gate


def report(passed=True):
    return {'records':[{'passed':passed,'case':'control','body':'Moon','quantity':'observer_range_km',
        'error_km':0.0 if passed else 2.0,'tolerance_km':1.0}],'passed':passed}


class RangeValidationCliTests(unittest.TestCase):
    def invoke(self,root,target=None,*,value=None,error=None,validate_effect=None):
        output,errors=io.StringIO(),io.StringIO()
        argv=['validate_ranges.py']+(['--report',str(target)] if target else [])
        with (mock.patch.object(gate,'ROOT',root),mock.patch.object(sys,'argv',argv),
                mock.patch.object(gate,'find_binary',return_value=Path('unused')) as binary,
                mock.patch.object(gate,'validate',return_value=value or report(),side_effect=error or validate_effect) as validate,
                contextlib.redirect_stdout(output),contextlib.redirect_stderr(errors)):
            status=gate.main()
        return status,output.getvalue(),errors.getvalue(),binary,validate

    def test_authoritative_paths_are_rejected_before_native_work(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'apps/web/data/state.json';target.parent.mkdir(parents=True)
            target.write_text('authoritative')
            result=self.invoke(root,target)
            self.assertEqual(result[0],1);self.assertEqual(target.read_text(),'authoritative')
            result[3].assert_not_called();result[4].assert_not_called()

    def test_existing_report_is_preserved_and_native_work_is_not_started(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'build/prior.json';target.parent.mkdir();target.write_text('prior')
            result=self.invoke(root,target)
            self.assertEqual(result[0],1);self.assertEqual(target.read_text(),'prior')
            result[4].assert_not_called()

    def test_concurrent_report_creation_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'build/report.json';target.parent.mkdir()
            def concurrent(*_):target.write_text('concurrent prior');return report()
            result=self.invoke(root,target,validate_effect=concurrent)
            self.assertEqual(result[0],1);self.assertEqual(target.read_text(),'concurrent prior')

    def test_reserved_output_roots_and_post_calculation_redirection_are_rejected(self):
        for directory in ('build','coverage'):
            with self.subTest(directory=directory),tempfile.TemporaryDirectory() as folder:
                root=Path(folder);target=root/directory;result=self.invoke(root,target)
                self.assertEqual(result[0],1);self.assertFalse(target.exists());result[4].assert_not_called()
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'build/result.json';changed=False;original=Path.resolve
            def resolve(path,*args,**kwargs):
                if changed and path.is_relative_to(root/'build'):return root/'apps/web'/path.relative_to(root/'build')
                return original(path,*args,**kwargs)
            def calculate(*_):
                nonlocal changed
                changed=True;return report()
            with mock.patch.object(Path,'resolve',new=resolve):result=self.invoke(root,target,validate_effect=calculate)
            self.assertEqual(result[0],1);self.assertFalse(target.exists());result[4].assert_called_once()

    def test_pass_and_numerical_failure_write_new_reports_with_correct_status(self):
        for passed in (True,False):
            with self.subTest(passed=passed),tempfile.TemporaryDirectory() as folder:
                root=Path(folder);target=root/'coverage/nested/result.json'
                result=self.invoke(root,target,value=report(passed))
                self.assertEqual(result[0],0 if passed else 1)
                self.assertEqual(json.loads(target.read_text()),report(passed))
                self.assertIn('1/1' if passed else '0/1',result[1])
                if not passed:self.assertIn('FAIL control/Moon',result[2])

    def test_native_or_admission_failure_returns_one_without_publishing_a_report(self):
        for error in (ValueError('bad reference'),KeyError('body'),TypeError('bad type'),OSError('missing'),
                subprocess.CalledProcessError(1,['unused'],stderr='native failure')):
            with self.subTest(error=error),tempfile.TemporaryDirectory() as folder:
                root=Path(folder);target=root/'build/result.json'
                result=self.invoke(root,target,error=error)
                self.assertEqual(result[0],1);self.assertFalse(target.exists())
                self.assertIn('Range validation failed',result[2])

    def test_report_filesystem_or_json_failure_returns_one(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);parent=root/'build/file';parent.parent.mkdir();parent.write_text('preserve')
            result=self.invoke(root,parent/'result.json')
            self.assertEqual(result[0],1);self.assertEqual(parent.read_text(),'preserve')
            invalid=report();invalid['value']=float('nan')
            self.assertEqual(self.invoke(root,root/'build/invalid.json',value=invalid)[0],1)

    def test_no_report_remains_supported_and_redirected_output_roots_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);self.assertEqual(self.invoke(root)[0],0)
            original=Path.resolve
            def resolve(path,*args,**kwargs):
                return root/'outside' if path==root/'build' else original(path,*args,**kwargs)
            with mock.patch.object(Path,'resolve',new=resolve):
                result=self.invoke(root,root/'build/result.json')
            self.assertEqual(result[0],1);result[4].assert_not_called()


if __name__=='__main__':unittest.main()
