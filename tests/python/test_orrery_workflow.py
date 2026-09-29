from __future__ import annotations

import unittest
from pathlib import Path

import validate_sdlc

ROOT = Path(__file__).resolve().parents[2]


class OrreryWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / '.github/workflows/orrery-refresh.yml').read_text(encoding='utf-8')

    def test_repository_workflow_is_bounded(self):
        self.assertEqual(validate_sdlc.validate_orrery_workflow(self.source), [])

    def test_permission_and_trigger_expansion_rejected(self):
        mutations = (
            ('  contents: read', '  contents: write'),
            ('  workflow_dispatch:', '  pull_request_target:'),
            ('  workflow_dispatch:', '  pull_request:'),
            ("vars.ORRERY_REFRESH_PUBLISH_ENABLED == 'true'", 'true'),
            ("if: github.ref == 'refs/heads/master'", 'if: always()'),
            ('    needs: candidate', '    needs: []'),
            ('  cancel-in-progress: false', '  cancel-in-progress: true'),
            ('          persist-credentials: false', '          persist-credentials: true'),
            ('          ref: ${{ github.sha }}', '          ref: automation/daily-orrery'),
            ('      contents: write', '      contents: write\n      actions: write'),
            ('          name: orrery-candidate-${{ github.run_id }}-${{ github.run_attempt }}',
             '          name: orrery-candidate-1-1'),
            ('--expected-base "$GITHUB_SHA" --expected-manifest-sha256 "$CANDIDATE_MANIFEST_SHA256"',
             '--expected-base "$GITHUB_SHA"'),
        )
        for before, after in mutations:
            with self.subTest(before=before):
                self.assertIn(before, self.source)
                self.assertTrue(validate_sdlc.validate_orrery_workflow(self.source.replace(before, after)))

    def test_new_privileged_job_and_conditional_bypass_rejected(self):
        for extra in ('\n  extra:\n    permissions:\n      contents: write\n',
                      '\n  extra:\n    runs-on: ubuntu-latest\n'):
            self.assertTrue(validate_sdlc.validate_orrery_workflow(self.source + extra))
        self.assertTrue(validate_sdlc.validate_orrery_workflow(self.source.replace(
            '    needs: candidate', '    needs: candidate\n    continue-on-error: true')))


if __name__ == '__main__':
    unittest.main()
