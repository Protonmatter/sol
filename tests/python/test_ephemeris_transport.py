"""Bounded transport retries and native-version boundaries without network I/O."""
from __future__ import annotations

import datetime as dt
import io
import json
from pathlib import Path
import sys
import unittest
from unittest import mock
import urllib.error

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import validate_ephemeris as helper


class EphemerisTransportTests(unittest.TestCase):
    def test_consumed_response_is_closed_on_success(self):
        response=io.BytesIO(b'retained response')
        with mock.patch.object(helper.urllib.request,'urlopen',return_value=response) as request,mock.patch('time.sleep'):
            self.assertEqual(helper.fetch_with_retry('https://example.invalid/control'),'retained response')
        self.assertTrue(response.closed,'the helper owns the consumed HTTP response')
        self.assertEqual(request.call_count,1)

    def test_decode_failure_closes_response_and_is_not_retried(self):
        response=io.BytesIO(b'\xff')
        with mock.patch.object(helper.urllib.request,'urlopen',return_value=response) as request,mock.patch('time.sleep'):
            with self.assertRaises(UnicodeDecodeError):helper.fetch_with_retry('https://example.invalid/control')
        self.assertTrue(response.closed);self.assertEqual(request.call_count,1)

    def test_transient_rate_limit_and_network_error_retry_within_the_attempt_budget(self):
        rate=urllib.error.HTTPError('https://example.invalid/control',429,'rate limit',{},None)
        self.addCleanup(rate.close)
        response=io.BytesIO(b'accepted')
        with mock.patch.object(helper.urllib.request,'urlopen',side_effect=[rate,urllib.error.URLError('reset'),response]) as request,mock.patch('time.sleep'):
            self.assertEqual(helper.fetch_with_retry('https://example.invalid/control',attempts=3),'accepted')
        self.assertEqual(request.call_count,3)

    def test_permanent_http_error_stops_immediately(self):
        error=urllib.error.HTTPError('https://example.invalid/control',400,'invalid',{},None)
        self.addCleanup(error.close)
        with mock.patch.object(helper.urllib.request,'urlopen',side_effect=error) as request,mock.patch('time.sleep') as sleep:
            with self.assertRaises(urllib.error.HTTPError) as raised:helper.fetch_with_retry('https://example.invalid/control')
        self.assertIs(raised.exception,error);self.assertEqual(request.call_count,1);sleep.assert_not_called()

    def test_retry_exhaustion_raises_the_last_failure_and_zero_attempts_do_no_io(self):
        errors=[urllib.error.URLError('first'),urllib.error.URLError('last')]
        with mock.patch.object(helper.urllib.request,'urlopen',side_effect=errors) as request,mock.patch('time.sleep'):
            with self.assertRaises(urllib.error.URLError) as raised:helper.fetch_with_retry('https://example.invalid/control',attempts=2)
        self.assertIs(raised.exception,errors[-1]);self.assertEqual(request.call_count,2)
        with mock.patch.object(helper.urllib.request,'urlopen') as request:
            with self.assertRaises(RuntimeError):helper.fetch_with_retry('https://example.invalid/control',attempts=0)
        request.assert_not_called()

    def test_binary_search_is_explicit_ordered_and_actionable_when_missing(self):
        self.assertEqual(helper.find_binary('chosen'),Path('chosen'))
        with mock.patch.object(Path,'is_file',side_effect=[False,False,True]):
            self.assertEqual(helper.find_binary(None),Path('target/debug/sky.exe'))
        with mock.patch.object(Path,'is_file',return_value=False):
            with self.assertRaisesRegex(SystemExit,'cargo build'):helper.find_binary(None)

    def test_native_snapshot_version_and_request_arguments_are_bound(self):
        when=dt.datetime(2026,7,1,tzinfo=dt.timezone.utc)
        snapshot=json.loads((ROOT/'tests/fixtures/ephemeris-clock-boundary-20261104.json').read_bytes())
        snapshot['schema_version']='ephemeris-snapshot.v4'  # archived v3 fixture under the live identity
        with mock.patch.object(helper.subprocess,'run',return_value=mock.Mock(stdout=json.dumps(snapshot))) as run:
            self.assertEqual(helper.engine_snapshot(Path('unused'),when,12.,34.,5.),snapshot)
            self.assertEqual(run.call_args.args[0][-3:],['12.0','34.0','5.0'])
        snapshot['schema_version']='ephemeris-snapshot.v2'
        with mock.patch.object(helper.subprocess,'run',return_value=mock.Mock(stdout=json.dumps(snapshot))):
            with self.assertRaisesRegex(RuntimeError,'ephemeris-snapshot.v4'):helper.engine_snapshot(Path('unused'),when,12.,34.,5.)


if __name__=='__main__':unittest.main()
