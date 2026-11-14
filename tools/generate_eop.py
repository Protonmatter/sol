#!/usr/bin/env python3
"""Reproduce/check the bundled daily IERS EOP table offline, without dependencies."""
from __future__ import annotations

import argparse
from bisect import bisect_right
from dataclasses import dataclass
import datetime as dt
from email.utils import parsedate_to_datetime
import hashlib
import json
import logging
import math
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'tools/ephemeris-data/eop-sources.json'
DIRECTORY = 'tests/fixtures/iers-eop-20261104'
FILES = {'finals2000A.all', 'readme.finals2000A', 'checksums-before.sha512',
         'checksums-after.sha512', 'plan.json', 'acquisition.json'}
MAGIC = b'SOLEOP01'
HEADER = struct.Struct('<8sIi')
RECORD = struct.Struct('<ddddB')
MJD_ZERO = dt.date(1858, 11, 17).toordinal()
NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)')
LOGGER = logging.getLogger(__name__)
BINARY_LAYOUT = {'magic': 'SOLEOP01', 'header': '8s,u32count,i32start_mjd little endian',
    'row': 'xp,yp,dut1,dut1_formal_error as four little-endian binary64; one byte PM/UT1 prediction flags',
    'row_bytes': 33}
SELECTION = 'Bulletin A xp, yp, UT1-UTC, reported DUT1 formal error and PM/UT1 I/P flags; no Bulletin B splice or celestial-pole offsets'
ORIGIN = 'https://maia.usno.navy.mil/ser7/'
ACQUISITION_FILES = [
    {'local': 'checksums-before.sha512', 'upstream': 'checksums.sha512', 'maximum_bytes': 10000},
    {'local': 'readme.finals2000A', 'upstream': 'readme.finals2000A', 'maximum_bytes': 10000},
    {'local': 'finals2000A.all', 'upstream': 'finals2000A.all', 'maximum_bytes': 5 * 1024 * 1024},
    {'local': 'checksums-after.sha512', 'upstream': 'checksums.sha512', 'maximum_bytes': 10000},
]


@dataclass(frozen=True)
class Row:
    mjd: int
    xp: float
    yp: float
    dut1: float
    error: float
    flags: int


def leap_steps(source: str) -> tuple[tuple[int, int], ...]:
    matches = re.findall(r'const LEAPS: \[\(i32, u8, u8, f64\); (\d+)\] = \[(.*?)\];', source, re.S)
    if len(matches) != 1:
        raise ValueError('owning leap table declaration is unavailable')
    count, body = matches[0]
    pattern = r'\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2}),\s*(\d+)\.0\),'
    entries = re.findall(pattern, body)
    if len(entries) != int(count) or not 2 <= len(entries) <= 128 or re.sub(pattern, '', body).strip():
        raise ValueError('owning leap table is not a complete static literal matrix')
    result = []
    for year, month, day, offset in entries:
        date = dt.date(int(year), int(month), int(day)); step = date.toordinal() - MJD_ZERO, int(offset)
        if (date.month, date.day) not in ((1, 1), (7, 1)) or not 0 <= step[1] <= 100:
            raise ValueError('invalid leap boundary')
        if result and (step[0] <= result[-1][0] or abs(step[1] - result[-1][1]) != 1):
            raise ValueError('leap steps must be ordered single-second changes')
        result.append(step)
    if result[0] != (41317, 10):
        raise ValueError('stepwise UTC era start differs')
    return tuple(result)


def _number(field: str) -> float:
    token = field.strip()
    if not NUMBER.fullmatch(token):
        raise ValueError('invalid fixed-width EOP numeric token')
    value = float(token)
    if not math.isfinite(value):
        raise ValueError('non-finite EOP quantity')
    return value


def _valid(row: Row) -> None:
    values = row.xp, row.yp, row.dut1, row.error
    if type(row.mjd) is not int or not all(type(value) is float and math.isfinite(value) for value in values) \
            or abs(row.xp) > 2 or abs(row.yp) > 2 or abs(row.dut1) > 0.9 or not 0 <= row.error <= 0.9 \
            or type(row.flags) is not int or not 0 <= row.flags <= 3:
        raise ValueError('EOP row is outside admitted domains')


def parse_rows(raw: bytes, leaps: tuple[tuple[int, int], ...]) -> tuple[tuple[Row, ...], int]:
    if not raw or len(raw) > 5 * 1024 * 1024:
        raise ValueError('EOP source byte bound exceeded')
    text = raw.decode('ascii'); result = []; tail = 0; previous_mjd = None; predicted = 0
    leap_days = tuple(row[0] for row in leaps)
    def offset(mjd: int) -> int:
        index = bisect_right(leap_days, mjd) - 1
        if index < 0:
            raise ValueError('EOP input precedes stepwise UTC')
        return leaps[index][1]
    for line in text.splitlines():
        if len(line) < 185 or len(line) > 200 or line[185:].strip() \
                or any(line[index] != ' ' for index in (6, 15, 17, 36, 55, 56, 78)):
            raise ValueError('EOP fixed-width layout differs')
        mjd_value = _number(line[7:15]); mjd = int(mjd_value)
        if mjd != mjd_value:
            raise ValueError('daily EOP epoch must be integral MJD')
        year = int(line[:2]) + (1900 if mjd <= 51543 else 2000)
        date = dt.date(year, int(line[2:4]), int(line[4:6]))
        if date.toordinal() - MJD_ZERO != mjd or previous_mjd is not None and mjd != previous_mjd + 1:
            raise ValueError('EOP date/MJD/order/daily cadence differs')
        previous_mjd = mjd
        flags = line[16], line[57]
        if flags == (' ', ' ') and not line[18:78].strip():
            tail += 1; continue
        if tail or any(flag not in ('I', 'P') for flag in flags):
            raise ValueError('EOP data is partial, unlabelled or resumes after the empty tail')
        row = Row(mjd, _number(line[18:27]), _number(line[37:46]), _number(line[58:68]),
                  _number(line[68:78]), int(flags[0] == 'P') | (int(flags[1] == 'P') << 1))
        _valid(row)
        if predicted & ~row.flags:
            raise ValueError('predicted EOP series reverts to observations')
        predicted |= row.flags
        if result:
            jump = offset(row.mjd) - offset(result[-1].mjd)
            if abs(row.dut1 - result[-1].dut1 - jump) > 0.1:
                raise ValueError('DUT1 discontinuity disagrees with the owning leap table')
        result.append(row)
    if len(result) < 4:
        raise ValueError('at least four complete daily EOP rows required')
    return tuple(result), tail


def serialize_rows(rows: tuple[Row, ...]) -> bytes:
    if not 4 <= len(rows) <= 100_000:
        raise ValueError('EOP row count is outside bounds')
    for index, row in enumerate(rows):
        _valid(row)
        if row.mjd != rows[0].mjd + index:
            raise ValueError('EOP rows are not contiguous')
    return HEADER.pack(MAGIC, len(rows), rows[0].mjd) + b''.join(
        RECORD.pack(row.xp, row.yp, row.dut1, row.error, row.flags) for row in rows)


def _unique(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate EOP metadata key')
        result[key] = value
    return result


def _recorded_utc(value: str) -> dt.datetime:
    if not isinstance(value, str):
        raise ValueError('recorded EOP time is missing')
    stamp = dt.datetime.fromisoformat(value)
    if stamp.tzinfo is None or stamp.utcoffset() != dt.timedelta(0):
        raise ValueError('recorded EOP time must be UTC')
    return stamp


def _file(root: Path, name: str, maximum: int) -> bytes:
    path = root / name
    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root.resolve()) \
            or path.stat().st_size > maximum:
        raise ValueError('EOP input path or size is unsafe')
    with path.open('rb') as stream:
        raw = stream.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError('EOP input grew beyond bound')
    return raw


def load_inputs(root: Path = ROOT) -> tuple[dict, tuple[Row, ...], bytes]:
    manifest = json.loads(_file(root, MANIFEST, 20_000), object_pairs_hook=_unique)
    if set(manifest) != {'schema_version', 'source_directory', 'source_url', 'captured_at_utc',
                         'files', 'source_sha512', 'selection', 'expected', 'binary'} \
            or manifest['schema_version'] != 'earth-orientation-source.v1' or manifest['source_directory'] != DIRECTORY \
            or set(manifest['files']) != FILES or manifest['selection'] != SELECTION \
            or manifest['source_url'] != 'https://maia.usno.navy.mil/ser7/finals2000A.all' \
            or any(manifest['binary'].get(key) != value for key, value in BINARY_LAYOUT.items()):
        raise ValueError('unsupported EOP source manifest')
    inputs = {}
    for name in sorted(FILES):
        record = manifest['files'][name]; raw = _file(root, DIRECTORY + '/' + name, 5 * 1024 * 1024)
        if type(record['bytes']) is not int or len(raw) != record['bytes'] \
                or hashlib.sha256(raw).hexdigest() != record['sha256']:
            raise ValueError('EOP source byte identity differs')
        inputs[name] = raw
    if inputs['checksums-before.sha512'] != inputs['checksums-after.sha512']:
        raise ValueError('EOP acquisition checksum changed')
    wanted = [line.split()[0] for line in inputs['checksums-before.sha512'].decode('ascii').splitlines()
              if len(line.split()) == 2 and line.split()[1] == 'finals2000A.all']
    source_sha512 = hashlib.sha512(inputs['finals2000A.all']).hexdigest()
    if wanted != [source_sha512] or source_sha512 != manifest['source_sha512']:
        raise ValueError('published EOP SHA-512 differs')
    plan = json.loads(inputs['plan.json'], object_pairs_hook=_unique)
    acquisition = json.loads(inputs['acquisition.json'], object_pairs_hook=_unique)
    if plan['schema_version'] != 'eop-history-source-research.v1' or plan['origin'] != ORIGIN \
            or plan['files'] != ACQUISITION_FILES \
            or plan['limits'] != {'attempts_per_file': 1, 'timeout_seconds': 30, 'redirects': 'rejected'} \
            or plan['published_all_sha512_observed'] != source_sha512 \
            or acquisition['schema_version'] != 'eop-source-acquisition.v1' \
            or acquisition['plan_sha256'] != hashlib.sha256(inputs['plan.json']).hexdigest() \
            or [record['path'] for record in acquisition['files']] != [item['local'] for item in ACQUISITION_FILES]:
        raise ValueError('EOP frozen acquisition plan/origin/inventory differs')
    began = _recorded_utc(acquisition['started_at_utc']); finished = _recorded_utc(acquisition['finished_at_utc'])
    if not _recorded_utc(plan['frozen_at_utc']) <= began <= finished:
        raise ValueError('EOP acquisition chronology differs')
    previous = began
    for item, record in zip(ACQUISITION_FILES, acquisition['files'], strict=True):
        raw = inputs[item['local']]; stamp = _recorded_utc(record['retrieved_at_utc'])
        modified = parsedate_to_datetime(record['last_modified'])
        if record['url'] != ORIGIN + item['upstream'] or not previous <= stamp <= finished \
                or modified.tzinfo is None or modified > stamp \
                or record['sha512'] != hashlib.sha512(raw).hexdigest():
            raise ValueError('EOP acquired URL/digest/time association differs')
        previous = stamp
    acquired = {record['path']: record for record in acquisition['files']}
    if acquisition['complete'] is not True or acquisition['all_sha512_verified'] != source_sha512 \
            or len(acquired) != len(acquisition['files']) or len(acquired) != 4 \
            or acquired['finals2000A.all']['url'] != manifest['source_url'] \
            or acquired['finals2000A.all']['retrieved_at_utc'] != manifest['captured_at_utc'] \
            or any(name not in inputs or record['bytes'] != len(inputs[name])
                   or record['sha256'] != hashlib.sha256(inputs[name]).hexdigest()
                   for name, record in acquired.items()):
        raise ValueError('EOP acquisition/source correspondence differs')
    leaps = leap_steps(_file(root, 'crates/solar-ephemeris/src/timescales.rs', 50_000).decode('utf-8'))
    rows, tail = parse_rows(inputs['finals2000A.all'], leaps)
    observed = [row for row in rows if row.flags == 0]
    expected = dict(complete_rows=len(rows), empty_tail_rows=tail, start_mjd=rows[0].mjd,
                    observed_end_mjd=observed[-1].mjd if observed else None, prediction_end_mjd=rows[-1].mjd)
    if expected != manifest['expected']:
        raise ValueError('EOP source coverage/count/quality identity differs')
    blob = serialize_rows(rows)
    if manifest['binary']['path'] != 'crates/solar-ephemeris/data/earth-orientation.bin' \
            or manifest['binary']['row_bytes'] != RECORD.size or manifest['binary']['bytes'] != len(blob) \
            or manifest['binary']['sha256'] != hashlib.sha256(blob).hexdigest():
        raise ValueError('EOP serialization identity differs')
    return manifest, rows, blob


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='read-only comparison with the bundled table')
    mode.add_argument('--out-dir', type=Path, help='fresh output directory under build/; never overwrites the runtime')
    args = parser.parse_args()
    try:
        manifest, rows, blob = load_inputs()
        if args.check:
            if _file(ROOT, manifest['binary']['path'], 4_000_000) != blob:
                raise ValueError('bundled EOP table differs from admitted source')
        else:
            output = args.out_dir.resolve(); build = ROOT / 'build'
            if output == build or not output.is_relative_to(build) or output.exists() \
                    or build.resolve() != build or output != args.out_dir.absolute():
                raise ValueError('EOP output requires a fresh unredirected directory under build/')
            output.mkdir(parents=True)
            with (output / 'earth-orientation.bin').open('xb') as stream:
                stream.write(blob)
            report = {'schema_version': 'earth-orientation-rebuild.v1', 'rows': len(rows),
                'source_sha256': manifest['files']['finals2000A.all']['sha256'],
                'generator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'manifest_sha256': hashlib.sha256((ROOT / MANIFEST).read_bytes()).hexdigest(),
                'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}
            with (output / 'report.json').open('x', encoding='utf-8') as stream:
                json.dump(report, stream, indent=2, allow_nan=False); stream.write('\n')
        LOGGER.info('EOP source/table correspondence passed: %d rows, %d bytes', len(rows), len(blob))
        return 0
    except (OSError, ValueError, KeyError, TypeError, struct.error) as error:
        LOGGER.error('%s', error)
        return 1


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    raise SystemExit(main())
