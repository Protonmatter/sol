"""Strict, network-free admission of the retained geocentric JD/TT directions."""
from __future__ import annotations

from collections.abc import Mapping
import csv
from dataclasses import dataclass
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
from types import MappingProxyType
import urllib.parse

from horizons_reference import ENDPOINT, _file, _keys, _reject_constant, _unique, _utc

CASES = (('sun', 'Sun', 10), ('moon', 'Moon', 301), ('mercury', 'Mercury', 199),
         ('venus', 'Venus', 299), ('mars', 'Mars', 4), ('jupiter', 'Jupiter', 5),
         ('saturn', 'Saturn', 6), ('uranus', 'Uranus', 7), ('neptune', 'Neptune', 8))
_DATES = sorted([dt.datetime(year, 1, 1) for year in
    (1000, 1600, 1800, 1900, 1950, 2050, 2100, 2200, 2400, 3000, 5000, 7000, 9999)]
    + [dt.datetime(1, 1, 2), dt.datetime(2000, 1, 1, 12), dt.datetime(2026, 7, 1)])
EPOCHS = tuple(date.toordinal() + 1721424.5 + date.hour / 24 for date in _DATES)
SUN_PLANET_ARCSEC = 10.0
MOON_ARCSEC = 12.0
PLAN_SHA256 = 'abea667213681f709bd67a35cd6676ce320fe7180eabc4f0efeda180761bf88d'
CSV_FIELDS = ('case', 'body', 'target_id', 'center_id', 'jd_tt', 'ra_deg', 'dec_deg',
              'tdb_minus_ut_seconds', 'icrf_ra_deg', 'icrf_dec_deg', 'raw_sha256')
_NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?')


@dataclass(frozen=True)
class ApparentPlace:
    ra_deg: float
    dec_deg: float
    tdb_minus_ut_seconds: float
    icrf_ra_deg: float
    icrf_dec_deg: float

    def values(self) -> tuple[float, ...]:
        return (self.ra_deg, self.dec_deg, self.tdb_minus_ut_seconds,
                self.icrf_ra_deg, self.icrf_dec_deg)


def request_url(case: tuple[str, str, int]) -> str:
    if case not in CASES:
        raise ValueError('unsupported apparent target')
    target = case[2]
    params = {'format': 'text', 'COMMAND': f"'{target}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'",
        'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'500@399'", 'TLIST': ' '.join(f"'{jd}'" for jd in EPOCHS),
        'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'TT'", 'CAL_FORMAT': "'JD'", 'CAL_TYPE': "'GREGORIAN'",
        'TIME_DIGITS': "'FRACSEC'", 'QUANTITIES': "'2,30,45'", 'ANG_FORMAT': "'DEG'",
        'APPARENT': "'AIRLESS'", 'EXTRA_PREC': "'YES'", 'CSV_FORMAT': "'YES'", 'ELEV_CUT': "'-90'",
        'REF_SYSTEM': "'ICRF'"}
    return ENDPOINT + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)


def parse_response(text: str, case: tuple[str, str, int]) -> Mapping[float, ApparentPlace]:
    if case not in CASES or not isinstance(text, str):
        raise ValueError('unsupported apparent response identity')
    if not text.startswith('API VERSION: 1.2\nAPI SOURCE: NASA/JPL Horizons API\n'):
        raise ValueError('apparent API source/version differs')
    for kind, identity in [('Target', case[2]), ('Center', 399)]:
        if re.findall(r'^' + kind + r' body name:[^\r\n]*\((\d+)\)\s+\{source: ([^}]+)\}', text, re.M) != [(str(identity), 'DE441')]:
            raise ValueError('apparent target/origin/source differs')
    headers = {'Center-site name': 'GEOCENTRIC', 'Atmos refraction': 'NO (AIRLESS)',
        'RA format': 'DEG', 'Time format': 'JD', 'Calendar mode': 'Gregorian',
        'Center geodetic': '0.0, 0.0, -6378.137             {E-lon(deg),Lat(deg),Alt(km)}',
        'Center cylindric': '0.0, 0.0, 0.0                   {E-lon(deg),Dxy(km),Dz(km)}',
        'Start time': 'A.D. 0001-Jan-02 00:00:00.0000 TT',
        'Stop  time': 'A.D. 9999-Jan-01 00:00:00.0000 TT'}
    for name, expected in headers.items():
        values = re.findall(r'^' + re.escape(name) + r'\s*:\s*([^\r\n]+)', text, re.M)
        if [value.rstrip() for value in values] != [expected]:
            raise ValueError('apparent observer/frame/time/calendar header differs')
    if text.count('$$SOE') != 1 or text.count('$$EOE') != 1 or text.index('$$SOE') > text.index('$$EOE'):
        raise ValueError('apparent response needs one ordered ephemeris block')
    expected_labels = ['Date_________JDTT', '', '', 'R.A.__(a-app)', 'DEC___(a-app)',
                       'TDB-UT', 'RA_(ICRF-a-app)', 'DEC_(ICRF-a-app)', '']
    try:
        labels = [next(csv.reader([line], strict=True)) for line in text.splitlines()
                  if line.startswith('Date_________JD')]
        rows = list(csv.reader(io.StringIO(text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip()), strict=True))
    except csv.Error as exc:
        raise ValueError('malformed apparent CSV') from exc
    if [[field.strip() for field in row] for row in labels] != [expected_labels] or len(rows) != len(EPOCHS):
        raise ValueError('apparent columns or complete epoch matrix differs')
    result = {}
    for row, jd in zip(rows, EPOCHS):
        fields = [field.strip() for field in row]
        if len(fields) != 9 or any(fields[i] for i in (1, 2, 8)) \
                or re.fullmatch(r'\d+\.\d{9}', fields[0]) is None or float(fields[0]) != jd \
                or any(_NUMBER.fullmatch(field) is None for field in fields[3:8]):
            raise ValueError('apparent epoch/order/column/numeric token differs')
        ra, dec, delta, icrf_ra, icrf_dec = map(float, fields[3:8])
        if not all(math.isfinite(value) for value in (ra, dec, delta, icrf_ra, icrf_dec)) \
                or not (0 <= ra < 360 and -90 <= dec <= 90 and 0 <= icrf_ra < 360 and -90 <= icrf_dec <= 90):
            raise ValueError('apparent coordinates must be finite and within domains')
        result[jd] = ApparentPlace(ra, dec, delta, icrf_ra, icrf_dec)
    return MappingProxyType(result)


@dataclass(frozen=True)
class ApparentReferencePack:
    places: Mapping[tuple[str, float], ApparentPlace]
    manifest_sha256: str


def load_apparent_pack(directory: Path) -> ApparentReferencePack:
    root = directory.resolve(); path = root / 'manifest.json'
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 65536:
        raise ValueError('apparent manifest unavailable or oversized')
    with path.open('rb') as stream:
        raw_manifest = stream.read(65537)
    if len(raw_manifest) > 65536:
        raise ValueError('apparent manifest oversized')
    def decode(raw: bytes) -> dict:
        return json.loads(raw, object_pairs_hook=_unique, parse_constant=_reject_constant)
    manifest = decode(raw_manifest)
    _keys(manifest, {'schema_version', 'source', 'scope', 'limitations', 'acceptance',
        'predeclared_plan', 'query_spec', 'query_builder', 'acquisition', 'derived_matrix'}, 'apparent manifest')
    if manifest['schema_version'] != 'horizons-apparent-reference.v1' or manifest['source'] != 'NASA/JPL Horizons API' \
            or any(not isinstance(manifest[k], str) or not manifest[k].strip() for k in ('scope', 'limitations')):
        raise ValueError('apparent reference source/scope differs')
    if manifest['acceptance'] != {'metric': 'great_circle_arcsec', 'sun_planet_arcsec': SUN_PLANET_ARCSEC, 'moon_arcsec': MOON_ARCSEC}:
        raise ValueError('apparent acceptance budget differs')
    files = {}
    for key, name in [('predeclared_plan', 'predeclared-plan.txt'), ('query_spec', 'query-spec.json'),
                      ('query_builder', 'query-builder.py.txt'), ('acquisition', 'acquisition.json'),
                      ('derived_matrix', 'apparent.csv')]:
        _keys(manifest[key], {'path', 'bytes', 'sha256'}, key)
        files[key] = _file(root, manifest[key], name)
    if hashlib.sha256(files['predeclared_plan']).hexdigest() != PLAN_SHA256:
        raise ValueError('apparent predeclared plan differs')
    expected_queries = [dict(case=key, body=body, target=target, center=399, request_url=request_url(case))
                        for case in CASES for key, body, target in [case]]
    spec = decode(files['query_spec'])
    _keys(spec, {'schema_version', 'epochs_jd_tt', 'queries'}, 'apparent query specification')
    if spec['schema_version'] != 'horizons-apparent-query-spec.v1' or spec['epochs_jd_tt'] != list(EPOCHS) \
            or spec['queries'] != expected_queries:
        raise ValueError('apparent query matrix differs')
    acquisition = decode(files['acquisition'])
    _keys(acquisition, {'schema_version', 'source', 'endpoint', 'started_at_utc', 'completed_at_utc', 'records'}, 'apparent acquisition')
    if acquisition['schema_version'] != 'horizons-apparent-acquisition.v1' or acquisition['source'] != manifest['source'] \
            or acquisition['endpoint'] != ENDPOINT:
        raise ValueError('apparent acquisition source differs')
    start, end = _utc(acquisition['started_at_utc']), _utc(acquisition['completed_at_utc'])
    if end < start or not isinstance(acquisition['records'], list) or len(acquisition['records']) != len(CASES):
        raise ValueError('complete ordered apparent acquisition required')
    references = {}; raw_hashes = {}
    allowed = {'manifest.json', 'README.md', 'predeclared-plan.txt', 'query-spec.json',
               'query-builder.py.txt', 'acquisition.json', 'apparent.csv'}
    for case, expected, record in zip(CASES, expected_queries, acquisition['records']):
        _keys(record, set(expected) | {'path', 'bytes', 'sha256', 'api_version', 'acquired_at_utc'}, 'apparent capture')
        if any(record[k] != value or type(record[k]) is not type(value) for k, value in expected.items()) \
                or record['api_version'] != '1.2' or not start <= _utc(record['acquired_at_utc']) <= end:
            raise ValueError('apparent capture identity/query/version/time differs')
        name = case[0] + '.txt'; allowed.add(name)
        raw = _file(root, record, name); raw_hashes[case[0]] = record['sha256']
        for jd, place in parse_response(raw.decode('utf-8'), case).items():
            references[(case[0], jd)] = place
    try:
        matrix = list(csv.reader(io.StringIO(files['derived_matrix'].decode('utf-8')), strict=True))
    except csv.Error as exc:
        raise ValueError('malformed derived apparent CSV') from exc
    if not matrix or tuple(matrix[0]) != CSV_FIELDS or len(matrix) != len(CASES) * len(EPOCHS) + 1:
        raise ValueError('complete derived apparent matrix required')
    for row, (jd, case) in zip(matrix[1:], ((jd, case) for jd in EPOCHS for case in CASES)):
        key, body, target = case
        if len(row) != len(CSV_FIELDS) or row[:5] != [key, body, str(target), '399', f'{jd:.9f}'] \
                or row[-1] != raw_hashes[key] or any(_NUMBER.fullmatch(value) is None for value in row[5:10]) \
                or tuple(map(float, row[5:10])) != references[(key, jd)].values():
            raise ValueError('derived apparent values differ from original response')
    if {file.name for file in root.iterdir()} - allowed:
        raise ValueError('unlisted apparent reference file')
    return ApparentReferencePack(MappingProxyType(references), hashlib.sha256(raw_manifest).hexdigest())
