import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOONS } from "../../apps/web/js/moons.js";
import { MOON_ELEMENTS } from "../../apps/web/js/moonelements.js";
import { renderMoonDetail } from "../../apps/web/js/orreryDetail.js";

// Snapshot the identity-only records the moment moons.js loads. The merge test below mutates
// the shared objects, exactly as loadMoonCatalogue() does, so taking the copy here keeps the
// pre-merge test independent of execution order.
const PRE_MERGE = MOONS.map((m) => ({ ...m }));

const source = readFileSync(
  new URL("../../apps/web/js/orreryDetail.js", import.meta.url),
  "utf8",
);

// Minimal DOM so the card can actually be built. The rest of this file asserts on source
// text; the moon card below is executed, because the bug it guards against was a TypeError
// that no amount of reading the source would have surfaced.
function stubDocument() {
  const made = [];
  const node = () => {
    const el = {
      children: [], text: [],
      set textContent(v) { if (v === "") { el.children.length = 0; } else { el.text.push(String(v)); } },
      set className(_v) {},
      append(...kids) { el.children.push(...kids); },
      appendChild(kid) { el.children.push(kid); return kid; },
    };
    made.push(el);
    return el;
  };
  const host = node();
  globalThis.document = { getElementById: () => host, createElement: () => node() };
  return { host, textOf: () => made.flatMap((el) => el.text) };
}

test("live Sun detail retains physical constants and labels the image epoch honestly", () => {
  const liveEnd = source.indexOf('if (name === "Sun")');
  const luminosity = source.indexOf('add("Luminosity"', liveEnd);
  const imagery = source.indexOf('add("Surface imagery"', luminosity);

  assert.ok(liveEnd > source.indexOf("if (live)"), "Sun facts must follow the live-data block");
  assert.ok(luminosity > liveEnd, "Sun luminosity must not be hidden in the no-live branch");
  assert.ok(imagery > luminosity, "surface provenance remains on the Sun card");
  assert.match(source.slice(liveEnd, imagery + 500), /NASA SDO\/HMI continuum, fetched/);
  assert.doesNotMatch(source.slice(liveEnd, imagery + 500), /continuum, captured/);
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
