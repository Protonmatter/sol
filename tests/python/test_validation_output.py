"""Ownership and publication-time checks for scientific report destinations."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from validation_output import admit_report_path,write_report


class ValidationOutputTests(unittest.TestCase):
    def test_fresh_descendant_serializes_json_without_changing_the_input(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=admit_report_path(root,root/'build/nested/report.json')
            record={'passed':True,'value':1.5};write_report(root,target,record)
            self.assertEqual(json.loads(target.read_text()),record)
            self.assertEqual(record,{'passed':True,'value':1.5})
            self.assertTrue(target.read_bytes().endswith(b'\n'))

    def test_root_itself_authoritative_paths_and_existing_outputs_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for path in (root/'build',root/'coverage',root/'apps/web/result.json'):
                with self.subTest(path=path),self.assertRaises(ValueError):admit_report_path(root,path)
                self.assertFalse(path.exists())
            existing=root/'build/prior.json';existing.parent.mkdir();existing.write_text('prior')
            with self.assertRaises(ValueError):admit_report_path(root,existing)
            self.assertEqual(existing.read_text(),'prior')

    def test_a_reserved_root_that_is_a_file_is_not_a_report_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'build').write_text('preserve')
            with self.assertRaises(ValueError):admit_report_path(root,root/'build/report.json')
            self.assertEqual((root/'build').read_text(),'preserve')

    def test_nonfinite_or_unserializable_json_creates_no_report(self):
        for value in (float('nan'),float('inf'),object()):
            with self.subTest(value=value),tempfile.TemporaryDirectory() as folder:
                root=Path(folder);target=admit_report_path(root,root/'coverage/result.json')
                with self.assertRaises((ValueError,TypeError)):write_report(root,target,{'value':value})
                self.assertFalse(target.exists())

    def test_replacement_after_admission_and_during_parent_creation_is_rejected(self):
        for phase in ('before_write','after_mkdir'):
            with self.subTest(phase=phase),tempfile.TemporaryDirectory() as folder:
                root=Path(folder);target=admit_report_path(root,root/'build/nested/result.json')
                changed=phase=='before_write';original_resolve=Path.resolve;original_mkdir=Path.mkdir
                def resolve(path,*args,**kwargs):
                    if changed and path.is_relative_to(root/'build'):return root/'apps/web'/path.relative_to(root/'build')
                    return original_resolve(path,*args,**kwargs)
                def mkdir(path,*args,**kwargs):
                    nonlocal changed
                    result=original_mkdir(path,*args,**kwargs)
                    if path==target.parent:changed=True
                    return result
                with mock.patch.object(Path,'resolve',new=resolve),mock.patch.object(Path,'mkdir',new=mkdir):
                    with self.assertRaises(ValueError):write_report(root,target,{'passed':True})
                self.assertFalse(target.exists())

    def test_concurrent_leaf_creation_and_redirected_workspace_remain_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=admit_report_path(root,root/'build/report.json')
            target.parent.mkdir();target.write_text('concurrent')
            with self.assertRaises(ValueError):write_report(root,target,{'passed':True})
            self.assertEqual(target.read_text(),'concurrent')
            original=Path.resolve
            def resolve(path,*args,**kwargs):return root/'other' if path==root else original(path,*args,**kwargs)
            with mock.patch.object(Path,'resolve',new=resolve):
                with self.assertRaises(ValueError):admit_report_path(root,root/'coverage/report.json')


if __name__=='__main__':unittest.main()
