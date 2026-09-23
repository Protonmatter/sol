"""Bounded immutable archive preparation and source quality contracts."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('sequence', ROOT / 'tools/prepare_solar_sequence.py')
sequence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sequence)


class SequenceTests(unittest.TestCase):
    def source_fixture(self):
        xml = b'<meta><fits><DATE-OBS>2024-05-10T16:29:57.349</DATE-OBS><QUALITY>1073741824</QUALITY><EXPTIME>2.0</EXPTIME><WAVELNTH>171</WAVELNTH><TELESCOP>SDO</TELESCOP><INSTRUME>AIA_3</INSTRUME><NAXIS1>4096</NAXIS1><NAXIS2>4096</NAXIS2></fits></meta>'
        box = lambda tag, data: (len(data)+8).to_bytes(4,'big') + tag + data
        jp2 = box(b'jP  ', b'\r\n\x87\n') + box(b'xml ', xml) + box(b'jp2c', b'fake-codestream')
        closest = sequence.canonical({'id':'123','date':'2024-05-10 16:29:57','name':'AIA 171','width':4096,'height':4096})
        entry = {'archive_id':'123','requested_at':'2024-05-10T16:30:00Z','source_url':sequence.API+'getJP2Image/?date=2024-05-10T16%3A29%3A57.349Z&sourceId=10','metadata_url':sequence.API+'getJP2Header/?id=123','closest_url':sequence.API+'getClosestImage/?date=2024-05-10T16%3A30%3A00Z&sourceId=10'}
        return entry, {'source':jp2,'metadata':xml,'closest':closest}

    def test_source_records_bind_actual_embedded_metadata_and_closest_identity(self):
        entry,data=self.source_fixture()
        parsed=sequence.bind_source_records(entry,data)
        self.assertEqual(parsed['quality_raw'],1073741824)
        self.assertEqual(parsed['observed_at'],'2024-05-10T16:29:57.349Z')

    def test_jp2_xml_is_structural_bounded_and_allows_archive_nul_padding(self):
        entry,data=self.source_fixture()
        xml=data['metadata'];box=lambda tag,payload:(len(payload)+8).to_bytes(4,'big')+tag+payload
        signature=data['source'][:12]
        self.assertEqual(sequence.jp2_xml(signature+box(b'xml ',xml+b'\x00')),xml)
        for raw in (signature+box(b'jp2c',xml), signature+box(b'xml ',xml)*2, signature+b'\x00\x00\x00\x04xml ', signature+b'\x00\x00\x00\x01xml '):
            with self.subTest(raw=raw[:24]),self.assertRaises(ValueError):sequence.jp2_xml(raw)

    def test_contradictory_source_records_reject_before_output_promotion(self):
        for mutation in ('quality','channel','exposure','instrument','closest_id','closest_date','closest_channel','metadata_url','source_url','closest_url'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as tmp:
                base=Path(tmp);src=base/'source';src.mkdir();entry,data=self.source_fixture()
                if mutation in ('quality','channel','exposure','instrument'):
                    before,after={'quality':(b'<QUALITY>1073741824',b'<QUALITY>0'),'channel':(b'<WAVELNTH>171',b'<WAVELNTH>193'),'exposure':(b'<EXPTIME>2.0',b'<EXPTIME>1.0'),'instrument':(b'<INSTRUME>AIA_3',b'<INSTRUME>HMI')}[mutation]
                    data['metadata']=data['metadata'].replace(before,after)
                if mutation=='closest_id':entry['archive_id']='999123'
                if mutation in ('closest_date','closest_channel'):
                    closest=json.loads(data['closest']);closest['date' if mutation=='closest_date' else 'name']='2024-05-10 16:29:58' if mutation=='closest_date' else 'AIA 193';data['closest']=sequence.canonical(closest)
                if mutation=='metadata_url':entry['metadata_url']=entry['metadata_url'].replace('id=123','id=456')
                if mutation=='source_url':entry['source_url']=entry['source_url'].replace('sourceId=10','sourceId=11')
                if mutation=='closest_url':entry['closest_url']=entry['closest_url'].replace('sourceId=10','sourceId=11')
                for key,suffix in [('source','jp2'),('metadata','xml'),('closest','json')]:
                    entry[key+'_file']='000.'+suffix;entry[key+'_sha256']=sequence.sha(data[key]);(src/entry[key+'_file']).write_bytes(data[key])
                (src/'source.json').write_bytes(sequence.canonical({'cadence_seconds':60,'frames':[entry,entry]}))
                with self.assertRaises(ValueError):sequence.prepare(src,base/'out')
                self.assertFalse((base/'out').exists());self.assertFalse(list(base.glob('sequence-prepare-*')))

    def test_closed_python_schema_rejects_prototype_named_keys(self):
        original=json.loads((ROOT/'apps/web/solar-observation-sequence.v1.json').read_text())
        for key in ('toString','constructor','__proto__'):
            for level in ('manifest','frame'):
                manifest=copy.deepcopy(original);target=manifest if level=='manifest' else manifest['frames'][0];target[key]='unknown'
                with self.subTest(key=key,level=level),self.assertRaises(ValueError):sequence.validate_manifest(manifest)
    def test_browser_schema_is_generated_from_exact_schema(self):
        browser = (ROOT / 'apps/web/js/solarSequencePlayer.js').read_text()
        encoded = browser.split('const SCHEMA = ', 1)[1].split(';\n', 1)[0]
        self.assertEqual(json.loads(encoded), json.loads(sequence.SCHEMA_PATH.read_text()))

    def test_source_hash_failure_leaves_no_promoted_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); src = base / 'source'; src.mkdir()
            (src / '000.jp2').write_bytes(b'changed')
            receipt = {'frames': [{'source_file': '000.jp2', 'source_sha256': '0' * 64}] * 2}
            (src / 'source.json').write_text(json.dumps(receipt))
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                sequence.prepare(src, base / 'out')
            self.assertFalse((base / 'out').exists())
            self.assertFalse(list(base.glob('sequence-prepare-*')))

    def test_parse_header_rejects_wrong_channel_entity_and_missing_time(self):
        for raw in (b'<!DOCTYPE a><meta/>', b'<meta><fits><WAVELNTH>193</WAVELNTH></fits></meta>', b'<meta/>'):
            with self.subTest(raw=raw), self.assertRaises(ValueError): sequence.parse_header(raw)

    def test_reject_oversized_acquisition_before_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                sequence.acquire(Path(tmp), '2024-05-10T16:30:00Z', 122, 60)

    def test_provider_quality_never_silently_cleared(self):
        header = b'<meta><fits><DATE-OBS>2024-05-10T16:29:57.349</DATE-OBS><QUALITY>1073741824</QUALITY><EXPTIME>2.0</EXPTIME><WAVELNTH>171</WAVELNTH></fits></meta>'
        metadata = sequence.parse_header(header)
        self.assertEqual(metadata['observed_at'], '2024-05-10T16:29:57.349Z')
        self.assertEqual(metadata['quality_raw'], 1073741824)
        self.assertEqual(metadata['quality_interpretation'], 'unqualified-provider-quality')
        self.assertEqual(metadata['permitted_interpolation'], 'none')

    def test_bundled_sequence_integrity(self):
        path = ROOT / 'apps/web/solar-observation-sequence.v1.json'
        if not path.exists():
            self.skipTest('actual archive pack not prepared yet')
        manifest = json.loads(path.read_text())
        sequence.validate_manifest(manifest, ROOT / 'apps/web')
        self.assertGreaterEqual(len(manifest['frames']), 30)
        self.assertEqual(manifest['intensity_kind'], 'provider_display')
        self.assertTrue(all(frame['quality_raw'] is not None for frame in manifest['frames']))
        for mutation in ('path', 'time', 'hash', 'extra'):
            bad = copy.deepcopy(manifest)
            if mutation == 'path': bad['frames'][0]['asset_path'] = '../escape.jpg'
            if mutation == 'time': bad['frames'][1]['observed_at'] = bad['frames'][0]['observed_at']
            if mutation == 'hash': bad['frames'][0]['sha256'] = '0' * 64
            if mutation == 'extra': bad['unknown'] = True
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                sequence.validate_manifest(bad, ROOT / 'apps/web')


if __name__ == '__main__': unittest.main()
