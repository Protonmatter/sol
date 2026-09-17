"""Source and build admission for the fixed NASA/JPL observation gallery."""
import copy
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from validate_planet_phenomena import validate_phenomena_source,validate_manifest,image_dimensions
from build_web import build_site
from prepare_planet_phenomena import prepare

class PlanetPhenomenaTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'web';self.root.mkdir()
        self.manifest=json.loads((ROOT/'apps/web/planet-phenomena.v1.json').read_text())
    def install(self):
        for name in ['planet-phenomena.v1.json','js/planetPhenomenaManifest.js',
                     *[item['asset']['path'] for item in self.manifest['observations']]]:
            target=self.root/name;target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(ROOT/'apps/web'/name,target)
    def test_historical_source_skips_but_new_runtime_requires_manifest(self):
        self.assertEqual(validate_phenomena_source(self.root),0)
        (self.root/'js').mkdir();(self.root/'js/planetPhenomena.js').write_text('// runtime')
        with self.assertRaisesRegex(ValueError,'manifest'):validate_phenomena_source(self.root)
        with self.assertRaisesRegex(ValueError,'manifest'):
            build_site(self.root,Path(self.temp.name)/'wasm',Path(self.temp.name)/'out',release_id='phenomena-test',
                       source_sha='a'*40,repository='owner/repo',run_id=1,run_attempt=1,schemas=['solar-state-snapshot.v2','ephemeris-snapshot.v2'])
        self.assertFalse((Path(self.temp.name)/'out').exists())
    def test_official_published_images_and_generated_browser_data_match(self):
        self.install();self.assertEqual(validate_phenomena_source(self.root),5)
    def test_global_mapping_wrong_pole_and_temporal_upgrades_are_rejected(self):
        self.install()
        for field,value in [('mapping_status','qualified'),('allowed_usages',['sphere-texture']),('playback','live'),
                            ('source_identity','inferred'),('source_sha256','0'*64),('hemisphere','north')]:
            bad=copy.deepcopy(self.manifest);bad['observations'][3][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):validate_manifest(bad,self.root)
        bad=copy.deepcopy(self.manifest);bad['observations'][3]['observation']['value']='2027-08-29'
        with self.assertRaises(ValueError):validate_manifest(bad,self.root)
    def test_bounds_mime_paths_and_hashes_are_checked(self):
        self.install()
        for field,value in [('bytes',1500001),('mime','image/svg+xml'),('dimensions',[12,12]),('path','../outside.jpg'),
                            ('path','textures/phenomena/a.jpg?x=1')]:
            bad=copy.deepcopy(self.manifest);bad['observations'][0]['asset'][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(ValueError):validate_manifest(bad,self.root)
        file=self.root/self.manifest['observations'][0]['asset']['path'];raw=file.read_bytes();file.write_bytes(raw[:-1]+b'X')
        with self.assertRaisesRegex(ValueError,'hash'):validate_manifest(self.manifest,self.root)
    def test_source_origin_and_required_coverage_may_not_be_omitted(self):
        self.install()
        for field,value in [('source_page','https://example.org/nasa'),('source_url','https://evil.test/image.jpg'),('coverage',''),('credits','')]:
            bad=copy.deepcopy(self.manifest);bad['observations'][1][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):validate_manifest(bad,self.root)
        bad=copy.deepcopy(self.manifest);bad['observations'][3]['coverage']='South pole'
        with self.assertRaises(ValueError):validate_manifest(bad,self.root)
    def test_generated_manifest_and_unknown_fields_fail_closed(self):
        self.install();module=self.root/'js/planetPhenomenaManifest.js';module.write_text(module.read_text()+'// drift')
        with self.assertRaisesRegex(ValueError,'browser'):validate_phenomena_source(self.root)
        bad=copy.deepcopy(self.manifest);bad['wind_velocity_m_s']=20
        with self.assertRaises(ValueError):validate_manifest(bad,self.root)
    def test_image_header_parser_is_bounded(self):
        for raw,mime in [(b'', 'image/jpeg'),(b'\xff\xd8\xff\xe0\x00\xff', 'image/jpeg'),(b'GIF89a', 'image/png')]:
            with self.subTest(raw=raw),self.assertRaises(ValueError):image_dimensions(raw,mime)

    def test_preparation_replays_exact_source_bytes_without_transform(self):
        source=ROOT/'apps/web/textures/phenomena'
        prepare(source,self.root)
        self.assertEqual(validate_phenomena_source(self.root),5)
        self.assertEqual((self.root/'planet-phenomena.v1.json').read_bytes(),(ROOT/'apps/web/planet-phenomena.v1.json').read_bytes())

if __name__=='__main__':unittest.main()
