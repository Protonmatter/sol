"""Offline coefficient serialization, source binding and static extraction checks."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import rebuild_coefficients as recovery


def minimal_vsop():
    return {body: {'GM': 1.0, 'coeffs': {key: [[0.25, -0.5, [1, -2]]]
            for key in ('a', 'L', 'k', 'h', 'q', 'p')}}
            for body in ('mer', 'ven', 'emb', 'mar', 'jup', 'sat', 'ura', 'nep')}


def minimal_top():
    result = {body: {'coeffs': [[[2, 0.25, -0.5, 12.0]]] * 6}
              for body in ('jup', 'sat', 'ura', 'nep')}
    result['freq'] = [1.0, 2.0, 3.0, 4.0, 5.0]
    return result


def minimal_elp():
    return {'w0': [1.0] * 5, 'CMPB': [[2.0]] * 3,
            'FMPB': [[[3.0] * 5]] * 3, 'CPER': [[] for _ in range(3)],
            'FPER': [[] for _ in range(3)]}


class CoefficientPackingTests(unittest.TestCase):
    def test_minimal_records_have_the_documented_little_endian_layout(self):
        vsop = recovery.pack_vsop2013(minimal_vsop())
        term = struct.pack('<IIddIBh', 1, 1, 0.25, -0.5, 1, 1, -2)
        self.assertEqual(vsop, struct.pack('<I', 8) + (struct.pack('<d', 1.0) + term * 6) * 8)
        top = recovery.pack_top2013(minimal_top())
        element = struct.pack('<IIidd', 1, 1, 2, 0.25, -0.5)
        self.assertEqual(top, struct.pack('<I', 4) + b''.join(
            struct.pack('<d', rate) + element * 6 for rate in (1.0, 2.0, 3.0, 4.0)))
        elp = recovery.pack_elpmpp02(minimal_elp())
        self.assertEqual(elp, struct.pack('<5d', *([1.0] * 5)) +
                         struct.pack('<I6d', 1, 2.0, *([3.0] * 5)) * 3 + b'\0' * 48)

    def test_nonfinite_boolean_and_malformed_vsop_terms_fail(self):
        for terms in [[float('nan'), 1.0, []], [10**1000, 1.0, []], [0.0, True, []], [0.0, 1.0],
                      [0.0, 1.0, [1]], [0.0, 1.0, [0, 1]],
                      [0.0, 1.0, [18, 1]], [0.0, 1.0, [1, 32768]],
                      [0.0, 1.0, [1, 0.5]]]:
            data = minimal_vsop(); data['mer']['coeffs']['a'] = [terms]
            with self.subTest(terms=terms), self.assertRaises(ValueError):
                recovery.pack_vsop2013(data)

    def test_top_and_lunar_shape_or_numeric_errors_fail(self):
        for term in [[0.5, 1.0, 2.0, 3.0], [2**31, 1.0, 2.0, 3.0],
                     [0, float('inf'), 2.0, 3.0], [0, 1.0, 2.0]]:
            data = minimal_top(); data['jup']['coeffs'] = [[[term[i] for i in range(len(term))]]] * 6
            with self.subTest(term=term), self.assertRaises(ValueError):
                recovery.pack_top2013(data)
        mutations = [lambda d: d.__setitem__('w0', [1.0] * 4),
                     lambda d: d['FMPB'].__setitem__(0, [[1.0] * 4]),
                     lambda d: d['CMPB'].__setitem__(0, [float('nan')]),
                     lambda d: d['FPER'].__setitem__(0, [[[]]]),
                     lambda d: d['CPER'].__setitem__(0, [[]] * 5)]
        for index, mutate in enumerate(mutations):
            data = copy.deepcopy(minimal_elp()); mutate(data)
            with self.subTest(index=index), self.assertRaises(ValueError):
                recovery.pack_elpmpp02(data)

    def test_rebuild_refuses_missing_or_changed_upstream_before_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch.object(recovery.subprocess, 'run') as run, self.assertRaises(ValueError):
                recovery.rebuild(Path(folder), ROOT / 'build/coefficient-test-unused')
            run.assert_not_called()

    def test_output_cannot_replace_existing_or_production_data(self):
        for output in [ROOT / 'crates/solar-ephemeris/data', ROOT / 'apps/web/pkg', ROOT / 'build']:
            with self.subTest(output=output), self.assertRaises(ValueError):
                recovery.output_path(output)

    def test_build_root_is_rejected_even_before_it_exists(self):
        with tempfile.TemporaryDirectory() as folder:
            project = Path(folder)
            build = project / 'build'
            self.assertFalse(build.exists())
            with mock.patch.object(recovery, 'ROOT', project), self.assertRaises(ValueError):
                recovery.output_path(build)
            self.assertFalse(build.exists())

    def test_new_child_of_missing_build_root_is_admitted_without_writes(self):
        with tempfile.TemporaryDirectory() as folder:
            project = Path(folder)
            output = project / 'build' / 'owned-reconstruction'
            with mock.patch.object(recovery, 'ROOT', project):
                self.assertEqual(recovery.output_path(output), output.resolve())
            self.assertFalse((project / 'build').exists())

    def test_redirected_build_root_cannot_target_production(self):
        # Model a Windows junction even where creating links requires privileges.
        original_resolve = Path.resolve
        build_root = original_resolve(ROOT / 'build')
        production = ROOT / 'crates/solar-ephemeris/data'
        def redirect(path):
            resolved = original_resolve(path)
            return production / resolved.relative_to(build_root) if resolved.is_relative_to(build_root) else resolved
        with mock.patch.object(Path, 'resolve', redirect), self.assertRaises(ValueError):
            recovery.output_path(ROOT / 'build/coefficient-test-unused')

    def test_source_manifest_pins_the_shipped_tables_and_real_upstream_files(self):
        manifest = json.loads((ROOT / 'tools/ephemeris-data/coefficient-sources.json').read_text())
        self.assertEqual(manifest['upstream_revision'], '2f679a1f698b4f20f9579d94da24af51559458ed')
        self.assertEqual(set(manifest['inputs']), {'vsop2013.js', 'elpmpp02.js', 'top2013.js', 'LICENSE'})
        for name, record in manifest['outputs'].items():
            raw = (ROOT / 'crates/solar-ephemeris/data' / name).read_bytes()
            self.assertEqual(len(raw), record['bytes'])
            self.assertEqual(hashlib.sha256(raw).hexdigest(), record['sha256'])

    def test_explicit_profiles_keep_legacy_reconstruction_and_pinned_mixed_tiers_separate(self):
        _, legacy = recovery._load_manifest('legacy-normal')
        _, candidate = recovery._load_manifest('vsop08')
        self.assertEqual(legacy['schema_version'], 'coefficient-sources.v1')
        self.assertEqual(legacy['tier'], '06-normal')
        self.assertEqual(legacy['outputs']['vsop2013.bin']['bytes'], 84449)
        self.assertEqual(candidate['schema_version'], 'coefficient-sources.v2')
        self.assertEqual(candidate['tier_by_family'], {'vsop2013':'08-big','elpmpp02':'06-normal','top2013':'06-normal'})
        self.assertEqual(candidate['inputs']['vsop2013.js']['bytes'], 2672670)
        self.assertEqual(candidate['outputs']['vsop2013.bin']['bytes'], 729349)
        for name in ('elpmpp02.bin','top2013.bin'):
            self.assertEqual(candidate['outputs'][name], legacy['outputs'][name])
        with self.assertRaises(ValueError): recovery._load_manifest('unregistered')

    def test_current_profile_pins_top08_without_relabelling_older_profiles(self):
        _, current = recovery._load_manifest('current')
        self.assertEqual(current['tier_by_family'],
                         {'vsop2013':'08-big', 'elpmpp02':'06-normal', 'top2013':'08-big'})
        self.assertEqual(current['inputs']['top2013.js'], {
            'path':'src/top2013/dist/08-big/src/top2013.js', 'bytes':2370905,
            'git_blob':'e44c705f4f569db31211c6fead7bf3a56c050c6c',
            'sha256':'c75e7f713d7e5b1bea1278efeb62b06236098754c6db49717700ae61b6f5ab15'})
        self.assertEqual(current['outputs']['top2013.bin'], {
            'bytes':438360,
            'sha256':'d2118a80954b5443d9debf14aece0c9e185af1feb2b31c670ac8d9d0849236e8'})
        _, previous = recovery._load_manifest('vsop08')
        self.assertEqual(previous['tier_by_family']['top2013'], '06-normal')
        self.assertEqual(previous['outputs']['top2013.bin']['bytes'], 59520)

    def test_only_exact_pinned_large_top_source_is_admitted(self):
        source = ROOT / 'crates/solar-ephemeris/rebuild/upstream/top2013.js'
        raw = source.read_bytes()
        self.assertEqual(len(raw), 2370905)
        self.assertEqual(hashlib.sha256(raw).hexdigest(),
                         'c75e7f713d7e5b1bea1278efeb62b06236098754c6db49717700ae61b6f5ab15')
        extractor = ROOT / 'tools/ephemeris-data/extract_coefficient_literals.mjs'
        result = subprocess.run(['node', str(extractor), 'top2013', str(source)],
                                capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8'))
        packed = recovery.pack_top2013(json.loads(result.stdout))
        self.assertEqual(hashlib.sha256(packed).hexdigest(),
                         'd2118a80954b5443d9debf14aece0c9e185af1feb2b31c670ac8d9d0849236e8')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'changed.js'
            path.write_bytes(b' ' + raw[1:])
            rejected = subprocess.run(['node', str(extractor), 'top2013', str(path)],
                                      capture_output=True, timeout=30)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn(b'Unsupported or oversized', rejected.stderr)
            self.assertEqual(rejected.stdout, b'')

    def test_mixed_profile_cannot_expand_other_families_or_mislabel_the_source(self):
        original = json.loads(recovery.VSOP08_MANIFEST.read_text())
        mutations = [lambda d: d['tier_by_family'].__setitem__('elpmpp02','12-full'),
                     lambda d: d['tier_by_family'].__setitem__('vsop2013','06-normal'),
                     lambda d: d['inputs']['elpmpp02.js'].__setitem__('bytes',1048577),
                     lambda d: d['inputs']['vsop2013.js'].__setitem__('bytes',3145729),
                     lambda d: d['inputs']['vsop2013.js'].__setitem__('path','src/vsop2013/dist/06-normal/src/vsop2013.js')]
        for mutate in mutations:
            with tempfile.TemporaryDirectory() as directory:
                data=copy.deepcopy(original); mutate(data)
                path=Path(directory)/'candidate.json';path.write_text(json.dumps(data))
                with mock.patch.object(recovery,'VSOP08_MANIFEST',path),self.assertRaises(ValueError):
                    recovery._load_manifest('vsop08')

    def test_manifest_cannot_omit_inputs_or_retarget_the_initializer(self):
        original = json.loads(recovery.MANIFEST.read_text())
        mutations = [lambda d: d['inputs'].pop('LICENSE'), lambda d: d['outputs'].pop('top2013.bin'),
                     lambda d: d['lunar_initializer'].__setitem__('path', '../outside.js'),
                     lambda d: d['inputs']['vsop2013.js'].__setitem__('bytes', 2**32),
                     lambda d: d['inputs']['vsop2013.js'].__setitem__('path', 'unrelated.js')]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as folder:
                manifest = copy.deepcopy(original); mutate(manifest)
                path = Path(folder) / 'manifest.json'; path.write_text(json.dumps(manifest))
                with mock.patch.object(recovery, 'MANIFEST', path), self.assertRaises(ValueError):
                    recovery._load_manifest()

    def test_verified_snapshots_survive_source_changes_and_destination_races(self):
        for race in (False, True):
            with self.subTest(race=race), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); (root / 'build').mkdir()
                inputs = root / 'inputs'; inputs.mkdir()
                tool_dir = root / 'tools/ephemeris-data'; tool_dir.mkdir(parents=True)
                helper = tool_dir / 'dump_elp.js'; helper.write_bytes(b'initializer\n')
                (tool_dir / 'extract_coefficient_literals.mjs').write_bytes(b'extractor\n')
                data_dir = root / 'crates/solar-ephemeris/data'; data_dir.mkdir(parents=True)
                manifest = json.loads(recovery.MANIFEST.read_text())
                for name, record in manifest['inputs'].items():
                    raw = name.encode(); (inputs / name).write_bytes(raw)
                    record.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                                  git_blob=hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest())
                manifest['lunar_initializer']['sha256_lf'] = hashlib.sha256(helper.read_bytes()).hexdigest()
                blobs = {'vsop2013.bin': recovery.pack_vsop2013(minimal_vsop()),
                         'elpmpp02.bin': recovery.pack_elpmpp02(minimal_elp()),
                         'top2013.bin': recovery.pack_top2013(minimal_top())}
                for name, raw in blobs.items():
                    (data_dir / name).write_bytes(raw)
                    manifest['outputs'][name] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                target = root / 'build/result'
                def run(arguments, cwd):
                    if arguments == ['node', '--version']:
                        if race:
                            target.mkdir(); (target / 'keep.txt').write_text('existing')
                        return 'v-test'
                    if '--input-type=commonjs' in arguments:
                        self.assertIn('dump_elp.cjs', arguments[-1])
                        self.assertEqual((cwd / 'dump_elp.cjs').read_bytes(), b'initializer\n')
                        helper.write_bytes(b'changed initializer')
                        (cwd / 'elpmpp02_init.json').write_text(json.dumps(minimal_elp()))
                        return ''
                    family = arguments[2]; frozen_input = Path(arguments[3])
                    self.assertNotEqual(frozen_input.parent, inputs)
                    self.assertEqual(frozen_input.read_bytes(), (family + '.js').encode())
                    self.assertEqual(Path(arguments[1]).read_bytes(), b'extractor\n')
                    (inputs / (family + '.js')).write_bytes(b'changed after admission')
                    return json.dumps({'vsop2013': minimal_vsop(), 'elpmpp02': {'coeffs': []},
                                       'top2013': minimal_top()}[family])
                with mock.patch.object(recovery, 'ROOT', root), \
                     mock.patch.object(recovery, '_load_manifest', return_value=(json.dumps(manifest).encode(), manifest)), \
                     mock.patch.object(recovery, '_run', side_effect=run):
                    if race:
                        with self.assertRaises(FileExistsError): recovery.rebuild(inputs, target)
                        self.assertEqual(list(target.iterdir()), [target / 'keep.txt'])
                        self.assertEqual((target / 'keep.txt').read_text(), 'existing')
                    else:
                        result = recovery.rebuild(inputs, target)
                        self.assertEqual(result['status'], 'exact_byte_reconstruction_local')
                        for name, raw in blobs.items(): self.assertEqual((target / name).read_bytes(), raw)
                        self.assertTrue((target / 'report.json').is_file())
                        self.assertEqual((target / 'upstream/vsop2013.js').read_bytes(), b'vsop2013.js')


class StaticExtractionTests(unittest.TestCase):
    def extract(self, source):
        with tempfile.TemporaryDirectory() as folder:
            source_path = Path(folder) / 'input.js'; source_path.write_text(source)
            return subprocess.run(['node', str(ROOT / 'tools/ephemeris-data/extract_coefficient_literals.mjs'),
                                   'vsop2013', str(source_path)], text=True, capture_output=True, timeout=15)

    @staticmethod
    def registrations(expression='[]'):
        return '\n'.join(f'vsop2013.{body}=VSOP2K("{body}",1,{{a:{expression}}});'
                         for body in ('mer', 'ven', 'emb', 'mar', 'jup', 'sat', 'ura', 'nep', 'plu'))

    def test_static_extraction_never_executes_input_code(self):
        result = self.extract('throw Error("input code executed");\n' + self.registrations())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['mer']['coeffs'], {'a': []})

    def test_nonliteral_omitted_duplicate_or_nonfinite_input_is_rejected(self):
        sources = [self.registrations('(()=>[1])()'), self.registrations('[NaN]'), self.registrations('["1"]'),
                   self.registrations('[1e999]'), self.registrations() + self.registrations(),
                   self.registrations().replace('vsop2013.plu=', 'other.plu=')]
        for index, source in enumerate(sources):
            with self.subTest(index=index):
                self.assertNotEqual(self.extract(source).returncode, 0)

    def test_larger_unknown_input_cannot_use_the_hash_admitted_vsop_exception(self):
        result=self.extract(self.registrations()+'\n/*'+'x'*1048576+'*/')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('oversized',result.stderr.lower())


if __name__ == '__main__':
    unittest.main()
