"""Strict offline admission of the retained geometric J2000/TDB vector matrix."""
from __future__ import annotations

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
from collections.abc import Mapping
import urllib.parse

from horizons_reference import ENDPOINT, _file, _keys, _reject_constant, _unique, _utc

CASES = (('mercury', 'Mercury', 1, 10), ('venus', 'Venus', 2, 10),
         ('earth', 'Earth', 399, 10), ('mars', 'Mars', 4, 10),
         ('jupiter', 'Jupiter', 5, 10), ('saturn', 'Saturn', 6, 10),
         ('uranus', 'Uranus', 7, 10), ('neptune', 'Neptune', 8, 10),
         ('moon', 'Moon', 301, 10), ('geocentric-moon', 'GeocentricMoon', 301, 399))
_DATES = sorted([dt.datetime(year, 1, 1) for year in
    (1, 1000, 1600, 1800, 1900, 1950, 2050, 2100, 2200, 2400, 3000, 5000, 7000, 9999)]
    + [dt.datetime(2000, 1, 1, 12), dt.datetime(2026, 7, 1)])
EPOCHS = tuple(date.toordinal() + 1721424.5 + date.hour / 24 for date in _DATES)
ARCSEC_PER_RADIAN = 206264.80624709636
MAXIMUM_ERROR = 10.0
CSV_FIELDS = ('case', 'body', 'target_id', 'center_id', 'jd_tdb', 'x_au', 'y_au', 'z_au', 'raw_sha256')
_NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?')
_MONTHS = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')


def _calendar(date: dt.datetime) -> str:
    return f'A.D. {date.year:04d}-{_MONTHS[date.month-1]}-{date.day:02d} {date.hour:02d}:00:00.0000'


def request_url(case: tuple[str, str, int, int]) -> str:
    if case not in CASES:
        raise ValueError('unsupported vector target/origin')
    _, _, target, center = case
    params = {'format': 'text', 'COMMAND': f"'{target}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'",
              'EPHEM_TYPE': "'VECTORS'", 'CENTER': f"'500@{center}'", 'TLIST': ' '.join(f"'{jd}'" for jd in EPOCHS),
              'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'TDB'", 'CAL_TYPE': "'GREGORIAN'", 'TIME_DIGITS': "'FRACSEC'",
              'REF_SYSTEM': "'ICRF'", 'REF_PLANE': "'ECLIPTIC'", 'VEC_CORR': "'NONE'", 'OUT_UNITS': "'AU-D'",
              'VEC_TABLE': "'1'", 'CSV_FORMAT': "'YES'", 'VEC_LABELS': "'YES'"}
    return ENDPOINT + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)


def parse_response(text: str, case: tuple[str, str, int, int]) -> Mapping[float, tuple[float, float, float]]:
    if case not in CASES or not isinstance(text, str):
        raise ValueError('unsupported vector response identity')
    _, _, target, center = case
    # Horizons returns the documented body-centre aliases for Mercury/Venus.
    returned_target = {1: 199, 2: 299}.get(target, target)
    if not text.startswith('API VERSION: 1.2\nAPI SOURCE: NASA/JPL Horizons API\n'):
        raise ValueError('vector API source/version differs')
    for kind, identity in [('Target', returned_target), ('Center', center)]:
        if re.findall(r'^' + kind + r' body name:[^\r\n]*\((\d+)\)\s+\{source: ([^}]+)\}', text, re.M) != [(str(identity), 'DE441')]:
            raise ValueError('vector target/origin/source differs')
    headers = {'Center-site name': 'BODY CENTER', 'Output units': 'AU-D', 'Calendar mode': 'Gregorian',
               'Output type': 'GEOMETRIC cartesian states', 'Output format': '1 (position only)',
               'Reference frame': 'Ecliptic of J2000.0', 'Step-size': 'DISCRETE TIME-LIST',
               'Start time': _calendar(_DATES[0]) + ' TDB', 'Stop  time': _calendar(_DATES[-1]) + ' TDB'}
    for name, expected in headers.items():
        if re.findall(r'^' + re.escape(name) + r'\s*:\s*([^\r\n]+)', text, re.M) != [expected]:
            raise ValueError('vector frame/correction/unit/calendar header differs')
    if re.findall(r'^\s+X-axis\s+: ([^\r\n]+)', text, re.M) != ['ICRF'] \
            or text.count('IAU76 obliquity of 84381.448 arcseconds wrt ICRF X-Y plane') != 1:
        raise ValueError('vector reference axes differ')
    if text.count('$$SOE') != 1 or text.count('$$EOE') != 1 or text.index('$$SOE') > text.index('$$EOE'):
        raise ValueError('vector response needs one ordered ephemeris block')
    try:
        labels = [next(csv.reader([line], strict=True)) for line in text.splitlines() if line.lstrip().startswith('JDTDB,')]
    except csv.Error as exc:
        raise ValueError('malformed vector CSV header') from exc
    if [[field.strip() for field in row] for row in labels] != [['JDTDB', 'Calendar Date (TDB)', 'X', 'Y', 'Z', '']]:
        raise ValueError('vector table columns differ')
    block = text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip()
    try:
        rows = list(csv.reader(io.StringIO(block), strict=True))
    except csv.Error as exc:
        raise ValueError('malformed vector CSV') from exc
    if len(rows) != len(EPOCHS):
        raise ValueError('complete vector epoch matrix required')
    result = {}
    for row, jd, date in zip(rows, EPOCHS, _DATES):
        fields = [field.strip() for field in row]
        if len(fields) != 6 or fields[-1] or re.fullmatch(r'\d+\.\d{9}', fields[0]) is None or float(fields[0]) != jd:
            raise ValueError('vector epoch/order/column count differs')
        calendar = _calendar(date)
        if fields[1] != calendar or any(_NUMBER.fullmatch(field) is None for field in fields[2:5]):
            raise ValueError('vector calendar or numeric token differs')
        xyz = tuple(map(float, fields[2:5]))
        if not all(math.isfinite(value) for value in xyz) or not 0 < math.hypot(*xyz) < math.inf:
            raise ValueError('vector must be finite and nonzero')
        result[jd] = xyz
    return MappingProxyType(result)


@dataclass(frozen=True)
class VectorReferencePack:
    vectors: Mapping[tuple[str, float], tuple[float, float, float]]
    manifest_sha256: str


def load_vector_pack(directory: Path) -> VectorReferencePack:
    root = directory.resolve(); path = root / 'manifest.json'
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 65536:
        raise ValueError('vector manifest unavailable or oversized')
    with path.open('rb') as stream:
        raw_manifest = stream.read(65537)
    if len(raw_manifest) > 65536:
        raise ValueError('vector manifest oversized')
    decode = lambda raw: json.loads(raw, object_pairs_hook=_unique, parse_constant=_reject_constant)
    manifest = decode(raw_manifest)
    _keys(manifest, {'schema_version', 'source', 'scope', 'limitations', 'acceptance',
        'predeclared_plan', 'query_spec', 'query_builder', 'acquisition', 'derived_matrix'}, 'vector manifest')
    if manifest['schema_version'] != 'horizons-vector-reference.v1' or manifest['source'] != 'NASA/JPL Horizons API' \
            or any(not isinstance(manifest[k], str) or not manifest[k].strip() for k in ('scope', 'limitations')):
        raise ValueError('vector reference source/scope differs')
    acceptance = manifest['acceptance']
    if not isinstance(acceptance, dict) or acceptance != {'metric': 'relative_vector_norm_arcsec',
            'maximum': MAXIMUM_ERROR, 'arcsec_per_radian': ARCSEC_PER_RADIAN} \
            or any(type(acceptance.get(k)) not in (int, float) for k in ('maximum', 'arcsec_per_radian')):
        raise ValueError('vector acceptance budget differs')
    files = {}
    for key, name in [('predeclared_plan', 'predeclared-plan.txt'), ('query_spec', 'query-spec.json'),
                      ('query_builder', 'query-builder.py.txt'), ('acquisition', 'acquisition.json'),
                      ('derived_matrix', 'vectors.csv')]:
        _keys(manifest[key], {'path', 'bytes', 'sha256'}, key)
        files[key] = _file(root, manifest[key], name)
    spec = decode(files['query_spec'])
    _keys(spec, {'schema_version', 'epochs_jd_tdb', 'queries'}, 'vector query specification')
    expected_queries = [dict(case=key, body=body, target=target, center=center, request_url=request_url(case))
                        for case in CASES for key, body, target, center in [case]]
    if spec['schema_version'] != 'horizons-vector-query-spec.v1' or spec['epochs_jd_tdb'] != list(EPOCHS) \
            or spec['queries'] != expected_queries:
        raise ValueError('vector query matrix differs')
    acquisition = decode(files['acquisition'])
    _keys(acquisition, {'schema_version', 'source', 'endpoint', 'started_at_utc', 'completed_at_utc', 'records'}, 'vector acquisition')
    if acquisition['schema_version'] != 'horizons-vector-acquisition.v1' or acquisition['source'] != manifest['source'] \
            or acquisition['endpoint'] != ENDPOINT:
        raise ValueError('vector acquisition source differs')
    start, end = _utc(acquisition['started_at_utc']), _utc(acquisition['completed_at_utc'])
    if end < start or not isinstance(acquisition['records'], list) or len(acquisition['records']) != len(CASES):
        raise ValueError('complete ordered vector acquisition required')
    references = {}; raw_hashes = {}
    allowed = {'manifest.json', 'README.md', 'predeclared-plan.txt', 'query-spec.json',
               'query-builder.py.txt', 'acquisition.json', 'vectors.csv'}
    for case, expected, record in zip(CASES, expected_queries, acquisition['records']):
        _keys(record, set(expected) | {'path', 'bytes', 'sha256', 'api_version', 'acquired_at_utc'}, 'vector capture')
        if any(record[k] != value or type(record[k]) is not type(value) for k, value in expected.items()) \
                or record['api_version'] != '1.2' or not start <= _utc(record['acquired_at_utc']) <= end:
            raise ValueError('vector capture identity/query/version/time differs')
        name = case[0] + '.txt'; allowed.add(name)
        raw = _file(root, record, name); raw_hashes[case[0]] = record['sha256']
        for jd, xyz in parse_response(raw.decode('utf-8'), case).items():
            references[(case[0], jd)] = xyz
    try:
        matrix = list(csv.reader(io.StringIO(files['derived_matrix'].decode('utf-8')), strict=True))
    except csv.Error as exc:
        raise ValueError('malformed derived vector CSV') from exc
    if not matrix or tuple(matrix[0]) != CSV_FIELDS or len(matrix) != len(CASES) * len(EPOCHS) + 1:
        raise ValueError('complete derived vector matrix required')
    for row, (jd, case) in zip(matrix[1:], ((jd, case) for jd in EPOCHS for case in CASES)):
        key, body, target, center = case
        if len(row) != len(CSV_FIELDS) or row[:5] != [key, body, str(target), str(center), f'{jd:.9f}'] \
                or row[-1] != raw_hashes[key] or any(_NUMBER.fullmatch(value) is None for value in row[5:8]) \
                or tuple(map(float, row[5:8])) != references[(key, jd)]:
            raise ValueError('derived vector differs from its original response')
    if {path.name for path in root.iterdir()} - allowed:
        raise ValueError('unlisted vector reference file')
    return VectorReferencePack(MappingProxyType(references), hashlib.sha256(raw_manifest).hexdigest())
