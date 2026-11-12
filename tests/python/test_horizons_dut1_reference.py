"""Admission of the captured high-DUT1 Horizons observer pack and its derived matrix."""
from __future__ import annotations
import csv
import datetime as dt
import hashlib
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import validate_ephemeris as helper
from horizons_reference import load_reference_pack

PACK=ROOT/'tests/fixtures/horizons-observer-dut1-20261112'
CRATE_COPY=ROOT/'crates/solar-ephemeris/data/horizons-observer-dut1-20261112.csv'
MANIFEST_SHA='f759cef7915ea2d1dc2a4a1febbeab1f5365f3a0c33c875de72d689797dca413'
UTC=dt.timezone.utc
# Two weeks after the 1973-01-01 leap second and ten days before the 2015-07-01 one.
CASES=[
    ('Boston1973',dt.datetime(1973,1,15,3,21,9,tzinfo=UTC),42.36,-71.06,10.0),
    ('Sydney1973',dt.datetime(1973,1,15,9,47,33,tzinfo=UTC),-33.87,151.21,20.0),
    ('Boston2015',dt.datetime(2015,6,20,16,5,27,tzinfo=UTC),42.36,-71.06,10.0),
    ('Sydney2015',dt.datetime(2015,6,20,22,38,51,tzinfo=UTC),-33.87,151.21,20.0),
]
BODIES={'Sun':'10','Moon':'301','Jupiter':'599'}

def requests():
    return {(label,body):helper.horizons_request_url(command,when,lat,lon,elev)
        for label,when,lat,lon,elev in CASES for body,command in BODIES.items()}


class HorizonsDut1ReferenceTests(unittest.TestCase):
    def test_accepted_acquisition_has_pinned_identity_and_exact_requests(self):
        pack=load_reference_pack(PACK,requests())
        self.assertEqual(pack.manifest_sha256,MANIFEST_SHA)
        self.assertEqual(len(pack.responses),12)
        first=next(iter(requests().values()))
        self.assertEqual(pack.fetch(first),(PACK/'boston1973-sun.txt').read_text(encoding='utf-8'))
        with self.assertRaises(ValueError):pack.fetch(first+'&unexpected=1')

    def test_a_different_instant_site_or_target_is_not_this_pack(self):
        for edit in (lambda cases,bodies:(cases[:-1],bodies),lambda cases,bodies:(cases,{**bodies,'Jupiter':'699'}),
                lambda cases,bodies:([(cases[0][0],cases[0][1]+dt.timedelta(seconds=1),*cases[0][2:]),*cases[1:]],bodies),
                lambda cases,bodies:([(*cases[0][:2],42.37,*cases[0][3:]),*cases[1:]],bodies)):
            cases,bodies=edit(list(CASES),dict(BODIES))
            expected={(label,body):helper.horizons_request_url(command,when,lat,lon,elev)
                for label,when,lat,lon,elev in cases for body,command in bodies.items()}
            with self.assertRaises(ValueError):load_reference_pack(PACK,expected)

    def test_derived_crate_matrix_is_exactly_bound_to_raw_responses(self):
        pack=load_reference_pack(PACK,requests())
        matrix=(PACK/'observer-matrix.csv').read_bytes()
        self.assertEqual(matrix,CRATE_COPY.read_bytes())
        rows=list(csv.DictReader(matrix.decode().splitlines()));self.assertEqual(len(rows),12)
        for row,(label,body) in zip(rows,requests()):
            _,when,lat,lon,elev=next(case for case in CASES if case[0]==label)
            ref=helper.horizons_observation(BODIES[body],when,lat,lon,elev,fetch=pack.fetch)
            self.assertEqual((row['case'],row['body']),(label,body))
            for key,value in [('jd_utc',when.timestamp()/86400+2440587.5),('latitude_deg',lat),
                ('longitude_deg_east',lon),('elevation_m',elev),('ra_deg',ref['ra_deg']),('dec_deg',ref['dec_deg']),
                ('az_deg',ref['az_deg']),('alt_deg',ref['el_deg']),('dut1_seconds',ref['dut1_seconds'])]:
                self.assertEqual(float(row[key]),value,(label,body,key))
            self.assertEqual(row['raw_sha256'],hashlib.sha256(pack.fetch(requests()[(label,body)]).encode()).hexdigest())

    def test_the_cohort_keeps_the_property_it_was_captured_for(self):
        # The pack exists to exercise UT1 = UTC + DUT1. Low-DUT1 replacements would defeat it.
        values={row['case']:float(row['dut1_seconds']) for row in csv.DictReader(CRATE_COPY.read_text().splitlines())}
        self.assertEqual(set(values),{case[0] for case in CASES})
        self.assertTrue(all(value>=0.6 for case,value in values.items() if case.endswith('1973')),values)
        self.assertTrue(all(value<=-0.6 for case,value in values.items() if case.endswith('2015')),values)

    def test_the_retained_helper_requested_these_cases(self):
        helper_text=(PACK/'query-helper.txt').read_text(encoding='utf-8')
        for label,when,lat,lon,elev in CASES:
            line=f"('{label}', dt.datetime({when.year}, {when.month}, {when.day}, {when.hour}, {when.minute}, {when.second}, tzinfo=UTC), {lat}, {lon}, {elev}),"
            self.assertIn(line,helper_text)
        self.assertIn("BODIES = {'Sun': '10', 'Moon': '301', 'Jupiter': '599'}",helper_text)


if __name__=='__main__':unittest.main()
