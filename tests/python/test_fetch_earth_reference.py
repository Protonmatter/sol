"""Earth reference intake keeps original evidence and never fabricates coverage."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
import zlib
from datetime import date, datetime, timezone

ROOT = Path(__file__).resolve().parents[2]


def chunk(kind, payload):
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))


def png(width, height, rows):
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')


PALETTE = b'''<ColorMaps><ColorMap><Entries>
<ColorMapEntry rgb="202,170,86" transparent="false" sourceValue="1" nodata="true"/>
<ColorMapEntry rgb="0,0,0" transparent="true" sourceValue="0"/>
</Entries></ColorMap></ColorMaps>'''


def capabilities(weather, mask=None, aqua=None, aqua_mask=None):
    mask = mask if mask is not None else weather
    layers = []
    source_layers = [('MODIS_Terra_CorrectedReflectance_TrueColor', weather), ('MODIS_Terra_Data_No_Data', mask)]
    if aqua is not None:
        source_layers += [('MODIS_Aqua_CorrectedReflectance_TrueColor', aqua), ('MODIS_Aqua_Data_No_Data', aqua if aqua_mask is None else aqua_mask)]
    for name, interval in source_layers:
        layers.append(f'<Layer><Name>{name}</Name><SRS>EPSG:4326</SRS><Extent name="time">{interval}</Extent></Layer>')
    return ('<WMT_MS_Capabilities><Capability><Layer>' + ''.join(layers) + '</Layer></Capability></WMT_MS_Capabilities>').encode()


class EarthReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = ROOT/'tools/fetch_earth_reference.py'

    def setUp(self):
        self.assertTrue(self.path.is_file(), 'Earth reference acquisition implementation is missing')
        spec = importlib.util.spec_from_file_location('earth_reference_under_test', self.path)
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)

    def test_day_selection_intersects_masks_and_excludes_incomplete_utc_today(self):
        source = capabilities('2026-09-01/2026-09-13/P1D', '2026-09-01/2026-09-10/P1D,2026-09-13')
        self.assertEqual(self.mod.select_day(source, 'previous-day', date(2026, 9, 13)), date(2026, 9, 10))
        self.assertEqual(self.mod.select_day(source, '2026-09-09', date(2026, 9, 13)), date(2026, 9, 9))
        for requested in ['2026-09-12', '2026-09-13', '2026-09-14', '20260909', '2026-02-30']:
            with self.subTest(requested=requested), self.assertRaises(ValueError):
                self.mod.select_day(source, requested, date(2026, 9, 13))

    def test_missing_malformed_or_unavailable_layer_does_not_select_another_day(self):
        for data in [b'<html/>', capabilities('2026-09-01/2026-09-10/P2D'), capabilities('2026-09-10/2026-09-01/P1D'), capabilities('2026-09-13')]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                self.mod.select_day(data, 'previous-day', date(2026, 9, 13))

    def test_png_filters_preserve_exact_source_channels(self):
        wanted = bytes([10,20,30,255,40,50,60,128,12,18,33,255,45,49,64,255])
        filtered = [
            [0,10,20,30,255,40,50,60,128,0,12,18,33,255,45,49,64,255],
            [1,10,20,30,255,30,30,30,129,1,12,18,33,255,33,31,31,0],
            [2,10,20,30,255,40,50,60,128,2,2,254,3,0,5,255,4,127],
            [3,10,20,30,255,35,40,45,1,3,7,8,18,128,19,15,18,64],
            [4,10,20,30,255,30,30,30,129,4,2,254,3,0,5,255,4,127],
        ]
        for rows in filtered:
            with self.subTest(filter=rows[0]):
                self.assertEqual(self.mod.decode_rgba(png(2, 2, bytes(rows))), (2, 2, wanted))

    def test_derivation_uses_mask_class_and_preserves_even_valid_black_rgb(self):
        weather = png(2, 1, bytes([0,0,0,0,255,18,45,62,255]))
        mask = png(2, 1, bytes([0,0,0,0,0,202,170,86,255]))
        derived, stats = self.mod.derive_weather_rgba(weather, mask, PALETTE)
        self.assertEqual(self.mod.decode_rgba(derived), (2,1,bytes([0,0,0,255,18,45,62,0])))
        self.assertEqual(stats, {'valid_pixels':1, 'no_data_pixels':1, 'total_pixels':2})

    def test_unknown_mask_class_and_mismatched_grid_are_rejected(self):
        weather = png(1, 1, b'\0\x10\x20\x30\xff')
        bad_masks = [png(1,1,b'\0\x01\x00\x00\0'), png(1,1,b'\0\xca\xaa\x56\x80'), png(2,1,b'\0'+b'\0'*8)]
        for mask in bad_masks:
            with self.subTest(mask=mask), self.assertRaises(ValueError):
                self.mod.derive_weather_rgba(weather, mask, PALETTE)
        with self.assertRaises(ValueError):
            self.mod.derive_weather_rgba(weather, png(1,1,b'\0'+b'\0'*4), PALETTE.replace(b'nodata="true"', b'nodata="false"'))

    def test_aqua_fill_keeps_terra_rgb_and_only_replaces_missing_observed_pixels(self):
        terra = png(4,1,b'\0'+bytes([0,0,0,255,11,12,13,0,21,22,23,0,31,32,33,255]))
        aqua = png(4,1,b'\0'+bytes([40,41,42,255,51,52,53,255,61,62,63,0,71,72,73,255]))
        result, stats = self.mod.fill_weather_gaps(terra, aqua)
        self.assertEqual(self.mod.decode_rgba(result), (4,1,bytes([0,0,0,255,51,52,53,255,21,22,23,0,31,32,33,255])))
        self.assertEqual(stats, {'valid_pixels':3,'no_data_pixels':1,'total_pixels':4,'terra_pixels':2,'aqua_fill_pixels':1})

    def test_aqua_fill_rejects_a_different_grid_or_nonbinary_coverage(self):
        terra = png(1,1,b'\0'+bytes([10,20,30,255]))
        for aqua in [png(2,1,b'\0'+bytes([1,2,3,255])*2), png(1,1,b'\0'+bytes([1,2,3,128]))]:
            with self.subTest(aqua=aqua), self.assertRaises(ValueError):
                self.mod.fill_weather_gaps(terra,aqua)
        with self.assertRaises(ValueError):
            self.mod.fill_weather_gaps(png(1,1,b'\0'+bytes([10,20,30,128])),terra)

    def test_aqua_date_selection_requires_the_same_day_on_both_images_and_both_masks(self):
        caps = capabilities('2026-09-01/2026-09-13/P1D', aqua='2026-09-01/2026-09-11/P1D', aqua_mask='2026-09-01/2026-09-10/P1D')
        self.assertEqual(self.mod.select_day(caps,'previous-day',date(2026,9,13),aqua_fill=True),date(2026,9,10))
        with self.assertRaises(ValueError): self.mod.select_day(caps,'2026-09-12',date(2026,9,13),aqua_fill=True)
        with self.assertRaises(ValueError): self.mod.select_day(capabilities('2026-09-12'),'2026-09-12',date(2026,9,13),aqua_fill=True)

    def test_aqua_refresh_preserves_all_four_original_inputs_and_selection_precedence(self):
        terra = png(2048,1024,(b'\0'+bytes([4,12,28,255])*2048)*1024)
        aqua = png(2048,1024,(b'\0'+bytes([17,18,19,255])*2048)*1024)
        missing = png(2048,1024,(b'\0'+bytes([202,170,86,255])*2048)*1024)
        valid = png(2048,1024,(b'\0'+b'\0'*8192)*1024)
        caps = capabilities('2026-09-12',aqua='2026-09-12')
        queried = []
        def fetch(url,limit):
            if 'GetCapabilities' in url: data = caps
            elif 'colormaps' in url: data = PALETTE
            else:
                query = parse_qs(urlsplit(url).query)
                self.assertEqual(query['TIME'], ['2026-09-12'])
                self.assertEqual(query['BBOX'], ['-180,-90,180,90'])
                name = query['LAYERS'][0]; queried.append(name)
                data = {'MODIS_Terra_CorrectedReflectance_TrueColor':terra,'MODIS_Terra_Data_No_Data':missing,
                        'MODIS_Aqua_CorrectedReflectance_TrueColor':aqua,'MODIS_Aqua_Data_No_Data':valid}[name]
            return data, {'url':url}
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)/'build'; out = build/'paired'
            path = self.mod.refresh(out,'2026-09-12',2048,datetime(2026,9,13,tzinfo=timezone.utc),build_root=build,fetcher=fetch,aqua_fill=True)
            evidence = json.loads(path.read_text())
            self.assertEqual(len(queried),4)
            self.assertEqual((out/'weather-original.png').read_bytes(),terra)
            self.assertEqual((out/'no-data-original.png').read_bytes(),missing)
            self.assertEqual((out/'aqua-weather-original.png').read_bytes(),aqua)
            self.assertEqual((out/'aqua-no-data-original.png').read_bytes(),valid)
            self.assertEqual(self.mod.decode_rgba((out/'weather-rgba.png').read_bytes())[2],self.mod.decode_rgba(aqua)[2])
            self.assertEqual(evidence['aqua']['original']['sha256'],hashlib.sha256(aqua).hexdigest())
            self.assertEqual(evidence['aqua']['mask']['sha256'],hashlib.sha256(valid).hexdigest())
            self.assertEqual(evidence['coverage']['aqua_fill_pixels'],2048*1024)
            self.assertEqual(evidence['source_priority'],['Terra MODIS','Aqua MODIS'])
            self.assertFalse(evidence['live'])

    def test_png_corruption_truncation_and_expansion_limit_fail_closed(self):
        good = png(1,1,b'\0\x01\x02\x03\xff')
        bad = [b'<html>bad</html>', good[:-1], good[:45]+bytes([good[45]^1])+good[46:], png(1,1,b'\0'*100), png(1,1,b'\5\0\0\0\0')]
        for data in bad:
            with self.subTest(length=len(data)), self.assertRaises(ValueError):
                self.mod.decode_rgba(data)

    def test_refresh_publishes_whole_review_directory_with_originals_and_hash_chain(self):
        weather = png(2048,1024,(b'\0'+bytes([4,12,28,255])*2048)*1024)
        mask = png(2048,1024,(b'\0'+b'\0'*8192)*1024)
        caps = capabilities('2026-09-01/2026-09-13/P1D')
        def fetch(url, limit):
            if 'GetCapabilities' in url: data = caps
            elif 'colormaps' in url: data = PALETTE
            else:
                query = parse_qs(urlsplit(url).query)
                self.assertEqual(query['TIME'], ['2026-09-12'])
                self.assertEqual(query['BBOX'], ['-180,-90,180,90'])
                self.assertEqual(query['SRS'], ['EPSG:4326'])
                self.assertEqual(query['WIDTH'], ['2048'])
                self.assertEqual(query['HEIGHT'], ['1024'])
                self.assertEqual(query['VERSION'], ['1.1.1'])
                if query['LAYERS'] == ['MODIS_Terra_Data_No_Data']: data = mask
                elif query['LAYERS'] == ['MODIS_Terra_CorrectedReflectance_TrueColor']: data = weather
                else: self.fail('Wrong NASA source layer')
            return data, {'url':url, 'content_type':'application/octet-stream'}
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)/'build'
            out = build/'dated-reference'
            result = self.mod.refresh(out, 'previous-day', 2048, datetime(2026,9,13,tzinfo=timezone.utc), build_root=build, fetcher=fetch)
            self.assertEqual((out/'weather-original.png').read_bytes(), weather)
            self.assertEqual((out/'no-data-original.png').read_bytes(), mask)
            self.assertEqual((out/'capabilities.xml').read_bytes(), caps)
            evidence = json.loads((out/'earth-reference.json').read_text())
            self.assertEqual(evidence['data_date'], '2026-09-12')
            self.assertEqual(evidence['status'], 'review-required')
            self.assertFalse(evidence['live'])
            self.assertFalse(evidence['global_observed_coverage'])
            self.assertEqual(evidence['original']['sha256'], hashlib.sha256(weather).hexdigest())
            self.assertEqual(evidence['mask']['sha256'], hashlib.sha256(mask).hexdigest())
            self.assertEqual(evidence['derived']['sha256'], hashlib.sha256((out/'weather-rgba.png').read_bytes()).hexdigest())
            self.assertEqual(result, out/'earth-reference.json')
            self.assertEqual([p.name for p in build.iterdir()], ['dated-reference'])

    def test_output_outside_build_and_existing_output_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)/'build'
            out = build/'already'
            out.mkdir(parents=True)
            (out/'user.txt').write_text('keep')
            for target in [out, build/'..'/'production']:
                with self.subTest(target=target), self.assertRaises(ValueError):
                    self.mod.refresh(target,'previous-day',2048,datetime(2026,9,13,tzinfo=timezone.utc),build_root=build,fetcher=lambda *_:self.fail('must reject before network'))
            self.assertEqual((out/'user.txt').read_text(), 'keep')

    def test_failed_download_leaves_no_completed_or_partial_output(self):
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)/'build'
            out = build/'candidate'
            def fetch(*_): raise OSError('provider unavailable')
            with self.assertRaises(OSError):
                self.mod.refresh(out,'previous-day',2048,datetime(2026,9,13,tzinfo=timezone.utc),build_root=build,fetcher=fetch)
            self.assertFalse(out.exists())
            self.assertEqual(list(build.iterdir()) if build.exists() else [], [])

    def test_invalid_requested_date_is_rejected_before_network(self):
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)/'build'
            for selected in ['not-a-date', '20260912', '2026-09-13', '2026-09-14']:
                with self.subTest(selected=selected), self.assertRaises(ValueError):
                    self.mod.refresh(build/'candidate',selected,2048,datetime(2026,9,13,tzinfo=timezone.utc),build_root=build,fetcher=lambda *_:self.fail('Invalid date reached network'))

    def test_download_rejects_cross_host_redirect_before_following_it(self):
        handler = self.mod.NasaRedirectHandler()
        request = self.mod.urllib.request.Request('https://gibs.earthdata.nasa.gov/a')
        for target in ['https://example.com/image.png','http://gibs.earthdata.nasa.gov/a','https://user:pass@gibs.earthdata.nasa.gov/a']:
            with self.subTest(target=target), self.assertRaises(ValueError):
                handler.redirect_request(request,None,302,'redirect',{},target)

    def test_download_enforces_size_timeout_and_rejects_short_http_body(self):
        class Response:
            status = 200
            url = 'https://gibs.earthdata.nasa.gov/test'
            headers = {'Content-Length':'9', 'Content-Type':'image/png'}
            def __enter__(self): return self
            def __exit__(self,*_): return None
            def read(self, limit): return b'12345'[:limit]
        class Opener:
            def open(inner, request, timeout):
                self.assertGreater(timeout,0)
                self.assertLessEqual(timeout,60)
                return Response()
        with patch.object(self.mod.urllib.request,'build_opener',return_value=Opener()):
            with self.assertRaises(ValueError): self.mod.download(Response.url,4)
            with self.assertRaises(ValueError): self.mod.download(Response.url,20)


if __name__ == '__main__':
    unittest.main()
