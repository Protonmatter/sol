# Local Rust coverage — 2026-11-03

The later [1900–2200 precision candidate](PRECISION_WINDOW_20261104.md)
refreshes this gate after the VSOP08/test changes:205 tests,8,303/8,682 lines,
95.634646%, with the same90% floor and installed LLD workaround. Its LCOV is
`coverage/production-20261104-precision-rust.lcov`, SHA-256
`f4049d8356c7cdb037bdaedc2d013c4f3c6f21d640f4f2482265f6e6a3998edf`.
The adjacent precision coverage receipt binds current source/data/tool hashes.
Earlier measurements below remain historical, and hosted qualification remains
separate.

The existing workspace/all-features **90% line coverage gate passed locally at
95.32%**: 7,971 of 8,362 lines, with all 196 workspace tests passing. This is
Windows ARM64 evidence for the current uncommitted source tree, including the
[lunar range correction](LUNAR_RANGE_20261103.md). Hosted Ubuntu CI and the
remaining production qualification gates are separate.

Requirements: `SOL-COV-001`, `SOL-TEST-001`, `SOL-REL-001`.

This report retains the original checkpoint. The later
[geometric-vector follow-up](GEOMETRIC_VECTORS_20261104.md) refreshes source-bound
coverage after test/comment changes: 196 tests, 8,009/8,383 lines (95.54%), with
the same toolchain, LLD workaround and unchanged coverage policy.

The subsequent [grazing-event correction](GRAZING_EVENTS_20261104.md) changes
the runtime and adds eight tests. Its fresh run passes all 204 workspace tests
and 8,231/8,607 lines (95.63%), with the unchanged 90% floor. The separate
`coverage/production-20261104-grazing-rust.lcov` and adjacent receipt bind its
34 source files; neither older receipt is reused for that source change.

The [apparent-coordinate follow-up](APPARENT_EPOCHS_20261104.md) adds an offline
reference/example and clarifies a TOP2013 source comment. A separate fresh run
retains 204 tests and 8,231/8,607 lines (95.63%) while binding those current
source bytes in `coverage/production-20261104-apparent-rust.lcov` and its
adjacent coverage receipt. Numerical runtime behavior and both WASM binaries
remain unchanged from the grazing-final artifact.

## Toolchain and observed failure

The run used Rust 1.96.0 (`ac68faa20`), LLVM 22.1.2 and the existing CI-pinned
`cargo-llvm-cov` 0.6.16. The LLVM tools component was installed through rustup;
the coverage executable was installed under the ignored workspace directory
`build/verification-tools-20261103`. No application dependency, lockfile,
coverage denominator or threshold changed.

The first instrumented run passed all tests using the default Windows linker,
but LLVM rejected the resulting profiles with `symbol name is empty`. A small
standalone probe reproduced the failure. Disabling profile-name compression did
not resolve it; selecting the installed Rust `rust-lld.exe` for the same probe
did. The complete coverage run was then repeated with that linker and a separate
coverage target directory. No failed profile was edited, filtered or accepted.
This A/B observation identifies a usable local workaround; it does not establish
every cause or version affected by the default-linker failure.

## Reproduction

Run from the repository root in PowerShell after installing the same toolchain
and tool version. Use a new target/output location for another retained run.
The linker override affects only this shell's child processes and is restored
in `finally`; it is not a repository Cargo configuration change.

```text
rustup component add llvm-tools-preview --toolchain stable-aarch64-pc-windows-msvc
cargo install cargo-llvm-cov --version 0.6.16 --locked --root build/verification-tools-20261103
```

```powershell
$priorPath = $env:PATH
$priorLinker = $env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER
$priorCoverageTarget = $env:CARGO_LLVM_COV_TARGET_DIR
try {
    $sysroot = (rustc --print sysroot).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve Rust sysroot' }
    $coverageTools = (Resolve-Path 'build/verification-tools-20261103/bin').Path
    $linker = Join-Path $sysroot 'lib/rustlib/aarch64-pc-windows-msvc/bin/rust-lld.exe'
    if (-not (Test-Path -LiteralPath $linker -PathType Leaf)) { throw 'Rust LLD missing' }
    $env:PATH = $coverageTools + ';' + $priorPath
    $env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER = $linker
    $env:CARGO_LLVM_COV_TARGET_DIR = Join-Path (Get-Location).Path 'build/NEW-rust-coverage-target'
    cargo llvm-cov --workspace --all-features --locked --offline --fail-under-lines 90 --lcov --output-path coverage/NEW-rust.lcov
    if ($LASTEXITCODE -ne 0) { throw 'Rust coverage gate failed' }
    cargo llvm-cov report --summary-only
    if ($LASTEXITCODE -ne 0) { throw 'Rust coverage summary failed' }
}
finally {
    $env:PATH = $priorPath
    $env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER = $priorLinker
    $env:CARGO_LLVM_COV_TARGET_DIR = $priorCoverageTarget
}
```

## Retained evidence and scope

The LCOV report is `coverage/production-20261103-rust-lld.lcov`, SHA-256
`d68d7eabc4c9e875faee7f26e0a9c0649d202c03be7f0b2e6a625e765ec11a03`.
The adjacent `production-20261103-rust-coverage-receipt.json` records the command,
tool hashes, host facts and SHA-256 identities of all 34 LCOV source files.
All source paths were checked to belong to this checkout. Regions were 94.02%
and functions 91.34%; the configured Rust gate evaluates lines.

The parent workspace retains `sol-rust-coverage-20261103.log` for the rejected
default-linker run, `sol-rust-coverage-lld-20261103.log` for the successful run,
and `sol-rust-coverage-lld-summary-20261103.log` for the summary. The probe and
instrumented builds remain ignored under `build/`. These local files are not
hosted CI attestations or proof that published binaries match the candidate.

Rust source and the previously tested WASM artifacts did not change during this
measurement. Removing the child-process overrides restores the prior build
configuration; no production rollback is involved. Source changes require fresh
coverage rather than reuse of this receipt.
