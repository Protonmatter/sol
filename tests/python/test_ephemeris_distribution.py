"""Component license/source delivery must preserve exact inputs and root terms."""
from __future__ import annotations

import hashlib
import io
import importlib
import json
import contextlib
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
distribution = importlib.import_module('ephemeris_distribution')
crate_evidence = importlib.import_module('release_crate')


class EphemerisDistributionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.web = self.root / 'apps/web'
        for name in ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'LICENSE-MIT',
                     'LICENSE-APACHE', 'package.json', 'package-lock.json']:
            shutil.copyfile(ROOT / name, self.root / name)
        component = self.root / 'crates/solar-ephemeris'
        shutil.copytree(ROOT / 'crates/solar-ephemeris', component,
            ignore=shutil.ignore_patterns('target', 'fuzz', '__pycache__'))
        shutil.copytree(ROOT / 'apps/web/licenses', self.web / 'licenses')
        (self.web / 'index.html').write_text('<!doctype html><title>Source fixture</title>', encoding='utf-8')
        for name in ['tools/rebuild_coefficients.py', 'tools/ephemeris_distribution.py',
                     'tools/build_wasm.py', 'tools/build_web.py', 'tools/validate_release_manifest.py',
                     'tools/ephemeris-data/coefficient-sources.json',
                     'tools/ephemeris-data/coefficient-sources-vsop08.json',
                     'tools/ephemeris-data/extract_coefficient_literals.mjs', 'tools/ephemeris-data/dump_elp.js']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        (self.root / 'SOURCE-INPUTS.json').write_text(json.dumps({'schema_version': 'sol-source-inputs.v1',
            'files': {p.relative_to(self.root).as_posix(): {} for p in self.root.rglob('*') if p.is_file()}}))

    def stage(self, name='staged'):
        target = self.root / name
        shutil.copytree(self.web, target)
        result = distribution.stage_distribution(self.root, self.web, target,
            release_id='test-source-1', source_sha='a' * 40)
        return target, result

    def test_complete_deterministic_source_delivery_preserves_application_terms(self):
        original = {name: (self.root / name).read_bytes() for name in ['Cargo.toml', 'LICENSE-MIT', 'LICENSE-APACHE']}
        first, a = self.stage('first')
        second, b = self.stage('second')
        self.assertEqual(a, b)
        relative = Path('licenses/solar-ephemeris/sol-source.tar.gz')
        self.assertEqual((first / relative).read_bytes(), (second / relative).read_bytes())
        with tarfile.open(first / relative, 'r:gz') as archive:
            members = archive.getmembers()
            self.assertTrue(all(m.isfile() and m.name.startswith('sol-source/') for m in members))
            names = {m.name for m in members}
            for name in ['Cargo.toml', 'LICENSE-MIT', 'LICENSE-APACHE', 'apps/web/index.html',
                         'crates/solar-ephemeris/src/lib.rs',
                         'crates/solar-ephemeris/rebuild/upstream/vsop2013.js', 'SOURCE-INPUTS.json']:
                self.assertIn('sol-source/' + name, names)
            for member in members:
                if member.name == 'sol-source/SOURCE-INPUTS.json':
                    continue
                raw = archive.extractfile(member).read()
                record = a['files'][member.name.removeprefix('sol-source/')]
                self.assertEqual(hashlib.sha256(raw).hexdigest(), record['sha256'])
                self.assertEqual(len(raw), record['bytes'])
        for name, raw in original.items():
            self.assertEqual((self.root / name).read_bytes(), raw)
        with self.assertRaisesRegex(ValueError, 'exists'):
            distribution.stage_distribution(self.root, self.web, first, release_id='test-source-1', source_sha='a'*40)

    def test_missing_or_modified_required_materials_fail_before_source_publication(self):
        path = self.web / 'licenses/solar-ephemeris/COPYING.GPL-3.0'
        original = path.read_bytes()
        for raw in [None, original[:-1]]:
            if raw is None:
                path.unlink()
            else:
                path.write_bytes(raw)
            with self.assertRaises((ValueError, FileNotFoundError)):
                self.stage('missing' if raw is None else 'changed')
            self.assertFalse(any(self.root.glob('*/licenses/solar-ephemeris/sol-source.tar.gz')))
            path.write_bytes(original)

    def test_altered_preferred_input_or_rebuild_copy_is_rejected(self):
        path = self.root / 'crates/solar-ephemeris/rebuild/upstream/top2013.js'
        path.write_bytes(path.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'source|input'):
            self.stage()
        shutil.copyfile(ROOT / 'crates/solar-ephemeris/rebuild/upstream/top2013.js', path)
        helper = self.root / 'crates/solar-ephemeris/rebuild/tools/ephemeris-data/dump_elp.js'
        helper.write_bytes(helper.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'rebuild|copy'):
            self.stage('helper')

    def test_private_and_generated_directories_are_not_source_inputs(self):
        excluded = ['.claude/local-config', 'tools/__pycache__/example.pyc', 'tools/__pycache__/example.py',
                     'crates/solar-ephemeris/target/local-output', 'apps/web/pkg/generated.wasm',
                     'services/.venv/local-config', 'apps/web/.env']
        index = self.root / 'SOURCE-INPUTS.json'
        document = json.loads(index.read_bytes())
        positive = 'tools/owned-positive.py'
        for name in [*excluded, positive]:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'owned excluded fixture')
            document['files'][name] = {}
        index.write_text(json.dumps(document))
        target, result = self.stage()
        self.assertIn(positive, result['files'])
        for name in excluded:
            self.assertNotIn(name, result['files'])
        with tarfile.open(target / 'licenses/solar-ephemeris/sol-source.tar.gz', 'r:gz') as archive:
            names = set(archive.getnames())
            self.assertIn('sol-source/' + positive, names)
            for name in excluded:
                self.assertNotIn('sol-source/' + name, names)

    def test_archive_size_bound_and_source_mutation_cannot_publish_a_receipt(self):
        with patch.object(distribution, 'MAX_SOURCE_BYTES', 32):
            with self.assertRaisesRegex(ValueError, 'bound|size'):
                self.stage('bounded')
        original = tarfile.TarFile.addfile
        changed = False
        def mutate(archive, member, stream=None):
            nonlocal changed
            if not changed:
                changed = True
                path = self.root / 'Cargo.toml'
                path.write_bytes(path.read_bytes() + b'\n# concurrent fixture change\n')
            return original(archive, member, stream)
        with patch.object(tarfile.TarFile, 'addfile', mutate):
            with self.assertRaisesRegex(ValueError, 'changed|drift'):
                self.stage('race')
        self.assertFalse((self.root / 'race/licenses/solar-ephemeris/SOURCE-MANIFEST.json').exists())

    def test_historical_web_fixture_without_component_folder_keeps_its_contract(self):
        shutil.rmtree(self.web / 'licenses')
        target = self.root / 'historical'
        target.mkdir()
        self.assertIsNone(distribution.stage_distribution(self.root, self.web, target,
            release_id='historical', source_sha='a' * 40))
        self.assertEqual(list(target.iterdir()), [])

    def test_source_delivery_uses_captured_bundle_bytes_after_live_pointer_changes(self):
        (self.web / 'data').mkdir()
        pointer = self.web / 'data/current.json'
        pointer.write_bytes(b'{"bundle_id":"newer-live-pointer"}')
        source_map = {p.relative_to(self.web).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in self.web.rglob('*') if p.is_file() and p != pointer}
        captured = {'data/current.json': b'{"bundle_id":"captured-old-bundle"}',
                    'data/bundles/captured-old-bundle/manifest.json': b'{"captured":true}'}
        target = self.root / 'captured'
        shutil.copytree(self.web, target)
        distribution.stage_distribution(self.root, self.web, target, release_id='captured', source_sha='a'*40,
            web_source_sha256=source_map, captured_data=captured)
        with tarfile.open(target / 'licenses/solar-ephemeris/sol-source.tar.gz', 'r:gz') as archive:
            for name, raw in captured.items():
                self.assertEqual(archive.extractfile('sol-source/apps/web/' + name).read(), raw)
        self.assertEqual(pointer.read_bytes(), b'{"bundle_id":"newer-live-pointer"}')

    def test_changed_captured_application_source_cannot_get_a_source_receipt(self):
        path = self.web / 'index.html'
        source_map = {'index.html': hashlib.sha256(path.read_bytes()).hexdigest()}
        path.write_bytes(b'<title>new unpublished app source</title>')
        target = self.root / 'changed-app'
        shutil.copytree(self.web, target)
        with self.assertRaisesRegex(ValueError, 'captured web source changed'):
            distribution.stage_distribution(self.root, self.web, target, release_id='changed', source_sha='a'*40,
                web_source_sha256=source_map)
        self.assertFalse((target / 'licenses/solar-ephemeris/SOURCE-MANIFEST.json').exists())

    def test_a_current_license_link_cannot_hide_missing_materials_as_a_historical_fixture(self):
        shutil.rmtree(self.web / 'licenses')
        (self.web / 'index.html').write_text('<a href="licenses/solar-ephemeris/index.html">Source</a>')
        with self.assertRaisesRegex(ValueError, 'portal is missing'):
            distribution.stage_distribution(self.root, self.web, self.root / 'missing-portal',
                release_id='missing-portal', source_sha='a'*40)

    def test_component_rebuild_workspace_is_new_bounded_and_uses_existing_tooling_only(self):
        component = self.root / 'crates/solar-ephemeris'
        modules = self.root / 'installed-node-modules'
        compiler = modules / 'typescript'
        compiler.mkdir(parents=True)
        compiler.joinpath('package.json').write_text(json.dumps({'version': '5.9.3'}))
        compiler.joinpath('fixture.js').write_text('// installed compiler fixture; never executed')
        output = component / 'build/rebuild-work'
        actual = distribution.prepare_rebuild_workspace(component, output, node_modules=modules)
        self.assertEqual(actual, output)
        self.assertEqual((output / 'node_modules/typescript/fixture.js').read_bytes(), compiler.joinpath('fixture.js').read_bytes())
        for name in ['vsop2013.js', 'elpmpp02.js', 'top2013.js', 'LICENSE']:
            self.assertEqual((output / 'upstream' / name).read_bytes(), (component / 'rebuild/upstream' / name).read_bytes())
        with self.assertRaisesRegex(ValueError, 'new and inside'):
            distribution.prepare_rebuild_workspace(component, output)
        with self.assertRaisesRegex(ValueError, 'new and inside'):
            distribution.prepare_rebuild_workspace(component, self.root / 'outside')
        compiler.joinpath('package.json').write_text(json.dumps({'version': '0.0.0'}))
        with self.assertRaisesRegex(ValueError, 'TypeScript version'):
            distribution.prepare_rebuild_workspace(component, component / 'build/wrong-tool', node_modules=modules)
        self.assertFalse((component / 'build/wrong-tool').exists())

    def test_rebuild_preparation_never_removes_a_directory_created_by_another_actor(self):
        component = self.root / 'crates/solar-ephemeris'
        output = component / 'build/raced-output'
        original = Path.mkdir
        def race(path, *args, **kwargs):
            if path == output:
                original(path, parents=True, exist_ok=False)
                (path / 'other-owner.txt').write_text('preserve this directory')
                raise FileExistsError('concurrent owned fixture creation')
            return original(path, *args, **kwargs)
        with patch.object(Path, 'mkdir', race):
            with self.assertRaises(FileExistsError):
                distribution.prepare_rebuild_workspace(component, output)
        self.assertEqual((output / 'other-owner.txt').read_text(), 'preserve this directory')

    def test_git_inventory_excludes_ignored_local_files_without_writing_the_index(self):
        subprocess.run(['git', '-C', str(self.root), 'init', '-q'], check=True, capture_output=True)
        (self.root / '.gitignore').write_text('ignored-private.txt\n')
        (self.root / 'tools/ignored-private.txt').write_text('owned ignored fixture')
        _, result = self.stage('git-source')
        self.assertNotIn('tools/ignored-private.txt', result['files'])
        self.assertFalse((self.root / '.git/index').exists())

    def test_missing_malformed_or_incomplete_captured_inventory_cannot_claim_source_delivery(self):
        index = self.root / 'SOURCE-INPUTS.json'
        original = index.read_bytes()
        cases = [None, {'schema_version': 'wrong', 'files': {}},
                 {'schema_version': 'sol-source-inputs.v1', 'files': {'../escape': {}}},
                 {'schema_version': 'sol-source-inputs.v1', 'files': {}}]
        for number, value in enumerate(cases):
            if value is None:
                index.unlink()
            else:
                index.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'source|inventory'):
                self.stage('bad-index-' + str(number))
            index.write_bytes(original)

    def test_preparation_cli_returns_clear_success_and_preserves_failed_output_boundaries(self):
        component = self.root / 'crates/solar-ephemeris'
        arguments = ['ephemeris_distribution.py', '--prepare-rebuild', str(component),
            '--out-dir', str(component / 'build/cli-work')]
        with patch.object(sys, 'argv', arguments), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(distribution.main(), 0)
            self.assertEqual(json.loads(output.getvalue())['status'], 'prepared')
            self.assertIs(json.loads(output.getvalue())['dependencies_installed'], False)
        with patch.object(sys, 'argv', arguments), contextlib.redirect_stderr(io.StringIO()) as error:
            with self.assertRaises(SystemExit) as result:
                distribution.main()
            self.assertEqual(result.exception.code, 1)
            self.assertIn('new and inside', error.getvalue())
        self.assertTrue((component / 'build/cli-work/tools/rebuild_coefficients.py').is_file())

    def test_reported_symbolic_compiler_directory_cannot_be_copied(self):
        component = self.root / 'crates/solar-ephemeris'
        modules = self.root / 'compiler-fixture'
        compiler = modules / 'typescript'
        compiler.mkdir(parents=True)
        compiler.joinpath('package.json').write_text(json.dumps({'version': '5.9.3'}))
        original = Path.is_symlink
        with patch.object(Path, 'is_symlink', lambda path: path == compiler or original(path)):
            with self.assertRaisesRegex(ValueError, 'symlink compiler'):
                distribution.prepare_rebuild_workspace(component, component / 'build/linked-compiler', node_modules=modules)
        self.assertFalse((component / 'build/linked-compiler').exists())

    def test_license_scope_and_upstream_attribution_are_not_satisfied_by_presence_alone(self):
        component = self.root / 'crates/solar-ephemeris'
        paths = [self.root / 'Cargo.toml', component / 'COPYING.GPL-3.0',
                 component / 'NOTICE-EPHEMERIS.md', component / 'rebuild/upstream/README.original.txt']
        for path in paths:
            original = path.read_bytes()
            changed = original.replace(b'MIT OR Apache-2.0', b'GPL-3.0-only') if path.name == 'Cargo.toml' else original[:-1]
            if path.name == 'NOTICE-EPHEMERIS.md':
                changed = b''
            path.write_bytes(changed)
            with self.subTest(path=path.name), self.assertRaises(ValueError):
                distribution.validate_component(self.root)
            path.write_bytes(original)

    def test_declared_preferred_member_inventories_cannot_escape_the_current_profile(self):
        component = self.root / 'crates/solar-ephemeris'
        manifest_path = component / 'COEFFICIENT-SOURCES.json'
        canonical = self.root / 'tools/ephemeris-data/coefficient-sources.json'
        original = manifest_path.read_bytes()
        for family in ['inputs', 'outputs']:
            data = json.loads(original)
            data[family]['../unowned-file'] = {'bytes': 0, 'sha256': '0'*64}
            for path in [manifest_path, canonical]:
                path.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'inventory'):
                distribution.validate_component(self.root)
            for path in [manifest_path, canonical]:
                path.write_bytes(original)

    def test_unsafe_captured_paths_and_case_collisions_cannot_emit_source_materials(self):
        for index, options in enumerate([
            {'web_source_sha256': {'../outside': '0'*64}},
            {'captured_data': {'data/../../outside': b'owned invalid fixture'}},
            {'captured_data': {'data/not-bytes': 'invalid'}},
            {'captured_data': {'index.html': b'invalid role'}},
        ]):
            target = self.root / ('unsafe-' + str(index))
            shutil.copytree(self.web, target)
            with self.assertRaises(ValueError):
                distribution.stage_distribution(self.root, self.web, target, release_id='unsafe', source_sha='a'*40, **options)
            self.assertFalse((target / 'licenses/solar-ephemeris/SOURCE-MANIFEST.json').exists())
        index = self.root / 'SOURCE-INPUTS.json'
        document = json.loads(index.read_bytes())
        for name in ['tools/CASE-fixture.py', 'tools/case-fixture.py']:
            (self.root / name).write_text('# portable collision fixture')
            document['files'][name] = {}
        index.write_text(json.dumps(document))
        with self.assertRaisesRegex(ValueError, 'collision'):
            self.stage('case-collision')

    def test_late_source_changes_and_owned_copy_failures_leave_no_published_result(self):
        original = tarfile.TarFile.addfile
        def mutate_late(archive, member, stream=None):
            result = original(archive, member, stream)
            if member.name == 'sol-source/SOURCE-INPUTS.json':
                path = self.root / 'Cargo.toml'
                path.write_bytes(path.read_bytes() + b'\n# late source fixture\n')
            return result
        with patch.object(tarfile.TarFile, 'addfile', mutate_late):
            with self.assertRaisesRegex(ValueError, 'drift'):
                self.stage('late-source')
        self.assertFalse((self.root / 'late-source/licenses/solar-ephemeris/sol-source.tar.gz').exists())
        component = self.root / 'crates/solar-ephemeris'
        output = component / 'build/failed-copy'
        write = Path.write_bytes
        def fail_owned(path, raw):
            if path.is_relative_to(output):
                raise OSError('owned copy failure fixture')
            return write(path, raw)
        with patch.object(Path, 'write_bytes', fail_owned), self.assertRaises(OSError):
            distribution.prepare_rebuild_workspace(component, output)
        self.assertFalse(output.exists())

    def test_unavailable_git_and_resource_bounds_fail_without_a_source_receipt(self):
        with patch.object(distribution, 'MAX_SOURCE_FILES', 3):
            with self.assertRaisesRegex(ValueError, 'count exceeds bound'):
                self.stage('file-count')
        subprocess.run(['git', '-C', str(self.root), 'init', '-q'], check=True, capture_output=True)
        with patch.object(subprocess, 'check_output', side_effect=OSError('owned missing Git fixture')):
            with self.assertRaisesRegex(ValueError, 'inventory unavailable'):
                self.stage('missing-git')
        path = self.root / 'grow-after-stat.txt'
        path.write_bytes(b'x')
        read = Path.read_bytes
        def grow(candidate):
            if candidate == path:
                candidate.write_bytes(b'xx')
            return read(candidate)
        with patch.object(Path, 'read_bytes', grow), self.assertRaisesRegex(ValueError, 'size bound'):
            distribution._read(path, limit=1)

    def test_required_material_cannot_change_before_first_capture_and_become_its_baseline(self):
        records = distribution._records
        changed = False
        def mutate_before_capture(paths):
            nonlocal changed
            if not changed:
                changed = True
                path = self.root / 'crates/solar-ephemeris/COPYING.GPL-3.0'
                path.write_bytes(path.read_bytes() + b'\ninvalid changed license fixture\n')
            return records(paths)
        with patch.object(distribution, '_records', mutate_before_capture):
            with self.assertRaisesRegex(ValueError, 'source|license|changed'):
                self.stage('before-capture')
        self.assertFalse((self.root / 'before-capture/licenses/solar-ephemeris/SOURCE-MANIFEST.json').exists())

    def test_staged_notice_change_after_source_emission_prevents_publication(self):
        target = self.root / 'changed-staged-copy'
        shutil.copytree(self.web, target)
        original = tarfile.TarFile.addfile
        def change_staged(archive, member, stream=None):
            result = original(archive, member, stream)
            if member.name == 'sol-source/SOURCE-INPUTS.json':
                path = target / 'licenses/solar-ephemeris/COPYING.GPL-3.0'
                path.write_bytes(path.read_bytes() + b'\nchanged staged copy fixture\n')
            return result
        with patch.object(tarfile.TarFile, 'addfile', change_staged):
            with self.assertRaisesRegex(ValueError, 'copy|source|validation'):
                distribution.stage_distribution(self.root, self.web, target, release_id='changed', source_sha='a'*40)
        self.assertFalse((target / 'licenses/solar-ephemeris/SOURCE-MANIFEST.json').exists())

    def test_pinned_preferred_sources_survive_git_clean_filters(self):
        manifest = json.loads((ROOT / 'tools/ephemeris-data/coefficient-sources.json').read_bytes())
        # Source archives have no .git directory. Exercise Git's filters in an
        # owned repository instead of accidentally using the caller's checkout.
        owned = self.root / 'git-filter-check'
        subprocess.run(['git', 'init', '-q', str(owned)], check=True, capture_output=True)
        (owned / '.gitattributes').write_bytes((ROOT / '.gitattributes').read_bytes())
        for name in ['vsop2013.js', 'elpmpp02.js', 'top2013.js']:
            path = 'crates/solar-ephemeris/rebuild/upstream/' + name
            raw = (ROOT / path).read_bytes()
            self.assertIn(b'\r\n', raw)
            actual = subprocess.check_output(['git', '-C', str(owned), '-c', 'core.autocrlf=true',
                'hash-object', '--path=' + path, '--stdin'], input=raw).decode('ascii').strip()
            self.assertEqual(actual, manifest['inputs'][name]['git_blob'])
            self.assertEqual(hashlib.sha256(raw).hexdigest(), manifest['inputs'][name]['sha256'])

    def test_source_archive_keeps_offline_regeneration_series_inputs(self):
        migration = {'data/series/manifest.json': b'{"fixture":"migration source"}\n',
                     'data/series/frame-00.json': b'{"fixture":"migration frame"}\n',
                     'data/latest-state.json': b'{"fixture":"snapshot test input"}\n',
                     'data/latest-observations.json': b'{"fixture":"observation test input"}\n',
                     'data/feed-status.json': b'{"fixture":"status test input"}\n'}
        selected = {'data/bundles/selected/series/frame-00.json': b'{"fixture":"selected frame"}\n'}
        for name, raw in migration.items():
            path = self.web / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
        index = self.root / 'SOURCE-INPUTS.json'
        inventory = json.loads(index.read_bytes())
        inventory['files'].update({'apps/web/'+name: {} for name in migration})
        index.write_text(json.dumps(inventory), encoding='utf-8')
        web_sources = {path.relative_to(self.web).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                       for path in self.web.rglob('*') if path.is_file() and path.relative_to(self.web).as_posix() not in migration}
        for label, captured in [('bundle', selected), ('alias', {**selected, 'data/series/frame-00.json': b'captured alias\n'})]:
            target = self.root / ('migration-'+label)
            shutil.copytree(self.web, target)
            result = distribution.stage_distribution(self.root, self.web, target,
                release_id='migration-'+label, source_sha='a'*40,
                web_source_sha256=web_sources, captured_data=captured)
            with tarfile.open(target / distribution.PORTAL / 'sol-source.tar.gz', 'r:gz') as archive:
                for name, raw in {**migration, **captured}.items():
                    member = 'sol-source/apps/web/'+name
                    self.assertEqual(archive.extractfile(member).read(), raw)
                    self.assertEqual(result['files']['apps/web/'+name]['sha256'], hashlib.sha256(raw).hexdigest())

    def package_fixture(self, *, declared_license='LGPL-3.0-only', omit=None):
        source = self.root / 'crates/solar-ephemeris'
        files = {}
        for path in source.rglob('*'):
            if path.is_file():
                name = path.relative_to(source).as_posix()
                files['Cargo.toml.orig' if name == 'Cargo.toml' else name] = path.read_bytes()
        files['Cargo.toml'] = ('[package]\nname="solar-ephemeris"\nversion="0.2.0"\nlicense="' + declared_license + '"\n').encode()
        files['Cargo.lock'] = b'version = 4\n'
        files['.cargo_vcs_info.json'] = json.dumps({'git': {'sha1': 'a'*40, 'dirty': False},
            'path_in_vcs': 'crates/solar-ephemeris'}).encode()
        if omit:
            del files[omit]
        package = self.root / 'solar-ephemeris-0.2.0.crate'
        with tarfile.open(package, 'w:gz') as archive:
            for name, raw in files.items():
                member = tarfile.TarInfo('solar-ephemeris-0.2.0/' + name)
                member.size = len(raw)
                archive.addfile(member, io.BytesIO(raw))
        identities = {path.relative_to(self.root).as_posix(): hashlib.sha1(
            b'blob ' + str(len(path.read_bytes())).encode() + b'\0' + path.read_bytes()).hexdigest()
            for path in self.root.rglob('*') if path.is_file() and path != package}
        log = self.root / 'dry-run.log'
        log.write_text('Controlled successful dry-run fixture; no real publication.')
        return package, log, identities

    def test_current_component_package_requires_its_complete_notices_and_sources(self):
        package, log, identities = self.package_fixture()
        with patch.object(crate_evidence, '_committed_source_ids', return_value=identities):
            good = crate_evidence.package_evidence(package, self.root, 'a'*40, log, dry_run_exit=0)
        self.assertEqual(good['publication'], 'held')
        package, log, identities = self.package_fixture(omit='COPYING.GPL-3.0')
        with patch.object(crate_evidence, '_committed_source_ids', return_value=identities):
            with self.assertRaisesRegex(ValueError, 'component|license|notice|source material'):
                crate_evidence.package_evidence(package, self.root, 'a'*40, log, dry_run_exit=0)

    def test_package_cannot_relabel_the_lgpl_component_with_permissive_metadata(self):
        package, log, identities = self.package_fixture(declared_license='MIT OR Apache-2.0')
        with patch.object(crate_evidence, '_committed_source_ids', return_value=identities):
            with self.assertRaisesRegex(ValueError, 'license'):
                crate_evidence.package_evidence(package, self.root, 'a'*40, log, dry_run_exit=0)


if __name__ == '__main__':
    unittest.main()
