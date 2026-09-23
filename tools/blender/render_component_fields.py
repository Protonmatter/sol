"""Project eight exact component rasters into a fixed disk-only scalar preview.

No lighting, volume, bloom, palette, per-panel normalization or image blur.
Input is a local authoring JSON with eight ordered, hash-bound components.
"""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy,numpy as np
from solar_common import sha256,receipt
p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);manifest=Path(a.manifest).resolve();doc=json.loads(manifest.read_text(encoding='utf-8'));out=Path(a.out).resolve()
if doc.get('schema')!='solar-component-contact.v1' or len(doc.get('components',[]))!=8:raise ValueError('Expected eight explicit component records')
size=512;scale=3.4;axis=(np.arange(size)+.5)/size*scale-scale/2;y,z=np.meshgrid(axis,axis);disk=y*y+z*z<=1;x=np.sqrt(np.maximum(0,1-y*y-z*z));lon=np.mod(np.arctan2(y,x)/(2*np.pi),1);lat=np.arcsin(np.clip(z,-1,1))/np.pi+.5
s=bpy.context.scene;s.view_settings.view_transform='Standard';s.view_settings.look='None';s.view_settings.exposure=0;s.view_settings.gamma=1;s.render.use_compositing=False
admitted=[]
for component in doc['components']:
 path=Path(component['path']).resolve();w,h=component['dimensions']
 if type(w) is not int or type(h) is not int or not 4<=w<=4096 or not 4<=h<=2048 or path.stat().st_size!=4*w*h or sha256(path)!=component['sha256']:raise ValueError('Component size/hash mismatch')
 if component.get('display_gain')!=1:raise ValueError('This diagnostic permits only the agreed unit display gain')
 values=np.frombuffer(path.read_bytes(),dtype='<f4').reshape(h,w)
 if not np.isfinite(values).all():raise ValueError('Nonfinite component data')
 admitted.append((component,values))
out.mkdir(parents=True,exist_ok=False);(out/'input-manifest.json').write_bytes(manifest.read_bytes());(out/'render_component_fields.py').write_bytes(Path(__file__).read_bytes())
records=[]
for index,(component,field) in enumerate(admitted):
 h,w=field.shape;tx=lon*w-.5;ty=np.clip(lat*h-.5,0,h-1);ix=np.floor(tx).astype(int);iy=np.floor(ty).astype(int);fx=tx-ix;fy=ty-iy
 scalar=(1-fy)*((1-fx)*field[iy,ix%w]+fx*field[iy,(ix+1)%w])+fy*((1-fx)*field[np.minimum(iy+1,h-1),ix%w]+fx*field[np.minimum(iy+1,h-1),(ix+1)%w]);scalar[~disk]=0
 rgba=np.ones((size,size,4),dtype=np.float32);rgba[:,:,:3]=scalar[:,:,None]
 image=bpy.data.images.new(f'component-{index}',width=size,height=size,float_buffer=True);image.pixels.foreach_set(rgba.ravel())
 s.render.image_settings.file_format='OPEN_EXR';s.render.image_settings.color_depth='32';image.save_render(str(out/f'component-{index}.exr'),scene=s)
 s.render.image_settings.file_format='PNG';s.render.image_settings.color_depth='8';image.save_render(str(out/f'component-{index}.png'),scene=s);bpy.data.images.remove(image)
 v=scalar[disk];records.append(dict(index=index,label=component['label'],quantity=component['quantity'],unit=component['unit'],source_sha256=component['sha256'],source_range=[float(field.min()),float(field.max())],disk_range=[float(v.min()),float(v.max())],display_gain=1,exposure_ev=0,fraction_disk_outside_display_range=float(np.mean((v<0)|(v>1)))))
receipt(out,dict(schema='solar-component-contact-render.v1',input_manifest_sha256=sha256(manifest),recipe_hash=doc.get('recipe_hash'),source_note=doc.get('source_note'),camera='orthographic +X looking at origin; +Z up, right +Y',ortho_scale_R=scale,resolution=[size,size],projection='Independent analytic unit sphere with bilinear texel-center sampling',display_curve='Standard sRGB encoding of linear scalar, gain1/exposure0; no per-panel normalization; float EXRs unclipped',components=records))
print(json.dumps(records))
