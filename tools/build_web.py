#!/usr/bin/env python3
"""Stamp a single content-hash cache-busting token across the static web app.

Replaces the old error-prone "bump ?v=N by hand in 14 files" workflow. Computes one SHA-1 over
all HTML/JS/CSS bytes (with the existing ?v tokens neutralised so the hash is stable), then writes
that hash into every `?v=...` query in the HTML and JS. The token only changes when real content
changes, and every reference moves together — so a stale-module mismatch is impossible.

Run after editing anything under apps/web:  python tools/build_web.py
"""

from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "apps" / "web"
TOKEN = re.compile(r"\?v=[0-9a-zA-Z]+")


def main() -> int:
    files = sorted(list(ROOT.glob("*.html")) + list(ROOT.glob("*.js")) + list(ROOT.glob("js/*.js")) + list(ROOT.glob("*.css")))
    # Hash content with tokens neutralised so the hash doesn't depend on the previous token.
    h = hashlib.sha1()
    for path in files:
        text = io.open(path, encoding="utf-8").read()
        h.update(TOKEN.sub("?v=", text).encode("utf-8"))
        h.update(path.name.encode("utf-8"))
    version = h.hexdigest()[:10]

    changed = []
    for path in files:
        if path.suffix == ".css":
            continue  # CSS has no ?v references of its own; it is only referenced from HTML
        text = io.open(path, encoding="utf-8").read()
        new = TOKEN.sub(f"?v={version}", text)
        if new != text:
            io.open(path, "w", encoding="utf-8", newline="\n").write(new)
            changed.append(path.name)
    print(f"stamped ?v={version} ({len(changed)} files updated)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
