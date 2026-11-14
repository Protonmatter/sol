# Current-source offline readiness crosscheck — 2026-11-05

The current checkout passes its Rust/Python regression suites and web typecheck.
Fresh offline compilation reproduces both WASM engines byte for byte against
the browser-tested baseline and isolated guarded candidate. This establishes
current local source/artifact correspondence. The CLI correction below then
extends the passing Rust workspace count to228, with no WASM change. Production
qualification remains incomplete. Illustrative Earth remains the user-approved default.

## Initial observed commands, before the CLI correction

| Command | Actual result |
| --- | --- |
| `cargo fmt --all -- --check` | Exit0 |
| `cargo test --workspace --locked --offline` | Exit0;224 passed, zero failed or ignored |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | Exit0 |
| `PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py' -v` | Exit0;729 passed |
| `PYTHONPATH=tools python -m unittest discover -s services/ephemeris-server -p 'test_*.py' -v` | Exit0;39 passed |
| `python tools/typecheck_web.py` | Exit0;124 files, installed TypeScript5.9.3 |
| `python tools/validate_body_constants.py` | Exit0;retained body-source pins and shader hygiene |
| `python tools/validate_body_motion.py` | Exit0;10 measured bodies,21 moon periods, all7 speed presets |
| `python tools/validate_accuracy_evidence.py` | Exit0;eight source-theory parity records, no independent accuracy claim |
| `python tools/validate_moons.py --require-canonical` | Exit1;current host lacks the required canonical runtime/image attestation |
| `python tools/validate_moons.py` | Exit1;noncanonical element regeneration differs from reviewed bytes |

The observed host is Windows ARM64, CPython3.14.3 and Rust1.96.0. Those host
conditions differ from pinned CI and the canonical moon generator. These results
do not substitute for hosted CI, physical browser/mobile, manual accessibility or
continuous astronomical accuracy qualification. The two moon failures remain
failed, rather than being relabeled as passing checks.

## Fresh engine-to-artifact correspondence

The existing builder runs offline with a new Cargo target directory and output
directory. Both required WASM target/toolchain components were already installed.
No source, dependency or staged artifact is replaced.

```powershell
$env:CARGO_NET_OFFLINE = 'true'
$env:CARGO_TARGET_DIR = Join-Path (Get-Location) 'build/offline-readiness-20261105-01/wasm-cargo-target'
python tools/build_wasm.py --locked --out-root build/offline-readiness-20261105-01/wasm
```

Actual byte comparison, sizes and SHA-256 agree across the fresh build, baseline
`local-canvas-focus-20261104`, and `/sol/` candidate `local-guarded-sol-20261105`:

| Engine | Bytes | SHA-256 |
| --- | ---: | --- |
| `solar_wasm.wasm` | 127124 | `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199` |
| `solar_ephemeris.wasm` | 1810907 | `2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2` |

All207 main browser source owners also remain identical to the baseline's
recorded source hashes. The guarded shader is still isolated. See its separate
[Windows application results and Linux retrieval boundary](GUARDED_APP_QUALIFICATION_20261105.md).

## Moon failure diagnosis and preserved assets

Read-only source admission passes. In-memory generation yields exactly the
Windows hash already recorded in [canonical generation](CANONICAL_GENERATION.md):
the catalogue stays identical, while the element module differs at byte843512.
The observed serialized context contains `-1.122131396721` versus the reviewed
`-1.12213139672`. This identifies the retained host-dependent rounding difference;
it does not isolate its unique cause or invalidate the existing native-image
qualification.

- `moons.js` stays SHA-256 `0fe13220d6214d62a6b472f5cc8e2ccb2f8fbfaeb7eb1d5e611b40c272a90f51`.
- In-memory Windows `moonelements.js` is `3353c5e2ff630c78b25c4f61a62fd5d97718d271ad051a87c2d77dc620f70f09`.
- The preserved reviewed element module is `e1dfc8d737bf92c96cc132756c7e13e0c6bb9a6c49b86654996bb472112be05f`.
- The current qualified generation manifest remains `e994a31d8043bc33ff640b01825bdf2ceed75970073ff6df46bcb257785e4dcb`.

The exact current native-image/source qualification remains documented in the
[2026-11-04 refresh](CANONICAL_MOON_REFRESH_20261104.md). No generated asset,
model, formatting rule, budget or qualification metadata changes in this check.
The README's stale claims of unavailable coefficient reconstruction and pending
canonical moon qualification are corrected to match those existing contracts.
Coefficient distribution/notice clearance remains held.

## Verified CLI input correction

The public `sky` binary previously panics with exit101 on malformed numbers and
invalid Unicode, and silently ignores arguments after the fourth. The narrow
change in `crates/solar-ephemeris/src/bin/sky.rs` requires exactly four arguments,
uses fallible OS-string/numeric conversion and returns exit2 with an argument
label and usage text. It does not echo the supplied value. The existing numerical
calls, valid argument order and engine error-JSON behavior remain unchanged.

The four executable integration tests first expose the malformed/count failures
and invalid-Unicode failure, then all pass. They also preserve successful snapshot
output and the engine's rejection of nonfinite epochs. The Windows invalid
argument contains an unpaired UTF-16 surrogate; the Unix invalid-byte case is
inspected but not executed on this host. A valid-output assertion initially
assumes compact JSON and is corrected to accept whitespace; that intermediate
failure is retained separately from the product defects.

Post-fix validation:

- `cargo test -p solar-ephemeris --test sky_cli_contract --locked --offline`:4 passed.
- `cargo test --workspace --locked --offline`:228 passed, zero failed or ignored.
- `cargo clippy --workspace --all-targets --locked --offline -- -D warnings`:exit0.
- `cargo fmt --all -- --check`:exit0.
- Fresh offline release CLI plus the original pointing validator and retained
  `horizons-observer-20261103` pack:36/36 cases pass.
- The original range validator and retained `horizons-ranges-20261103` pack:72/72
  checks pass. Neither run makes a network request or changes a budget.
- A fixed valid request retains every JSON value and LF-normalized output byte.
  Raw captures differ only because the earlier PowerShell merged capture inserts
  128 CRLF pairs; direct subprocess capture uses LF. Raw byte identity across those
  two different capture boundaries is not claimed.
- Both rebuilt post-fix WASM files remain byte-identical to the initial fresh
  builds, baseline and guarded candidate.

Only `sky.rs` changes among the244 earlier recorded source files, and the new
integration test is added. No orbital library, coefficient, Earth look, generated
moon asset or staged browser source changes. The read-only independent review
`/root/review_sky_cli_contract` finds no actionable P0–P3 issue in the exact CLI
source/test/documentation delta, with no test or release claim by that reviewer.

The later, separately retained CLI receipt is
`build/offline-readiness-20261105-01/cli-fix-summary.json`, SHA-256
`e4ae41a3e238da8bb4c40445bf50f53a9944c658f3af58dd30295efef4475017`.
The earlier224-test summary below is not relabeled as the post-fix run.

## Retained evidence and remaining work

Ignored local output is `build/offline-readiness-20261105-01/`. It retains actual
command logs, the in-memory moon diagnostic, fresh WASM and a summary with244
source fingerprints at recording. Summary SHA-256:
`6c8a3fcdc31f420d0cadd9a8d75a0c99e0b0de32e076aa8a0be280fbaf1ec0e7`.
Its status is `incomplete_qualification`, with `qualification_granted:false`.

The existing Linux browser run is retained without restart. The currently
available browser API explicitly reports local browser use disabled in Work
settings. Its result and live cleanup require supported access to that existing
run. Independent continuous accuracy, upstream notice/distribution clearance,
manual/platform acceptance and exact hosted release evidence remain separate
requirements. No commit, push, deployment or license change occurs.
