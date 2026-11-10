"""Raw-reference integrity, request binding and network-free replay admission."""
from __future__ import annotations
import csv
import contextlib
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import validate_ephemeris as helper
from horizons_reference import load_reference_pack
import horizons_reference as admission

PACK=ROOT/'tests/fixtures/horizons-observer-20261103'
MANIFEST_SHA='8b8e20120a58853dde34759faffb01bc15a94793740b80721aa7c38cafb39ecd'

def requests():
    return {(label,body):helper.horizons_request_url(command,when,lat,lon,elev)
        for label,when,lat,lon,elev in helper.CASES for body,command in helper.BODIES.items()}


class HorizonsReferenceTests(unittest.TestCase):
    def test_acquisition_timestamps_require_explicit_utc(self):
        self.assertEqual(admission._utc('2026-11-03T00:00:00Z').utcoffset(),dt.timedelta(0))
        for value in (None,1,'2026-11-03T00:00:00','2026-11-03T00:00:00-04:00'):
            with self.subTest(value=value),self.assertRaises(ValueError):admission._utc(value)

    def test_file_admission_enforces_both_size_observations_and_exact_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory).resolve();path=folder/'reply.txt';path.write_bytes(b'raw')
            record={'path':'reply.txt','sha256':hashlib.sha256(b'raw').hexdigest(),'bytes':3}
            self.assertEqual(admission._file(folder,record,'reply.txt',maximum=16),b'raw')
            with self.assertRaisesRegex(ValueError,'byte budget'):
                admission._file(folder,record,'reply.txt',maximum=2)
            # Simulate a file growing after stat; the second bounded read must reject it.
            with mock.patch.object(Path,'open',return_value=io.BytesIO(b'x'*17)):
                with self.assertRaisesRegex(ValueError,'byte budget'):
                    admission._file(folder,record,'reply.txt',maximum=16)
            for size in (True,2,'3'):
                with self.subTest(size=size),self.assertRaisesRegex(ValueError,'byte count'):
                    admission._file(folder,{**record,'bytes':size},'reply.txt')
            path.unlink()
            with self.assertRaisesRegex(ValueError,'unavailable'):admission._file(folder,record,'reply.txt')

    def test_manifest_provenance_chronology_and_record_identity_fail_closed(self):
        mutations=[lambda m:m.update(scope=' '),lambda m:m.update(limitations=None),
            lambda m:m['query_helper'].update(base_git_revision='unknown'),
            lambda m:m.update(acquisition_finished_utc='2000-01-01T00:00:00Z'),
            lambda m:m['records'][0].update(acquired_at_utc='2000-01-01T00:00:00Z'),
            lambda m:m['records'][0].update(case=1),lambda m:m.update(api_version='different')]
        for index,mutate in enumerate(mutations):
            with self.subTest(index=index),tempfile.TemporaryDirectory() as directory:
                folder=Path(directory)/'pack';shutil.copytree(PACK,folder)
                manifest=json.loads((folder/'manifest.json').read_bytes());mutate(manifest)
                (folder/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
                with self.assertRaises(ValueError):load_reference_pack(folder,requests())

    def test_cli_offline_mode_never_falls_back_to_network(self):
        pack=load_reference_pack(PACK,requests())
        def snapshot(_binary,when,lat,lon,elev):
            # Transport isolation only: numeric accuracy has its separate native
            # regression. Echo references so this test needs no native binary.
            refs={body:helper.horizons_observation(command,when,lat,lon,elev,fetch=pack.fetch)
                for body,command in helper.BODIES.items()}
            return {'time':{'dut1_seconds':refs['Sun']['dut1_seconds']},'bodies':[
                {'name':body,'topocentric_apparent_ra_deg':ref['ra_deg'],
                 'topocentric_apparent_dec_deg':ref['dec_deg'],'az_deg':ref['az_deg'],'alt_deg':ref['el_deg']}
                for body,ref in refs.items()]}
        with tempfile.TemporaryDirectory() as directory:
            report=Path(directory)/'build/report.json'
            argv=['validate_ephemeris.py','--binary','unused','--reference-dir',str(PACK),'--report',str(report)]
            with mock.patch.object(sys,'argv',argv), \
                mock.patch.object(helper,'ROOT',Path(directory).resolve()), \
                mock.patch.object(helper,'engine_snapshot',side_effect=snapshot) as engine, \
                mock.patch.object(helper,'fetch_with_retry',side_effect=AssertionError('unexpected network')) as fetch, \
                contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(helper.main(),0)
            self.assertEqual(engine.call_count,4);fetch.assert_not_called()
            evidence=json.loads(report.read_text())
            self.assertTrue(evidence['passed'])
            self.assertEqual(evidence['matrix_size'],36)
            self.assertEqual(evidence['reference_mode'],'offline_replay')
            self.assertEqual(evidence['reference_manifest_sha256'],MANIFEST_SHA)

    def test_invalid_pack_aborts_before_engine_or_network_io(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)/'pack';shutil.copytree(PACK,folder)
            (folder/'boston-sun.txt').write_bytes(b'corrupted')
            argv=['validate_ephemeris.py','--binary','unused','--reference-dir',str(folder)]
            with mock.patch.object(sys,'argv',argv), \
                mock.patch.object(helper,'engine_snapshot') as engine, \
                mock.patch.object(helper,'fetch_with_retry') as fetch, self.assertRaises(ValueError):
                helper.main()
            engine.assert_not_called();fetch.assert_not_called()

    def test_accepted_acquisition_has_pinned_identity_and_exact_requests(self):
        pack=load_reference_pack(PACK,requests())
        self.assertEqual(pack.manifest_sha256,MANIFEST_SHA)
        self.assertEqual(len(pack.responses),36)
        first=next(iter(requests().values()))
        self.assertEqual(pack.fetch(first),(PACK/'boston-sun.txt').read_text(encoding='utf-8'))
        with self.assertRaises(ValueError):pack.fetch(first+'&unexpected=1')
        with self.assertRaises(TypeError):pack.responses[first]='changed'

    def test_incomplete_duplicated_or_misassociated_metadata_is_rejected(self):
        mutations=[
            lambda m:m['records'].pop(),
            lambda m:m['records'].__setitem__(1,m['records'][0]),
            lambda m:m['records'][0].__setitem__('request_url','https://example.invalid/'),
            lambda m:m['records'][0].__setitem__('body','Moon'),
            lambda m:m['records'][0].__setitem__('path','../outside.txt'),
            lambda m:m.__setitem__('quantities',[20]),
            lambda m:m.__setitem__('schema_version','unsupported'),
        ]
        for index,mutate in enumerate(mutations):
            with self.subTest(index=index),tempfile.TemporaryDirectory() as directory:
                folder=Path(directory)/'pack';shutil.copytree(PACK,folder)
                manifest=json.loads((folder/'manifest.json').read_text());mutate(manifest)
                (folder/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
                with self.assertRaises(ValueError):load_reference_pack(folder,requests())

    def test_raw_byte_changes_do_not_survive_manifest_hash_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)/'pack';shutil.copytree(PACK,folder)
            path=folder/'boston-sun.txt';path.write_bytes(path.read_bytes()+b' ')
            with self.assertRaises(ValueError):load_reference_pack(folder,requests())

    def test_rehashed_wrong_target_center_observer_or_refraction_is_still_rejected(self):
        for old,new in [(b'Sun (10)',b'Sun (301)'),(b'Earth (399)',b'Earth (299)'),
            (b'NO (AIRLESS)',b'YES (REFRACTED)'),(b'288.94, 42.36, .010',b'288.94, 41.36, .010')]:
            with self.subTest(old=old),tempfile.TemporaryDirectory() as directory:
                folder=Path(directory)/'pack';shutil.copytree(PACK,folder)
                path=folder/'boston-sun.txt';raw=path.read_bytes().replace(old,new,1);path.write_bytes(raw)
                manifest=json.loads((folder/'manifest.json').read_text());record=manifest['records'][0]
                record.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
                (folder/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
                with self.assertRaises(ValueError):load_reference_pack(folder,requests())

    def test_duplicate_json_keys_and_unlisted_files_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)/'pack';shutil.copytree(PACK,folder)
            path=folder/'manifest.json';text=path.read_text();path.write_text(text.replace('{','{"source":"ambiguous",',1))
            with self.assertRaises(ValueError):load_reference_pack(folder,requests())
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)/'pack';shutil.copytree(PACK,folder);(folder/'unexpected.txt').write_text('extra')
            with self.assertRaises(ValueError):load_reference_pack(folder,requests())

    def test_derived_crate_matrix_is_exactly_bound_to_raw_responses(self):
        pack=load_reference_pack(PACK,requests())
        matrix=(PACK/'observer-matrix.csv').read_bytes()
        self.assertEqual(matrix,(ROOT/'crates/solar-ephemeris/data/horizons-observer-20261103.csv').read_bytes())
        rows=list(csv.DictReader(matrix.decode().splitlines()));self.assertEqual(len(rows),36)
        for row,(label,body) in zip(rows,requests()):
            _,when,lat,lon,elev=next(case for case in helper.CASES if case[0]==label)
            ref=helper.horizons_observation(helper.BODIES[body],when,lat,lon,elev,fetch=pack.fetch)
            self.assertEqual((row['case'],row['body']),(label,body))
            for key,value in [('jd_utc',when.timestamp()/86400+2440587.5),('latitude_deg',lat),
                ('longitude_deg_east',lon),('elevation_m',elev),('ra_deg',ref['ra_deg']),('dec_deg',ref['dec_deg']),
                ('az_deg',ref['az_deg']),('alt_deg',ref['el_deg']),('dut1_seconds',ref['dut1_seconds'])]:
                self.assertEqual(float(row[key]),value,(label,body,key))
            self.assertEqual(row['raw_sha256'],hashlib.sha256(pack.fetch(requests()[(label,body)]).encode()).hexdigest())


if __name__=='__main__':unittest.main()
