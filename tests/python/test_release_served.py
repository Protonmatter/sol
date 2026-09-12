from __future__ import annotations

import importlib.util
import hashlib
import json
from pathlib import Path
import sys
import unittest
import io
import contextlib
from unittest.mock import patch
import test_release_artifact

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))


class ServedTests(unittest.TestCase):
    def test_served_verifier_compares_manifest_and_every_critical_byte(self):
        self.assertIsNotNone(importlib.util.find_spec("verify_served_release"), "served verifier missing")
        import verify_served_release as served
        fixture = test_release_artifact.ReleaseArtifactTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        root = fixture.build()
        manifest_path = root / "web-release-manifest.json"
        origin = "https://example.invalid/sol/"
        def fetch(url, limit):
            self.assertTrue(url.startswith(origin))
            data = (root / url[len(origin):]).read_bytes()
            self.assertLessEqual(len(data), limit)
            return data
        proof = served.verify(manifest_path, origin, fetch=fetch)
        self.assertEqual(proof["manifest_sha256"], hashlib.sha256(manifest_path.read_bytes()).hexdigest())
        manifest = json.loads(manifest_path.read_bytes())
        self.assertEqual(len(proof["critical_assets"]), sum(a["role"] == "critical" for a in manifest["assets"]))
        for bad_url in ("http://example.invalid/sol/", "https://user:password@example.invalid/sol/", "https://example.invalid/wrong/", "https://example.invalid/sol/?q=1"):
            with self.assertRaises(ValueError):
                served.verify(manifest_path, bad_url, fetch=fetch)
        for path in ("web-release-manifest.json", "index.html"):
            def tampered(url, limit):
                data = fetch(url, limit)
                return data + b" " if url == origin + path else data
            with self.assertRaisesRegex(ValueError, "served"):
                served.verify(manifest_path, origin, fetch=tampered)
        class Response(io.BytesIO):
            status = 200
            def __init__(self, url, data):
                super().__init__(data)
                self.url = url
            def geturl(self): return self.url
        class Opener:
            def open(self, request, timeout):
                return Response(request.full_url, (root / request.full_url[len(origin):]).read_bytes())
        with patch("verify_served_release.urllib.request.build_opener", return_value=Opener()), patch.object(sys, "argv", ["verify_served_release.py", str(manifest_path), "--origin", origin]), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(served.main(), 0)
            self.assertEqual(json.loads(output.getvalue())["manifest_sha256"], proof["manifest_sha256"])
            with self.assertRaisesRegex(ValueError, "size"):
                served.fetch_bytes(origin + "index.html", 1)
        with patch.object(sys, "argv", ["verify_served_release.py", str(manifest_path), "--origin", "http://wrong.invalid/"]), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error: served.main()
            self.assertEqual(error.exception.code, 1)
        with self.assertRaisesRegex(ValueError, "redirect"):
            served.NoRedirect().redirect_request(None, None, 302, "moved", {}, origin)
