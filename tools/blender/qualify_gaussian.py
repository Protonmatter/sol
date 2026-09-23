"""Gaussian support and local-coordinate scaling test in actual Cycles."""
import sys,argparse,json,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
from solar_bpy import setup,camera,render_pair
from gaussian_strands import build_gaussian_strands
from solar_common import receipt
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False)
# Axis Z, sigma .02, truncated radius .08. Camera ray is perpendicular to axis.
packet=dict(time_s=0,strands=[dict(id=1,emission_relative=1,points=[[0,0,-.1,.02],[0,0,.1,.02]],pulse=dict(onset_s=0,duration_s=1800,speed_R_per_s=0,amplitude=.3))])
checks=[]
for time_s in [0,900]:
 s=setup(256,64);s.camera=camera('front',(0,-4,0),.4);build_gaussian_strands(packet,time_s)
 pixels,w,h=render_pair(out,'gaussian-'+str(time_s));actual=pixels[4*(128*w+128)]
 # Pixel center x=.00078125; allow pixel filtering/quadrature and cylindrical polygon error.
 x=.4/256*.5;extent=math.sqrt((4*.02)**2-x*x)
 expected=math.sqrt(2*math.pi)*.02*math.exp(-x*x/(2*.02**2))*math.erf(extent/(math.sqrt(2)*.02))
 if time_s==900:expected*=1+.3*math.exp(-(.1+.4/256*.5)**2/(2*.04**2))
 checks.append(dict(time_s=time_s,expected=expected,actual=actual,relative_error=abs(actual-expected)/expected))
 assert checks[-1]['relative_error']<.015,checks[-1]
 bpy.ops.wm.save_as_mainfile(filepath=str(out/f'gaussian-{time_s}.blend'),compress=True)
# Distinct overlapping supports must add. Exact coincident boundaries are rejected by the importer.
s=setup(128,64);s.camera=camera('front',(0,-4,0),.4)
import copy
pair=copy.deepcopy(packet);second=copy.deepcopy(pair['strands'][0]);second['id']=2;second['emission_relative']=.37
for point in second['points']:point[0]+=.015
pair['strands'].append(second)
build_gaussian_strands(pair,0);pixels,w,h=render_pair(out,'overlap')
actual=pixels[4*(64*w+64)];x=.4/128*.5;extent=math.sqrt((4*.02)**2-x*x)
expected=math.sqrt(2*math.pi)*.02*math.exp(-x*x/(2*.02**2))*math.erf(extent/(math.sqrt(2)*.02))
x2=x-.015;extent2=math.sqrt((4*.02)**2-x2*x2)
expected+=.37*math.sqrt(2*math.pi)*.02*math.exp(-x2*x2/(2*.02**2))*math.erf(extent2/(math.sqrt(2)*.02))
checks.append(dict(case='noncoincident unequal-emissivity shared material',expected=expected,actual=actual,relative_error=abs(actual-expected)/expected));assert checks[-1]['relative_error']<.02,checks[-1]
duplicate=copy.deepcopy(packet);other=copy.deepcopy(duplicate['strands'][0]);other['id']=9;duplicate['strands'].append(other)
setup(64,64)
try:build_gaussian_strands(duplicate,0)
except ValueError as error:
    assert 'coincident' in str(error);duplicate_rejected=True
else:raise AssertionError('Exact duplicate support must be rejected')
receipt(out,dict(schema='solar-gaussian-transfer.v1',passed=True,duplicate_support_rejected=duplicate_rejected,checks=checks,coordinates='local unit cylinder radial<=1,z[-.5,.5], world scale4sigma,4sigma,L'))
print(json.dumps(checks))
