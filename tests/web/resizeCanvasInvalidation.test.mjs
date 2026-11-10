import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';

const snapshotText=fs.readFileSync(new URL('../../apps/web/data/latest-state.json',import.meta.url),'utf8');
const moduleURL=name=>new URL(`../../apps/web/js/${name}.js`,import.meta.url);

// Real renderer, projection, selection, wavelength disclosure and (when enabled)
// presentation/orchestration. Canvas/DOM and image acquisition are host boundaries.
async function fixture({pipeline=false}={}) {
  const commands=[],listeners=new Map(),timers=new Map();let serial=0,gradient=0,lost=false,failDraw=false,failPrepare=false;
  let image=null,now=Date.parse('2026-11-08T05:59:59Z');
  function element(){
    let text='';const children=[];
    return {hidden:false,inert:false,children,className:'',setAttribute(){},toggleAttribute(){},
      get textContent(){return text+children.map(c=>c.textContent).join('');},set textContent(v){text=String(v);children.length=0;},appendChild(v){children.push(v);}};
  }
  function canvas(id){
    const handlers=new Map(),rect={width:400,height:300};
    const target={isContextLost:()=>lost};
    for(const method of ['clearRect','fillRect','drawImage','beginPath','arc','stroke','save','clip','restore','fill','ellipse','moveTo','bezierCurveTo','lineTo','fillText','setLineDash'])target[method]=(...args)=>{
      if(failDraw&&method==='fill')throw Error('deliberate draw failure');commands.push([id,method,...args]);
    };
    target.createRadialGradient=(...args)=>{const value={gradient:++gradient,addColorStop(...values){commands.push([id,'stop',...values]);}};commands.push([id,'gradient',...args]);return value;};
    const ctx=new Proxy(target,{set(t,key,value){commands.push([id,'set',key,value?.gradient?`gradient:${value.gradient}`:value]);t[key]=value;return true;}});
    return {...element(),id,width:400,height:300,rect,handlers,getContext:()=>ctx,getBoundingClientRect(){return {...this.rect};},
      addEventListener(name,callback){const list=handlers.get(name)||[];list.push(callback);handlers.set(name,list);},
      dispatch(name){for(const callback of handlers.get(name)||[])callback();}};
  }
  const nodes={solarCanvas:canvas('solar'),butterflyCanvas:canvas('butterfly'),baseLabel:element(),wavelengthCaption:element(),viewTitle:element(),plainInsight:element(),viewAvailability:element()};
  const controls={regions:{checked:true},confidence:{checked:false}};
  const store={state:null,activeMode:'today',wavelength:'model',timelineIndex:-1,liveEngineRun:false,selectedRegionId:null,
    activeBaseKind:'synthetic',activeBaseLabel:'synthetic photosphere',projectedRegions:[],projectedButterflyRegions:[],seriesFrames:[],seriesRecords:[],tourIndex:-1,
    feedStatus:{next_recommended_run_utc:'2026-11-08T00:00:00Z'},dataError:null};
  const window={devicePixelRatio:1,addEventListener(name,fn){listeners.set(name,fn);},dispatchEvent(){},clearTimeout(id){timers.delete(id);},setTimeout(fn,delay){assert.equal(delay,120);timers.set(++serial,fn);return serial;}};
  const context=vm.createContext({store,window,Date:class extends Date{static now(){return now;}},
    document:{getElementById:id=>nodes[id]||null,querySelector:()=>null,body:{setAttribute(){},classList:{toggle(){}}},createElement:element,createTextNode:text=>({textContent:text})}});
  const frozen=text=>vm.runInContext(`(function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;})(JSON.parse(${JSON.stringify(text)}))`,context);
  store.state=frozen(snapshotText);
  const boundaries={
    'store.js':{store},'dom.js':{controls,text(id,value){if(nodes[id])nodes[id].textContent=value;}},
    'data.js':{currentBaseImage(){return store.wavelength==='model'||store.timelineIndex>=0||store.liveEngineRun?null:image;},baseImageState(){return image?'live':'pending';},retryBaseImage(){}},
    'panels.js':{updateText(){if(failPrepare)throw Error('deliberate preparation failure');}},
    'explorer.js':{explorer:{mode:'research'},renderExplorer(){},currentObservationPresentation(){return {}; }},
  };
  if(!pipeline)boundaries['view.js']={renderAll(){}};
  const names=pipeline?['view','render','researchView']:['render'];
  const loaded=await loadSourceModules(context,names.map(moduleURL),{resolveImport:(_specifier,url)=>boundaries[url.pathname.split('/').at(-1)]});
  Object.assign(context,...loaded);
  const solar=()=>commands.filter(c=>c[0]==='solar');
  return {context,store,controls,nodes,window,solar,frozen,
    clear(){commands.length=0;gradient=0;},draw(options){context.drawSolarDisk(options);},
    image(value){image=value;},lost(value){lost=value;},failDraw(value){failDraw=value;},failPrepare(value){failPrepare=value;},now(value){now=Date.parse(value);},
    resize(){
      context.loadedViews={sky:null,research:{}};
      const app=fs.readFileSync(new URL('../../apps/web/app.js',import.meta.url),'utf8');
      const begin=app.indexOf('// --- Responsive re-render ---'),end=app.indexOf('// --- Glossary tooltips ---',begin);
      assert.ok(begin>=0&&end>begin);vm.runInContext(app.slice(begin,end).replace('let resizeTimer = 0;','var resizeTimer = 0;'),context);
      listeners.get('resize')();for(const fn of [...timers.values()])fn();timers.clear();
    },
  };
}

test('unchanged resize retains immutable Sun pixels, hit targets and actual source disclosure',async()=>{
  const h=await fixture();h.draw();const targets=h.store.projectedRegions;
  assert.ok(h.solar().filter(c=>c[1]==='ellipse').length>=850);h.clear();h.nodes.wavelengthCaption.textContent='stale';
  h.draw({resizeOnly:true});assert.equal(h.solar().length,0);assert.equal(h.store.projectedRegions,targets);
  assert.match(h.nodes.wavelengthCaption.textContent,/Synthetic engine view/);
});

test('ordinary draws always render completely even after a reusable frame exists',async()=>{
  const h=await fixture();h.draw();h.clear();h.draw();assert.ok(h.solar().filter(c=>c[1]==='ellipse').length>=850);
});

for(const [name,change]of [
  ['snapshot identity',h=>{const s=JSON.parse(snapshotText);s.run.seed++;h.store.state=h.frozen(JSON.stringify(s));}],
  ['selection',h=>{h.store.selectedRegionId=h.store.state.active_regions[0].id;}],
  ['region control',h=>{h.controls.regions.checked=false;}],
  ['confidence control',h=>{h.controls.confidence.checked=true;}],
  ['mode',h=>{h.store.activeMode='sky';}],
  ['wavelength',h=>{h.store.wavelength='aia171';}],
  ['timeline source',h=>{h.store.timelineIndex=0;}],
  ['local-run source',h=>{h.store.liveEngineRun=true;}],
])test(`${name} invalidates a resize reuse and then establishes a fresh frame`,async()=>{
  const h=await fixture();h.draw();change(h);h.clear();h.draw({resizeOnly:true});assert.ok(h.solar().some(c=>c[1]==='clearRect'));
  h.clear();h.draw({resizeOnly:true});assert.equal(h.solar().length,0);
});

test('changed CSS dimensions and DPR execute the same commands as the complete draw path',async()=>{
  const a=await fixture(),b=await fixture();a.draw();b.draw();
  for(const h of [a,b]){h.nodes.solarCanvas.rect={width:500,height:250};h.window.devicePixelRatio=2;h.clear();}
  a.draw({resizeOnly:true});b.draw();assert.equal(a.nodes.solarCanvas.width,720);assert.equal(a.nodes.solarCanvas.height,360);
  assert.deepEqual(a.solar(),b.solar());a.clear();a.draw({resizeOnly:true});assert.equal(a.solar().length,0);
});

for(const mutable of ['root','nested'])test(`${mutable}-mutable snapshots conservatively redraw`,async()=>{
  const h=await fixture();const state=vm.runInContext(`JSON.parse(${JSON.stringify(snapshotText)})`,h.context);
  h.store.state=mutable==='nested'?Object.freeze(state):state;h.draw();h.clear();h.draw({resizeOnly:true});
  assert.ok(h.solar().some(c=>c[1]==='clearRect'));
});

test('hidden geometry retains the original full draw instead of trusting stale backing dimensions',async()=>{
  const h=await fixture();h.draw();h.nodes.solarCanvas.rect={width:0,height:0};h.clear();h.draw({resizeOnly:true});
  assert.ok(h.solar().some(c=>c[1]==='clearRect'));assert.equal(h.nodes.solarCanvas.width,400);
});

test('a failed draw invalidates reuse and a later resize retries all drawing',async()=>{
  const h=await fixture();h.draw();h.failDraw(true);assert.throws(()=>h.draw(),/deliberate draw failure/);
  h.failDraw(false);h.clear();h.draw({resizeOnly:true});assert.ok(h.solar().some(c=>c[1]==='clearRect'));
  h.clear();h.draw({resizeOnly:true});assert.equal(h.solar().length,0);
});

test('context loss and restoration invalidate previous success without accumulating listeners',async()=>{
  const h=await fixture();h.draw();h.lost(true);h.nodes.solarCanvas.dispatch('contextlost');h.clear();h.draw({resizeOnly:true});
  h.lost(false);h.nodes.solarCanvas.dispatch('contextrestored');h.clear();h.draw({resizeOnly:true});assert.ok(h.solar().some(c=>c[1]==='clearRect'));
  h.clear();h.draw({resizeOnly:true});assert.equal(h.solar().length,0);
  assert.equal(h.nodes.solarCanvas.handlers.get('contextlost').length,1);assert.equal(h.nodes.solarCanvas.handlers.get('contextrestored').length,1);
});

test('observed images always redraw across unchanged or changed metadata',async()=>{
  const h=await fixture();h.store.wavelength='continuum';
  const entry={img:{naturalWidth:1024,naturalHeight:1024,src:'fixture.jpg'},cfg:{label:'Fixture observed disk'}};h.image(entry);h.draw();
  for(const change of [()=>{entry.img.naturalWidth=2048;},()=>{entry.cfg.label='Updated source label';},()=>{entry.img={...entry.img,src:'replacement.jpg'};}]){
    change();h.clear();h.draw({resizeOnly:true});assert.ok(h.solar().some(c=>c[1]==='drawImage'));
    h.clear();h.draw({resizeOnly:true});assert.ok(h.solar().some(c=>c[1]==='drawImage'));
  }
});

test('actual debounced resize keeps clock-derived preparation while reusing unchanged pixels',async()=>{
  const h=await fixture({pipeline:true});h.context.renderAll();assert.doesNotMatch(h.store.presentation.headline,/feed context is stale/);h.clear();
  h.now('2026-11-08T06:00:01Z');h.resize();assert.match(h.store.presentation.headline,/feed context is stale/);
  assert.equal(h.solar().length,0,'Only immutable unchanged pixels are retained; clock-derived source preparation still runs');
});

test('a preparation failure remains visible and is retried on the next resize',async()=>{
  const h=await fixture({pipeline:true});h.context.renderAll();h.failPrepare(true);
  assert.throws(()=>h.resize(),/deliberate preparation failure/);h.failPrepare(false);h.now('2026-11-08T06:00:01Z');h.resize();
  assert.match(h.store.presentation.headline,/feed context is stale/);
});

test('a mutable inherited array iterator cannot retain a supposedly immutable frame',async()=>{
  const h=await fixture();
  h.context.mutableSnapshot=vm.runInContext(`JSON.parse(${JSON.stringify(snapshotText)})`,h.context);
  vm.runInContext(`
    const inherited=Object.create(Array.prototype);inherited.enabled=true;
    inherited[Symbol.iterator]=function*(){if(inherited.enabled)yield* Array.prototype.values.call(this);};
    Object.setPrototypeOf(mutableSnapshot.active_regions,inherited);
    (function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}})(mutableSnapshot);
    store.state=mutableSnapshot;globalThis.inheritedRegions=inherited;
  `,h.context);
  h.draw();const originalArcs=h.solar().filter(c=>c[1]==='arc').length;
  h.context.inheritedRegions.enabled=false;h.clear();h.draw({resizeOnly:true});
  assert.ok(h.solar().some(c=>c[1]==='clearRect'));
  assert.ok(h.solar().filter(c=>c[1]==='arc').length<originalArcs,'Inherited iterator mutation changes real drawing inputs');
});

test('native reset drawing-state defaults invalidate an equal-size live context',async()=>{
  const h=await fixture();h.draw();const ctx=h.nodes.solarCanvas.getContext('2d');
  assert.ok(ctx.lineWidth>=1.5);ctx.lineWidth=1;ctx.strokeStyle='#000000';h.clear();h.draw({resizeOnly:true});
  assert.ok(h.solar().some(c=>c[1]==='clearRect'));
  h.clear();h.draw({resizeOnly:true});assert.equal(h.solar().length,0);
});
