"""Create an editable display companion without changing the raw reference scene.

The compositor reconstructs the admitted single-palette/Reinhard transform.
Standard view transform performs sRGB encoding exactly once. No embedded code.
"""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
import numpy as np
from solar_common import sha256,receipt
from solar_bpy import reference_settings,render_pair


def add_compositor(scene):
    scene.use_nodes=True;tree=scene.node_tree;nodes=tree.nodes;nodes.clear();links=tree.links
    def math_node(operation,a,b=None):
        node=nodes.new('CompositorNodeMath');node.operation=operation
        for index,value in enumerate((a,b)):
            if value is None:continue
            if isinstance(value,(int,float)):node.inputs[index].default_value=value
            else:links.new(value,node.inputs[index])
        return node.outputs[0]
    layer=nodes.new('CompositorNodeRLayers');layer.name='Raw scientific transfer'
    separate=nodes.new('CompositorNodeSepRGBA');links.new(layer.outputs['Image'],separate.inputs[0])
    intensity=math_node('MAXIMUM',math_node('ADD',math_node('MULTIPLY',separate.outputs['R'],40),math_node('MULTIPLY',separate.outputs['G'],3.2)),0)
    def smooth(lo,hi):
        x=math_node('MINIMUM',math_node('MAXIMUM',math_node('DIVIDE',math_node('SUBTRACT',intensity,lo),hi-lo),0),1)
        return math_node('MULTIPLY',math_node('MULTIPLY',x,x),math_node('SUBTRACT',3,math_node('MULTIPLY',2,x)))
    t=smooth(.08,1.3);w=smooth(2,8)
    channels=[]
    for first,middle,last in zip((1,.24,.012),(1,.72,.20),(1,.94,.67)):
        hue=math_node('ADD',first,math_node('MULTIPLY',middle-first,t))
        hue=math_node('ADD',hue,math_node('MULTIPLY',math_node('SUBTRACT',last,hue),w))
        radiance=math_node('MULTIPLY',intensity,hue)
        channels.append(math_node('DIVIDE',radiance,math_node('ADD',1,radiance)))
    color=nodes.new('CompositorNodeCombRGBA');color.name='Reinhard scene-linear display image'
    for index,value in enumerate(channels):links.new(value,color.inputs[index])
    color.inputs[3].default_value=1
    output=nodes.new('CompositorNodeComposite');links.new(color.outputs[0],output.inputs['Image'])
    # Arrange a readable source-to-output graph; formulas remain regular math nodes.
    for index,node in enumerate(nodes):node.location=(index%8*190,-index//8*180)
    scene.render.use_compositing=True


def main():
    p=argparse.ArgumentParser();p.add_argument('--scene',required=True);p.add_argument('--out',required=True);p.add_argument('--verify',action='store_true');p.add_argument('--size',type=int)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(args.scene).resolve();out=Path(args.out).resolve()
    if out.exists():raise ValueError('Output already exists')
    if args.size is not None and not 64<=args.size<=1024:raise ValueError('Invalid preview dimensions')
    source_hash=sha256(source);bpy.ops.wm.open_mainfile(filepath=str(source),use_scripts=False);scene=bpy.context.scene
    if scene.get('transfer_schema')!='solar-transfer-v2-corona-surface-mask':raise ValueError('Unsupported source transfer channels')
    reference_settings(scene)
    if args.size:scene.render.resolution_x=scene.render.resolution_y=args.size
    out.mkdir(parents=True);(out/'make_beauty_scene.py').write_bytes(Path(__file__).read_bytes())
    add_compositor(scene);scene['artifact_role']='Editable display companion; raw sun.blend is separate';scene['reference_scene_sha256']=source_hash
    scene['display_recipe']='palette(3.2*surface+40*corona), Reinhard scene-linear compositor, Standard sRGB encoding'
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8';scene.render.filepath=str(out/'beauty.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'beauty.blend'),compress=True)
    verification=None
    if args.verify:
        scene.render.use_compositing=False;render_pair(out,'independent-display')
        scene.render.use_compositing=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8';scene.render.filepath=str(out/'beauty.png')
        bpy.ops.render.render(write_still=True)
        def read(path):
            image=bpy.data.images.load(str(path),check_existing=False);values=np.array(image.pixels,dtype=np.float32);bpy.data.images.remove(image);return values
        expected=read(out/'independent-display.png');actual=read(out/'beauty.png');maximum=float(np.max(np.abs(actual-expected)))
        verification=dict(passed=maximum<=1/255+1e-6,max_png_component_difference=maximum,tolerance=1/255+1e-6)
        if not verification['passed']:raise RuntimeError('Beauty compositor does not match independent display transform')
    if sha256(source)!=source_hash:raise RuntimeError('Raw reference source changed')
    receipt(out,dict(schema='solar-beauty-companion.v1',reference_scene_sha256=source_hash,recipe_hash=scene.get('recipe_hash'),blender=bpy.app.version_string,display_recipe=scene['display_recipe'],compositing=True,view_transform=scene.view_settings.view_transform,look=scene.view_settings.look,gamma=scene.view_settings.gamma,exposure=scene.view_settings.exposure,verification=verification))
    print(json.dumps(verification))
if __name__=='__main__':main()
