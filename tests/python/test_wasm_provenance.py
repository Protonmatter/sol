"""Source/binary receipts prevent accidental stale WASM packaging; no compiler attestation."""
from __future__ import annotations

import copy
import hashlib
import importlib
import json
from pathlib import Path
import sys
import tempfile
import tomllib
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
try:
    provenance = importlib.import_module('wasm_provenance')
except ModuleNotFoundError:
    provenance = None


class WasmProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(provenance, 'WASM source receipt guard is required')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'tools/build_wasm.py', 'tools/wasm_provenance.py',
                     'crates/solar-core/Cargo.toml', 'crates/solar-core/src/lib.rs',
                     'crates/solar-wasm/Cargo.toml', 'crates/solar-wasm/src/lib.rs',
                     'crates/solar-ephemeris/Cargo.toml', 'crates/solar-ephemeris/src/lib.rs',
                     'crates/solar-ephemeris/data/coefficients.bin']:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(('fixture material: ' + name).encode())
        self.wasm = self.root / 'output'
        self.wasm.mkdir()
        for name in ['solar_wasm.wasm', 'solar_ephemeris.wasm']:
            (self.wasm / name).write_bytes(b'\0asm\1\0\0\0' + name.encode())

    def write(self):
        return provenance.write_receipt(self.root, self.wasm)

    def replace_receipt(self, document):
        (self.wasm / provenance.RECEIPT_NAME).write_text(json.dumps(document), encoding='utf-8')

    def test_browser_profile_scopes_abort_and_speed_without_changing_native_optimization(self):
        profiles = tomllib.loads((ROOT / 'Cargo.toml').read_text())['profile']
        native = profiles['release']
        self.assertEqual(native['opt-level'], 'z')
        self.assertNotIn('panic', native)
        self.assertNotIn('package', native)
        browser = profiles['wasm-release']
        self.assertEqual(browser['inherits'], 'release')
        self.assertEqual(browser['panic'], 'abort')
        self.assertEqual(browser['package']['solar-ephemeris']['opt-level'], 3)

    def test_historical_release_receipt_remains_readable(self):
        document = self.write()
        document['profile'] = 'release'
        self.replace_receipt(document)
        self.assertEqual(provenance.read_receipt(self.wasm)[0], document)
        provenance.validate_receipt(self.root, self.wasm)

    def test_repeat_receipts_are_deterministic_and_bind_both_binaries(self):
        first = self.write()
        raw = provenance.validate_receipt(self.root, self.wasm)
        self.assertEqual(provenance.read_receipt(self.wasm), (first, raw))
        self.assertEqual(first['profile'], 'wasm-release')
        self.assertEqual(self.write(), first)
        self.assertEqual((self.wasm / provenance.RECEIPT_NAME).read_bytes(), raw)
        self.assertEqual(set(first['wasm_sha256']), {'solar_wasm.wasm', 'solar_ephemeris.wasm'})
        self.assertIn('crates/solar-ephemeris/data/coefficients.bin', first['source_inputs'])

    def test_missing_receipt_rejects_header_valid_old_outputs(self):
        with self.assertRaises((ValueError, OSError)):
            provenance.validate_receipt(self.root, self.wasm)

    def test_changes_to_source_coefficients_lockfile_or_build_tool_reject(self):
        self.write()
        for name in ['Cargo.lock', 'rust-toolchain.toml', 'tools/build_wasm.py', 'tools/wasm_provenance.py',
                     'crates/solar-core/src/lib.rs', 'crates/solar-ephemeris/data/coefficients.bin']:
            with self.subTest(name=name):
                p = self.root / name
                before = p.read_bytes()
                p.write_bytes(before + b'changed')
                with self.assertRaisesRegex(ValueError, 'source'):
                    provenance.validate_receipt(self.root, self.wasm)
                p.write_bytes(before)

    def test_missing_or_added_crate_material_rejects_old_receipt(self):
        self.write()
        added = self.root / 'crates/solar-core/src/new.rs'
        added.write_bytes(b'new material')
        with self.assertRaisesRegex(ValueError, 'source'):
            provenance.validate_receipt(self.root, self.wasm)
        added.unlink()
        p = self.root / 'crates/solar-core/src/lib.rs'
        p.unlink()
        with self.assertRaises((ValueError, OSError)):
            provenance.validate_receipt(self.root, self.wasm)

    def test_generated_private_and_fuzz_material_is_not_a_source_input(self):
        first = self.write()
        for name in ['crates/solar-ephemeris/build/result.csv', 'crates/solar-core/target/result',
                     'crates/solar-ephemeris/fuzz/target/result', 'crates/solar-core/.private/local',
                     'crates/solar-core/__pycache__/local.pyc']:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'excluded generated fixture')
        self.assertEqual(provenance.capture_source_inputs(self.root), first['source_inputs'])
        provenance.validate_receipt(self.root, self.wasm)

    def test_changed_binary_is_rejected_even_with_valid_header(self):
        self.write()
        p = self.wasm / 'solar_ephemeris.wasm'
        p.write_bytes(p.read_bytes() + b'changed binary')
        with self.assertRaisesRegex(ValueError, 'WASM'):
            provenance.validate_receipt(self.root, self.wasm)

    def test_invalid_wasm_header_cannot_receive_a_receipt(self):
        (self.wasm / 'solar_wasm.wasm').write_bytes(b'not WASM')
        with self.assertRaisesRegex(ValueError, 'WASM'):
            self.write()
        self.assertFalse((self.wasm / provenance.RECEIPT_NAME).exists())

    def test_oversized_receipt_is_not_published_and_prior_bytes_are_preserved(self):
        self.write()
        path = self.wasm / provenance.RECEIPT_NAME
        before = path.read_bytes()
        with patch.object(provenance, 'MAX_RECEIPT_BYTES', 64):
            with self.assertRaisesRegex(ValueError, 'limit before publication'):
                self.write()
        self.assertEqual(path.read_bytes(), before)
        self.assertFalse(list(self.wasm.glob('.wasm-build-*')))

    def test_source_drift_during_build_is_rejected_before_receipt_publication(self):
        before = provenance.capture_source_inputs(self.root)
        (self.root / 'crates/solar-core/src/lib.rs').write_bytes(b'changed during compiler call')
        with self.assertRaisesRegex(ValueError, 'source'):
            provenance.write_receipt(self.root, self.wasm, expected_inputs=before)
        self.assertFalse((self.wasm / provenance.RECEIPT_NAME).exists())

    def test_malformed_documents_and_fields_fail_closed(self):
        original = self.write()
        mutations = [('schema_version', 'other'), ('target', 'other'), ('profile', 'debug'), ('profile', []), ('locked', 1),
                     ('source_inputs', {}), ('source_inputs_sha256', '0' * 64), ('wasm_sha256', {}),
                     ('source_inputs', {'../escape': 'a' * 64}), ('source_inputs', {'/absolute': 'a' * 64}),
                     ('source_inputs', {'crates/../escape': 'a' * 64}), ('source_inputs', {'crates/a': 'bad'}),
                     ('source_inputs', {'crates/A.rs': 'a' * 64, 'crates/a.rs': 'b' * 64})]
        for key, value in mutations:
            with self.subTest(key=key, value=value):
                document = copy.deepcopy(original)
                document[key] = value
                self.replace_receipt(document)
                with self.assertRaises((ValueError, OSError)):
                    provenance.read_receipt(self.wasm)
        for raw in [b'[]', b'not JSON', b'{"schema_version":1,"schema_version":2}', b'{"x":NaN}']:
            (self.wasm / provenance.RECEIPT_NAME).write_bytes(raw)
            with self.assertRaises(ValueError):
                provenance.read_receipt(self.wasm)

    def test_receipt_and_material_limits_are_bounded(self):
        self.write()
        p = self.wasm / provenance.RECEIPT_NAME
        with patch.object(provenance, 'MAX_RECEIPT_BYTES', 4):
            with self.assertRaisesRegex(ValueError, 'limit'):
                provenance.read_receipt(self.wasm)
        with patch.object(provenance, 'MAX_SOURCE_FILES', 1):
            with self.assertRaisesRegex(ValueError, 'limit'):
                provenance.capture_source_inputs(self.root)
        with patch.object(provenance, 'MAX_SOURCE_BYTES', 1):
            with self.assertRaisesRegex(ValueError, 'limit'):
                provenance.capture_source_inputs(self.root)
        with patch.object(provenance, 'MAX_WASM_BYTES', 1):
            with self.assertRaisesRegex(ValueError, 'WASM'):
                provenance.read_receipt(self.wasm)

    def test_path_digest_checks_are_reached_with_complete_essential_inputs(self):
        original = self.write()
        for added in [{'../escape': 'a' * 64}, {'/absolute': 'a' * 64}, {'crates/../escape': 'a' * 64},
                      {'crates\\escape': 'a' * 64}, {'': 'a' * 64}, {'crates/a.rs': 'bad'},
                      {'crates/a.rs': None}, {'crates/A.rs': 'a' * 64, 'crates/a.rs': 'b' * 64}]:
            with self.subTest(added=added):
                document = copy.deepcopy(original)
                document['source_inputs'].update(added)
                canonical = (json.dumps(document['source_inputs'], sort_keys=True, separators=(',', ':')) + '\n').encode()
                document['source_inputs_sha256'] = hashlib.sha256(canonical).hexdigest()
                self.replace_receipt(document)
                with self.assertRaisesRegex(ValueError, 'path or digest'):
                    provenance.read_receipt(self.wasm)

    def test_essential_crate_material_and_archived_inventory_shape_are_required(self):
        document = self.write()
        for files in [None, []]:
            with self.assertRaisesRegex(ValueError, 'archived source'):
                provenance.validate_archived_sources(document, files)
        (self.root / 'crates/solar-core/Cargo.toml').unlink()
        with self.assertRaisesRegex(ValueError, 'essential'):
            provenance.capture_source_inputs(self.root)

    def test_symlink_source_and_receipt_paths_are_refused(self):
        self.write()
        source = self.root / 'crates/solar-core/src/lib.rs'
        receipt = self.wasm / provenance.RECEIPT_NAME
        original = Path.is_symlink
        for target in [source, receipt]:
            with self.subTest(target=target), patch.object(Path, 'is_symlink', lambda p: p == target or original(p)):
                with self.assertRaisesRegex(ValueError, 'symlink'):
                    provenance.validate_receipt(self.root, self.wasm)

    def test_atomic_receipt_write_preserves_prior_bytes_on_replace_failure(self):
        self.write()
        p = self.wasm / provenance.RECEIPT_NAME
        before = p.read_bytes()
        with patch.object(provenance.os, 'replace', side_effect=OSError('controlled replace failure')):
            with self.assertRaisesRegex(OSError, 'controlled replace failure'):
                self.write()
        self.assertEqual(p.read_bytes(), before)
        self.assertEqual(sorted(x.name for x in self.wasm.iterdir()), ['solar_ephemeris.wasm', 'solar_wasm.wasm', provenance.RECEIPT_NAME])

    def test_archived_source_bindings_must_cover_each_receipt_input(self):
        doc = self.write()
        files = {name: {'sha256': digest} for name, digest in doc['source_inputs'].items()}
        provenance.validate_archived_sources(doc, files)
        for mutation in ['missing', 'changed']:
            changed = copy.deepcopy(files)
            name = next(iter(changed))
            if mutation == 'missing':
                del changed[name]
            else:
                changed[name]['sha256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'source'):
                provenance.validate_archived_sources(doc, changed)


if __name__ == '__main__':
    unittest.main()
