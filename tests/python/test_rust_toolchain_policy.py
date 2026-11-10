"""Released compiler selection and build-evidence drift rejection contracts."""
from __future__ import annotations

from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import release_evidence
import validate_sdlc


class CompilerPolicyTests(unittest.TestCase):
    @staticmethod
    def minimum_step():
        return ('      - name: Test declared Rust minimum\n'
            '        shell: bash\n'
            '        env:\n'
            '          CARGO_TARGET_DIR: target/msrv-1.85.0\n'
            '        run: |\n'
            '          set -euo pipefail\n'
            '          rustup toolchain install 1.85.0 --profile minimal --target wasm32-unknown-unknown --no-self-update\n'
            '          cargo +1.85.0 check --workspace --all-targets --locked --offline\n'
            '          cargo +1.85.0 test --workspace --locked --offline\n'
            '          cargo +1.85.0 check -p solar-wasm -p solar-ephemeris --target wasm32-unknown-unknown --locked --offline\n')

    def test_declared_minimum_is_a_blocking_check_in_the_existing_rust_job(self):
        checker = getattr(validate_sdlc,'validate_minimum_rust_job',None)
        self.assertTrue(callable(checker),'Declared compiler minimum needs a blocking CI guard')
        source = (ROOT/'.github/workflows/ci.yml').read_text(encoding='utf-8')
        step = self.minimum_step()
        self.assertIn(step,source)
        self.assertEqual(checker(ROOT,source),[])
        for replacement in ('',step+step,
                step.replace('        shell:', '        if: false\n        shell:'),
                step.replace('        shell:', '        continue-on-error: true\n        shell:'),
                step.replace('        shell:', '        "if": false\n        shell:'),
                step.replace('        shell:', '        if : false\n        shell:'),
                step.replace('cargo +1.85.0 test','cargo test'),
                step.replace('--all-targets --locked','--all-targets'),
                step.replace('target/msrv-1.85.0','target'),
                step.replace('shell: bash','shell: echo'),
                step.replace('          set -euo pipefail','          true # skipped'),
                step.replace('cargo +1.85.0 test --workspace --locked --offline','cargo +1.85.0 test --workspace --locked --offline || true')):
            with self.subTest(replacement=replacement):
                self.assertTrue(checker(ROOT,source.replace(step,replacement)))
        self.assertTrue(checker(ROOT,source.replace('  test:\n','  test:\n    if: false\n')))
        for condition in ('"if": false','if : false','<<: *conditional_job'):
            with self.subTest(condition=condition):
                self.assertTrue(checker(ROOT,source.replace('  test:\n','  test:\n    '+condition+'\n')))
        decoy = ('run-name: |\n  test:\n    name: Rust tests (workspace)\n'
                 '    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    steps:\n'
                 + step + '  sentinel: end of display text\n')
        mutant = decoy + source.replace(step,'')
        self.assertTrue(checker(ROOT,mutant),'Display text must not replace the actual jobs.test minimum check')
        self.assertTrue(checker(ROOT,source.replace('jobs:\n','display-jobs:\n',1)))
        self.assertTrue(checker(ROOT,source.replace('jobs:\n','jobs:\njobs:\n',1)))
        self.assertTrue(checker(ROOT,source.replace('  test:\n','  test:\n  test:\n',1)))
        path = ROOT/'.github/workflows/ci.yml'; original_read = Path.read_text
        def read_decoy(selected,*args,**kwargs):
            return mutant if selected==path else original_read(selected,*args,**kwargs)
        with mock.patch.object(Path,'read_text',new=read_decoy):
            self.assertTrue(any('minimum' in error for error in validate_sdlc.validate(ROOT)))
        for first in ('if: false','continue-on-error: true'):
            replacement = step.replace('      - name:',f'      - {first}\n        name:',1)
            changed = source.replace(step,replacement)
            def read(selected,*args,**kwargs):
                return changed if selected==path else original_read(selected,*args,**kwargs)
            with self.subTest(first=first), mock.patch.object(Path,'read_text',new=read):
                self.assertTrue(any('minimum' in error for error in validate_sdlc.validate(ROOT)))

    def test_minimum_check_is_bound_to_the_cargo_manifest_floor(self):
        checker = getattr(validate_sdlc,'validate_minimum_rust_job',None)
        self.assertTrue(callable(checker))
        source = (ROOT/'.github/workflows/ci.yml').read_text(encoding='utf-8')
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder);cargo=root/'Cargo.toml'
            self.assertTrue(checker(root,source))
            for value in ('"1.85"','"1.85.0"','"1.86"','"stable"','1.85','true'):
                cargo.write_text('[workspace.package]\nrust-version='+value+'\n',encoding='utf-8')
                with self.subTest(value=value):
                    errors=checker(root,source)
                    self.assertEqual(bool(errors),value not in ('"1.85"','"1.85.0"'))

    def test_repository_policy_is_concrete_and_all_workflow_setups_agree(self):
        checker = getattr(validate_sdlc, 'validate_rust_toolchain_file', None)
        steps = getattr(validate_sdlc, 'validate_rust_toolchain_steps', None)
        self.assertTrue(callable(checker), 'Canonical local compiler policy is not checked')
        self.assertTrue(callable(steps), 'CI compiler selections are not checked')
        self.assertEqual(checker(ROOT), [])
        for path in (ROOT / '.github/workflows').glob('*.yml'):
            self.assertEqual(steps(path.read_text(encoding='utf-8'), path.name), [], path.name)

    def test_root_policy_rejects_missing_alias_partial_mismatch_profile_and_extra_fields(self):
        checker = getattr(validate_sdlc, 'validate_rust_toolchain_file', None)
        self.assertTrue(callable(checker))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); path = root / 'rust-toolchain.toml'
            self.assertTrue(checker(root))
            for channel in ('stable', 'nightly', '1.96', '1.97.0', '1.96.0-beta'):
                path.write_text(f'[toolchain]\nchannel="{channel}"\nprofile="minimal"\n')
                with self.subTest(channel=channel): self.assertTrue(checker(root))
            for text in ('[toolchain]\nchannel="1.96.0"\nprofile="default"\n',
                         '[toolchain]\nchannel="1.96.0"\nprofile="minimal"\nunknown=1\n',
                         '[toolchain]\nchannel="1.96.0"\nchannel="1.96.0"\n',
                         'toolchain=true\n'):
                path.write_text(text)
                self.assertTrue(checker(root))
            path.write_text('[toolchain]\nchannel="1.96.0"\nprofile="minimal"\n')
            self.assertEqual(checker(root), [])
            (root / 'rust-toolchain').write_text('stable\n')
            self.assertTrue(checker(root), 'Legacy override must not take precedence unnoticed')

    def test_missing_floating_partial_duplicate_and_mismatched_ci_versions_fail(self):
        checker = getattr(validate_sdlc, 'validate_rust_toolchain_steps', None)
        self.assertTrue(callable(checker))
        base = '      - uses: dtolnay/rust-toolchain@' + 'a' * 40 + '\n'
        for value in (None, 'stable', 'nightly', '1.96', '1.97.0', '${{ inputs.compiler }}'):
            step = base if value is None else base + f'        with:\n          toolchain: "{value}"\n'
            with self.subTest(value=value): self.assertTrue(checker(step, 'ci.yml'))
        valid = base + '        with:\n          toolchain: "1.96.0"\n          targets: wasm32-unknown-unknown\n'
        self.assertEqual(checker(valid, 'ci.yml'), [])
        self.assertTrue(checker(valid + '          toolchain: "1.96.0"\n', 'ci.yml'))
        fuzz = base + '        with:\n          toolchain: nightly\n      - name: Install cargo-fuzz\n        run: cargo +nightly install cargo-fuzz --locked\n'
        self.assertEqual(checker(fuzz, 'fuzz.yml'), [])
        self.assertTrue(checker(fuzz.replace('cargo +nightly install', 'cargo install'), 'fuzz.yml'))
        self.assertTrue(checker(fuzz.replace('toolchain: nightly', 'toolchain: "1.96.0"'), 'fuzz.yml'))

    def test_named_or_id_first_steps_cannot_bypass_full_repository_validation(self):
        path = ROOT / '.github/workflows/ci.yml'; source = path.read_text(encoding='utf-8')
        action = 'dtolnay/rust-toolchain@4be7066ada62dd38de10e7b70166bc74ed198c30'
        original = f'      - uses: {action}\n        with:\n          toolchain: "1.96.0"\n'
        self.assertIn(original, source)
        read_text = Path.read_text
        for first in ('name: Install Rust', 'id: compiler'):
            for version in (None, 'stable', '1.96', '1.97.0', 'duplicate', '1.96.0'):
                changed = f'      - {first}\n        uses: {action}\n'
                if version == 'duplicate': changed += '        with:\n          toolchain: "1.96.0"\n          toolchain: "1.96.0"\n'
                elif version is not None: changed += f'        with:\n          toolchain: "{version}"\n'
                mutant = source.replace(original, changed, 1)
                def read(selected, *args, **kwargs):
                    return mutant if selected == path else read_text(selected, *args, **kwargs)
                with self.subTest(first=first, version=version), mock.patch.object(Path, 'read_text', new=read):
                    errors = validate_sdlc.validate(ROOT)
                if version == '1.96.0': self.assertEqual(errors, [])
                else: self.assertTrue(any('toolchain' in error for error in errors), errors)

    def test_only_action_inputs_can_select_compiler_and_comment_cannot_select_fuzz_install(self):
        action = 'dtolnay/rust-toolchain@' + 'a' * 40
        fake_env = f'      - name: Rust\n        uses: {action}\n        env:\n          toolchain: "1.96.0"\n'
        self.assertTrue(validate_sdlc.validate_rust_toolchain_steps(fake_env, 'ci.yml'))
        with_first = f'      - with:\n          toolchain: "1.96.0"\n          components: rustfmt, clippy\n        uses: {action}\n'
        self.assertEqual(validate_sdlc.validate_rust_toolchain_steps(with_first, 'ci.yml'), [])
        inline = f'      - {{uses: {action}, with: {{toolchain: "1.96.0"}}}}\n'
        self.assertTrue(validate_sdlc.validate_rust_toolchain_steps(inline, 'ci.yml'), 'Unknown grammar must fail closed')
        fuzz = f'      - uses: {action}\n        with:\n          toolchain: nightly\n        # run: cargo +nightly install cargo-fuzz --locked\n'
        self.assertTrue(validate_sdlc.validate_rust_toolchain_steps(fuzz, 'fuzz.yml'))

    def test_capture_rejects_actual_compiler_drift_before_claiming_build_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('Cargo.lock', 'package-lock.json'): (root / name).write_text('{}\n')
            for version in ('1.97.0', '1.96.0-nightly', '1.96', '1.96.0'):
                def command(args, **kwargs):
                    output = 'a' * 40 if args[0] == 'git' else (
                        f'rustc {version}' if args[0] == 'rustc' else 'cargo 1.96.0' if args[0] == 'cargo' else 'Python 3.12.12')
                    return SimpleNamespace(stdout=output)
                with self.subTest(version=version), mock.patch.object(release_evidence.subprocess, 'run', side_effect=command):
                    if version == '1.96.0': self.assertEqual(release_evidence.capture(root)['toolchains']['rustc'], 'rustc 1.96.0')
                    else:
                        with self.assertRaisesRegex(ValueError, 'toolchain'): release_evidence.capture(root)

    def test_collect_and_outer_admission_reject_stale_toolchain_receipts(self):
        manifest = {'source_sha': 'a' * 40, 'wasm_sha256': {}, 'abi_versions': {}, 'data_bundle_id': 'bundle',
                    'assets': [], 'namespace': 'releases/test/'}
        valid = {'rustc': 'rustc 1.96.0', 'cargo': 'cargo 1.96.0', 'python': 'Python 3.12.12'}
        coverage = {key: {'lines_total': 10, 'lines_covered': 9, 'minimum_lines_percent': 90,
            'denominator': [path], 'report_sha256': 'b' * 64} for key, path in (
                ('rust', 'crates/core.rs'), ('python', 'tools/a.py'), ('web', 'apps/web/a.js'))}
        outer = {key: manifest[key] for key in ('wasm_sha256', 'abi_versions', 'data_bundle_id')}
        outer.update(source_mapping={}, critical_assets={}, toolchains=valid,
                     lock_sha256={'Cargo.lock': 'c' * 64, 'package-lock.json': 'd' * 64}, coverage=coverage)
        with mock.patch.object(release_evidence, 'validate_manifest', return_value=manifest):
            release_evidence.validate_outer(outer, ROOT / 'unused.json')
            for key, value in (('rustc', 'rustc 1.97.0'), ('cargo', 'cargo 1.95.0'), ('rustc', 'rustc stable'),
                               ('rustc', 'rustc 1.96.0\nrelease: 1.97.0')):
                toolchains = valid | {key: value}
                provenance = {'schema_version': 'build-provenance.v1', 'source_sha': 'a' * 40,
                              'toolchains': toolchains, 'locks': outer['lock_sha256']}
                with self.subTest(key=key, value=value), self.assertRaisesRegex(ValueError, 'toolchain'):
                    release_evidence.collect(ROOT / 'unused.json', ROOT / 'missing-coverage-control', provenance)
                with self.assertRaisesRegex(ValueError, 'toolchain'):
                    release_evidence.validate_outer(outer | {'toolchains': toolchains}, ROOT / 'unused.json')


if __name__ == '__main__': unittest.main()
