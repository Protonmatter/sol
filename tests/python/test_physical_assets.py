"""Build admission tests for numeric terrain and solar reconstruction assets."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from validate_physical_assets import validate_physical_source,validate_terrain,validate_solar,validate_incident_fields,incident_generator_glsl
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

    def install_incident(self):
        names=('js/atmosphereIncidentManifest.js','js/atmosphereIncident.js','js/atmosphereShaders.js',
               'js/atmosphereOptics.js','data/optics/earth-incident-v1.f32','data/optics/mars-incident-v1.f32')
        for name in names:
            destination=self.root/name;destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(ROOT/'apps/web'/name,destination)

    def incident_records(self):
        return json.loads((self.root/'js/atmosphereIncidentManifest.js').read_text().split('Object.freeze(',1)[1][:-3])

    def write_incident_records(self, records):
        module=self.root/'js/atmosphereIncidentManifest.js'
        heading=module.read_text().splitlines()[0]
        module.write_text(heading+'\nexport const INCIDENT_FIELDS=Object.freeze('+json.dumps(records,indent=2)+');\n',encoding='utf-8')

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

    def test_incident_fields_pin_size_values_hash_and_solver(self):
        self.install_incident()
        self.assertEqual(validate_incident_fields(self.root),2)
        solver=self.root/'js/atmosphereShaders.js';solver.write_text(solver.read_text()+'// changed model\n')
        with self.assertRaisesRegex(ValueError,'identity changed'):validate_incident_fields(self.root)
        shutil.copyfile(ROOT/'apps/web/js/atmosphereShaders.js',solver)
        field=self.root/'data/optics/earth-incident-v1.f32';raw=field.read_bytes();field.write_bytes(b'X'+raw[1:])
        with self.assertRaisesRegex(ValueError,'hash mismatch'):validate_incident_fields(self.root)

    def test_incident_fields_require_both_assets_and_identity_modules(self):
        self.install_incident()
        for name in ('data/optics/earth-incident-v1.f32','data/optics/mars-incident-v1.f32',
                     'js/atmosphereIncident.js','js/atmosphereOptics.js','js/atmosphereShaders.js'):
            file=self.root/name;raw=file.read_bytes();file.unlink()
            try:
                with self.subTest(name=name),self.assertRaisesRegex(ValueError,'missing|requires'):
                    validate_incident_fields(self.root)
            finally:file.write_bytes(raw)

    def test_incident_fields_pin_actual_profile_and_field_domain_sources(self):
        self.install_incident()
        for name,before,after in (('js/atmosphereOptics.js','rayleighScaleHeightKm: 8','rayleighScaleHeightKm: 9'),
                                 ('js/atmosphereIncident.js','maxHeightKm:16','maxHeightKm:17')):
            file=self.root/name;raw=file.read_bytes();self.assertIn(before,raw.decode())
            file.write_text(raw.decode().replace(before,after),encoding='utf-8')
            try:
                with self.subTest(name=name),self.assertRaisesRegex(ValueError,'identity changed'):
                    validate_incident_fields(self.root)
            finally:file.write_bytes(raw)

    def test_incident_field_domains_and_producer_identities_are_verified(self):
        self.install_incident();records=self.incident_records()
        for key,value in (('domain',{'minHeightKm':0,'maxHeightKm':17,'quadratic':True}),
                          ('domain',{'minHeightKm':0,'maxHeightKm':16,'quadratic':1}),
                          ('generator_sha256','0'*64),('profile_source_sha256','0'*64),('field_source_sha256','0'*64)):
            bad=copy.deepcopy(records);bad['Earth'][key]=value;self.write_incident_records(bad)
            with self.subTest(key=key,value=value),self.assertRaises(ValueError):validate_incident_fields(self.root)
        self.write_incident_records(records)

    def test_incident_nonfinite_or_invalid_samples_fail_even_with_rebound_asset_hash(self):
        self.install_incident();records=self.incident_records();file=self.root/'data/optics/mars-incident-v1.f32';raw=file.read_bytes()
        for index,value in ((0,float('nan')),(1,-1.0),(2,-1.0),(3,0.0)):
            bad=bytearray(raw);struct.pack_into('<f',bad,index*4,value);file.write_bytes(bad)
            current=copy.deepcopy(records);current['Mars']['sha256']=hashlib.sha256(bad).hexdigest();self.write_incident_records(current)
            with self.subTest(index=index),self.assertRaisesRegex(ValueError,'numerical sample'):validate_incident_fields(self.root)

    def test_incident_manifest_duplicate_keys_fail_closed(self):
        self.install_incident();module=self.root/'js/atmosphereIncidentManifest.js'
        module.write_text(module.read_text().replace('"Earth": {','"Earth": {}, "Earth": {',1),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'duplicate'):validate_incident_fields(self.root)

    def test_incident_source_identity_is_line_ending_independent(self):
        self.install_incident()
        for name in ('js/atmosphereShaders.js','js/atmosphereOptics.js','js/atmosphereIncident.js'):
            file=self.root/name;file.write_bytes(file.read_text().replace('\n','\r\n').encode())
        self.assertEqual(validate_incident_fields(self.root),2)

    def test_incident_glsl_identity_expands_only_the_reviewed_plain_templates(self):
        generator='const fragment=`head${ATMOSPHERE_GLSL}${ATMOSPHERE_REFRACTION_GLSL}tail`;'
        solver='export const ATMOSPHERE_GLSL = `density`;\nexport const ATMOSPHERE_REFRACTION_GLSL = `refraction`;'
        self.assertEqual(incident_generator_glsl(generator,solver),'headdensityrefractiontail')
        for bad_generator,bad_solver in ((generator.replace('ATMOSPHERE_GLSL','UNREVIEWED'),solver),
                                         (generator.replace('head','head\\n'),solver),
                                         (generator,solver.replace('density','${UNREVIEWED}')),
                                         (generator,solver.replace('density','density\\n')),
                                         (generator,solver+'\nexport const ATMOSPHERE_GLSL = `duplicate`;')):
            with self.subTest(generator=bad_generator,solver=bad_solver),self.assertRaisesRegex(ValueError,'template'):
                incident_generator_glsl(bad_generator,bad_solver)

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
