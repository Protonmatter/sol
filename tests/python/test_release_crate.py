from __future__ import annotations
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import sys
import contextlib
import hashlib
import subprocess
from contextlib import contextmanager
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))


def git_id(data: bytes) -> str:
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data, usedforsecurity=False).hexdigest()


@contextmanager
def package_fixture():
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory);source=root/'crates/solar-ephemeris';source.mkdir(parents=True)
        (root/'Cargo.toml').write_text('[workspace]\nmembers=["crates/solar-ephemeris"]\n')
        (root/'Cargo.lock').write_text('version = 4\n')
        package=root/'solar-ephemeris-1.0.0.crate'
        files={'Cargo.toml.orig':b'[package]\nname="solar-ephemeris"\nversion="1.0.0"\n',
            'Cargo.toml':b'[package]\nname="solar-ephemeris"\nversion="1.0.0"\n',
            'src/lib.rs':b'pub fn engine() {}','LICENSE-MIT':b'MIT license\n','LICENSE-APACHE':b'Apache license\n',
            '.cargo_vcs_info.json':json.dumps({'git':{'sha1':'a'*40,'dirty':False},'path_in_vcs':'crates/solar-ephemeris'}).encode()}
        for name,data in files.items():
            if name=='.cargo_vcs_info.json':continue
            target=source/('Cargo.toml' if name=='Cargo.toml.orig' else name);target.parent.mkdir(exist_ok=True);target.write_bytes(data)
        ids={path.relative_to(root).as_posix():git_id(path.read_bytes()) for path in [root/'Cargo.toml',root/'Cargo.lock',*source.rglob('*')] if path.is_file()}
        def archive():
            with tarfile.open(package,'w:gz') as tar:
                for name,data in files.items():
                    member=tarfile.TarInfo('solar-ephemeris-1.0.0/'+name);member.size=len(data);tar.addfile(member,io.BytesIO(data))
        archive();log=root/'dry-run.txt';log.write_text('Synthetic successful dry-run fixture; not publication evidence.')
        yield SimpleNamespace(root=root,source=source,package=package,files=files,ids=ids,archive=archive,log=log)


class CrateTests(unittest.TestCase):
    def test_registry_only_404_is_absent_not_auth_or_outage(self):
        self.assertIsNotNone(importlib.util.find_spec("release_crate"), "registry hold/package evidence missing")
        import release_crate as crate
        self.assertEqual(crate.registry_state(404, b"", "solar-ephemeris", "1.0.0"), "absent")
        body = b'{"version":{"crate":"solar-ephemeris","num":"1.0.0"}}'
        self.assertEqual(crate.registry_state(200, body, "solar-ephemeris", "1.0.0"), "present")
        for status in (0, 201, 301, 401, 403, 429, 500, 503):
            with self.assertRaises(ValueError):
                crate.registry_state(status, body, "solar-ephemeris", "1.0.0")
        with self.assertRaises(ValueError):
            crate.registry_state(200, b'{}', "solar-ephemeris", "1.0.0")

    @patch('release_crate._committed_source_ids', create=True)
    def test_package_inventory_binds_sources_notices_and_dry_run_without_publication(self, committed_ids):
        self.assertIsNotNone(importlib.util.find_spec("release_crate"), "registry hold/package evidence missing")
        import release_crate as crate
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "crates/solar-ephemeris"
            source.mkdir(parents=True)
            (root/'Cargo.toml').write_text('[workspace]\nmembers=["crates/solar-ephemeris"]\n')
            (root/'Cargo.lock').write_text('version = 4\n')
            package = root / "solar-ephemeris-1.0.0.crate"
            files = {"Cargo.toml.orig": b'[package]\nname="solar-ephemeris"\nversion="1.0.0"\n',
                "Cargo.toml": b'[package]\nname="solar-ephemeris"\nversion="1.0.0"\n',
                "src/lib.rs": b"pub fn engine() {}", "LICENSE-MIT": b"MIT license", "LICENSE-APACHE": b"Apache license",
                ".cargo_vcs_info.json": json.dumps({"git": {"sha1": "a" * 40, "dirty": False}, "path_in_vcs": "crates/solar-ephemeris"}).encode()}
            for name, data in files.items():
                if name == ".cargo_vcs_info.json": continue
                target = source / ("Cargo.toml" if name == "Cargo.toml.orig" else name)
                target.parent.mkdir(exist_ok=True)
                target.write_bytes(data)
            committed_ids.return_value={path.relative_to(root).as_posix():git_id(path.read_bytes())
                for path in [root/'Cargo.toml',root/'Cargo.lock',*source.rglob('*')] if path.is_file()}
            def archive():
                with tarfile.open(package, "w:gz") as tar:
                    for name, data in files.items():
                        member = tarfile.TarInfo("solar-ephemeris-1.0.0/" + name)
                        member.size = len(data)
                        tar.addfile(member, io.BytesIO(data))
            archive()
            log = root / "dry-run.txt"
            log.write_text("cargo publish --dry-run completed (fixture)")
            result = crate.package_evidence(package, root, "a" * 40, log, dry_run_exit=0)
            self.assertEqual(result["publication"], "held")
            self.assertEqual(result["registry"], "not_checked")
            self.assertEqual(result["notices"], ["LICENSE-APACHE", "LICENSE-MIT"])
            argv = ["release_crate.py", "--package", str(package), "--source-root", str(root), "--source-sha", "a" * 40, "--dry-run-log", str(log), "--dry-run-exit", "0"]
            with patch.object(sys, "argv", argv), patch("release_crate.subprocess.run", return_value=SimpleNamespace(stdout="a" * 40)), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(crate.main(), 0)
                self.assertEqual(json.loads(output.getvalue())["publication"], "held")
            with patch.object(sys, "argv", argv), patch("release_crate.subprocess.run", return_value=SimpleNamespace(stdout="b" * 40)), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    crate.main()
                self.assertEqual(error.exception.code, 1)
            for args in ([], ["--registry-status", "404"], ["--registry-status", "404", "--registry-body", str(log), "--version", "1.0.0"]):
                with patch.object(sys, "argv", ["release_crate.py", *args]), contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()):
                    if len(args) == 6:
                        self.assertEqual(crate.main(), 0)
                        self.assertEqual(json.loads(output.getvalue())["registry"], "absent")
                    else:
                        with self.assertRaises(SystemExit): crate.main()
            (source / "src/lib.rs").write_text("changed source")
            with self.assertRaisesRegex(ValueError, "source"):
                crate.package_evidence(package, root, "a" * 40, log, dry_run_exit=0)
            with self.assertRaisesRegex(ValueError, "dry-run"):
                crate.package_evidence(package, root, "a" * 40, log, dry_run_exit=1)
            files["../escape"] = b"bad"
            archive()
            with self.assertRaises(ValueError):
                crate.package_evidence(package, root, "a" * 40, log, dry_run_exit=0)

    def test_matching_dirty_source_and_clean_marker_cannot_claim_the_original_commit(self):
        import release_crate as crate
        with package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value=f.ids,create=True):
            f.files['src/lib.rs']=b'pub fn changed_after_commit() {}'
            (f.source/'src/lib.rs').write_bytes(f.files['src/lib.rs']);f.archive()
            with self.assertRaisesRegex(ValueError,'commit'):
                crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)

    def test_uncommitted_packaged_file_is_rejected_even_when_working_copy_matches(self):
        import release_crate as crate
        with package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value=f.ids,create=True):
            f.files['src/new.rs']=b'pub fn uncommitted() {}';(f.source/'src/new.rs').write_bytes(f.files['src/new.rs']);f.archive()
            with self.assertRaisesRegex(ValueError,'commit'):
                crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)

    def test_workspace_manifest_and_lock_are_bound_to_the_source_commit(self):
        import release_crate as crate
        for name in ['Cargo.toml','Cargo.lock']:
            with self.subTest(name=name),package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value=f.ids,create=True):
                (f.root/name).write_bytes(b'changed workspace input')
                with self.assertRaisesRegex(ValueError,'commit'):
                    crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)

    def test_vcs_duplicate_keys_nonobjects_and_invalid_git_shapes_are_rejected(self):
        import release_crate as crate
        bad=[b'[]',b'null',b'{"git":null,"path_in_vcs":"crates/solar-ephemeris"}',
            b'{"git":{"sha1":"'+b'a'*40+b'","dirty":true,"dirty":false},"path_in_vcs":"crates/solar-ephemeris"}']
        for raw in bad:
            with self.subTest(raw=raw),package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value=f.ids,create=True):
                f.files['.cargo_vcs_info.json']=raw;f.archive()
                with self.assertRaises(ValueError):crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)

    def test_registry_duplicate_keys_nonobjects_and_invalid_version_shapes_fail_controlled(self):
        import release_crate as crate
        for raw in [b'[]',b'null',b'{"version":[]}',b'{"version":null}',
            b'{"version":{"crate":"other","num":"1.0.0"},"version":{"crate":"solar-ephemeris","num":"1.0.0"}}',
            b'{"version":{"crate":"solar-ephemeris","num":"1.0.0","unexpected":NaN}}']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):crate.registry_state(200,raw,'solar-ephemeris','1.0.0')

    def test_cli_malformed_registry_is_exit_one_without_traceback_or_payload(self):
        import release_crate as crate
        with tempfile.TemporaryDirectory() as directory:
            body=Path(directory)/'registry.json';body.write_text('["sensitive-sentinel"]')
            args=['release_crate.py','--registry-status','200','--registry-body',str(body),'--version','1.0.0']
            with patch.object(sys,'argv',args),contextlib.redirect_stderr(io.StringIO()) as errors:
                with self.assertRaises(SystemExit) as raised:crate.main()
            self.assertEqual(raised.exception.code,1);self.assertNotIn('Traceback',errors.getvalue());self.assertNotIn('sensitive-sentinel',errors.getvalue())

    def test_real_git_tree_and_blob_check_are_read_only_and_match_committed_license(self):
        import release_crate as crate
        root=Path(__file__).resolve().parents[2]
        commit=subprocess.run(['git','--no-optional-locks','-C',str(root),'rev-parse','HEAD'],check=True,capture_output=True,text=True).stdout.strip()
        ids=crate._committed_source_ids(root,commit)
        filename='crates/solar-ephemeris/LICENSE-MIT'
        original=subprocess.run(['git','--no-optional-locks','-C',str(root),'show',commit+':'+filename],check=True,capture_output=True).stdout
        independent=subprocess.run(['git','--no-optional-locks','hash-object','--stdin'],input=original,check=True,capture_output=True).stdout.decode().strip()
        self.assertEqual(ids[filename],independent)
        crate._require_committed_bytes(original,filename,ids)
        with self.assertRaisesRegex(ValueError,'commit'):crate._require_committed_bytes(original+b'changed',filename,ids)

    def test_git_inventory_parser_checks_protocol_and_uses_read_only_bounded_command(self):
        import release_crate as crate
        raw=(b'100644 blob '+b'a'*40+b'\tCargo.toml\0'+b'100755 blob '+b'b'*40+b'\tcrates/solar-ephemeris/src/lib.rs\0'
            +b'120000 blob '+b'c'*40+b'\tcrates/solar-ephemeris/link\0')
        with patch.object(crate.subprocess,'run',return_value=SimpleNamespace(stdout=raw)) as run:
            result=crate._committed_source_ids(Path('fixture'),'d'*40)
        self.assertEqual(result,{'Cargo.toml':'a'*40,'crates/solar-ephemeris/src/lib.rs':'b'*40})
        args=run.call_args.args[0];self.assertIn('--no-optional-locks',args);self.assertIn('--no-lazy-fetch',args);self.assertIn('-z',args)
        self.assertEqual(run.call_args.kwargs['timeout'],30);self.assertTrue(run.call_args.kwargs['check'])

    def test_malformed_duplicate_foreign_and_oversized_git_inventories_are_rejected(self):
        import release_crate as crate
        item=b'100644 blob '+b'a'*40+b'\tCargo.toml\0'
        for raw in [item[:-1],b'bad\0',b'100644 blob bad\tCargo.toml\0',item+item,
            b'100644 blob '+b'a'*40+b'\t../escape\0',b'100644 blob '+b'a'*40+b'\tforeign/file\0',
            b'100644 blob '+b'a'*40+b'\tcrates/solar-ephemeris/\xff\0']:
            with self.subTest(raw=raw),patch.object(crate.subprocess,'run',return_value=SimpleNamespace(stdout=raw)),self.assertRaises(ValueError):
                crate._committed_source_ids(Path('fixture'),'a'*40)
        with patch.object(crate,'MAX_JSON_BYTES',2),patch.object(crate.subprocess,'run',return_value=SimpleNamespace(stdout=item)),self.assertRaises(ValueError):
            crate._committed_source_ids(Path('fixture'),'a'*40)

    def test_empty_git_inventory_cannot_supply_commit_identity(self):
        import release_crate as crate
        with package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value={}):
            with self.assertRaisesRegex(ValueError,'commit'):crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)

    def test_cargo_clean_metadata_may_omit_dirty_and_publication_still_stays_held(self):
        import release_crate as crate
        with package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value=f.ids):
            f.files['.cargo_vcs_info.json']=json.dumps({'git':{'sha1':'a'*40},'path_in_vcs':'crates/solar-ephemeris'}).encode();f.archive()
            result=crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)
            self.assertEqual(result['publication'],'held');self.assertEqual(result['registry'],'not_checked')

    def test_package_identity_and_required_manifests_fail_controlled(self):
        import release_crate as crate
        for mutation in [lambda f:f.files.pop('Cargo.toml.orig'),lambda f:f.files.update({'Cargo.toml':b'[package]\nname=3\nversion="1.0.0"\n'}),
            lambda f:f.files.update({'Cargo.toml':b'title="no package"\n'})]:
            with package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value=f.ids):
                mutation(f);f.archive()
                with self.assertRaises(ValueError):crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)

    def test_metadata_and_member_bounds_reject_before_unbounded_payload_work(self):
        import release_crate as crate
        with patch.object(crate,'MAX_JSON_BYTES',2),self.assertRaises(ValueError):crate.registry_state(200,b'{} ','solar-ephemeris','1.0.0')
        with package_fixture() as f,patch.object(crate,'MAX_PACKAGE_MEMBERS',2),self.assertRaisesRegex(ValueError,'member count'):
            crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)
        with package_fixture() as f,patch.object(crate.tarfile,'open') as opened:
            archive=opened.return_value.__enter__.return_value
            archive.__iter__.return_value=iter([SimpleNamespace(name='solar-ephemeris-1.0.0/huge',size=129*1024*1024,isfile=lambda:True)])
            with self.assertRaisesRegex(ValueError,'inventory size'):crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)
            archive.extractfile.assert_not_called()

    def test_actual_clean_working_copy_lock_and_licenses_match_canonical_git_content(self):
        import release_crate as crate
        root=Path(__file__).resolve().parents[2]
        commit=subprocess.run(['git','--no-lazy-fetch','--no-optional-locks','-C',str(root),'rev-parse','HEAD'],check=True,capture_output=True,text=True).stdout.strip()
        ids=crate._committed_source_ids(root,commit)
        for filename in ['Cargo.lock','crates/solar-ephemeris/LICENSE-MIT','crates/solar-ephemeris/LICENSE-APACHE']:
            with self.subTest(filename=filename):
                working=(root/filename).read_bytes()
                committed=subprocess.run(['git','--no-lazy-fetch','--no-optional-locks','-C',str(root),'show',commit+':'+filename],check=True,capture_output=True).stdout
                self.assertEqual(working.replace(b'\r\n',b'\n'),committed)
                self.assertIs(crate._require_committed_bytes(working,filename,ids),working!=committed)

    def test_only_exact_known_text_paths_normalize_crlf_and_receipt_records_applied_paths(self):
        import release_crate as crate
        with package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value=f.ids):
            raw=crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)
            self.assertEqual(raw['source_binding']['normalized_paths'],[])
            (f.root/'Cargo.lock').write_bytes((f.root/'Cargo.lock').read_bytes().replace(b'\n',b'\r\n'))
            for filename in ['LICENSE-MIT','LICENSE-APACHE']:
                f.files[filename]=f.files[filename].replace(b'\n',b'\r\n');(f.source/filename).write_bytes(f.files[filename])
            f.archive();result=crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)
            self.assertEqual(result['source_binding']['normalized_paths'],['Cargo.lock','crates/solar-ephemeris/LICENSE-APACHE','crates/solar-ephemeris/LICENSE-MIT'])
            self.assertEqual(result['source_binding']['transform'],'CRLF-to-LF for explicitly allowlisted text inputs')
            self.assertEqual(result['publication'],'held')
            self.assertEqual(result['contents']['LICENSE-MIT'],hashlib.sha256(f.files['LICENSE-MIT']).hexdigest())
        for filename in ['Cargo.toml','crates/solar-ephemeris/src/lib.rs','crates/solar-ephemeris/data/vsop2013.bin','other/LICENSE-MIT']:
            with self.subTest(filename=filename),self.assertRaises(ValueError):
                crate._require_committed_bytes(b'unchanged\r\n',filename,{filename:git_id(b'unchanged\n')})

    def test_text_normalization_preserves_other_bytes_and_archive_working_equality(self):
        import release_crate as crate
        filename='crates/solar-ephemeris/LICENSE-MIT';ids={filename:git_id(b'original\n')}
        for raw in [b'changed\r\n',b'original\r',b'\xef\xbb\xbforiginal\r\n',b'original \r\n']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):crate._require_committed_bytes(raw,filename,ids)
        with package_fixture() as f,patch.object(crate,'_committed_source_ids',return_value=f.ids):
            f.files['LICENSE-MIT']=f.files['LICENSE-MIT'].replace(b'\n',b'\r\n');f.archive()
            with self.assertRaisesRegex(ValueError,'source bytes'):crate.package_evidence(f.package,f.root,'a'*40,f.log,dry_run_exit=0)
