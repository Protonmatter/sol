"""Independent exhaustive float64 source-footprint check for terrain v2 derivatives.

Reads original source data directly. Does not call the integer derivative generator.
"""
from __future__ import annotations
import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import sys


def validate(source_dir: Path, web_root: Path) -> dict:
    from PIL import Image
    manifest = json.loads((web_root / 'terrain-assets.v1.json').read_text())
    receipt = {'schema_version': 'terrain-detail-source-validation.v1', 'status': 'passed', 'products': []}
    for ref in manifest['references']:
        target = web_root / ref['path']
        raw = target.read_bytes()
        if hashlib.sha256(raw).hexdigest() != ref['sha256']:
            raise ValueError('derivative hash mismatch')
        filename = ref['source_url'].rsplit('/', 1)[1]
        source_raw = (source_dir / filename).read_bytes()
        if hashlib.sha256(source_raw).hexdigest() != ref['source_sha256']:
            raise ValueError('original source hash mismatch')
        if ref['body'] == 'Moon':
            with Image.open(source_dir / filename) as image:
                source = array('H', image.tobytes())
            if sys.byteorder != 'little': source.byteswap()
            scale, offset = .5, -10000.0
        else:
            source = array('h', source_raw)
            if sys.byteorder != 'big': source.byteswap()
            scale, offset = 1.0, 0.0
        output = array('H', raw)
        if sys.byteorder != 'little': output.byteswap()
        width, height = ref['width'], ref['height']
        if len(source) != width * height * 4 or len(output) != width * height:
            raise ValueError('source/output footprint dimensions disagree')
        maximum_error = 0.0
        mismatches = 0
        for y in range(height):
            for x in range(width):
                i = y * 2 * width * 2 + x * 2
                measured = math.fsum(source[j] * scale + offset for j in (i, i + 1, i + width * 2, i + width * 2 + 1)) / 4
                decoded = output[y * width + x] - 32768
                maximum_error = max(maximum_error, abs(decoded - measured))
                mismatches += decoded != math.floor(measured + .5)
        if mismatches or maximum_error > .5:
            raise ValueError(f'footprint mismatch: {mismatches}, error={maximum_error}')
        previous = ref['previousProduct']
        original = (web_root / previous['path']).read_bytes()
        if hashlib.sha256(original).hexdigest() != previous['sha256']:
            raise ValueError('previous terrain asset changed')
        receipt['products'].append({'body': ref['body'], 'source_sha256': ref['source_sha256'], 'derived_sha256': ref['sha256'],
            'checked_cells': len(output), 'source_degrees_per_cell': ref['sourceDegreesPerTexel'],
            'derived_degrees_per_cell': ref['nativeDegreesPerTexel'], 'maximum_added_quantization_error_m': maximum_error,
            'source_height_bounds_km': [ref['sourceMinHeightKm'], ref['sourceMaxHeightKm']],
            'derived_height_bounds_km': [ref['minHeightKm'], ref['maxHeightKm']], 'mismatched_cells': mismatches,
            'previous_asset_hash_preserved': True})
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--web-root', type=Path, default=Path('apps/web'))
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists(): raise ValueError('receipt destination must be new')
    try:
        receipt = validate(args.source_dir, args.web_root)
    except Exception as error:
        receipt = {'schema_version': 'terrain-detail-source-validation.v1', 'status': 'failed', 'error': str(error)}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
    raise SystemExit(0 if receipt['status'] == 'passed' else 1)
