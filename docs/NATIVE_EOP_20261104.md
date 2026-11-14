# Native Linux EOP, clock and angle verification — 2026-11-04

The current [EOP/clock/angle candidate](EOP_HISTORY_20261104.md) passes fresh
native Google Cloud Shell Linux x86-64 verification. All 15 bounded commands
exit zero, including 222 Rust tests, 40 focused Python controls, original
public-reader/observer checks and all 109,900 independent model comparisons.
The actual Linux-built WASM also passes the worker, complete browser and native
Adreno rendering checks in Windows Chrome. This extends local evidence without
claiming Linux GPU, hosted CI, continuous physical accuracy or production release.

## Frozen inputs and native environment

The allowlisted snapshot contains 571 files, 22,157,326 uncompressed bytes.
Its 6,543,719-byte archive has SHA-256
`4ef8a9bf356af1ff18b0fdd8162d4edd179fac321a58891f0498e03858abd3bc`.
The input-manifest SHA-256 is
`8685812f057c0118d30e3495f1f5d3f30dd6ebfe4c53cda6e30f9e2f5529b9a4`.
It includes current numerical source/data, the EOP source/format/checksum
records, existing public fixtures, exact reader sources and Windows baselines.
No credentials or unrelated home files are selected. Every tar member is an
ordinary canonical file with a pinned size/hash; verification precedes extraction.

The discovered host is native Linux x86-64, Python 3.12.3 and Node v24.22.1.
Official Rust 1.96.0 and its WASM target were installed only under the fresh
`/tmp/sol-eop-linux-20261104-outbpojx` directory. Actual compiler identity is
commit `ac68faa20c58cbccd01ee7208bf3b6e93a7d7f96`, LLVM 22.1.2,
host `x86_64-unknown-linux-gnu`. Cargo/test parallelism is limited to two;
model/build commands use locked offline inputs and explicit deadlines.
All 571 input hashes remain unchanged after execution.

The earlier temporary VM/toolchain directory was absent, so this is a fresh
installation and run. No default/home compiler, Cloud API grant, project
setting, paid VM, application dependency or production system changed.
The base revision is still `3a55a795767f3043112673ea561cdaf6dc7e2d0f`;
content hashes identify the uncommitted candidate rather than that ancestry alone.

## Native commands and results

| Command or retained scenario | Result |
| --- | --- |
| `cargo test --workspace --locked --offline -- --test-threads=2` | All 222 tests pass |
| `python -m unittest discover -s tests/python -p 'test_precision_window*.py' -v` | All 20 controls pass |
| `python -m unittest discover -s tests/python -p test_eop_generation.py -v` | All 14 controls pass |
| `python -m unittest discover -s tests/python -p test_ephemeris_v3.py -v` | All 6 controls pass |
| `python tools/generate_eop.py --check` | All 20,031 source rows match the runtime table |
| Two fresh `generate_eop.py --out-dir` runs | Both 661,039-byte outputs exactly match the shipped table |
| `python tools/check_eop_freshness.py` | Passes the existing prediction-coverage control |
| Release `sky` CLI build and offline `validate_ephemeris.py` helper | All 36 retained body/site/time observations pass |
| Six original native public snapshots, actual Python and Node readers | All admitted; epoch/latitude/longitude/elevation independently bound to each original request |
| `python tools/validate_precision_window.py --out-dir build/linux-model-validation` | 3,925 epochs, 74,575 model rows, 109,900 checks; zero failures |
| Two `solar-cli simulate` runs: 48 one-hour steps, seed 42, activity 0.9 | Same bytes twice and equal to the Windows baseline |
| `python tools/build_wasm.py --locked --out-root build/linux-wasm` | Both release modules built |

The explicit native receipt is
`build/native-eop-20261104/received/build/linux-native-evidence/receipt.json`,
SHA-256 `abe6d459286ad90b60cedb566004ab234eb931de641f9db5b33aeffebb8ce59a`.
It records all 15 zero exit codes, 11 passing checks and `passed: true`.
Actual logs, rather than discovery/process exit alone, verify the stated
222/20/14/6 test populations.

The one-day, four-site observer fixture remains the existing independent raw
reference. Its largest RA/Dec, alt/az, altitude and DUT1 residuals are respectively
0.826160 arcseconds, 0.857563 arcseconds, 0.592483 arcseconds and 0.293744ms.
The fixed 10″ Sun/planet, 12″ Moon and 3ms DUT1 limits are unchanged. It does
not establish continuous observer accuracy or a new event-time bound.

The model summary SHA-256 is
`2595d80f70c82c2342d556b12aa31a6daf7015339ca03759a78cdafc39f5f037`.
Its full comparison CSV remains the earlier passing Linux byte sequence,
SHA-256 `cc3adfeada860158b2e89d6cd8be72a41f52740e07c04e3d319df0e8cb6470cb`.
Independent review recomputed every comparison from the 74,575 retained native
rows and frozen raw packet: all decisions agree, with zero failures and unchanged
budgets. The largest measured-scalar recalculation difference was
`4.887516086293786e-11`. The Windows/Linux CSVs retain their small floating-point
differences; neither a bitwise native ephemeris guarantee nor continuous error
bound is inferred.

The repeated solar SHA-256 is
`0e9cd0880cf9b839f8e81cdc3747450623fe882752faacb777f1b671deae00a2`.
Repeatability establishes deterministic correspondence, not independent physical
solar accuracy.

## Return transfer and explicit admission

The completed return archive is 12,178,121 bytes, SHA-256
`f34402a73f4e413a1a984fea4c94cd1958f5dc8da8f9372694bd0d2b8a9e176e`.
All 42 ordinary members, totaling 45,339,002 bytes, were checked against the
embedded inventory before local extraction under
`build/native-eop-20261104/received/`. The return-admission receipt has SHA-256
`f1ea485827bec060c9088fb78866bbc2b1f414ea8c6c21f26527cb8c7034abd5`.

Cloud Shell's typed destination/path fields did not commit the selected target
in the first transfer attempts. The incorrectly targeted home-directory download
was canceled and reported zero transferred items. Explicit file-tree selection
then completed the correct file transfer, but provided no browser download handle.
The visible one-file preview link supplied a local file through `downloadMedia`;
its full length and SHA-256 match the original archive exactly.

The temporary transfer helper served only this digest-checked archive, bound to
127.0.0.1:8081 with a ten-minute maximum. Google's
[Cloud Shell preview documentation](https://docs.cloud.google.com/shell/docs/using-web-preview)
states that its HTTPS proxy restricts preview access to the signed-in account.
After local verification, the hash-bound acknowledgement closed the helper.
A subsequent native check confirms its PID is absent and port 8081 is not listening.
No directory-listing server, authentication grant or public sharing was introduced.

## Harness findings and verified closure

Independent review found three P2 defects in the new research harness:

1. A failed overall receipt was archived but the runner still exited zero.
2. Public admission checked status/parsing before retaining native/Node output,
   losing raw failure diagnostics.
3. Named public cases were not fully bound to their returned epoch/observer.

The corrected future runner exits 1 after packaging a failed result and exits 0
on success. The public helper writes exact stdout/stderr, hashes and an incomplete
false progress receipt before checking status, JSON or contract validity; timeout
partials are retained. All diagnostic files enter the final archive. Requested
and returned JD/latitude/longitude/elevation tuples are recorded and must match
exactly for these round-trip native inputs.

Independent controls cover native nonzero/invalid-JSON/timeout results, Node
nonzero/timeout results, stale epoch, wrong latitude/elevation, command-only and
check-only finalization failures, and successful real-reader admission. Failed
cases retain diagnostics in the archive and return nonzero. Positive controls
pass. Original red reproductions remain separate.

The frozen VM helpers remain unchanged at runner SHA-256
`138236e1a06bc981455e87029c45f25febdbb3b0df57dc3e5fd6666422ed739b`
and public-helper SHA-256
`7f88ab3bd996940c9ffcc5c77206d6170d48861b1b9ffad51a6f79fbd1a0fe83`.
The successful VM run is admitted explicitly from its complete true receipt,
actual populations and six returned command-to-request bindings. All six files
also pass both current readers locally; no stale case substituted boundary coverage.
It is not relabeled as execution of the later corrected harness.

Future helper hashes are runner
`327f6061a992ded3b30d5521fc48cbbf340d963753a7d33a0603bc3d348e1378`
and public helper
`6fc391a0c7295d37464fb506a7293d8952abd7fc79f29a57a87b2dd5c54c3e49`.
The final independent review reports no remaining actionable P0–P2 finding.
Its receipt under `build/native-eop-review-20261104/` has SHA-256
`ce09922fedde224a1c00c10e08a5394936de2a3f2676777d82ab3e0948238bf1`.

## Current WASM identity and complete reconstruction

| Module | Linux bytes | Linux SHA-256 |
| --- | ---: | --- |
| Ephemeris | 1,810,907 | `87bc611c58f7239bb6c412e9dc098f7e9b6cf02d78e7e5bc95a6c59d95181c72` |
| Solar | 127,124 | `eb0fe6fbd28296d0bb877e9b6008e4628141b62155f738a2fceebe16cf688f9b` |

Both raw host-identity comparisons remain false and are retained as diagnostics.
The older failed raw-identity receipt is untouched. A fresh complete binary review
reconstructs every byte of each current Linux file from its current Windows
counterpart using only function/type index renaming and diagnostic separators:

- Ephemeris: 288 functions, 16 function-index permutations, 27 backslash-to-slash
  bytes in nine source paths; no type permutation.
- Solar: 367 functions, 29 function-index permutations, type 34/35 swap and 21
  diagnostic separator bytes.

All nine sections match exactly after those transformations. Every numerical
instruction/immediate, coefficient/EOP byte, data address, memory/global/export
and mapped indirect-call slot is preserved; no relocation is needed. Four
one-bit numerical-immediate/non-path-data controls are rejected. A fresh clean
offline Windows build reproduces both current Windows hashes. All 46 selected
Cargo/Rust/binary inputs match the native manifest and remain unchanged.

This is a new proof for the current 288-function ephemeris, not an inference
from the older 286-function artifact. The complete review is retained under
`build/wasm-eop-binary-review-20261104/`, with receipt SHA-256
`0d6875454cd305e787b3656a33d442e84125740753ec63d6dcbe01c2b14f4d3e`.
It explains the inspected differences without promising future cross-host bytes.

## Actual Linux-built application artifact

The immutable local stage is `build/production-20261104-linux-eop-site`, release
`local-linux-eop-20261104`, manifest SHA-256
`09fc653a885c441a749ec79a58bccc28567a1b534481b14804ae0b4b0c8ca42e`.
It uses the exact retrieved Linux modules and current source-bound web assets.

| Current artifact gate | Result | Receipt SHA-256 |
| --- | --- | --- |
| Strict real Sky worker | 36 full 117-body snapshots, 576 reference comparisons; maximum 3,376.9ms below unchanged 10,000ms deadline | `65a996f2ac022c0228309a31a64ad324c52cb6a7acc3e9108c3f167db2e45656` |
| Complete SwiftShader browser scenario | Original application/WebGL gates pass | `b7ccf9e459537f966a945bd5f90f5438ec33bffeec1e4ab4cb36f4800d9d4dfc` |
| Combined web line coverage | 17,801/18,249 lines, 97.54%; unchanged 90% floor | `1d70ccb81e1a1c13b3048ab452948fe77d59683143e99116450b788a80ca383e` |
| Actual Adreno native rendering | 20 checks/20 captures, context restoration, 390px layout and animated level-4 physical Mars | `6e194149aa952cf3a1e0e968c90c91aa927b037780ff4d0d0173d4c198786211` |

These reports live under `coverage/linux-eop-*20261104/` or the corresponding
worker JSON. Native application renderer identity is Qualcomm Adreno X1-85
through ANGLE/D3D11. There are no staged/current source differences or page,
console, shader or WebGL errors. Five submitted Mars animation draws meet the
original 5-second limit. Physical Earth and restored Mars captures were visually
inspected. This is Linux-built WASM executed in Windows Chrome, not Linux GPU
or broader device qualification. The reused full Node coverage map is admitted
only for unchanged current JS source, with the staged mapping checked by the tools.

The final current-source/artifact check records 1,097 correspondence assertions,
including the frozen/current native inputs, model/reader sources, staged assets,
exact retrieved WASM modules, report-to-manifest links and all40 native PNG hashes.
Its receipt is `build/native-eop-20261104/final-correspondence.json`, SHA-256
`54f7d3c44cafbbe25606e5a5203914e73cccd40d5f020e7b3189810b1a3f7113`.
This is source correspondence evidence, not an additional physical accuracy claim.

## Reproduction, scope and rollback

Use the pinned released Rust 1.96.0 compiler and existing cached inputs. The
commands above are offline; `--out-dir` destinations must be fresh. The ignored
preparer/runner/bootstrap/admission scripts and immutable manifests under
`build/native-eop-20261104/` retain exact command arguments, environment controls,
deadlines, stdout/stderr and file identities. Original and future harness
versions are separate. Review scripts reproduce model comparisons, failure
controls and current binary reconstruction without network or production access.

No application source or schema changed in this verification follow-up. Changed
repository documentation is this report, the native EOP plan, the preceding
native-precision report, EOP report and status. New harness/review/runtime outputs
stay ignored. Rollback is documentation/evidence selection only; no deployed
system was changed. Preserve earlier failures and unrelated uncommitted work.
Do not recursively remove an unverified path or overwrite a frozen run.

The approved model target remains complete UTC years 1900–2200; supported
years 1–9999 remain approximate outside it. EOP source coverage and formal-error
limits are unchanged. Continuous observer/event bounds, full-span physical Earth
rotation, other devices/assistive technologies, Rust 1.85 compatibility, hosted
CI, distribution-notice correspondence and production release remain separate.
