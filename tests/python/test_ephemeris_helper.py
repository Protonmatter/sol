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
    def test_historical_numeric_epoch_is_explicit_and_verified(self):
        when=dt.datetime(1582,10,15,tzinfo=dt.timezone.utc)
        payload="$$SOE\n2299160.500000000, 10.0, 20.0, 30.0, 40.0, 0.0\n$$EOE"
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
