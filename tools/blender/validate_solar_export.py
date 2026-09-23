"""Validate every authoring receipt artifact hash and confined path."""
import argparse,json
from pathlib import Path
from solar_common import checked_file
p=argparse.ArgumentParser(); p.add_argument('--root',required=True); a=p.parse_args(); root=Path(a.root).resolve(); data=json.loads((root/'receipt.json').read_text(encoding='utf-8'))
for item in data['files']:
    path=checked_file(root,item['path'],item['sha256'])
    if path.stat().st_size != item['bytes']: raise ValueError('artifact length mismatch')
if data.get('passed') is False: raise ValueError('reference qualification failed')
print(f"Validated {len(data['files'])} artifact hashes")
