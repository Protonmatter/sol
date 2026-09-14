import test from "node:test";
import assert from "node:assert/strict";
import { MOONS } from "../../apps/web/js/moons.js";
import { MOON_ELEMENTS } from "../../apps/web/js/moonelements.js";
import { renderMoonDetail, renderDetail } from "../../apps/web/js/orreryDetail.js";

// Snapshot the identity-only records the moment moons.js loads. The merge test below mutates
// the shared objects, exactly as loadMoonCatalogue() does, so taking the copy here keeps the
// pre-merge test independent of execution order.
const PRE_MERGE = MOONS.map((m) => ({ ...m }));

// Execute the card builders against a minimal DOM; assertions inspect created nodes.
function stubDocument() {
  const made = [];
  const node = (tag = "div") => {
    const el = {
      children: [], text: [], tagName: tag, style: {}, dataset: {},
      querySelector() { return null; }, setAttribute(k,v) { el[k]=v; },
      set textContent(v) { if (v === "") { el.children.length = 0; } else { el.text.push(String(v)); } },
      set className(_v) {},
      append(...kids) { el.children.push(...kids); },
      appendChild(kid) { el.children.push(kid); return kid; },
    };
    if (tag === "img") {
      let source;
      el.sourceAssignments = [];
      Object.defineProperty(el, "src", {
        get: () => source,
        set: value => { source = String(value); el.sourceAssignments.push(source); },
      });
      el.getAttribute = name => name === "src" ? source ?? null : el[name] ?? null;
      el.removeAttribute = name => { if (name === "src") source = undefined; else delete el[name]; };
    }
    made.push(el);
    return el;
  };
  const host = node();
  globalThis.document = { getElementById: () => host, createElement: (tag) => node(tag) };
  return { host, made, textOf: () => made.flatMap((el) => el.text) };
}

test("Sun detail reports held mapping and retains physical constants", () => {
  const dom = stubDocument();
  renderDetail("Sun");
  assert.ok(dom.textOf().some(t => t.includes("3.828")));
  assert.ok(dom.textOf().some(t => /held.*observation time/i.test(t)));
  assert.equal(dom.made.filter(el => el.tagName === "img").length, 0);
});

test("verified moon browse preserves aspect ratio and source attribution", () => {
  const dom = stubDocument();
  renderMoonDetail(PRE_MERGE.find(m => m.n === "Callisto"), 1767225600);
  const img = dom.made.find(el => el.tagName === "img");
  assert.ok(img);
  assert.equal(img.src, "textures/callisto.jpg");
  assert.equal(img.loading, "lazy");
  assert.equal(img.style.height, "auto");
  assert.equal(img.style.objectFit, "contain");
  img.onerror();
  assert.equal(img.hidden, true);
  assert.ok(dom.textOf().some(t => /Preview unavailable/.test(t)));
  assert.ok(dom.made.some(el => el.tagName === "a" && el.href.startsWith("https://astrogeology.usgs.gov/")));
  assert.ok(dom.textOf().some(t => /Official source bytes verified/.test(t)));
  assert.ok(dom.textOf().every(t => !/No global mosaic.*published|surface is a real USGS global mosaic/.test(t)));
});

test("a failed lazy preview retries once when its retained source disclosure reopens", () => {
  const dom = stubDocument();
  renderMoonDetail(PRE_MERGE.find(m => m.n === "Callisto"), 1767225600);
  const disclosure = dom.made.find(el => el.tagName === "details");
  const img = dom.made.find(el => el.tagName === "img");
  const figure = dom.made.find(el => el.tagName === "figure");
  const caption = dom.made.find(el => el.tagName === "figcaption");
  const source = figure.children.find(el => el.tagName === "a");
  const originalCaption = caption.text.at(-1);
  const imageIdentity = { alt: img.alt, loading: img.loading, decoding: img.decoding, ...img.style };
  const sourceIdentity = { href: source.href, target: source.target, rel: source.rel };
  const card = dom.host.children[0];
  const toggle = open => { disclosure.open = open; disclosure.ontoggle?.(); };

  toggle(true);
  img.onerror(); // The initial lazy request fails while offline.
  assert.equal(img.hidden, true);
  assert.match(caption.text.at(-1), /Preview unavailable/);
  toggle(false);
  assert.equal(img.sourceAssignments.length, 1, "closing does not request an image");
  toggle(true); // The same card/disclosure is reused after connectivity returns.
  assert.deepEqual(img.sourceAssignments, ["textures/callisto.jpg", "textures/callisto.jpg"],
    "reopening explicitly requests the same verified preview again");
  assert.equal(img.hidden, false);
  toggle(true);
  toggle(false);
  toggle(true);
  assert.equal(img.sourceAssignments.length, 2, "an in-flight retry is not restarted by toggles");

  img.onerror();
  assert.equal(img.getAttribute("src"), null, "failed request state is cleared");
  toggle(false); toggle(true);
  assert.equal(img.sourceAssignments.length, 3, "a later explicit reopen can retry another failure");
  img.onload();
  assert.equal(img.hidden, false);
  assert.equal(caption.text.at(-1), originalCaption, "success restores the original provenance caption");
  toggle(false); toggle(true);
  assert.equal(img.sourceAssignments.length, 3, "a loaded preview is not reloaded");
  assert.equal(dom.host.children[0], card);
  assert.deepEqual(figure.children, [img, caption, source], "retry preserves semantic nodes and source link");
  assert.deepEqual({ alt: img.alt, loading: img.loading, decoding: img.decoding, ...img.style }, imageIdentity);
  assert.deepEqual({ href: source.href, target: source.target, rel: source.rel }, sourceIdentity);
});

test("unqualified moon detail has no fabricated preview", () => {
  const dom = stubDocument();
  renderMoonDetail(PRE_MERGE.find(m => m.n === "Nereid"), 1767225600);
  assert.equal(dom.made.filter(el => el.tagName === "img").length, 0);
  assert.ok(dom.textOf().some(t => /Surface detail unavailable/.test(t)));
});

// The element knots arrive lazily with moonelements.js, so between opening the Solar System
// view and that ~1 MB landing, every moon is already selectable from the Focus control and the
// accessible positions list while its record carries identity only. renderMoonDetail used to
// reach isRetrograde -> moonElementsAt -> `m.el.length` and throw, wiping the panel and — since
// state.selected was already set — breaking every later showDetail with it. Nothing executed
// this function, so neither the unit suite nor CI's browser pass could see it.
test("the moon card renders before the lazily loaded element knots arrive", () => {
  const io = PRE_MERGE.find((m) => m.n === "Io");

  // Precondition, and a guard in its own right: if the knots are ever folded back into
  // moons.js this assertion fails loudly rather than the test quietly stopping to mean anything.
  assert.equal(io.el, undefined, "moons.js must carry identity only — knots live in moonelements.js");

  const dom = stubDocument();
  assert.doesNotThrow(() => renderMoonDetail(io, 1767225600));

  const text = dom.textOf();
  assert.ok(text.includes("Io"), "the card still names the moon");
  assert.ok(text.some((t) => /Jupiter/.test(t)), "and still says what it orbits");
  const inclination = text.find((t) => /° to the ecliptic/.test(t));
  assert.ok(inclination, "inclination is identity data and must still be shown");
  assert.doesNotMatch(inclination, /retrograde|prograde/,
    "retrograde needs the orbit plane, so the clause waits for the knots rather than guessing");
});

test("the moon card decides retrograde once the knots are merged", () => {
  // Exactly what loadMoonCatalogue() does on arrival.
  for (const m of MOONS) Object.assign(m, MOON_ELEMENTS[m.n]);

  const line = (name) => {
    const dom = stubDocument();
    renderMoonDetail(MOONS.find((m) => m.n === name), 1767225600);
    return dom.textOf().find((t) => /° to the ecliptic/.test(t));
  };
  // Triton is the only genuinely retrograde moon in the catalogue; Titania sits near 98° only
  // because Uranus is tipped, which is the mistake isRetrograde exists to avoid.
  assert.match(line("Triton"), /retrograde — it orbits against Neptune's spin/);
  assert.match(line("Titania"), /prograde around Uranus, which is itself tipped past 90°/);
  assert.doesNotMatch(line("Io"), /retrograde|prograde/);
});
