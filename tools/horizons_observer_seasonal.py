"""Network-free admission of the frozen monthly 2026 observer reference cohort."""
from __future__ import annotations

from collections.abc import Sequence
import argparse
from dataclasses import asdict, dataclass
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sys

from horizons_reference import ENDPOINT, _file, _keys, _reject_constant, _unique, _utc

ROOT = Path(__file__).resolve().parents[1]
PLAN_SHA256 = '7d5c6df57cf8994aecef9867848ecda36964a800cf360c2e8369d76c14a05bf3'
AMENDMENT_SHA256 = 'a07ddeacc639bbb98d0f9a4105404c5726f17be4e0d502d1c04138efe3c68fa3'
ACQUISITION_SHA256 = '261fe4cbbe78d791f36b7aca37e09a678d9f54074088749065fd20fc4dff3f59'
AU_KM = 149597870.7
ACCEPTANCE = {'sun_planet_arcsec': 10.0, 'moon_arcsec': 12.0, 'dut1_seconds': .003,
              'range_absolute_floor_km': 1.0, 'range_relative': 1e-5, 'au_km': AU_KM}
METADATA = {'plan': 'predeclared-plan.json', 'amendment': 'admission-amendment.json',
            'initial_helper': 'query-helper.py.txt', 'amended_helper': 'query-helper-amended.py.txt',
            'query_provider': 'query-provider.py.txt', 'original_acquisition': 'acquisition-original.json',
            'acquisition': 'acquisition-amended.json', 'derived_matrix': 'observer-matrix.csv'}
RECORD_FIELDS = {'id', 'request_url', 'path', 'bytes', 'sha256', 'api_version',
                 'capture_started_utc', 'capture_finished_utc', 'capture_phase'}
NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?')


def require(condition: bool, message: str) -> None:
    if not condition: raise ValueError(message)


def decode_json(raw: bytes) -> dict:
    value = json.loads(raw, object_pairs_hook=_unique, parse_constant=_reject_constant)
    require(isinstance(value, dict), 'seasonal reference metadata must be an object')
    return value


def number(token: str) -> float:
    token = token.strip()
    require(NUMBER.fullmatch(token) is not None, 'seasonal quantity is not numeric')
    value = float(token)
    require(math.isfinite(value), 'seasonal quantity is not finite')
    return value


@dataclass(frozen=True)
class ObserverRow:
    case: str
    body: str
    jd_utc: float
    reference_jd_utc: float
    latitude_deg: float
    longitude_deg_east: float
    elevation_m: float
    ra_deg: float
    dec_deg: float
    az_deg: float
    alt_deg: float
    observer_range_km: float
    dut1_seconds: float
    raw_sha256: str


@dataclass(frozen=True)
class SeasonalReferencePack:
    rows: tuple[ObserverRow, ...]
    manifest_sha256: str


def matrix_csv(rows: Sequence[ObserverRow]) -> bytes:
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=list(ObserverRow.__dataclass_fields__), lineterminator='\n')
    writer.writeheader(); writer.writerows(asdict(row) for row in rows)
    return stream.getvalue().encode('utf-8')


def parse_response(raw: bytes, query: dict) -> tuple[ObserverRow, ...]:
    require(0 < len(raw) <= 160000, 'seasonal response exceeds its byte budget')
    text = raw.decode('utf-8')
    require(text.startswith('API VERSION: 1.2\nAPI SOURCE: NASA/JPL Horizons API\n'), 'seasonal API identity differs')
    for label, target, source in [('Target', query['target'], query['target_source']), ('Center', '399', query['center_source'])]:
        identities = re.findall(r'^' + label + r' body name:[^\n]*\((\d+)\)\s+\{source: ([^}]+)\}', text, re.M)
        require(identities == [(target, source)], 'seasonal body/center kernel identity differs')
    sites = re.findall(r'^Center geodetic\s*:\s*([^{}\n]+)\{E-lon\(deg\),Lat\(deg\),Alt\(km\)\}', text, re.M)
    expected = [query['longitude_east_deg'] % 360, query['latitude_deg'], query['elevation_m'] / 1000]
    require(len(sites) == 1 and [number(x) for x in sites[0].split(',')] == expected, 'seasonal geodetic observer differs')
    require(re.findall(r'^Atmos refraction:\s+([^\n]+)', text, re.M) == ['NO (AIRLESS)']
            and re.search(r'^Units conversion:\s+1 au=\s*149597870\.700 km,', text, re.M) is not None,
            'seasonal airless/unit scope differs')
    try:
        headers = [next(csv.reader([line], strict=True)) for line in text.splitlines() if line.startswith('Date_________JDUT')]
    except csv.Error as exc:
        raise ValueError('seasonal response header CSV is malformed') from exc
    expected_header = ['Date_________JDUT', '', '', 'R.A.__(a-app)', 'DEC___(a-app)', 'Azimuth_(a-app)',
                       'Elevation_(a-app)', 'delta', 'deldot', 'UT1-UTC', '']
    require(len(headers) == 1 and [x.strip() for x in headers[0]] == expected_header, 'seasonal quantity layout differs')
    require(text.count('$$SOE') == 1 and text.count('$$EOE') == 1 and text.index('$$SOE') < text.index('$$EOE'),
            'seasonal reference requires one ephemeris block')
    try:
        rows = list(csv.reader(io.StringIO(text.split('$$SOE')[1].split('$$EOE')[0].strip()), strict=True))
    except csv.Error as exc:
        raise ValueError('seasonal response CSV is malformed') from exc
    require(len(rows) == len(query['epochs_jd_utc']) == 12, 'seasonal monthly epoch matrix differs')
    result = []; digest = hashlib.sha256(raw).hexdigest()
    for index, (row, jd) in enumerate(zip(rows, query['epochs_jd_utc'])):
        require(len(row) == 11 and not row[-1].strip(), 'seasonal quantity count differs')
        epoch, ra, dec, az, alt, distance, _rate, dut1 = [number(x) for x in [row[0], *row[3:10]]]
        require(abs(epoch - jd) <= 1e-9, 'seasonal returned epoch differs')
        require(0 <= ra <= 360 and -90 <= dec <= 90 and 0 <= az <= 360 and -90 <= alt <= 90
                and distance > 0 and abs(dut1) <= .9, 'seasonal quantity is outside its domain')
        distance *= AU_KM
        require(math.isfinite(distance), 'seasonal range conversion overflows')
        result.append(ObserverRow(query['site'].lower() + f'-{index+1:02d}', query['body'], jd, epoch,
            query['latitude_deg'], query['longitude_east_deg'], query['elevation_m'], ra % 360, dec, az % 360,
            alt, distance, dut1, digest))
    return tuple(result)


def load_pack(directory: Path) -> SeasonalReferencePack:
    root = directory.resolve(); path = root / 'manifest.json'
    require(not path.is_symlink() and path.is_file() and path.stat().st_size <= 131072, 'seasonal manifest unavailable or oversized')
    with path.open('rb') as stream: raw_manifest = stream.read(131073)
    require(len(raw_manifest) <= 131072, 'seasonal manifest grew beyond its byte budget')
    manifest = decode_json(raw_manifest)
    _keys(manifest, {'schema_version', 'source', 'api_version', 'endpoint', 'quantities', 'scope', 'limitations',
                    'acceptance', 'acquisition_started_utc', 'acquisition_finished_utc', 'metadata', 'records'}, 'seasonal manifest')
    require(manifest['schema_version'] == 'horizons-observer-seasonal.v1' and manifest['source'] == 'NASA/JPL Horizons API'
            and manifest['api_version'] == '1.2' and manifest['endpoint'] == ENDPOINT and manifest['quantities'] == [2,4,20,49],
            'unsupported seasonal protocol/source/quantities')
    acceptance = manifest['acceptance']
    require(isinstance(acceptance, dict) and all(type(v) in (int, float) for v in acceptance.values())
            and acceptance == ACCEPTANCE, 'seasonal acceptance controls differ')
    start, end = _utc(manifest['acquisition_started_utc']), _utc(manifest['acquisition_finished_utc'])
    require(start <= end, 'seasonal acquisition interval is reversed')
    metadata = manifest['metadata']; _keys(metadata, set(METADATA), 'seasonal metadata inventory')
    raw_metadata = {}
    for key, name in METADATA.items():
        _keys(metadata[key], {'path','bytes','sha256'}, 'seasonal metadata file')
        raw_metadata[key] = _file(root, metadata[key], name, maximum=512000)
    for key, digest in [('plan', PLAN_SHA256), ('amendment', AMENDMENT_SHA256), ('acquisition', ACQUISITION_SHA256)]:
        require(metadata[key]['sha256'] == digest, 'unrecognized frozen seasonal ' + key)
    plan = decode_json(raw_metadata['plan']); amendment = decode_json(raw_metadata['amendment'])
    acquisition = decode_json(raw_metadata['acquisition']); original = decode_json(raw_metadata['original_acquisition'])
    require(manifest['scope'] == plan['scope'] and manifest['limitations'] == plan['limitations'], 'seasonal scope differs from plan')
    for key, digest in [('initial_helper', plan['helper_sha256']), ('query_provider', plan['provider_sha256']),
                        ('amended_helper', amendment['helper_sha256']), ('original_acquisition', amendment['original_acquisition_sha256'])]:
        require(metadata[key]['sha256'] == digest, 'seasonal source/acquisition correspondence differs')
    require(original['status'] == 'failed' and acquisition['status'] == 'captured_not_qualified'
            and acquisition['plan_sha256'] == PLAN_SHA256 and acquisition['amendment_sha256'] == AMENDMENT_SHA256,
            'seasonal capture states were relabeled')
    require(_utc(original['started_at_utc']) == start <= _utc(original['finished_at_utc'])
            <= _utc(acquisition['resumed_at_utc']) <= end == _utc(acquisition['finished_at_utc']), 'seasonal acquisition chronology differs')
    records = manifest['records']; queries = plan['queries']; captured = acquisition['records']
    require(isinstance(records, list) and len(records) == len(queries) == len(captured) == 36, 'seasonal response matrix incomplete')
    allowed = {'manifest.json', 'README.md', 'responses', *METADATA.values()}; result = []; seen = set()
    for index, (record, query, capture) in enumerate(zip(records, queries, captured)):
        _keys(record, RECORD_FIELDS, 'seasonal response record')
        require(record == {key:capture[key] for key in RECORD_FIELDS} and record['id'] == query['id']
                and record['request_url'] == query['request_url'] and record['id'] not in seen,
                'seasonal record duplicated, changed or misassociated')
        seen.add(record['id'])
        began, ended = _utc(record['capture_started_utc']), _utc(record['capture_finished_utc'])
        require(start <= began <= ended <= end and record['capture_phase'] == ('original' if index < 6 else 'amended')
                and record['api_version'] == '1.2', 'seasonal capture attribution differs')
        name = query['id'] + '.txt'
        require(record['path'] == 'responses/' + name, 'seasonal response path differs')
        raw = _file(root / 'responses', {'path':name,'bytes':record['bytes'],'sha256':record['sha256']}, name, maximum=160000)
        if index < 6:
            require(record['sha256'] == amendment['captured_before_amendment_sha256'][name], 'preserved seasonal response changed')
        result.extend(parse_response(raw, {**query, 'center_source':amendment['center_sources'][query['body']]}))
    body_order = {name:index for index,name in enumerate(('Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'))}
    site_order = {name:index for index,name in enumerate(('boston','sydney','reykjavik','nairobi'))}
    result.sort(key=lambda row:(site_order[row.case.rsplit('-',1)[0]], row.case, body_order[row.body]))
    require(len(result) == 432 and matrix_csv(result) == raw_metadata['derived_matrix'], 'seasonal derived matrix differs from raw responses')
    require({p.name for p in root.iterdir()} == allowed
            and {p.name for p in (root/'responses').iterdir()} == {query['id']+'.txt' for query in queries}, 'unlisted seasonal reference file')
    return SeasonalReferencePack(tuple(result), hashlib.sha256(raw_manifest).hexdigest())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-dir', type=Path, default=ROOT/'tests/fixtures/horizons-observer-seasonal-20261104')
    parser.add_argument('--matrix', type=Path, default=ROOT/'crates/solar-ephemeris/data/horizons-observer-seasonal-20261104.csv')
    args = parser.parse_args(argv)
    try:
        pack = load_pack(args.reference_dir)
        require(args.matrix.read_bytes() == matrix_csv(pack.rows), 'crate seasonal matrix differs')
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print(f'FAIL: seasonal reference admission: {exc}', file=sys.stderr)
        return 1
    print(f'OK: {len(pack.rows)} seasonal reference rows admitted; native accuracy qualification is separate')
    return 0


if __name__ == '__main__': raise SystemExit(main())
