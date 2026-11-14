"""Source documentation must stay checked after local build/coverage generation."""
from __future__ import annotations

import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import validate_docs


class DocumentationScanTests(unittest.TestCase):
    def run_scan(self, root, *files):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return validate_docs.main(['--root', str(root), *map(str, files)])

    def test_ignored_generated_root_copies_do_not_break_default_source_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'README.md').write_text('# Source\n', encoding='utf-8')
            for name in ('build', 'coverage'):
                folder = root / name / 'copied-source'; folder.mkdir(parents=True)
                (folder / 'README.md').write_text('# Copy\n\n[Old relative link](../../missing.md)\n', encoding='utf-8')
            self.assertEqual(self.run_scan(root), 0)
            # Explicitly requested generated documents still receive every check.
            self.assertEqual(self.run_scan(root, root / 'build/copied-source/README.md'), 1)

    def test_real_nested_build_and_coverage_guides_still_fail_on_broken_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('build', 'coverage'):
                folder = root / 'docs' / name; folder.mkdir(parents=True)
                (folder / 'guide.md').write_text('# Guide\n\n[Source](source.md)\n', encoding='utf-8')
                self.assertEqual(self.run_scan(root), 1)
                (folder / 'source.md').write_text('# Source\n', encoding='utf-8')
                self.assertEqual(self.run_scan(root), 0)


if __name__ == '__main__': unittest.main()
