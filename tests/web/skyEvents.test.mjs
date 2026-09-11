import assert from "node:assert/strict";
import test from "node:test";

function element() {
  return {textContent:"", children:[], appendChild(child) { this.children.push(child); }};
}
globalThis.document = { getElementById:() => null, createElement:element };
const { fillTooltip, moonPhaseInfo, eventLabel } = await import("../../apps/web/js/sky.js");

test("unavailable culmination does not render an invented zero altitude", () => {
  const target = element();
  fillTooltip(target, {name:"Venus", above_horizon:false, compass:"E",
    events:{rise:{jd:null},set:{jd:null},transit:{jd:null,altitude_deg:null}}});
  const text = target.children.map(child => child.textContent).join(" ");
  assert.match(text, /transits --/);
  assert.doesNotMatch(text, /\(0°\)/);
});

test("available culmination retains its measured altitude", () => {
  const target = element();
  fillTooltip(target, {name:"Venus", above_horizon:false, compass:"E",
    events:{rise:{jd:null},set:{jd:null},transit:{jd:2460000.75,altitude_deg:30.2}}});
  assert.match(target.children.map(child => child.textContent).join(" "), /\(30°\)/);
});

test("event null states remain distinguishable in visible text",()=>{
  assert.match(eventLabel({jd:null,calculation_status:"failed",occurrence_status:"unknown"}),/unavailable/);
  assert.match(eventLabel({jd:null,calculation_status:"not_calculated",occurrence_status:"unknown"}),/not calculated/);
  assert.match(eventLabel({jd:null,calculation_status:"calculated",occurrence_status:"none_in_window"}),/none in local/);
});

test("lunar phase pairs geocentric directions with geocentric ranges",()=>{
  const snap={bodies:[
    {name:"Sun",geocentric_apparent_ra_deg:0,geocentric_apparent_dec_deg:0,geocentric_range_km:150000000,observer_range_km:1,ra_deg:90,dec_deg:80},
    {name:"Moon",geocentric_apparent_ra_deg:90,geocentric_apparent_dec_deg:0,geocentric_range_km:400000,observer_range_km:150000000,ra_deg:0,dec_deg:-80}
  ]};
  // Dot product of Moon->Sun and Moon->Earth unit vectors for the right triangle.
  const expected=(1+400000/Math.hypot(150000000,400000))/2;
  assert.ok(Math.abs(moonPhaseInfo(snap).k-expected)<1e-14);
  snap.bodies.forEach(b=>{b.ra_deg+=17;b.observer_range_km*=2;});
  assert.ok(Math.abs(moonPhaseInfo(snap).k-expected)<1e-14);
});
