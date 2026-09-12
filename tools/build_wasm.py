#!/usr/bin/env python3
"""Build the Rust engines to WebAssembly in an explicit output directory.

Cross-platform, stdlib-only, and the single implementation of the wasm build —
used by local development and the read-only CI candidate build. Pages consumes
the already-tested artifact and never rebuilds it. The web source tree is not
an allowed output directory; the default is build/wasm.

Requires cargo + the wasm target:  rustup target add wasm32-unknown-unknown
No wasm-bindgen / wasm-pack: the crates expose a raw extern "C" ABI and the web
app marshals the JSON snapshot through linear memory itself.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRATES = ("solar-wasm", "solar-ephemeris")
TARGET = "wasm32-unknown-unknown"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-root", "--out-dir", dest="out_root", type=Path, default=ROOT / "build/wasm")
    parser.add_argument("--locked", action="store_true", help="locked builds are always enforced")
    args = parser.parse_args()
    dst_dir = args.out_root.resolve()
    if dst_dir.is_relative_to(ROOT / "apps/web"):
        parser.error("WASM output must be outside the web source tree")
    dst_dir.mkdir(parents=True, exist_ok=True)

    for crate in CRATES:
        print(f"Building {crate} (release, {TARGET})...")
        subprocess.run(
            ["cargo", "build", "-p", crate, "--target", TARGET, "--release", "--locked"],
            cwd=ROOT,
            check=True,
        )
        wasm = crate.replace("-", "_") + ".wasm"
        src = ROOT / "target" / TARGET / "release" / wasm
        dst = dst_dir / wasm
        shutil.copyfile(src, dst)
        print(f"Staged {dst} ({dst.stat().st_size / 1024:.1f} KB)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
