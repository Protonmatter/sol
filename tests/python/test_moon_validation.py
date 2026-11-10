"""Adversarial intake for the real moon validator using retained Phobos samples."""
from __future__ import annotations

import contextlib
import csv
import hashlib
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import validate_moons as gate


class MoonValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables={}
        for name in ('horizons_satellite_elements.csv','horizons_satellite_vectors.csv','jpl_satellite_physical.csv'):
            with (gate.SRC/name).open(encoding='utf-8',newline='') as stream:
                reader=csv.DictReader(stream)
                cls.tables[name]=(reader.fieldnames,[r for r in reader if r['Satellite']=='Phobos'])

    def validate(self,mutate=None,*,computed=None,regeneration_status=0):
        tables={name:(fields,[dict(r) for r in rows]) for name,(fields,rows) in self.tables.items()}
        vectors=tables['horizons_satellite_vectors.csv'][1]
        del vectors[100:]
        if mutate:mutate(tables)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)
            for name,(fields,rows) in tables.items():
                with (source/name).open('w',encoding='utf-8',newline='') as stream:
                    writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader();writer.writerows(rows)
            output=io.StringIO()
            # Canonical generation is a separate acceptance gate. This unit
            # exercises the actual numerical validator and data parser only.
            with (mock.patch.object(gate,'SRC',source),mock.patch.object(gate.subprocess,'run',return_value=
                    subprocess.CompletedProcess([],regeneration_status,stdout='',stderr='generator boundary failure' if regeneration_status else '')),
                    contextlib.redirect_stdout(output),contextlib.ExitStack() as stack):
                if computed is not None:stack.enter_context(mock.patch.object(gate,'position',return_value=computed))
                result=gate.main([])
        return result,output.getvalue()

    def test_original_retained_phobos_subset_passes_fixed_accuracy_budgets(self):
        result,output=self.validate()
        self.assertEqual(result,0)
        self.assertIn('100 interleaved Horizons checks',output)
        self.assertEqual(gate.MAX_ANGLE_DEG,.15)
        self.assertEqual(gate.MAX_RADIUS_FRAC,.0025)

    def test_complete_retained_corpus_keeps_numerical_results_at_generator_boundary(self):
        sources=list(gate.SRC.glob('*.csv'))
        before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
        output=io.StringIO()
        with (mock.patch.object(gate.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout='',stderr='')),
                contextlib.redirect_stdout(output)):
            result=gate.main([])
        self.assertEqual(result,0,output.getvalue())
        self.assertIn('21 moons',output.getvalue());self.assertIn('11985 interleaved Horizons checks',output.getvalue())
        self.assertEqual(before,{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources})

    def test_nonfinite_or_malformed_reference_coordinates_and_epochs_fail(self):
        for key,token in [('x_km','NaN'),('y_km','inf'),('z_km','-inf'),('x_km','1e999'),
                          ('x_km','bad'),('jd_tdb','NaN'),('jd_tdb','inf'),('jd_tdb','bad')]:
            def change(tables):tables['horizons_satellite_vectors.csv'][1][0][key]=token
            with self.subTest(key=key,token=token):
                result,output=self.validate(change)
                self.assertEqual(result,1,output)
                self.assertIn('Phobos',output)

    def test_zero_or_unrepresentable_reference_geometry_fails_cleanly(self):
        for value in ('0','1e308'):
            def change(tables):
                for key in ('x_km','y_km','z_km'):tables['horizons_satellite_vectors.csv'][1][0][key]=value
            with self.subTest(value=value):
                result,output=self.validate(change)
                self.assertEqual(result,1,output)
                self.assertIn('vector',output)

    def test_invalid_computed_position_cannot_be_counted_as_reference_success(self):
        for got in ((float('nan'),1.,1.),(float('inf'),1.,1.),(0.,0.,0.),(1e308,1e308,1e308)):
            with self.subTest(got=got):
                result,output=self.validate(computed=got)
                self.assertEqual(result,1,output)

    def test_duplicate_or_misidentified_reference_rows_fail(self):
        def duplicate(tables):
            rows=tables['horizons_satellite_vectors.csv'][1];rows.append(dict(rows[0]))
        def wrong_code(tables):tables['horizons_satellite_vectors.csv'][1][0]['Code']='501'
        for mutate in (duplicate,wrong_code):
            with self.subTest(mutate=mutate.__name__):
                result,output=self.validate(mutate)
                self.assertEqual(result,1,output)

    def test_out_of_window_and_training_knots_are_rejected(self):
        for token in ('1','2459215.500000'):
            def change(tables):tables['horizons_satellite_vectors.csv'][1][0]['jd_tdb']=token
            with self.subTest(jd=token):
                result,output=self.validate(change)
                self.assertEqual(result,1,output)

    def test_too_few_samples_or_wrong_body_is_not_a_valid_reference_population(self):
        def fewer(tables):tables['horizons_satellite_vectors.csv'][1].pop()
        def unknown(tables):tables['horizons_satellite_vectors.csv'][1][0]['Satellite']='unknown'
        for mutate in (fewer,unknown):
            with self.subTest(mutate=mutate.__name__):self.assertEqual(self.validate(mutate)[0],1)

    def test_real_accuracy_failure_and_generator_failure_propagate(self):
        def offset(tables):tables['horizons_satellite_vectors.csv'][1][0]['x_km']='100000'
        for kwargs in ({'mutate':offset},{'regeneration_status':1}):
            with self.subTest(kwargs=kwargs):self.assertEqual(self.validate(**kwargs)[0],1)


if __name__=='__main__':unittest.main()
