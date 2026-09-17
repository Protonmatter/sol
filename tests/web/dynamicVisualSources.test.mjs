import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";
import { BASE_IMAGES } from "../../apps/web/js/config.js";

async function harness(url) {
  const images = [];
  const store = { timelineIndex: -1, liveEngineRun: false, wavelength: "continuum" };
  const context = vm.createContext({ Image: class { constructor() { images.push(this); this.complete = true; this.naturalWidth = 1024; } }, window: {}, Event: class {} });
  const [data] = await loadSourceModules(context, [new URL("../../apps/web/js/data.js", import.meta.url)], {
    resolveImport: (_specifier, resolved) => {
      if (resolved.pathname.endsWith("/store.js")) return { store };
      if (resolved.pathname.endsWith("/config.js")) return { FALLBACK_STATE: {}, BASE_IMAGES: { continuum: { ...BASE_IMAGES.continuum, url } } };
      if (resolved.pathname.endsWith("/view.js")) return { renderAll() {} };
      if (resolved.pathname.endsWith("/tour.js")) return { maybeAutoStartTour() {} };
      if (resolved.pathname.endsWith("/dataBundle.js")) return { readDataBundle() {} };
      if (resolved.pathname.endsWith("/timeline.js")) return { prepareBundlePublication() {} };
    },
  });
  return { data, images };
}

test("dynamic image loader rejects a URL absent from the channel policy before constructing Image", async () => {
  const h = await harness("https://example.com/unapproved.jpg");
  assert.equal(h.data.currentBaseImage(), null);
  assert.equal(h.images.length, 0);
  assert.equal(h.data.baseImageState("continuum"), "failed");
});

test("dynamic image loader admits exact approved NASA URL without claiming a pinned frame", async () => {
  const h = await harness(BASE_IMAGES.continuum.url);
  assert.ok(h.data.currentBaseImage());
  assert.equal(h.images.length, 1);
  assert.equal(h.images[0].src, BASE_IMAGES.continuum.url);
});

async function renderHarness(){
  const images=[],draws=[];
  const store={activeMode:'orrery',state:{schema_version:'solar-state-snapshot.v3'},timelineIndex:-1,
    liveEngineRun:false,wavelength:'continuum',sky:{},orrery:{},seriesRecords:[]};
  const explorer={mode:'observe',media:'ready'};
  const presentation={headline:'Reference',sourceKind:'model',availability:'ready',timeLabel:'Reference time'};
  const context=vm.createContext({
    Image:class {constructor(){images.push(this);this.complete=true;this.naturalWidth=1024;}},
    Event:class {},window:{dispatchEvent(){}},
    document:{getElementById:()=>null,querySelector:()=>null,body:{setAttribute(){}}},
  });
  const [view]=await loadSourceModules(context,[
    new URL('../../apps/web/js/view.js',import.meta.url),
    new URL('../../apps/web/js/data.js',import.meta.url),
  ],{resolveImport:(_specifier,url)=>{
    const name=url.pathname.split('/').at(-1);
    if(name==='store.js')return {store};
    if(name==='config.js')return {FALLBACK_STATE:{},BASE_IMAGES};
    if(name==='panels.js')return {updateText(){}};
    if(name==='render.js')return {drawSolarDisk(){draws.push(store.activeMode+':'+explorer.mode);},drawButterfly(){}};
    if(name==='presentationState.js')return {resolvePresentation:()=>presentation};
    if(name==='workspace.js')return {renderWorkspace(){}};
    if(name==='explorer.js')return {explorer,renderExplorer(){},currentObservationPresentation:()=>presentation};
    if(name==='destinationOverview.js')return {renderDestinationOverview(){}};
    if(name==='tour.js')return {maybeAutoStartTour(){}};
    if(name==='dataBundle.js')return {readDataBundle(){}};
    if(name==='timeline.js')return {prepareBundlePublication(){}};
  }});
  return {view,store,explorer,images,draws};
}

test('only visible Today Research can load and draw its dynamic SDO channel',async()=>{
  const h=await renderHarness();
  for(const mode of ['orrery','sky']){
    h.store.activeMode=mode;
    for(const depth of ['observe','research']){h.explorer.mode=depth;h.view.renderAll();}
  }
  h.store.activeMode='today';h.explorer.mode='observe';h.view.renderAll();
  assert.equal(h.images.length,0,'inactive research must not initiate an external SDO request');
  assert.deepEqual(h.draws,[],'inactive research disk must not draw or load an image indirectly');
  h.explorer.mode='research';h.view.renderAll();
  assert.equal(h.images.length,1);assert.equal(h.images[0].src,BASE_IMAGES.continuum.url);
  assert.deepEqual(h.draws,['today:research'],'the authorized Research view still renders');
  h.store.activeMode='orrery';
  h.images[0].onload();h.images[0].onerror();
  assert.equal(h.images.length,1,'late image callbacks must not restart background loading');
  assert.deepEqual(h.draws,['today:research'],'late image callbacks must respect the selected surface');
});
