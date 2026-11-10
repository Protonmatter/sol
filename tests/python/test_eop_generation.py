"""Pinned EOP source, fixed-width admission and binary ABI correspondence."""
from __future__ import annotations

from pathlib import Path
import dataclasses
import copy
import hashlib
import json
import struct
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import generate_eop as eop


class EopGenerationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (ROOT / 'tests/fixtures/iers-eop-20261104/finals2000A.all').read_bytes()
        cls.leaps = eop.leap_steps((ROOT / 'crates/solar-ephemeris/src/timescales.rs').read_text(encoding='utf-8'))
        cls.rows, cls.tail = eop.parse_rows(cls.raw, cls.leaps)

    def test_pinned_full_source_and_published_checksum_match(self):
        manifest, rows, blob = eop.load_inputs(ROOT)
        self.assertEqual(rows, self.rows)
        self.assertEqual(len(rows), 20031)
        self.assertEqual(self.tail, 50)
        self.assertEqual((rows[0].mjd, rows[-1].mjd), (41684, 61714))
        self.assertEqual(sum(row.flags == 0 for row in rows), 19659)
        self.assertEqual(hashlib.sha256(blob).hexdigest(), manifest['binary']['sha256'])

    def test_every_serialized_knot_matches_selected_source_columns(self):
        blob = eop.serialize_rows(self.rows)
        self.assertEqual(struct.unpack_from('<8sIi', blob), (b'SOLEOP01', 20031, 41684))
        self.assertEqual(len(blob), 16 + 33 * len(self.rows))
        decoded = list(struct.iter_unpack('<ddddB', blob[16:]))
        # Read original columns independently of the parser's Row objects.
        original = self.raw.decode('ascii').splitlines()[:20031]
        for line, actual in zip(original, decoded, strict=True):
            expected = (float(line[18:27]), float(line[37:46]), float(line[58:68]),
                        float(line[68:78]), int(line[16] == 'P') | (int(line[57] == 'P') << 1))
            self.assertEqual(actual, expected)

    def test_nonfinite_malformed_domain_error_and_unknown_flags_are_rejected(self):
        base = self.raw.decode('ascii').splitlines()[:5]
        for a, b, value in [(18, 27, 'NaN'), (37, 46, 'inf'), (58, 68, '0.9junk'),
                            (58, 68, '1.2'), (68, 78, '-0.001'), (16, 17, 'X'), (57, 58, 'X')]:
            changed = base.copy(); changed[2] = changed[2][:a] + value.rjust(b-a) + changed[2][b:]
            with self.subTest(field=(a, b), value=value), self.assertRaises(ValueError):
                eop.parse_rows(('\n'.join(changed)+'\n').encode('ascii'), self.leaps)

    def test_date_epoch_duplicate_gap_and_reordered_rows_are_rejected(self):
        base = self.raw.decode('ascii').splitlines()[:6]
        changed = base.copy(); changed[1] = changed[1][:2] + '12' + changed[1][4:]
        for lines in (changed, [base[0], base[0], *base[2:]], [base[0], *base[2:]],
                      [base[1], base[0], *base[2:]]):
            with self.assertRaises(ValueError): eop.parse_rows(('\n'.join(lines)+'\n').encode(), self.leaps)

    def test_empty_tail_is_explicit_and_cannot_hide_partial_data_or_resume(self):
        lines = self.raw.decode('ascii').splitlines()
        self.assertEqual(eop.parse_rows(self.raw, self.leaps)[1], 50)
        for replacement in (lines[20031][:18] + ' 0.123456' + lines[20031][27:],
                            lines[20031][:16] + 'I' + lines[20031][17:]):
            changed = lines.copy(); changed[20031] = replacement
            with self.assertRaises(ValueError): eop.parse_rows(('\n'.join(changed)+'\n').encode(), self.leaps)
        changed = lines[:20031] + [lines[20031], lines[20030]]
        with self.assertRaises(ValueError): eop.parse_rows(('\n'.join(changed)+'\n').encode(), self.leaps)

    def test_prediction_flags_cannot_revert_to_observed(self):
        lines = self.raw.decode('ascii').splitlines()[:5]
        lines[1] = lines[1][:16] + 'P' + lines[1][17:]
        with self.assertRaises(ValueError): eop.parse_rows(('\n'.join(lines)+'\n').encode(), self.leaps)

    def test_known_leap_jump_is_required_and_unknown_jumps_are_rejected(self):
        lines = self.raw.decode('ascii').splitlines()
        index = next(i for i, line in enumerate(lines) if float(line[7:15]) == 57754)
        self.assertEqual(len(eop.parse_rows(('\n'.join(lines[index-2:index+3])+'\n').encode(), self.leaps)[0]), 5)
        changed = lines[index-2:index+3]
        value = float(changed[2][58:68]) - 1
        changed[2] = changed[2][:58] + f'{value:10.7f}' + changed[2][68:]
        with self.assertRaises(ValueError): eop.parse_rows(('\n'.join(changed)+'\n').encode(), self.leaps)
        changed = lines[:5]; changed[2] = changed[2][:58] + f'{-0.8:10.7f}' + changed[2][68:]
        with self.assertRaises(ValueError): eop.parse_rows(('\n'.join(changed)+'\n').encode(), self.leaps)

    def test_serialization_rejects_invalid_or_discontinuous_caller_rows(self):
        for changed in (dataclasses.replace(self.rows[1], dut1=float('nan')),
                        dataclasses.replace(self.rows[1], flags=4),
                        dataclasses.replace(self.rows[1], error=-1),
                        dataclasses.replace(self.rows[1], mjd=self.rows[0].mjd)):
            with self.assertRaises(ValueError): eop.serialize_rows((self.rows[0], changed, *self.rows[2:5]))

    def test_leap_source_is_complete_ordered_and_statically_parsed(self):
        self.assertEqual(len(self.leaps), 28)
        self.assertEqual(self.leaps[-1], (57754, 37))
        source = (ROOT / 'crates/solar-ephemeris/src/timescales.rs').read_text(encoding='utf-8')
        for changed in (source.replace('(2017, 1, 1, 37.0)', '(2017, 1, 1, f())'),
                        source.replace('(2017, 1, 1, 37.0)', '(2014, 1, 1, 37.0)'),
                        source.replace('28] = [', '29] = [')):
            with self.assertRaises(ValueError): eop.leap_steps(changed)

    def test_manifest_cannot_relabel_source_selection_units_or_binary_layout(self):
        original = eop._file
        for field, value in [('selection', 'Bulletin B'), ('source_url', 'https://example.invalid/eop'),
                             ('source_directory', '../outside'), ('magic', 'OTHER001'),
                             ('row', 'big-endian floats'), ('captured_at_utc', '2000-01-01T00:00:00Z')]:
            manifest = json.loads((ROOT / eop.MANIFEST).read_bytes())
            (manifest['binary'] if field in ('magic', 'row') else manifest)[field] = value
            def read(root, name, maximum):
                return json.dumps(manifest).encode() if name == eop.MANIFEST else original(root, name, maximum)
            with self.subTest(field=field), mock.patch.object(eop, '_file', side_effect=read), self.assertRaises(ValueError):
                eop.load_inputs(ROOT)

    def test_duplicate_metadata_and_modified_source_bytes_are_rejected(self):
        original = eop._file
        manifest = (ROOT / eop.MANIFEST).read_bytes()
        duplicate = manifest.replace(b'"schema_version":', b'"schema_version":"duplicate", "schema_version":', 1)
        for target, changed in [(eop.MANIFEST, duplicate),
                                (eop.DIRECTORY + '/finals2000A.all', self.raw[:-1] + b'!')]:
            def read(root, name, maximum):
                return changed if name == target else original(root, name, maximum)
            with self.subTest(target=target), mock.patch.object(eop, '_file', side_effect=read), self.assertRaises(ValueError):
                eop.load_inputs(ROOT)

    def test_rehashed_acquisition_cannot_change_plan_origin_inventory_or_digest(self):
        original = eop._file
        original_manifest = json.loads((ROOT / eop.MANIFEST).read_bytes())
        original_plan = json.loads((ROOT / eop.DIRECTORY / 'plan.json').read_bytes())
        original_acquisition = json.loads((ROOT / eop.DIRECTORY / 'acquisition.json').read_bytes())
        for mutation in ('plan-link', 'checksum-url', 'sha512', 'inventory', 'rebound-origin'):
            manifest = copy.deepcopy(original_manifest); plan = copy.deepcopy(original_plan)
            acquisition = copy.deepcopy(original_acquisition)
            if mutation == 'plan-link': acquisition['plan_sha256'] = '0' * 64
            elif mutation == 'checksum-url': acquisition['files'][0]['url'] = 'https://example.invalid/checksums.sha512'
            elif mutation == 'sha512': acquisition['files'][0]['sha512'] = '0' * 128
            elif mutation == 'inventory': acquisition['files'][0]['path'] = 'plan.json'
            elif mutation == 'rebound-origin':
                plan['origin'] = 'https://example.invalid/ser7/'
                for record in acquisition['files']:
                    record['url'] = record['url'].replace('https://maia.usno.navy.mil/ser7/', plan['origin'])
            plan_raw = (json.dumps(plan, indent=2)+'\n').encode()
            if mutation != 'plan-link': acquisition['plan_sha256'] = hashlib.sha256(plan_raw).hexdigest()
            acquisition_raw = (json.dumps(acquisition, indent=2)+'\n').encode()
            replacements = {eop.DIRECTORY + '/plan.json': plan_raw, eop.DIRECTORY + '/acquisition.json': acquisition_raw}
            for name, raw in [('plan.json', plan_raw), ('acquisition.json', acquisition_raw)]:
                manifest['files'][name] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
            replacements[eop.MANIFEST] = json.dumps(manifest).encode()
            def read(root, name, maximum): return replacements[name] if name in replacements else original(root, name, maximum)
            with self.subTest(mutation=mutation), mock.patch.object(eop, '_file', side_effect=read), self.assertRaises(ValueError):
                eop.load_inputs(ROOT)

    def test_check_cli_fails_on_blob_drift_and_output_outside_build(self):
        original = eop._file
        with mock.patch.object(sys, 'argv', ['generate_eop.py', '--check']):
            self.assertEqual(eop.main(), 0)
            def read(root, name, maximum):
                data = original(root, name, maximum)
                return data[:-1] + bytes([data[-1] ^ 1]) if name.endswith('/earth-orientation.bin') else data
            with mock.patch.object(eop, '_file', side_effect=read), mock.patch.object(eop.LOGGER, 'error'):
                self.assertEqual(eop.main(), 1)

    def test_cli_creates_a_fresh_reproducible_candidate_and_refuses_overwrite(self):
        (ROOT / 'build').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='eop-generation-test-', dir=ROOT / 'build') as directory:
            temporary = Path(directory).resolve()
            self.assertTrue(temporary.is_relative_to((ROOT / 'build').resolve()))
            destination = temporary / 'candidate'
            with mock.patch.object(sys, 'argv', ['generate_eop.py', '--out-dir', str(destination)]):
                self.assertEqual(eop.main(), 0)
                blob = (destination / 'earth-orientation.bin').read_bytes()
                report = (destination / 'report.json').read_bytes()
                self.assertEqual(blob, (ROOT / 'crates/solar-ephemeris/data/earth-orientation.bin').read_bytes())
                self.assertEqual(json.loads(report)['sha256'], hashlib.sha256(blob).hexdigest())
                with mock.patch.object(eop.LOGGER, 'error'): self.assertEqual(eop.main(), 1)
                self.assertEqual((destination / 'report.json').read_bytes(), report)
        for destination in (ROOT, ROOT / 'build', ROOT / 'apps/web/forbidden-eop-output'):
            with mock.patch.object(sys, 'argv', ['generate_eop.py', '--out-dir', str(destination)]), mock.patch.object(eop.LOGGER, 'error'):
                self.assertEqual(eop.main(), 1)


if __name__ == '__main__':
    unittest.main()
