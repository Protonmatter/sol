"""Build-time admission and classification of actual Sun products."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import build_web
import test_release_artifact


class SolarBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.web=Path(self.temp.name)/'web';self.web.mkdir();(self.web/'js').mkdir()

    def install_sequence(self):
        source=ROOT/'apps/web'
        for relative in ['solar-observation-sequence.v1.json','js/solarSequencePlayer.js','js/solarSequenceControls.js']:
            shutil.copyfile(source/relative,self.web/relative)
        shutil.copytree(source/'textures/solar/sequence',self.web/'textures/solar/sequence')

    def test_sequence_real_hashes_schema_pin_and_corruption(self):
        self.install_sequence();build_web.validate_solar_sequence_source(self.web)
        manifest=json.loads((self.web/'solar-observation-sequence.v1.json').read_text())
        frame=self.web/manifest['frames'][0]['asset_path'];frame.write_bytes(b'corrupt')
        with self.assertRaises(ValueError):build_web.validate_solar_sequence_source(self.web)

    def test_sequence_runtime_requires_manifest_and_exact_schema(self):
        (self.web/'js/solarSequencePlayer.js').write_text('runtime')
        with self.assertRaises(ValueError):build_web.validate_solar_sequence_source(self.web)
        self.install_sequence();module=self.web/'js/solarSequencePlayer.js';module.write_text(module.read_text().replace('"maxItems":121','"maxItems":122'))
        with self.assertRaisesRegex(ValueError,'schema'):build_web.validate_solar_sequence_source(self.web)

    def test_sequence_duplicate_json_and_hash_pin_drift_rejected(self):
        self.install_sequence();path=self.web/'solar-observation-sequence.v1.json';original=path.read_text()
        path.write_text(original.replace('"mission": "SDO"','"mission": "HMI", "mission": "SDO"'))
        with self.assertRaises(ValueError):build_web.validate_solar_sequence_source(self.web)
        path.write_text(original);control=self.web/'js/solarSequenceControls.js';control.write_text(control.read_text().replace('865d478c','00000000'))
        with self.assertRaisesRegex(ValueError,'pin'):build_web.validate_solar_sequence_source(self.web)

    def test_dynamic_index_rejects_hash_paths_and_unknown_fields_before_native_validation(self):
        (self.web/'js/solarDynamicRenderer.js').write_text('runtime')
        with self.assertRaises(ValueError):build_web.validate_solar_dynamic_source(self.web)
        index=ROOT/'apps/web/js/solarDynamicManifest.js'
        (self.web/'js/solarDynamicManifest.js').write_bytes(index.read_bytes())
        for name in ('quiet-v1','active-v1'):
            target=self.web/'solar-dynamic'/name;target.mkdir(parents=True)
            shutil.copyfile(ROOT/'apps/web/solar-dynamic'/name/'manifest.json',target/'manifest.json')
        with patch('validate_solar_dynamic.validate',return_value={'valid':True}) as validator:
            build_web.validate_solar_dynamic_source(self.web);self.assertEqual(validator.call_count,2)
        path=self.web/'solar-dynamic/quiet-v1/manifest.json';path.write_bytes(b'{}')
        with self.assertRaises(ValueError):build_web.validate_solar_dynamic_source(self.web)

    def test_actual_dynamic_products_pass_native_backed_validation(self):
        build_web.validate_solar_dynamic_source(ROOT/'apps/web')

    def test_build_validates_source_and_staged_copy_and_keeps_large_products_optional(self):
        fixture=test_release_artifact.ReleaseArtifactTests();fixture.setUp();self.addCleanup(fixture.doCleanups)
        (fixture.source/'solar-dynamic/quiet-v1').mkdir(parents=True)
        (fixture.source/'solar-dynamic/quiet-v1/field.f32').write_bytes(b'1234')
        with patch.object(build_web,'validate_solar_sequence_source') as sequence,patch.object(build_web,'validate_solar_dynamic_source') as dynamic:
            out=fixture.build('solar-integration')
            self.assertEqual(sequence.call_count,2);self.assertEqual(dynamic.call_count,2)
            self.assertNotEqual(sequence.call_args_list[0].args[0],sequence.call_args_list[1].args[0])
        manifest=json.loads((out/'web-release-manifest.json').read_text())
        record=next(a for a in manifest['assets'] if a['path'].endswith('field.f32'))
        self.assertEqual(record['role'],'optional')

    def test_all_new_solar_runtime_modules_are_scientific(self):
        names=('solarAtmosphereShaders','solarCoolPlasma','solarDynamicAssets','solarDynamicClock','solarDynamicManifest','solarDynamicRenderer','solarDynamicSampling','solarDynamicWorker','solarDynamicWorkerClient','solarEmissionComposition','solarSequenceControls','solarSequencePlayer','solarStrandRenderer','solarStrandShaders','solarSurfaceShaders')
        for name in names:self.assertIn(name+'.js',build_web.SCIENCE_MODULES)

if __name__=='__main__':unittest.main()
