# Native Linux precision and compiler qualification — 2026-11-04

The earlier, pre-EOP-update numerical candidate passes the complete fixed 1900–2200 sampled
matrix on native Google Cloud Shell Linux x86-64 as well as Windows ARM64.
Each platform passes all 109,900 comparisons at the unchanged budgets. This
extends the evidence for the [approved precision target](PRECISION_WINDOW_20261104.md);
production, hosted CI and continuous observer/event qualification remain pending.
The subsequent [EOP/clock/angle implementation](EOP_HISTORY_20261104.md) changes
the runtime and requires fresh native evidence. Its completed Linux verification
is recorded in the [native EOP report](NATIVE_EOP_20261104.md);
this original report remains tied to its own frozen inputs and artifacts.

## Frozen inputs and native run

Only an allowlisted project snapshot was transferred into a new temporary
Cloud Shell directory. The snapshot contains 543 files, 17,543,182 uncompressed
bytes, with each member's size and SHA-256 recorded. Its archive is 4,970,709
bytes, SHA-256 `418734cd5e44ed420f120559952998c80429ead7f394635bcd1b272e5308548d`;
the input-manifest hash is
`a8e0391f0f54bb4db0fedcd3e50a1c0a5bb51b1c5e7510d07a42bee015464ba8`.
Archive/member identities were verified before extraction. No Cloud API grant,
project setting change or paid VM creation was performed.

The observed host is Linux x86-64 with Python 3.12.3. Official Rust 1.96.0 and
the WASM target were installed only into isolated temporary tool storage.
The actual compiler is commit `ac68faa20c58cbccd01ee7208bf3b6e93a7d7f96`,
LLVM 22.1.2, host `x86_64-unknown-linux-gnu`. Cargo builds/tests used locked
offline inputs, two build/test threads and explicit command deadlines.

| Native command | Result |
| --- | --- |
| `cargo test --workspace --locked --offline -- --test-threads=2` | 205 tests pass |
| `python -m unittest discover -s tests/python -p "test_precision_window*.py" -v` | 20 controls pass |
| `python tools/validate_precision_window.py --out-dir build/linux-model-validation` | 3,925 epochs, 74,575 model records, 109,900 checks, zero failures |
| Two `solar-cli simulate` runs, 48 one-hour steps, seed 42, activity 0.9 | Same bytes twice and equal to both Windows reference runs |
| `python tools/build_wasm.py --out-dir build/linux-wasm` | Both release modules built successfully |

All 543 input hashes stayed unchanged. The deterministic solar JSON hash is
`0e9cd0880cf9b839f8e81cdc3747450623fe882752faacb777f1b671deae00a2`;
repeatability is a separate property from independent physical solar accuracy.

The Linux numerical summary hash is
`d6d2919fffa3aa935395b30a20dfe5cdb8eaf0fc74bb0f328ac93583858a8e3b`.
The complete comparison CSV hash is
`cc3adfeada860158b2e89d6cd8be72a41f52740e07c04e3d319df0e8cb6470cb`.
Small platform floating-point differences are retained; both reports separately
pass the independent references. The largest full-vector, pointing and absolute
range residuals are respectively 6.418395785 arcseconds equivalent, 1.939378246
arcseconds and 4,023.576800 km, matching the recorded Windows extrema.

The returned evidence archive is 10,663,638 bytes, SHA-256
`7f6e4136718aae802d84c53fa9e60d36c950a71aabf1bfeb1118ec7df01e4aeb`.
All 22 enclosed files were verified against the evidence manifest before safe
local extraction under `build/native-precision-20261104/received/`.
A truncated first transfer failed its checksum and was rejected. Six individually
hashed transfer parts reproduced the exact original archive. The bounded
loopback preview used for transfer closed after verified acknowledgement.

## WASM identity discrepancy and complete binary explanation

The original run receipt remains `passed: false`, SHA-256
`9e42292e7842d6568bd15b763adb469aa0f21bdcaefb3fce58dbab22dd43801a`.
All six subprocesses exited zero; only the two cross-host WASM byte-identity
assertions failed. Those failures have not been erased or relabelled as passes.

| Module | Linux bytes | Linux SHA-256 |
| --- | ---: | --- |
| `solar_ephemeris.wasm` | 1,148,706 | `0d84516dba561f42655b99bcdf96e74af1f3ffeb7810a142afb6cd7e9cbfdd73` |
| `solar_wasm.wasm` | 127,124 | `eb0fe6fbd28296d0bb877e9b6008e4628141b62155f738a2fceebe16cf688f9b` |

An independent read-only binary review decoded every function and all nine
sections, then reconstructed each complete Linux file from its Windows
counterpart. The only required transformations were 16/29 function-index
permutations, the solar module's type-index swap 34/35, and 27/21 diagnostic
path separator bytes. The reconstructed full hashes exactly equal the original
Linux hashes. No Linux instruction or data bytes were copied into the result.

Every floating-point instruction/immediate, coefficient/numerical data byte,
data address, non-index operand, memory/table/global declaration, ABI export
and mapped indirect-call slot is preserved. Four negative controls independently
mutating a floating immediate or non-path data bit were rejected. A fresh clean
offline Windows build reproduced both original Windows hashes exactly.

The exact proofs and decoder are retained under
`build/wasm-binary-review-20261104/`, including `REVIEW.md`, both module
`.initial.json` reports, `negative-controls.json` and `compare_wasm.py`.
The index/path transformations fully account for the observed bytes. Their
likely cause is host/profile-dependent compiler/link ordering and native source
paths; the precise internal ordering seed has not been traced. These findings
apply only to the inspected bytes and do not
establish general future cross-host binary identity.

The Linux modules are staged in `build/production-20261104-linux-precision-site`,
release `local-linux-precision-20261104`, manifest SHA-256
`88a227f9a6b0fb736a8d244e78769e88597f84f2b43ad358fcccd91de938e249`.
The actual Sky worker passes 34 full 117-body snapshots, including years 1/9999,
with 576 independent pointing/range assertions and no page errors. Maximum wall
time is 4,014.1 ms at the unchanged 10,000 ms deadline. Receipt
`coverage/precision-linux-worker-20261104.json` has SHA-256
`b73f08920de3ba2a2fc0543d829a99801a17d2c7ff8fe6dcb18c5753c15f2013`.
This is execution of Linux-built WASM in Windows Chrome, separate from Linux
GPU/browser acceptance and physical-device performance.

The complete staged SwiftShader browser scenario also passes, including real
WASM, source playback, Sky/System interactions, appearance and moon-shadow
assertions. Receipt `coverage/precision-linux-browser-20261104/browser-evidence.json`
has SHA-256 `af2b2895c552edc5240ff50bdd887c6637e3b2eb4340b8d2c5d7a9d50abe24f8`.
Its source-bound whole-web merge covers 17,786/18,234 lines, 97.54%, at the
unchanged 90% floor; generated catalogue exclusions are unchanged and all
hand-written workers remain in the denominator. The merge-summary hash is
`e753a21ec27ee6536cb8315c28a8de446e8f0995d226f68536ab67d2ad112fd0`.
The reused denominator-complete Node map measures the same original runtime
source bytes, whose staged correspondence is checked by the coverage tools.

The expanded native GPU command passes 20 checks with 20 captures:

```text
node tools/physical_rendering_validation.mjs --web-root=build/production-20261104-linux-precision-site --out=coverage/precision-linux-physical-native-context-20261104 --backend=native --context-loss --mars-optical-animation
```

The actual context identifies Qualcomm Adreno X1-85 through ANGLE/D3D11.
Checks cover Sun source playback, Earth layers, Moon/Mars terrain, real context
loss/restoration, 390-pixel layout and animated physical Mars level-4 geometry
with optical fields and matching HDR final draws. The five submitted Mars
animation draws meet the original 5,000 ms deadline. There are no current/staged
source differences or page, console, shader or WebGL errors. Receipt
`coverage/precision-linux-physical-native-context-20261104/evidence.json`
has SHA-256 `0ecbc556b4db8c4a26149b2c467108ecb544eaf9e39584f5e4e147c9b20b3315`.
Earth and restored Mars screenshots were visually inspected. The staged
Sun/My Sky/interactive 3D System browser smoke also passes with installed Chrome.

The preceding 19-check native run is retained separately: its command omitted
`--context-loss`, so it supplies no restoration evidence. The expanded run
above supplies that missing case without changing any product or test deadline.

## Compiler drift correction and current source correspondence

Review found that several workflows pinned the Rust installer action but
omitted its compiler input, selecting floating `stable`. The local default
could also drift. The source now has a canonical root `rust-toolchain.toml`
selecting released Rust 1.96.0, explicit matching qualification workflow inputs,
and source-policy checks for omitted/floating/partial/duplicate selections.
Fuzzing explicitly installs and runs its tooling with nightly.

Release capture, collection and outer-evidence admission now reject actual
compiler/Cargo version drift. Seven regression tests cover source policy,
workflow syntax/key-order controls and stale runtime provenance. Independent
review caught and closed a named-step bypass before acceptance. Existing
release interfaces and minimum-Rust declarations remain unchanged.

The native snapshot predates this policy fix. All crate records and root Cargo
inputs remain byte-identical. Within the frozen snapshot only
`tools/validate_apparent.py` and `tools/validate_precision_window.py` changed,
to include/copy/hash the new root policy; numerical observation and comparison
formulas are unchanged. This distinction prevents treating the old validator
hashes as current hashes.

A fresh Windows run with the current policy bound in its receipt again passes
all 109,900 comparisons. Its summary
`build/precision-pinned-validation-20261104/summary.json` has SHA-256
`97e1ab3a27e0728b4e8ff56aa03e6d048d2efd1a6c9b204063a0f2d08f393271`;
observer receipt hash is
`94d89fcd6b6ec7b0c0a0bc0880d3232578ade7eb242d2886666952b0550da747`.
Its complete comparison CSV is byte-identical to the previous Windows result,
SHA-256 `2e3838d2eb05f623554404522674211f0bc359c6e7f5c2795036b811a4aa83a5`.
The new named local compiler rebuild also reproduces both previous Windows
WASM hashes exactly.

The refreshed full Python suite passes 610 repository tests and 39 provider
tests. Its unchanged CI-selected statement/branch gate passes 90.6441918202%;
statement coverage separately is 93.2487804878%. Receipt
`coverage/precision-pinned-python-20261104-receipt.json` has SHA-256
`0da4d3c4878ada164175252625f00f9e47db8b9be138e7f489fbd5d42accf4f9`.
This run uses local Python 3.14.3/coverage 7.13.5, separate from CI's pinned
Python 3.12/coverage 7.15.2. A real current build-provenance capture also accepts
the observed released Rust/Cargo 1.96.0 identities.

Independent read-only evidence review rehashed both archives and all declared
members, checked the source/receipt/log links and recomputed all 109,900
comparisons from the 74,575 retained native records with zero failures.
Its receipt `build/native-evidence-chain-review-20261104/receipt.json` has
SHA-256 `4720fbc278bfa2a5eedb9d36cf7d809157415980fda66ebaba046a8a1b2ce5d8`.
Every maximum and worst budget-use sample identity agrees. Local replay has
tiny platform-dependent metric differences, at most 4.8876e-11 arcseconds,
without changing decisions. This review replays retained evidence; it is not
a second observation of the remote filesystem or cloud settings.

## Remaining scope and rollback

Hosted job execution, protected qualification, publication, full platform
acceptance and continuous observer/event accuracy remain pending. UI accuracy
and scientific registry status remain unvalidated. The current minimum-Rust
compatibility declaration has not been exercised. Distribution notice/package
correspondence remains held. No commit, push or deployment occurred.

Compiler rollback must restore the root policy, explicit workflow versions and
evidence admission policy together, then rebuild and requalify fresh artifacts.
Do not reuse evidence whose compiler/source/binary identities differ. Existing
coefficient rollback instructions remain in the precision report. The native
run used isolated temporary storage and changed no application or production
infrastructure settings.
