"""Build admission tests for numeric terrain and solar reconstruction assets."""
import copy
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from validate_physical_assets import validate_physical_source,validate_terrain,validate_solar
from build_web import build_site


class PhysicalAssetsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'web';self.root.mkdir()
        self.solar=json.loads((ROOT/'apps/web/solar-appearance.v1.json').read_text())
        self.terrain=json.loads((ROOT/'apps/web/terrain-assets.v1.json').read_text())

    def install(self):
        for name in ('solar-appearance.v1.json','terrain-assets.v1.json','js/solarAppearance.js',
                     'js/solarAppearanceManifest.js','js/terrainAssets.js','js/terrainGeometry.js',
                     self.solar['atlas']['path'],*[r['path'] for r in self.terrain['references']]):
            destination=self.root/name;destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(ROOT/'apps/web'/name,destination)

    def test_historical_source_without_physical_runtime_remains_compatible(self):
        self.assertEqual(validate_physical_source(self.root),{'terrain':0,'solar':0})

    def test_runtime_requires_manifest_before_staging_or_wasm_work(self):
        (self.root/'js').mkdir();(self.root/'js/solarAppearance.js').write_text('// runtime')
        with self.assertRaisesRegex(ValueError,'solar.*manifest'):
            validate_physical_source(self.root)
        with self.assertRaisesRegex(ValueError,'solar.*manifest'):
            build_site(self.root,Path(self.temp.name)/'wasm',Path(self.temp.name)/'out',release_id='physical-test',
                       source_sha='a'*40,repository='owner/repo',run_id=1,run_attempt=1,schemas=['solar-state-snapshot.v2','ephemeris-snapshot.v2'])
        self.assertFalse((Path(self.temp.name)/'out').exists())

    def test_current_products_and_generated_modules_admit(self):
        self.install();self.assertEqual(validate_physical_source(self.root),{'terrain':2,'solar':1})

    def test_generated_browser_data_drift_is_rejected(self):
        self.install();file=self.root/'js/solarAppearanceManifest.js'
        file.write_text(file.read_text().replace('1188','1189')+'// drift\n')
        with self.assertRaisesRegex(ValueError,'browser.*solar|solar.*browser'): validate_physical_source(self.root)

    def test_asset_hash_and_size_are_enforced(self):
        self.install();file=self.root/self.solar['atlas']['path'];raw=file.read_bytes();file.write_bytes(raw[:-1]+b'X')
        with self.assertRaisesRegex(ValueError,'hash|identity'): validate_solar(self.solar,self.root)

    def test_terrain_bounds_must_describe_actual_decoded_data(self):
        self.install();bad=copy.deepcopy(self.terrain);bad['references'][0]['maxHeightKm']+=1
        bad['references'][0]['maxRadiusKm']+=1
        with self.assertRaisesRegex(ValueError,'bounds|extent'): validate_terrain(bad,self.root)

    def test_path_escape_external_url_and_asset_byte_cap_fail_closed(self):
        self.install()
        for path in ('../outside.bin','textures/terrain/../outside.bin','https://example.org/file.bin',
                     'textures\\terrain\\a.bin','textures/terrain/a.bin?x=1','textures/terrain/%2e%2e/a.bin'):
            bad=copy.deepcopy(self.terrain);bad['references'][0]['path']=path
            with self.subTest(path=path),self.assertRaises(ValueError):validate_terrain(bad,self.root)
        bad=copy.deepcopy(self.terrain);bad['references'][0]['bytes']=5*1024*1024
        with self.assertRaises(ValueError):validate_terrain(bad,self.root)

    def test_source_provenance_and_semantics_cannot_be_removed(self):
        self.install()
        for field,value in [('source_sha256',''),('source_url','https://example.org/file'),('observation_label',''),
                            ('quantity','photographic-brightness'),('heightScaleKm',float('nan'))]:
            bad=copy.deepcopy(self.terrain);bad['references'][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):validate_terrain(bad,self.root)

    def test_solar_coverage_model_bounds_and_epochs_are_checked(self):
        self.install()
        variants=[]
        bad=copy.deepcopy(self.solar);bad['far_side']='observed';variants.append(bad)
        bad=copy.deepcopy(self.solar);bad['frames'][1]['observed_at']=bad['frames'][0]['observed_at'];variants.append(bad)
        bad=copy.deepcopy(self.solar);bad['geometry']['loops'][0]['radius']=2;variants.append(bad)
        bad=copy.deepcopy(self.solar);bad['frames'][0]['wcs']['latitude_deg']=float('nan');variants.append(bad)
        bad=copy.deepcopy(self.solar);bad['geometry']['status']='observed';variants.append(bad)
        bad=copy.deepcopy(self.solar);bad['geometry']['loops'][0]=None;variants.append(bad)
        bad=copy.deepcopy(self.solar);bad['atlas']=None;variants.append(bad)
        for bad in variants:
            with self.assertRaises(ValueError):validate_solar(bad,self.root)

    def test_duplicate_json_fields_are_rejected(self):
        self.install();(self.root/'solar-appearance.v1.json').write_text('{"schema_version":"solar-appearance.v1","schema_version":"other"}')
        with self.assertRaisesRegex(ValueError,'duplicate'):validate_physical_source(self.root)


if __name__=='__main__':unittest.main()
