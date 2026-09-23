"""Represent an x-fastest f32 cubic grid as a packed scene-linear atlas.

Two bilinear texture reads interpolate adjacent Z slices. Grid values lie at voxel centers within the
declared bounds; the exterior cube supplies hard domain support.
"""
import bpy
import numpy as np
from pathlib import Path

def scalar_volume(path: Path, size: int, bounds=(-2.5,2.5), gain=1.,time_s=0.,rotation=None,pulse_entry=None,source_root=None,diagnostic=False):
    if not 2<=size<=128 or path.stat().st_size != size**3*4: raise ValueError('invalid volume dimensions/length')
    grid=np.frombuffer(path.read_bytes(),dtype='<f4').reshape(size,size,size)
    if not np.isfinite(grid).all() or (grid<0).any(): raise ValueError('invalid scalar emissivity')
    # Atlas horizontal axis: slice*size+x; vertical axis:y.
    atlas=np.zeros((size,size*size,4),dtype=np.float32); atlas[:,:,0]=grid.transpose(1,0,2).reshape(size,size*size); atlas[:,:,1]=atlas[:,:,0]; atlas[:,:,2]=atlas[:,:,0]; atlas[:,:,3]=1
    image=bpy.data.images.new('SharedEmissivityAtlas',width=size*size,height=size,float_buffer=True); image.colorspace_settings.name='Non-Color'; image.pixels.foreach_set(atlas.ravel()); image.pack()
    m=bpy.data.materials.new('SharedScalarEmissivityVolume'); m.use_nodes=True; n=m.node_tree.nodes; n.clear(); link=m.node_tree.links
    def mathop(op,a,b=None):
        node=n.new('ShaderNodeMath'); node.operation=op
        for idx,x in enumerate((a,b)):
            if x is None: continue
            if isinstance(x,(float,int)): node.inputs[idx].default_value=x
            else: link.new(x,node.inputs[idx])
        return node.outputs[0]
    geo=n.new('ShaderNodeTexCoord'); position=geo.outputs['Object']
    if time_s and rotation:
        # Apply the same latitude-dependent inverse Carrington transport as GLSL.
        sep=n.new('ShaderNodeSeparateXYZ'); link.new(position,sep.inputs[0])
        length=n.new('ShaderNodeVectorMath');length.operation='LENGTH';link.new(position,length.inputs[0])
        z=mathop('DIVIDE',sep.outputs['Z'],mathop('MAXIMUM',length.outputs['Value'],1e-8));s2=mathop('MULTIPLY',z,z)
        coefficients=rotation['coefficients_deg_per_day'];rate=mathop('ADD',coefficients[0]-rotation['frame_rate_deg_per_day'],mathop('ADD',mathop('MULTIPLY',coefficients[1],s2),mathop('MULTIPLY',coefficients[2],mathop('MULTIPLY',s2,s2))))
        import math
        angle=mathop('MULTIPLY',rate,-math.pi/180*time_s/86400);c=mathop('COSINE',angle);sn=mathop('SINE',angle)
        combine=n.new('ShaderNodeCombineXYZ');link.new(mathop('SUBTRACT',mathop('MULTIPLY',c,sep.outputs['X']),mathop('MULTIPLY',sn,sep.outputs['Y'])),combine.inputs[0]);link.new(mathop('ADD',mathop('MULTIPLY',sn,sep.outputs['X']),mathop('MULTIPLY',c,sep.outputs['Y'])),combine.inputs[1]);link.new(sep.outputs['Z'],combine.inputs[2]);position=combine.outputs[0]
    xyz=n.new('ShaderNodeSeparateXYZ'); link.new(position,xyz.inputs[0])
    coords=[mathop('MINIMUM',mathop('MAXIMUM',mathop('SUBTRACT',mathop('MULTIPLY',mathop('SUBTRACT',xyz.outputs[i],bounds[0]),size/(bounds[1]-bounds[0])),.5),0),size-1) for i in range(3)]
    z0=mathop('FLOOR',coords[2]); z1=mathop('MINIMUM',mathop('ADD',z0,1),size-1); frac=mathop('SUBTRACT',coords[2],z0)
    def tex(z,selected_image=image):
        u=mathop('DIVIDE',mathop('ADD',mathop('ADD',coords[0],mathop('MULTIPLY',z,size)),.5),size*size)
        v=mathop('DIVIDE',mathop('ADD',coords[1],.5),size)
        vec=n.new('ShaderNodeCombineXYZ'); link.new(u,vec.inputs[0]); link.new(v,vec.inputs[1])
        t=n.new('ShaderNodeTexImage'); t.image=selected_image; t.interpolation='Linear'; t.extension='EXTEND'; link.new(vec.outputs[0],t.inputs['Vector'])
        return t.outputs['Color']
    low=tex(z0); high=tex(z1)
    mixed=mathop('ADD',mathop('MULTIPLY',low,mathop('SUBTRACT',1,frac)),mathop('MULTIPLY',high,frac))
    if pulse_entry:
        from solar_common import checked_file,validate_pulse_semantics
        validate_pulse_semantics(pulse_entry,size)
        pulse_path=checked_file(source_root,pulse_entry['path'],pulse_entry['sha256'])
        raw=np.frombuffer(pulse_path.read_bytes(),dtype='<f4')
        if raw.size!=size**3*4 or not np.isfinite(raw).all():raise ValueError('invalid pulse data')
        data=raw.reshape(size,size,size,4);values=[]
        for channel in range(4):
            pixels=np.ones((size,size*size,4),dtype=np.float32);field=data[:,:,:,channel].transpose(1,0,2).reshape(size,size*size);pixels[:,:,:3]=field[:,:,None]
            im=bpy.data.images.new('PulseChannel'+str(channel),width=size*size,height=size,float_buffer=True);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(pixels.ravel());im.pack()
            lo=tex(z0,im);hi=tex(z1,im);values.append(mathop('ADD',mathop('MULTIPLY',lo,mathop('SUBTRACT',1,frac)),mathop('MULTIPLY',hi,frac)))
        import math
        arc,onset,duration,support=values;age=mathop('SUBTRACT',time_s,onset)
        active=mathop('MULTIPLY',mathop('GREATER_THAN',age,0),mathop('LESS_THAN',age,duration))
        wave=mathop('SINE',mathop('MULTIPLY',mathop('DIVIDE',age,mathop('MAXIMUM',duration,1e-8)),math.pi));window=mathop('MULTIPLY',wave,wave)
        d=mathop('DIVIDE',mathop('SUBTRACT',arc,mathop('MULTIPLY',age,.0002)),.04)
        pulse=mathop('MULTIPLY',mathop('MULTIPLY',mathop('MULTIPLY',support,.3),active),mathop('MULTIPLY',window,mathop('EXPONENT',mathop('MULTIPLY',mathop('MULTIPLY',d,d),-.5))))
        mixed=mathop('ADD',mixed,pulse)
    em=n.new('ShaderNodeEmission'); em.inputs['Color'].default_value=(1,0,0,1) if diagnostic=='v2' else (0,1,0,1) if diagnostic else (1,.48,.08,1); link.new(mathop('MULTIPLY',mixed,gain),em.inputs['Strength'])
    out=n.new('ShaderNodeOutputMaterial'); link.new(em.outputs[0],out.inputs['Volume'])
    bpy.ops.mesh.primitive_cube_add(size=bounds[1]-bounds[0]); obj=bpy.context.object; obj.name='DiffuseCoronaSharedGrid'; obj.data.materials.append(m)
    return obj

def surface_map(path: Path,width=512,height=256,diagnostic=False):
    if path.stat().st_size != width*height*4: raise ValueError('surface map length mismatch')
    field=np.frombuffer(path.read_bytes(),dtype='<f4')
    if not np.isfinite(field).all() or (field<0).any(): raise ValueError('surface emissivity invalid')
    rgba=np.ones((len(field),4),dtype=np.float32); rgba[:,:3]=field[:,None]
    image=bpy.data.images.new('SharedSurfaceEmissivity',width=width,height=height,float_buffer=True); image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(rgba.ravel());image.pack()
    m=bpy.data.materials.new('IllustrativeEUVSurface');m.use_nodes=True;n=m.node_tree.nodes;n.clear();link=m.node_tree.links
    def op(kind,a,b=None):
        node=n.new('ShaderNodeMath');node.operation=kind
        for i,v in enumerate((a,b)):
            if v is None:continue
            if isinstance(v,(int,float)):node.inputs[i].default_value=v
            else:link.new(v,node.inputs[i])
        return node.outputs[0]
    geo=n.new('ShaderNodeTexCoord'); sep=n.new('ShaderNodeSeparateXYZ');link.new(geo.outputs['Object'],sep.inputs[0])
    import math
    u=op('MODULO',op('ADD',op('DIVIDE',op('ARCTAN2',sep.outputs['Y'],sep.outputs['X']),2*math.pi),1),1)
    v=op('ADD',op('DIVIDE',op('ARCSINE',op('MINIMUM',op('MAXIMUM',sep.outputs['Z'],-1),1)),math.pi),.5)
    v=op('MINIMUM',op('MAXIMUM',v,.5/height),1-.5/height)
    vec=n.new('ShaderNodeCombineXYZ');link.new(u,vec.inputs[0]);link.new(v,vec.inputs[1])
    tex=n.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear';tex.extension='REPEAT';link.new(vec.outputs[0],tex.inputs['Vector'])
    em=n.new('ShaderNodeEmission');em.inputs['Color'].default_value=(0,1,0,1) if diagnostic=='v2' else (1,0,0,1) if diagnostic else (1,.48,.08,1);link.new(tex.outputs['Color'],em.inputs['Strength'])
    out=n.new('ShaderNodeOutputMaterial')
    if diagnostic=='v2':
        mask=n.new('ShaderNodeEmission');mask.inputs['Color'].default_value=(0,0,1,1);mask.inputs['Strength'].default_value=1
        add=n.new('ShaderNodeAddShader');link.new(em.outputs[0],add.inputs[0]);link.new(mask.outputs[0],add.inputs[1]);link.new(add.outputs[0],out.inputs['Surface'])
    else:link.new(em.outputs[0],out.inputs['Surface'])
    return m
