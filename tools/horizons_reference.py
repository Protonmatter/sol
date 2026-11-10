"""Bounded, network-free admission of raw Horizons observer reference packs."""
from __future__ import annotations
from collections.abc import Mapping
from dataclasses import dataclass
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
from types import MappingProxyType
import urllib.parse

ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api'


def _unique(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'duplicate reference JSON key: {key}')
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise ValueError(f'non-JSON reference constant: {value}')


def _keys(value: object, expected: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError(f'invalid {label} fields')


def _utc(value: str) -> dt.datetime:
    if not isinstance(value, str):
        raise ValueError('reference acquisition time must be UTC text')
    result = dt.datetime.fromisoformat(value)
    if result.tzinfo is None or result.utcoffset() != dt.timedelta(0):
        raise ValueError('reference acquisition time must include UTC offset')
    return result


def _file(root: Path, record: dict, expected_name: str, maximum: int = 65536) -> bytes:
    if record.get('path') != expected_name or not re.fullmatch(r'[a-f0-9]{64}', str(record.get('sha256', ''))):
        raise ValueError('reference path or SHA-256 identity is invalid')
    path = root / expected_name
    if path.is_symlink() or path.resolve().parent != root or not path.is_file():
        raise ValueError('reference file escapes its pack or is unavailable')
    if path.stat().st_size > maximum:
        raise ValueError('reference file exceeds its byte budget')
    with path.open('rb') as stream:
        raw = stream.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError('reference file exceeds its byte budget')
    if hashlib.sha256(raw).hexdigest() != record['sha256']:
        raise ValueError(f'reference bytes changed: {expected_name}')
    if 'bytes' in record and (type(record['bytes']) is not int or record['bytes'] != len(raw)):
        raise ValueError(f'reference byte count changed: {expected_name}')
    return raw


@dataclass(frozen=True)
class HorizonsReferencePack:
    responses: Mapping[str, str]
    manifest_sha256: str
    acquisition_started_utc: str
    acquisition_finished_utc: str

    def fetch(self, url: str) -> str:
        try:
            return self.responses[url]
        except KeyError as exc:
            raise ValueError('no exact captured Horizons query; offline replay cannot use the network') from exc


def load_reference_pack(directory: Path, expected_requests: Mapping[tuple[str, str], str]) -> HorizonsReferencePack:
    """Verify the complete requested matrix once, then expose immutable replies."""
    root = Path(directory).resolve()
    manifest_path = root / 'manifest.json'
    if manifest_path.is_symlink() or not manifest_path.is_file() or manifest_path.stat().st_size > 131072:
        raise ValueError('reference manifest unavailable or exceeds its byte budget')
    with manifest_path.open('rb') as stream:
        raw_manifest = stream.read(131073)
    if len(raw_manifest) > 131072:
        raise ValueError('reference manifest exceeds its byte budget')
    manifest = json.loads(raw_manifest.decode('utf-8'), object_pairs_hook=_unique, parse_constant=_reject_constant)
    _keys(manifest, {'schema_version','source','api_version','endpoint','quantities','scope','limitations',
        'acquisition_started_utc','acquisition_finished_utc','query_helper','derived_matrix','records'}, 'manifest')
    if manifest['schema_version'] != 'horizons-observer-reference.v1' or manifest['source'] != 'NASA/JPL Horizons API' \
        or manifest['endpoint'] != ENDPOINT or manifest['quantities'] != [2,4,49]:
        raise ValueError('unsupported reference source, version or quantity scope')
    if not all(isinstance(manifest[key], str) and manifest[key].strip() for key in ['api_version','scope','limitations']):
        raise ValueError('reference provenance text is unavailable')
    start, end = _utc(manifest['acquisition_started_utc']), _utc(manifest['acquisition_finished_utc'])
    if end < start:
        raise ValueError('reference acquisition interval is reversed')
    helper = manifest['query_helper']
    _keys(helper, {'path','sha256','base_git_revision'}, 'acquisition helper')
    if not re.fullmatch(r'[a-f0-9]{40}', str(helper['base_git_revision'])):
        raise ValueError('reference helper base revision is invalid')
    _file(root, helper, 'query-helper.txt')
    matrix = manifest['derived_matrix']
    _keys(matrix, {'path','bytes','sha256'}, 'derived matrix')
    _file(root, matrix, 'observer-matrix.csv')
    records = manifest['records']
    if not isinstance(records, list) or not expected_requests or len(records) != len(expected_requests):
        raise ValueError('reference matrix is incomplete')
    replies: dict[str, str] = {}; seen: set[tuple[str, str]] = set()
    allowed = {'manifest.json','README.md','query-helper.txt','observer-matrix.csv'}
    for record in records:
        _keys(record, {'case','body','request_url','path','bytes','sha256','acquired_at_utc'}, 'reference record')
        if not isinstance(record['case'], str) or not isinstance(record['body'], str):
            raise ValueError('reference case/body must be text')
        key = (record['case'], record['body'])
        if key in seen or key not in expected_requests or record['request_url'] != expected_requests[key]:
            raise ValueError('reference query is duplicated, unexpected or misassociated')
        seen.add(key)
        if not start <= _utc(record['acquired_at_utc']) <= end:
            raise ValueError('reference acquisition is outside its declared interval')
        name = f'{key[0].lower()}-{key[1].lower()}.txt'
        raw = _file(root, record, name); text = raw.decode('utf-8'); allowed.add(name)
        query = urllib.parse.urlsplit(record['request_url'])
        if f'{query.scheme}://{query.netloc}{query.path}' != ENDPOINT or query.fragment:
            raise ValueError('reference endpoint differs')
        parameters = urllib.parse.parse_qs(query.query, strict_parsing=True)
        command = parameters['COMMAND'][0].strip("'")
        expected_site = tuple(map(float, parameters['SITE_COORD'][0].strip("'").split(',')))
        sites = re.findall(r'^Center geodetic\s*:\s*([-+.\deE]+),\s*([-+.\deE]+),\s*([-+.\deE]+)', text, re.M)
        if len(sites) != 1 or tuple(map(float, sites[0])) != expected_site:
            raise ValueError('raw reference observer differs from the requested geodetic site')
        if re.findall(r'^Target body name:[^\r\n]*\((\d+)\)', text, re.M) != [command] \
            or re.findall(r'^Center body name:[^\r\n]*\((\d+)\)', text, re.M) != ['399'] \
            or not re.search(r'^Atmos refraction:\s+NO \(AIRLESS\)', text, re.M):
            raise ValueError('raw reference target, Earth center or airless scope differs')
        if not text.startswith(f"API VERSION: {manifest['api_version']}\nAPI SOURCE: NASA/JPL Horizons API\n"):
            raise ValueError('raw reference API provenance differs')
        if record['request_url'] in replies:
            raise ValueError('duplicate reference URL')
        replies[record['request_url']] = text
    if {path.name for path in root.iterdir()} - allowed:
        raise ValueError('reference pack contains unlisted files')
    return HorizonsReferencePack(MappingProxyType(replies), hashlib.sha256(raw_manifest).hexdigest(),
        manifest['acquisition_started_utc'], manifest['acquisition_finished_utc'])
