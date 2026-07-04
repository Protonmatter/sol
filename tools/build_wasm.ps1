# Build the Rust engines to WebAssembly and stage them under apps/web/pkg/.
#
# Thin Windows entry point that delegates to tools/build_wasm.py so there is a
# single cross-platform implementation of the build (see that file for details).
#
# Requires the Rust toolchain (cargo) and the wasm target:
#   rustup target add wasm32-unknown-unknown

$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
python (Join-Path $PSScriptRoot "build_wasm.py")
