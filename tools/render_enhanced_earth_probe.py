"""Optional Linux EGL/Mesa diagnostic using production shaders, not browser qualification.

Requires system libEGL, Node, NumPy and Pillow. No network or browser automation.
Outputs controlled comparisons and shader/source hashes to --output (default: docs/validation/enhanced-earth).
"""
import argparse
import ctypes as c
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=ROOT/'docs/validation/enhanced-earth')
args=parser.parse_args()
OUT=args.output
OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 data=Path(tmp)/'probe.json'
 subprocess.run(['node',str(ROOT/'tools/enhanced_earth_probe.mjs'),str(data)],check=True)
 D=json.loads(data.read_text())
W=768
E=c.CDLL('libEGL.so.1');E.eglGetProcAddress.argtypes=[c.c_char_p];E.eglGetProcAddress.restype=c.c_void_p

def egl(name,result,*types):
 f=getattr(E,name);f.restype=result;f.argtypes=types;return f

def gl(name,result,*types):
 addr=E.eglGetProcAddress(name.encode());assert addr,name
 return c.CFUNCTYPE(result,*types)(addr)

I,U,P,F=c.c_int,c.c_uint,c.c_void_p,c.c_float
platform=c.CFUNCTYPE(P,U,P,c.POINTER(I))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
d=platform(0x31DD,None,None);ma,mi=I(),I();assert egl('eglInitialize',U,P,c.POINTER(I),c.POINTER(I))(d,c.byref(ma),c.byref(mi))
assert egl('eglBindAPI',U,U)(0x30A0)
attrs=(I*15)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,24,0x3038)
cfg=P();n=I();assert egl('eglChooseConfig',U,P,c.POINTER(I),c.POINTER(P),I,c.POINTER(I))(d,attrs,c.byref(cfg),1,c.byref(n)) and n.value
surface=egl('eglCreatePbufferSurface',P,P,P,c.POINTER(I))(d,cfg,(I*5)(0x3057,W,0x3056,W,0x3038))
ctx=egl('eglCreateContext',P,P,P,P,c.POINTER(I))(d,cfg,None,(I*3)(0x3098,3,0x3038));assert ctx
assert egl('eglMakeCurrent',U,P,P,P,P)(d,surface,surface,ctx)
renderer=gl('glGetString',c.c_char_p,U)(0x1F01).decode();version=gl('glGetString',c.c_char_p,U)(0x1F02).decode();print(renderer,version,flush=True)
create=gl('glCreateShader',U,U);source=gl('glShaderSource',None,U,I,c.POINTER(c.c_char_p),P);compile_=gl('glCompileShader',None,U);getshader=gl('glGetShaderiv',None,U,U,c.POINTER(I));slog=gl('glGetShaderInfoLog',None,U,I,P,c.c_char_p)
cp=gl('glCreateProgram',U);attach=gl('glAttachShader',None,U,U);link=gl('glLinkProgram',None,U);getprog=gl('glGetProgramiv',None,U,U,c.POINTER(I));plog=gl('glGetProgramInfoLog',None,U,I,P,c.c_char_p)
programs={}
for name,shaders in D['programs'].items():
 p=cp()
 for kind,text in zip((0x8B31,0x8B30),shaders):
  s=create(kind);raw=c.c_char_p(text.encode());source(s,1,c.byref(raw),None);compile_(s);ok=I();getshader(s,0x8B81,c.byref(ok))
  if not ok.value:
   msg=c.create_string_buffer(50000);slog(s,len(msg),None,msg);raise RuntimeError(msg.value.decode())
  attach(p,s)
 link(p);ok=I();getprog(p,0x8B82,c.byref(ok))
 if not ok.value:
  msg=c.create_string_buffer(50000);plog(p,len(msg),None,msg);raise RuntimeError(msg.value.decode())
 programs[name]=p;print('compiled and linked',name,flush=True)
p=programs['base'];gl('glUseProgram',None,U)(p)
getloc=gl('glGetUniformLocation',I,U,c.c_char_p)
ints={'u_mode','u_style','u_useTex','u_texMode','u_mapNoData','u_textureLinear','u_tex','u_weatherTex','u_nightTex','u_iceTex','u_oceanMask','u_ringTex','u_terrainHeight','u_atmosphereIncidentField','u_atmosphereColumnField','u_atmosphereOzoneField','u_earthWeather','u_earthNight','u_earthIce','u_earthEnhanced','u_earthCloudShadow','u_linearOutput','u_atmosphereEnabled','u_terrainShadowEnabled'}
def uniform(name,value):
 loc=getloc(p,name.encode())
 if loc<0:return
 if isinstance(value,list):
  arr=(F*len(value))(*value)
  if len(value) in (9,16):gl('glUniformMatrix'+('3' if len(value)==9 else '4')+'fv',None,I,I,U,c.POINTER(F))(loc,1,0,arr)
  else:gl(f'glUniform{len(value)}fv',None,I,I,c.POINTER(F))(loc,1,arr)
 elif name in ints:gl('glUniform1i',None,I,I)(loc,value)
 else:gl('glUniform1f',None,I,F)(loc,value)
for name,value in D['uniforms'].items():uniform(name,value)
# All actual sampler2D uniforms get distinct, valid texture bindings.
gen=gl('glGenTextures',None,I,c.POINTER(U));bind=gl('glBindTexture',None,U,U);active=gl('glActiveTexture',None,U);param=gl('glTexParameteri',None,U,U,I);teximage=gl('glTexImage2D',None,U,I,I,I,I,I,U,U,P);mip=gl('glGenerateMipmap',None,U)
def texture(unit,array,internal=0x8058,fmt=0x1908):
 tex=U();gen(1,c.byref(tex));active(0x84C0+unit);bind(0x0DE1,tex.value)
 a=np.ascontiguousarray(array,dtype=np.uint8);h,w=a.shape[:2];teximage(0x0DE1,0,internal,w,h,0,fmt,0x1401,a.ctypes.data)
 param(0x0DE1,0x2801,0x2703);param(0x0DE1,0x2800,0x2601);param(0x0DE1,0x2802,0x2901);param(0x0DE1,0x2803,0x812F);mip(0x0DE1)
for unit in range(12):texture(unit,np.full((1,1,4),255,dtype=np.uint8))
texture(0,np.array(Image.open(ROOT/'apps/web/textures/reference/earth-land-2004.jpg').convert('RGBA')),0x8C43)
cloud=np.array(Image.open(ROOT/'apps/web/textures/reference/earth-blue-marble-2002-cloud-layer.png').convert('RGBA'))
cloud[:,:,:3]=((cloud[:,:,:3].astype(np.uint16)*cloud[:,:,3,None]+127)//255).astype(np.uint8)
texture(3,cloud)
texture(11,np.array(D['mask'],dtype=np.uint8).reshape(256,512),0x8229,0x1903)
genbuf=gl('glGenBuffers',None,I,c.POINTER(U));bindbuf=gl('glBindBuffer',None,U,U);bufdata=gl('glBufferData',None,U,c.c_ssize_t,P,U)
a=np.array(D['mesh']['pos'],dtype=np.float32);ind=np.array(D['mesh']['idx'],dtype=np.uint16)
for target,array in [(0x8892,a),(0x8893,ind)]:
 b=U();genbuf(1,c.byref(b));bindbuf(target,b);bufdata(target,array.nbytes,array.ctypes.data,0x88E4)
for loc in (0,1):
 gl('glEnableVertexAttribArray',None,U)(loc);gl('glVertexAttribPointer',None,U,I,U,U,I,P)(loc,3,0x1406,0,12,None)
enable=gl('glEnable',None,U);disable=gl('glDisable',None,U);depth=gl('glDepthMask',None,U);blend=gl('glBlendFunc',None,U,U)
gl('glViewport',None,I,I,I,I)(0,0,W,W);enable(0x0B71);enable(0x0B44);gl('glCullFace',None,U)(0x0405);enable(0x0BE2);blend(0x0302,0x0303)
# SOL sphere triangles use the same winding and back-face culling as production.
draw=gl('glDrawElements',None,U,I,U,P);read=gl('glReadPixels',None,I,I,I,I,U,U,P)
geterror=gl('glGetError',U)
assert geterror()==0,'setup GL error'
def render(enhanced,phase=0,shadows=True):
 gl('glClearColor',None,F,F,F,F)(.008,.01,.017,1);depth(1);gl('glClear',None,U)(0x4000|0x0100)
 uniform('u_model',D['uniforms']['u_model']);uniform('u_mvp',D['uniforms']['u_mvp']);uniform('u_mode',0)
 uniform('u_cloudPhase',phase);uniform('u_earthWeather',int(not enhanced));uniform('u_earthEnhanced',int(enhanced));uniform('u_earthCloudShadow',int(enhanced and shadows))
 draw(4,len(ind),0x1403,None)
 if enhanced:
  uniform('u_model',D['cloudModel']);uniform('u_mvp',D['cloudMvp']);uniform('u_mode',3);depth(0);draw(4,len(ind),0x1403,None);depth(1)
 gl('glFinish',None)();pixels=np.empty((W,W,4),dtype=np.uint8);read(0,0,W,W,0x1908,0x1401,pixels.ctypes.data)
 assert geterror()==0,'render GL error'
 return Image.fromarray(pixels[::-1,:,:3])
original=render(False);enhanced=render(True);drifted=render(True,.02);unshadowed=render(True,shadows=False)
canvas=Image.new('RGB',(W*2,W+88),(8,10,16));canvas.paste(original,(0,70));canvas.paste(enhanced,(W,70));pd=ImageDraw.Draw(canvas)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';f=ImageFont.truetype(font,22);small=ImageFont.truetype(font,14)
pd.text((25,12),'Original Earth',font=f,fill='white');pd.text((W+25,12),'Enhanced Earth',font=f,fill='white')
pd.text((25,44),'Same NASA maps, camera and Sun direction',font=small,fill='#adb6c4');pd.text((W+25,44),'Darker oceans · 8 km cloud shell · Sun-aligned shadows',font=small,fill='#adb6c4')
pd.text((25,W+64),'Offscreen OpenGL ES software probe · production base shaders / illustrative haze · not a browser qualification',font=small,fill='#adb6c4')
canvas.save(OUT/'comparison.jpg',quality=92)
arrays=[np.array(im,dtype=np.int16) for im in (original,enhanced,drifted,unshadowed)]
# A black ground has no reflected direct light to shadow. Cloud shadows must
# therefore leave its haze contribution unchanged (both passes use identical clouds).
black=np.zeros((1,1,4),dtype=np.uint8);black[:,:,3]=255;texture(0,black,0x8C43)
haze_shadow=np.array(render(True,shadows=True));haze_clear=np.array(render(True,shadows=False))
assert np.array_equal(haze_shadow,haze_clear),'cloud shadows incorrectly attenuate atmospheric haze'
assert np.any(arrays[0]!=arrays[1]),'enhancement has no visible effect'
assert np.any(arrays[1]!=arrays[2]),'cloud phase has no visible effect'
assert np.any(arrays[1]!=arrays[3]),'cloud shadows have no visible effect'
result={'renderer':renderer,'version':version,'shader_sha256':{name:[hashlib.sha256(stage.encode()).hexdigest() for stage in stages] for name,stages in D['programs'].items()},'programs_compiled':list(programs),'width':W,'height':W,
 'changed_pixels':int(np.any(arrays[0]!=arrays[1],axis=2).sum()),'drift_changed_pixels':int(np.any(arrays[1]!=arrays[2],axis=2).sum()),'shadow_changed_pixels':int(np.any(arrays[1]!=arrays[3],axis=2).sum()),
 'scope':'Controlled offscreen OpenGL ES software rendering of production shaders with original NASA maps; base haze path, no browser/native-device qualification.'}
result['source_sha256']={str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [ROOT/'apps/web/textures/reference/earth-land-2004.jpg',ROOT/'apps/web/textures/reference/earth-blue-marble-2002-cloud-layer.png',ROOT/'apps/web/js/earthOceanMask.js']}
(OUT/'gl-probe.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
