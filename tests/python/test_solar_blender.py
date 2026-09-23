import importlib.util
import math
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('solar_common', Path(__file__).resolve().parents[2] / 'tools/blender/solar_common.py')
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)

class SolarAuthoringTests(unittest.TestCase):
    def test_transfer_limits_and_absorption(self):
        self.assertEqual(common.transfer(2, 0, 3), 6)
        self.assertAlmostEqual(common.transfer(2, 1e-12, 3), 6, places=10)
        self.assertAlmostEqual(common.transfer(2, 1, 3, 4), 2 + 2*math.exp(-3))
    def test_transfer_rejects_nonphysical(self):
        for value in (-1, float('nan'), float('inf')):
            with self.assertRaises(ValueError): common.transfer(value, 1, 1)
    def test_export_path_and_hash(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root/'a').write_text('test')
            self.assertEqual(common.checked_file(root, 'a', common.sha256(root/'a')), root/'a')
            with self.assertRaises(ValueError): common.checked_file(root, '../a', '0'*64)
            with self.assertRaises(ValueError): common.checked_file(root, 'a', '0'*64)
    def test_packet_bounds(self):
        p = dict(schema_version='solar-render-packet.v1', frame='carrington_z_north_west_positive', radius_km=695700, relative_emission=True, time_s=0, surface=dict(wavelength_nm=550, quiet_temperature_k=5772, granule_km=1000, lifetime_s=1200, limb_u=.6), strands=[])
        common.validate_packet(p)
        p['strands'] = [dict(points=[[1,0,0,.01],[float('nan'),0,0,.01]],emission_relative=1)]
        with self.assertRaises(ValueError): common.validate_packet(p)



class ReviewedAdmissionTests(unittest.TestCase):
    def fixture(self, root):
        import json
        packet={'schema_version':'solar-render-packet.v1','recipe_id':'active-v1','recipe_hash':'r'*64,'seed':42,'time_s':900}
        path=root/'solar-dynamic/active-v1/t00900/packet.json'; path.parent.mkdir(parents=True);path.write_text(json.dumps(packet))
        entry=dict(path=path.relative_to(root).as_posix(),bytes=path.stat().st_size,sha256=common.sha256(path))
        manifest=dict(schema_version='solar-dynamic-appearance.v1',id='active-v1',seed=42,recipe_hash='r'*64,frame='carrington_z_north_west_positive',radius_km=695700,rotation=dict(coefficients_deg_per_day=[14.713,-2.396,-1.787],frame_rate_deg_per_day=14.1844),packet=entry,keyframes=[dict(time_s=900,packet=entry)],volumes=[],surface={})
        return path,packet,manifest
    def test_admits_keyframe_and_identical_duplicate(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);path,packet,m=self.fixture(root)
            result=common.admit_manifest(root,m,path,packet)
            self.assertEqual(result['packet']['sha256'],common.sha256(path))
            m['keyframes'][0]['time_s']=0
            with self.assertRaises(ValueError):common.admit_manifest(root,m,path,packet)
    def test_rejects_packet_hash_unlisted_and_manifest_semantics(self):
        import copy
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);path,packet,m=self.fixture(root)
            for key,value in [('schema_version','bad'),('frame','bad'),('radius_km',700000),('recipe_hash','bad')]:
                bad=copy.deepcopy(m);bad[key]=value
                with self.assertRaises(ValueError):common.admit_manifest(root,bad,path,packet)
            bad=copy.deepcopy(m);bad['packet']['sha256']='0'*64
            with self.assertRaises(ValueError):common.admit_manifest(root,bad,path,packet)
            with self.assertRaises(ValueError):common.admit_manifest(root,m,root/'missing.json',packet)
    def test_grid_semantics_and_explicit_temporal_policy(self):
        e=dict(dimensions=[4,4,4],dtype='float32-le',layout='x-fastest-y-next-z-slowest',bounds=[-2.5,2.5],units='relative_emission_per_solar_radius',voxel_centers=True,time_s=0,temporal_authority='time-averaged illustrative background; rotation transform only')
        self.assertEqual(common.validate_grid_semantics(e,900)['size'],4)
        for key,value in [('dtype','float64'),('layout','z-fastest'),('bounds',[-3,3]),('units','per-meter'),('voxel_centers',False),('dimensions',[4,4,5]),('temporal_authority','instantaneous')]:
            with self.assertRaises(ValueError):common.validate_grid_semantics({**e,key:value},900)
    def test_rotation_authority_cannot_silently_change(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);path,packet,m=self.fixture(root)
            m['rotation']['frame_rate_deg_per_day']=0
            with self.assertRaises(ValueError):common.admit_manifest(root,m,path,packet)
    def test_surface_semantics_rejects_relabelled_time(self):
        e=dict(dimensions=[512,256],dtype='float32-le',longitude_positive='west',latitude_row_zero='south',texel_centers=True,units='relative_emission',time_s=0)
        common.validate_surface_semantics(e,0)
        for key,value in [('dtype','float64'),('longitude_positive','east'),('latitude_row_zero','north'),('texel_centers',False),('units','temperature'),('time_s',900)]:
            with self.assertRaises(ValueError):common.validate_surface_semantics({**e,key:value},0)
    def test_reference_bounds_and_all_color_finiteness(self):
        common.validate_reference_bounds(512,512,64)
        with self.assertRaises(ValueError):common.validate_reference_bounds(16384,512,64)
        with self.assertRaises(ValueError):common.validate_reference_bounds(512,512,999999)
        for channel in (0,1,2):
            rgba=[1.,1.,1.,1.];rgba[channel]=float('nan')
            with self.assertRaises(ValueError):common.rgb_statistics(rgba)

class GaussianGainTests(unittest.TestCase):
    def test_segment_gain_mean_and_altitude(self):
        self.assertAlmostEqual(common.gaussian_emissivity(4,[1,0,0],[1,0,0],.2,.8),2)
        self.assertAlmostEqual(common.gaussian_emissivity(4,[1.3,0,0],[1.3,0,0],.2,.8),2*math.exp(-1))
        self.assertEqual(common.gaussian_emissivity(4,[1,0,0],[1,0,0],0,0),0)
    def test_legacy_gain_defaults_and_invalid_inputs(self):
        self.assertEqual(common.gaussian_emissivity(2,[1,0,0],[1,0,0]),2)
        for gain in [-.1,1.1,float('nan')]:
            with self.assertRaises(ValueError): common.gaussian_emissivity(2,[1,0,0],[1,0,0],gain,1)

class SurfaceTransferIdentityTests(unittest.TestCase):
    def test_hierarchical_surface_transfer_identity(self):
        e=dict(dimensions=[2048,1024],dtype='float32-le',longitude_positive='west',latitude_row_zero='south',texel_centers=True,units='relative_emission',time_s=0,transfer_id='hierarchical-euv-linear-v1',temporal_policy='absolute-differential-unadvection-already-applied')
        self.assertEqual(common.validate_surface_semantics(e,0,expected_transfer_id='hierarchical-euv-linear-v1')['transfer_id'],'hierarchical-euv-linear-v1')
        for bad in ['euv-network-exp-v1','unknown',None]:
            with self.assertRaises(ValueError):common.validate_surface_semantics({**e,'transfer_id':bad},0,expected_transfer_id='hierarchical-euv-linear-v1')
        with self.assertRaises(ValueError):common.validate_surface_semantics({**e,'temporal_policy':'unposed'},0,expected_transfer_id='hierarchical-euv-linear-v1')

class SurfaceAliasTests(unittest.TestCase):
    fixture=ReviewedAdmissionTests.fixture
    def test_base_alias_and_reference_supplemental_metadata(self):
        import json
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);path,packet,m=self.fixture(root);packet['emission_model']={'kind':'hierarchical_euv_v1'};path.write_text(json.dumps(packet));m['packet'].update(bytes=path.stat().st_size,sha256=common.sha256(path))
            surface=root/'solar-dynamic/active-v1/surface.f32';surface.write_bytes(bytes(64))
            base=dict(path=surface.relative_to(root).as_posix(),bytes=64,sha256=common.sha256(surface),dimensions=[4,4],dtype='float32-le',longitude_positive='west',latitude_row_zero='south',texel_centers=True,units='relative_emission',time_s=900,transfer_id='hierarchical-euv-linear-v1')
            m['surface']=base;m['surface_keyframes']=[{**base,'recipe_hash':packet['recipe_hash'],'temporal_policy':'absolute-differential-unadvection-already-applied','resolved_visibility':1}]
            admitted=common.admit_manifest(root,m,path,packet,surface_path=surface)
            self.assertEqual(admitted['surface']['recipe_hash'],packet['recipe_hash'])
            m['surface_keyframes'][0]['dtype']='float64-le'
            with self.assertRaises(ValueError):common.admit_manifest(root,m,path,packet,surface_path=surface)

if __name__ == '__main__': unittest.main()
