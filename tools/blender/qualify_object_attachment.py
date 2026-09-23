"""Real shared-root object attachment guard for disk, background and strands."""
import argparse,json,math,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy,numpy as np
from solar_bpy import reference_settings,render_pair
from solar_common import sha256,receipt
p=argparse.ArgumentParser();p.add_argument('--scene',required=True);p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(a.scene).resolve();out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False)
bpy.ops.wm.open_mainfile(filepath=str(source),use_scripts=False);s=bpy.context.scene;reference_settings(s);s.render.resolution_x=s.render.resolution_y=64;s['browser_palette']=False
root=bpy.data.objects.get('SolarRoot')
if root is None:raise ValueError('Scene lacks explicit SolarRoot')
if any(o.parent!=root for o in s.objects if o.type=='MESH'):raise ValueError('Geometry escaped SolarRoot')
camera=bpy.data.objects['front'];s.camera=camera
values={}
for name,rotation,position in [('original',0,(5,0,0)),('object_rotated90',math.pi/2,(5,0,0)),('camera_orbit_minus90',0,(0,-5,0))]:
 root.rotation_euler.z=rotation;camera.location=position;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();pixels,w,h=render_pair(out,name);values[name]=np.array(pixels,dtype=np.float32).reshape(-1,4)
delta=np.abs(values['object_rotated90'][:,:3]-values['camera_orbit_minus90'][:,:3]);change=np.abs(values['object_rotated90'][:,:3]-values['original'][:,:3])
summary=dict(passed=float(delta.mean())<1e-4 and float(change.mean())>1e-3,mean_absolute_equivalent_view_error=float(delta.mean()),max_absolute_equivalent_view_error=float(delta.max()),mean_absolute_rotation_change=float(change.mean()),channel_mae=delta.mean(axis=0).tolist(),scene_sha256=sha256(source),all_geometry_parented=True)
receipt(out,dict(schema='solar-object-attachment-guard.v1',**summary));print(json.dumps(summary))
if not summary['passed']:raise RuntimeError('Canonical object attachment failed')
