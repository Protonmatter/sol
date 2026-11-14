"""Strict, network-free admission of retained Horizons Q20 range references."""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
import re
from types import MappingProxyType
import urllib.parse

from horizons_reference import ENDPOINT, _file, _keys, _reject_constant, _unique, _utc

AU_KM = 149597870.7
RELATIVE_TOLERANCE = 1e-5
ABSOLUTE_FLOOR_KM = 1.0


def range_from_response(text: str, expected_jd: float, kind: str) -> float:
    """Independently parse the exact plain-text Q2/[Q4]/Q20 columns."""
    if kind not in ('observer', 'geocentric') or not math.isfinite(expected_jd):
        raise ValueError('invalid range quantity or epoch')
    if text.count('$$SOE') != 1 or text.count('$$EOE') != 1 or text.index('$$SOE') > text.index('$$EOE'):
        raise ValueError('range reference requires one ephemeris block')
    rows = text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip().splitlines()
    headers = [line.split() for line in text.splitlines() if line.startswith('Date_________JDUT')]
    header = ['Date_________JDUT', 'R.A._(a-appar)_DEC.']
    if kind == 'observer':
        header.append('Azi____(a-app)___Elev')
    if headers != [header + ['delta', 'deldot']] or len(rows) != 1:
        raise ValueError('range reference quantity layout differs')
    fields = rows[0].split()
    token = fields.pop(0)
    if re.fullmatch(r'\d+\.\d+', token) is None:
        raise ValueError('range reference epoch must be numeric JD/UT')
    decimals = len(token.split('.')[1])
    allowance = min(1 / 86400, .5 * 10**(-decimals) + 2 * math.ulp(expected_jd))
    if abs(float(token) - expected_jd) > allowance:
        raise ValueError('range reference epoch differs from requested instant')
    if fields and re.fullmatch(r'(?:[*ACN]m?|m)', fields[0]):
        fields.pop(0)
    count = 6 if kind == 'observer' else 4
    numeric = r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?'
    if len(fields) != count or any(re.fullmatch(numeric, field) is None for field in fields):
        raise ValueError('range reference has malformed quantity tokens')
    values = list(map(float, fields))
    if not all(math.isfinite(value) for value in values) or values[-2] <= 0 \
            or not (0 <= values[0] <= 360 and -90 <= values[1] <= 90) \
            or (kind == 'observer' and not (0 <= values[2] <= 360 and -90 <= values[3] <= 90)):
        raise ValueError('range reference quantities are nonfinite or outside their domains')
    distance_km = values[-2] * AU_KM
    if not math.isfinite(distance_km):
        raise ValueError('range reference overflows kilometre units')
    return distance_km


@dataclass(frozen=True)
class RangeReferencePack:
    responses: Mapping[str, str]
    ranges: Mapping[tuple[str, str, str], float]
    manifest_sha256: str

    def fetch(self, url: str) -> str:
        try:
            return self.responses[url]
        except KeyError as exc:
            raise ValueError('uncaptured range query; offline replay cannot use the network') from exc


def load_range_pack(directory: Path, expected_requests: Mapping[tuple[str, str, str], str]) -> RangeReferencePack:
    root = directory.resolve(); path = root / 'manifest.json'
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 131072:
        raise ValueError('range manifest unavailable or oversized')
    with path.open('rb') as stream:
        raw_manifest = stream.read(131073)
    if len(raw_manifest) > 131072:
        raise ValueError('range manifest oversized')
    manifest = json.loads(raw_manifest, object_pairs_hook=_unique, parse_constant=_reject_constant)
    _keys(manifest, {'schema_version', 'source', 'api_version', 'endpoint', 'scope', 'limitations',
                    'acquisition_started_utc', 'acquisition_finished_utc', 'acceptance',
                    'query_provider', 'predeclared_plan', 'derived_matrix', 'records'}, 'range manifest')
    if manifest['schema_version'] != 'horizons-range-reference.v1' or manifest['source'] != 'NASA/JPL Horizons API' \
            or manifest['api_version'] != '1.2' or manifest['endpoint'] != ENDPOINT:
        raise ValueError('unsupported range reference source')
    if not all(isinstance(manifest[key], str) and manifest[key].strip() for key in ('scope', 'limitations')):
        raise ValueError('range evidence scope is unavailable')
    acceptance = manifest['acceptance']
    if not isinstance(acceptance, dict) or any(type(value) not in (int, float) for value in acceptance.values()) \
            or acceptance != {'relative_range': RELATIVE_TOLERANCE, 'absolute_floor_km': ABSOLUTE_FLOOR_KM, 'au_km': AU_KM}:
        raise ValueError('range acceptance budget or AU conversion differs')
    start, end = _utc(manifest['acquisition_started_utc']), _utc(manifest['acquisition_finished_utc'])
    if end < start:
        raise ValueError('range acquisition interval is reversed')
    for key, name in [('query_provider', 'query-provider.txt'), ('predeclared_plan', 'predeclared-plan.txt'), ('derived_matrix', 'ranges.csv')]:
        _keys(manifest[key], {'path', 'bytes', 'sha256'}, key)
        _file(root, manifest[key], name)
    records = manifest['records']
    if len(expected_requests) != 72 or not isinstance(records, list) or len(records) != 72:
        raise ValueError('complete 72-query range matrix required')
    replies: dict[str, str] = {}; ranges: dict[tuple[str, str, str], float] = {}
    allowed = {'manifest.json', 'README.md', 'query-provider.txt', 'predeclared-plan.txt', 'ranges.csv'}
    for record in records:
        _keys(record, {'case', 'body', 'kind', 'path', 'bytes', 'sha256', 'request_url', 'acquired_at_utc'}, 'range record')
        if not all(isinstance(record[key], str) for key in ('case', 'body', 'kind')):
            raise ValueError('range record identity must be text')
        key = record['case'], record['body'], record['kind']
        if key in ranges or key not in expected_requests or record['request_url'] != expected_requests[key]:
            raise ValueError('duplicated, unexpected or misassociated range query')
        if not start <= _utc(record['acquired_at_utc']) <= end:
            raise ValueError('range acquisition outside declared interval')
        name = '-'.join(value.lower() for value in key) + '.txt'
        text = _file(root, record, name).decode('utf-8'); allowed.add(name)
        query = urllib.parse.urlsplit(record['request_url'])
        if f'{query.scheme}://{query.netloc}{query.path}' != ENDPOINT or query.fragment:
            raise ValueError('range endpoint differs')
        params = urllib.parse.parse_qs(query.query, strict_parsing=True)
        observer = key[2] == 'observer'
        if key[2] not in ('observer', 'geocentric') or params['CENTER'] != ["'coord@399'" if observer else "'500@399'"] \
                or params['QUANTITIES'] != ["'2,4,20'" if observer else "'2,20'"]:
            raise ValueError('range center or quantity request differs')
        command = params['COMMAND'][0].strip("'")
        if re.findall(r'^Target body name:[^\r\n]*\((\d+)\)', text, re.M) != [command] \
                or re.findall(r'^Center body name:[^\r\n]*\((\d+)\)', text, re.M) != ['399'] \
                or re.findall(r'^Atmos refraction:\s+([^\r\n]+)', text, re.M) != ['NO (AIRLESS)']:
            raise ValueError('range target, Earth center or airless scope differs')
        sites = re.findall(r'^Center geodetic\s*:\s*([-+.\deE]+),\s*([-+.\deE]+),\s*([-+.\deE]+)', text, re.M)
        if observer:
            lon, lat, elev = map(float, params['SITE_COORD'][0].strip("'").split(','))
            if len(sites) != 1 or tuple(map(float, sites[0])) != (lon % 360, lat, elev):
                raise ValueError('range observer differs from requested geodetic site')
        elif re.findall(r'^Center-site name:\s*([^\r\n]+)', text, re.M) != ['GEOCENTRIC']:
            raise ValueError('range origin must be Earth geocentric')
        if not text.startswith('API VERSION: 1.2\nAPI SOURCE: NASA/JPL Horizons API\n') \
                or not re.search(r'^Units conversion:\s+1 au=\s*149597870\.700 km,', text, re.M):
            raise ValueError('range API provenance or AU unit differs')
        ranges[key] = range_from_response(text, float(params['TLIST'][0].strip("'")), key[2])
        if record['request_url'] in replies:
            raise ValueError('duplicate range URL')
        replies[record['request_url']] = text
    if {path.name for path in root.iterdir()} - allowed:
        raise ValueError('unlisted range reference file')
    return RangeReferencePack(MappingProxyType(replies), MappingProxyType(ranges), hashlib.sha256(raw_manifest).hexdigest())
