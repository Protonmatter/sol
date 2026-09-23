#!/usr/bin/env python3
"""Acquire a bounded public Helioviewer archive or prepare it offline.

Acquisition requires explicit --acquire and retains JP2/XML/closest-image bytes.
Preparation needs existing Pillow with JPEG2000 support; adds no dependencies.
Outputs are immutable: same-byte replay is a no-op; different output is rejected.
Exit 0 success, 1 processing/validation failure, 2 argument errors.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
API = 'https://api.helioviewer.org/v2/'
MAX_SOURCE_BYTES = 4 * 1024 * 1024
MAX_FRAMES = 121
SCHEMA_PATH = ROOT / 'docs/solar-observation-sequence-v1.schema.json'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def timestamp(value: str) -> float:
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z', value):
        raise ValueError('timestamp must explicitly use UTC Z')
    return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def parse_header(raw: bytes) -> dict:
    if len(raw) > 128 * 1024 or b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
        raise ValueError('unsafe/over-budget metadata')
    root = ET.fromstring(raw)
    def field(name: str) -> str | None:
        return root.findtext('fits/' + name)
    observed = field('DATE-OBS')
    if observed is None or field('WAVELNTH') != '171':
        raise ValueError('missing capture time or wrong channel')
    observed = observed.rstrip('Z') + 'Z'
    timestamp(observed)
    quality = int(field('QUALITY')) if field('QUALITY') is not None else None
    exposure = float(field('EXPTIME')) if field('EXPTIME') is not None else None
    if exposure is not None and (not math.isfinite(exposure) or exposure <= 0):
        raise ValueError('invalid exposure')
    wcs = {}
    for key in ('CDELT1', 'CDELT2', 'CRPIX1', 'CRPIX2', 'CRVAL1', 'CRVAL2', 'CROTA2', 'RSUN_OBS', 'DSUN_OBS', 'CRLN_OBS', 'CRLT_OBS'):
        if field(key) is not None:
            value = float(field(key))
            if not math.isfinite(value): raise ValueError('nonfinite WCS')
            wcs[key] = value
    return {'observed_at': observed, 'quality_raw': quality,
            'quality_interpretation': 'unqualified-provider-quality',
            'exposure_seconds': exposure, 'wcs': wcs, 'permitted_interpolation': 'none'}


def jp2_xml(raw: bytes) -> bytes:
    """Read the single top-level XML box with bounded JP2 box framing.

    Supports normal, extended and terminal box lengths; never searches codestream
    bytes for apparent XML or metadata. Unknown boxes are skipped by their length.
    """
    if len(raw) > MAX_SOURCE_BYTES or raw[:12] != b'\x00\x00\x00\x0cjP  \r\n\x87\n':
        raise ValueError('invalid or over-budget JP2 signature')
    offset = 0
    xml = None
    boxes = 0
    while offset < len(raw):
        boxes += 1
        if boxes > 64 or len(raw) - offset < 8: raise ValueError('invalid JP2 box framing')
        size = int.from_bytes(raw[offset:offset + 4], 'big')
        kind = raw[offset + 4:offset + 8]
        header_size = 8
        if size == 1:
            if len(raw) - offset < 16: raise ValueError('truncated extended JP2 box')
            size = int.from_bytes(raw[offset + 8:offset + 16], 'big')
            header_size = 16
        elif size == 0:
            size = len(raw) - offset
        if size < header_size or size > len(raw) - offset: raise ValueError('invalid JP2 box length')
        if kind == b'xml ':
            if xml is not None or size - header_size > 128 * 1024: raise ValueError('duplicate/over-budget JP2 XML')
            xml = raw[offset + header_size:offset + size]
        offset += size
    if xml is None: raise ValueError('missing JP2 XML metadata')
    # LMSAL's retained XML boxes end in NUL padding. Remove only terminal NULs;
    # embedded NULs remain XML errors and box boundaries are never inferred.
    return xml.rstrip(b'\x00')


def bind_source_records(entry: dict, data: dict[str, bytes], cadence_seconds: float = 60) -> dict:
    """Reconcile hashed records; closest-image dates truncate UTC to whole seconds.

    The JP2 embedded FITS fields establish source metadata, the separate header
    must agree, and closest JSON binds archive identity/channel/geometry. URL
    endpoint/parameters bind each retained record to its corresponding request.
    """
    embedded = jp2_xml(data['source'])
    parsed = parse_header(embedded)
    external = parse_header(data['metadata'])
    if parsed != external: raise ValueError('JP2/header metadata disagreement')
    def identity(raw: bytes) -> dict[str, str | None]:
        fits = ET.fromstring(raw).find('fits')
        if fits is None: raise ValueError('missing FITS metadata')
        fields = {}
        for child in fits:
            if child.tag in fields: raise ValueError('duplicate FITS metadata field')
            fields[child.tag] = child.text.strip() if child.text is not None else None
        keys = ('TELESCOP', 'INSTRUME', 'WAVELNTH', 'DATE-OBS', 'T_OBS', 'QUALITY', 'EXPTIME', 'NAXIS1', 'NAXIS2', 'FSN', 'DRMS_ID')
        return {key: fields.get(key) for key in keys}
    source_identity = identity(embedded)
    if source_identity != identity(data['metadata']): raise ValueError('JP2/header identity disagreement')
    if any(source_identity[key] != value for key, value in {'TELESCOP':'SDO', 'INSTRUME':'AIA_3', 'WAVELNTH':'171', 'NAXIS1':'4096', 'NAXIS2':'4096'}.items()):
        raise ValueError('unsupported source identity/channel/geometry')
    def unique_pairs(pairs):
        value = {}
        for key, member in pairs:
            if key in value: raise ValueError('duplicate closest-image key')
            value[key] = member
        return value
    if len(data['closest']) > 65536: raise ValueError('closest-image metadata budget')
    closest = json.loads(data['closest'], object_pairs_hook=unique_pairs)
    if not isinstance(closest, dict) or str(closest.get('id')) != entry['archive_id'] or not re.fullmatch(r'[0-9]+', entry['archive_id']):
        raise ValueError('closest-image archive ID disagreement')
    if closest.get('name') != 'AIA 171' or closest.get('width') != 4096 or closest.get('height') != 4096:
        raise ValueError('closest-image channel/geometry disagreement')
    # API closest records omit fractions, while DATE-OBS retains milliseconds.
    if closest.get('date') != parsed['observed_at'][:19].replace('T', ' '):
        raise ValueError('closest-image capture second disagreement')
    requested = timestamp(entry['requested_at'])
    if not math.isfinite(cadence_seconds) or not 36 <= cadence_seconds <= 3600 or abs(timestamp(parsed['observed_at']) - requested) > cadence_seconds:
        raise ValueError('source/request time outside cadence')
    urls = {
        'source_url': ('getJP2Image/', {'date':parsed['observed_at'], 'sourceId':'10'}),
        'metadata_url': ('getJP2Header/', {'id':entry['archive_id']}),
        'closest_url': ('getClosestImage/', {'date':entry['requested_at'], 'sourceId':'10'}),
    }
    for key, (endpoint, expected) in urls.items():
        url = urllib.parse.urlsplit(entry[key])
        pairs = urllib.parse.parse_qsl(url.query, keep_blank_values=True, strict_parsing=True)
        if url.scheme != 'https' or url.netloc != 'api.helioviewer.org' or url.path != '/v2/' + endpoint or url.fragment or len(pairs) != len(expected) or dict(pairs) != expected:
            raise ValueError('provenance URL disagreement: ' + key)
    return parsed


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('archive redirect rejected')


def fetch(url: str, limit: int) -> bytes:
    if not url.startswith(API): raise ValueError('unexpected archive host')
    with urllib.request.build_opener(NoRedirect).open(url, timeout=30) as response:
        data = response.read(limit + 1)
        if len(data) > limit: raise ValueError('archive response exceeds budget')
        return data


def acquire(destination: Path, start: str, count: int = 31, cadence: int = 60) -> None:
    if not 2 <= count <= MAX_FRAMES or not 36 <= cadence <= 3600 or (count - 1) * cadence > 7200:
        raise ValueError('acquisition exceeds 121 frames / two hours or cadence bounds')
    timestamp(start)
    if (destination / 'source.json').exists():
        old = json.loads((destination / 'source.json').read_bytes())
        if (old['start'], old['count'], old['cadence_seconds']) != (start, count, cadence):
            raise ValueError('source destination already belongs to another recipe')
        for entry in old['frames']:
            for key in ('source', 'metadata', 'closest'):
                if sha((destination / entry[key + '_file']).read_bytes()) != entry[key + '_sha256']:
                    raise ValueError('existing source changed')
        return
    if destination.exists() and any(destination.iterdir()): raise ValueError('nonempty source destination')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='sequence-acquire-', dir=destination.parent))
    try:
        entries = []
        for index in range(count):
            requested = (datetime.fromisoformat(start.replace('Z', '+00:00')) + timedelta(seconds=index * cadence)).isoformat().replace('+00:00', 'Z')
            closest_url = API + 'getClosestImage/?' + urllib.parse.urlencode({'date': requested, 'sourceId': 10})
            closest_raw = fetch(closest_url, 65536)
            closest = json.loads(closest_raw)
            metadata_url = API + 'getJP2Header/?id=' + str(int(closest['id']))
            metadata = fetch(metadata_url, 128 * 1024)
            parsed = parse_header(metadata)
            if abs(timestamp(parsed['observed_at']) - timestamp(requested)) > cadence:
                raise ValueError('archive closest frame outside one requested cadence')
            source_url = API + 'getJP2Image/?' + urllib.parse.urlencode({'date': parsed['observed_at'], 'sourceId': 10})
            source = fetch(source_url, MAX_SOURCE_BYTES)
            entry = {'requested_at': requested, 'archive_id': str(closest['id']),
                     'source_url': source_url, 'metadata_url': metadata_url, 'closest_url': closest_url}
            for key, data, suffix in [('source', source, '.jp2'), ('metadata', metadata, '.xml'), ('closest', closest_raw, '.json')]:
                filename = f'{index:03d}{suffix}'
                (temporary / filename).write_bytes(data)
                entry[key + '_file'] = filename
                entry[key + '_sha256'] = sha(data)
            entries.append(entry)
            print(f'acquired {index + 1}/{count}: {parsed["observed_at"]}', flush=True)
        receipt = {'start': start, 'count': count, 'cadence_seconds': cadence,
                   'retrieved_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), 'frames': entries}
        (temporary / 'source.json').write_bytes(canonical(receipt))
        if destination.exists(): destination.rmdir()  # empty destination only
        temporary.rename(destination)
    finally:
        if temporary.exists(): shutil.rmtree(temporary)


def validate_manifest(manifest: dict, web_root: Path | None = None) -> None:
    schema = json.loads(SCHEMA_PATH.read_text())
    def check(value: object, rule: dict, name: str) -> None:
        if '$ref' in rule:
            return check(value, schema['$defs'][rule['$ref'].split('/')[-1]], name)
        if 'const' in rule and value != rule['const']: raise ValueError(name + ' constant')
        if 'enum' in rule and value not in rule['enum']: raise ValueError(name + ' enum')
        kind = rule.get('type')
        if isinstance(kind, list):
            if value is None and 'null' in kind: return
            kind = next(item for item in kind if item != 'null')
        if kind == 'object':
            if not isinstance(value, dict): raise ValueError(name + ' object')
            if rule.get('additionalProperties') is False and set(value) - set(rule['properties']): raise ValueError(name + ' unknown key')
            if set(rule.get('required', [])) - set(value): raise ValueError(name + ' missing key')
            for key, member in value.items():
                child = rule.get('properties', {}).get(key, rule.get('additionalProperties', {}))
                if isinstance(child, dict): check(member, child, name + '.' + key)
        elif kind == 'array':
            if not isinstance(value, list) or not rule.get('minItems', 0) <= len(value) <= rule.get('maxItems', 10000): raise ValueError(name + ' array budget')
            for member in value: check(member, rule.get('items', {}), name)
        elif kind in ('number', 'integer'):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value): raise ValueError(name + ' finite number')
            if kind == 'integer' and int(value) != value: raise ValueError(name + ' integer')
            if not rule.get('minimum', -math.inf) <= value <= rule.get('maximum', math.inf): raise ValueError(name + ' range')
        elif kind == 'string':
            if not isinstance(value, str) or len(value) < rule.get('minLength', 0): raise ValueError(name + ' string')
            if 'pattern' in rule and not re.search(rule['pattern'], value): raise ValueError(name + ' pattern')
    check(manifest, schema, 'manifest')
    previous = None
    seen = set()
    for frame in manifest['frames']:
        current = timestamp(frame['observed_at'])
        if frame['id'] in seen or (previous is not None and current <= previous): raise ValueError('duplicate/unordered frame')
        gap = 0 if previous is None else current - previous
        if abs(gap - frame['gap_before_seconds']) > .001: raise ValueError('incorrect gap')
        if web_root is not None:
            data = (web_root / frame['asset_path']).read_bytes()
            if len(data) != frame['bytes'] or sha(data) != frame['sha256']: raise ValueError('asset identity mismatch')
        previous = current
        seen.add(frame['id'])
    if manifest['valid_time_range'] != [manifest['frames'][0]['observed_at'], manifest['frames'][-1]['observed_at']]: raise ValueError('time range mismatch')
    if previous - timestamp(manifest['frames'][0]['observed_at']) > 7260: raise ValueError('sequence duration budget')


def prepare(source_root: Path, out: Path) -> dict:
    from PIL import Image
    source_bytes = (source_root / 'source.json').read_bytes()
    source = json.loads(source_bytes)
    if not 2 <= len(source['frames']) <= MAX_FRAMES: raise ValueError('frame count budget')
    pack_id = 'sdo-aia171-' + sha(source_bytes)[:16]
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='sequence-prepare-', dir=out.parent))
    try:
        asset_dir = temporary / 'textures/solar/sequence' / pack_id
        asset_dir.mkdir(parents=True)
        frames = []
        previous = None
        for index, entry in enumerate(source['frames']):
            data = {}
            for key, budget in [('source', MAX_SOURCE_BYTES), ('metadata', 128 * 1024), ('closest', 65536)]:
                name = entry[key + '_file']
                if not re.fullmatch(r'\d{3}\.(jp2|xml|json)', name): raise ValueError('source path rejected')
                path = source_root / name
                if path.stat().st_size > budget: raise ValueError('source budget exceeded')
                data[key] = path.read_bytes()
                if sha(data[key]) != entry[key + '_sha256']: raise ValueError('source hash mismatch')
            parsed = bind_source_records(entry, data, source['cadence_seconds'])
            with Image.open(io.BytesIO(data['source'])) as image:
                if image.size != (4096, 4096): raise ValueError('unexpected archive geometry')
                image.reduce = 3
                image.load()
                preview = image.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                preview.save(buffer, format='JPEG', quality=88, optimize=False, progressive=False)
            encoded = buffer.getvalue()
            asset_path = f'textures/solar/sequence/{pack_id}/frame-{index:03d}.jpg'
            (temporary / asset_path).write_bytes(encoded)
            current = timestamp(parsed['observed_at'])
            frames.append({'id': 'hv-' + entry['archive_id'], **parsed,
                'source_sha256': entry['source_sha256'], 'metadata_sha256': entry['metadata_sha256'],
                'asset_path': asset_path, 'bytes': len(encoded), 'sha256': sha(encoded),
                'width': 512, 'height': 512, 'coverage_mask_path': None,
                'gap_before_seconds': 0 if previous is None else round(current - previous, 6),
                'source_url': entry['source_url'], 'metadata_url': entry['metadata_url']})
            previous = current
        manifest = {'schema_version': 'solar-observation-sequence.v1', 'id': pack_id,
            'recipe_version': 'helioviewer-jp2-reduce3-jpeg88-v1', 'source_manifest_sha256': sha(source_bytes),
            'mission': 'SDO', 'instrument': 'AIA', 'channel_id': 'aia-171', 'wavelength_angstrom': 171,
            'intensity_kind': 'provider_display', 'intensity_units': 'provider-stretched display values',
            'display_transfer_id': 'provider-jp2-transfer-unqualified', 'calibration_id': None,
            'observer': 'SDO', 'coordinate_system': 'source-image-plane',
            'registration_recipe': 'none-source-facing-only', 'original_time_scale': 'UTC',
            'expected_cadence_seconds': source['cadence_seconds'],
            'valid_time_range': [frames[0]['observed_at'], frames[-1]['observed_at']], 'frames': frames,
            'credits': 'NASA/SDO AIA; ESA/NASA Helioviewer Project; JP2 generation LMSAL',
            'source_urls': ['https://api.helioviewer.org/docs/v2/', 'https://api.helioviewer.org/docs/v2/appendix/data_sources.html'],
            'limitations': ['Archival provider-display sequence; not live and not calibrated radiance.',
                'Provider per-frame intensity transfer is unqualified; quantitative intensity comparison is prohibited.',
                'Original QUALITY flags are retained without scientific acceptance; no temporal interpolation.',
                '512px JPEG preview of provider JP2 values; no false-color lookup added, geometric registration or full-sphere mapping.',
                'WCS records original 4096px source geometry, not a calibrated preview registration.']}
        validate_manifest(manifest, temporary)
        (temporary / 'solar-observation-sequence.v1.json').write_bytes(canonical(manifest))
        if out.exists():
            generated = {p.relative_to(temporary): p.read_bytes() for p in temporary.rglob('*') if p.is_file()}
            existing = {p.relative_to(out): p.read_bytes() for p in out.rglob('*') if p.is_file()}
            if generated != existing: raise ValueError('immutable output differs; choose new destination')
        else:
            temporary.rename(out)
        return manifest
    finally:
        if temporary.exists(): shutil.rmtree(temporary)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--acquire', action='store_true')
    parser.add_argument('--start', default='2024-05-10T16:30:00Z')
    parser.add_argument('--count', type=int, default=31)
    parser.add_argument('--cadence', type=int, default=60)
    args = parser.parse_args()
    try:
        if args.acquire: acquire(args.source_root, args.start, args.count, args.cadence)
        if args.out:
            result = prepare(args.source_root, args.out)
            print(json.dumps({'id': result['id'], 'frames': len(result['frames'])}))
        elif not args.acquire: parser.error('--out or --acquire required')
        return 0
    except (OSError, ValueError, KeyError, ET.ParseError) as error:
        print(f'solar sequence: {error}')
        return 1


if __name__ == '__main__': raise SystemExit(main())
