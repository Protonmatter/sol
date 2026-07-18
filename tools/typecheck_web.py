#!/usr/bin/env python3
"""Typecheck the web app's JSDoc types with tsc (no build step added to the app).

The app's ES-module specifiers carry ?v= cache tokens (see build_web.py), which
TypeScript cannot resolve — so this stages the JS into a temp tree with the tokens
stripped from import specifiers, writes a jsconfig there, and runs `tsc --noEmit`
through npx (pinned). The app itself is untouched: this is a read-only gate.

Advisory (continue-on-error) in CI until the pre-existing baseline is clean; run
locally with Node installed:  python tools/typecheck_web.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "apps" / "web"
TOKEN = re.compile(r"(\.js)\?v=[0-9a-zA-Z]+")
TSC_VERSION = "5.9.3"

JSCONFIG = {
    "compilerOptions": {
        "allowJs": True,
        "checkJs": True,
        "noEmit": True,
        "strict": False,
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "Bundler",
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "skipLibCheck": True,
    },
    "include": ["**/*.js"],
}


def main() -> int:
    sources = [ROOT / "app.js", ROOT / "engine.js"] + sorted((ROOT / "js").glob("*.js"))
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        (tmpdir / "js").mkdir()
        for src in sources:
            rel = src.relative_to(ROOT)
            text = TOKEN.sub(r"\1", src.read_text(encoding="utf-8"))
            (tmpdir / rel).write_text(text, encoding="utf-8")
        (tmpdir / "jsconfig.json").write_text(json.dumps(JSCONFIG, indent=2), encoding="utf-8")
        proc = subprocess.run(
            ["npx", "--yes", "-p", f"typescript@{TSC_VERSION}", "tsc", "-p", str(tmpdir)],
            capture_output=True,
            text=True,
        )
        if proc.stdout:
            print(proc.stdout, end="")
        if proc.stderr:
            print(proc.stderr, end="", file=sys.stderr)
        if proc.returncode == 0:
            print(f"OK: {len(sources)} files typecheck clean (tsc {TSC_VERSION})")
        return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
