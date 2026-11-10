import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSphere} from '../../apps/web/js/orreryMath.js';
import {SPHERE_MESH_LEVELS,SPHERE_BASE_LEVEL,SPHERE_PIXEL_LIMIT,sphereRadialError,
  sphereMeshLevel,sphereOutsideClip,sphereMeshEligible,validateUnitSpherePositions} from '../../apps/web/js/sphereMeshPolicy.js';
const matrix=k=>{const m=new Float32Array(16);m[0]=k;m[5]=k;m[15]=1;return m;};

test('fixed levels retain the original48sphere and refine monotonically at device resolution',()=>{
 assert.deepEqual(SPHERE_MESH_LEVELS,[8,12,16,24,32,48]);assert.ok(Object.isFrozen(SPHERE_MESH_LEVELS));
 assert.equal(SPHERE_BASE_LEVEL,48);assert.equal(SPHERE_PIXEL_LIMIT,0.03);
 for(const [scale,level]of [[.001,8],[.002,12],[.004,16],[.008,24],[.014,32],[.024,48]])assert.equal(sphereMeshLevel(matrix(scale),1024,1024),level,'scale '+scale);
 assert.equal(sphereMeshLevel(matrix(.001),2048,2048),12,'backing pixels include DPI');
});

test('radial allowances cover each actual generated grid without treating Float32 triangles as convex',()=>{
 let previous=Infinity;
 for(const n of SPHERE_MESH_LEVELS){const data=buildSphere(n,2*n);assert.equal(validateUnitSpherePositions(data.pos),true);const e=sphereRadialError(n);assert.ok(e>0&&e<previous);previous=e;
  for(let i=0;i<data.pos.length;i+=3){const norm=Math.hypot(data.pos[i],data.pos[i+1],data.pos[i+2]);assert.ok(Math.abs(norm-1)<1e-6);}}
 assert.throws(()=>sphereRadialError(10),RangeError);
 assert.equal(validateUnitSpherePositions(new Float32Array([0,0,2])),false);
 assert.equal(validateUnitSpherePositions(new Float32Array([0,0,Number.NaN])),false);
 assert.equal(validateUnitSpherePositions(new Float32Array([1e-40,0,1])),false,'subnormal attributes need a different proof');
});

test('normal coefficients producing subnormal products retain base rather than false subpixel admission',()=>{
 const m=new Float32Array(16);m[0]=m[5]=1.4e-38;m[15]=1e-36;
 assert.ok(m[0]>=2**-126);assert.ok(Math.fround(.5*m[0])>0&&Math.fround(.5*m[0])<2**-126);
 assert.equal(sphereMeshLevel(m,1024,1024),48,'absolute FTZ term is required in addition to gamma7');
 const tiny=matrix(.002);for(let i=0;i<16;i++)tiny[i]*=2**-120;
 assert.equal(sphereMeshLevel(tiny,1024,1024),48);
});

test('ordinary homogeneous scaling retains the level while uncertain matrices and viewports retain base',()=>{
 const m=matrix(.004),scaled=Float32Array.from(m,x=>x*1024);assert.equal(sphereMeshLevel(m,1024,1024),sphereMeshLevel(scaled,1024,1024));
 for(const value of [null,[],new Float32Array(15),Array(16).fill(Number.NaN),Array(16).fill(Infinity)])assert.equal(sphereMeshLevel(value,1024,1024),48);
 for(const [w,h]of [[0,1024],[-1,1024],[1024,Infinity],[1024,NaN],[.5,1024]])assert.equal(sphereMeshLevel(m,w,h),48);
 const overflow=matrix(.001);overflow[0]=1e21;assert.equal(sphereMeshLevel(overflow,1024,1024),48);
 const unrounded=Array.from(m);unrounded[0]=1/3;assert.equal(sphereMeshLevel(unrounded,1024,1024),48,'caller must supply actual uploaded Float32 values');
});

test('eye, near and far intersections retain the original mesh',()=>{
 const behind=matrix(.001);behind[15]=-1;assert.equal(sphereMeshLevel(behind,1024,1024),48);
 const eye=matrix(.001);eye[3]=1;eye[15]=.5;assert.equal(sphereMeshLevel(eye,1024,1024),48);
 for(const z of [-1,1]){const clip=matrix(.001);clip[10]=.1;clip[14]=z*.9;assert.equal(sphereMeshLevel(clip,1024,1024),48);}
});

test('unit-box clipping rejects only a strict common outside halfspace',()=>{
 const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);assert.equal(sphereOutsideClip(identity),false);
 for(const row of [0,1,2])for(const sign of [-1,1]){const m=identity.slice();m[12+row]=sign*3;assert.equal(sphereOutsideClip(m),true);m[12+row]=sign*2;assert.equal(sphereOutsideClip(m),false,'tangent');m[12+row]=sign*(2+2**-20);assert.equal(sphereOutsideClip(m),false,'numeric margin');m[12+row]=sign*1.5;assert.equal(sphereOutsideClip(m),false,'partly visible');}
 const behind=identity.slice();behind[15]=-3;assert.equal(sphereOutsideClip(behind),true);
 for(const m of [null,new Float32Array(15),Float32Array.from(identity,x=>x*Infinity)])assert.equal(sphereOutsideClip(m),false,'uncertainty means draw');
 const cancellation=identity.slice();cancellation[12]=cancellation[15]=1e19;assert.equal(sphereOutsideClip(cancellation),false);
});

test('all protected appearance and material paths retain full geometry',()=>{
 const base={name:'Mars',selected:'Sun',anchor:'Sun'};assert.equal(sphereMeshEligible(base),true);
 for(const name of ['Earth','Sun','Moon','Titan'])assert.equal(sphereMeshEligible({...base,name}),false);
 for(const field of ['terrain','physical','special'])assert.equal(sphereMeshEligible({...base,[field]:true}),false);
 assert.equal(sphereMeshEligible({...base,selected:'Mars'}),false);assert.equal(sphereMeshEligible({...base,anchor:'Mars'}),false);
 assert.equal(sphereMeshEligible({...base,name:'Io',moon:true,mappedMoon:true}),false);
 assert.equal(sphereMeshEligible({...base,name:'Io',moon:true,mappedMoon:false}),true);
 assert.equal(sphereMeshEligible({...base,mappedMoon:true,moon:false}),true,'planet texture is not mistaken for mapped-moon protection');
 assert.equal(sphereMeshEligible({name:''}),false);
});
