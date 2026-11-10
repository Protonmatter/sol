"""Static admission of real startup descriptors and historical preload policy."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import validate_web_static as gate


class WebStaticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'js').mkdir()
        (self.root / 'styles.css').write_text('@media (max-width: 880px) {}', encoding='utf-8')
        (self.root / 'app.js').write_text(
            "import './js/small.js';\n// operational_readiness summaryPrimary layerLegend applicationTitle readinessChecklistItems butterflyCanvas\n",
            encoding='utf-8')
        (self.root / 'engine.js').write_text('// deferred engine', encoding='utf-8')
        (self.root / 'js/small.js').write_text('export const value=1;\n', encoding='utf-8')
        (self.root / 'js/extra.js').write_text('// @lazy-module\nexport const extra=2;\n', encoding='utf-8')
        self.ids = 'solarCanvas stageRail baseLabel termTip plainInsight summaryPrimary summaryDetail dataState ingestState readinessState layerLegend applicationTitle applicationText applicationSignals auroraOutlook selectionTitle selectionText feedHealth sourceAnchors operationalReadiness butterflyCanvas'.split()
        self.markup = ''.join(f'<div id="{name}"></div>' for name in self.ids)
        self.markup += '<link rel="stylesheet" href="styles.css"><script type="module" src="app.js"></script>'
        self.markup += '<link rel="modulepreload" href="js/small.js"><link rel="modulepreload" href="engine.js">'
        self.write()

    def write(self):
        (self.root / 'index.html').write_text(self.markup, encoding='utf-8')

    def closed_contract(self):
        self.markup = self.markup.replace('<link rel="modulepreload" href="engine.js">', '')
        self.markup += '<meta name="sol-startup-contract" content="startup-modules.v1.json">'
        value = {'schema_version': 'startup-modules.v1', 'roots': ['app.js'], 'modules': [
            {'url': name, 'path': name, 'sha256': hashlib.sha256((self.root / name).read_bytes()).hexdigest()}
            for name in ['app.js', 'js/small.js']]}
        (self.root / 'startup-modules.v1.json').write_text(json.dumps(value), encoding='utf-8')
        self.write()

    def test_historical_hints_and_closed_graph_both_pass_their_own_policy(self):
        self.assertEqual(gate.validate(self.root), [])
        self.closed_contract()
        self.assertEqual(gate.validate(self.root), [])

    def test_closed_graph_rejects_source_drift_and_extra_preload(self):
        self.closed_contract()
        self.markup += '<link rel="modulepreload" href="engine.js">'
        self.write()
        self.assertTrue(any('startup HTML' in error for error in gate.validate(self.root)))
        self.markup = self.markup.replace('<link rel="modulepreload" href="engine.js">', '')
        self.write()
        (self.root / 'js/small.js').write_text('export const value=2;', encoding='utf-8')
        self.assertTrue(any('startup source hash drift' in error for error in gate.validate(self.root)))

    def test_lazy_data_cannot_be_preloaded_or_statically_imported_by_entry_or_module(self):
        for owner in ['app.js', 'engine.js', 'sw.js', 'js/small.js']:
            file = self.root / owner
            original = file.read_bytes() if file.exists() else None
            file.write_text("import './extra.js';", encoding='utf-8')
            self.assertTrue(any('lazy module js/extra.js is statically imported' in error for error in gate.validate(self.root)), owner)
            if original is None:
                file.unlink()
            else:
                file.write_bytes(original)
        self.markup += '<link rel="modulepreload" href="js/extra.js">'
        self.write()
        self.assertTrue(any('must not be modulepreloaded' in error for error in gate.validate(self.root)))

    def test_missing_entry_asset_binding_and_responsive_breakpoint_are_errors(self):
        (self.root / 'index.html').unlink()
        self.assertTrue(any('not found' in error for error in gate.validate(self.root)))
        self.write()
        self.markup = self.markup.replace('id="solarCanvas"', 'id="wrongCanvas"')
        self.markup += '<script type="module" src="missing.js"></script><details class="research-panel" open></details>'
        self.write()
        (self.root / 'styles.css').write_text('', encoding='utf-8')
        (self.root / 'app.js').write_text('', encoding='utf-8')
        errors = gate.validate(self.root)
        for message in ['missing ids', 'hidden by default', 'missing asset', 'responsive', 'missing operational_readiness']:
            self.assertTrue(any(message in error for error in errors), message)
        (self.root / 'styles.css').unlink()
        (self.root / 'app.js').unlink()
        errors = gate.validate(self.root)
        self.assertIn('styles.css not found', errors)
        self.assertIn('app.js not found', errors)

    def test_cli_success_and_failure_exit_codes_preserve_diagnostics(self):
        with patch.object(sys, 'argv', ['validate_web_static.py', '--root', str(self.root)]):
            self.assertEqual(gate.main(), 0)
            (self.root / 'index.html').unlink()
            with self.assertLogs('validate_web_static', level='ERROR'):
                self.assertEqual(gate.main(), 1)
