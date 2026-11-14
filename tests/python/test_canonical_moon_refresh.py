"""Current qualification selects fresh native evidence; old packets stay frozen."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path,PurePosixPath
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import collect_moon_evidence as collector

PACK=ROOT/'tests/fixtures/canonical-moon-20261104'
MANIFEST_SHA='928ac603fe151395c63a9c5edead4506a73c0cdb2b29d24c1c70f1cd91400229'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_bytes())


class CanonicalMoonRefreshTests(unittest.TestCase):
    def test_complete_frozen_packet_has_exact_bounded_file_identity(self):
        self.assertEqual(sha(PACK/'manifest.json'),MANIFEST_SHA)
        ledger=read(PACK/'manifest.json');self.assertEqual(ledger['schema_version'],'canonical-moon-refresh-fixture.v1')
        self.assertEqual(len(ledger['files']),80)
        actual={p.relative_to(PACK).as_posix() for p in PACK.rglob('*') if p.is_file() and p!=PACK/'manifest.json'}
        self.assertEqual(actual,set(ledger['files']))
        for name,record in ledger['files'].items():
            with self.subTest(name=name):
                relative=PurePosixPath(name);path=PACK/name
                self.assertFalse(relative.is_absolute());self.assertNotIn('..',relative.parts)
                self.assertEqual(str(relative),name);self.assertNotIn('\\',name);self.assertNotIn(':',name)
                self.assertFalse(path.is_symlink());self.assertTrue(path.resolve().is_relative_to(PACK.resolve()))
                self.assertLessEqual(record['bytes'],1024**2)
                self.assertEqual({'bytes':path.stat().st_size,'sha256':sha(path)},record)

    def test_all_four_native_reports_keep_their_phase_and_exact_source_output_contract(self):
        pending=read(PACK/'pending/native/native-metadata.json')
        for directory,phase in [('pending','pending'),('strict','qualified')]:
            native=read(PACK/directory/'native/native-metadata.json')
            manifest=read(PACK/directory/f'generation-manifest.{phase}.json')
            spec=read(PACK/directory/'input-manifest.json');expected={r['path']:r['sha256'] for r in spec['files']}
            self.assertEqual(len(expected),10);self.assertTrue(native['passed']);self.assertEqual(native['phase'],phase)
            self.assertEqual((native['host_system'],native['host_machine'],native['image_os'],native['image_architecture']),
                             ('Linux','x86_64','linux','amd64'))
            self.assertEqual(native['image_id'],pending['image_id']);self.assertEqual(set(native['repo_digests']),set(pending['repo_digests']))
            self.assertEqual(native['current_source_sha256'],expected);self.assertEqual([r['index'] for r in native['runs']],[1,2])
            self.assertEqual(len(native['cleanup_checks']),2);self.assertTrue(all(r['confirmed_absent'] for r in native['cleanup_checks']))
            for command in native['commands']:
                for stream in ('stdout','stderr'):
                    self.assertEqual(sha(PACK/directory/'native'/(command['name']+'.'+stream+'.txt')),command[stream+'_sha256'])
            commands=[c for c in native['commands'] if c['name'] in ('comparison-1','comparison-2')]
            self.assertEqual(len(commands),2)
            for command in commands:
                self.assertEqual(command['exit_code'],0)
                args=command['command']
                for flag,value in [('--platform','linux/amd64'),('--network','none'),('--cpus','2'),('--memory','1g'),('--pids-limit','128')]:
                    self.assertEqual(args[args.index(flag)+1],value)
                self.assertIn('--read-only',args);self.assertIn('no-new-privileges',args)
            for run in native['runs']:
                path=PACK/directory/'native'/f'comparison-{run["index"]}.stdout.txt';report=read(path)
                self.assertEqual(sha(path),run['report_sha256']);self.assertEqual(run['exit_code'],0)
                self.assertIs(report['comparison_passed'],True);self.assertIs(report['qualification_granted'],False)
                self.assertEqual(report['qualification_status'],phase)
                self.assertEqual(report['runtime'],{'system':'Linux','machine':'x86_64','implementation':'CPython','python_version':'3.12.12'})
                self.assertEqual(report['source_sha256_before'],expected);self.assertEqual(report['source_sha256_after'],expected)
                self.assertEqual(report['generated_sha256'],manifest['outputs']);self.assertEqual(report['committed_sha256'],manifest['outputs'])
                self.assertEqual(report['numerical_validator_exit'],0);self.assertIn('11985 interleaved Horizons checks',report['validator_log'])
                if phase=='qualified':self.assertNotIn('noncanonical comparison',report['validator_log'])
                self.assertEqual((path.with_name(path.name.replace('stdout','stderr'))).read_bytes(),b'')

    def test_qualification_changes_metadata_only_and_preserves_review_links(self):
        pending=read(PACK/'pending/native/native-metadata.json');strict=read(PACK/'strict/native/native-metadata.json')
        self.assertEqual({k for k in strict['current_source_sha256'] if strict['current_source_sha256'][k]!=pending['current_source_sha256'][k]},
                         {'tools/ephemeris-data/generation-manifest.json'})
        first=read(PACK/'pending/generation-manifest.pending.json');final=read(PACK/'strict/generation-manifest.qualified.json')
        for key in ('generator','sources','serialization','outputs','validation'):self.assertEqual(first[key],final[key])
        self.assertEqual(final['canonical']['qualification']['identical_runs'],2)
        self.assertEqual(final['canonical']['qualification']['pending_native_metadata_sha256'],sha(PACK/'pending/native/native-metadata.json'))
        self.assertEqual(final['canonical']['qualification']['review_receipt_sha256'],sha(PACK/'review/native-pending-receipt.json'))
        for directory,phase in [('pending','pending'),('strict','qualified')]:
            snapshot=read(PACK/'snapshots'/f'{phase}.json')
            spec=read(PACK/directory/'input-manifest.json')
            self.assertEqual(spec['snapshot_receipt_sha256'],sha(PACK/'snapshots'/f'{phase}.json'))
            self.assertFalse(snapshot['qualification_granted'])
            self.assertEqual(snapshot['source_sha256'],{r['path']:r['sha256'] for r in spec['files']})

    def test_current_qualified_source_has_supported_selected_strict_evidence(self):
        manifest=collector.generator.load_generation_manifest();canonical=manifest['canonical']
        selected=canonical['qualification'].get('evidence_id','canonical-moon-20261103')
        self.assertIn(selected,{'canonical-moon-20261103','canonical-moon-20261104'})
        if canonical['status']=='pending':
            self.assertEqual(canonical['qualification']['identical_runs'],0)
        elif canonical['status']=='qualified':
            directory=ROOT/'tests/fixtures'/selected
            native=read(directory/('strict/native/native-metadata.json' if selected=='canonical-moon-20261104' else 'strict/native-metadata.json'))
            self.assertEqual(collector.fingerprints(),native['current_source_sha256'])
            self.assertTrue((ROOT/canonical['qualification']['reviewed_evidence']).is_file())
        else:self.fail('unsupported canonical qualification state')


if __name__=='__main__':unittest.main()
