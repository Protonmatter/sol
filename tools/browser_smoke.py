#!/usr/bin/env python3
"""Headless Chromium smoke tests for the built static Sol application.

This uses an installed Chromium and the repository's locked puppeteer-core tooling.
It adds no runtime dependency to the static application. Set CHROME_BIN on hosts
without the existing Linux PATH discovery names.
"""

from __future__ import annotations

import argparse
import contextlib
import http.server
import json
import os
import re
import shutil
import socketserver
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"

# This predicate runs in the actual fixture page and in a small Node regression.
# Catalogue identity rows precede the asynchronously merged orbital knots.
MOON_READINESS_JS = """({state,time,moons,lifecycleReady,rows,backend}) => Boolean(
  state && time && lifecycleReady && rows === 22 && backend.includes("WebGL2")
  && Array.isArray(moons) && moons.length === 21
  && Array.from(moons).every(m => m && Array.isArray(m.el) && m.el.length > 0)
)"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, base_path="/", namespace="", **kwargs):
        self.base_path = base_path
        self.namespace = namespace
        super().__init__(*args, **kwargs)

    def translate_path(self, path):
        if path.startswith(self.base_path):
            path = "/" + path[len(self.base_path):]
        return super().translate_path(path)

    def log_message(self, _format: str, *_args: object) -> None:
        pass

    def do_GET(self) -> None:  # noqa: N802
        if not self.path.startswith(self.base_path):
            self.send_error(404, "outside site base path")
            return
        if self.path.split("?", 1)[0] != self.base_path + self.namespace + "__smoke_orrery.html":
            super().do_GET()
            return
        index = (Path(self.directory) / self.namespace / "index.html").read_text(encoding="utf-8")
        setup = """<script>
localStorage.setItem("sol-surface", "orrery");
// No reliance on animation speed: a synchronous state machine is advanced by BOTH
// a setInterval(50) and a rAF pump. The external driver waits on the final marker
// with a bounded real-time deadline, allowing digest and worker promises to settle.
//   (either driver alone suffices). Once ready, Animate is UNTICKED and every subsequent
//   check runs a synchronous repaint with an INJECTED simStepSeconds — the real paint path,
//   the real guards, zero scheduler dependence. The Nyquist boundary itself is additionally
//   unit-tested in tests/web/moons.test.mjs.
// * Diagnostics ride the dump: page errors, a live sim-state trace, per-phase markers.
const smokeErr = (msg) => {
  document.body.dataset.smokeErrs =
    ((document.body.dataset.smokeErrs || "") + " || " + msg).slice(0, 1500);
};
addEventListener("error", e =>
  smokeErr(String(e.message) + " @ " + String(e.filename).split("/").pop() + ":" + e.lineno));
addEventListener("unhandledrejection", e =>
  smokeErr("REJECTION: " + String((e.reason && e.reason.message) || e.reason)));

let smokeStore = null;
let smokeTime = null;
let smokeMoons = null;
let smokeLifecycleReady = false;
const smokeMoonReady = __SOL_SMOKE_READY__;
addEventListener("load", () => {
  const storeLink = document.querySelector('link[href^="js/store.js"]');
  const timeLink = document.querySelector('link[href^="js/orreryTime.js"]');
  const orreryLink = document.querySelector('link[href^="js/orrery.js"]');
  const moonsLink = document.querySelector('link[href^="js/moons.js"]');
  if (storeLink && timeLink && orreryLink && moonsLink) {
    Promise.all([
      import("./" + storeLink.getAttribute("href")),
      import("./" + timeLink.getAttribute("href")),
      import("./" + orreryLink.getAttribute("href")),
      import("./" + moonsLink.getAttribute("href")),
    ])
      .then(async ([storeModule, timeModule, orreryModule, moonsModule]) => {
        smokeStore = storeModule.store;
        smokeTime = timeModule;
        smokeMoons = moonsModule.MOONS;
        // Exercise the real destination control. The previous localStorage-only setup could
        // initialize the renderer through this harness while leaving the application tab in
        // its default state, which made the aggregate assertion both brittle and incomplete.
        const tab = document.querySelector('.mode-button[data-mode="orrery"]');
        tab?.click();
        // Join core WASM/WebGL initialization. The separate readiness predicate waits
        // for the product's optional knot loader to populate this shared catalogue;
        // the harness never imports or merges the knots itself.
        await orreryModule.enterOrrery();
        if (tab?.getAttribute("aria-pressed") === "true"
            && document.body.dataset.surface === "orrery") {
          document.body.dataset.smokeMode = "yes";
          smokeLifecycleReady = true;
        } else {
          smokeErr("orrery destination did not activate");
          document.body.dataset.smokeMode = "no";
        }
      })
      .catch(e => smokeErr("smoke module import: " + e.message));
  }
});

// Synchronous repaint with a chosen frame step. The time slider's real input handler
// rebuilds positions, paints, and refreshes the user-visible accuracy line while Animate is
// off, so the smoke verifies both renderer state and the warning presented to the user.
const repaintWithStep = (stepSeconds) => {
  smokeStore.orrery.simStepSeconds = stepSeconds;
  const time = document.getElementById("orreryTime");
  time.dispatchEvent(new Event("input", { bubbles: true }));
};

let phase = "ready";
const advance = () => {
  const body = document.body;
  if (!body) return;
  const acc = document.getElementById("orreryAccuracy");
  const accText = acc ? acc.textContent : "";
  const o = smokeStore ? smokeStore.orrery : null;
  if (o) {
    body.dataset.smokeSim = [
      "phase=" + phase,
      "stepD=" + (o.simStepSeconds / 86400).toPrecision(3),
      "aliased=" + o.moonsAliasedCount,
      "note=" + (o.moonsHiddenReason ? o.moonsHiddenReason.slice(0, 30) : "-"),
    ].join(" ");
  }
  if (phase === "ready") {
    // Includes Earth's Moon plus the 21 catalogue moons in the current object browser.
    const rows = document.querySelectorAll("#orreryPositions .orrery-pos-moon").length;
    body.dataset.smokeMoonRows = String(rows);
    body.dataset.smokeMoonKnots = String(smokeMoons?.filter(m => Array.isArray(m.el) && m.el.length > 0).length || 0);
    const backend = document.getElementById("orreryBackend");
    if (smokeMoonReady({state:o,time:smokeTime,moons:smokeMoons,lifecycleReady:smokeLifecycleReady,
        rows,backend:backend?.textContent || ""})) {
      body.dataset.smokeReady = "yes";

      const expectedDefault = smokeTime.SOLAR_SPEED_DEFAULT_YPS;
      if (Math.abs(o.yearsPerSec - expectedDefault) < 1e-15) {
        body.dataset.smokeDefaultSpeed = "yes";
      } else {
        smokeErr("default speed: yps=" + o.yearsPerSec + " expected=" + expectedDefault);
        body.dataset.smokeDefaultSpeed = "no";
      }

      // Exercise the live Sun facts card through the actual Focus control. A live ephemeris
      // row used to suppress luminosity/composition because those facts sat in an else-if.
      const anchor = document.getElementById("orreryAnchor");
      anchor.value = "Sun";
      anchor.dispatchEvent(new Event("change", { bubbles: true }));
      const detail = document.getElementById("orreryDetail").textContent;
      if (detail.includes("Luminosity") && detail.includes("Composition")
          && detail.includes("Surface imagery")) {
        body.dataset.smokeSunDetail = "yes";
      } else {
        smokeErr("Sun detail missing facts: " + JSON.stringify(detail.slice(0, 500)));
        body.dataset.smokeSunDetail = "no";
      }

      // Exercise the real logarithmic time-speed control before using direct step injection.
      // Import the production mapping rather than duplicating its formula in this harness.
      const speed = document.getElementById("orrerySpeed");
      speed.value = "0.7";
      speed.dispatchEvent(new Event("input", { bubbles: true }));
      const expectedYps = smokeTime.solarSpeedFromSlider(0.7);
      if (Math.abs(o.yearsPerSec - expectedYps) / expectedYps < 1e-10) {
        body.dataset.smokeSpeed = "yes";
      } else {
        smokeErr("speed: slider 0.7 produced yps=" + o.yearsPerSec
          + " expected=" + expectedYps);
        body.dataset.smokeSpeed = "no";
      }

      // Verify the real pause control before any harness-owned step assignment can mask it.
      const animate = document.getElementById("orreryAnimate");
      animate.checked = false;
      animate.dispatchEvent(new Event("change", { bubbles: true }));
      if (!o.animate && o.simStepSeconds === 0) {
        body.dataset.smokePaused = "yes";
      } else {
        smokeErr("pause: animate=" + o.animate + " step=" + o.simStepSeconds);
        body.dataset.smokePaused = "no";
      }
      phase = "alias";
    }
  } else if (phase === "alias") {
    // A frame that covers 5 days must alias every inner moon (Phobos P/3 is 0.106 d)
    // through the real drawMoons path, and the resulting warning must be rendered.
    repaintWithStep(5 * 86400);
    const rendered = acc ? acc.textContent : "";
    if (o.moonsAliasedCount > 0
        && o.moonsHiddenReason.includes("inner moon")
        && rendered.includes("inner moon")) {
      body.dataset.smokeAliasing = "yes";
      phase = "reset";
    } else {
      smokeErr("alias: 5-day step produced aliased=" + o.moonsAliasedCount
        + " reason=" + JSON.stringify(o.moonsHiddenReason)
        + " rendered=" + JSON.stringify(rendered));
      body.dataset.smokeAliasing = "no";
      phase = "reset";
    }
  } else if (phase === "reset") {
    // Direct step injection is used only for deterministic renderer coverage; pause behavior
    // was already proven above through the actual Animate control.
    repaintWithStep(0);
    const rendered = acc ? acc.textContent : "";
    if (o.moonsAliasedCount === 0 && !o.moonsHiddenReason
        && !rendered.includes("inner moon")) {
      body.dataset.smokeReset = "yes";
    } else {
      smokeErr("reset: zero step left aliased=" + o.moonsAliasedCount
        + " reason=" + JSON.stringify(o.moonsHiddenReason)
        + " rendered=" + JSON.stringify(rendered));
      body.dataset.smokeReset = "no";
    }
    const time = document.getElementById("orreryTime");
    time.value = "10";
    time.dispatchEvent(new Event("input", { bubbles: true })); // sync: rebuild + paint + accuracy
    phase = "validity";
  } else if (phase === "validity") {
    if (accText.includes("Moons hidden") && accText.includes("outside their")) {
      body.dataset.smokeValidity = "yes";
      body.dataset.smokeDone = "yes";
      phase = "end";
    }
  }
};
setInterval(advance, 50);
const rafPump = () => { advance(); requestAnimationFrame(rafPump); };
requestAnimationFrame(rafPump);
</script>"""
        setup = setup.replace("__SOL_SMOKE_READY__", MOON_READINESS_JS)
        index = index.replace('<script type="module" src="app.js', setup + '\n    <script type="module" src="app.js')
        payload = index.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def browser_binary() -> str:
    configured = os.environ.get("CHROME_BIN")
    if configured:
        executable = Path(configured).resolve()
        if not executable.is_file():
            raise FileNotFoundError("CHROME_BIN must name an existing Chromium executable file")
        return str(executable)
    for candidate in (
        "google-chrome-stable",
        "google-chrome",
        "chromium-browser",
        "chromium",
    ):
        path = shutil.which(candidate)
        if path:
            return path
    raise FileNotFoundError("no Chromium-compatible browser found on PATH; set CHROME_BIN explicitly")


@contextlib.contextmanager
def serve(directory: Path, base_path: str = "/", namespace: str = ""):
    handler = lambda *args, **kwargs: QuietHandler(  # noqa: E731
        *args, directory=str(directory), base_path=base_path, namespace=namespace, **kwargs
    )
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        try:
            deadline = time.monotonic() + 5.0
            while True:
                try:
                    urllib.request.urlopen(
                        f"http://127.0.0.1:{port}{base_path}{namespace}index.html", timeout=1
                    ).read(1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.05)
            yield f"http://127.0.0.1:{port}{base_path}{namespace}".rstrip("/")
        finally:
            server.shutdown()
            thread.join(timeout=2)


def dump_dom(browser: str, url: str) -> tuple[str, str]:
    result = subprocess.run(
        ["node", str(ROOT / "tools/browser_smoke_driver.mjs"), browser, url],
        cwd=ROOT, text=True, encoding="utf-8", stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=100, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"browser exited {result.returncode} for {url}\n{result.stderr[-4000:]}"
        )
    captured = json.loads(result.stdout)
    target = urlsplit(url)
    if target.path.endswith("/index.html") and not target.fragment.startswith("sky="):
        observation_dom = captured.get("observationDom", "")
        assert_no_runtime_failure(observation_dom, captured["stderr"] + result.stderr, "Sun observation")
        if 'data-experience="observe"' not in observation_dom or 'id="observationImage"' not in observation_dom:
            raise AssertionError("Sun observation: initial Observe capture is missing")
    return captured["dom"], captured["stderr"] + result.stderr


def capture_screenshot(browser: str, url: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="sol-browser-") as profile:
        screenshot_path = Path(profile) / "orrery.png"
        result = subprocess.run(
            [
                "node", str(ROOT / "tools/browser_smoke_driver.mjs"), browser, url, str(screenshot_path),
            ],
            cwd=ROOT,
            text=True,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=100,
            check=False,
        )
        image = screenshot_path.read_bytes() if screenshot_path.is_file() else b""
    if result.returncode != 0:
        raise RuntimeError(
            f"browser exited {result.returncode} for screenshot {url}\n"
            + result.stderr[-4000:]
        )
    captured = json.loads(result.stdout)
    assert_no_runtime_failure(captured["dom"], captured["stderr"] + result.stderr, "Solar System screenshot")
    return image


def assert_no_runtime_failure(dom: str, stderr: str, surface: str) -> None:
    failures = (
        "Sky engine unavailable",
        "WebAssembly module failed to load",
        "Uncaught TypeError",
        "Uncaught ReferenceError",
        "SyntaxError:",
        "Smoke readiness failed:",
        "data-smoke-errs=",
        "Uncaught ",
    )
    combined = dom + "\n" + stderr
    found = [marker for marker in failures if marker in combined]
    if found:
        raise AssertionError(f"{surface}: runtime failure markers present: {found}\n{stderr[-2000:]}")
    console_errors = [
        line
        for line in stderr.splitlines()
        if "CONSOLE" in line.upper() and "ERROR" in line.upper()
    ]
    if console_errors:
        raise AssertionError(
            f"{surface}: browser console errors:\n" + "\n".join(console_errors[-20:])
        )


def run_smoke(base: str, browser: str, solar_schema: str = "solar-state-snapshot.v3") -> None:
    sun_dom, sun_stderr = dump_dom(browser, f"{base}/index.html")
    assert_no_runtime_failure(sun_dom, sun_stderr, "Sun")
    # The initial Observe surface intentionally leaves this hidden model label
    # uninitialized. It must resolve only after the driver's native Research entry.
    base_label = re.search(r'id="baseLabel"[^>]*>([^<]*)<', sun_dom)
    if ('data-experience="research"' not in sun_dom or "Loading snapshot." in sun_dom or base_label is None
            or not base_label.group(1).startswith("Base: ") or "loading" in base_label.group(1)):
        raise AssertionError("Sun Research: native entry did not produce a ready model base")
    if solar_schema not in sun_dom:
        raise AssertionError(f"Sun: rendered schema version was not {solar_schema}")
    if 'id="regionList"' not in sun_dom or "data-object-id" not in sun_dom:
        raise AssertionError("Sun: keyboard-accessible active-region list did not render")

    sky_dom, sky_stderr = dump_dom(
        browser,
        f"{base}/index.html#sky=40.7128,-74.0060,1783569600",
    )
    assert_no_runtime_failure(sky_dom, sky_stderr, "My Sky")
    if 'data-mode="sky" aria-pressed="true"' not in sky_dom:
        raise AssertionError("My Sky: deep link did not activate the sky surface")
    if 'id="skyList"' not in sky_dom or "sky-row" not in sky_dom:
        raise AssertionError("My Sky: body list did not render from ephemeris WASM")
    if "device civil timezone, not observer timezone" not in sky_dom:
        raise AssertionError("My Sky: civil-time timezone disclosure is missing")

    orrery_url = f"{base}/__smoke_orrery.html"
    expected = (
        'data-smoke-mode="yes"',
        'data-smoke-ready="yes"',
        'data-smoke-moon-rows="22"',
        'data-smoke-default-speed="yes"',
        'data-smoke-sun-detail="yes"',
        'data-smoke-speed="yes"',
        'data-smoke-paused="yes"',
        'data-smoke-aliasing="yes"',
        'data-smoke-reset="yes"',
        'data-smoke-validity="yes"',
        'data-smoke-done="yes"',
    )
    # The real-time driver waits for core initialization AND the product-loaded
    # orbital knots. A failed deterministic assertion is never retried away.
    orrery_dom, orrery_stderr = dump_dom(browser, orrery_url)
    assert_no_runtime_failure(orrery_dom, orrery_stderr, "Solar System")
    missing = [m for m in expected if m not in orrery_dom]
    if missing:
        # Surface the page's own diagnostics: trapped errors, the actual marker values, and
        # the accuracy line — a missing marker alone says nothing about WHY.
        import re as _re
        body_tag = _re.search(r"<body[^>]*>", orrery_dom)
        acc = _re.search(r'id="orreryAccuracy"[^>]*>([^<]*)<', orrery_dom)
        detail = (
            "Solar System: 3-D/moon interaction assertions failed"
            + ": " + ", ".join(missing)
            + "\n  body: " + (body_tag.group(0)[:900] if body_tag else "<none>")
            + "\n  accuracy: " + (acc.group(1)[:300] if acc else "<none>")
        )
        raise AssertionError(detail)
    screenshot = capture_screenshot(browser, orrery_url)
    if not screenshot.startswith(b"\x89PNG\r\n\x1a\n") or len(screenshot) < 20_000:
        raise AssertionError(
            f"Solar System: rendered screenshot is missing or implausibly blank ({len(screenshot)} bytes)"
        )
    width, height = struct.unpack(">II", screenshot[16:24])
    if (width, height) != (1280, 900):
        raise AssertionError(f"Solar System: screenshot size is {width}x{height}, expected 1280x900")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--web-root", type=Path, default=WEB)
    parser.add_argument("--base-path")
    args = parser.parse_args()
    manifest_path = args.web_root / "web-release-manifest.json"
    manifest = None
    if manifest_path.is_file():
        from validate_release_manifest import validate_manifest
        manifest = validate_manifest(manifest_path)
    namespace = manifest["namespace"] if manifest else ""
    base_path = args.base_path or (manifest["base_path"] if manifest else "/")
    from validate_release_manifest import base_path as validate_base_path
    validate_base_path(base_path)
    page_root = args.web_root / namespace
    required = (
        page_root / "index.html",
        page_root / "pkg" / "solar_wasm.wasm",
        page_root / "pkg" / "solar_ephemeris.wasm",
    )
    missing = [str(path) for path in required if not path.is_file() or path.stat().st_size == 0]
    if missing:
        raise FileNotFoundError("built web artifacts missing: " + ", ".join(missing))

    browser = browser_binary()
    solar_schema = next((schema for schema in manifest["schemas"] if schema.startswith("solar-state-snapshot.")), None) if manifest else json.loads((page_root / "data/latest-state.json").read_text(encoding="utf-8"))["schema_version"]
    if not solar_schema:
        raise ValueError("staged release does not declare its solar schema")
    print(f"browser smoke: {browser}")
    with serve(args.web_root, base_path, namespace) as base:
        run_smoke(base, browser, solar_schema)
    print("OK: Sun, My Sky, and interactive 3-D Solar System browser smoke tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
