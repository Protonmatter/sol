"""Solar appearance admission, FITS geometry and reproducibility tests."""
import hashlib
import math
from pathlib import Path
import tempfile
import unittest

from tools import prepare_solar_appearance as solar


HEADER = '''<meta><fits><NAXIS1>4096</NAXIS1><NAXIS2>4096</NAXIS2>
<TELESCOP>SDO</TELESCOP><WAVELNTH>171</WAVELNTH><CROTA2>0</CROTA2>
<CTYPE1>HPLN-TAN</CTYPE1><CTYPE2>HPLT-TAN</CTYPE2>
<CUNIT1>arcsec</CUNIT1><CUNIT2>arcsec</CUNIT2><CDELT1>.6</CDELT1><CDELT2>.6</CDELT2>
<CRPIX1>2048.5</CRPIX1><CRPIX2>2048.5</CRPIX2><CRVAL1>0</CRVAL1><CRVAL2>0</CRVAL2>
<DATE-OBS>2024-05-10T12:00:09.349</DATE-OBS><CRLN_OBS>306.98407</CRLN_OBS>
<CRLT_OBS>-3.1403694</CRLT_OBS><DSUN_OBS>151088660000</DSUN_OBS>
<RSUN_REF>696000000</RSUN_REF><R_SUN>1583.6266</R_SUN><MISSVALS>0</MISSVALS>
<LVL_NUM>1.5</LVL_NUM><QUALITY>1073741824</QUALITY></fits></meta>'''


class SolarAppearanceTests(unittest.TestCase):
    def test_metadata_uses_observation_not_processing_time(self):
        frame=solar.parse_header(HEADER.encode())
        self.assertEqual(frame['observed_at'],'2024-05-10T12:00:09.349Z')
        self.assertEqual(frame['wcs']['crpix'],[2048.5,2048.5])
        self.assertEqual(frame['wcs']['latitude_deg'],-3.1403694)
        self.assertTrue(math.isfinite(frame['wcs']['observer_distance_m']))

    def test_unknown_projection_missing_values_and_nonfinite_geometry_are_rejected(self):
        for before,after in [('HPLN-TAN','HPLN-CAR'),('<MISSVALS>0','<MISSVALS>1'),
                             ('<CROTA2>0','<CROTA2>2'),('<CDELT1>.6','<CDELT1>nan'),
                             ('<WAVELNTH>171','<WAVELNTH>304'),('<LVL_NUM>1.5','<LVL_NUM>1.0')]:
            with self.subTest(after=after),self.assertRaises(ValueError):
                solar.parse_header(HEADER.replace(before,after).encode())

    def test_missing_header_geometry_is_not_guessed(self):
        with self.assertRaises(ValueError): solar.parse_header(b'<meta><fits/></meta>')
        with self.assertRaises(ValueError): solar.parse_header(b'<!DOCTYPE x><meta/>')

    def test_source_hash_checked_before_decode(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'source.jp2';path.write_bytes(b'original')
            self.assertEqual(solar.verify_source(path,hashlib.sha256(b'original').hexdigest()),b'original')
            path.write_bytes(b'substituted')
            with self.assertRaises(ValueError): solar.verify_source(path,hashlib.sha256(b'original').hexdigest())

    def test_embedded_jp2_header_keeps_image_metadata_associated(self):
        header=HEADER.encode()
        box=(len(header)+8).to_bytes(4,'big')+b'xml '+header
        self.assertEqual(solar.parse_header(solar.embedded_header(box)),solar.parse_header(header))
        for bad in (b'bad',b'\0\0\0\x07xml ',b'\0\0\x10\0xml short',b'\0\0\0\x08jp2c'):
            with self.subTest(raw=bad),self.assertRaises(ValueError): solar.embedded_header(bad)

    def test_inverse_projection_covers_only_visible_photosphere(self):
        frame=solar.parse_header(HEADER.encode())
        point=solar.pixel_to_surface(512,512,1024,frame)
        self.assertIsNotNone(point)
        self.assertAlmostEqual(math.sqrt(sum(v*v for v in point)),1,places=12)
        self.assertIsNone(solar.pixel_to_surface(0,0,1024,frame))


if __name__=='__main__': unittest.main()
