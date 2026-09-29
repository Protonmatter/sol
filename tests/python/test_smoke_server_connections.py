"""A Chromium speculative connection must not block the local smoke server."""
from __future__ import annotations

import socket
import sys
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path
from unittest import mock
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import browser_smoke


class SmokeServerConnectionTests(unittest.TestCase):
    def test_idle_preconnected_socket_does_not_block_page_request(self):
        accepted = threading.Event()
        original = browser_smoke.QuietHandler.handle

        def observe_accept(handler):
            accepted.set()
            original(handler)

        with tempfile.TemporaryDirectory(prefix="sol-smoke-connections-") as directory:
            root = Path(directory)
            (root / "index.html").write_text("smoke fixture", encoding="utf-8")
            with mock.patch.object(browser_smoke.QuietHandler, "handle", observe_accept):
                with browser_smoke.serve(root) as base:
                    accepted.clear()
                    address = urlsplit(base)
                    with socket.create_connection((address.hostname, address.port), timeout=2):
                        self.assertTrue(accepted.wait(2), "idle connection was not accepted")
                        with urllib.request.urlopen(base + "/index.html", timeout=2) as response:
                            self.assertEqual(response.status, 200)
                            self.assertEqual(response.read(), b"smoke fixture")


if __name__ == "__main__":
    unittest.main()
