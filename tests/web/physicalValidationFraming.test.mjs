import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {terrainReference} from '../../apps/web/js/terrainAssets.js';

const source=fs.readFileSync(new URL('../../tools/physical_rendering_validation.mjs',import.meta.url),'utf8');

async function closeTerrain(initialRadius,{draw=true,body='Mars',displayRadius=.058}={}){
  const state={anchor:body,radius:initialRadius,bodies:[{name:body,x_au:1,y_au:2,z_au:3}]};
  const window={};let repaints=0;
  const document={querySelector:()=>({src:'https://local.test/app.js?v=frame-test'}),
    getElementById:()=>({dispatchEvent:()=>{
      repaints++;
      if(window.__physicalCaptureFraming&&draw)window.__physicalFraming.push(
        {center:[1,2,3],radius:.2,referenceRadiusKm:1234},
        {center:body==='Moon'?[1.2,2.3,3.1]:[1,2,3],radius:displayRadius,
          referenceRadiusKm:Math.fround(terrainReference(body).referenceRadiusKm)});
    }})};
  const context=vm.createContext({URL,Event,window,document});
  const store=new vm.SyntheticModule(['store'],function(){this.setExport('store',{orrery:state});},{context});
  await store.link(()=>{});await store.evaluate();
  const terrain=new vm.SyntheticModule(['terrainReference'],function(){this.setExport('terrainReference',terrainReference);},{context});
  await terrain.link(()=>{});await terrain.evaluate();
  const start=source.indexOf('async function paintAction('),end=source.indexOf('async function waitReady(',start);
  const module=new vm.SourceTextModule('export '+source.slice(start,end),{context,
    importModuleDynamically:specifier=>{
      if(specifier==='./js/terrainAssets.js?v=frame-test')return terrain;
      assert.equal(specifier,'./js/store.js?v=frame-test');return store;
    }});
  await module.link(()=>{});await module.evaluate();
  context.page={evaluate:async(callback,...args)=>callback(...args)};
  await module.namespace.paintAction('close-terrain');
  return {state,window,repaints};
}

test('terrain qualification close-up uses the observed body draw scale regardless of prior framing',async()=>{
  for(const initialRadius of [.906,.317,2]){
    const {state,window,repaints}=await closeTerrain(initialRadius);
    assert.ok(Math.abs(state.radius-.058*1.1)<1e-12,'close-up must request level 4 independently of previous system framing');
    assert.equal(repaints,2,'capture a current draw before repainting the close-up');
    assert.equal(window.__physicalCaptureFraming,false);
  }
});

test('Moon framing identifies its terrain draw even when display separation moves its physical center',async()=>{
  const {state}=await closeTerrain(.5,{body:'Moon',displayRadius:.022});
  assert.ok(Math.abs(state.radius-.022*1.1)<1e-12);
});

test('missing observed body scale fails qualification without guessing a camera distance',async()=>{
  await assert.rejects(closeTerrain(.906,{draw:false}),/terrain.*draw|draw.*scale/i);
});

test('framing records terrain ground draws and ignores transparent shells with retained terrain uniforms',()=>{
  const window={__physicalCaptureFraming:true,__physicalFraming:[],__physicalTerrainDraws:[]};
  const p={drawElements(){}};
  const first=source.indexOf('    const drawElements=p.drawElements;');
  const last=source.indexOf('    p.getShaderParameter=function',first);
  assert.ok(first>0&&last>first,'actual validator draw hook boundaries');
  vm.runInNewContext(source.slice(first,last),{window,p});
  const groundRadius=.022,shellRadius=.075*1.015;
  for(const mode of [0,2,4]){
    const radius=mode===0?groundRadius:shellRadius;
    const uniforms={u_mode:mode,u_terrainShadowEnabled:1,u_terrainShape:[1737.4,1728,1747,.5],
      u_model:[radius,0,0,0,0,radius,0,0,0,0,radius,0,1,2,3,1]};
    const gl={CURRENT_PROGRAM:1,getParameter:()=>({}),getUniformLocation:(_program,name)=>name,
      getUniform:(_program,name)=>uniforms[name]};
    p.drawElements.call(gl,4,27072,5123,0);
  }
  assert.equal(window.__physicalFraming.length,1,'stale shadow uniforms on a shell must not identify a terrain body');
  assert.equal(window.__physicalFraming[0].radius,groundRadius);
});
