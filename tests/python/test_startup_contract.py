"""Python-only admission binds HTML URLs and source bytes to the AST descriptor."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools'))
from startup_contract import validate_startup_contract, stamp_startup_contract

class StartupContractTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        (self.root/'js').mkdir()
        (self.root/'app.js').write_bytes(b"import './js/shared.js?v=old';\n")
        (self.root/'js/shared.js').write_bytes(b'export const value=1;\n')
        self.descriptor={'schema_version':'startup-modules.v1','roots':['app.js?v=old'],'modules':[
            {'url':name+'?v=old','path':name,'sha256':hashlib.sha256((self.root/name).read_bytes()).hexdigest()}for name in ['app.js','js/shared.js']]}
        self.markup='<meta name="sol-startup-contract" content="startup-modules.v1.json"><link rel="modulepreload" href="js/shared.js?v=old"><script type="module" src="app.js?v=old"></script>'
        self.write()
    def write(self):
        (self.root/'startup-modules.v1.json').write_text(json.dumps(self.descriptor),encoding='utf-8')
        (self.root/'index.html').write_text(self.markup,encoding='utf-8')
    def test_exact_source_and_html_pass_without_node(self):
        self.assertEqual(validate_startup_contract(self.root),self.descriptor)
    def test_repository_descriptor_survives_lf_checkout(self):
        source=Path(__file__).resolve().parents[2]/'apps/web'
        target=self.root/'lf-checkout';target.mkdir()
        descriptor=(source/'startup-modules.v1.json').read_bytes()
        value=json.loads(descriptor)
        for name in ['index.html',*[item['path']for item in value['modules']]]:
            destination=target/name;destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes((source/name).read_bytes().replace(b'\r\n',b'\n'))
        (target/'startup-modules.v1.json').write_bytes(descriptor)
        self.assertEqual(validate_startup_contract(target),value)
    def test_stale_import_edges_or_values_fail_source_hash_binding(self):
        for contents in [b"import './js/new.js';\n",b'export const value=2;\n']:
            with self.subTest(contents=contents):
                (self.root/'app.js').write_bytes(contents)
                with self.assertRaisesRegex(ValueError,'startup.*hash'):validate_startup_contract(self.root)
    def test_url_preload_root_and_duplicate_markup_drift_fail(self):
        for changed in [self.markup.replace('shared.js?v=old','shared.js?v=other'),self.markup.replace('app.js?v=old','other.js?v=old'),
                        self.markup+'<link rel="modulepreload" href="js/shared.js?v=old">',
                        self.markup.replace('href="js/shared.js?v=old"','href="js/shared.js?v=other" href="js/shared.js?v=old"'),
                        self.markup.replace('startup-modules.v1.json','other.json')]:
            with self.subTest(markup=changed):
                self.markup=changed;self.write()
                with self.assertRaisesRegex(ValueError,'startup'):validate_startup_contract(self.root)
    def test_invalid_descriptor_structure_and_escaped_paths_fail(self):
        original=copy.deepcopy(self.descriptor)
        for mutate in [lambda d:d.update(roots=[]),lambda d:d['modules'].append(d['modules'][0]),
                       lambda d:d['modules'][0].update(path='../outside.js'),lambda d:d['modules'][0].update(sha256='invalid'),
                       lambda d:d['modules'][0].update(url='https://external.test/app.js')]:
            with self.subTest(mutate=mutate):
                self.descriptor=copy.deepcopy(original);mutate(self.descriptor);self.write()
                with self.assertRaisesRegex(ValueError,'startup'):validate_startup_contract(self.root)
    def test_unbound_executable_html_cannot_bypass_startup_graph(self):
        original=self.markup
        for suffix in ["<script>void import('./js/later.js')</script>",'<script src="extra.js"></script>',
                       '<script type="module">void import("./js/later.js")</script>',
                       '<img onload="void import(\'./js/later.js\')">','<a href="javascript:void(0)">link</a>',
                       '<iframe src="java&#10;script:void(0)"></iframe>',
                       '<iframe srcdoc="&lt;script&gt;void import(\'./later.js\')&lt;/script&gt;"></iframe>',
                       '<a href="java&#9;script:void(0)">link</a>',
                       '<meta http-equiv="refresh" content="0;url=other.html">']:
            with self.subTest(suffix=suffix):
                self.markup=original+suffix;self.write()
                with self.assertRaisesRegex(ValueError,'startup'):validate_startup_contract(self.root)
    def test_stamping_uses_pinned_transformation_and_rechecks_copied_bytes(self):
        source_map={item['path']:{'source_sha256':item['sha256']}for item in self.descriptor['modules']}
        for file in [self.root/'app.js',self.root/'index.html']:file.write_bytes(file.read_bytes().replace(b'?v=old',b'?v=release'))
        expected={item['path']:hashlib.sha256((self.root/item['path']).read_bytes()).hexdigest()for item in self.descriptor['modules']}
        stamp_startup_contract(self.descriptor,self.root,lambda url:url.replace('?v=old','?v=release'),source_map,expected)
        value=validate_startup_contract(self.root);self.assertEqual(value['roots'],['app.js?v=release'])
        (self.root/'app.js').write_bytes(b'// corrupted after copy\n')
        with self.assertRaisesRegex(ValueError,'startup.*copied'):stamp_startup_contract(self.descriptor,self.root,lambda url:url.replace('?v=old','?v=release'),source_map,expected)
    def test_historical_shell_can_omit_contract_but_new_loader_cannot(self):
        (self.root/'startup-modules.v1.json').unlink();(self.root/'index.html').write_text('',encoding='utf-8')
        self.assertIsNone(validate_startup_contract(self.root))
        (self.root/'app.js').write_text("import './js/viewLoader.js';",encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'startup'):validate_startup_contract(self.root)
    def test_partial_historical_source_without_html_leaves_other_admission_gates_intact(self):
        (self.root/'startup-modules.v1.json').unlink();(self.root/'index.html').unlink()
        self.assertIsNone(validate_startup_contract(self.root))
    def test_missing_html_cannot_bypass_a_declared_contract_or_new_loader(self):
        (self.root/'index.html').unlink()
        with self.assertRaisesRegex(ValueError,'startup.*HTML'):validate_startup_contract(self.root)
        (self.root/'startup-modules.v1.json').unlink()
        (self.root/'app.js').write_text("import './js/viewLoader.js';",encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'startup.*HTML'):validate_startup_contract(self.root)

class StartupArtifactTests(unittest.TestCase):
    def setUp(self):
        from test_release_artifact import ReleaseArtifactTests
        self.fixture=ReleaseArtifactTests();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
        f=self.fixture
        self.markup='<meta name="sol-startup-contract" content="startup-modules.v1.json"><script type="module" src="app.js?v=old"></script>'
        (f.source/'index.html').write_text(self.markup,encoding='utf-8')
        self.contract={'schema_version':'startup-modules.v1','roots':['app.js?v=old'],'modules':[
            {'url':'app.js?v=old','path':'app.js','sha256':hashlib.sha256((f.source/'app.js').read_bytes()).hexdigest()}]}
        (f.source/'startup-modules.v1.json').write_text(json.dumps(self.contract),encoding='utf-8')
    def test_actual_staging_rebinds_only_deterministic_transformation(self):
        out=self.fixture.build('startup-valid');value=validate_startup_contract(out/'releases/startup-valid')
        self.assertEqual(value['roots'],['app.js?v=startup-valid'])
        self.assertNotEqual(value['modules'][0]['sha256'],self.contract['modules'][0]['sha256'])
    def test_copied_html_execution_bypass_is_rejected_before_publication(self):
        import build_web
        from unittest.mock import patch
        validate_physical=build_web.validate_physical_source
        for index,suffix in enumerate(["<script>void import('./js/later.js')</script>",
            '<iframe src="java&#10;script:void(0)"></iframe>',
            '<iframe srcdoc="&lt;script&gt;void import(\'./later.js\')&lt;/script&gt;"></iframe>']):
            def mutate(root):
                validate_physical(root)
                if root!=self.fixture.source:
                    with (root/'index.html').open('a',encoding='utf-8') as stream:stream.write(suffix)
            with self.subTest(index=index),patch.object(build_web,'validate_physical_source',side_effect=mutate):
                with self.assertRaisesRegex(ValueError,'startup'):self.fixture.build(f'startup-copy-bypass-{index}')
            self.assertFalse((self.fixture.root/f'startup-copy-bypass-{index}').exists())
