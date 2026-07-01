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

$dstDir = Join-Path $root "apps/web/pkg"
New-Item -ItemType Directory -Force $dstDir | Out-Null

foreach ($crate in @("solar-wasm", "solar-ephemeris")) {
    Write-Host "Building $crate (release, wasm32-unknown-unknown)..."
    cargo build -p $crate --target wasm32-unknown-unknown --release
    $wasm = ($crate -replace "-", "_") + ".wasm"
    $src = Join-Path $root "target/wasm32-unknown-unknown/release/$wasm"
    Copy-Item $src (Join-Path $dstDir $wasm) -Force
    $kb = [math]::Round((Get-Item (Join-Path $dstDir $wasm)).Length / 1KB, 1)
    Write-Host "Staged apps/web/pkg/$wasm ($kb KB)"
}
