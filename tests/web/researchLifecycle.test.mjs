import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';

test('first Research entry selects model; destination reentry preserves the chosen channel',async()=>{
  const store={wavelength:'continuum'},calls=[];
  const bindings={store,TOUR_STEPS:[],controls:{},clamp(){},renderAll:()=>calls.push('render'),updateModeButtons(){},
    loadState:()=>{calls.push('load');return Promise.resolve();},setWavelength:value=>{store.wavelength=value;calls.push(value);},
    setTimelineFrame(){},goLive(){},togglePlay(){},runLiveEngine(){},stopPlay(){},cancelLiveEngine(){},stepTimeline(){},
    startTour(){},endTour(){},showTourStep(){},buildWavelengthBar(){},buildSunCutaway(){},nearestSeriesFrame(){},openInspector(){}};
  const context=vm.createContext({document:{getElementById:()=>null,addEventListener(){}},window:{addEventListener(){}}});
  const [research]=await loadSourceModules(context,[new URL('../../apps/web/js/research.js',import.meta.url)],{
    resolveImport:(_,url)=>{
      if(url.pathname.endsWith('/researchView.js'))return {};
      if(url.pathname.endsWith('/butterflyGeometry.js'))return undefined;
      return bindings;
    },
  });
  research.enterResearch();assert.equal(store.wavelength,'model');assert.equal(calls.filter(value=>value==='load').length,1);
  store.wavelength='aia171';research.leaveResearch();research.enterResearch();assert.equal(store.wavelength,'aia171');assert.equal(calls.filter(value=>value==='load').length,1);
  research.selectResearchModel();assert.equal(store.wavelength,'model');
});
