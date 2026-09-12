# Instructions — running and developing Sol

Updated: 2026-09-11. Commands run from the repository root. These are local operations,
not permission to acquire data, publish, deploy or install a resident service.

## Prerequisites

Use Python 3.11+, the locked Rust toolchain with an already installed
`wasm32-unknown-unknown` target, Node 22 and this repository's locked development packages.
Initial toolchain/dependency installation requires network access and is separate from
offline validation. `npm ci --ignore-scripts` is the locked install command when authorized.
No Node runtime is needed by the static deployed app.

The Python tool suite also executes the real Node smoke driver. Install the locked npm
tooling before running that suite or its coverage job, even when testing only Python.
The URL-admission regressions reject invalid inputs without launching Chromium.

## Build and serve a preview

Choose unused output directories; do not overwrite a previous candidate.

```powershell
$candidateSha = git rev-parse HEAD
python tools/build_wasm.py --locked --out-root build/wasm-review
python tools/build_web.py --wasm-dir build/wasm-review --out-root build/site-review --release-id local-review-1 --source-sha $candidateSha --repository OWNER/REPOSITORY --run-id 1
python -m http.server 8000 --bind 127.0.0.1 --directory build/site-review
```

Replace the repository placeholder with the actual local candidate identity. The staged
root selects an immutable release namespace. Stop the foreground loopback server when
finished. A dirty tree's HEAD label is not exact source correspondence; the manifest
records the final staged bytes. Do not hand-edit cache tokens, serve source as a release,
or expect file-URL workers/WASM/service workers to be a supported equivalent.

## Generate task-local demonstration data

These generators produce research fixtures, not observed-current or deployed products.

```powershell
python tools/generate_fixture_snapshot.py --out build/demo/snapshot.json --observations-out build/demo/observations.json --seed 42
python tools/generate_series.py --base build/demo/snapshot.json --out-dir build/demo/series --frames 11 --seed 42 --months-span 132
python tools/validate_snapshot.py build/demo/snapshot.json
python tools/validate_operational_readiness.py build/demo/snapshot.json
```

Standalone generated files are not automatically selected by the app. Source acquisition
and research-bundle selection use the transaction workflow in [operations](OPERATIONS.md).
Do not overwrite canonical coefficient/moon assets to make a regeneration check pass:
see [canonical generation](CANONICAL_GENERATION.md) and
[coefficient provenance](COEFFICIENT_PROVENANCE.md).

## Validate source and boundaries

```powershell
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
$env:PYTHONPATH = 'tools'
python -m unittest discover -s tests/python -p 'test_*.py' -v
python -m unittest discover -s services/ephemeris-server -p 'test*.py' -v
npm test
python tools/typecheck_web.py
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_ux_contract.py
python tools/validate_web_static.py --root apps/web
```

Configured coverage gates remain mandatory; source tests are not a substitute for them.
Use [the validation plan](VALIDATION_PLAN.md) to select additional contract, accuracy,
determinism and failure-injection tests. Record any unavailable toolchain/platform.

## Validate the staged browser

Set `CHROME_BIN` explicitly to an installed compatible Chromium executable. The Sky
harness uses `puppeteer-core` and does not discover a browser or install one. For example,
on Windows with Chrome in its standard location (adjust the path for your installation):

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path -LiteralPath $env:CHROME_BIN -PathType Leaf)) { throw 'Set CHROME_BIN to an installed Chromium executable.' }
node tools/browser_validation.mjs --web-root=build/site-review --output-dir=build/browser-review
node tools/sky_validation.mjs --web-root=build/site-review --out=coverage/sky-review
```

The Sky harness uses local fixtures and blocks external destinations. It exercises real
worker lifecycle, request/recipient boundaries, focus, invalid-state retention and narrow
reflow. Such automation does not certify screen readers, contrast, physical touch devices,
clipboard permissions or all supported browser combinations.

## What to check manually

Confirm the displayed source/provider, epoch, observer and limitations match the selected
snapshot. Keep observed imagery separate from model overlays. Check idealized cycle/gap
labels, keyboard-native selection, visible focus, persistent selected facts and cancel/error
recovery. In Sky, deny consent and verify zero remote calls; inspect the exact recipient and
share/export preview before allowing transmission. Do not infer object visibility from
refraction or use the display for navigation.

## Conventions and release boundary

Keep live snapshots immutable and reject unsupported versions. Physical calculations
remain Rust-authoritative; the browser presents validated results. All handwritten workers
stay in coverage. Follow [SDLC](SDLC.md) and [requirements](REQUIREMENTS.md); preserve
unrelated working-tree changes. Commit/publication requires separate authority.

Use [release delivery](RELEASE_DELIVERY.md) for exact-artifact verification and held
promotion. No source build or local test changes RFC 0002 from Accepted to Implemented.
