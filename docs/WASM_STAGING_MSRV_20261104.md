# WASM staging and declared Rust minimum — 2026-11-04

The declared Rust 1.85.0 compatibility floor passes a native Linux workspace
check, all 222 Rust tests, all 109,900 retained model comparisons and actual
minimum-compiler WASM execution in Chrome. Released Rust 1.96.0 remains the
qualification compiler. This follow-up also fixes a demonstrated P1 build defect:
a configured Cargo target directory could compile fresh modules while the builder
successfully staged stale modules from the default target directory.

The owner-approved accuracy target remains complete UTC years 1900–2200,
`[1900-01-01,2201-01-01)`. Years 1–9999 remain approximate outside that target.
Finite reference results do not establish continuous physical error bounds.

## Builder defect, correction and review

The original `tools/build_wasm.py` read `ROOT/target/wasm32-unknown-unknown/release`
after Cargo returned successfully. Cargo's actual output follows `CARGO_TARGET_DIR`
and configuration. An old default-target file could therefore become a new
candidate despite a successful build in another directory.

A real two-crate Cargo/Node reproduction first builds marker1 in the default
directory, changes both source markers to2 and builds into a separate configured
directory. The old builder stages marker1 from both modules while the actual
configured-target modules return2. The frozen red receipt is
`build/wasm-target-directory-20261104/red-receipt.json`, SHA-256
`23fc3e5928aceedaf9862ae048586f81afd07481e04d12483f3691ac3b179274`.

The corrected builder consumes Cargo's JSON artifact messages. For each requested
crate it requires one matching cdylib WASM filename and one successful
`build-finished` message. It validates an ordinary absolute file and the WASM v1
header, then stages that reported file. Malformed, missing or ambiguous metadata
fails; no default-target fallback remains. Existing CLI/output guards and locked
build behavior are preserved. An identical source/destination needs no copy.

The real green reproduction returns2 from both actual and staged modules, with
byte equality. Its receipt, from the first corrected builder before the diagnostic
follow-up, is `real-green-receipt.json`, SHA-256
`7353a83e0669220327e3c769585f20df7f8bf154443e89ff09767e1328006753`.
The final builder also passes 31 release-artifact tests and independent real-Cargo
checks. These cover stale outputs, ambiguous/malformed messages, same-path output,
actual compilation failures, successful warnings and raw diagnostic bodies.

Independent review found a P2 diagnostic regression in the first correction:
captured JSON stdout hid rustc's rendered error/warning messages. The final builder
emits those diagnostics on stderr on success and before propagating a failed
build. The review closure is
`build/wasm-staging-independent-review-20261104/diagnostic-closure-receipt.json`,
SHA-256 `0d00f6985568a2ae8c11682aec8e356d176fda8f0901fac998ff6a4b1ecfc82c`.
No P0–P2 finding remains in that reviewed builder scope.

Final builder SHA-256:
`0a7072799dd81d185b9490741d23e702ac0f48d65fc096b2b4448f9946268081`.
A final current-source Windows build under Rust 1.96.0 reproduces the preceding
tested local candidate's module bytes exactly:

| Module | Bytes | SHA-256 |
| --- | --- | --- |
| solar_ephemeris.wasm | 1,810,907 | `2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2` |
| solar_wasm.wasm | 127,124 | `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199` |

The [preceding native EOP report](NATIVE_EOP_20261104.md) describes the unchanged
numerical/JS sources and Rust 1.96 artifact runtime checks. Its frozen all-source
correspondence receipt predates this builder/CI change; retain that scope rather
than claiming the complete current checkout matches all 571 old inputs.

## Native minimum-compiler evidence

The authorized Google Cloud Shell VM runs Linux x86-64 and Python 3.12.3. Official
Rust 1.85.0 was installed in existing isolated test tool storage. The actual rustc
commit is `4d91de4e48198da2e33413efdcd9cd2cc0c46688`, LLVM 19.1.7. Qualification
Rust 1.96.0 and the host/default configuration remain separate.

A fresh source snapshot copies the earlier verified 571-file input set and
overrides only the reviewed builder. The numerical sources, tables, references
and comparison tools match the current checkout. Source hashes were checked
before/after. Cargo uses a fresh explicit target directory, two build threads and
offline dependencies. Deliberately retained old Rust 1.96 modules in the default
target directory exercise the fixed staging path.

Under the explicitly selected minimum compiler, these commands all exit0:

```text
rustup target add wasm32-unknown-unknown --toolchain 1.85.0
cargo check --workspace --all-targets --locked --offline
cargo test --workspace --locked --offline -- --test-threads=2
python3 tools/validate_precision_window.py --out-dir build/msrv185-model-validation
python3 tools/build_wasm.py --locked --out-root build/msrv185-wasm
```

The target-install command uses the official toolchain service; the subsequent
build/test/reference commands are offline. Environment/PATH/compiler controls and
exact arguments are retained in `build/msrv-20261104/received/`. Native results:
222 Rust tests; 74,575 records and 109,900 comparisons; zero reference failures;
both staged modules equal their actual configured-target bytes and differ from
the planted old outputs. Independent review recalculates all 109,900 decisions.

| Retained native evidence | Identity |
| --- | --- |
| Original return archive, 18 members, 11,110,839 bytes | `ef530e0221772ba2f0c8bc1dc1b7e3b52f8c260276e22fe7b2b98f5f702ee9f4` |
| Original native receipt | `b8bace20a6b4bdf54d550880c25232b223e6738f5ec0dc2f816e9af64c60a0e2` |
| Model summary | `6287656ea757009cf537e6bab0d29bd38759d3d0e51a81d2913e445a7715c95a` |
| Separate actual-target archive, 8 members, 1,309,007 bytes | `75684dbe70a43de2b6698ef22263ae3248ec56024235b8cb466e3ca765938dd9` |
| Actual-target native receipt | `1af4b496432824772f02fd95cd4d25da53f9953077b09be2dd429b02c33a2c99` |

The first archive retains staged modules and recorded actual-target hashes. The
separate post-run supplement additionally retains both actual target files,
verifies byte equality to the original staged modules, binds the original receipt
and rechecks tested-source identities. It also successfully exercises
`cargo +1.85.0 --version` with qualification Rust 1.96.0 still selected in the
surrounding environment. Both archives were size/hash/inventory/path-checked before
local extraction. Original archives are unchanged. Temporary single-file transfer
helpers were acknowledged closed; their processes and loopback listener were
confirmed absent. No Cloud API access was granted.

Independent review closes the earlier actual-target retention limit. Its separate
receipt is `build/msrv-independent-review-20261104/actual-target-supplement-receipt.json`,
SHA-256 `d0f236a14277a0aeffe60a47f39cf1f3fa1a7553e737055cc2fe493d7419a21d`.

## Minimum-WASM application execution

The compatibility stage is `build/production-20261104-msrv185-diagnostic-site`,
release `local-msrv185-diagnostic-20261104`, manifest SHA-256
`90b1201e67cd9aa42f6e1086fce551f710f562c9dcd544c39180edaf196283f7`.
It contains the exact returned minimum-compiler modules:

| Module | Bytes | SHA-256 |
| --- | --- | --- |
| solar_ephemeris.wasm | 1,819,966 | `cbd5b3dec6756c14b8e39b5cd3efa9aa9b3dbec7e6bc3aed0f37dd91754a944c` |
| solar_wasm.wasm | 138,307 | `89bbecbaa64bf86e7435dd94247ca9a077caed55a49a117cc74688b182bf901d` |

Chrome 156 on Windows ARM64 passes 36 complete 117-body worker snapshots and 576
unchanged reference comparisons, including calendar endpoints and tiny-negative
angle cases. Maximum worker time is 3,621ms against the unchanged 10,000ms deadline.
Worker receipt SHA-256:
`9e4bfb8c0aef6d005211543ae6b9d4ac053c5eee423d7bd91bef2439bdd30b90`.
The complete existing SwiftShader browser scenario passes, receipt SHA-256
`fa9aff50eb2817bf5d58ece83b01f0438f57fd2544ac24a55d50010ae25855e0`.
This is Linux-built WASM executed in Windows Chrome, not Linux GPU qualification.
The full unchanged-source Node map plus this browser run covers 17,801/18,249
runtime lines, 97.54%, above the unchanged 90% floor.

These are compatibility diagnostics. They do not replace the Rust 1.96 release
compiler or prove binary-instruction equivalence between compiler versions.

## Blocking CI policy and local checks

The existing required `test` job now installs official Rust 1.85.0 with the WASM
target and runs locked offline workspace check/test and WASM check commands using
an isolated target directory. Its job identity and release dependencies remain
unchanged. Canonical qualification continues under Rust 1.96.0.

The SDLC validator binds the minimum-version step to the actual top-level
`jobs.test` mapping, the declared Cargo floor, explicit bash, exact target-directory
environment and mandatory commands. Negative controls reject omitted or advisory
steps, conditions, merge keys, wrong versions and string-literal decoys. An
independent P2 review reproduced a decoy bypass in the first guard; the final
actual-jobs scoping rejects that valid-YAML counterexample. Closure receipt:
`build/msrv-independent-review-20261104/guard-closure-receipt.json`, SHA-256
`656f2ca6fb3a587e28044d801f52dcf062b29a42e23ba7e1b67391a8b4883b78`.

The final source passes 636 repository Python tests and 39 provider tests.
Governed statement/branch coverage is 90.500061%, with 93.155685% statement coverage
and 85.111111% branch coverage. The unchanged aggregate floor is 90%. Focused counts
are 31 release-artifact, 9 compiler-policy and 19 SDLC tests. The full coverage receipt
binds the final builder/validator hashes and records stable before/after sources.
No hosted CI run was dispatched.

## Scope, remaining holds and rollback

Production changes are confined to the builder, its existing tests, the minimum
compiler CI step, its policy validator/tests and documentation. No Rust numerical,
JS rendering, Cargo dependency, schema or licensing change is made in this unit.
The [package notice audit](PACKAGE_NOTICE_AUDIT_20261104.md) records a separate
factual publication hold.

Hosted exact-source CI/release evidence, full platform/accessibility acceptance,
continuous observer/event accuracy and full-span physical Earth rotation remain
open. The EOP source still covers 1973-01-02–2027-11-05, observed through 2026-10-29.
No commit, push, merge, package publication or deployment occurred.

Rollback the scoped builder/CI/policy changes together, preserving their original
interfaces and all unrelated uncommitted work. Reverting the builder restores
the demonstrated stale-target risk; use clean, explicit target/output directories
until the correction is reinstated. Retain frozen evidence rather than rewriting
old receipts or deleting unverified paths.
