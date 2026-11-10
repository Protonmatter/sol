"""The offline parity gate must prove its labels as well as its vector arithmetic."""
from __future__ import annotations
import contextlib
import copy
import io
import json
import math
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import validate_accuracy_evidence as gate

# Actual example stdout recorded on 2026-11-03, retained only as parser/gate unit
# input. The real native calculation is exercised separately by the CLI check.
LEGACY_NATIVE_STDOUT = """0 5000 -4.327748587281408 -3.3686061864971593 0.11833825321302116
0 -5000 -4.7888470241593035 -2.484139647556095 0.12775014224013442
1 5000 7.097459890104609 -6.895210460256631 -0.2494808716294735
1 -5000 -8.36349069512307 4.390659422634707 0.16433556473681252
2 5000 -12.789221315670744 13.374064118701202 0.18478170781375378
2 -5000 -11.04731186792695 14.826825342539728 0.230117589465871
3 5000 10.618449875705343 27.8318689616276 -0.8207748565108582
3 -5000 -30.22443599671535 -0.6420279710176731 0.701684864492188
"""

# Actual TOP08 example output captured after the coefficient-only update.
NATIVE_STDOUT = """0 5000 -4.328421722441972 -3.368214104039359 0.11803610504984723
0 -5000 -4.789775024690532 -2.4830653503241225 0.12736789929970024
1 5000 7.099070269517132 -6.898651213579631 -0.24955422929025145
1 -5000 -8.360720787954042 4.387521228447004 0.16447945686760235
2 5000 -12.787336219301029 13.37617691650921 0.18528392383096298
2 -5000 -11.048803153807095 14.826532220329725 0.22977684299068804
3 5000 10.622595219014869 27.829845204071386 -0.8211285685220632
3 -5000 -30.226266343327087 -0.6439614601959116 0.7018955203478902
"""


class AccuracyEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT/'apps/web/data/accuracy-evidence.json').read_text())
        cls.schema = json.loads((ROOT/'docs/accuracy-evidence-v1.schema.json').read_text())
        cls.native = NATIVE_STDOUT
        cls.source = (ROOT/'crates/solar-ephemeris/src/top2013.rs').read_bytes()
        cls.archived = (ROOT/'tests/fixtures/top2013-source-parity-25efcd5.rs.txt').read_bytes()
        cls.legacy_catalog = json.loads((ROOT/'tests/fixtures/accuracy-evidence-top2013-normal-20261106.json').read_text())
        cls.upstream = {sample: record['reference']['vector_au']
                        for sample, record in zip(gate.SAMPLES, cls.catalog['records'])}

    def run_catalog(self, catalog, native=None, archived=None):
        calls = []
        def run(command, **_options):
            calls.append(command)
            if command[0] == 'cargo':
                return SimpleNamespace(stdout=self.native if native is None else native)
            if command[:2] == ['git','show']:
                return SimpleNamespace(stdout=self.archived if archived is None else archived)
            raise AssertionError('Unexpected evidence command')
        with mock.patch.object(gate.json,'loads',side_effect=[catalog,self.schema]), \
             mock.patch.object(gate,'upstream_vectors',return_value=self.upstream), \
             mock.patch.object(gate.subprocess,'run',side_effect=run), contextlib.redirect_stdout(io.StringIO()):
            result = gate.main()
        return result,calls

    def test_current_catalog_replays_recorded_native_parity_output(self):
        self.assertEqual(self.run_catalog(copy.deepcopy(self.catalog))[0],0)

    def test_current_comment_can_change_while_archived_reference_remains_immutable(self):
        read_bytes = Path.read_bytes
        current = ROOT / gate.SOURCE_PATH
        def read(path):
            return self.source + b'\n// unrelated documentation correction\n' if path == current else read_bytes(path)
        with mock.patch.object(Path, 'read_bytes', new=read):
            self.assertEqual(self.run_catalog(copy.deepcopy(self.catalog))[0], 0)

    def test_changed_current_literals_or_archived_bytes_cannot_pass(self):
        read_bytes = Path.read_bytes
        current = ROOT / gate.SOURCE_PATH
        changed = self.source.replace(b'-4.32842172', b'-4.42842172', 1)
        self.assertNotEqual(changed, self.source)
        def read(path): return changed if path == current else read_bytes(path)
        with mock.patch.object(Path, 'read_bytes', new=read), self.assertRaises(ValueError):
            self.run_catalog(copy.deepcopy(self.catalog))
        with mock.patch.object(Path, 'read_bytes', new=lambda p: self.archived if p == current else read_bytes(p)), \
             self.assertRaises(ValueError):
            self.run_catalog(copy.deepcopy(self.legacy_catalog), native=LEGACY_NATIVE_STDOUT,
                             archived=self.archived + b'\n')

    def test_historical_catalogue_remains_reproducible_only_with_its_historical_source(self):
        with self.assertRaises(ValueError):
            self.run_catalog(copy.deepcopy(self.legacy_catalog), native=LEGACY_NATIVE_STDOUT)
        read_bytes = Path.read_bytes
        current = ROOT / gate.SOURCE_PATH
        with mock.patch.object(Path, 'read_bytes', new=lambda p: self.archived if p == current else read_bytes(p)):
            self.assertEqual(self.run_catalog(copy.deepcopy(self.legacy_catalog), native=LEGACY_NATIVE_STDOUT)[0], 0)

    def test_current_upstream_reference_tuple_and_vectors_cannot_be_changed(self):
        for field, value in [('git_revision','a'*40), ('path','src/top2013/dist/10-extreme/src/top2013.js'),
                             ('sha256_lf','a'*64), ('symbol','unrelated')]:
            catalog = copy.deepcopy(self.catalog); catalog['records'][0]['reference'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.run_catalog(catalog)
        catalog = copy.deepcopy(self.catalog); catalog['records'][0]['reference']['vector_au'][0] += 1
        with self.assertRaises(ValueError):
            self.run_catalog(catalog)

    def test_source_cartesian_axes_and_invalid_domains(self):
        self.assertEqual(gate.source_cartesian([1,0,0,0,0,0]), [1,0,0])
        self.assertEqual(gate.source_cartesian([2,math.pi/2,0,0,0,0]), [0,2,0])
        self.assertEqual(gate.source_cartesian([2,math.pi/2,0,0,math.sqrt(.5),0]), [0,0,2])
        for values in [None, [], [True,0,0,0,0,0], [1,float('nan'),0,0,0,0],
                       [-1,0,0,0,0,0], [1,0,1,0,0,0], [1,0,0,0,2,0]]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                gate.source_cartesian(values)

    def test_source_helper_output_requires_exact_identity_complete_samples_and_finite_elements(self):
        original = {'schema_version':'top2013-source-elements.v1',
                    'source':{**gate.UPSTREAM_REFERENCE,'git_blob':gate.UPSTREAM_BLOB},
                    'samples':[{'index':i,'years':y,'elements':[1,0,0,0,0,0]} for i,y in gate.SAMPLES]}
        def evaluate(document):
            with mock.patch.object(gate.subprocess,'run',return_value=SimpleNamespace(stdout=json.dumps(document))):
                return gate.upstream_vectors()
        self.assertEqual(len(evaluate(original)), 8)
        mutations = [lambda d: d['source'].__setitem__('git_blob','0'*40),
                     lambda d: d.__setitem__('samples','not an array'),
                     lambda d: d['samples'].pop(), lambda d: d['samples'].__setitem__(0,None),
                     lambda d: d['samples'][0].__setitem__('index',False),
                     lambda d: d['samples'][0].__setitem__('years',0),
                     lambda d: d['samples'][0].__setitem__('elements',[1,float('inf'),0,0,0,0])]
        for mutate in mutations:
            value = copy.deepcopy(original); mutate(value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                evaluate(value)

    def test_relabelled_source_samples_are_not_qualified_as_other_evidence(self):
        for field,value in [('method','independent_reference'),('quantity','observer_range_km'),
            ('time_scale','UTC'),('observer_domain','terrestrial')]:
            with self.subTest(field=field):
                catalog=copy.deepcopy(self.catalog);catalog['records'][0][field]=value
                with self.assertRaises(ValueError):
                    self.run_catalog(catalog)
        for section,field,value in [('reference','symbol','tests::unrelated'),
            ('measured_error','metric','great_circle_pointing_arcsec'),('measured_error','acceptance_threshold',1000)]:
            with self.subTest(field=field):
                catalog=copy.deepcopy(self.catalog);catalog['records'][0][section][field]=value
                with self.assertRaises(ValueError):
                    self.run_catalog(catalog)

    def test_duplicate_or_blank_reference_ids_cannot_pass_the_registry_gate(self):
        for value in [self.catalog['records'][1]['id'],'   ']:
            catalog=copy.deepcopy(self.catalog);catalog['records'][0]['id']=value
            with self.subTest(value=value),self.assertRaises(ValueError):
                self.run_catalog(catalog)

    def test_nonfinite_native_vector_cannot_pass_by_nan_comparison(self):
        rows=self.native.splitlines();fields=rows[0].split();fields[2]='NaN';rows[0]=' '.join(fields)
        with self.assertRaises(ValueError):
            self.run_catalog(copy.deepcopy(self.catalog),'\n'.join(rows))

    def test_body_and_epoch_binding_are_explicit_validation_not_optimization_sensitive_asserts(self):
        for field,value in [('body','Sun'),('tested_epochs_jd',[2451545])]:
            catalog=copy.deepcopy(self.catalog);catalog['records'][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                self.run_catalog(catalog)


if __name__=='__main__':
    unittest.main()
