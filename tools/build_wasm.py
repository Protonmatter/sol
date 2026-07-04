#!/usr/bin/env python3
"""Build the Rust engines to WebAssembly and stage them under apps/web/pkg/.

Cross-platform, stdlib-only, and the single implementation of the wasm build —
used by local dev (any OS) and by the GitHub Pages deploy workflow. The .wasm
outputs are NOT committed (apps/web/pkg/*.wasm is gitignored); they are rebuilt
from source here, so the deployed engine always matches the committed Rust.

Requires cargo + the wasm target:  rustup target add wasm32-unknown-unknown
No wasm-bindgen / wasm-pack: the crates expose a raw extern "C" ABI and the web
app marshals the JSON snapshot through linear memory itself.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRATES = ("solar-wasm", "solar-ephemeris")
TARGET = "wasm32-unknown-unknown"


def main() -> int:
    dst_dir = ROOT / "apps" / "web" / "pkg"
    dst_dir.mkdir(parents=True, exist_ok=True)

    for crate in CRATES:
        print(f"Building {crate} (release, {TARGET})...")
        subprocess.run(
            ["cargo", "build", "-p", crate, "--target", TARGET, "--release"],
            cwd=ROOT,
            check=True,
        )
        wasm = crate.replace("-", "_") + ".wasm"
        src = ROOT / "target" / TARGET / "release" / wasm
        dst = dst_dir / wasm
        shutil.copyfile(src, dst)
        print(f"Staged apps/web/pkg/{wasm} ({dst.stat().st_size / 1024:.1f} KB)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
