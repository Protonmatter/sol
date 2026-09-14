"""Offline 16-to-8 samples/degree LOLA/MOLA numerical terrain derivative.

Original bytes must already exist in --source-dir. Retains the v1 binaries; writes
new v2 assets and then selects their metadata. No network or runtime dependency.
"""
from __future__ import annotations
import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
from typing import Sequence

ROOT = Path(__file__).resolve().parents[1]
SOURCE_HASHES = {
    'ldem_16_uint.tif': '45a2b32d56e81ed30db07fead8abc842b249b6511219d9ca2c53f81bc2dc5d62',
    'lola-product.html': '74624aa809c59e5f570955256cb7cf6ce781595fe7d0ebe93ef42b3e2fa0486b',
    'megr90n000eb.img': '976cb28c7a6561d1c3f7b4281e035e0c1dd02d387375e4a4aba5010b7064a8d0',
    'megr90n000eb.lbl': '39caa45880c19cb3df1bd8dce0ff33a64d14eee844b03419f84ce30c24d7849c',
    'megr90n000eb.xml': 'eb5df1efd99d8730d78d7aa68900d69b799f7ced8046e4ca55d0793326faa32a',
    'mola-product.html': 'd951dcdd8bbdfbf621e84989c0764e32f73a73903ce23e90d4786a5c9fdfdebe',
}
SOURCE_WIDTH, SOURCE_HEIGHT = 5760, 2880


def block_mean(samples: Sequence[int], width: int, height: int, *, numerator: int, denominator: int, offset: int, nodata: int | None = None) -> bytes:
    """Exact rational mean of each registered 2x2 footprint, half-up metre rounding.

The source cells are equally weighted; this is explicitly not a spherical-area or
shot-count weighted average. Unknown source cells fail the complete-grid route.
"""
    if type(width) is not int or type(height) is not int or min(width, height) < 2 or width % 2 or height % 2 or len(samples) != width * height:
        raise ValueError('invalid even source grid dimensions')
    if type(numerator) is not int or type(denominator) is not int or numerator <= 0 or denominator <= 0 or type(offset) is not int:
        raise ValueError('invalid rational sample scaling')
    result = bytearray(width * height // 2)
    cursor = 0
    for y in range(0, height, 2):
        for x in range(0, width, 2):
            index = y * width + x
            values = [samples[index], samples[index + 1], samples[index + width], samples[index + width + 1]]
            if any(type(v) is not int or v == nodata for v in values):
                raise ValueError('unavailable source cell cannot form qualified terrain')
            divisor = 4 * denominator
            scaled_sum = sum(values) * numerator + (offset + 32768) * divisor
            code = (2 * scaled_sum + divisor) // (2 * divisor)
            if not 0 <= code < 65535:
                raise ValueError('terrain sample outside supported range')
            struct.pack_into('<H', result, cursor, code)
            cursor += 2
    return bytes(result)


def prepare(source_dir: Path, web_root: Path) -> dict:
    from PIL import Image
    # Validate all original/metadata identities before any derivative is selected.
    for name, digest in SOURCE_HASHES.items():
        with (source_dir / name).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
                raise ValueError(f'source SHA-256 mismatch: {name}')
    baseline = json.loads((ROOT / 'docs/plans/2026-09-14-rendering-qualification/TERRAIN_BASELINE_V1.json').read_text())
    references = []
    destination = web_root / 'textures/terrain'
    destination.mkdir(parents=True, exist_ok=True)
    for prior in baseline['references']:
        body = prior['body']
        ref = dict(prior)
        if body == 'Moon':
            filename = 'ldem_16_uint.tif'
            with Image.open(source_dir / filename) as image:
                if image.size != (SOURCE_WIDTH, SOURCE_HEIGHT) or image.mode != 'I;16' or image.tag_v2.get(42113) is not None:
                    raise ValueError('unsupported LOLA dimension, encoding or no-data declaration')
                samples = array('H', image.tobytes())
                if sys.byteorder != 'little':
                    samples.byteswap()
            numerator, denominator, offset = 1, 2, -10000
            metadata = ['lola-product.html']
            ref['source_url'] = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/' + filename
            source_limits = 'LOLA source-team global gridded data from spring 2019; interpolation remains source-team processing. No source shot-count mask is present in the TIFF.'
        else:
            filename = 'megr90n000eb.img'
            samples = array('h', (source_dir / filename).read_bytes())
            if sys.byteorder != 'big':
                samples.byteswap()
            numerator, denominator, offset = 1, 1, 0
            metadata = ['megr90n000eb.lbl', 'megr90n000eb.xml', 'mola-product.html']
            base = 'https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/'
            ref['source_url'] = base + filename
            ref['metadata_urls'] = ['https://pds-geosciences.wustl.edu/missions/mgs/megdr.html', base + 'megr90n000eb.lbl', base + 'megr90n000eb.xml']
            source_limits = 'MOLA mean radius, not areoid topography; source label supplies interpolated bins where shots are absent, about 55 percent of equatorial bins contain a shot. Original PDS3 map resolution is authoritative: PDS4 cartography scale/resolution fields are transposed; array dimensions and physical value_offset agree.'
        raw = block_mean(samples, SOURCE_WIDTH, SOURCE_HEIGHT, numerator=numerator, denominator=denominator, offset=offset)
        source_min = (min(samples) * numerator / denominator + offset) / 1000
        source_max = (max(samples) * numerator / denominator + offset) / 1000
        del samples
        codes = array('H', raw)
        if sys.byteorder != 'little':
            codes.byteswap()
        minimum, maximum = (min(codes) - 32768) / 1000, (max(codes) - 32768) / 1000
        name = f'{body.lower()}-radial-height-v2.u16.bin'
        target = destination / name
        if target.exists() and target.read_bytes() != raw:
            raise ValueError(f'immutable derivative already exists with different bytes: {name}')
        target.write_bytes(raw)
        ref.update({
            'id': f'{body.lower()}-radial-height-v2', 'path': f'textures/terrain/{name}',
            'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'width': 2880, 'height': 1440,
            'minHeightKm': minimum, 'maxHeightKm': maximum,
            'minRadiusKm': prior['referenceRadiusKm'] + minimum, 'maxRadiusKm': prior['referenceRadiusKm'] + maximum,
            'nativeDegreesPerTexel': .125, 'nativeEquatorialKmPerTexel': prior['referenceRadiusKm'] * math.pi / 1440,
            'sourceDegreesPerTexel': .0625, 'sourceMinHeightKm': source_min, 'sourceMaxHeightKm': source_max,
            'source_sha256': SOURCE_HASHES[filename], 'source_bytes': (source_dir / filename).stat().st_size,
            'source_retrieved_at': '2026-09-14', 'metadata_sha256': {name: SOURCE_HASHES[name] for name in metadata},
            'previousProduct': {key: prior[key] for key in ('id', 'path', 'sha256', 'bytes')},
            'derivation': 'prepare_terrain_detail.py v1; exact equally weighted 2x2 source-cell means at 0.125 degree centered footprints from 0.0625 degree numerical source cells, rational arithmetic, half-up rounding to integer metres; maximum added quantization error 0.5m; no upsampling or color inference',
            'limitations': source_limits + ' The 8-sample/degree derivative retains less detail than the 16-sample/degree source. Grid spacing is not observation accuracy; finite 64-step directional shadows can undersample long grazing paths. No tiled terrain or finite-Sun penumbra qualification.',
        })
        references.append(ref)
    manifest = {'schema_version': 'terrain-assets.v1', 'references': references}
    (web_root / 'terrain-assets.v1.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    module = web_root / 'js/terrainAssets.js'
    text = module.read_text(encoding='utf-8')
    start, end = '// BEGIN GENERATED TERRAIN REFERENCES', '// END GENERATED TERRAIN REFERENCES'
    prefix, rest = text.split(start)
    _, suffix = rest.split(end)
    module.write_text(prefix + start + '\nconst REFERENCES = ' + json.dumps(references, indent=2) + ';\n' + end + suffix, encoding='utf-8', newline='\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--web-root', type=Path, default=ROOT / 'apps/web')
    args = parser.parse_args()
    manifest = prepare(args.source_dir, args.web_root)
    print(json.dumps({'products': len(manifest['references']), 'bytes': sum(r['bytes'] for r in manifest['references'])}))
