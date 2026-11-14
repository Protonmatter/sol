"""Bounded offline admission of the retained configured-model event references.

The two-second peak intervals are conditional on sampled unimodality. They are
not observed horizon events, continuous error bounds or meridian transits.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
import csv
from dataclasses import dataclass, replace
import hashlib
import io
import json
import math
from pathlib import Path
import re
from types import MappingProxyType
import urllib.parse

from horizons_reference import ENDPOINT, _file, _keys, _reject_constant, _unique, _utc

PLAN_SHA256 = '90b5e6d6fd4f953122c3df9498696a8e524cda27fe7e8e8933423b91d20b8a67'
AU_KM = 149597870.7
RADII_KM = MappingProxyType({'Sun': 695700.0, 'Moon': 1737.4})
MAXIMUM_EVENT_DIFFERENCE_SECONDS = 10.0
_NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?')


def _number(token: str) -> float:
    token = token.strip()
    if _NUMBER.fullmatch(token) is None:
        raise ValueError('event reference has a non-numeric quantity')
    value = float(token)
    if not math.isfinite(value):
        raise ValueError('event reference has a non-finite quantity')
    return value


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _json(raw: bytes) -> dict:
    value = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique, parse_constant=_reject_constant)
    if not isinstance(value, dict):
        raise ValueError('event reference metadata must be an object')
    return value


@dataclass(frozen=True)
class EventRow:
    jd_utc: float
    ra_deg: float
    dec_deg: float
    az_deg: float
    alt_deg: float
    range_km: float
    dut1_seconds: float
    marker: str


@dataclass(frozen=True)
class EventInterval:
    case_id: str
    body: str
    event: str
    day_start_jd_utc: float
    latitude_deg: float
    longitude_deg_east: float
    elevation_m: float
    start_jd_utc: float
    end_jd_utc: float
    method: str
    raw_sha256: str = ''


@dataclass(frozen=True)
class EventReferencePack:
    intervals: tuple[EventInterval, ...]
    responses: Mapping[str, str]
    manifest_sha256: str


def parse_event_rows(raw: bytes, query: Mapping) -> tuple[EventRow, ...]:
    """Require the complete requested airless UT grid, site and DE441 bodies."""
    _require(0 < len(raw) <= 160000, 'event response exceeds its byte budget')
    text = raw.decode('utf-8')
    _require(text.startswith('API VERSION: 1.2\nAPI SOURCE: NASA/JPL Horizons API\n'), 'event API identity differs')
    for label, target in [('Target', query['target']), ('Center', '399')]:
        identities = re.findall(r'^' + label + r' body name:[^\n]*\((\d+)\)\s+\{source: ([^}]+)\}', text, re.M)
        _require(identities == [(target, 'DE441')], 'event body/source identity differs')
    site = re.findall(r'^Center geodetic\s*:\s*([^{}\n]+)\{E-lon\(deg\),Lat\(deg\),Alt\(km\)\}', text, re.M)
    expected_site = [query['longitude_east_deg'], query['latitude_deg'], query['elevation_m'] / 1000]
    _require(len(site) == 1 and [_number(x) for x in site[0].split(',')] == expected_site, 'event terrestrial site differs')
    headings = re.findall(r'^Date[^\r\n]+', text, re.M)
    expected = ['Date_________JDUT', '', '', 'R.A.__(a-app)', 'DEC___(a-app)', 'Azimuth_(a-app)',
                'Elevation_(a-app)', 'delta', 'deldot', 'UT1-UTC', '']
    _require(len(headings) == 1 and [x.strip() for x in next(csv.reader(headings, strict=True))] == expected,
             'event time/frame/columns differ')
    for pattern in [r'^Atmos refraction:\s*NO \(AIRLESS\)\s*$', r'^Calendar mode\s*:\s*Gregorian\s*$',
                    r'^RA format\s*:\s*DEG\s*$', r'^Time format\s*:\s*JD\s*$',
                    r'^Step-size\s*:\s*360 steps\s*$', r'^RTS-only print\s*:\s*NO\s*$',
                    r'^Center pole/equ\s*:\s*ITRF93\s*\{East-longitude positive\}\s*$']:
        _require(len(re.findall(pattern, text, re.M)) == 1, 'event reference convention differs')
    _require('1 au= 149597870.700 km' in text, 'event reference AU conversion differs')
    _require(text.count('$$SOE') == text.count('$$EOE') == 1 and text.index('$$SOE') < text.index('$$EOE'),
             'event table boundaries differ')
    rows = list(csv.reader(io.StringIO(text.split('$$SOE')[1].split('$$EOE')[0].strip()), strict=True))
    _require(len(rows) == 361, 'event fine grid is incomplete')
    result = []
    for i, row in enumerate(rows):
        _require(len(row) == 11 and row[-1].strip() == '' and row[2].strip() in ('', 'm', 'r', 's', 'e', 't'),
                 'event columns/markers differ')
        jd, ra, dec, az, alt, delta, _, dut1 = [_number(row[j]) for j in (0, 3, 4, 5, 6, 7, 8, 9)]
        requested = query['start_jd_utc'] + (query['stop_jd_utc'] - query['start_jd_utc']) * i / 360
        _require(abs(jd - requested) <= .5e-9 + 2 * math.ulp(requested), 'event epoch identity differs')
        distance = delta * AU_KM
        _require(0 <= ra < 360 and -90 <= dec <= 90 and 0 <= az < 360 and -90 <= alt <= 90
                 and math.isfinite(distance) and distance > RADII_KM[query['body']] and abs(dut1) <= .9,
                 'event reference quantity is outside its domain')
        result.append(EventRow(jd, ra, dec, az, alt, distance, dut1, row[2].strip()))
    return tuple(result)


def reference_interval(rows: Sequence[EventRow], query: Mapping) -> EventInterval:
    """Derive fixed-grid intervals, keeping e/t markers out of time bounds."""
    _require(len(rows) == 361, 'event interval needs the complete fine grid')
    event = query['event']
    if event == 'peak':
        peaks = [i for i in range(1, len(rows) - 1)
                 if rows[i].alt_deg > rows[i - 1].alt_deg and rows[i].alt_deg > rows[i + 1].alt_deg]
        _require(len(peaks) == 1, 'event reference needs one strict sampled maximum')
        i = peaks[0]
        _require(all(rows[j].alt_deg < rows[j + 1].alt_deg for j in range(i))
                 and all(rows[j].alt_deg > rows[j + 1].alt_deg for j in range(i, len(rows) - 1)),
                 'event peak grid is not strictly unimodal')
        start, end = rows[i - 1].jd_utc, rows[i + 1].jd_utc
        method, maximum_width = 'sampled_unimodal_peak', 2.001
    else:
        _require(event in ('rise', 'set'), 'unsupported event quantity')
        radius = RADII_KM[query['body']]
        margins = [r.alt_deg + 34 / 60 + math.degrees(math.asin(radius / r.range_km)) for r in rows]
        sign = 1 if event == 'rise' else -1
        _require(all(sign * (b - a) > 0 for a, b in zip(margins, margins[1:])),
                 'event crossing grid is not strictly directional')
        crossings = [i for i in range(len(rows) - 1) if sign * margins[i] < 0 < sign * margins[i + 1]]
        _require(len(crossings) == 1, 'event reference needs one strict directional crossing')
        i = crossings[0]
        start, end = rows[i].jd_utc, rows[i + 1].jd_utc
        method, maximum_width = 'threshold_crossing', 1.001
    _require(0 < (end - start) * 86400 <= maximum_width, 'event reference interval width differs')
    _require(query['day_start_jd_utc'] <= start < end < query['day_start_jd_utc'] + 1,
             'event reference interval leaves the mean solar day')
    return EventInterval(query['case_id'], query['body'], event, query['day_start_jd_utc'], query['latitude_deg'],
                         query['longitude_east_deg'], query['elevation_m'], start, end, method)


def event_csv(intervals: Sequence[EventInterval]) -> bytes:
    """Render the exact compact native fixture with explicit coordinate/time fields."""
    output = io.StringIO(newline='')
    writer = csv.writer(output, lineterminator='\n')
    writer.writerow(['case', 'body', 'event', 'day_start_jd_utc', 'latitude_deg', 'longitude_deg_east', 'elevation_m',
                     'reference_start_jd_utc', 'reference_end_jd_utc', 'method', 'raw_sha256'])
    for r in intervals:
        writer.writerow([r.case_id, r.body, r.event, f'{r.day_start_jd_utc:.12f}', r.latitude_deg,
                         r.longitude_deg_east, r.elevation_m, f'{r.start_jd_utc:.12f}', f'{r.end_jd_utc:.12f}',
                         r.method, r.raw_sha256])
    return output.getvalue().encode('utf-8')


def load_event_pack(directory: Path) -> EventReferencePack:
    """Admit the pinned plan, all original replies and regenerated interval CSV."""
    root = Path(directory).resolve()
    path = root / 'manifest.json'
    _require(path.is_file() and not path.is_symlink() and path.stat().st_size <= 131072, 'event manifest unavailable or oversized')
    with path.open('rb') as stream:
        raw_manifest = stream.read(131073)
    _require(len(raw_manifest) <= 131072, 'event manifest exceeds its byte budget')
    manifest = _json(raw_manifest)
    _keys(manifest, {'schema_version', 'source', 'api_version', 'endpoint', 'quantities', 'scope', 'limitations',
                     'plan', 'acquisition', 'selector', 'acquirer', 'query_helper', 'derived_matrix', 'records'}, 'event manifest')
    _require(manifest['schema_version'] == 'horizons-event-reference.v1' and manifest['source'] == 'NASA/JPL Horizons API'
             and manifest['api_version'] == '1.2' and manifest['endpoint'] == ENDPOINT
             and manifest['quantities'] == [2, 4, 20, 49], 'event source or quantity identity differs')
    _require(all(isinstance(manifest[k], str) and manifest[k].strip() for k in ('scope', 'limitations')),
             'event reference scope is missing')
    for key in ('plan', 'acquisition', 'selector', 'acquirer', 'query_helper', 'derived_matrix'):
        _keys(manifest[key], {'path', 'bytes', 'sha256'}, 'event metadata record')
    plan_raw = _file(root, manifest['plan'], 'plan.json', 65536)
    _require(hashlib.sha256(plan_raw).hexdigest() == PLAN_SHA256, 'predeclared event plan differs')
    plan = _json(plan_raw)
    acquisition = _json(_file(root, manifest['acquisition'], 'acquisition.json', 65536))
    selector = _file(root, manifest['selector'], 'selector.py.txt', 65536)
    acquirer = _file(root, manifest['acquirer'], 'acquirer.py.txt', 65536)
    helper = _file(root, manifest['query_helper'], 'query-helper.py.txt', 131072)
    _require(hashlib.sha256(selector).hexdigest() == plan['selector_source_sha256']
             and hashlib.sha256(acquirer).hexdigest() == acquisition['acquirer_sha256']
             and hashlib.sha256(helper).hexdigest() == plan['helper_sha256'], 'event acquisition helper identities differ')
    _require(acquisition['complete'] is True and acquisition['plan_sha256'] == PLAN_SHA256
             and acquisition['attempts_per_query'] == 1, 'event acquisition is incomplete or differs')
    _require(_utc(plan['frozen_at_utc']) <= _utc(acquisition['started_at_utc']) <= _utc(acquisition['finished_at_utc']),
             'event acquisition chronology differs')
    _require(isinstance(manifest['records'], list) and len(manifest['records']) == 32, 'event response population differs')
    records = {}
    for record in manifest['records']:
        _keys(record, {'path', 'bytes', 'sha256'}, 'event response record')
        _require(isinstance(record['path'], str) and record['path'] not in records, 'event response association is duplicated')
        records[record['path']] = record
    queries = plan['queries']
    _require(set(records) == {q['response'] for q in queries} and len(queries) == 32, 'event query population differs')
    _require(isinstance(acquisition['records'], list), 'event acquisition records must be a list')
    acquired = {}
    for record in acquisition['records']:
        _keys(record, {'response', 'bytes', 'sha256', 'requested_at_utc', 'received_at_utc'}, 'event acquisition record')
        _require(isinstance(record['response'], str) and record['response'] not in acquired,
                 'event acquisition association is duplicated')
        _require(_utc(acquisition['started_at_utc']) <= _utc(record['requested_at_utc'])
                 <= _utc(record['received_at_utc']) <= _utc(acquisition['finished_at_utc']),
                 'event request chronology differs')
        acquired[record['response']] = record
    _require(len(acquisition['records']) == len(acquired) == 32 and set(acquired) == set(records), 'event acquired inventory differs')
    intervals, responses = [], {}
    for q in queries:
        name = q['response']; record = records[name]; original = acquired[name]
        _require(record['bytes'] == original['bytes'] and record['sha256'] == original['sha256'], 'event raw acquisition identity differs')
        params = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(q['url']).query))
        _require(params['QUANTITIES'] == "'2,4,20,49'" and params['TIME_TYPE'] == "'UT'"
                 and params['APPARENT'] == "'AIRLESS'" and params['STEP_SIZE'] == "'360'", 'event request convention differs')
        raw = _file(root, record, name, 160000)
        interval = reference_interval(parse_event_rows(raw, q), q)
        intervals.append(replace(interval, raw_sha256=record['sha256']))
        responses[name] = raw.decode('utf-8')
    derived = _file(root, manifest['derived_matrix'], 'events.csv', 32768)
    _require(derived == event_csv(intervals), 'event derived intervals differ from raw references')
    return EventReferencePack(tuple(intervals), MappingProxyType(responses), hashlib.sha256(raw_manifest).hexdigest())
