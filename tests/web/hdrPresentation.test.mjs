import assert from 'node:assert/strict';
import test from 'node:test';
import { createHdrPresentation, presentationColor } from '../../apps/web/js/hdrPresentation.js';

function graphics(options={}) {
  let id=0,bound=null,readValue=0,allocations=0;
  const live=new Set(),draws=[];
  const resource=()=>{allocations++;if(allocations===options.failAllocation)return null;const r={id:++id};live.add(r);return r;};
  const gl={
    FRAMEBUFFER:1,FRAMEBUFFER_COMPLETE:2,COLOR_ATTACHMENT0:3,DEPTH_ATTACHMENT:4,RENDERBUFFER:5,
    TEXTURE_2D:6,RGBA16F:7,RGBA:8,HALF_FLOAT:9,FLOAT:10,NEAREST:11,CLAMP_TO_EDGE:12,
    TEXTURE_MIN_FILTER:13,TEXTURE_MAG_FILTER:14,TEXTURE_WRAP_S:15,TEXTURE_WRAP_T:16,
    DEPTH_COMPONENT24:17,MAX_TEXTURE_SIZE:18,MAX_RENDERBUFFER_SIZE:19,VERTEX_SHADER:20,FRAGMENT_SHADER:21,
    COMPILE_STATUS:22,LINK_STATUS:23,NO_ERROR:0,COLOR:24,SCISSOR_TEST:25,DEPTH_TEST:26,BLEND:27,CULL_FACE:28,
    TEXTURE0:100,TRIANGLES:29,
    getExtension:()=>options.extension===false?null:{},getParameter:()=>4096,
    createTexture:resource,createRenderbuffer:resource,createFramebuffer:resource,createShader:resource,
    createProgram:resource,createVertexArray:resource,
    deleteTexture:r=>live.delete(r),deleteRenderbuffer:r=>live.delete(r),deleteFramebuffer:r=>live.delete(r),
    deleteShader:r=>live.delete(r),deleteProgram:r=>live.delete(r),deleteVertexArray:r=>live.delete(r),
    bindFramebuffer:(_target,r)=>{bound=r;},checkFramebufferStatus:()=>options.incomplete?0:2,
    getShaderParameter:()=>!options.compileFailure,getProgramParameter:()=>!options.linkFailure,
    getShaderInfoLog:()=>'',getProgramInfoLog:()=>'',getUniformLocation:(_p,name)=>name,
    clearBufferfv:(_target,_index,value)=>{readValue=value[0];},
    readPixels:(_x,_y,_w,_h,_format,_type,result)=>result.set([options.clamped?Math.min(1,readValue):readValue,readValue,readValue,1]),
    getError:()=>0,isContextLost:()=>!!options.lost,
    drawArrays:()=>draws.push({framebuffer:bound}),
  };
  for(const name of ['bindTexture','texImage2D','texParameteri','bindRenderbuffer','renderbufferStorage',
    'framebufferTexture2D','framebufferRenderbuffer','shaderSource','compileShader','attachShader','linkProgram',
    'bindVertexArray','useProgram','viewport','disable','enable','scissor','colorMask','depthMask','activeTexture','uniform1i','uniform1f'])gl[name]=()=>{};
  return {gl,live,draws,options};
}
const identity=(serial=1)=>({generation:7,epoch:1800000000.25,serial});

test('HDR transfer uses one declared exposure, retains highlights and rejects invalid values',()=>{
  assert.deepEqual(presentationColor([0,0,0],1),[0,0,0]);
  // Independently evaluated with Python Decimal at 50 digits.
  for(const [x,want] of [[.18,.4269461334637898],[1,.7353569830524495],[4,.9063317533440594],[16,.973684197934574]]) {
    assert.ok(Math.abs(presentationColor([x,x,x],1)[0]-want)<1e-12);
  }
  assert.deepEqual(presentationColor([1,2,4],0),[0,0,0]);
  assert.deepEqual(presentationColor([.25,.25,.25],4),presentationColor([1,1,1],1));
  for(const input of [[NaN,0,0],[Infinity,0,0],[-Infinity,0,0]])assert.throws(()=>presentationColor(input,1));
  for(const exposure of [NaN,Infinity,-1])assert.throws(()=>presentationColor([1,1,1],exposure));
});

test('HDR presents only the exact current producer, once, to the default framebuffer',()=>{
  const h=graphics(),p=createHdrPresentation(h.gl,{generation:7,maxBytes:64*1024*1024});
  assert.equal(p.resize(800,600).state,'ready');
  assert.equal(p.status().estimatedBytes,800*600*12);
  assert.equal(p.beginFrame(identity()),true);
  assert.equal(p.present({exposure:1,frameIdentity:{...identity(),epoch:0}}),false);
  assert.equal(h.draws.length,0);
  assert.equal(p.present({exposure:1,frameIdentity:identity()}),true);
  assert.deepEqual(h.draws,[{framebuffer:null}]);
  assert.equal(p.present({exposure:1,frameIdentity:identity()}),false);
  assert.equal(p.beginFrame(identity()),false,'a presented serial cannot be reused');
  assert.equal(p.beginFrame({...identity(2),generation:8}),false);
  assert.equal(p.beginFrame({...identity(2),epoch:1e100}),false,'unrepresentable GPU epoch is rejected before binding');
  assert.equal(p.beginFrame(identity(2)),true);
  assert.equal(p.beginFrame(identity(2)),false,'a pending producer serial cannot be reused');
  assert.equal(p.present({exposure:Infinity,frameIdentity:identity(2)}),false);
  assert.equal(h.draws.length,1);
  p.dispose();p.dispose();assert.equal(h.live.size,0);
});

test('HDR allocation admission releases partial groups, rejects clamped float storage and never downscales',()=>{
  for(const options of [{extension:false},{incomplete:true},{failAllocation:2},{compileFailure:true},{linkFailure:true},{clamped:true}]){
    const h=graphics(options),p=createHdrPresentation(h.gl,{generation:7});
    assert.equal(p.resize(800,600).state,'unavailable',JSON.stringify(options));
    assert.equal(h.live.size,0,JSON.stringify(options));
    assert.equal(p.beginFrame(identity()),false);
    p.dispose();assert.equal(h.live.size,0);
  }
  const h=graphics(),p=createHdrPresentation(h.gl,{generation:7,maxBytes:1000});
  assert.equal(p.resize(10,10).state,'unavailable');assert.equal(h.live.size,0);
  const q=createHdrPresentation(h.gl,{generation:7});
  assert.equal(q.resize(2049,1).state,'unavailable');assert.equal(h.live.size,0);
});

test('resize, empty view and context loss invalidate pending producers and release allocations',()=>{
  const h=graphics(),p=createHdrPresentation(h.gl,{generation:7});
  for(let cycle=0;cycle<3;cycle++){
    assert.equal(p.resize(20,10).state,'ready');p.beginFrame(identity(cycle+1));
    assert.equal(p.resize(10,20).state,'ready');
    assert.equal(p.present({exposure:1,frameIdentity:identity(cycle+1)}),false);
    assert.equal(p.resize(0,0).state,'deferred');assert.equal(h.live.size,0);
  }
  p.resize(10,10);h.options.lost=true;
  assert.equal(p.beginFrame(identity(5)),false);p.dispose();assert.equal(h.live.size,0);
});
