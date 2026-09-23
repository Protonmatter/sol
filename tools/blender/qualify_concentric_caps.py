"""Measure additive Cycles transfer for concentric volumes with shared endcaps."""
import sys,argparse,json,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
from solar_bpy import setup,camera,render_pair
from gaussian_strands import build_gaussian_strands
from solar_common import receipt
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False)
cases={'inner':[(.02,1.)],'outer':[(.04,1.)],'both':[(.02,1.),(.04,1.)],'both_reverse':[(.04,1.),(.02,1.)],'bundle_8percent':[(.02,1.),(.04,.08)]};results=[]
for orientation,position in [('axial',(0,0,4)),('transverse',(0,-4,0))]:
 for name,parameters in cases.items():
  s=setup(256,64);s.camera=camera('camera',position,.4)
  strands=[dict(id=i,emission_relative=j,points=[[0,0,-.1,sigma],[0,0,.1,sigma]],pulse=dict(onset_s=0,duration_s=1800,speed_R_per_s=0,amplitude=0)) for i,(sigma,j) in enumerate(parameters)]
  build_gaussian_strands(dict(time_s=0,strands=strands),0);label=orientation+'-'+name
  bpy.ops.wm.save_as_mainfile(filepath=str(out/(label+'.blend')),compress=True)
  pixels,w,h=render_pair(out,label);actual=pixels[4*(128*w+128)];offset=.4/256*.5;expected=0
  for sigma,j in parameters:
   if orientation=='axial':value=.2*math.exp(-(2*offset*offset)/(2*sigma*sigma))
   else:value=math.sqrt(2*math.pi)*sigma*math.exp(-offset*offset/(2*sigma*sigma))*math.erf(math.sqrt((4*sigma)**2-offset**2)/(math.sqrt(2)*sigma))
   expected+=j*value
  error=abs(actual-expected)/expected
  results.append(dict(orientation=orientation,case=name,expected=expected,actual=actual,relative_error=error,passed=error<.015));print(json.dumps(results[-1]),flush=True)
# Reversed original endpoint order must reverse pulse arc, not the physical support.
s=setup(256,64);s.camera=camera('camera',(0,-4,.06),.4,target=(0,0,.06))
pulse=dict(onset_s=0,duration_s=1800,speed_R_per_s=.04/900,amplitude=.3,width_R=.04)
strands=[dict(id=0,emission_relative=1,points=[[0,0,-.1,.02],[0,0,.1,.02]],pulse=pulse),dict(id=1,emission_relative=.08,points=[[0,0,.1,.04],[0,0,-.1,.04]],pulse=pulse)]
build_gaussian_strands(dict(time_s=0,strands=strands),900)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'reversed-endpoint-pulse.blend'),compress=True)
pixels,w,h=render_pair(out,'reversed-endpoint-pulse');actual=pixels[4*(128*w+128)];offset=.4/256*.5;world_z=.06+offset;expected=0
for sigma,j,arc in [(.02,1,.1+world_z),(.04,.08,.1-world_z)]:
 base=math.sqrt(2*math.pi)*sigma*math.exp(-offset**2/(2*sigma*sigma))*math.erf(math.sqrt((4*sigma)**2-offset**2)/(math.sqrt(2)*sigma))
 expected+=j*base*(1+.3*math.exp(-.5*((arc-.04)/.04)**2))
error=abs(actual-expected)/expected
results.append(dict(orientation='transverse',case='reversed-endpoint-pulse',expected=expected,actual=actual,relative_error=error,passed=error<.015))
receipt(out,dict(schema='solar-concentric-endcap-test.v1',passed=all(r['passed'] for r in results),case_definition='Coaxial Z cylinders, identical caps z+/-0.1, sigma0.02/0.04, exact common center; pixel-center analytic approximation with1.5% tolerance for AA',results=results))
