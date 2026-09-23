"""Shared bpy constructors for CPU Cycles reference scenes."""
import bpy
import math
from mathutils import Vector

def setup(size=256, samples=32):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    s=bpy.context.scene
    s.render.engine='CYCLES'; s.cycles.device='CPU'; s.cycles.samples=samples
    s.cycles.seed=1729; s.cycles.use_denoising=False
    s.cycles.volume_step_rate=.25
    s.render.resolution_x=size; s.render.resolution_y=size; s.render.resolution_percentage=100
    s.world.color=(0,0,0)
    s.world.use_nodes=True; s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=0
    s.view_settings.view_transform='Standard'; s.view_settings.look='None'
    s.view_settings.exposure=0; s.view_settings.gamma=1
    s.unit_settings.system='METRIC'; s.unit_settings.scale_length=695700000
    s['source_label']='Illustrative reduced solar atmosphere; relative emission; not measured field'
    s['coordinates']='Carrington +Z north +Y west; one unit = 695700000 m'
    return s

def camera(name, position, scale=3.6, target=(0,0,0)):
    data=bpy.data.cameras.new(name); data.type='ORTHO'; data.ortho_scale=scale
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    obj.location=position; obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.clip_start=.01; data.clip_end=100
    return obj

def emission(name, color=(1,1,1), strength=1):
    m=bpy.data.materials.new(name); m.use_nodes=True; n=m.node_tree.nodes; n.clear()
    out=n.new('ShaderNodeOutputMaterial'); e=n.new('ShaderNodeEmission')
    e.inputs['Color'].default_value=(*color,1); e.inputs['Strength'].default_value=strength
    m.node_tree.links.new(e.outputs[0],out.inputs['Surface']); return m

def volume(name, j=1., alpha=0., color=(1,1,1)):
    m=bpy.data.materials.new(name); m.use_nodes=True; n=m.node_tree.nodes; n.clear()
    out=n.new('ShaderNodeOutputMaterial'); e=n.new('ShaderNodeEmission')
    e.inputs['Color'].default_value=(*color,1); e.inputs['Strength'].default_value=j
    if alpha:
        a=n.new('ShaderNodeVolumeAbsorption'); a.inputs['Color'].default_value=(0,0,0,1); a.inputs['Density'].default_value=alpha
        add=n.new('ShaderNodeAddShader'); m.node_tree.links.new(e.outputs[0],add.inputs[0]); m.node_tree.links.new(a.outputs[0],add.inputs[1]); source=add.outputs[0]
    else: source=e.outputs[0]
    m.node_tree.links.new(source,out.inputs['Volume']); return m

def sphere(name, radius, material, location=(0,0,0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96,ring_count=64,radius=radius,location=location)
    o=bpy.context.object; o.name=name; o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    return o

def render_pair(root, name):
    s=bpy.context.scene
    shared=bool(s.get('browser_palette',False))
    s.render.image_settings.file_format='OPEN_EXR'; s.render.image_settings.color_depth='32'; s.render.filepath=str(root/(name+('-transfer' if shared else '')+'.exr'))
    bpy.ops.render.render(write_still=True)
    img=bpy.data.images.load(s.render.filepath,check_existing=False)
    pixels=list(img.pixels); width,height=img.size
    if shared:
        import numpy as np
        data=np.asarray(pixels,dtype=np.float32).reshape(-1,4)
        def smooth(lo,hi,x):
            t=np.clip((x-lo)/(hi-lo),0,1);return t*t*(3-2*t)
        def palette(x):
            t=smooth(.08,1.3,x)[:,None]
            hue=(1-t)*np.array([1.,.24,.012])+t*np.array([1.,.72,.20])
            t=smooth(2.,8.,x)[:,None];hue=(1-t)*hue+t*np.array([1.,.94,.67])
            return np.maximum(x,0)[:,None]*hue
        # R is surface-relative emission; G is the integrated coronal coefficient.
        rgb=palette(data[:,1]*3.2+data[:,0]*40.) if s.get('transfer_schema')=='solar-transfer-v2-corona-surface-mask' else palette(data[:,0]*3.2)+palette(data[:,1]*40.)
        mapped=np.ones_like(data);mapped[:,:3]=rgb
        result=bpy.data.images.new(name+'-matched',width=width,height=height,float_buffer=True)
        result.pixels.foreach_set(mapped.ravel());result.save_render(str(root/(name+'.exr')),scene=s)
        pixels=mapped.ravel().tolist()
        mapped[:,:3]=rgb/(1+np.maximum(rgb,0))
        result.pixels.foreach_set(mapped.ravel())
        s.render.image_settings.file_format='PNG';s.render.image_settings.color_depth='8'
        result.save_render(str(root/(name+'.png')),scene=s)
        bpy.data.images.remove(result)
    else:
        s.render.image_settings.file_format='PNG'; s.render.image_settings.color_depth='8'
        bpy.data.images['Render Result'].save_render(str(root/(name+'.png')),scene=s)
    bpy.data.images.remove(img)
    return pixels,width,height


def reference_settings(scene, exposure=0.0):
    """Normalize effective reference settings after opening an editable .blend."""
    from solar_common import validate_reference_bounds
    validate_reference_bounds(scene.render.resolution_x,scene.render.resolution_y,scene.cycles.samples)
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64
    scene.cycles.seed=1729;scene.cycles.use_denoising=False;scene.cycles.volume_step_rate=.25
    scene.render.resolution_percentage=100;scene.render.use_compositing=False;scene.render.use_sequencer=False
    scene.render.film_transparent=False
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.gamma=1.;scene.view_settings.exposure=exposure
    return dict(engine=scene.render.engine,device=scene.cycles.device,samples=scene.cycles.samples,seed=scene.cycles.seed,denoising=scene.cycles.use_denoising,resolution=[scene.render.resolution_x,scene.render.resolution_y],resolution_percentage=scene.render.resolution_percentage,compositing=scene.render.use_compositing,sequencer=scene.render.use_sequencer,view_transform=scene.view_settings.view_transform,look=scene.view_settings.look,gamma=scene.view_settings.gamma,exposure=scene.view_settings.exposure)
