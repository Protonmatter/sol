"""Solar v3 cross-field/provenance controls; structural intake stays schema-gated."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import snapshot_semantics as semantics


class SnapshotSemanticControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.original=json.loads((ROOT/'apps/web/data/latest-state.json').read_bytes())

    def rejected(self,mutate,reason):
        value=copy.deepcopy(self.original);mutate(value);before=copy.deepcopy(value)
        errors=semantics.semantic_checks(value)
        self.assertTrue(any(reason in error for error in errors),(reason,errors))
        self.assertEqual(value,before,'semantic validation must not repair or mutate the input')

    def test_current_snapshot_passes_and_outer_structure_is_delegated_safely(self):
        self.assertEqual(semantics.semantic_checks(self.original),[])
        self.assertEqual(semantics.semantic_checks([]),[])
        for key in ('run','coordinates','grid','fields'):
            with self.subTest(key=key):self.rejected(lambda v:v.update({key:[1]}),'must be an object')
        self.rejected(lambda v:v['fields'].update(confidence=[1]),'fields.confidence must be an object')

    def test_versions_units_sources_and_duration_cannot_misdescribe_the_model(self):
        for key,value,reason in [('schema_version','solar-state-snapshot.v2','historical v2'),
                ('calibration_state','calibrated_gauss','normalized units'),('source_mode',' ','non-empty string')]:
            with self.subTest(key=key):self.rejected(lambda v:v.update({key:value}),reason)
        self.rejected(lambda v:v['run'].update(steps=1,dt_hours=1,time_seconds=0),'!= steps*dt_hours')
        self.rejected(lambda v:v['run'].update(steps=1e308,dt_hours=1e308,time_seconds=0),'finite duration')

    def test_coordinate_conventions_and_grid_spacing_are_explicit(self):
        for key,value,reason in [('frame','unknown','heliographic_carrington'),('longitude_positive','east','must be west'),
                ('rotation_reference_deg_per_day',15.,'must be 14.1844'),('central_meridian_longitude_deg',360.,'[0, 360)')]:
            with self.subTest(key=key):self.rejected(lambda v:v['coordinates'].update({key:value}),reason)
        for key in ('dlon_deg','dlat_deg'):
            with self.subTest(key=key):self.rejected(lambda v:v['grid'].update({key:999.}),key+' is inconsistent')

    def test_field_lengths_finite_values_and_confidence_limits_are_enforced(self):
        self.rejected(lambda v:v['fields']['confidence']['values'].pop(),'grid length')
        for value in (float('nan'),True):
            with self.subTest(value=value):
                self.rejected(lambda v:v['fields']['confidence']['values'].__setitem__(0,value),'finite JSON numbers')
        self.rejected(lambda v:v['fields']['confidence']['values'].__setitem__(0,1.01),'must be in [0, 1]')

    def test_layer_and_region_ownership_cannot_be_duplicated_or_detached(self):
        self.rejected(lambda v:v['layers'].append(copy.deepcopy(v['layers'][0])),'layers ids must be unique')
        self.rejected(lambda v:v['layers'][0].update(kind='unknown'),'kind is invalid')
        self.rejected(lambda v:v.update(layers=[]),'layers missing field declaration')
        self.rejected(lambda v:v['active_regions'].append(copy.deepcopy(v['active_regions'][0])),'active_regions ids must be unique')
        self.rejected(lambda v:v['active_regions'][0].update(birth=[1]),'birth/model_position must be objects')
        self.rejected(lambda v:v['active_regions'][0]['birth'].update(time_seconds=1.),'birth is in the future')
        self.rejected(lambda v:v['active_regions'][0]['model_position'].update(at_time_seconds=1.),'current time/latitude mismatch')
        self.rejected(lambda v:v['active_regions'][0]['model_position'].update(lon_deg=0.),'longitude inconsistent')
        def imprecise(v):
            v['run'].update(steps=1,dt_hours=1e300/3600,time_seconds=1e300)
            v['active_regions'][0]['model_position']['at_time_seconds']=1e300
        self.rejected(imprecise,'longitude exceeds numeric precision')

    def test_scalar_uncertainty_time_and_noise_status_cannot_drift(self):
        self.rejected(lambda v:v['uncertainty']['activity'].update(at_time_seconds=1.),'at_time_seconds must equal')
        self.rejected(lambda v:v['uncertainty']['activity'].update(last_analysis_time_seconds=1.),'last analysis time is in the future')
        self.rejected(lambda v:v['uncertainty']['activity'].update(process_noise_per_day=.1),'process noise status disagrees')

    def test_readiness_and_provenance_flags_reflect_the_attached_observations(self):
        self.rejected(lambda v:v['operational_readiness']['data_state'].update(source_mode='other'),'must match source_mode')
        self.rejected(lambda v:v['operational_readiness']['data_state'].update(observation_mode='none'),'non-none observation_mode')
        def absent(v):
            v['observations']=[]
            v['operational_readiness']['data_state'].update(observation_mode='fixture',live_data_present=True)
        self.rejected(absent,'observation_mode must be none')
        self.rejected(absent,'cannot be true without observations')
        self.rejected(lambda v:v['operational_readiness']['gates'].append(copy.deepcopy(v['operational_readiness']['gates'][0])),
                      'gates ids must be unique')
        self.rejected(lambda v:v['operational_readiness'].update(gates=[]),'gates missing')
        self.rejected(lambda v:v['observations'][0]['frames'][0].update(provenance=None),'public_data_provenance gate must reflect')

    def test_observation_reports_reject_unattributed_or_incomplete_frames(self):
        baseline=self.original['observations'][0]
        self.assertEqual(semantics.validate_observation_report(0,baseline),[])
        self.assertTrue(semantics.validate_observation_report(0,[]))
        mutations=[lambda v:v.update(schema_version='other'),lambda v:v.update(source_mode=''),
            lambda v:v.update(frames=None),lambda v:v.update(frames=[None]),
            lambda v:v['frames'][0].update(layer_kind='unknown'),lambda v:v['frames'][0].update(source_mode=''),
            lambda v:v['frames'][0].update(provenance=None),lambda v:v['frames'][0]['provenance'].update(source='unknown'),
            lambda v:v['frames'][0]['provenance'].pop('active'),lambda v:v['frames'][0]['provenance'].update(raw_source_metadata=[]),
            lambda v:v['frames'][0].update(quality_flags=[])]
        for index,mutate in enumerate(mutations):
            value=copy.deepcopy(baseline);mutate(value)
            with self.subTest(index=index):self.assertTrue(semantics.validate_observation_report(0,value))


if __name__=='__main__':unittest.main()
