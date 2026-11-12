import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';
import {nearestSeriesFrame,seriesPosition} from '../../apps/web/js/seriesModel.js';
async function check(dpr,cssWidth,index){
const store={seriesFrames:Array.from({length:25},()=>({active_regions:[]})),seriesRecords:Array.from({length:25},(_,i)=>({months:i,index:i})),timelineIndex:index};
let click,selected;const lines=[];
const ctx=new Proxy({moveTo:(x,y)=>lines.push([x,y])},{get:(t,k)=>t[k]??(()=>{})});
const canvas={width:0,height:0,getBoundingClientRect:()=>({left:0,top:0,width:cssWidth,height:150}),getContext:()=>ctx,addEventListener:(name,fn)=>{if(name==='click')click=fn}};
const bindings={store,TOUR_STEPS:[],controls:{},text(){},clamp:(x,l,h)=>Math.max(l,Math.min(h,x)),hash01(){},selectedRegion(){},currentBaseImage(){},projectSolarPoint(){},regionAnchor(){},confidenceEncoding(){},seriesPosition,updateWavelengthCaption(){},renderAll(){},updateModeButtons(){},loadState(){},setWavelength(){},setTimelineFrame:i=>{selected=i},goLive(){},togglePlay(){},runLiveEngine(){},stopPlay(){},cancelLiveEngine(){},stepTimeline(){},startTour(){},endTour(){},showTourStep(){},buildWavelengthBar(){},buildSunCutaway(){},nearestSeriesFrame,openInspector(){}};

 const context=vm.createContext({document:{getElementById:id=>id==='butterflyCanvas'?canvas:null,addEventListener(){}},window:{devicePixelRatio:dpr,addEventListener(){}}});
 const [render]=await loadSourceModules(context,[new URL('../../apps/web/js/render.js',import.meta.url),new URL('../../apps/web/js/research.js',import.meta.url)],{resolveImport:(_,url)=>url.pathname.endsWith('/butterflyGeometry.js')?undefined:bindings});
 lines.length=0;render.drawButterfly();const plottedX=lines[3][0];
 click({currentTarget:canvas,clientX:plottedX/(canvas.width/cssWidth),clientY:30});
 assert.equal(selected,index,'Clicking the plotted frame must select it');
}
for(const [dpr,width] of [[1,320],[2,320],[2,1000]])for(const index of [0,12,24])test(`butterfly click selects frame ${index} at DPR ${dpr}, width ${width}`,()=>check(dpr,width,index));
