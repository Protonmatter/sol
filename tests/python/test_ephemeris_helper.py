"""Offline historical query/response epoch checks for the optional accuracy helper."""
import datetime as dt
from pathlib import Path
import sys
import unittest
from unittest import mock
import urllib.parse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT / "tools"))
import validate_ephemeris as helper


class HelperTests(unittest.TestCase):
    def test_rounded_full_turn_reference_is_the_zero_direction(self):
        when=dt.datetime(2026,7,1,tzinfo=dt.timezone.utc)
        payload='$$SOE\n2461222.500000000, , , 360.0, 20.0, 360.0, 40.0, 0.0,\n$$EOE'
        result=helper.horizons_observation('301',when,0,0,0,fetch=lambda _url:payload)
        self.assertEqual(result['ra_deg'],0.0)
        self.assertEqual(result['az_deg'],0.0)

    def test_nonfinite_directions_cannot_compare_as_zero_error(self):
        for value in [float('nan'),float('inf'),-float('inf')]:
            for index in range(4):
                angles=[0.0,0.0,0.0,0.0];angles[index]=value
                with self.subTest(index=index,value=value),self.assertRaises(ValueError):
                    helper.angular_sep(*angles)

    def test_reference_requires_one_complete_in_domain_row(self):
        when=dt.datetime(2026,7,1,tzinfo=dt.timezone.utc)
        row='2461222.500000000, , , 10.0, 20.0, 30.0, 40.0, 0.0,'
        payloads=[f'$$SOE\n{row}\n{row}\n$$EOE',
            '$$SOE\n'+row.replace('10.0','NaN')+'\n$$EOE',
            '$$SOE\n'+row.replace('20.0','100.0')+'\n$$EOE',
            '$$SOE\n'+row+', 5.0\n$$EOE', '$$EOE\n$$SOE\n'+row+'\n']
        for payload in payloads:
            with self.subTest(payload=payload),mock.patch.object(helper,'fetch_with_retry',return_value=payload),self.assertRaises(RuntimeError):
                helper.horizons_observation('301',when,0,0,0)

    def test_numeric_fragments_inside_malformed_csv_are_not_coordinates(self):
        when=dt.datetime(2026,7,1,tzinfo=dt.timezone.utc)
        for value in ['NaN(10.0)','junk10.0','10.0oops']:
            payload=f'$$SOE\n2461222.500000000, , , {value}, 20.0, 30.0, 40.0, 0.0,\n$$EOE'
            with self.subTest(value=value),self.assertRaises(RuntimeError):
                helper.horizons_observation('301',when,0,0,0,fetch=lambda _url:payload)

    def test_historical_numeric_epoch_is_explicit_and_verified(self):
        when=dt.datetime(1582,10,15,tzinfo=dt.timezone.utc)
        payload="$$SOE\n2299160.500000000, , , 10.0, 20.0, 30.0, 40.0, 0.0,\n$$EOE"
        with mock.patch.object(helper,"fetch_with_retry",return_value=payload) as fetch:
            self.assertEqual(helper.horizons_observation("301",when,0,0,0)["el_deg"],40)
        params=urllib.parse.parse_qs(urllib.parse.urlparse(fetch.call_args.args[0]).query)
        self.assertEqual(params["TLIST"],["'2299160.500000000000'"])
        self.assertEqual(params["CAL_FORMAT"],["'JD'"])
        self.assertEqual(params["CAL_TYPE"],["'GREGORIAN'"])
        self.assertEqual(params["TIME_TYPE"],["'UT'"])
        with mock.patch.object(helper,"fetch_with_retry",return_value=payload.replace("2299160.5","2299170.5")), self.assertRaisesRegex(RuntimeError,"epoch"):
            helper.horizons_observation("301",when,0,0,0)


if __name__ == "__main__":
    unittest.main()
