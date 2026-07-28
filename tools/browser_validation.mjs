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
  assertFrameChanged,
  assertOrbitRoundTrip,
  assertWarmWhiteSun,
} from "./visual_assertions.mjs";

const { createCoverageMap } = coverageModule;
const FIXED_UNIX_MS = 1_783_512_000_000; // 2026-07-08T12:00:00Z

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

  // At one simulated week per real second the old renderer froze every planet's rotation.
  // Compare two settled frames while the real production clock is running: the focused Earth
  // must continue turning, while the accuracy line keeps one stable rate-limit disclosure.
  await page.$eval('#orrerySpeedPresets button[data-dps="7"]', (button) => button.click());
  await setChecked(page, "#orreryAnimate", true);
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
  console.log(
    "visual assertions:",
    `Sun G/R=${sunStats.greenRed.toFixed(3)} B/R=${sunStats.blueRed.toFixed(3)};`,
    `Earth blue pixels=${earthStats.bluePixels};`,
    `orbit mean delta=${orbitStats.meanDifference.toFixed(3)};`,
    `high-speed rotation delta=${rotationStats.meanDifference.toFixed(3)}`
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
      class FixedDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }
        static now() { return fixedNow; }
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
