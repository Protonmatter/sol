"""Export shared strand attributes in float32 little endian with a hashed manifest."""
import argparse,json,struct,shutil
from pathlib import Path
from solar_common import load_packet,sha256,receipt
p=argparse.ArgumentParser(); p.add_argument('--packet',required=True); p.add_argument('--out',required=True); a=p.parse_args(); packet_path=Path(a.packet).resolve(); packet=load_packet(packet_path); out=Path(a.out).resolve(); out.mkdir(parents=True,exist_ok=False)
records=[]; offset=0
with (out/'strand-points.f32le').open('wb') as f:
    for strand in packet['strands']:
        for point in strand['points']: f.write(struct.pack('<5f',*point,strand['emission_relative']))
        records.append(dict(id=strand['id'],offset_points=offset,count=len(strand['points']),classification=strand['classification']))
        offset+=len(strand['points'])
(out/'strands.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
receipt(out,dict(schema='solar-strand-export.v1',packet_sha256=sha256(packet_path),encoding='float32 little-endian',stride_bytes=20,fields=['x_R','y_R','z_R','radius_R','emission_relative_per_R'],count=offset,coordinates=packet['frame'],radius_m=695700000,source_label='illustrative PFSS reduced atmosphere'))
