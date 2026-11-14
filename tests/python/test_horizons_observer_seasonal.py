"""Seasonal reference admission/derivation, independent of native engine outputs."""
from __future__ import annotations

import contextlib
import dataclasses
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import horizons_observer_seasonal as reference

PACK = ROOT / 'tests/fixtures/horizons-observer-seasonal-20261104'
MANIFEST_SHA = 'afc6cb1363f9b82a0ae8a1d0694a729784803c41c80c8ae9a0747ec69e5b2dac'
MATRIX_SHA = '8b42182fc48f7bddcb90b8231e73d48c62db03f03ecfb58e4b55cebdb58e5edc'
sha = lambda raw: hashlib.sha256(raw).hexdigest()


class SeasonalReferenceTests(unittest.TestCase):
    def mutate(self, change):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'pack'; shutil.copytree(PACK, target)
            manifest = json.loads((target / 'manifest.json').read_bytes())
            change(target, manifest)
            (target / 'manifest.json').write_text(json.dumps(manifest, allow_nan=True), encoding='utf-8')
            with self.assertRaises((ValueError, OSError)): reference.load_pack(target)

    def metadata(self, key, change):
        def update(folder, manifest):
            record = manifest['metadata'][key]; path = folder / record['path']
            value = json.loads(path.read_bytes()); change(value)
            raw = (json.dumps(value, allow_nan=True) + '\n').encode(); path.write_bytes(raw)
            record.update(bytes=len(raw), sha256=sha(raw))
        self.mutate(update)

    def test_complete_frozen_cohort_derives_exact_crate_matrix_without_network(self):
        before = (PACK / 'manifest.json').read_bytes()
        with mock.patch.object(urllib.request, 'urlopen', side_effect=AssertionError('unexpected network')) as network:
            pack = reference.load_pack(PACK)
        network.assert_not_called()
        self.assertEqual(len(pack.rows), 432)
        self.assertEqual(len({row.case for row in pack.rows}), 48)
        self.assertEqual(pack.manifest_sha256, MANIFEST_SHA)
        expected = (PACK / 'observer-matrix.csv').read_bytes()
        self.assertEqual(sha(expected), MATRIX_SHA)
        self.assertEqual(reference.matrix_csv(pack.rows), expected)
        self.assertEqual(expected, (ROOT / 'crates/solar-ephemeris/data/horizons-observer-seasonal-20261104.csv').read_bytes())
        self.assertEqual((PACK / 'manifest.json').read_bytes(), before)

    def test_returned_rows_and_container_are_immutable(self):
        pack = reference.load_pack(PACK)
        self.assertEqual(len(pack.rows), 432)
        with self.assertRaises(dataclasses.FrozenInstanceError): pack.rows[0].ra_deg = 0
        with self.assertRaises(dataclasses.FrozenInstanceError): pack.rows = ()

    def test_manifest_identity_budgets_and_chronology_fail_closed(self):
        changes = [lambda m:m.update(schema_version='other'), lambda m:m.update(endpoint='https://example.invalid/'),
            lambda m:m.update(api_version='unknown'), lambda m:m.update(quantities=[4]),
            lambda m:m.update(scope=' '), lambda m:m.update(limitations=''),
            lambda m:m['acceptance'].update(moon_arcsec=60), lambda m:m['acceptance'].update(range_absolute_floor_km=True),
            lambda m:m.update(acquisition_finished_utc='2000-01-01T00:00:00Z')]
        for index, change in enumerate(changes):
            with self.subTest(index=index): self.mutate(lambda _folder,m:change(m))

    def test_manifest_duplicate_keys_non_json_and_byte_bounds_are_rejected(self):
        for raw in (b'{"schema_version":1,"schema_version":2}', b'{"value":NaN}', b' '*131073):
            with self.subTest(raw=raw[:60]), tempfile.TemporaryDirectory() as folder:
                path = Path(folder); (path/'manifest.json').write_bytes(raw)
                with self.assertRaises(ValueError): reference.load_pack(path)

    def test_missing_duplicate_wrong_request_and_capture_records_are_rejected(self):
        changes = [lambda m:m['records'].pop(), lambda m:m['records'].__setitem__(1,m['records'][0]),
            lambda m:m['records'][0].update(id='other'), lambda m:m['records'][0].update(request_url='https://example.invalid/'),
            lambda m:m['records'][0].update(path='../outside.txt'), lambda m:m['records'][0].update(bytes=True),
            lambda m:m['records'][0].update(capture_started_utc='2000-01-01T00:00:00Z'),
            lambda m:m['records'][0].update(capture_phase='amended')]
        for index, change in enumerate(changes):
            with self.subTest(index=index): self.mutate(lambda _folder,m:change(m))

    def test_response_and_derived_bytes_cannot_change_or_disappear(self):
        for change in (lambda p,m:(p/m['records'][0]['path']).write_bytes(b'corrupt'),
                       lambda p,m:(p/m['records'][0]['path']).unlink(),
                       lambda p,m:(p/'observer-matrix.csv').write_bytes(b'wrong'),
                       lambda p,m:(p/'unlisted.txt').write_bytes(b'not admitted')):
            with self.subTest(change=change): self.mutate(change)

    def test_rehashed_plan_amendment_and_acquisition_mutations_are_rejected(self):
        cases = [('plan',lambda v:v['acceptance'].update(moon_arcsec=60)),
            ('amendment',lambda v:v['center_sources'].update(Jupiter='DE441')),
            ('original_acquisition',lambda v:v.update(status='passed')),
            ('acquisition',lambda v:v.update(status='qualified')),
            ('acquisition',lambda v:v['records'][0]['rows'][0].update(ra_deg=0)),
            ('acquisition',lambda v:v['records'][0].update(capture_started_utc='2000-01-01T00:00:00Z'))]
        for key, change in cases:
            with self.subTest(key=key,change=change): self.metadata(key,change)

    def test_all_target_dependent_earth_kernels_and_requested_epochs_parse(self):
        plan = json.loads((PACK/'predeclared-plan.json').read_bytes())
        amendment = json.loads((PACK/'admission-amendment.json').read_bytes())
        for query in plan['queries']:
            q = {**query,'center_source':amendment['center_sources'][query['body']]}
            rows = reference.parse_response((PACK/'responses'/(q['id']+'.txt')).read_bytes(),q)
            self.assertEqual(len(rows),12)
            self.assertEqual(rows[0].body,q['body']); self.assertEqual(rows[0].jd_utc,q['epochs_jd_utc'][0])

    def test_response_identity_units_and_layout_cannot_be_relabelled(self):
        plan=json.loads((PACK/'predeclared-plan.json').read_bytes());q={**plan['queries'][0],'center_source':'DE441'}
        raw=(PACK/'responses/boston-sun.txt').read_bytes()
        changes=[lambda v:v.replace(b'Sun (10)',b'Sun (301)',1),lambda v:v.replace(b'DE441',b'DE440',1),
            lambda v:v.replace(b'NO (AIRLESS)',b'YES (REFRACTED)',1),
            lambda v:v.replace(b'149597870.700 km',b'149597870.700 AU',1),
            lambda v:v.replace(b'288.94, 42.36',b'288.94, 43.36',1),
            lambda v:v.replace(b'UT1-UTC',b'OTHER',1),lambda v:v.replace(b'UT1-UTC,',b'UT1-UTC,"',1),
            lambda v:v+b'\n$$SOE\n',lambda v:b'x'*160001]
        for index,change in enumerate(changes):
            with self.subTest(index=index), self.assertRaises(ValueError): reference.parse_response(change(raw),q)

    def test_response_missing_duplicate_reordered_and_nonfinite_rows_fail(self):
        plan=json.loads((PACK/'predeclared-plan.json').read_bytes());q={**plan['queries'][0],'center_source':'DE441'}
        text=(PACK/'responses/boston-sun.txt').read_text()
        prefix,tail=text.split('$$SOE');block,suffix=tail.split('$$EOE');rows=block.strip().splitlines()
        variants=[rows[:-1],rows+[rows[0]],[rows[1],rows[0],*rows[2:]]]
        for column,value in [(0,'0'),(3,'NaN'),(3,'361'),(3,'"0'),(4,'91'),(5,'361'),(6,'91'),(7,'0'),(7,'1e309'),(9,'.95')]:
            cells=rows[0].split(',');cells[column]=value;variants.append([','.join(cells),*rows[1:]])
        for index,changed in enumerate(variants):
            raw=(prefix+'$$SOE\n'+'\n'.join(changed)+'\n$$EOE'+suffix).encode()
            with self.subTest(index=index),self.assertRaises(ValueError): reference.parse_response(raw,q)

    def test_cli_reports_admission_only_and_propagates_missing_or_mismatched_files(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(reference.main([]),0)
        self.assertIn('432',output.getvalue())
        with contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(reference.main(['--reference-dir',str(PACK/'missing')]),1)
        self.assertTrue(errors.getvalue())
        with tempfile.TemporaryDirectory() as folder,contextlib.redirect_stderr(io.StringIO()):
            matrix=Path(folder)/'matrix.csv';matrix.write_bytes(b'not the derived matrix')
            self.assertEqual(reference.main(['--matrix',str(matrix)]),1)


if __name__=='__main__': unittest.main()
