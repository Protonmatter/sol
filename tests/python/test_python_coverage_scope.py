"""Govern affected/runtime Python coverage without silent inventory omissions."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import validate_sdlc


def step(include):
    lines=['set -euo pipefail','coverage erase','PYTHONPATH=tools coverage run --branch \\',
        '  --source=services/ephemeris-server,tools \\',"  -m unittest discover -s services/ephemeris-server -p 'test_*.py' -v",
        'PYTHONPATH=tools coverage run --branch --append \\','  --source=services/ephemeris-server,tools \\',
        "  -m unittest discover -s tests/python -p 'test_*.py' -v",'coverage report \\',
        f"  --include='{include}' \\",'  --fail-under=90 --show-missing','mkdir -p coverage',
        'coverage xml -o coverage/python.xml \\',f"  --include='{include}'"]
    return '      - name: Provider, schema, and semantic contract tests\n        shell: bash\n        run: |\n'+''.join('          '+s+'\n' for s in lines)


class PythonCoverageScopeTests(unittest.TestCase):
    def fixture(self,folder):
        root=Path(folder);(root/'tools').mkdir()
        (root/'tools/owned.py').write_text('VALUE = 1\n')
        legacy=root/'tools/legacy.py';legacy.write_text('VALUE = 2\n')
        policy={'schema_version':'sol-python-coverage-scope.v1','minimum_coverage':90,'modules':['tools/owned.py'],
            'legacy_exclusions_reason':'Unchanged baseline fixture; edits require enrollment.',
            'legacy_exclusions':{'tools/legacy.py':hashlib.sha256(legacy.read_bytes()).hexdigest()}}
        text='jobs:\n  python:\n    name: Python coverage (>= 90%)\n    runs-on: ubuntu-latest\n    steps:\n'+step('tools/owned.py')
        self.write(root,policy)
        return root,policy,text

    @staticmethod
    def write(root,policy):
        (root/'tools/python_coverage_scope.json').write_text(json.dumps(policy),encoding='utf-8')

    def test_current_repository_declares_all_affected_modules_and_local_imports(self):
        checker=getattr(validate_sdlc,'validate_python_coverage_scope',None)
        self.assertTrue(callable(checker),'AC-30 needs an executable scope/inventory check')
        source=(ROOT/'.github/workflows/coverage.yml').read_text(encoding='utf-8')
        self.assertEqual(checker(ROOT,source),[])
        policy=json.loads((ROOT/'tools/python_coverage_scope.json').read_bytes())
        self.assertEqual(len(policy['modules']),56)
        self.assertIn('tools/browser_smoke.py',policy['modules'])
        self.assertIn('tools/startup_contract.py',policy['modules'])
        self.assertIn('tools/validate_web_static.py',policy['modules'])
        self.assertTrue({'tools/horizons_events.py','tools/horizons_observer_seasonal.py',
                         'tools/validate_moons.py','tools/moon_model.py',
                         'tools/validate_operational_readiness.py','tools/ephemeris_distribution.py'}<=set(policy['modules']))

    def test_new_or_changed_excluded_code_cannot_silently_escape_the_denominator(self):
        with tempfile.TemporaryDirectory() as folder:
            root,policy,text=self.fixture(folder);self.assertEqual(validate_sdlc.validate_python_coverage_scope(root,text),[])
            extra=root/'tools/new.py';extra.write_text('VALUE = 3\n')
            self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,text));extra.unlink()
            (root/'tools/legacy.py').write_text('VALUE = 4\n')
            self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,text))

    def test_local_imports_require_coverage_even_when_legacy_bytes_are_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            root,policy,text=self.fixture(folder)
            for statement in ('import legacy','import tools.legacy','from tools import legacy','from tools.legacy import VALUE'):
                with self.subTest(statement=statement):
                    (root/'tools/owned.py').write_text(statement+'\n')
                    self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,text))

    def test_package_relative_imports_cannot_reach_an_excluded_module(self):
        with tempfile.TemporaryDirectory() as folder:
            root,policy,text=self.fixture(folder);package=root/'tools/package';package.mkdir()
            (package/'__init__.py').write_text('')
            legacy=package/'legacy.py';legacy.write_text('VALUE = 3\n')
            use=package/'use.py';use.write_text('VALUE = 1\n')
            policy['modules']=sorted([*policy['modules'],'tools/package/__init__.py','tools/package/use.py'])
            policy['legacy_exclusions']['tools/package/legacy.py']=hashlib.sha256(legacy.read_bytes()).hexdigest()
            self.write(root,policy);text=text.replace(step('tools/owned.py'),step(','.join(policy['modules'])))
            self.assertEqual(validate_sdlc.validate_python_coverage_scope(root,text),[])
            for statement in ('from . import legacy','from .legacy import VALUE','from .. import legacy','from ..legacy import VALUE'):
                with self.subTest(statement=statement):
                    use.write_text(statement+'\n')
                    self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,text))

    def test_implicit_package_initialization_is_in_the_static_runtime_scope(self):
        with tempfile.TemporaryDirectory() as folder:
            root,policy,text=self.fixture(folder)
            initializer=root/'tools/__init__.py';initializer.write_text('VALUE = 3\n')
            policy['legacy_exclusions']['tools/__init__.py']=hashlib.sha256(initializer.read_bytes()).hexdigest()
            self.write(root,policy)
            self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,text))
            policy['modules']=sorted([*policy['modules'],'tools/__init__.py'])
            del policy['legacy_exclusions']['tools/__init__.py'];self.write(root,policy)
            text=text.replace(step('tools/owned.py'),step(','.join(policy['modules'])))
            self.assertEqual(validate_sdlc.validate_python_coverage_scope(root,text),[])

    def test_malformed_duplicate_missing_or_weakened_policy_is_rejected(self):
        mutations=[lambda p:p.update(minimum_coverage=89),lambda p:p.update(minimum_coverage=True),
            lambda p:p['modules'].append('tools/owned.py'),lambda p:p['modules'].append('../outside.py'),
            lambda p:p['modules'].clear(),lambda p:p['legacy_exclusions'].clear(),
            lambda p:p['legacy_exclusions'].update({'tools/legacy.py':'bad'}),
            lambda p:p.update(legacy_exclusions_reason=''),lambda p:p.update(extra=1)]
        for index,mutate in enumerate(mutations):
            with self.subTest(index=index),tempfile.TemporaryDirectory() as folder:
                root,policy,text=self.fixture(folder);mutate(policy);self.write(root,policy)
                self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,text))
        for raw in ('{"modules":[],"modules":[]}', ' '*65537):
            with tempfile.TemporaryDirectory() as folder:
                root,policy,text=self.fixture(folder);(root/'tools/python_coverage_scope.json').write_text(raw)
                self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,text))

    def test_workflow_cannot_remove_weaken_or_decouple_report_and_xml_scope(self):
        with tempfile.TemporaryDirectory() as folder:
            root,policy,text=self.fixture(folder)
            changes=[text.replace('--include=\'tools/owned.py\'','--include=\'tools/legacy.py\'',1),
                text.replace('--fail-under=90','--fail-under=89'),text.replace('coverage report \\','coverage report \\ || true'),
                text.replace('        run: |','        if: false\n        run: |'),
                text.replace('        run: |','        continue-on-error: true\n        run: |'),
                text.replace('        shell: bash','        shell: python'),text.replace('  python:\n','  python:\n    if: false\n'),
                text.replace('  python:\n','  renamed:\n'),text.replace(step('tools/owned.py'),'')]
            for index,changed in enumerate(changes):
                with self.subTest(index=index):self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,changed))

    def test_root_literal_decoy_cannot_replace_the_real_python_step(self):
        with tempfile.TemporaryDirectory() as folder:
            root,policy,text=self.fixture(folder)
            decoy='run-name: |\n'+''.join('  '+line+'\n' for line in text.splitlines())
            real=text.replace(step('tools/owned.py'),'')
            self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,decoy+real))

    def test_duplicate_job_fields_cannot_override_the_checked_steps(self):
        with tempfile.TemporaryDirectory() as folder:
            root,policy,text=self.fixture(folder)
            changed=text+'      - run: echo later step\n    steps: []\n'
            self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,changed))
            self.assertTrue(validate_sdlc.validate_python_coverage_scope(root,text+'    name: other\n'))

    def test_scope_is_enforced_by_the_full_workflow_validator(self):
        path=ROOT/'.github/workflows/coverage.yml';original=Path.read_text
        text=path.read_text(encoding='utf-8').replace('tools/horizons_events.py,','')
        def read(selected,*args,**kwargs):return text if selected==path else original(selected,*args,**kwargs)
        with mock.patch.object(Path,'read_text',new=read):
            self.assertTrue(any('Python coverage' in m for m in validate_sdlc.validate_workflows(ROOT)))


if __name__=='__main__':unittest.main()
