"""Offline precision reference provenance, units, clocks and rejection controls."""
from __future__ import annotations

import hashlib
import csv
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import precision_window_reference as reference

PACK = ROOT / 'tests/fixtures/horizons-precision-1900-2200-20261104'


class PrecisionResponseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.queries = reference.queries()

    def response(self, kind='vectors', case='mercury', batch='irregular-0'):
        query = next(q for q in self.queries if (q['kind'], q['case'], q['batch']) == (kind, case, batch))
        epochs = tuple(next(b['epochs_jd'] for b in reference.batches() if b['id'] == batch))
        return (PACK / f'{kind}-{case}-{batch}.txt').read_text(), query, epochs

    def test_fixed_plan_epochs_are_deterministic_and_cover_target_boundaries(self):
        self.assertEqual(len(reference.GRID), 3665)
        self.assertEqual(len(reference.IRREGULAR), 260)
        self.assertEqual(len(reference.EPOCHS), 3925)
        self.assertEqual(len(self.queries), 190)
        self.assertEqual(reference.EPOCHS, tuple(sorted(set(reference.EPOCHS))))
        self.assertEqual(reference.irregular_epochs(), reference.IRREGULAR)
        for jd in (2415019.5, 2415020.5, 2524958.5, 2524959.5):
            self.assertIn(jd, reference.EPOCHS)
        with self.assertRaises(ValueError): reference.batches(128)

    def test_both_response_types_retain_requested_and_returned_epoch_tokens(self):
        for kind in ('vectors', 'apparent'):
            text, query, epochs = self.response(kind)
            parsed = reference.parse_response(text, query, epochs)
            self.assertEqual(tuple(parsed), epochs)
            for jd, (value, epoch) in parsed.items():
                self.assertEqual(epoch.requested_jd, jd)
                self.assertEqual(epoch.requested_token, f'{jd:.9f}')
                self.assertEqual(float(epoch.returned_token), epoch.returned_jd)
                self.assertLessEqual(abs(epoch.returned_jd - jd) * 86400, epoch.serialization_allowance_seconds)
                self.assertLessEqual(epoch.serialization_allowance_seconds, .001)
                if kind == 'apparent': self.assertGreater(value.range_au, 0)
                else: self.assertEqual(len(value), 3)

    def test_wrong_identity_source_frame_units_clock_and_headers_fail(self):
        for kind in ('vectors', 'apparent'):
            text, query, epochs = self.response(kind)
            substitutions = [('API VERSION: 1.2', 'API VERSION: 1.3'), ('{source: DE441}', '{source: DE440}'),
                ('Gregorian', 'Mixed'), ('Mercury (199)', 'Mercury (1)')]
            substitutions += [('AU-D', 'KM-S'), ('GEOMETRIC cartesian states', 'ASTROMETRIC cartesian states'),
                ('Ecliptic of J2000.0', 'Equatorial of J2000.0'), ('X-axis   : ICRF', 'X-axis   : B1950'),
                (' TDB', ' TT')] if kind == 'vectors' else [('NO (AIRLESS)', 'YES'), ('Units: AU and KM/S', 'Units: KM and KM/S'), (' TT', ' UTC')]
            for old, new in substitutions:
                self.assertIn(old, text)
                with self.subTest(kind=kind, old=old), self.assertRaises(ValueError):
                    reference.parse_response(text.replace(old, new, 1), query, epochs)
            with self.assertRaises(ValueError): reference.parse_response(text, query | {'target': 199.0}, epochs)
            with self.assertRaises(ValueError): reference.parse_response(text, query | {'request_url': query['request_url'] + '&EXTRA=1'}, epochs)
            with self.assertRaises(ValueError): reference.parse_response(text, query, tuple(reversed(epochs)))

    def test_missing_reordered_duplicate_and_nonfinite_rows_fail(self):
        for kind in ('vectors', 'apparent'):
            text, query, epochs = self.response(kind)
            prefix, tail = text.split('$$SOE'); block, suffix = tail.split('$$EOE')
            rows = block.strip().splitlines()
            cell_index = 2 if kind == 'vectors' else 3
            variants = [rows[1:], rows + [rows[0]], [rows[1], rows[0], *rows[2:]]]
            for token in ('NaN', '1e309', '1 trailing', ''):
                cells = rows[0].split(','); cells[cell_index] = token
                variants.append([','.join(cells), *rows[1:]])
            if kind == 'apparent':
                for index, token in ((1, '*'), (3, '360'), (4, '-90.001'), (5, '0'), (6, '299792.458'), (8, '-1'), (9, '90.1')):
                    cells = rows[0].split(','); cells[index] = token
                    variants.append([','.join(cells), *rows[1:]])
            for altered in variants:
                with self.subTest(kind=kind, first=altered[0]), self.assertRaises(ValueError):
                    reference.parse_response(prefix + '$$SOE\n' + '\n'.join(altered) + '\n$$EOE' + suffix, query, epochs)

    def test_epoch_allowance_is_bounded_and_cannot_hide_millisecond_shift(self):
        text, query, epochs = self.response()
        prefix, tail = text.split('$$SOE'); block, suffix = tail.split('$$EOE')
        rows = block.strip().splitlines(); cells = rows[0].split(',')
        jd = epochs[0]
        cells[0] = f'{jd + 2 * math.ulp(jd):.9f}'
        candidate = prefix + '$$SOE\n' + '\n'.join([','.join(cells), *rows[1:]]) + '\n$$EOE' + suffix
        self.assertEqual(reference.parse_response(candidate, query, epochs)[jd][1].requested_jd, jd)
        for delta in (4 * math.ulp(jd), .001 / 86400, .01 / 86400):
            cells[0] = f'{jd + delta:.9f}'
            candidate = prefix + '$$SOE\n' + '\n'.join([','.join(cells), *rows[1:]]) + '\n$$EOE' + suffix
            with self.subTest(delta=delta), self.assertRaises(ValueError): reference.parse_response(candidate, query, epochs)


class PrecisionPackTests(unittest.TestCase):
    def test_worst_case_rust_regressions_bind_exact_independent_packet_records(self):
        fixture = ROOT / 'tests/fixtures/precision-regressions-20261104.csv'
        self.assertEqual(fixture.read_bytes(), (ROOT / 'crates/solar-ephemeris/data/precision-regressions-20261104.csv').read_bytes())
        pack = reference.load_precision_pack(PACK)
        rows = list(csv.DictReader(fixture.read_text().splitlines()))
        self.assertEqual(len(rows), 18)
        self.assertEqual({row['case'] for row in rows}, {case[0] for case in reference.APPARENT_CASES})
        identities = {case[0]: case[1:] for case in reference.APPARENT_CASES}
        for row in rows:
            key = row['case'], float(row['jd_tt']); place = pack.apparent[key]
            self.assertEqual((row['body'], int(row['target_id']), int(row['center_id'])), identities[key[0]])
            self.assertEqual(tuple(float(row[k]) for k in ('ra_deg', 'dec_deg', 'range_au')),
                             (place.ra_deg, place.dec_deg, place.range_au))
            self.assertEqual(row['raw_sha256'], pack.raw_hashes[('apparent', *key)])

    def test_complete_pack_is_immutable_and_all_30_printed_offsets_are_retained(self):
        pack = reference.load_precision_pack(PACK)
        self.assertEqual(pack.manifest_sha256, 'd3ea57a0eef1347dda375f0f66614a8d4235a0a179d08bbdba2184cec0e6cccb')
        self.assertEqual(len(pack.vectors), 39250)
        self.assertEqual(len(pack.apparent), 35325)
        shifted = [e for e in pack.reference_epochs.values() if e.returned_jd != e.requested_jd]
        self.assertEqual(len(shifted), 30)
        self.assertLessEqual(max(abs(e.returned_jd - e.requested_jd) * 86400 for e in shifted), .000081)
        with self.assertRaises(TypeError): pack.vectors[('mercury', reference.EPOCHS[0])] = (1, 2, 3)

    @staticmethod
    def rehash(root, key, filename, value):
        raw = (json.dumps(value, allow_nan=False) + '\n').encode()
        (root / filename).write_bytes(raw)
        manifest = json.loads((root / 'manifest.json').read_bytes())
        manifest['files'][key].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        (root / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')

    def test_rehashed_acquisition_still_rejects_wrong_query_retry_target_or_total(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
            original = (PACK / 'acquisition.json').read_bytes()
            mutations = [lambda a: a['records'].pop(), lambda a: a.__setitem__('raw_bytes', a['raw_bytes'] + 1),
                lambda a: a['records'][0].__setitem__('attempts', True),
                lambda a: a['records'][1].__setitem__('target', 199.0),
                lambda a: a['records'][1].__setitem__('reused_from_initial', True),
                lambda a: a['records'][1].__setitem__('path', '../outside.txt'),
                lambda a: a['records'][1].__setitem__('acquired_at_utc', '1900-01-01T00:00:00Z'),
                lambda a: a['records'][1].__setitem__('request_url', a['records'][1]['request_url'].replace('NONE', 'LT'))]
            for mutate in mutations:
                acquisition = json.loads(original); mutate(acquisition)
                self.rehash(target, 'acquisition', 'acquisition.json', acquisition)
                with self.assertRaises(ValueError): reference.load_precision_pack(target)

    def test_amendment_integers_are_strict_and_cannot_be_changed_by_rehashing(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
            for key, value in (('initial_attempt_limit', 2.0), ('revised_tlist_batch_limit', 32.0), ('final_observed_http_status', 502.0)):
                amendment = json.loads((PACK / 'transport-amendment.json').read_bytes()); amendment[key] = value
                self.rehash(target, 'amendment', 'transport-amendment.json', amendment)
                acquisition = json.loads((PACK / 'acquisition.json').read_bytes())
                acquisition['transport_amendment_sha256'] = hashlib.sha256((target / 'transport-amendment.json').read_bytes()).hexdigest()
                self.rehash(target, 'acquisition', 'acquisition.json', acquisition)
                with self.subTest(key=key), self.assertRaises(ValueError): reference.load_precision_pack(target)

    def test_bad_hash_loosened_budgets_extra_files_and_duplicate_json_keys_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'pack'; shutil.copytree(PACK, target)
            manifest_path = target / 'manifest.json'; original = manifest_path.read_bytes()
            for maximum in (11.0, 10, True):
                manifest = json.loads(original); manifest['acceptance']['vector_maximum'] = maximum
                manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
                with self.assertRaises(ValueError): reference.load_precision_pack(target)
            manifest_path.write_bytes(original)
            (target / 'unexpected.txt').write_text('not declared')
            with self.assertRaises(ValueError): reference.load_precision_pack(target)
            (target / 'unexpected.txt').unlink()
            manifest_path.write_bytes(original.replace(b'{', b'{"source":"duplicate",', 1))
            with self.assertRaises(ValueError): reference.load_precision_pack(target)
            manifest_path.write_bytes(original)
            raw_path = target / 'vectors-mercury-grid.txt'; raw_path.write_bytes(raw_path.read_bytes() + b'\n')
            with self.assertRaises(ValueError): reference.load_precision_pack(target)


if __name__ == '__main__': unittest.main()
