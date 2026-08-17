#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import coverageModule from "istanbul-lib-coverage";
import puppeteer from "puppeteer-core";
import v8ToIstanbul from "v8-to-istanbul";
import {
  ROOT,
  WEB,
  absolutePageModules,
  relativePageModules,
} from "./js_coverage_scope.mjs";
import {
  assertBlueEarth,
  assertEclipsedMoonMarker,
  assertFrameChanged,
  assertMoonTransitShadow,
  assertNoMoonTransitShadow,
  assertOrbitRoundTrip,
  assertWarmWhiteSun,
} from "./visual_assertions.mjs";

const { createCoverageMap } = coverageModule;
const FIXED_UNIX_MS = 1_783_512_000_000; // 2026-07-08T12:00:00Z

// ------------------------------------------------------------------ pinned moon-shadow instants
//
// Four frames prove that the moon-shadow feature is actually DRAWN, not merely computed. Every
// number below is checked against the shipped modules at runtime (planMoonShadowFrame re-derives
// shadow list from moonshadows.js + moonorbits.js + the live VSOP position and the assertions
// refuse a plan that disagrees), so these constants only have to name the right minute; they can
// never silently drift away from the data.
//
//   TRANSIT  Io crosses Jupiter. tests/web/moonShadows.test.mjs already pins 2026-03-01T23:10Z as
//            a real transit; scanning the shipped element knots at one-minute steps puts the
//            event at 22:04Z-00:20Z, so 23:12Z is its midpoint. Choosing mid-transit rather than
//            an edge means the assertion still holds if anything nudges the clock by many
//            minutes: the shadow is on the disc for 68 minutes either side.
//   CONTROL  Three hours later. The same scan says no moon of Jupiter has a shadow anywhere on
//            the disc then, and nothing is eclipsed either — the frame that has to come back
//            empty. The camera is reused unchanged from the transit frame so the two are a true
//            A/B of one variable.
//   ECLIPSE  Io's next pass through Jupiter's umbra, 19:24Z-21:38Z the following day; 20:31Z is
//            its midpoint, where sunlightOnMoon() returns exactly 0.
//   ECLIPSE CONTROL  Two and a half hours before ingress, with Io in full sunlight.
//
// Saturn's four-simultaneous-caster instant (2025-05-10T05:38Z, pinned in moonShadows.test.mjs)
// is deliberately NOT used for the pixel gate: even Rhea's umbra is ~1% of Saturn's disc radius,
// which is three or four pixels at any framing that keeps the whole planet on screen, and the
// ring shadow crosses the same disc. Io's 2.1% umbra on a ringless Jupiter is the honest choice.
const MOON_SHADOW_TRANSIT_MS = Date.parse("2026-03-01T23:12:00Z");
const MOON_SHADOW_CONTROL_MS = Date.parse("2026-03-02T02:12:00Z");
const MOON_ECLIPSE_MS = Date.parse("2026-03-02T20:31:00Z");
const MOON_ECLIPSE_CONTROL_MS = Date.parse("2026-03-02T18:00:00Z");

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function browserBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `no Chromium-compatible browser found; checked ${candidates.join(", ")}`
    );
  }
  return found;
}

function mimeType(file) {
  return ({
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json",
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

async function staticServer(webRoot) {
  const root = path.resolve(webRoot);
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      response.writeHead(404).end("not found");
      return;
    }
    if (!stat.isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": stat.size,
      "Content-Type": mimeType(file),
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    ),
  };
}

async function setValue(page, selector, value, eventName = "input") {
  await page.$eval(selector, (node, next, eventType) => {
    node.value = next;
    node.dispatchEvent(new Event(eventType, { bubbles: true }));
  }, String(value), eventName);
}

async function setChecked(page, selector, checked) {
  await page.$eval(selector, (node, next) => {
    node.checked = next;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
}

async function clickMode(page, mode) {
  await page.click(`.mode-button[data-mode="${mode}"]`);
  await page.waitForFunction(
    (expected) => document.querySelector(`.mode-button[data-mode="${expected}"]`)
      ?.getAttribute("aria-pressed") === "true",
    { timeout: 15_000 },
    mode
  );
}

async function assertDisclosureContract(page) {
  const initial = await page.evaluate(() => ({
    modes: Array.from(document.querySelectorAll(".mode-button")).map((button) => ({
      mode: button.dataset.mode,
      pressed: button.getAttribute("aria-pressed"),
    })),
    panelExpanded: document.getElementById("panelToggle")?.getAttribute("aria-expanded"),
    statusVisible: document.querySelector(".summary-panel")?.getClientRects().length > 0,
    sunInside: document.getElementById("sunInside")?.open,
    sunExplore: document.getElementById("sunExplore")?.open,
    sunWeather: document.getElementById("sunWeather")?.open,
    sunResearch: document.getElementById("sunResearch")?.open,
  }));
  const expectedModes = JSON.stringify([
    { mode: "today", pressed: "true" },
    { mode: "sky", pressed: "false" },
    { mode: "orrery", pressed: "false" },
  ]);
  if (JSON.stringify(initial.modes) !== expectedModes) {
    throw new Error(`initial destination state violates the UX contract: ${JSON.stringify(initial.modes)}`);
  }
  if (
    initial.panelExpanded !== "true"
    || !initial.statusVisible
    || initial.sunInside !== false
    || initial.sunExplore !== true
    || initial.sunWeather !== false
    || initial.sunResearch !== false
  ) {
    throw new Error(`initial progressive-disclosure state violates the UX contract: ${JSON.stringify(initial)}`);
  }

  // Native disclosure controls must work from the keyboard and expose their state.
  await page.focus("#sunResearch > summary");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("sunResearch")?.open === true);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("sunResearch")?.open === false);

  // The drawer sits below the fixed timeline at this viewport. Puppeteer's physical
  // click can land on that overlay after scroll-to-center even though keyboard activation
  // and the native control are correct. HTMLElement.click() still exercises the browser's
  // native <summary> activation without making this contract depend on viewport geometry.
  await page.$eval("#sunWeather > summary", (node) => node.click());
  await page.waitForFunction(() => document.getElementById("sunWeather")?.open === true);
  await page.$eval("#sunWeather > summary", (node) => node.click());
  await page.waitForFunction(() => document.getElementById("sunWeather")?.open === false);
}

async function exerciseSun(page) {
  await page.waitForFunction(
    () => document.querySelectorAll("#regionList button[data-region-id]").length > 0
      && document.body.textContent.includes("solar-state-snapshot.v2"),
    { timeout: 20_000 }
  );
  await page.click("#regionList button[data-region-id]");

  const wavelengthSelectors = await page.$$eval("#wavelengthBar .wl-chip", (nodes) =>
    nodes.map((node) => `#wavelengthBar .wl-chip[data-id="${node.dataset.id}"]`)
  );
  for (const selector of wavelengthSelectors) await page.click(selector);
  for (const id of ["#layerConfidence", "#layerRegions"]) {
    const original = await page.$eval(id, (node) => node.checked);
    await setChecked(page, id, !original);
    await setChecked(page, id, original);
  }

  // Hit an actual projected active region rather than an arbitrary canvas pixel.
  await page.evaluate(async () => {
    const href = document.querySelector('link[href^="js/store.js"]')?.getAttribute("href");
    const canvas = document.getElementById("solarCanvas");
    if (!href || !canvas) return;
    const { store } = await import(`./${href}`);
    const item = store.projectedRegions[0];
    if (!item) return;
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + item.x * rect.width / canvas.width,
      clientY: rect.top + item.y * rect.height / canvas.height,
    }));
  });

  await setValue(page, "#timeScrubber", "5");
  await page.click("#playToggle");
  await new Promise((resolve) => setTimeout(resolve, 40));
  await page.click("#playToggle");
  await page.click("#nowBtn");
  await page.click("#liveRun");
  await page.waitForFunction(
    () => document.getElementById("liveStatus")?.textContent.includes("Computed in your browser"),
    { timeout: 20_000 }
  );
  await setValue(page, "#liveActivity", "0.65", "change");
  await page.waitForFunction(
    () => document.getElementById("liveStatus")?.textContent.includes("activity 0.65"),
    { timeout: 20_000 }
  );
  await page.click("#nowBtn");

  await page.$eval("#butterflyCanvas", (canvas) => {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + rect.width * 0.72,
      clientY: rect.top + rect.height / 2,
    }));
  });

  const term = await page.$("[data-term]");
  if (term) {
    await term.hover();
    await term.click();
    await page.keyboard.press("Escape");
  }

  await page.click("#tourStart");
  while (await page.$eval("#tourLayer", (layer) => !layer.hidden)) {
    await page.click("#tourNext");
  }
  await page.click("#tourStart");
  await page.click("#tourNext");
  await page.click("#tourBack");
  await page.keyboard.press("Escape");
  await page.click("#panelToggle");
  await page.click("#panelToggle");
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function exerciseSky(page) {
  await clickMode(page, "sky");
  await page.waitForFunction(
    () => document.querySelectorAll("#skyList .sky-row").length > 0
      && !document.getElementById("skyInsight")?.textContent.includes("unavailable"),
    { timeout: 20_000 }
  );

  await setValue(page, "#skyLat", "40.7128");
  await setValue(page, "#skyLon", "270");
  await page.click("#skySet");
  await setValue(page, "#skyLat", "");
  await page.click("#skySet");
  await setValue(page, "#skyLat", "40.7128");
  await setValue(page, "#skyLon", "-74.0060");
  await page.click("#skySet");
  await setValue(page, "#skyTime", "", "change");
  await setValue(page, "#skyTime", "2026-07-08T12:00", "change");
  await page.click("#skyNow");

  for (const id of ["#skyConst", "#skyTraj"]) {
    await setChecked(page, id, false);
    await setChecked(page, id, true);
  }

  const row = await page.$('#skyList .sky-row[role="button"]');
  if (row) {
    await row.hover();
    await row.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
  }
  const skyBox = await page.evaluate(() => {
    const canvas = document.getElementById("skyCanvas");
    const debug = globalThis.__skyDebug?.();
    const point = debug?.plotted?.[0];
    const rect = canvas.getBoundingClientRect();
    return point
      ? {
          x: rect.left + point.x * rect.width / canvas.width,
          y: rect.top + point.y * rect.height / canvas.height,
        }
      : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(skyBox.x, skyBox.y);
  await page.mouse.click(skyBox.x, skyBox.y);

  await page.click("#skyShare");
  await page.click("#skyExport");
  // Exercise the optional provider's explicit local fallback; this static test server
  // intentionally has no /api/sky endpoint.
  await page.click("#skyProviderServer");
  await page.waitForFunction(
    () => document.getElementById("skyProvenance")?.textContent.includes("unavailable"),
    { timeout: 10_000 }
  );
  await page.click("#skyProviderLocal");
}

async function focusBody(page, name) {
  await page.select("#orreryAnchor", name);
  await page.waitForFunction(
    (expected) => document.querySelector("#orreryAnchor")?.value === expected,
    {},
    name
  );
}

async function zoomIn(page, presses) {
  await page.focus("#orreryCanvas");
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press("+");
  }
}

async function canvasScreenshot(page, output) {
  const canvas = await page.$("#orreryCanvas");
  if (!canvas) throw new Error("3-D canvas is missing");
  const bytes = Buffer.from(await canvas.screenshot({ path: output, type: "png" }));
  if (bytes.length < 10_000) {
    throw new Error(`3-D canvas screenshot is implausibly small (${bytes.length} bytes)`);
  }
  return bytes;
}

/**
 * Runs INSIDE the page. Pins the simulation clock to one instant, aims the camera at the planet,
 * repaints through the app's own handlers, and hands back everything the pixel assertions need:
 * the shadow list the shipped geometry predicts, where each shadow lands on screen, how wide its
 * umbra and penumbra are there, where every drawn moon marker is, and which canvas pixels are not
 * hidden behind a floating panel.
 *
 * TWO THINGS MAKE THE PREDICTED COORDINATES TRUSTWORTHY, and both are checked, not assumed.
 *  • The camera is a rebuild of orrery.js's cameraMatrices() from the state the renderer itself
 *    is using (store.orrery holds the live object, not a copy). It is verified against the screen
 *    positions the renderer placed the planet's and each moon's DOM label at this same frame;
 *    the assertions reject any plan whose worst residual exceeds half a pixel.
 *  • That same check validates the one renderer constant duplicated here, the planet's display
 *    radius: systemScale() inflates the moon orbits to 1.7 display radii, so a wrong radius moves
 *    every moon marker and the label residual blows up immediately.
 *
 * The clock is moved by rewriting the value the harness's fixed Date reads, then clicking "Now",
 * which is the app's own path back to renderUnix = Date.now(). Nothing here writes simulation
 * state; only the camera (the same three numbers a drag would set) is assigned.
 */
async function planMoonShadowFrame({ unixMs, planet, camera }) {
  globalThis.__solPinnedUnixMs = unixMs;
  const entry = document.querySelector('script[type="module"][src^="app.js"]');
  const token = entry ? new URL(entry.src).search : "";
  const [{ store }, math, shadowMath, orbits, bodies, catalogue, elements] = await Promise.all([
    import(`./js/store.js${token}`),
    import(`./js/orreryMath.js${token}`),
    import(`./js/moonshadows.js${token}`),
    import(`./js/moonorbits.js${token}`),
    import(`./js/bodyData.js${token}`),
    import(`./js/moons.js${token}`),
    import(`./js/moonelements.js${token}`),
  ]);
  // The catalogue rows carry identity only until the knots load; merge them exactly as
  // loadMoonCatalogue() does so moonOffsetAU can be called here too.
  for (const moon of catalogue.MOONS) Object.assign(moon, elements.MOON_ELEMENTS[moon.n]);

  const state = store.orrery;
  const AU_KM = 149597870.7;
  const FOVY = (42 * Math.PI) / 180;                 // orrery.js
  const VISIBLE_DISPLAY_RADIUS_AU = { Jupiter: 0.170 }; // orrery.js VIS_RADIUS_AU
  const anchor = document.getElementById("orreryAnchor");
  anchor.value = planet;
  anchor.dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("orreryNow").click();

  const unix = state.renderUnix;
  const phys = bodies.BODY[planet];
  const live = state.bodies.find((body) => body.name === planet);
  const P = [live.x_au, live.y_au, live.z_au];
  const sunward = math.norm([-P[0], -P[1], -P[2]]);
  const rot = math.iauRotation(phys, unix);
  const oblate = phys.polarKm / phys.radiusKm;
  const toBody = (v) => [
    rot[0] * v[0] + rot[1] * v[1] + rot[2] * v[2],
    rot[4] * v[0] + rot[5] * v[1] + rot[6] * v[2],
    rot[8] * v[0] + rot[9] * v[1] + rot[10] * v[2],
  ];
  const toWorld = (v) => [
    rot[0] * v[0] + rot[4] * v[1] + rot[8] * v[2],
    rot[1] * v[0] + rot[5] * v[1] + rot[9] * v[2],
    rot[2] * v[0] + rot[6] * v[1] + rot[10] * v[2],
  ];
  const geom = { eqRadius: phys.radiusKm, polarRadius: phys.polarKm, sunRadius: bodies.BODY.Sun.radiusKm };
  const sunOffset = toBody([-P[0] * AU_KM, -P[1] * AU_KM, -P[2] * AU_KM]);
  const moons = catalogue.MOONS.filter((moon) => moon.p === planet);
  const casters = moons.map((moon) => {
    const offset = orbits.moonOffsetAU(moon, unix);
    return {
      name: moon.n,
      offset: toBody([offset[0] * AU_KM, offset[1] * AU_KM, offset[2] * AU_KM]),
      radius: moon.r,
      offsetAU: offset,
    };
  });
  const shadows = shadowMath.moonShadowsOnPlanet(casters, sunOffset, geom);
  const sunlit = Object.fromEntries(
    casters.map((c) => [c.name, shadowMath.sunlightOnMoon(c.offset, sunOffset, geom)])
  );

  const rEq = (VISIBLE_DISPLAY_RADIUS_AU[planet] || 0.05) * state.exaggeration;
  if (state.trueScale) throw new Error("moon-shadow frames assume the default visible-scale mode");
  if (camera.kind === "fixed") {
    state.az = camera.az;
    state.el = camera.el;
    state.radius = camera.radius;
  } else {
    let direction;
    if (camera.kind === "polar") {
      // Straight down the spin axis. Every moon then rides a face-on circle well clear of the
      // disc, and because the Sun is within a few degrees of the equatorial plane every marker
      // shows the same phase — which is what makes two eclipse frames photometrically comparable.
      direction = math.norm([rot[8], rot[9], rot[10]]);
    } else {
      // Aim a few degrees off the shadow itself, tilted AWAY from the moon casting it. Near the
      // middle of the visible disc the additive atmospheric halo SPHERE_FS paints toward the limb
      // is negligible (it would otherwise fill a fifth of the umbra's remaining light), while the
      // caster's own inflated marker is thrown out past the limb where it cannot cover either the
      // shadow or the reference annulus around it.
      const shadow = shadows[0];
      if (!shadow) throw new Error("no transit shadow at the pinned transit instant");
      const centre = math.norm(toWorld([shadow.center[0], shadow.center[1], shadow.center[2] * oblate]));
      const caster = math.norm(toWorld(shadow.moonPos));
      const along = math.dot(caster, centre);
      const away = math.norm([
        centre[0] * along - caster[0], centre[1] * along - caster[1], centre[2] * along - caster[2],
      ]);
      const angle = (camera.tiltDegrees * Math.PI) / 180;
      direction = math.norm([
        Math.cos(angle) * centre[0] + Math.sin(angle) * away[0],
        Math.cos(angle) * centre[1] + Math.sin(angle) * away[1],
        Math.cos(angle) * centre[2] + Math.sin(angle) * away[2],
      ]);
    }
    state.az = Math.atan2(direction[1], direction[0]);
    state.el = Math.asin(Math.max(-1, Math.min(1, direction[2])));
    // Put the equatorial radius at `discFraction` of the canvas half-height.
    state.radius = rEq / (camera.discFraction * Math.tan(FOVY / 2));
  }
  // Repaint through a production handler rather than by reaching for paint(): the size slider's
  // input listener re-reads its unchanged value and redraws.
  document.getElementById("orrerySize").dispatchEvent(new Event("input", { bubbles: true }));

  const canvas = document.getElementById("orreryCanvas");
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  const eye = [
    P[0] + state.radius * Math.cos(state.el) * Math.cos(state.az),
    P[1] + state.radius * Math.cos(state.el) * Math.sin(state.az),
    P[2] + state.radius * Math.sin(state.el),
  ];
  const vp = math.mul(
    math.perspective(FOVY, canvas.width / canvas.height, 0.008, 800),
    math.lookAt(eye, P, [0, 0, 1])
  );
  const project = (p) => {
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    if (!(w > 0)) return null;
    return [((x / w) * 0.5 + 0.5) * cw, (1 - ((y / w) * 0.5 + 0.5)) * ch];
  };

  // The renderer's own screen positions for this frame, straight off the label overlay, and then
  // the overlay is hidden so its text cannot land on a sampled pixel (an element screenshot
  // includes whatever the browser painted on top of the element).
  const host = document.getElementById("orreryLabels");
  const placed = {};
  for (const span of host.querySelectorAll("span")) {
    if (span.style.display === "none") continue;
    placed[span.textContent] = [parseFloat(span.style.left), parseFloat(span.style.top)];
  }
  host.style.visibility = "hidden";

  let innermost = Infinity;
  for (const moon of moons) innermost = Math.min(innermost, (moon.a * (1 - moon.e)) / AU_KM);
  const ringOuterAU = phys.rings ? (phys.rings.outerKm / phys.radiusKm) * rEq : 0;
  const scale = Math.max(1, Math.max(rEq * 1.7, ringOuterAU * 1.12) / innermost); // systemScale()
  const forward = math.norm([P[0] - eye[0], P[1] - eye[1], P[2] - eye[2]]);
  const right = math.norm(math.cross(forward, [0, 0, 1]));
  const up = math.cross(right, forward);
  const residuals = [];
  const markers = casters.map((c) => {
    const world = [
      P[0] + c.offsetAU[0] * scale, P[1] + c.offsetAU[1] * scale, P[2] + c.offsetAU[2] * scale,
    ];
    const at = project(world);
    const drawn = Math.min(rEq * 0.42, Math.max(rEq * 0.055, rEq * (c.radius / phys.radiusKm) * 4));
    const edge = at
      ? project([world[0] + drawn * right[0], world[1] + drawn * right[1], world[2] + drawn * right[2]])
      : null;
    if (at && placed[c.name]) {
      residuals.push(Math.hypot(placed[c.name][0] - at[0], placed[c.name][1] - at[1]));
    }
    return {
      name: c.name, at, radiusPx: at && edge ? Math.hypot(edge[0] - at[0], edge[1] - at[1]) : null,
    };
  });
  if (placed[planet]) {
    const at = project(P);
    residuals.push(Math.hypot(placed[planet][0] - at[0], placed[planet][1] - at[1]));
  }

  const projectedShadows = shadows.map((shadow) => {
    const c = shadow.center;
    const world = math.add(P, toWorld([rEq * c[0], rEq * c[1], rEq * c[2] * oblate]));
    const normal = math.norm(toWorld(c));
    const at = project(world);
    const view = math.norm([eye[0] - world[0], eye[1] - world[1], eye[2] - world[2]]);
    // Measure the cone radii along a screen-parallel tangent so the answer is in pixels of the
    // drawn ellipse rather than of the great circle it foreshortens from.
    const tangent = math.norm(math.cross(normal, view));
    const spanning = (radius) => project(math.add(world, [
      rEq * radius * tangent[0], rEq * radius * tangent[1], rEq * radius * tangent[2],
    ]));
    const umbraEdge = at ? spanning(shadow.umbra) : null;
    const penumbraEdge = at ? spanning(shadow.penumbra) : null;
    return {
      name: shadow.name, umbra: shadow.umbra, penumbra: shadow.penumbra, at,
      lambert: math.dot(normal, sunward), cosNV: math.dot(normal, view),
      umbraPx: at && umbraEdge ? Math.hypot(umbraEdge[0] - at[0], umbraEdge[1] - at[1]) : null,
      penumbraPx: at && penumbraEdge ? Math.hypot(penumbraEdge[0] - at[0], penumbraEdge[1] - at[1]) : null,
    };
  });

  // Which parts of the canvas box actually show the canvas. An element screenshot captures the
  // page as composited, so the surface panel, the timeline and any leftover tooltip are baked
  // into the image. Hit testing alone is not enough — a tooltip with pointer-events:none is
  // invisible to elementFromPoint and still paints over the planet — so every visible element
  // that overlaps the canvas contributes its box as well. Over-masking only costs sample area.
  const box = canvas.getBoundingClientRect();
  const ancestry = new Set();
  for (let node = canvas; node; node = node.parentElement) ancestry.add(node);
  const covered = [];
  for (const element of document.body.querySelectorAll("*")) {
    if (ancestry.has(element)) continue;
    const styles = getComputedStyle(element);
    if (styles.visibility === "hidden" || Number(styles.opacity) === 0) continue;
    for (const rect of element.getClientRects()) {
      if (!(rect.width > 0) || !(rect.height > 0)) continue;
      if (rect.right <= box.left || rect.left >= box.right) continue;
      if (rect.bottom <= box.top || rect.top >= box.bottom) continue;
      // Anything spanning most of the canvas is a layout container the canvas sits inside or
      // beside, not an overlay painted on top of it; the interactive overlays are all caught by
      // the hit test below, and this rule exists for the small pointer-events:none ones.
      if (rect.width * rect.height > box.width * box.height * 0.5) continue;
      covered.push([rect.left - box.left, rect.top - box.top, rect.right - box.left, rect.bottom - box.top]);
    }
  }
  const clearStep = 8;
  const clearW = Math.ceil(cw / clearStep), clearH = Math.ceil(ch / clearStep);
  let clear = "";
  let clearCells = 0;
  for (let j = 0; j < clearH; j += 1) {
    for (let i = 0; i < clearW; i += 1) {
      const x = i * clearStep + clearStep / 2, y = j * clearStep + clearStep / 2;
      let open = document.elementFromPoint(box.left + x, box.top + y) === canvas;
      if (open) {
        for (const [x0, y0, x1, y1] of covered) {
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { open = false; break; }
        }
      }
      clear += open ? "1" : "0";
      if (open) clearCells += 1;
    }
  }
  if (clearCells < clearW * clearH * 0.25) {
    throw new Error(`only ${clearCells}/${clearW * clearH} of the 3-D canvas is unobstructed`);
  }

  return {
    unix, iso: new Date(unix * 1000).toISOString(),
    az: state.az, el: state.el, radius: state.radius,
    P, rEq, oblate, sunward, rot, eye, right, up, fwd: forward,
    tanHalf: Math.tan(FOVY / 2), aspect: canvas.width / canvas.height,
    cw, ch, shadows: projectedShadows, sunlit, markers,
    labelResidual: Math.max(0, ...residuals),
    clear, clearStep, clearW, clearH,
  };
}

/**
 * The moon-shadow pixel gate: four pinned frames that make the RENDERING of the transit shadows
 * and moon eclipses a tested claim rather than a source-text one. See MOON_SHADOW_TRANSIT_MS for
 * how the instants were chosen and visual_assertions.mjs for what each frame has to show.
 */
async function moonShadowAssertions(page, visualDirectory) {
  const before = await page.evaluate(async () => {
    const entry = document.querySelector('script[type="module"][src^="app.js"]');
    const { store } = await import(`./js/store.js${entry ? new URL(entry.src).search : ""}`);
    const state = store.orrery;
    return { az: state.az, el: state.el, radius: state.radius, anchor: state.anchor };
  });
  // Overlays that draw lines and points across the disc are irrelevant to this measurement and
  // would put stray bright pixels inside the sampled annulus; they are restored below.
  const overlays = [
    "orreryShowOrbits", "orreryShowSmall", "orreryShowSky", "orreryShowConst",
    "orreryDeepSky", "orreryShowSunEq",
  ];
  const overlayState = {};
  for (const id of overlays) {
    overlayState[id] = await page.$eval(`#${id}`, (node) => node.checked);
    if (overlayState[id]) await setChecked(page, `#${id}`, false);
  }

  const frame = async (name, options) => {
    const plan = await page.evaluate(planMoonShadowFrame, options);
    // One settled frame: the repaint above is synchronous, but the compositor still has to hand
    // the canvas to the screenshot.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const bytes = await canvasScreenshot(page, path.join(visualDirectory, `${name}.png`));
    return { plan, bytes };
  };

  // Transit and its control share one camera, so the two frames differ in exactly one thing:
  // whether Io is in front of Jupiter. 0.80 puts Jupiter's equatorial radius at 80% of the canvas
  // half-height, which makes Io's 2.1%-of-a-disc-radius umbra about ten pixels across — small
  // enough to be honest, large enough to measure.
  const transit = await frame("jupiter-io-transit", {
    unixMs: MOON_SHADOW_TRANSIT_MS,
    planet: "Jupiter",
    camera: { kind: "offShadow", tiltDegrees: 8, discFraction: 0.80 },
  });
  const transitStats = assertMoonTransitShadow(transit.bytes, transit.plan);
  const control = await frame("jupiter-io-transit-control", {
    unixMs: MOON_SHADOW_CONTROL_MS,
    planet: "Jupiter",
    camera: { kind: "fixed", az: transit.plan.az, el: transit.plan.el, radius: transit.plan.radius },
  });
  const controlStats = assertNoMoonTransitShadow(
    control.bytes, control.plan, transit.plan.shadows[0].umbraPx
  );

  // The eclipse pair looks down Jupiter's spin axis, where the Galileans ride a face-on circle
  // outside the disc and cannot be occluded by it. 0.45 keeps Io's marker on the canvas at that
  // 1.7-display-radii orbit while still drawing it ~20 px across.
  const eclipse = await frame("jupiter-io-eclipse", {
    unixMs: MOON_ECLIPSE_MS,
    planet: "Jupiter",
    camera: { kind: "polar", discFraction: 0.45 },
  });
  const eclipseControl = await frame("jupiter-io-eclipse-control", {
    unixMs: MOON_ECLIPSE_CONTROL_MS,
    planet: "Jupiter",
    camera: { kind: "fixed", az: eclipse.plan.az, el: eclipse.plan.el, radius: eclipse.plan.radius },
  });
  const eclipseStats = assertEclipsedMoonMarker(
    eclipse.bytes, eclipseControl.bytes, eclipse.plan, eclipseControl.plan, "Io"
  );

  // Hand the view back exactly as it was found: the clock to the harness's fixed epoch, the
  // camera to the caller's, the overlays to their own state, and the labels to visible.
  await page.evaluate(async ({ fixedNow, camera }) => {
    globalThis.__solPinnedUnixMs = fixedNow;
    const entry = document.querySelector('script[type="module"][src^="app.js"]');
    const { store } = await import(`./js/store.js${entry ? new URL(entry.src).search : ""}`);
    const state = store.orrery;
    state.az = camera.az;
    state.el = camera.el;
    state.radius = camera.radius;
    const anchor = document.getElementById("orreryAnchor");
    anchor.value = camera.anchor;
    anchor.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("orreryLabels").style.visibility = "";
    document.getElementById("orreryNow").click();
  }, { fixedNow: FIXED_UNIX_MS, camera: before });
  for (const id of overlays) {
    if (overlayState[id]) await setChecked(page, `#${id}`, true);
  }
  return { transit: transitStats, control: controlStats, eclipse: eclipseStats };
}

async function visualAssertions(page, visualDirectory) {
  fs.mkdirSync(visualDirectory, { recursive: true });
  await focusBody(page, "Sun");
  await zoomIn(page, 34);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const sun = await canvasScreenshot(page, path.join(visualDirectory, "sun-warm-white.png"));
  const sunStats = assertWarmWhiteSun(sun);

  await focusBody(page, "Earth");
  await zoomIn(page, 8);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const earthBefore = await canvasScreenshot(page, path.join(visualDirectory, "earth-before-orbit.png"));
  const earthStats = assertBlueEarth(earthBefore);

  // A single synthetic pointer gesture changes azimuth by exactly 2π. With animation
  // paused and the simulation clock fixed, the rendered scene must return to its initial
  // image; a camera-basis flip or hidden fast Earth rotation causes a material pixel delta.
  await page.$eval("#orreryCanvas", (canvas) => {
    const rect = canvas.getBoundingClientRect();
    const startX = rect.left + 20;
    const y = rect.top + rect.height / 2;
    const common = { bubbles: true, pointerId: 91, pointerType: "mouse", clientY: y };
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...common, clientX: startX, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent("pointermove", {
      ...common,
      clientX: startX + Math.PI * 2 / 0.008,
      buttons: 1,
    }));
    canvas.dispatchEvent(new PointerEvent("pointerup", {
      ...common,
      clientX: startX + Math.PI * 2 / 0.008,
      buttons: 0,
    }));
  });
  const earthAfter = await canvasScreenshot(page, path.join(visualDirectory, "earth-after-orbit.png"));
  const orbitStats = assertOrbitRoundTrip(earthBefore, earthAfter);

  // At one day per second, duplicate/short rAF intervals used to toggle the limiter warning
  // and reflow the navigation panel. Sample consecutive production frames and require both
  // the disclosure and its rendered height to remain stable.
  await page.$eval('#orrerySpeedPresets button[data-dps="1"]', (button) => button.click());
  await setChecked(page, "#orreryAnimate", true);
  const disclosureFrames = await page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    const sample = () => {
      const node = document.getElementById("orreryAccuracy");
      samples.push({
        text: node?.textContent || "",
        height: node?.getBoundingClientRect().height || 0,
      });
      if (samples.length >= 12) resolve(samples);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  if (new Set(disclosureFrames.map((sample) => sample.text)).size !== 1
      || new Set(disclosureFrames.map((sample) => sample.height)).size !== 1) {
    throw new Error(`1 d/s navigation disclosure reflowed across frames: ${
      JSON.stringify(disclosureFrames)
    }`);
  }

  // At one simulated week per real second the old renderer froze every planet's rotation.
  // Compare two settled frames while the real production clock is running: the focused Earth
  // must continue turning, including under the perceptual cap used to prevent low-FPS aliasing.
  await page.$eval('#orrerySpeedPresets button[data-dps="7"]', (button) => button.click());
  await new Promise((resolve) => setTimeout(resolve, 250));
  const highSpeedBefore = await canvasScreenshot(
    page, path.join(visualDirectory, "earth-week-per-second-before.png")
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  const highSpeedAfter = await canvasScreenshot(
    page, path.join(visualDirectory, "earth-week-per-second-after.png")
  );
  const rotationStats = assertFrameChanged(highSpeedBefore, highSpeedAfter);
  const spinDisclosure = await page.$eval("#orreryAccuracy", (node) => node.textContent);
  if (!spinDisclosure.includes("Rotation display rate-limited")) {
    throw new Error(`high-speed rotation disclosure is missing: ${JSON.stringify(spinDisclosure)}`);
  }
  await setChecked(page, "#orreryAnimate", false);

  // The moon-shadow gate runs last because it drives the clock to its own pinned instants and
  // hands the view back afterwards; everything above depends on the harness's fixed epoch.
  const moonShadow = await moonShadowAssertions(page, visualDirectory);

  console.log(
    "visual assertions:",
    `Sun G/R=${sunStats.greenRed.toFixed(3)} B/R=${sunStats.blueRed.toFixed(3)};`,
    `Earth blue pixels=${earthStats.bluePixels};`,
    `orbit mean delta=${orbitStats.meanDifference.toFixed(3)};`,
    `high-speed rotation delta=${rotationStats.meanDifference.toFixed(3)}`
  );
  console.log(
    "moon-shadow assertions:",
    moonShadow.transit.shadows.map((s) =>
      `${s.name} umbra keeps ${s.depth.toFixed(4)} of the disc (predicted ${s.predicted.toFixed(4)}), `
      + `${s.offset.toFixed(1)} px from the predicted spot, ${s.radius.toFixed(1)} px across;`
    ).join(" "),
    `no-transit control darkest local contrast=${moonShadow.control.darkest.toFixed(3)};`,
    `Io in Jupiter's umbra keeps ${moonShadow.eclipse.ratio.toFixed(4)} of its light `
    + `(shipped ramp ${moonShadow.eclipse.expected.toFixed(4)})`
  );
}

async function exerciseOrrery(page, visualDirectory) {
  await clickMode(page, "orrery");
  // V8 block-coverage collection instruments the large lazy star/moon catalogues and can
  // more than double their cold-start time on shared CI runners. Keep the assertion exact,
  // but allow the instrumented initialization the same bounded headroom as the standalone
  // browser smoke's retry budget.
  try {
    await page.waitForFunction(
      () => document.getElementById("orreryBackend")?.textContent.includes("WebGL2")
        && document.querySelectorAll("#orreryPositions .orrery-pos-moon").length >= 21,
      { timeout: 75_000 }
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      backend: document.getElementById("orreryBackend")?.textContent || "",
      insight: document.getElementById("orreryInsight")?.textContent || "",
      moonRows: document.querySelectorAll("#orreryPositions .orrery-pos-moon").length,
      surface: document.body.dataset.surface || "",
    }));
    throw new Error(`3-D readiness timed out: ${JSON.stringify(state)}`, { cause: error });
  }
  await setChecked(page, "#orreryAnimate", false);
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 15_000 });
  await visualAssertions(page, visualDirectory);

  for (const id of [
    "orreryTrueScale",
    "orreryShowOrbits",
    "orreryShowSky",
    "orreryShowConst",
    "orreryShowLabels",
    "orreryShowSunEq",
    "orreryShowSmall",
    "orreryShowMoons",
    "orreryDeepSky",
    "orreryTextures",
    "orreryTopDown",
  ]) {
    const original = await page.$eval(`#${id}`, (node) => node.checked);
    await setChecked(page, `#${id}`, !original);
    await setChecked(page, `#${id}`, original);
  }

  await setValue(page, "#orreryTime", "10");
  await setValue(page, "#orreryTime", "0");
  await page.click("#orreryNow");
  await setValue(page, "#orrerySize", "1.4");
  await setValue(page, "#orrerySpeed", "0.7");
  await page.click('#orrerySpeedPresets button[data-dps="1"]');
  await setValue(page, "#orrerySpeedEntry", "2");
  await setValue(page, "#orrerySpeedUnit", "7", "change");
  for (const name of [
    "Phobos",
    "Deimos",
    "Moon",
    "Jupiter",
    "Ceres",
    "1P/Halley",
    "Voyager 1",
    "Sun",
  ]) {
    const exists = await page.$eval("#orreryAnchor", (select, value) =>
      Array.from(select.options).some((option) => option.value === value), name);
    if (exists) await focusBody(page, name);
  }

  await page.focus("#orreryCanvas");
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-"]) {
    await page.keyboard.press(key);
  }
  await setChecked(page, "#orreryFreeFly", true);
  await page.focus("#orreryCanvas");
  await page.keyboard.down("w");
  await setChecked(page, "#orreryAnimate", true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.keyboard.up("w");
  await setChecked(page, "#orreryAnimate", false);
  await page.keyboard.press("ArrowLeft");
  await setChecked(page, "#orreryFreeFly", false);

  // Exercise click picking and the two-pointer pinch branch with deterministic
  // synthetic events; the visual round-trip above already covers ordinary orbit drag.
  await page.$eval("#orreryCanvas", (canvas) => {
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const fire = (type, pointerId, clientX, clientY, buttons) =>
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, buttons, clientX, clientY, pointerId, pointerType: "touch",
      }));
    fire("pointerdown", 1, x - 30, y, 1);
    fire("pointerdown", 2, x + 30, y, 1);
    fire("pointermove", 2, x + 45, y, 1);
    fire("pointerup", 2, x + 45, y, 0);
    fire("pointerup", 1, x - 30, y, 0);
    fire("pointerdown", 3, x, y, 1);
    fire("pointerup", 3, x, y, 0);
  });

  // These controls sit below the fixed timeline at the validation viewport. Puppeteer's
  // physical click can be intercepted after scroll-to-center; native button activation
  // still exercises the production click handler and is independent of overlay geometry.
  await page.$eval("#orreryGalaxy", (button) => button.click());
  await page.waitForFunction(
    () => document.getElementById("orreryGalaxy")?.textContent.includes("Back"),
    { timeout: 20_000 }
  );
  // Exercise the real star facts renderer with both a measured-distance star and the
  // catalogue's explicit no-parallax path. Picking remains covered through the canvas
  // gesture; this direct call makes the two scientific-disclosure branches deterministic.
  await page.evaluate(async () => {
    const app = document.querySelector('script[type="module"][src^="app.js"]');
    const token = app ? new URL(app.src).search : "";
    const [{ renderStarDetail }, { NAMED_STARS }] = await Promise.all([
      import(`./js/starDetail.js${token}`),
      import(`./js/starcatalog.js${token}`),
    ]);
    renderStarDetail(NAMED_STARS.find((star) => star.dist != null));
    renderStarDetail(NAMED_STARS.find((star) => star.dist == null));
  });
  await setValue(page, "#orrerySpeed", "0.55");
  await page.$eval("#orreryLocal", (button) => button.click());
  await page.$eval("#orreryLocal", (button) => button.click());
  await page.$eval("#orreryGalaxy", (button) => button.click());
}

function coverageLocalPath(entryUrl, webRoot) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(entryUrl).pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }
  const local = path.resolve(webRoot, pathname);
  return local.startsWith(`${path.resolve(webRoot)}${path.sep}`) ? local : null;
}

async function writeBrowserCoverage(entries, webRoot, outputDirectory) {
  const expectedLoaded = new Set(
    relativePageModules({ includeGenerated: true }).map((file) => path.resolve(webRoot, file))
  );
  const included = new Set(absolutePageModules().map((file) => path.resolve(file)));
  const seen = new Set();
  const coverage = createCoverageMap({});

  for (const entry of entries) {
    const local = coverageLocalPath(entry.url, webRoot);
    if (!local || !expectedLoaded.has(local)) continue;
    seen.add(local);
    if (!included.has(local)) continue;
    const converter = v8ToIstanbul(local, 0, {
      source: entry.text || fs.readFileSync(local, "utf8"),
    });
    await converter.load();
    const functions = entry.rawScriptCoverage?.functions || [{
      functionName: "(root)",
      isBlockCoverage: true,
      ranges: entry.ranges.map((range) => ({
        count: 1,
        endOffset: range.end,
        startOffset: range.start,
      })),
    }];
    converter.applyCoverage(functions);
    coverage.merge(converter.toIstanbul());
  }

  const missing = [...expectedLoaded].filter((file) => !seen.has(file));
  if (missing.length) {
    throw new Error(
      "production modules were omitted from Chromium's execution-collected denominator:\n"
      + missing.map((file) => `  - ${path.relative(ROOT, file)}`).join("\n")
    );
  }
  const coveredFiles = new Set(coverage.files().map((file) => path.resolve(file)));
  const missingHandWritten = [...included].filter((file) => !coveredFiles.has(file));
  if (missingHandWritten.length) {
    throw new Error(
      "hand-written modules are absent from browser coverage:\n"
      + missingHandWritten.map((file) => `  - ${path.relative(ROOT, file)}`).join("\n")
    );
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, "coverage-final.json"),
    `${JSON.stringify(coverage.toJSON())}\n`
  );
  const summary = coverage.getCoverageSummary();
  console.log(
    `browser-only execution coverage: lines ${summary.lines.pct.toFixed(2)}%, `
    + `branches ${summary.branches.pct.toFixed(2)}%, functions ${summary.functions.pct.toFixed(2)}%`
  );
}

async function main() {
  const webRoot = path.resolve(argument("web-root", WEB));
  const outputDirectory = path.resolve(argument("output-dir", path.join(ROOT, "coverage", "browser")));
  for (const required of [
    "index.html",
    "pkg/solar_wasm.wasm",
    "pkg/solar_ephemeris.wasm",
  ]) {
    const file = path.join(webRoot, required);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      throw new Error(`built browser artifact is missing: ${file}`);
    }
  }

  const server = await staticServer(webRoot);
  const browser = await puppeteer.launch({
    executablePath: browserBinary(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-features=Translate,OptimizationHints",
      "--disable-sync",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--use-gl=angle",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.evaluateOnNewDocument(({ fixedNow, serverBase }) => {
      const NativeDate = Date;
      // The pinned epoch lives in a global the harness can rewrite, because the moon-shadow gate
      // has to drive the app to specific transit and eclipse instants and the app reads the wall
      // clock (effectiveBaseUnix in orrery.js) to build renderUnix. It is a single value, set
      // before each frame and restored afterwards, so every other surface still sees one frozen
      // "now" exactly as before.
      globalThis.__solPinnedUnixMs = fixedNow;
      class FixedDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [globalThis.__solPinnedUnixMs]));
        }
        static now() { return globalThis.__solPinnedUnixMs; }
      }
      globalThis.Date = FixedDate;
      // Configure a same-origin endpoint which the static server deliberately answers
      // with 404. This keeps the production default private/offline while making the
      // optional-provider fallback executable in CI. Pre-grant only this disposable test
      // endpoint so a modal consent prompt cannot suspend the headless run.
      const ephemerisBase = `${serverBase}/__missing_ephemeris`;
      globalThis.SOL_EPHEMERIS_SERVER = ephemerisBase;
      try {
        localStorage.setItem("sol-tour-seen", "1");
        localStorage.setItem(`sol-ephemeris-server-consent:${ephemerisBase}`, "granted");
      } catch {}
    }, { fixedNow: FIXED_UNIX_MS, serverBase: server.base });

    const failures = [];
    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      // The optional DE441 exercise deliberately receives a 404 from the static server
      // and verifies the local fallback. Chrome reports that expected HTTP response as a
      // console error even though fetch() handles it correctly.
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
        failures.push(`console: ${message.text()}`);
      }
    });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith(server.base) || url.startsWith("data:") || url.startsWith("blob:")) {
        request.continue();
      } else {
        request.abort("blockedbyclient");
      }
    });

    await page.coverage.startJSCoverage({
      includeRawScriptCoverage: true,
      reportAnonymousScripts: false,
      resetOnNavigation: false,
      useBlockCoverage: true,
    });
    await page.goto(`${server.base}/index.html`, {
      waitUntil: "networkidle0",
      timeout: 30_000,
    });
    await assertDisclosureContract(page);
    await exerciseSun(page);
    await exerciseSky(page);
    await exerciseOrrery(page, path.join(outputDirectory, "visual"));
    const entries = await page.coverage.stopJSCoverage();
    if (failures.length) {
      throw new Error(`browser runtime errors:\n${failures.map((item) => `  - ${item}`).join("\n")}`);
    }
    await writeBrowserCoverage(entries, webRoot, outputDirectory);
  } finally {
    await browser.close();
    await server.close();
  }
  console.log("OK: Chromium runtime coverage and WebGL visual assertions passed");
}

await main();
