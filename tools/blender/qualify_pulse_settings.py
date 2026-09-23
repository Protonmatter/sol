"""Real pulse-field readback plus post-load reference-setting normalization."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import argparse,json
import numpy as np
import bpy
from solar_bpy import setup,camera,render_pair,reference_settings
from volume_atlas import scalar_volume
from solar_common import sha256,receipt
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False)
size=8;np.full(size**3,.4,dtype='<f4').tofile(out/'base.f32');pulse=np.zeros((size**3,4),dtype='<f4');pulse[:]=[.18,0,1800,.4];pulse.tofile(out/'pulse.f32')
entry=dict(path='pulse.f32',bytes=size**3*16,sha256=sha256(out/'pulse.f32'),dimensions=[size]*3,components=4,dtype='float32-le',layout='x-fastest-y-next-z-slowest-RGBA',channels=['arc_length_R','onset_s','duration_s','support_relative'],width_R=.04,speed_R_per_s=.0002,amplitude=.3,window='sin_squared_nonrepeating')
checks=[]
for time_s,expected in [(0,.4),(900,.52),(1800,.4)]:
    s=setup(64,64);s.camera=camera('front',(0,-4,0),2);s['scenario_time_s']=time_s
    scalar_volume(out/'base.f32',size,(-.5,.5),time_s=time_s,pulse_entry=entry,source_root=out)
    pixels,w,h=render_pair(out,'pulse-'+str(time_s));actual=sum(pixels[4*(y*w+x)] for y in range(28,36) for x in range(28,36))/64
    checks.append(dict(time_s=time_s,expected=expected,actual=actual));assert abs(actual-expected)<.003,(actual,expected)
s.render.engine='BLENDER_EEVEE_NEXT';s.view_settings.view_transform='AgX';s.cycles.use_denoising=True;s.view_settings.gamma=2;s.render.use_compositing=True;s.cycles.seed=1
bpy.ops.wm.save_as_mainfile(filepath=str(out/'edited-settings.blend'))
bpy.ops.wm.open_mainfile(filepath=str(out/'edited-settings.blend'),use_scripts=False)
effective=reference_settings(bpy.context.scene);assert effective['engine']=='CYCLES' and effective['view_transform']=='Standard' and not effective['denoising'] and not effective['compositing'] and effective['gamma']==1
bpy.context.scene.render.resolution_x=16384
try:reference_settings(bpy.context.scene)
except ValueError:oversize_rejected=True
else:raise AssertionError('oversized scene admitted')
receipt(out,dict(schema='solar-blender-pulse-settings-test.v1',passed=True,pulse_checks=checks,effective_settings=effective,oversize_rejected=oversize_rejected))
print(json.dumps(checks))
