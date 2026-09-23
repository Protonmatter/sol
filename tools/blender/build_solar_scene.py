"""Build a solar scene from a hashed numeric packet, never a beauty texture."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import argparse,json,math,shutil
import bpy
from solar_bpy import setup,camera,emission,volume,sphere
from solar_common import load_packet,sha256,receipt,checked_file,admit_manifest

def photosphere(packet):
    surface=packet['surface']; m=emission('PlanckRelativePhotosphere')
    n=m.node_tree.nodes; links=m.node_tree.links; e=next(x for x in n if x.type=='EMISSION')
    # Explicit mu=abs(dot(N, incoming)); no external lighting or Layer Weight bias.
    view_geo=n.new('ShaderNodeNewGeometry'); dot=n.new('ShaderNodeVectorMath'); dot.operation='DOT_PRODUCT'
    links.new(view_geo.outputs['Normal'],dot.inputs[0]); links.new(view_geo.outputs['Incoming'],dot.inputs[1])
    mu=n.new('ShaderNodeMath'); mu.operation='ABSOLUTE'; links.new(dot.outputs['Value'],mu.inputs[0])
    mul=n.new('ShaderNodeMath'); mul.operation='MULTIPLY'; mul.inputs[1].default_value=surface['limb_u']; links.new(mu.outputs[0],mul.inputs[0])
    add=n.new('ShaderNodeMath'); add.operation='ADD'; add.inputs[1].default_value=1-surface['limb_u']; links.new(mul.outputs[0],add.inputs[0])
    # Geometry position is unit-radius for the undisplaced sphere. Shared region anchors.
    geo=n.new('ShaderNodeTexCoord'); contrast=add.outputs[0]
    for region in packet.get('regions',[]):
        dist=n.new('ShaderNodeVectorMath'); dist.operation='DISTANCE'; dist.inputs[1].default_value=region['center']; links.new(geo.outputs['Object'],dist.inputs[0])
        mapping=n.new('ShaderNodeMapRange'); mapping.clamp=True; mapping.interpolation_type='SMOOTHERSTEP'
        mapping.inputs['From Min'].default_value=region['radius_rad']*.3; mapping.inputs['From Max'].default_value=region['radius_rad']
        wl=surface['wavelength_nm']*1e-9; c2=.01438776877
        ratio=math.expm1(c2/(wl*surface['quiet_temperature_k']))/math.expm1(c2/(wl*region['temperature_k']))
        mapping.inputs['To Min'].default_value=ratio; mapping.inputs['To Max'].default_value=1
        links.new(dist.outputs['Value'],mapping.inputs['Value']); mult=n.new('ShaderNodeMath'); mult.operation='MULTIPLY'; links.new(contrast,mult.inputs[0]); links.new(mapping.outputs[0],mult.inputs[1]); contrast=mult.outputs[0]
    links.new(contrast,e.inputs['Strength']); return m

def tube(strand):
    # Closed volume support; there is no surface shader and no opaque glowing pipe.
    c=bpy.data.curves.new('Field_'+str(strand['id']),'CURVE'); c.dimensions='3D'; c.resolution_u=1; c.bevel_resolution=2; c.resolution_u=1; c.use_fill_caps=True
    c.bevel_depth=1.; sp=c.splines.new('POLY'); sp.points.add(len(strand['points'])-1)
    for dest,p in zip(sp.points,strand['points']): dest.co=(*p[:3],1); dest.radius=p[3]
    o=bpy.data.objects.new(c.name,c); bpy.context.collection.objects.link(o)
    o['model_id']=str(strand['id']); o['classification']=strand['classification']; o['emission_relative']=strand['emission_relative']
    o.data.materials.append(volume(c.name,strand['emission_relative'],0,(1,.48,.08)))
    bpy.context.view_layer.objects.active=o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return o

def main():
    source_snapshot={f.name:f.read_bytes() for f in Path(__file__).parent.glob('*.py')}
    p=argparse.ArgumentParser(); p.add_argument('--recipe',required=True); p.add_argument('--bundle',required=True); p.add_argument('--out',required=True); p.add_argument('--size',type=int,default=512); p.add_argument('--volume'); p.add_argument('--volume-size',type=int,default=64); p.add_argument('--manifest'); p.add_argument('--surface'); p.add_argument('--gaussian-strands',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]); out=Path(a.out).resolve(); bundle=Path(a.bundle).resolve(); recipe=Path(a.recipe).resolve()
    if not 64<=a.size<=1024: raise ValueError('size outside bounded 64..1024')
    packet=load_packet(bundle); recipe_data=json.loads(recipe.read_text(encoding='utf-8')); admitted={}
    if a.manifest:
        manifest_path=Path(a.manifest).resolve(); manifest=json.loads(manifest_path.read_text(encoding='utf-8')); web_root=manifest_path.parent.parent.parent
        admitted=admit_manifest(web_root,manifest,bundle,packet,Path(a.volume).resolve() if a.volume else None,Path(a.surface).resolve() if a.surface else None)
    if recipe_data['recipe_id'] != packet['recipe_id'] or recipe_data['seed'] != packet['seed']: raise ValueError('recipe and packet mismatch')
    if a.gaussian_strands and (not a.manifest or admitted.get('volume',{}).get('contains_strands') is not False): raise ValueError('Gaussian strands require admitted diffuse-only background')
    out.mkdir(parents=True,exist_ok=False)
    (out/'authoring-source').mkdir()
    for filename,data in source_snapshot.items():(out/'authoring-source'/filename).write_bytes(data)
    s=setup(a.size,64)
    s['camera_frame']='Carrington corotating fixed camera; not inertial-camera parity'; s['transfer_schema']='solar-transfer-v2-corona-surface-mask'; s['palette_recipe']='palette(3.2*surface+40*corona);Reinhard;sRGB'; s['browser_palette']=bool(a.surface); s['packet_sha256']=sha256(bundle); s['recipe_sha256']=sha256(recipe); s['scenario_time_s']=packet['time_s']
    s['manifest_sha256']=sha256(manifest_path) if a.manifest else ''; s['recipe_hash']=packet.get('recipe_hash',''); s['admitted_interpretation']=json.dumps(admitted,sort_keys=True)
    s['volume_support']='constant-emissivity closed strand tubes; geometric approximation to Gaussian packet support; not voxel parity'
    if a.surface:
        from volume_atlas import surface_map
        surface_path=Path(a.surface).resolve(); surface_dims=admitted.get('surface_interpretation',dict(width=512,height=256)); mat=surface_map(surface_path,surface_dims['width'],surface_dims['height'],diagnostic='v2'); s['surface_sha256']=sha256(surface_path); s['channel']='Illustrative EUV proxy, not calibrated AIA'
    else:
        mat=photosphere(packet); s['channel']='Planck-relative continuum'
    sphere('Photosphere',1,mat)
    bpy.ops.object.select_all(action='DESELECT')
    if a.volume:
        from volume_atlas import scalar_volume
        volume_path=Path(a.volume).resolve()
        volume_size=admitted.get('volume_interpretation',{}).get('size',a.volume_size)
        scalar_volume(volume_path,volume_size,time_s=packet['time_s'],rotation=manifest['rotation'] if a.manifest else None,pulse_entry=admitted.get('volume',{}).get('pulse'),source_root=web_root if a.manifest else None,diagnostic='v2' if a.surface else False)
        s['volume_sha256']=sha256(volume_path)
        s['volume_support']='shared x-fastest voxel-centered grid, trilinear atlas interpolation, emission-only volume'
    else:
        for strand in packet['strands']: tube(strand)
    if a.gaussian_strands:
        from gaussian_strands import build_gaussian_strands
        base_entry=manifest['packet'];base_path=checked_file(web_root,base_entry['path'],base_entry['sha256']);base_packet=load_packet(base_path)
        if base_packet['recipe_hash']!=packet['recipe_hash']:raise ValueError('Gaussian source recipe mismatch')
        segment_count=build_gaussian_strands(base_packet,packet['time_s'])
        s['gaussian_geometry_sha256']=sha256(base_path)
        s['gaussian_segment_count']=segment_count
        s['volume_support']='admitted diffuse-only grid plus exact per-segment Gaussian terms; common-endpoint terms share one summed medium; additive bend overlaps'
    solar_root=bpy.data.objects.new('SolarRoot',None);bpy.context.collection.objects.link(solar_root)
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH':obj.parent=solar_root
    s['coordinate_attachment']='SolarRoot owns geometry; scalar fields use object coordinates'
    for name,pos in [('front',(5,0,0)),('limb',(0,5,0)),('back',(-5,0,0)),('north',(0,0,5)),('south',(0,0,-5))]: camera(name,pos,3.4)
    camera('closeup',(5,0,0),.8,(.92,0,.1))
    s.camera=bpy.data.objects['front']; shutil.copyfile(bundle,out/'packet.json'); shutil.copyfile(recipe,out/'recipe.json')
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'sun.blend'),compress=True)
    receipt(out,dict(schema='solar-blender-scene.v1',blender=bpy.app.version_string,build_hash=bpy.app.build_hash.decode(),packet_sha256=sha256(bundle),recipe_sha256=sha256(recipe),strands=len(packet['strands']),gaussian_segment_count=s.get('gaussian_segment_count',0),gaussian_support_count=s.get('gaussian_support_count',0),gaussian_merged_term_count=s.get('gaussian_merged_term_count',0),gaussian_geometry_sha256=s.get('gaussian_geometry_sha256'),transfer_schema=s['transfer_schema'],palette_recipe=s['palette_recipe'],volume_sha256=s.get('volume_sha256'),surface_sha256=s.get('surface_sha256'),channel=s['channel'],coordinate_attachment=s['coordinate_attachment'],source_sha256={name:__import__('hashlib').sha256(data).hexdigest() for name,data in source_snapshot.items()},manifest_verified=bool(a.manifest),manifest_sha256=s['manifest_sha256'],recipe_hash=s['recipe_hash'],admitted_interpretation=admitted,units='solar radii',claim='illustrative reduced model',volume_support=s['volume_support']))
if __name__=='__main__': main()
