"""Offline documentation-gate references, styles and CLI result contracts."""
from __future__ import annotations

import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import validate_docs as gate


class DocumentationContractTests(unittest.TestCase):
    def check(self,root,text):
        path=root/'README.md';path.write_text(text,encoding='utf-8')
        return gate.check_file(path,root)

    def test_relative_root_encoded_space_and_reference_links_resolve_offline(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'assets').mkdir();(root/'assets/a b.txt').write_text('source')
            (root/'docs').mkdir();(root/'docs/spec.md').write_text('# Spec\n')
            text='# Guide\n\n[source](assets/a%20b.txt) [root](/docs/spec.md#scope)\n'
            text+='[remote](https://example.invalid/source) [mail](mailto:reader@example.invalid) [local](#guide)\n'
            text+='[source-ref]: <assets/a b.txt>\n'
            self.assertEqual(self.check(root,text),[])

    def test_badges_are_checked_even_in_code_but_code_links_and_styles_are_ignored(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            text='# Guide\n\n```text\n#Bad\t \n[missing](absent.md)\n~~~\n```\n'
            self.assertEqual(self.check(root,text),[])
            text+='[CI](https://example.invalid/actions/workflows/missing.yml)\n'
            self.assertTrue(any('[workflow-badge]' in e for e in self.check(root,text)))
            (root/'.github/workflows').mkdir(parents=True);(root/'.github/workflows/missing.yml').write_text('name: Test\n')
            self.assertEqual(self.check(root,text),[])

    def test_declared_prose_style_failures_are_reported_with_file_and_rule(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            text='# Guide\n\n### Skipped\n#Bad\nA\tB\ntrailing \n[broken](missing.md)\n'
            errors=self.check(root,text)
            for rule in ('heading-increment','heading-space','no-hard-tabs','no-trailing-space','broken-link'):
                self.assertTrue(any('['+rule+']' in e and 'README.md:' in e for e in errors),rule)
            self.assertEqual(self.check(root,'# Guide\n\nline break  \nnext\n'),[])

    def test_tilde_fences_and_missing_language_or_close_have_distinct_results(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            self.assertEqual(self.check(root,'# Guide\n\n~~~text\n[not prose](absent.md)\n~~~\n'),[])
            errors=self.check(root,'# Guide\n\n```\ncode\n')
            self.assertTrue(any('[fenced-code-lang]' in e for e in errors))
            self.assertTrue(any('[fence-closed]' in e for e in errors))

    def test_cli_reports_success_and_failure_without_network_access(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);path=root/'README.md'
            for text,status in (('# Guide\n',0),('# Guide\n\n[broken](missing.md)\n',1)):
                path.write_text(text);out,err=io.StringIO(),io.StringIO()
                with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
                    self.assertEqual(gate.main(['--root',str(root),str(path)]),status)
                self.assertIn('OK:' if status==0 else 'ERROR:',out.getvalue() if status==0 else err.getvalue())


if __name__=='__main__':unittest.main()
