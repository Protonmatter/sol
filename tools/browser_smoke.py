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
const smokeWait = async (test, timeout = 20000) => {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (test()) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
};
addEventListener("load", async () => {
  const body = document.body;
  const ready = await smokeWait(() =>
    document.querySelectorAll("#orreryPositions .orrery-pos-moon").length >= 21
    && document.getElementById("orreryBackend")?.textContent.includes("WebGL2"));
  body.dataset.smokeReady = ready ? "yes" : "no";
  body.dataset.smokeMoonRows =
    String(document.querySelectorAll("#orreryPositions .orrery-pos-moon").length);
  await new Promise(resolve => setTimeout(resolve, 500));
  const accuracy = document.getElementById("orreryAccuracy");
  body.dataset.smokeAliasing =
    accuracy?.textContent.includes("inner moon") ? "yes" : "no";
  const animate = document.getElementById("orreryAnimate");
  animate.checked = false;
  animate.dispatchEvent(new Event("change", { bubbles: true }));
  // The app stops its animation loop when Animate is unticked. Headless Chrome's virtual-time
  // controller may then leave requestAnimationFrame callbacks pending indefinitely, so wait on
  // a bounded timer instead. The change handler paints and updates the accuracy line synchronously.
  await new Promise(resolve => setTimeout(resolve, 100));
  body.dataset.smokePaused =
    !accuracy?.textContent.includes("inner moon") ? "yes" : "no";
  const time = document.getElementById("orreryTime");
  time.value = "10";
  time.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 100));
  body.dataset.smokeValidity =
    accuracy?.textContent.includes("Moons hidden — outside") ? "yes" : "no";
  body.dataset.smokeDone = "yes";
});
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
            timeout=45,
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
            timeout=45,
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
    orrery_dom, orrery_stderr = dump_dom(browser, orrery_url)
    assert_no_runtime_failure(orrery_dom, orrery_stderr, "Solar System")
    expected = (
        'data-mode="orrery" aria-pressed="true"',
        'data-smoke-ready="yes"',
        'data-smoke-moon-rows="21"',
        'data-smoke-aliasing="yes"',
        'data-smoke-paused="yes"',
        'data-smoke-validity="yes"',
        'data-smoke-done="yes"',
    )
    missing = [marker for marker in expected if marker not in orrery_dom]
    if missing:
        raise AssertionError(
            "Solar System: 3-D/moon interaction assertions failed: " + ", ".join(missing)
        )
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
