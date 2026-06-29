# Build the solar-core engine to WebAssembly and stage it for the web app.
#
# Requires the Rust toolchain (cargo) and the wasm target:
#   rustup target add wasm32-unknown-unknown
#
# No wasm-bindgen / wasm-pack: solar-wasm exposes a raw extern "C" ABI and the
# web app marshals the JSON snapshot through linear memory itself.

$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Building solar-wasm (release, wasm32-unknown-unknown)..."
cargo build -p solar-wasm --target wasm32-unknown-unknown --release

$src = Join-Path $root "target/wasm32-unknown-unknown/release/solar_wasm.wasm"
$dstDir = Join-Path $root "apps/web/pkg"
New-Item -ItemType Directory -Force $dstDir | Out-Null
Copy-Item $src (Join-Path $dstDir "solar_wasm.wasm") -Force

$kb = [math]::Round((Get-Item (Join-Path $dstDir "solar_wasm.wasm")).Length / 1KB, 1)
Write-Host "Staged apps/web/pkg/solar_wasm.wasm ($kb KB)"
