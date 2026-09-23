"""Render fixed descriptor time and explicitly named camera to EXR and PNG."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import argparse,time,math
import bpy
from solar_bpy import render_pair,emission,reference_settings
from solar_common import sha256,receipt,rgb_statistics
source_snapshot={f.name:f.read_bytes() for f in Path(__file__).parent.glob('*.py')}
p=argparse.ArgumentParser(); p.add_argument('--scene',required=True); p.add_argument('--out',required=True); p.add_argument('--camera',choices=['front','limb','back','north','south','closeup','all'],default='all'); p.add_argument('--time-seconds',type=float); p.add_argument('--device',choices=['CPU'],default='CPU'); p.add_argument('--disable-pulse',action='store_true'); p.add_argument('--view-mode',choices=['continuum','corona-diagnostic'],default='continuum')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]); path=Path(a.scene).resolve(); out=Path(a.out).resolve()
bpy.ops.wm.open_mainfile(filepath=str(path),use_scripts=False); s=bpy.context.scene
if a.time_seconds is not None and a.time_seconds != s['scenario_time_s']: raise ValueError('Time must match packet; regenerate packet to seek')
if a.disable_pulse:
    if s.get('gaussian_segment_count',0):
        disabled=0
        for material in bpy.data.materials:
            if not material.use_nodes:continue
            for node in material.node_tree.nodes:
                if not node.name.startswith('GaussianPulseGain'):continue
                if node.inputs[1].is_linked:material.node_tree.links.remove(node.inputs[1].links[0])
                node.inputs[1].default_value=0;disabled+=1
        s['pulse_diagnostic_override']=f'{disabled} Gaussian pulse branches disabled; background and surface identical'
    else:
        material=bpy.data.materials['SharedScalarEmissivityVolume'];nodes=material.node_tree.nodes
        emission_node=next(n for n in nodes if n.type=='EMISSION')
        gain=emission_node.inputs['Strength'].links[0].from_node
        composition=gain.inputs[0].links[0].from_node
        if composition.type!='MATH' or composition.operation!='ADD' or not composition.inputs[1].is_linked:raise ValueError('unexpected pulse composition; cannot disable safely')
        material.node_tree.links.remove(composition.inputs[1].links[0]);composition.inputs[1].default_value=0
        s['pulse_diagnostic_override']='local voxel pulse disabled; background and surface identical'
effective=reference_settings(s,4 if a.view_mode=='corona-diagnostic' else 0)
out.mkdir(parents=True,exist_ok=False)
(out/'render-source').mkdir()
for filename,data in source_snapshot.items():(out/'render-source'/filename).write_bytes(data)
if a.view_mode=='corona-diagnostic':
    obj=bpy.data.objects['Photosphere']; obj.data.materials.clear(); obj.data.materials.append(emission('OpaqueOcculter',strength=0))
    s.view_settings.exposure=4
s.cycles.device='CPU'; t=time.perf_counter(); stats={}
for name in (['front','limb','back','north'] if a.camera=='all' else [a.camera]):
    s.camera=bpy.data.objects[name]; pixels,w,h=render_pair(out,name)
    stats[name]=dict(width=w,height=h,**rgb_statistics(pixels),camera_position=list(s.camera.location),camera_rotation_euler=list(s.camera.rotation_euler),projection=s.camera.data.type,clip_start=s.camera.data.clip_start,clip_end=s.camera.data.clip_end,ortho_scale=s.camera.data.ortho_scale)
receipt(out,dict(schema='solar-blender-render.v1',scene_sha256=sha256(path),blender=bpy.app.version_string,build_hash=bpy.app.build_hash.decode(),effective_settings=effective,pulse_disabled=bool(a.disable_pulse),engine=s.render.engine,device=s.cycles.device,samples=s.cycles.samples,denoising=s.cycles.use_denoising,recipe_hash=s.get('recipe_hash'),camera_frame=s.get('camera_frame','Carrington corotating fixed camera'),gaussian_segment_count=s.get('gaussian_segment_count',0),manifest_sha256=s.get('manifest_sha256'),elapsed_s=time.perf_counter()-t,time_s=s['scenario_time_s'],linear_space='scene-linear Rec.709 EXR',display_transform=(s.get('palette_recipe','Browser palette(surface*3.2)+palette(emission*40); Reinhard then sRGB; exposure0') if s.get('browser_palette') else f'Standard sRGB exposure {s.view_settings.exposure}'),transfer_schema=s.get('transfer_schema','legacy'),transfer_channels=(('R=integrated corona; G=surface relative; B=disk mask' if s.get('transfer_schema')=='solar-transfer-v2-corona-surface-mask' else 'R=surface relative; G=integrated emission; B=0') if s.get('browser_palette') else 'linear RGB'),source_sha256={name:__import__('hashlib').sha256(data).hexdigest() for name,data in source_snapshot.items()},view_mode=a.view_mode,views=stats))
