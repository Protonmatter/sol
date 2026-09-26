import test from 'node:test';
import assert from 'node:assert/strict';
import {skyCard, systemCard} from '../../apps/web/js/destinationCards.js';
import {BODY} from '../../apps/web/js/bodyData.js?v=dcca6290db';
import {visualBrowsePreview} from '../../apps/web/js/visualAssets.js';
import {MOONS} from '../../apps/web/js/moons.js';
import {SYNCHRONOUS_MOONS} from '../../apps/web/js/moonorbits.js';

const snapshot={bodies:[{name:'Moon',alt_deg:12.3456,alt_refracted_deg:88,az_deg:123.4567}]};
const presentation={observerLabel:'New York example location',aboveCount:64,actualProvider:'local',requestedProvider:'server',availability:'ready'};
const fact=(card,label)=>card.facts.find(f=>f.label===label)?.value;

test('Sun card identifies enabled source, modeled volume and explicit fallback',()=>{
  const ready={selected:'Sun',solarMode:'reconstructed-euv',solarStatus:'ready',useTextures:true};
  assert.match(systemCard(ready).note,/AIA 171/);assert.match(systemCard(ready).note,/modeled/);
  assert.doesNotMatch(systemCard(ready).note,/detail unavailable/);
  assert.match(systemCard(ready).note,/does not use/);
  assert.equal(fact(systemCard(ready),'Luminosity L☉'),'3.828×10²⁶ W');
  assert.equal(fact(systemCard(ready),'Irradiance S(r)'),'1,361 W/m² at 1 AU');
  assert.equal(fact(systemCard(ready),'Apparent V☉'),'−26.74 at 1 AU');
  const live=systemCard({...ready,bodies:[{name:'Earth',dist_au:1.0167,geo_dist_au:0}]});
  assert.match(fact(live,'Irradiance S(r)'),/1,317 W\/m²/);
  assert.equal(fact(live,'Apparent V☉'),'−26.70');
  const fakeSun=systemCard({...ready,bodies:[{name:'Sun',geo_dist_au:2}]});
  assert.equal(fact(fakeSun,'Irradiance S(r)'),'1,361 W/m² at 1 AU','photometry reads Earth.dist_au, not an invented Sun row');
  assert.match(systemCard({...ready,solarStatus:'unavailable'}).note,/simplified visible photosphere/);
  assert.match(systemCard({...ready,solarMode:'visible'}).note,/Visible-light approximation/);
  assert.match(systemCard({...ready,solarMode:'visible'}).note,/Not measured radiance/);
  assert.match(systemCard({...ready,useTextures:false}).note,/reference disabled/);
});

test('Sky card uses the displayed snapshot and actual source, never the requested observer or source',()=>{
  const card=skyCard({snapshot,selectedName:'Moon',presentation:{...presentation,providerLabel:'NASA JPL',requestedObserverLabel:'Tokyo'}});
  assert.equal(card.title,'Moon');
  assert.equal(fact(card,'Geometric altitude'),'12.35°');
  assert.equal(fact(card,'Azimuth from north'),'123.46°');
  assert.equal(fact(card,'Observer'),'New York example location');
  assert.equal(fact(card,'Source'),'Computed on your device');
  assert.doesNotMatch(JSON.stringify(card),/Tokyo|NASA JPL|88/);
  assert.match(card.note,/does not guarantee visibility/);
  assert.equal(card.preview,null); assert.equal(card.focusBody,null);
});

test('Sky retained and unavailable states preserve uncertainty and do not fabricate a selection',()=>{
  const retained=skyCard({snapshot,selectedName:'Moon',presentation:{...presentation,availability:'last_valid'}});
  assert.match(retained.note,/last validated snapshot/);
  assert.equal(fact(retained,'Observer'),'New York example location');
  const absent=skyCard({snapshot,selectedName:'Mars',presentation});
  assert.equal(absent.title,'Mars'); assert.match(absent.description,/not present/);
  assert.equal(fact(absent,'Geometric altitude'),'Unavailable');
  const missing=skyCard({snapshot:null,selectedName:'Moon',presentation:{requestedProvider:'server'}});
  assert.equal(fact(missing,'Source'),'Unavailable'); assert.equal(fact(missing,'Observer'),'Unavailable');
  assert.match(missing.description,/No validated Sky snapshot/);
});

test('Sky overview and nonfinite measurements do not become horizon or zero-value claims',()=>{
  const overview=skyCard({snapshot,selectedName:null,presentation});
  assert.equal(overview.title,'Your sky'); assert.equal(fact(overview,'Above geometric horizon'),'64 objects');
  const bad=skyCard({snapshot:{bodies:[{name:'Moon',alt_deg:NaN,az_deg:Infinity}]},selectedName:'Moon',presentation:{aboveCount:NaN}});
  assert.equal(fact(bad,'Geometric altitude'),'Unavailable'); assert.equal(fact(bad,'Azimuth from north'),'Unavailable');
  assert.doesNotMatch(bad.description,/above|below/i);
  const missingCount=skyCard({snapshot,selectedName:null,presentation:{aboveCount:-1}});
  assert.equal(fact(missingCount,'Above geometric horizon'),'Unavailable');
  const remote=skyCard({snapshot,selectedName:null,presentation:{...presentation,actualProvider:'server'}});
  assert.equal(fact(remote,'Source'),'Configured remote provider');
  const onHorizon=skyCard({snapshot:{bodies:[{name:'Moon',alt_deg:0,az_deg:0}]},selectedName:'Moon',presentation});
  assert.match(onHorizon.description,/At or below/); assert.equal(fact(onHorizon,'Geometric altitude'),'0.00°');
});

test('System overview discloses the selected artistic mode and texture-off state',()=>{
  const artistic=systemCard({planetLook:'illustrative'});
  assert.match(artistic.note,/Solar System Scope/);
  assert.match(artistic.note,/artistic/i);
  assert.match(artistic.note,/Source-qualified/);
  assert.doesNotMatch(artistic.note,/wherever a qualified texture is unavailable/);
  const disabled=systemCard({planetLook:'illustrative',useTextures:false});
  assert.match(disabled.note,/textures.*off/i);
  assert.doesNotMatch(disabled.note,/Solar System Scope/);
  const source=systemCard({planetLook:'source-qualified'});
  assert.match(source.note,/qualified texture/);
});

test('System selected-body facts stay reference constants rather than stale dynamic distances',()=>{
  const card=systemCard({selected:'Earth',bodies:[{name:'Earth',dist_au:999}],trueScale:false,engineError:'stale'});
  assert.equal(card.title,'Earth'); assert.equal(card.focusBody,'Earth');
  assert.equal(fact(card,'Reference radius'),'6,378.14 km');
  assert.equal(fact(card,'Reference gravity'),'9.8 m/s²');
  assert.match(card.note,/Reference facts/); assert.match(card.note,/last validated/);
  assert.doesNotMatch(JSON.stringify(card),/999/);
  assert.deepEqual(card.preview,visualBrowsePreview('Earth'));
  assert.match(fact(systemCard({selected:'Venus'}),'Reference rotation'),/retrograde/);
});

test('System mode changes cannot leave planetary facts over galactic illustrations or catalogue stars',()=>{
  const galaxy=systemCard({galaxy:true,selected:'Earth',selectedStar:{name:'Sirius'}});
  assert.equal(galaxy.title,'The Milky Way'); assert.equal(galaxy.focusBody,null); assert.equal(galaxy.preview,null);
  assert.doesNotMatch(JSON.stringify(galaxy),/Earth|Sirius|6,378/);
  const neighbourhood=systemCard({galaxy:true,localView:true,selected:'Earth'});
  assert.equal(neighbourhood.title,'Our stellar neighbourhood'); assert.match(neighbourhood.note,/catalogue epoch/);
  const star=systemCard({galaxy:true,localView:true,selected:'Earth',selectedStar:{name:'Sirius'}});
  assert.equal(star.title,'Sirius'); assert.equal(star.eyebrow,'CATALOGUE STAR');
  assert.equal(star.focusBody,null); assert.equal(star.preview,null); assert.match(star.note,/apparent place/);
});

test('System missing, unknown and nonfinite facts remain unavailable without unsupported focus',()=>{
  const overview=systemCard({selected:null,trueScale:true});
  assert.equal(overview.title,'The Solar System'); assert.match(overview.note,/Physical scale/);
  const unavailable=systemCard({presentation:{availability:'unavailable'}});
  assert.match(unavailable.description,/unavailable/);
  for(const name of ['Unknown','constructor','__proto__']) {
    const card=systemCard({selected:name}); assert.equal(card.focusBody,null); assert.equal(card.facts.length,0);
  }
  const original={radiusKm:BODY.Mars.radiusKm,gravity:BODY.Mars.gravity,rotationHours:BODY.Mars.rotationHours};
  try {
    Object.assign(BODY.Mars,{radiusKm:NaN,gravity:Infinity,rotationHours:null});
    const card=systemCard({selected:'Mars'});
    assert.ok(card.facts.every(f=>f.value==='Unavailable'));
  } finally {Object.assign(BODY.Mars,original);}
});

test('Every catalogued moon has a useful inspector with reference facts and an honest shape/orientation limit',()=>{
  for (const moon of MOONS) {
    const input={selected:moon.n,trueScale:false};
    const card=systemCard(input);
    assert.equal(card.focusBody,moon.n);
    assert.equal(fact(card,'Orbits'),moon.p);
    assert.match(fact(card,'Reference mean radius'),/km$/);
    if(SYNCHRONOUS_MOONS.has(moon.n)){
      assert.match(card.note,/tidally locked/i);
      assert.ok(card.note.includes(`faces ${moon.p}`),`${moon.n}: the card names the planet it faces`);
      assert.match(card.note,/libration are not modelled/);
    }else assert.match(card.note,/not tidally locked: maps use a fixed reference orientation/i);
    assert.match(card.note,/spherical approximation/i);
    assert.doesNotMatch(card.note,/true feature longitude|live imagery/);
  }
});

test('Cards tolerate not-yet-created scene state and leave admitted input records unchanged',()=>{
  assert.equal(skyCard().title,'Your sky'); assert.equal(systemCard().title,'The Solar System');
  const input={snapshot:structuredClone(snapshot),selectedName:'Moon',presentation:{...presentation}};
  const system={selected:'Earth',trueScale:true,presentation:{availability:'last_valid'}};
  const before=structuredClone({input,system});
  assert.deepEqual(skyCard(input),skyCard(input)); assert.deepEqual(systemCard(system),systemCard(system));
  assert.deepEqual({input,system},before);
  assert.equal(systemCard({selectedStar:{name:''}}).title,'Unavailable');
});
