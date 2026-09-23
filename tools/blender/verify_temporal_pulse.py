"""Isolate the local pulse from same-time, same-camera real Cycles controls."""
import sys,argparse,json
from pathlib import Path
import bpy,numpy as np
p=argparse.ArgumentParser();p.add_argument('--root',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(a.root).resolve()
def read(path):
 im=bpy.data.images.load(str(path),check_existing=False);data=np.array(im.pixels,dtype=np.float32).reshape(-1,4);size=tuple(im.size);bpy.data.images.remove(im);return data,size
active,size=read(root/'views/front-transfer.exr');control,_=read(root/'no-pulse-control/front-transfer.exr');metadata=json.loads((root/'views/receipt.json').read_text());v2=metadata.get('transfer_schema')=='solar-transfer-v2-corona-surface-mask';emission_channel=0 if v2 else 1;surface_channel=1 if v2 else 0;delta=active[:,emission_channel]-control[:,emission_channel];threshold=2e-6
summary=dict(max_local_emission=float(delta.max()),min_delta=float(delta.min()),fraction_pixels_above_2e_6=float(np.mean(delta>threshold)),surface_max_abs_difference=float(np.max(np.abs(active[:,surface_channel]-control[:,surface_channel]))),time_s=900,comparison='same saved scene, camera, time and seed; analytic pulse branch disabled in control')
summary['passed']=summary['max_local_emission']>1e-5 and summary['min_delta']>-2e-5 and 0<summary['fraction_pixels_above_2e_6']<.5 and summary['surface_max_abs_difference']<1e-6
s=bpy.context.scene;s.view_settings.view_transform='Standard';s.view_settings.look='None';s.view_settings.exposure=0;s.view_settings.gamma=1
im=bpy.data.images.new('Local pulse difference',width=size[0],height=size[1],float_buffer=True);rgba=np.ones_like(active);rgba[:,:3]=np.maximum(delta[:,None],0);im.pixels.foreach_set(rgba.ravel());s.render.image_settings.file_format='OPEN_EXR';s.render.image_settings.color_depth='32';im.save_render(str(root/'pulse-only.exr'),scene=s)
rgba[:,:3]*=1/max(summary['max_local_emission'],1e-12);im.pixels.foreach_set(rgba.ravel());s.render.image_settings.file_format='PNG';s.render.image_settings.color_depth='8';im.save_render(str(root/'pulse-only-normalized.png'),scene=s)
(root/'pulse-locality-check.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
if not summary['passed']:raise RuntimeError('Pulse locality check failed')
