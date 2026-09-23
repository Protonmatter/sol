"""Exact summed Gaussian media with one boundary per common segment support.

Source segment endpoints are canonicalized; per-term pulse arc orientation is
retained. Concentric widths share one outer4sigma cylinder and their coefficients
are summed internally, avoiding Cycles' coincident endcap ambiguity.
"""
import math
import bpy
from mathutils import Vector
from solar_common import gaussian_emissivity


def transported(point,time_s):
    radius=math.sqrt(sum(x*x for x in point));sin2=(point[2]/radius)**2
    rate=14.713-14.1844-2.396*sin2-1.787*sin2*sin2
    angle=math.radians(rate)*time_s/86400;c=math.cos(angle);s=math.sin(angle)
    return Vector((c*point[0]-s*point[1],s*point[0]+c*point[1],point[2]))


def summed_material(count):
    mat=bpy.data.materials.new(f'GaussianSummedMedium_{count}');mat.use_nodes=True
    n=mat.node_tree.nodes;n.clear();links=mat.node_tree.links
    def op(kind,a,b=None):
        node=n.new('ShaderNodeMath');node.operation=kind
        for i,x in enumerate((a,b)):
            if x is None:continue
            if isinstance(x,(int,float)):node.inputs[i].default_value=x
            else:links.new(x,node.inputs[i])
        return node.outputs[0]
    def attribute(index,name):
        node=n.new('ShaderNodeAttribute');node.attribute_type='OBJECT';node.attribute_name=f'gaussian_{index}_{name}'
        return node.outputs['Fac']
    coord=n.new('ShaderNodeTexCoord');xyz=n.new('ShaderNodeSeparateXYZ');links.new(coord.outputs['Object'],xyz.inputs[0])
    radial2=op('ADD',op('MULTIPLY',xyz.outputs['X'],xyz.outputs['X']),op('MULTIPLY',xyz.outputs['Y'],xyz.outputs['Y']))
    fraction=op('ADD',xyz.outputs['Z'],.5);total=0.
    for index in range(count):
        ratio=attribute(index,'radius_ratio');ratio2=op('MULTIPLY',ratio,ratio)
        gaussian=op('EXPONENT',op('MULTIPLY',op('DIVIDE',radial2,ratio2),-8))
        cutoff=op('LESS_THAN',radial2,ratio2)
        base=op('MULTIPLY',attribute(index,'j'),op('MULTIPLY',gaussian,cutoff))
        reverse=attribute(index,'reverse')
        along=op('ADD',op('MULTIPLY',fraction,op('SUBTRACT',1,reverse)),op('MULTIPLY',op('SUBTRACT',1,fraction),reverse))
        arc=op('ADD',attribute(index,'arc_start'),op('MULTIPLY',along,attribute(index,'original_length')))
        d=op('DIVIDE',op('SUBTRACT',arc,attribute(index,'pulse_center')),attribute(index,'pulse_width'))
        pulse=op('MULTIPLY',attribute(index,'pulse_envelope'),op('EXPONENT',op('MULTIPLY',op('MULTIPLY',d,d),-.5)))
        gain=op('ADD',1,pulse);gain.node.name=f'GaussianPulseGain_{index}'
        total=op('ADD',total,op('MULTIPLY',base,gain))
    em=n.new('ShaderNodeEmission');em.inputs['Color'].default_value=(1,0,0,1);links.new(total,em.inputs['Strength'])
    out=n.new('ShaderNodeOutputMaterial');links.new(em.outputs[0],out.inputs['Volume'])
    mat['medium_terms']=count;mat['formula']='Sum original truncated Gaussian coefficients and per-term arc-local pulses'
    return mat


def build_gaussian_strands(packet,time_s=None):
    time_s=packet['time_s'] if time_s is None else time_s
    if not math.isfinite(time_s) or sum(max(0,len(s['points'])-1) for s in packet['strands'])>16384:
        raise ValueError('Gaussian authoring time or segment budget invalid')
    if packet['time_s']!=0:raise ValueError('Gaussian source geometry must be the admitted t0 packet')
    groups={};supports=set();count=0
    for strand in packet['strands']:
        gains=strand.get('emissivity_gain')
        if gains is None:
            if packet.get('emission_model'):raise ValueError('Emission model requires explicit per-point gains')
            gains=[1.0]*len(strand['points'])
        if len(gains)!=len(strand['points']) or any(not math.isfinite(v) or not 0<=v<=1 for v in gains):
            raise ValueError('Invalid per-point emissivity gains')
        pulse=strand.get('pulse',{});width=pulse.get('width_R',.04)
        values=[pulse.get('onset_s',0),pulse.get('duration_s',1800),pulse.get('speed_R_per_s',.0002),pulse.get('amplitude',.3),width]
        if not all(math.isfinite(v) for v in values) or values[1]<=0 or values[2]<0 or not 0<=values[3]<=10 or not 1e-5<=width<=2.6:
            raise ValueError('Invalid Gaussian pulse descriptor')
        age=time_s-values[0];envelope=values[3]*math.sin(math.pi*age/values[1])**2 if 0<age<values[1] else 0.
        arc_start=0.
        for index,(a,b) in enumerate(zip(strand['points'],strand['points'][1:])):
            length=(Vector(b[:3])-Vector(a[:3])).length
            if length<=1e-10:continue
            sigma=.5*(a[3]+b[3]);key=tuple(sorted((tuple(a[:3]),tuple(b[:3]))))
            support=(key,sigma)
            if support in supports:raise ValueError('Exact coincident Gaussian supports are not qualified in Cycles')
            supports.add(support)
            term=dict(sigma=sigma,j=gaussian_emissivity(strand['emission_relative'],a[:3],b[:3],gains[index],gains[index+1]),reverse=float(tuple(a[:3])!=key[0]),arc_start=arc_start,original_length=length,pulse_center=values[2]*max(age,0),pulse_width=width,pulse_envelope=envelope,strand_id=str(strand['id']),family_id=str(strand.get('family_id','legacy')),region_id=str(strand.get('region_id','legacy')),role=strand.get('role','legacy'))
            groups.setdefault(key,[]).append(term)
            if len(groups[key])>16:raise ValueError('Shared Gaussian term budget exceeded')
            arc_start+=length;count+=1
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=1,depth=1)
    template=bpy.context.object;mesh=template.data;bpy.data.objects.remove(template,do_unlink=True)
    meshes={}
    for index,(key,terms) in enumerate(groups.items()):
        term_count=len(terms)
        if term_count not in meshes:
            data=mesh.copy();data.materials.append(summed_material(term_count));meshes[term_count]=data
        sigma=max(t['sigma'] for t in terms);start=transported(key[0],time_s);end=transported(key[1],time_s);axis=end-start
        obj=bpy.data.objects.new(f'GaussianSupport_{index}',meshes[term_count]);bpy.context.collection.objects.link(obj)
        obj.location=(start+end)*.5;obj.rotation_mode='QUATERNION';obj.rotation_quaternion=axis.to_track_quat('Z','Y');obj.scale=(4*sigma,4*sigma,axis.length)
        obj['term_count']=term_count;obj['outer_sigma_R']=sigma
        for term_index,term in enumerate(terms):
            term['radius_ratio']=term['sigma']/sigma
            for name,value in term.items():obj[f'gaussian_{term_index}_{name}']=value
    bpy.data.meshes.remove(mesh)
    bpy.context.scene['gaussian_support_count']=len(groups);bpy.context.scene['gaussian_merged_term_count']=count-len(groups)
    return count
