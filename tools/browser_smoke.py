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


def dump_dom(browser: str, url: str) -> tuple[str, str]:
    with tempfile.TemporaryDirectory(prefix="sol-browser-") as profile:
        result = subprocess.run(
            [
                browser,
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
                "--virtual-time-budget=10000",
                f"--user-data-dir={profile}",
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
    print("OK: Sun and My Sky browser smoke tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
