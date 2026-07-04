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
# The token is a SHA-1 over the *tracked* HTML/JS/CSS text only, so it is reproducible from a clean
# checkout — which is exactly what lets CI gate on it (see .github/workflows/ci.yml). Build- and
# deploy-time artifacts are deliberately NOT folded in: the WASM engines (apps/web/pkg/*.wasm, built
# from source by tools/build_wasm.py) and the surface textures (apps/web/textures/, fetched by
# tools/fetch_textures.py) are both gitignored, so hashing them would tie the token to untracked
# files and make it differ between a dev machine and CI. Both still receive the stamped ?v= (any
# token bump busts them); the wasm is additionally fetched cache:"no-store", so a browser always
# pulls the freshly deployed engine regardless of its query token. The daily-changing data/ JSON is
# excluded for the same no-store reason. Re-add a glob here ONLY for assets that are committed.
ASSET_GLOBS: tuple[str, ...] = ()


def main() -> int:
    # Sort on the POSIX relative path, not Path objects: Path ordering compares native
    # separators ('/' 0x2F vs '\' 0x5C), so a future top-level name sorting between them
    # (e.g. js2.js) would order differently on Windows vs Linux and flip the hash — CI's
    # "tokens stale" gate would then fail on exactly one platform.
    rel = lambda p: p.relative_to(ROOT).as_posix()  # noqa: E731
    files = sorted(
        list(ROOT.glob("*.html")) + list(ROOT.glob("*.js")) + list(ROOT.glob("js/*.js")) + list(ROOT.glob("*.css")),
        key=rel,
    )
    # Hash content with tokens neutralised so the hash doesn't depend on the previous token.
    h = hashlib.sha1()
    for path in files:
        text = io.open(path, encoding="utf-8").read()
        h.update(TOKEN.sub("?v=", text).encode("utf-8"))
        h.update(rel(path).encode("utf-8"))
    # Fold in the binary assets' bytes (tolerating absent, e.g. gitignored, textures).
    assets = sorted({p for glob in ASSET_GLOBS for p in ROOT.glob(glob) if p.is_file()}, key=rel)
    for path in assets:
        h.update(path.read_bytes())
        h.update(rel(path).encode("utf-8"))
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
    print(f"stamped ?v={version} ({len(changed)} files updated; {len(assets)} binary assets folded into the hash)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
