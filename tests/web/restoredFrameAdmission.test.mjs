import assert from 'node:assert/strict';
import test from 'node:test';
import {PNG} from 'pngjs';
import {assertRestoredFrame,measureCanvasFrame} from '../../tools/restored_frame_admission.mjs';

function png(width,height,paint){
  const image=new PNG({width,height});
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,[r,g,b]=paint(x,y);image.data.set([r,g,b,255],i);
  }
  return PNG.sync.write(image);
}

test('the exact blank capture the old gate admitted is rejected',()=>{
  const blank=PNG.sync.write(new PNG({width:4,height:4,colorType:2}));
  assert.throws(()=>assertRestoredFrame(blank),/blank or uniform/);
});

test('a cleared but never-drawn canvas of any flat colour is rejected',()=>{
  for(const colour of [[0,0,0],[12,14,20],[128,128,128],[255,255,255]])
    assert.throws(()=>assertRestoredFrame(png(96,64,()=>colour)),/blank or uniform/,String(colour));
});

test('a single stray pixel cannot pass as a restored frame',()=>{
  const frame=png(96,64,(x,y)=>x===40&&y===30?[255,255,255]:[0,0,0]);
  assert.throws(()=>assertRestoredFrame(frame),/blank or uniform/);
});

test('a shaded body on space is admitted and its measurements are reported',()=>{
  const frame=png(128,96,(x,y)=>{
    const dx=(x-64)/36,dy=(y-48)/36,r2=dx*dx+dy*dy;
    if(r2>1)return [2,3,6];
    const shade=Math.sqrt(1-r2)*(0.55+0.45*(x-28)/72);
    return [Math.round(200*shade),Math.round(90*shade),Math.round(50*shade)];
  });
  const measured=assertRestoredFrame(frame);
  assert.ok(measured.distinctLevels>=8);assert.ok(measured.lumaStdDev>2);
  assert.equal(measured.pixels,128*96);
});

test('a corrupt capture fails closed rather than being admitted',()=>{
  assert.throws(()=>assertRestoredFrame(Buffer.from('not a png')));
  assert.equal(measureCanvasFrame(png(8,8,()=>[0,0,0])).distinctLevels,1);
});

test('restored readiness without an observed replacement-context body draw is rejected',async()=>{
  const {assertReplacementContextDraw}=await import('../../tools/restored_frame_admission.mjs');
  const drawn={count:95616,terrainShadow:1,contextLost:false};
  for(const [label,draws] of [['missing',undefined],['none recorded',[]],
    ['only unshadowed draws',[{...drawn,terrainShadow:0}]],['lost-context draws',[{...drawn,contextLost:true}]],
    ['empty draws',[{...drawn,count:0}]],['untyped flags',[{...drawn,contextLost:undefined}]]])
    assert.throws(()=>assertReplacementContextDraw(draws),/draw/,label);
  assert.deepEqual(assertReplacementContextDraw([{...drawn,terrainShadow:0},drawn,{...drawn,count:783360}]),
    {recorded:3,live:3,body:2,maxBodyIndexCount:783360});
});
