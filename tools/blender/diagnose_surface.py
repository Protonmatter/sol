"""Emission-only source/sampling/attachment diagnostics; no model alteration."""
import argparse,json,math,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy,numpy as np
from mathutils import Vector
from solar_bpy import reference_settings
from solar_common import sha256,receipt
p=argparse.ArgumentParser();p.add_argument('--scene',required=True);p.add_argument('--surface',required=True);p.add_argument('--out',required=True);p.add_argument('--override-surface',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False);source=Path(a.scene).resolve();raster=Path(a.surface).resolve()
bpy.ops.wm.open_mainfile(filepath=str(source),use_scripts=False);s=bpy.context.scene;reference_settings(s);s.cycles.samples=64;s['browser_palette']=False
for obj in s.objects:
 if obj.type not in ['CAMERA'] and obj.name!='Photosphere':obj.hide_render=True
sphere=bpy.data.objects['Photosphere'];s.render.use_compositing=False
field=np.frombuffer(raster.read_bytes(),dtype='<f4').reshape(1024,2048);snapshots={};stats={}
if a.override_surface:
 image=bpy.data.images.new('ExplicitDiagnosticSurfaceOverride',width=2048,height=1024,float_buffer=True);image.colorspace_settings.name='Non-Color';rgba=np.ones((1024,2048,4),dtype=np.float32);rgba[:,:,:3]=field[:,:,None];image.pixels.foreach_set(rgba.ravel())
 changed=0
 for material in bpy.data.materials:
  if not material.use_nodes:continue
  for node in material.node_tree.nodes:
   if node.type=='TEX_IMAGE' and node.image and node.image.name=='SharedSurfaceEmissivity':node.image=image;changed+=1
 if changed!=1:raise ValueError('Expected exactly one surface image for diagnostic override')

def save_array(values,path,png=False):
 values=np.asarray(values,dtype=np.float32);h,w=values.shape[:2];rgba=np.ones((h,w,4),dtype=np.float32)
 rgba[:,:,:3]=values[:,:,None] if values.ndim==2 else values
 im=bpy.data.images.new(path.stem,width=w,height=h,float_buffer=True);im.pixels.foreach_set(rgba.ravel());s.render.image_settings.file_format='PNG' if png else 'OPEN_EXR';s.render.image_settings.color_depth='8' if png else '32';s.view_settings.exposure=0;im.save_render(str(path),scene=s);bpy.data.images.remove(im)
def palette(x):
 def smooth(lo,hi):
  t=np.clip((x-lo)/(hi-lo),0,1);return (t*t*(3-2*t))[...,None]
 t=smooth(.08,1.3);h=(1-t)*np.array([1,.24,.012])+t*np.array([1,.72,.2]);t=smooth(2,8);return ((1-t)*h+t*np.array([1,.94,.67]))*np.maximum(x,0)[...,None]
def displays(values,label):
 save_array(values,out/(label+'-scalar.exr'))
 for ev in [0,-2,-4]:
  save_array(values*2.**ev,out/(label+f'-raw-ev{ev}.png'),True)
  rgb=palette(3.2*values)*2.**ev;save_array(rgb/(1+rgb),out/(label+f'-palette-ev{ev}.png'),True)
def render(name,camera,size=512):
 s.camera=bpy.data.objects[camera];s.render.resolution_x=s.render.resolution_y=size;s.render.image_settings.file_format='OPEN_EXR';s.render.image_settings.color_depth='32';s.render.filepath=str(out/(name+'-transfer.exr'));bpy.ops.render.render(write_still=True)
 im=bpy.data.images.load(s.render.filepath,check_existing=False);data=np.array(im.pixels,dtype=np.float32).reshape(size,size,4);bpy.data.images.remove(im);scalar=data[:,:,1];snapshots[name]=scalar;displays(scalar,name)
 stats[name]=dict(min=float(scalar.min()),max=float(scalar.max()),unclipped=True,camera_position=list(s.camera.location),camera_rotation_euler=list(s.camera.rotation_euler),size=size,object_rotation=list(sphere.rotation_euler))
 return scalar
def project(camera,size=512):
 s.camera=bpy.data.objects[camera];bpy.context.view_layer.update();m=np.array(s.camera.matrix_world);axis=(np.arange(size)+.5)/size*s.camera.data.ortho_scale-s.camera.data.ortho_scale/2;u,v=np.meshgrid(axis,axis);origin=m[:3,3]+u[:,:,None]*m[:3,0]+v[:,:,None]*m[:3,1];direction=-m[:3,2];b=np.sum(origin*direction,axis=2);disc=b*b-np.sum(origin*origin,axis=2)+1;mask=disc>=0;point=origin+(-b-np.sqrt(np.maximum(disc,0)))[:,:,None]*direction
 lon=np.mod(np.arctan2(point[:,:,1],point[:,:,0])/(2*np.pi),1);lat=np.arcsin(np.clip(point[:,:,2],-1,1))/np.pi+.5
 x=lon*2048-.5;y=np.clip(lat*1024-.5,0,1023);xi=np.floor(x).astype(int);yi=np.floor(y).astype(int);fx=x-xi;fy=y-yi
 sample=(1-fy)*((1-fx)*field[yi,xi%2048]+fx*field[yi,(xi+1)%2048])+fy*((1-fx)*field[np.minimum(yi+1,1023),xi%2048]+fx*field[np.minimum(yi+1,1023),(xi+1)%2048]);sample[~mask]=0
 return sample
# Independent projection has no Blender geometry, shader, lighting or volume evaluation.
for view in ['front','limb','back','north']:
 values=project(view);displays(values,'cpu-'+view);render('disk-'+view,view)
native=snapshots['disk-front'];large=render('disk-front-1024','front',1024);down=large.reshape(512,2,512,2).mean(axis=(1,3));displays(down,'disk-front-1024-area-downsample');mask=native>0
stats['resolution_compare']=dict(mean_abs=float(np.mean(np.abs(down[mask]-native[mask]))),max_abs=float(np.max(np.abs(down[mask]-native[mask]))),operation='2x2 area integration from twice-resolution render; original native and float retained')
sphere.rotation_euler.z=math.pi/2;rotated=render('object-rotated90','front');sphere.rotation_euler.z=0
cam=bpy.data.objects['front'];old=cam.location.copy();old_rot=cam.rotation_euler.copy();cam.location=(0,-5,0);cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();orbited=render('camera-orbit-minus90','front');cam.location=old;cam.rotation_euler=old_rot
stats['attachment']=dict(object_rotation_vs_original_mae=float(np.mean(np.abs(rotated-native))),equivalent_object_rotation_vs_camera_orbit_mae=float(np.mean(np.abs(rotated-orbited))),expected='Object +90Z, fixed camera must match inverse camera -90Z with fixed object')
# Global raw raster and a fixed-amplitude fine-field residual, without smoothing.
save_array(field,out/'source-raster.exr');save_array(field/4,out/'source-raster-quarter-scale.png',True)
receipt(out,dict(schema='solar-surface-diagnostic.v1',scene_sha256=sha256(source),raster_sha256=sha256(raster),surface_override=bool(a.override_surface),no_volume=True,no_glare=True,no_denoise=True,stats=stats))
print(json.dumps(stats['attachment']))
