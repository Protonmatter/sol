#!/usr/bin/env python3
"""Headless Chromium smoke tests for the built static Sol application.

This uses the browser already present on GitHub-hosted Ubuntu runners. It adds
no runtime or package-manager dependency to the static application.
"""

from __future__ import annotations

import argparse
import contextlib
import http.server
import shutil
import socketserver
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        pass

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/__smoke_orrery.html":
            super().do_GET()
            return
        index = (Path(self.directory) / "index.html").read_text(encoding="utf-8")
        setup = """<script>
localStorage.setItem("sol-surface", "orrery");
// ---- Harness design notes (hard-won under --virtual-time-budget) ----
// * No timeouts: virtual time fast-forwards them (a "20 s" poll expires in ~1 s real).
// * No reliance on ANIMATION TIMING: virtual-time rAF deltas were observed from 50 ms down
//   to 0.17 ms, so no crank rate can guarantee a per-frame step that trips the moons'
//   Nyquist guard. Independently registered rAF chains and MutationObserver callbacks also
//   starve nondeterministically.
// * Instead: a synchronous state machine advanced by BOTH a setInterval(50) and a rAF pump
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
addEventListener("load", () => {
  const storeLink = document.querySelector('link[href^="js/store.js"]');
  const timeLink = document.querySelector('link[href^="js/orreryTime.js"]');
  const orreryLink = document.querySelector('link[href^="js/orrery.js"]');
  if (storeLink && timeLink && orreryLink) {
    Promise.all([
      import("./" + storeLink.getAttribute("href")),
      import("./" + timeLink.getAttribute("href")),
      import("./" + orreryLink.getAttribute("href")),
    ])
      .then(async ([storeModule, timeModule, orreryModule]) => {
        smokeStore = storeModule.store;
        smokeTime = timeModule;
        // Exercise the real destination control. The previous localStorage-only setup could
        // initialize the renderer through this harness while leaving the application tab in
        // its default state, which made the aggregate assertion both brittle and incomplete.
        const tab = document.querySelector('.mode-button[data-mode="orrery"]');
        tab?.click();
        // Join the app's in-flight lifecycle promise instead of guessing when lazy WASM
        // and moon initialization have completed under virtual time.
        await orreryModule.enterOrrery();
        if (tab?.getAttribute("aria-pressed") === "true"
            && document.body.dataset.surface === "orrery") {
          document.body.dataset.smokeMode = "yes";
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
    const rows = document.querySelectorAll("#orreryPositions .orrery-pos-moon").length;
    body.dataset.smokeMoonRows = String(rows);
    const backend = document.getElementById("orreryBackend");
    if (o && smokeTime && rows >= 21 && backend && backend.textContent.includes("WebGL2")) {
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
        index = index.replace('<script type="module" src="app.js', setup + '\n    <script type="module" src="app.js')
        payload = index.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def browser_binary() -> str:
    for candidate in (
        "google-chrome-stable",
        "google-chrome",
        "chromium-browser",
        "chromium",
    ):
        path = shutil.which(candidate)
        if path:
            return path
    raise FileNotFoundError("no Chromium-compatible browser found on PATH")


@contextlib.contextmanager
def serve(directory: Path):
    handler = lambda *args, **kwargs: QuietHandler(  # noqa: E731
        *args, directory=str(directory), **kwargs
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
                        f"http://127.0.0.1:{port}/index.html", timeout=1
                    ).read(1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.05)
            yield f"http://127.0.0.1:{port}"
        finally:
            server.shutdown()
            thread.join(timeout=2)


def browser_args(profile: str) -> list[str]:
    return [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-features=Translate,OptimizationHints",
        "--disable-sync",
        "--enable-logging=stderr",
        "--log-level=1",
        "--use-angle=swiftshader",
        "--use-gl=angle",
        "--run-all-compositor-stages-before-draw",
        # Generous budget: the moons module + Earth surface map load lazily after first paint,
        # and on a slow shared runner the old 15 s budget expired before the 21 moon rows
        # rendered — the recurring "moon smoke timing" flake (ready=no, rows<21) on master
        # pushes that had passed identical content on the PR minutes earlier.
        "--virtual-time-budget=40000",
        f"--user-data-dir={profile}",
    ]


def dump_dom(browser: str, url: str) -> tuple[str, str]:
    with tempfile.TemporaryDirectory(prefix="sol-browser-") as profile:
        result = subprocess.run(
            [
                browser,
                *browser_args(profile),
                "--dump-dom",
                url,
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=180,  # 120 s flaked once the committed moon mosaics joined the SwiftShader load (PR #71 run 31980907901)
            check=False,
        )
    if result.returncode != 0:
        raise RuntimeError(
            f"browser exited {result.returncode} for {url}\n{result.stderr[-4000:]}"
        )
    return result.stdout, result.stderr


def capture_screenshot(browser: str, url: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="sol-browser-") as profile:
        screenshot_path = Path(profile) / "orrery.png"
        result = subprocess.run(
            [
                browser,
                *browser_args(profile),
                "--window-size=1280,900",
                f"--screenshot={screenshot_path}",
                url,
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=180,  # 120 s flaked once the committed moon mosaics joined the SwiftShader load (PR #71 run 31980907901)
            check=False,
        )
        image = screenshot_path.read_bytes() if screenshot_path.is_file() else b""
    if result.returncode != 0:
        raise RuntimeError(
            f"browser exited {result.returncode} for screenshot {url}\n"
            + result.stderr[-4000:]
        )
    return image


def assert_no_runtime_failure(dom: str, stderr: str, surface: str) -> None:
    failures = (
        "Loading snapshot.",
        "Base: loading",
        "Sky engine unavailable",
        "WebAssembly module failed to load",
        "Uncaught TypeError",
        "Uncaught ReferenceError",
        "SyntaxError:",
    )
    combined = dom + "\n" + stderr
    found = [marker for marker in failures if marker in combined]
    if found:
        raise AssertionError(f"{surface}: runtime failure markers present: {found}")
    console_errors = [
        line
        for line in stderr.splitlines()
        if "CONSOLE" in line.upper() and "ERROR" in line.upper()
    ]
    if console_errors:
        raise AssertionError(
            f"{surface}: browser console errors:\n" + "\n".join(console_errors[-20:])
        )


def run_smoke(base: str, browser: str) -> None:
    sun_dom, sun_stderr = dump_dom(browser, f"{base}/index.html")
    assert_no_runtime_failure(sun_dom, sun_stderr, "Sun")
    if "solar-state-snapshot.v2" not in sun_dom:
        raise AssertionError("Sun: rendered schema version was not solar-state-snapshot.v2")
    if 'id="regionList"' not in sun_dom or "data-region-id" not in sun_dom:
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
    if "browser/device timezone" not in sky_dom:
        raise AssertionError("My Sky: civil-time timezone disclosure is missing")

    orrery_url = f"{base}/__smoke_orrery.html"
    expected = (
        'data-smoke-mode="yes"',
        'data-smoke-ready="yes"',
        'data-smoke-moon-rows="21"',
        'data-smoke-default-speed="yes"',
        'data-smoke-sun-detail="yes"',
        'data-smoke-speed="yes"',
        'data-smoke-paused="yes"',
        'data-smoke-aliasing="yes"',
        'data-smoke-reset="yes"',
        'data-smoke-validity="yes"',
        'data-smoke-done="yes"',
    )
    # Bounded retry for LOAD-scheduler roulette only: under --virtual-time-budget, headless
    # Chrome occasionally starves the app's own lazy module imports (the moons catalogue
    # never arrives, `ready` never fires) no matter what the harness does — measured at
    # roughly one run in ten, uncorrelated with content. Once the page IS ready, every check
    # is a synchronous injected-step repaint and deterministic, so a genuine regression
    # fails identically on every attempt and retries cannot mask it.
    attempts = 3
    for attempt in range(1, attempts + 1):
        orrery_dom, orrery_stderr = dump_dom(browser, orrery_url)
        assert_no_runtime_failure(orrery_dom, orrery_stderr, "Solar System")
        missing = [m for m in expected if m not in orrery_dom]
        if not missing:
            break
        # Surface the page's own diagnostics: trapped errors, the actual marker values, and
        # the accuracy line — a missing marker alone says nothing about WHY.
        import re as _re
        body_tag = _re.search(r"<body[^>]*>", orrery_dom)
        acc = _re.search(r'id="orreryAccuracy"[^>]*>([^<]*)<', orrery_dom)
        detail = (
            "Solar System: 3-D/moon interaction assertions failed"
            + f" (attempt {attempt}/{attempts}): " + ", ".join(missing)
            + "\n  body: " + (body_tag.group(0)[:900] if body_tag else "<none>")
            + "\n  accuracy: " + (acc.group(1)[:300] if acc else "<none>")
        )
        if attempt == attempts:
            raise AssertionError(detail)
        print(f"RETRY: {detail}")
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
    args = parser.parse_args()
    required = (
        args.web_root / "index.html",
        args.web_root / "pkg" / "solar_wasm.wasm",
        args.web_root / "pkg" / "solar_ephemeris.wasm",
    )
    missing = [str(path) for path in required if not path.is_file() or path.stat().st_size == 0]
    if missing:
        raise FileNotFoundError("built web artifacts missing: " + ", ".join(missing))

    browser = browser_binary()
    print(f"browser smoke: {browser}")
    with serve(args.web_root) as base:
        run_smoke(base, browser)
    print("OK: Sun, My Sky, and interactive 3-D Solar System browser smoke tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
