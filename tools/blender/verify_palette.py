"""Verify saved linear palette image against transfer-channel EXR, independently."""
import argparse,sys,json
from pathlib import Path
import bpy,numpy as np
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--name',default='front');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(a.root).resolve()
def read(name):
    im=bpy.data.images.load(str(root/name),check_existing=False);data=np.array(im.pixels,dtype=np.float64).reshape(-1,4);size=tuple(im.size);bpy.data.images.remove(im);return data,size
raw,size=read(a.name+'-transfer.exr');actual,_=read(a.name+'.exr')
def palette(x):
    t=np.clip((x-.08)/(1.3-.08),0,1);t=t*t*(3-2*t)
    a=np.array([1,.24,.012]);b=np.array([1,.72,.20]);c=np.array([1,.94,.67]);h=a+(b-a)*t[:,None]
    t=np.clip((x-2)/6,0,1);t=t*t*(3-2*t);h=h+(c-h)*t[:,None]
    return np.maximum(0,x[:,None])*h
metadata=json.loads((root/'receipt.json').read_text());v2=metadata.get('transfer_schema')=='solar-transfer-v2-corona-surface-mask'
expected=palette(3.2*raw[:,1]+40*raw[:,0]) if v2 else palette(3.2*raw[:,0])+palette(40*raw[:,1]);err=float(np.max(np.abs(expected-actual[:,:3])));scale=float(np.max(expected));passed=err<=max(1e-6,scale*2e-6)
summary=dict(passed=passed,max_absolute_linear_error=err,max_linear_value=scale,formula='palette(3.2*G+40*R)' if v2 else 'palette(3.2*R)+palette(40*G)',dimensions=size)
(root/(a.name+'-palette-check.json')).write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
if not passed:raise RuntimeError('Saved palette EXR mismatch')
