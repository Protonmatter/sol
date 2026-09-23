"""Real render readback for scalar atlas interpolation and coefficient scaling."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy,numpy as np,json,argparse
from solar_bpy import setup,camera,render_pair
from volume_atlas import scalar_volume
from solar_common import receipt
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False)
s=setup(128,64);s.camera=camera('atlas_camera',(0,-4,0),2)
# x ramp: sample average around center x=0 is exactly .4; detects atlas axis mapping.
centers=(np.arange(8,dtype=np.float32)+.5)/8-.5; grid=np.broadcast_to(.4+.2*centers[None,None,:]+.1*centers[:,None,None],(8,8,8)).copy();(out/'known.f32').write_bytes(grid.astype('<f4').tobytes());scalar_volume(out/'known.f32',8,(-.5,.5))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'atlas.blend'));pixels,w,h=render_pair(out,'atlas-linear')
mean=sum(pixels[4*(y*w+x)] for y in range(60,68) for x in range(60,68))/64
off=sum(pixels[4*(y*w+x)] for y in range(76,84) for x in range(76,84))/64
passed=abs(mean-.4)<.005 and abs(off-.475)<.005
receipt(out,dict(schema='solar-blender-atlas-test.v1',passed=passed,expected=.4,actual=mean,off_axis_expected=.475,off_axis_actual=off,linear=True,device='CPU'))
print('Atlas expected .4 actual',mean)
if not passed:raise RuntimeError('Atlas numeric readback failed')
