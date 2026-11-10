import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSphere} from '../../apps/web/js/orreryMath.js';
import {validateUnitSpherePositions} from '../../apps/web/js/sphereMeshPolicy.js';
import {createSphereMeshPool} from '../../apps/web/js/sphereMeshPool.js';
const matrix=()=>new Float32Array([.001,0,0,0,0,.001,0,0,0,0,0,0,0,0,0,1]);
function fixture({failCreate=0,failUpload=0,errorUpload=0,initialError=0,deleteThrows=false,restoreError=false,restoreThrow=false,invalidateBase=false}={}){
 const gl={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,UNSIGNED_SHORT:5123,NO_ERROR:0,OUT_OF_MEMORY:1285,
  created:[],deleted:[],uploads:[],bindings:new Map(),error:initialError,lost:false,attempts:0,deleteThrows,contextGeneration:1,restoreFaultUsed:false,
  createBuffer(){const n=++this.attempts;if(n===failCreate)return null;const buffer={n,context:this,ownerGeneration:this.contextGeneration};this.created.push(buffer);return buffer;},
  isBuffer(buffer){return !!buffer&&buffer.target!==undefined&&buffer.context===this&&buffer.ownerGeneration===this.contextGeneration&&!buffer.deleted&&!this.deleted.includes(buffer)&&!this.lost;},
  bindBuffer(target,buffer){
   if(buffer?.base&&this.created.length===6&&!this.restoreFaultUsed&&(restoreError||restoreThrow)){
    this.restoreFaultUsed=true;if(restoreThrow)throw Error('controlled base restoration throw');this.error=1282;return;
   }
   if(buffer&&(buffer.context!==this||buffer.ownerGeneration!==this.contextGeneration||buffer.deleted||this.deleted.includes(buffer)||(buffer.target!==undefined&&buffer.target!==target))){this.error=1282;return;}
   if(buffer)buffer.target=target;this.bindings.set(target,buffer);
  },
  bufferData(target,data,usage){const n=this.uploads.length+1;this.uploads.push({target,data:data.slice(),usage,buffer:this.bindings.get(target)});if(n===failUpload)throw Error('controlled upload failure');if(n===errorUpload)this.error=this.OUT_OF_MEMORY;if(n===6&&invalidateBase)this.base.pos.deleted=true;},
  getError(){const error=this.error;this.error=0;return error;},
  deleteBuffer(buffer){if(this.deleteThrows)throw Error('controlled cleanup failure');assert.ok(!this.deleted.includes(buffer),'doubledelete');this.deleted.push(buffer);},
  isContextLost(){return this.lost;},
 };
 const base={pos:{base:'pos',context:gl,ownerGeneration:1,target:gl.ARRAY_BUFFER},idx:{base:'idx',context:gl,ownerGeneration:1,target:gl.ELEMENT_ARRAY_BUFFER},count:27648};gl.base=base;
 gl.bindings.set(gl.ARRAY_BUFFER,base.pos);gl.bindings.set(gl.ELEMENT_ARRAY_BUFFER,base.idx);
 const geometry=buildSphere(48,96);
 const make=(generation=1)=>{const pool=createSphereMeshPool({gl,base,baseGeometry:geometry,buildSphere,generation});pool.initialize();return pool;};
 return{gl,base,geometry,make};
}

test('fixed pool borrows the base positions and owns exactly six bounded buffers',()=>{
 const {gl,base,make}=fixture(),pool=make();assert.equal(pool.ready,true);assert.equal(gl.created.length,6);
 assert.equal(pool.stats().optionalBufferBytes,75276);assert.equal(pool.stats().totalBufferBytes,187608);assert.equal(pool.stats().levelCount,6);
 const coarse=pool.select(matrix(),1024,1024,true,gl,1);assert.equal(coarse.stacks,8);assert.equal(coarse.pos,base.pos);assert.equal(coarse.count,768);
 const medium=matrix();medium[0]=medium[5]=.014;const level32=pool.select(medium,1024,1024,true,gl,1);
 assert.equal(level32.stacks,32);assert.notEqual(level32.pos,base.pos);assert.equal(level32.count,12288);
 assert.equal(pool.select(matrix(),1024,1024,false,gl,1),base);
 assert.equal(gl.bindings.get(gl.ARRAY_BUFFER),base.pos);assert.equal(gl.bindings.get(gl.ELEMENT_ARRAY_BUFFER),base.idx);
 const seen=new Set();for(const u of gl.uploads){assert.ok(u.buffer);assert.ok(!seen.has(u.buffer));seen.add(u.buffer);if(u.target===gl.ELEMENT_ARRAY_BUFFER)for(const i of u.data)assert.ok(i>=0&&i<4753);}
 // Verify the actual triangle positions against independently generated coarse
 // grids, including winding/seams; an in-range but wrong stride must fail.
 for(const [scale,n]of [[.001,8],[.002,12],[.004,16],[.008,24],[.014,32]]){
  const m=matrix();m[0]=m[5]=scale;const mesh=pool.select(m,1024,1024,true,gl,1),reference=buildSphere(n,2*n);
  const indices=gl.uploads.find(u=>u.buffer===mesh.idx).data;
  const positions=mesh.pos===base.pos?buildSphere(48,96).pos:gl.uploads.find(u=>u.buffer===mesh.pos).data;
  assert.equal(indices.length,reference.idx.length);
  for(let i=0;i<indices.length;i++)for(let axis=0;axis<3;axis++)assert.equal(positions[indices[i]*3+axis],reference.pos[reference.idx[i]*3+axis]);
 }
 const report=pool.dispose();assert.equal(report.pendingBuffers,0);assert.equal(gl.deleted.length,6);assert.ok(!gl.deleted.includes(base.pos)&&!gl.deleted.includes(base.idx));
 assert.equal(pool.select(matrix(),1024,1024,true,gl,1),null);assert.equal(pool.stats().optionalBufferBytes,0);
 pool.dispose();assert.equal(gl.deleted.length,6,'idempotent disposal');
});

for(let n=1;n<=6;n++)test('allocation failure '+n+' publishes no partial mesh and cleans only owned handles',()=>{
 const {gl,base,make}=fixture({failCreate:n}),pool=make();assert.equal(pool.ready,false);assert.equal(pool.select(matrix(),1024,1024,true,gl,1),null);
 assert.equal(gl.created.length,n-1);assert.equal(gl.deleted.length,n-1);assert.equal(pool.stats().levelCount,0);assert.equal(pool.stats().ownedBuffers,0);
 assert.equal(gl.bindings.get(gl.ARRAY_BUFFER),base.pos);assert.equal(gl.bindings.get(gl.ELEMENT_ARRAY_BUFFER),base.idx);assert.equal(pool.failure.phase,'allocation');
});
for(const kind of ['failUpload','errorUpload'])for(let n=1;n<=6;n++)test(kind+' '+n+' is observable, atomic and leaves usable base bindings',()=>{
 const {gl,base,make}=fixture({[kind]:n}),pool=make();assert.equal(pool.ready,false);assert.equal(pool.select(matrix(),1024,1024,true,gl,1),null);
 assert.equal(gl.deleted.length,gl.created.length);assert.equal(pool.stats().ownedBuffers,0);assert.equal(pool.stats().levelCount,0);
 assert.equal(gl.bindings.get(gl.ARRAY_BUFFER),base.pos);assert.equal(gl.bindings.get(gl.ELEMENT_ARRAY_BUFFER),base.idx);assert.ok(pool.failure.message);
 if(kind==='errorUpload')assert.equal(pool.failure.code,1285);
});

test('preexisting base setup errors stay fatal instead of being swallowed by optional fallback',()=>{
 const {gl,make}=fixture({initialError:1285});assert.throws(make,/before optional sphere|base graphics/i);assert.equal(gl.created.length,0);
});

test('loss abandons handles without GL calls; restored same-object contexts reject old generations',()=>{
 const {gl,base,make}=fixture(),old=make(1);gl.lost=true;const calls=gl.deleted.length;old.abandon();assert.equal(gl.deleted.length,calls);assert.equal(old.stats().ownedBuffers,0);
 assert.equal(old.select(matrix(),1024,1024,true,gl,1),null);gl.lost=false;
 gl.contextGeneration=2;const restoredBase={pos:{base:'pos-restored',context:gl,ownerGeneration:2,target:gl.ARRAY_BUFFER},idx:{base:'idx-restored',context:gl,ownerGeneration:2,target:gl.ELEMENT_ARRAY_BUFFER},count:27648};
 const current=createSphereMeshPool({gl,base:restoredBase,baseGeometry:buildSphere(48,96),buildSphere,generation:2});current.initialize();assert.equal(current.ready,true);assert.equal(old.select(matrix(),1024,1024,true,gl,2),null);
 assert.equal(current.select(matrix(),1024,1024,true,gl,1),null);assert.equal(current.select(matrix(),1024,1024,true,{},2),null);
 assert.equal(old.select(matrix(),1024,1024,true,gl,2)||restoredBase,restoredBase,'caller chooses its CURRENT base rather than a stale pool base');current.dispose();
});

test('failed cleanup is retained for retry and never becomes a draw record',()=>{
 const {gl,make}=fixture({failUpload:2,deleteThrows:true}),pool=make();assert.equal(pool.ready,false);assert.equal(pool.stats().ownedBuffers,2);
 assert.equal(pool.failure.cleanupErrors.length,2);assert.equal(pool.select(matrix(),1024,1024,true,gl,1),null);
 gl.deleteThrows=false;assert.equal(pool.dispose().pendingBuffers,0);assert.equal(gl.deleted.length,2);pool.dispose();assert.equal(gl.deleted.length,2);
});

test('invalid optional32 geometry falls back atomically; invalid base never becomes an alleged fallback',()=>{
 const f=fixture(),bad=()=>{const data=buildSphere(32,64);data.pos[3]=Number.NaN;return data;};
 const pool=createSphereMeshPool({gl:f.gl,base:f.base,baseGeometry:f.geometry,buildSphere:bad,generation:1});pool.initialize();assert.equal(pool.ready,false);assert.equal(f.gl.deleted.length,f.gl.created.length);
 const b=fixture();b.geometry.pos[0]=2;assert.throws(b.make,/base sphere/i);assert.equal(b.gl.created.length,0);
});

test('grid correspondence enforces a Euclidean vertex allowance rather than three separate allowances',()=>{
 const f=fixture(),bad=()=>{const data=buildSphere(32,64),k=(16*65+8)*3;data.pos[k]+=9e-7;data.pos[k+1]-=9e-7;assert.equal(validateUnitSpherePositions(data.pos),true);return data;};
 const pool=createSphereMeshPool({gl:f.gl,base:f.base,baseGeometry:f.geometry,buildSphere:bad,generation:1});pool.initialize();
 assert.equal(pool.ready,false,'tangential error exceeds1e-6 even though each coordinate error is below1e-6');
 assert.equal(f.gl.deleted.length,f.gl.created.length);
 const b=fixture(),k=(24*97+12)*3;b.geometry.pos[k]+=9e-7;b.geometry.pos[k+1]-=9e-7;
 assert.equal(validateUnitSpherePositions(b.geometry.pos),true);assert.throws(b.make,/base sphere/i);
});

for(const kind of ['foreign','deleted','stale-generation','wrong-target','never-bound'])test('invalid current base '+kind+' is rejected before optional allocation',()=>{
 const f=fixture();if(kind==='foreign')f.base.pos.context={};if(kind==='deleted')f.base.pos.deleted=true;if(kind==='stale-generation')f.gl.contextGeneration=2;if(kind==='wrong-target')f.base.pos=f.base.idx;if(kind==='never-bound'){delete f.base.pos.target;f.gl.bindings.set(f.gl.ARRAY_BUFFER,null);}
 assert.throws(f.make,/base sphere|base graphics/i);assert.equal(f.gl.created.length,0);assert.equal(f.gl.deleted.length,0);
});
for(const option of ['restoreError','restoreThrow','invalidateBase'])test('base restoration '+option+' cannot publish a ready pool and cleans owned buffers',()=>{
 const f=fixture({[option]:true});
 assert.throws(f.make,/base sphere|restor/i);
 assert.equal(f.gl.created.length,6);assert.equal(f.gl.deleted.length,6,'fatal restoration must not lose optional allocations');
 assert.ok(!f.gl.deleted.includes(f.base.pos)&&!f.gl.deleted.includes(f.base.idx));
});

test('the controller retains failed-cleanup ownership even when mandatory restoration throws',()=>{
 const f=fixture({restoreThrow:true,deleteThrows:true}),pool=createSphereMeshPool({gl:f.gl,base:f.base,baseGeometry:f.geometry,buildSphere,generation:1});
 assert.equal(pool.ready,false);assert.equal(f.gl.created.length,0);
 assert.throws(()=>pool.initialize(),/base sphere|restor/i);assert.equal(pool.ready,false);assert.equal(pool.failure.phase,'base');assert.equal(pool.stats().ownedBuffers,6);
 assert.equal(pool.select(matrix(),1024,1024,true,f.gl,1),null);f.gl.deleteThrows=false;
 assert.equal(pool.dispose().pendingBuffers,0);assert.equal(f.gl.deleted.length,6);
});
test('initialization is one-shot and cannot allocate again after ready or disposal',()=>{
 const f=fixture(),pool=createSphereMeshPool({gl:f.gl,base:f.base,baseGeometry:f.geometry,buildSphere,generation:1});
 assert.equal(pool.select(matrix(),1024,1024,true,f.gl,1),null);assert.equal(pool.initialize(),true);assert.equal(pool.initialize(),true);assert.equal(f.gl.created.length,6);
 pool.dispose();assert.equal(pool.initialize(),false);assert.equal(f.gl.created.length,6);
});
