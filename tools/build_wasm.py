#!/usr/bin/env python3
"""Build the Rust engines to WebAssembly in an explicit output directory.

Cross-platform, stdlib-only, and the single implementation of the wasm build —
used by local development and the read-only CI candidate build. Pages consumes
the already-tested artifact and never rebuilds it. The web source tree is not
an allowed output directory; the default is build/wasm.

Uses the dedicated wasm-release Cargo profile; native release settings are separate.
Requires cargo + the wasm target:  rustup target add wasm32-unknown-unknown
No wasm-bindgen / wasm-pack: the crates expose a raw extern "C" ABI and the web
app marshals the JSON snapshot through linear memory itself.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from wasm_provenance import BUILD_PROFILE, RECEIPT_NAME, capture_source_inputs, write_receipt

ROOT = Path(__file__).resolve().parent.parent
CRATES = ("solar-wasm", "solar-ephemeris")
TARGET = "wasm32-unknown-unknown"


def emit_compiler_diagnostics(output: str) -> None:
    """Keep Cargo's structured rustc warnings/errors visible on stderr."""
    for line in output.splitlines():
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            print(line, file=sys.stderr)
            continue
        if not isinstance(message, dict) or message.get("reason") != "compiler-message":
            continue
        diagnostic = message.get("message", {})
        rendered = diagnostic.get("rendered") if isinstance(diagnostic, dict) else None
        if isinstance(rendered, str):
            print(rendered, end="" if rendered.endswith("\n") else "\n", file=sys.stderr)
        else:
            print(line, file=sys.stderr)


def reported_wasm(output: str, crate: str) -> Path:
    """Select this successful Cargo build's artifact, including configured caches."""
    name = crate.replace("-", "_")
    candidates: list[Path] = []
    finished = []
    for line in output.splitlines():
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError("Cargo did not emit valid JSON build messages") from error
        if not isinstance(message, dict):
            raise ValueError("Cargo build message must be an object")
        if message.get("reason") == "build-finished":
            finished.append(message.get("success"))
        if message.get("reason") != "compiler-artifact":
            continue
        target = message.get("target", {})
        if not isinstance(target, dict):
            raise ValueError("Cargo artifact target must be an object")
        kinds = target.get("crate_types", [])
        if target.get("name") != name or not isinstance(kinds, list) or "cdylib" not in kinds:
            continue
        filenames = message.get("filenames")
        if not isinstance(filenames, list) or any(not isinstance(path, str) for path in filenames):
            raise ValueError("Cargo artifact filenames must be a list of paths")
        candidates.extend(Path(path) for path in filenames if Path(path).name == name + ".wasm")
    if len(finished) != 1 or finished[0] is not True or len(candidates) != 1:
        raise ValueError("Cargo must report one WASM artifact and successful build completion")
    artifact = candidates[0]
    if not artifact.is_absolute() or artifact.is_symlink() or not artifact.is_file():
        raise ValueError("Cargo-reported WASM must be an existing ordinary absolute file")
    with artifact.open("rb") as stream:
        if stream.read(8) != b"\0asm\1\0\0\0":
            raise ValueError("Cargo-reported output is not a version-1 WASM module")
    return artifact.resolve()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-root", "--out-dir", dest="out_root", type=Path, default=ROOT / "build/wasm")
    parser.add_argument("--locked", action="store_true", help="locked builds are always enforced")
    args = parser.parse_args()
    dst_dir = args.out_root.resolve()
    if dst_dir.is_relative_to(ROOT / "apps/web"):
        parser.error("WASM output must be outside the web source tree")
    dst_dir.mkdir(parents=True, exist_ok=True)
    try:
        inputs = capture_source_inputs(ROOT)
        receipt = dst_dir / RECEIPT_NAME
        if receipt.is_symlink():
            raise ValueError("symlink WASM receipt")
        receipt.unlink(missing_ok=True)
    except (OSError, ValueError) as error:
        parser.exit(1, f"ERROR: WASM source inventory: {error}\n")

    for crate in CRATES:
        print(f"Building {crate} ({BUILD_PROFILE}, {TARGET})...")
        try:
            result = subprocess.run(
                ["cargo", "build", "-p", crate, "--target", TARGET, "--profile", BUILD_PROFILE, "--locked", "--message-format=json"],
                cwd=ROOT,
                check=True,
                stdout=subprocess.PIPE,
                text=True,
                encoding="utf-8",
            )
        except subprocess.CalledProcessError as error:
            emit_compiler_diagnostics(error.stdout or "")
            raise
        emit_compiler_diagnostics(result.stdout)
        wasm = crate.replace("-", "_") + ".wasm"
        try:
            src = reported_wasm(result.stdout, crate)
        except ValueError as error:
            parser.exit(1, f"ERROR: {crate}: {error}\n")
        dst = dst_dir / wasm
        if dst.is_symlink():
            parser.exit(1, f"ERROR: symlink WASM output: {dst.name}\n")
        if src != dst:
            shutil.copyfile(src, dst)
        print(f"Staged {dst} ({dst.stat().st_size / 1024:.1f} KB)")

    try:
        write_receipt(ROOT, dst_dir, expected_inputs=inputs)
    except (OSError, ValueError) as error:
        parser.exit(1, f"ERROR: WASM source receipt: {error}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
