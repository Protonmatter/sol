import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhysicalPresenter} from '../../apps/web/js/physicalPresenter.js';

function fixture(){
  const nodes=new Map(),writes=[];
  function node(id){
    if(!nodes.has(id)){
      const attributes=new Map(),data={childNodes:[],hidden:false,value:'',disabled:false,textContent:''};
      nodes.set(id,new Proxy({getAttribute:key=>attributes.get(key),setAttribute:(key,value)=>{writes.push([id,key]);attributes.set(key,value);}}, {
        get:(target,key)=>key in target?target[key]:data[key],
        set:(_target,key,value)=>{writes.push([id,key]);data[key]=value;return true;},
      }));
    }
    return nodes.get(id);
  }
  const state={active:true,selected:'Sun',anchor:'Sun',solarMode:'visible',sunLookPlaying:false,sunLookResolution:256,
    solarPlayback:{playing:false,seconds:0},hdrEnabled:false,terrainStatus:{},terrainRendered:{},opticsStatus:{}};
  const presenter=createPhysicalPresenter({document:{getElementById:node},state,opticalSubject:()=>'',
    solarEuvActive:()=>false,solarPlaybackAvailable:()=>false,linearFrame:()=>false,renderPhenomena:()=>()=>{}});
  return {presenter,state,nodes,writes};
}

test('unchanged physical inspector and playback controls avoid native DOM writes',()=>{
  const f=fixture();f.presenter.present();f.writes.length=0;f.presenter.present();assert.deepEqual(f.writes,[]);
});

test('physical presenter refreshes changed controls and repairs live DOM tampering',()=>{
  const f=fixture();f.presenter.present();f.state.sunLookPlaying=true;f.presenter.present();
  assert.equal(f.nodes.get('orrerySunLookPlay').textContent,'Pause Sun');
  f.nodes.get('orrerySunLookPlay').textContent='stale';f.presenter.present();
  assert.equal(f.nodes.get('orrerySunLookPlay').textContent,'Pause Sun');
});
