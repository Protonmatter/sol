import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";
import { MOONS } from "../../apps/web/js/moons.js";
import { MOON_ELEMENTS } from "../../apps/web/js/moonelements.js";
import { NAMED_STARS } from "../../apps/web/js/starcatalog.js";

// Browser DOM only: the complete production presenters and their physics imports
// execute unchanged. textContent replacement really removes children, so stale
// cards and lost glossary nodes cannot pass by accumulating recorded strings.
class ElementBoundary {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.className = "";
    this.ownText = "";
    this.textWrites = 0;
  }
  set textContent(value) { this.ownText = String(value); this.children = []; this.textWrites++; }
  get textContent() { return this.ownText + this.children.map(child => typeof child === "string" ? child : child.textContent).join(""); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return name.startsWith("data-") ? this.dataset[name.slice(5)] ?? null : this.attributes[name] ?? null; }
  querySelector(selector) {
    assert.equal(selector, ".system-detail > strong");
    return this.children.find(child => child.className?.split(" ").includes("system-detail"))?.children.find(child => child.tagName === "strong") ?? null;
  }
  querySelectorAll(selector) {
    assert.equal(selector, "[data-metric]");
    return descendants(this).filter(child => child.dataset.metric !== undefined);
  }
}

function descendants(node) {
  return node.children.filter(child => typeof child !== "string").flatMap(child => [child, ...descendants(child)]);
}

async function harness() {
  const hosts = new Map(["orreryDetail", "neighbourhoodDetail"].map(id => [id, new ElementBoundary("section")]));
  const store = { orrery: { sunImageUnix: null } };
  const context = vm.createContext({ document: {
    getElementById: id => hosts.get(id) ?? null,
    createElement: tag => new ElementBoundary(tag),
  } });
  const modules = await loadSourceModules(context, ["starDetail", "orreryDetail"].map(name =>
    new URL(`../../apps/web/js/${name}.js`, import.meta.url)), {
    resolveImport: (_specifier, url) => url.pathname.endsWith("/store.js") ? { store } : undefined,
  });
  return { ...Object.assign({}, ...modules), hosts, store, host: hosts.get("orreryDetail") };
}

function rows(host) {
  const grid = descendants(host).find(node => node.tagName === "dl");
  assert.ok(grid, "a semantic description list is present");
  assert.equal(grid.children.length % 2, 0);
  return new Map(grid.children.filter((_, index) => index % 2 === 0).map((term, index) => {
    assert.equal(term.tagName, "dt");
    const value = grid.children[index * 2 + 1];
    assert.equal(value.tagName, "dd");
    return [term.ownText, value.textContent];
  }));
}

function glossary(host, term, label) {
  const button = descendants(host).find(node => node.dataset.term === term);
  assert.ok(button, `glossary button for ${term}`);
  assert.equal(button.tagName, "button");
  assert.equal(button.type, "button");
  assert.equal(button.getAttribute("aria-label"), `What is ${label}?`);
  assert.equal(button.textContent, "?");
  return button;
}

const star = (overrides = {}) => ({ name: "Synthetic solar analogue", bayer: "", con: "", ra: 42.125,
  dec: 10.25, mag: 4.81, bv: 0.65, dist: 32.615637772, spec: "G2V", ...overrides });
const live = (overrides = {}) => ({ name: "Earth", dist_au: 1, geo_dist_au: 0, speed_kms: 29.78,
  illuminated_fraction: 1, phase_angle_deg: 0, magnitude: -3.9, equilibrium_temp_k: 255, ...overrides });

test("star facts separate measured catalogue rows from explicitly derived solar-analogue estimates", async () => {
  const h = await harness(), input = star(), before = structuredClone(input);
  h.renderStarDetail(input);
  const facts = rows(h.host);
  assert.equal(h.host.querySelector(".system-detail > strong").textContent, input.name);
  assert.equal(facts.get("Measured"), "Hipparcos (ESA 1997)");
  assert.equal(facts.get("Distance"), "32.6 light-years");
  assert.equal(facts.get("Apparent magnitude"), "4.81");
  assert.equal(facts.get("Colour index B−V"), "0.65");
  assert.equal(facts.get("Position (J2000)"), "RA 42.125° · Dec +10.250°");
  assert.equal(facts.get("Derived"), "computed from the values above");
  assert.equal(facts.get("Absolute magnitude"), "4.81");
  assert.equal(facts.get("Luminosity"), "1 × the Sun");
  assert.match(facts.get("Temperature"), /K — from B−V \(Ballesteros 2012\)$/);
  assert.match(facts.get("Radius"), /Stefan–Boltzmann from luminosity and temperature$/);
  assert.equal(facts.get("Mass"), "≈ 1 × the Sun — main-sequence estimate, not a measurement");
  assert.match(h.host.textContent, /Spectral type G2V — yellow, Sun-like/);
  assert.match(h.host.textContent, /Only the measured rows come from the catalogue/);
  glossary(h.host, "parallax-distance", "Distance");
  glossary(h.host, "stellar-mass", "Mass");
  assert.deepEqual(input, before, "rendering does not mutate catalogue evidence");
});

test("missing parallax withholds every distance-derived fact but retains colour temperature", async () => {
  const h = await harness();
  h.renderStarDetail(star({ dist: null, bayer: "α", con: "Test", spec: "A0", dec: -1.5 }));
  const facts = rows(h.host);
  assert.equal(h.host.querySelector(".system-detail > strong").textContent, "Synthetic solar analogue (α Test)");
  for (const key of ["Distance", "Absolute magnitude", "Luminosity", "Radius", "Mass"]) assert.equal(facts.get(key), "—", key);
  assert.notEqual(facts.get("Temperature"), "—");
  assert.equal(facts.get("Position (J2000)"), "RA 42.125° · Dec -1.500°");
  assert.match(h.host.textContent, /Hipparcos gives no usable parallax/);
  assert.doesNotMatch(h.host.textContent, /Light leaving this star/);
});

test("missing colour omits its measured row and temperature/radius without inventing a spectral description", async () => {
  const h = await harness(), other = h.hosts.get("neighbourhoodDetail");
  h.renderStarDetail(star({ bv: null, spec: "", bayer: "β" }), "neighbourhoodDetail");
  const facts = rows(other);
  assert.equal(h.host.children.length, 0, "custom host does not overwrite the System card");
  assert.equal(other.querySelector(".system-detail > strong").textContent, "Synthetic solar analogue (β)");
  assert.equal(facts.has("Colour index B−V"), false);
  assert.equal(facts.has("Spectral type"), false);
  assert.equal(facts.get("Temperature"), "—");
  assert.equal(facts.get("Radius"), "—");
  assert.notEqual(facts.get("Luminosity"), "—");
  assert.doesNotMatch(other.textContent, /Spectral type/);
  h.renderStarDetail(null, "neighbourhoodDetail");
  assert.equal(other.children.length, 0, "clearing selection removes the previous card");
  h.renderStarDetail(star(), "missing-host");
});

test("actual nearby and evolved catalogue stars retain identity and refuse an invalid giant mass estimate", async () => {
  const h = await harness();
  h.renderStarDetail(NAMED_STARS.find(item => item.name === "Sirius"));
  assert.equal(rows(h.host).get("Distance"), "8.6 light-years");
  assert.equal(h.host.querySelector(".system-detail > strong").textContent, "Sirius (α CMa)");
  h.renderStarDetail(NAMED_STARS.find(item => item.name === "Betelgeuse"));
  const facts = rows(h.host);
  assert.equal(h.host.children.length, 1, "a new selection replaces rather than appends a card");
  assert.equal(facts.get("Distance"), "428 light-years");
  assert.equal(facts.get("Mass"), "— evolved star; the main-sequence mass–luminosity relation does not apply");
  assert.match(h.host.textContent, /Spectral type M2 — cool, red/);
});

test("stellar dynamic range is readable without confusing scientific notation with missing data", async () => {
  const h = await harness();
  // Synthetic photometry exercises display notation, not a claimed real star.
  h.renderStarDetail(star({ mag: -10 }));
  assert.match(rows(h.host).get("Luminosity"), /^\d\.\d×10[⁰¹²³⁴⁵⁶⁷⁸⁹]+ × the Sun$/);
  h.renderStarDetail(star({ mag: 20 }));
  assert.match(rows(h.host).get("Luminosity"), /^\d\.\d×10⁻[⁰¹²³⁴⁵⁶⁷⁸⁹]+ × the Sun$/);
  assert.match(rows(h.host).get("Mass"), /main-sequence estimate, not a measurement/);
});

test("body cards expose physical facts, glossary markup and independent live snapshot measurements", async () => {
  const h = await harness(), input = live(), before = structuredClone(input);
  h.renderDetail("Earth", input);
  const facts = rows(h.host);
  assert.match(facts.get("Equatorial radius"), /oblate \(polar/);
  assert.equal(facts.get("Mass"), "5.972 × 10²⁴ kg");
  assert.equal(facts.get("Surface gravity"), "9.80 m/s² · escape 11.2 km/s");
  assert.equal(facts.get("Magnetic field"), "global dipole ~1× Earth");
  assert.equal(facts.get("Distance from Sun"), "1.000 AU");
  assert.equal(facts.get("Distance from Earth"), "0.000 AU · light 0.0 min");
  assert.equal(facts.get("Illuminated"), "100.0% · phase 0.0°");
  assert.match(facts.get("Equilibrium temp"), /^255 K — black-body/);
  glossary(h.host, "oblateness", "Equatorial radius");
  glossary(h.host, "phase-angle", "Illuminated");
  assert.deepEqual(input, before);
});

test("live updates retain the selected card and glossary nodes and touch only changed measurements", async () => {
  const h = await harness();
  h.renderDetail("Earth", live());
  const card = h.host.children[0], button = glossary(h.host, "orbital-speed", "Orbital speed");
  const fixed = h.host.querySelectorAll("[data-metric]").find(node => node.dataset.metric === "Mass");
  const changed = live({ dist_au: 1.234, geo_dist_au: 2, speed_kms: 30, illuminated_fraction: null,
    magnitude: null, equilibrium_temp_k: null });
  h.renderDetail("Earth", changed);
  assert.equal(h.host.children[0], card);
  assert.equal(glossary(h.host, "orbital-speed", "Orbital speed"), button);
  assert.equal(fixed.textWrites, 1, "physical constants are not rewritten with snapshot data");
  const facts = rows(h.host);
  assert.equal(facts.get("Distance from Sun"), "1.234 AU");
  assert.equal(facts.get("Distance from Earth"), "2.000 AU · light 16.6 min");
  assert.equal(facts.get("Orbital speed"), "30.00 km/s");
  assert.equal(facts.get("Illuminated"), "Unavailable");
  assert.equal(facts.get("Apparent magnitude"), "—");
  assert.match(facts.get("Equilibrium temp"), /^— K/);
  const writes = descendants(h.host).map(node => node.textWrites);
  h.updateLiveDetailFacts(changed);
  h.updateLiveDetailFacts(live({ name: "Mars" }));
  h.updateLiveDetailFacts(null);
  assert.deepEqual(descendants(h.host).map(node => node.textWrites), writes, "same-value and wrong-selection updates are inert");
});

test("static bodies retain rotation, magnetic, atmosphere, ring and lunar-libration distinctions", async () => {
  const h = await harness();
  h.renderDetail("Venus");
  assert.match(rows(h.host).get("Rotation (sidereal)"), /\(243\.02 d\) · retrograde/);
  assert.equal(rows(h.host).get("Magnetic field"), "no global field");
  assert.match(rows(h.host).get("Atmosphere"), /^92\.000 bar/);
  assert.equal(rows(h.host).has("Distance from Sun"), false, "no live row is invented");
  h.renderDetail("Mercury");
  assert.match(rows(h.host).get("Magnetic field"), /^weak dipole/);
  assert.match(rows(h.host).get("Atmosphere"), /^1\.0e-15 bar/);
  h.renderDetail("Saturn");
  assert.match(rows(h.host).get("Rings"), /Cassini Division/);
  assert.doesNotMatch(rows(h.host).get("Atmosphere"), /NaN|bar/);
  h.renderDetail("Uranus");
  assert.doesNotMatch(rows(h.host).get("Rings"), /Cassini Division/);
  h.renderDetail("Moon");
  assert.match(rows(h.host).get("Rotation (sidereal)"), /synchronous — equal to its/);
  assert.match(rows(h.host).get("Libration"), /59% of the surface from Earth, not just half/);
  glossary(h.host, "tidal-locking", "Rotation (sidereal)");
  glossary(h.host, "libration", "Libration");
});

test("Sun facts retain mapping hold regardless of fetch time without losing live facts", async () => {
  const h = await harness();
  h.renderDetail("Sun", live({ name: "Sun" }));
  assert.match(rows(h.host).get("Surface imagery"), /mapping held.*no verified observation time/);
  assert.equal(rows(h.host).get("Luminosity"), "3.828×10²⁶ W");
  assert.equal(rows(h.host).get("Composition"), "73% H, 25% He (by mass)");
  assert.equal(rows(h.host).get("Magnetic field"), "intrinsic field");
  h.renderDetail("Earth");
  h.store.orrery.sunImageUnix = Date.parse("2026-09-12T12:00:00Z") / 1000;
  h.renderDetail("Sun", live({ name: "Sun" }));
  assert.match(rows(h.host).get("Surface imagery"), /mapping held.*Fetch time is not capture time/);
  assert.doesNotMatch(rows(h.host).get("Surface imagery"), /captured|today/);
  assert.equal(rows(h.host).get("Distance from Sun"), "1.000 AU");
});

test("unknown selection and absent host do not retain an unrelated facts card", async () => {
  const h = await harness();
  h.renderDetail("Earth");
  h.renderDetail("unrecognised");
  assert.equal(h.host.children.length, 1);
  assert.match(h.host.textContent, /^Click the Sun, a planet, a moon/);
  assert.equal(h.host.querySelector(".system-detail > strong"), null);
  h.hosts.delete("orreryDetail");
  h.renderDetail("Earth");
  h.renderMoonDetail(null);
  h.renderSmallDetail(null);
  h.updateLiveDetailFacts(live());
});

test("moon cards keep identity before knots and distinguish verified browse bytes from missing detail", async () => {
  const h = await harness();
  const moon = name => MOONS.find(item => item.n === name);
  h.renderMoonDetail(moon("Phobos"), 1767225600);
  assert.equal(rows(h.host).get("Orbits"), "Mars");
  assert.equal(rows(h.host).get("Orbital period"), "7.65 h");
  assert.doesNotMatch(rows(h.host).get("Inclination"), /retrograde|prograde/);
  h.renderMoonDetail(moon("Ganymede"), 1767225600);
  assert.match(rows(h.host).get("Mean radius"), /larger than Pluto/);
  h.renderMoonDetail(moon("Enceladus"), 1767225600);
  assert.equal(rows(h.host).get("Geometric albedo"), "1.04 — the most reflective surface known");
  assert.match(h.host.textContent, /Official source bytes verified/);
  assert.match(h.host.textContent, /coverage, orientation and color interpretation require qualification/);
  const preview = descendants(h.host).find(node => node.tagName === "img");
  assert.equal(preview.loading, "lazy");
  assert.equal(preview.style.height, "auto");
  assert.equal(preview.src, "textures/enceladus.jpg");
  h.renderMoonDetail(moon("Iapetus"), 1767225600);
  assert.match(rows(h.host).get("Orbital period"), /79\.331 d \(0\.22 yr\)/);
  assert.match(rows(h.host).get("Geometric albedo"), /bright hemisphere; the leading one is ~0.05/);
  h.renderMoonDetail(moon("Nereid"), 1767225600);
  assert.equal(rows(h.host).has("Mean density"), false);
  assert.equal(rows(h.host).has("GM"), false);
  assert.match(h.host.textContent, /Surface detail unavailable/);
  assert.equal(descendants(h.host).some(node => node.tagName === "img"), false);
  assert.match(h.host.textContent, /not enough for an occultation/);
});

test("moon cards use the real orbit-plane calculation after lazy knots arrive, not ecliptic inclination alone", async () => {
  const h = await harness();
  for (const [name, expected] of [["Triton", /retrograde — it orbits against Neptune's spin/],
    ["Titania", /prograde around Uranus, which is itself tipped past 90°/]]) {
    const original = MOONS.find(item => item.n === name);
    const combined = { ...original, ...MOON_ELEMENTS[name] };
    h.renderMoonDetail(combined, 1767225600);
    assert.match(rows(h.host).get("Inclination"), expected);
    assert.equal(original.el, undefined, "test never mutates shared identity-only catalogue rows");
    if (name === "Triton") assert.equal(rows(h.host).get("Eccentricity"), "≈ 0 — very nearly circular");
  }
});

test("small-body cards distinguish orbital elements from approximate spacecraft headings", async () => {
  const h = await harness();
  const sample = { name: "Synthetic marker", pos: [3, 4, 0], note: "Fixture, not an observed object" };
  h.renderSmallDetail({ ...sample, kind: "dwarf", el: { a: 4, e: 0.25, i: 10 } });
  let facts = rows(h.host);
  assert.match(h.host.textContent, /Dwarf planet \/ asteroid/);
  assert.equal(facts.get("Distance from Sun"), "5.00 AU · light 0.7 h");
  assert.equal(facts.get("Perihelion → aphelion"), "3.00 → 5.0 AU");
  assert.equal(facts.get("Orbital period"), "8.00 yr");
  assert.equal(facts.get("Inclination"), "10.00° to the ecliptic");
  h.renderSmallDetail({ ...sample, kind: "comet", el: { a: 25, e: 0.9, i: 120 } });
  facts = rows(h.host);
  assert.match(h.host.textContent, /Comet — Fixture/);
  assert.equal(facts.get("Orbital period"), "125 yr");
  assert.match(facts.get("Inclination"), /retrograde orbit/);
  assert.match(h.host.textContent, /orientation rather than navigation/);
  h.renderSmallDetail({ ...sample, kind: "probe", el: { a: 25 } });
  assert.deepEqual([...rows(h.host).keys()], ["Distance from Sun"]);
  assert.match(h.host.textContent, /Spacecraft — Fixture/);
  assert.match(h.host.textContent, /approximate current distance and heading/);
  h.renderSmallDetail({ ...sample, kind: "unclassified" });
  assert.match(h.host.textContent, /unclassified — Fixture/);
  assert.deepEqual([...rows(h.host).keys()], ["Distance from Sun"]);
});

test("ringed planets disclose illustrative opacity separately from sourced radius geometry", async () => {
  const h = await harness();
  h.renderDetail("Saturn");
  assert.match(h.host.textContent, /Ring radius geometry/);
  assert.match(h.host.textContent, /opacity and shadow profile.*illustrative.*uncalibrated/i);
  assert.equal(rows(h.host).has("Rings"), true);
});
