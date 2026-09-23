"""Real Cycles transfer/opaque sphere test with scene-linear EXR readback."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import argparse,json,time,math
import bpy
from solar_bpy import setup,camera,volume,emission,sphere,render_pair
from solar_common import transfer,receipt
p=argparse.ArgumentParser(); p.add_argument('--out',required=True); a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve(); out.mkdir(parents=True,exist_ok=False)
s=setup(512,64); s.camera=camera('transfer_camera',(0,-8,0),4)
# Left half is a unit-depth slab: emission j=0.4, absorption alpha=0.7.
bpy.ops.mesh.primitive_cube_add(size=1,location=(-1,0,0)); slab=bpy.context.object; slab.name='KnownUnitSlab'; slab.scale=(1,1,2); slab.data.materials.append(volume('slab_j04_a07',.4,.7))
# Right top: strand foreground of opaque sphere; bottom: occulted rear strand.
sphere('OpaqueSphere',.72,emission('photosphere_known',strength=.1),(.95,0,0))
for z,y,name in ((.25,-1,'ForegroundStrand'),(-.25,1,'RearStrand')):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(.95,y,z)); o=bpy.context.object; o.name=name; o.scale=(.6,.25,.12); o.data.materials.append(volume(name,.8,0))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'transfer.blend'))
t=time.perf_counter(); pixels,w,h=render_pair(out,'transfer-linear')
def patch(x,z):
    cx=int((x/4+.5)*w); cy=int((z/4+.5)*h)
    return sum(pixels[4*((cy+dy)*w+cx+dx)] for dy in range(-2,3) for dx in range(-2,3))/25
expected=transfer(.4,.7,1); actual=patch(-1,0); front=patch(.95,.25); rear=patch(.95,-.25)
checks={'slab_expected':expected,'slab_actual':actual,'slab_relative_error':abs(actual-expected)/expected,'foreground_expected':.3,'foreground_actual':front,'rear_expected':.1,'rear_actual':rear}
passed=checks['slab_relative_error']<.035 and abs(front-.3)<.015 and abs(rear-.1)<.005
receipt(out,dict(schema='solar-blender-transfer.v1',passed=passed,checks=checks,elapsed_s=time.perf_counter()-t,blender=bpy.app.version_string,build_hash=bpy.app.build_hash.decode(),engine='CYCLES',device='CPU',samples=64,linear_space='scene-linear Rec.709',preview='Standard sRGB; exposure 0',units='one Blender unit = nominal solar radius'))
print(json.dumps(checks));
if not passed: raise RuntimeError('Transfer/occlusion qualification failed; do not accept beauty as oracle')
