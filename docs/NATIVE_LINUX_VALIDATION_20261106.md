# Native Linux ARM64 validation — 2026-11-06

The corrected local Linux container run passes all 18 recorded steps. It executes
the complete Python, Rust and Node populations without skips, preserves the source
checkout, and builds both WebAssembly modules offline. This adds Linux ARM64
evidence to the [approved LGPL component implementation](LGPL_COMPONENT_20261106.md).
It does not grant release acceptance or complete the production-readiness goal.

## Environment and source boundary

The observed WSL2 host and container both use native ARM64. The disposable image
contains Python 3.12.14, Rust/Cargo 1.96.0, Node 22.23.4, coverage 7.15.2,
Pillow 12.2.0 and Git 2.53.0. Rust and Node inputs use registry manifest digests;
Python wheels use required SHA-256 hashes. The supplementary Git source matches
the [kernel.org checksum index](https://www.kernel.org/pub/software/scm/git/sha256sums.asc).
The checksum was verified; its PGP signature was not independently verified.

Only public runtime preparation uses network access. Actual tests and paired
WebAssembly diagnostics use `--network=none`, a read-only root and source mount,
bounded CPU/memory/process counts, and isolated writable build/output volumes.
The dependency volume matches all 3,074 file/symlink entries in the pinned image's
installation, including file hashes, sizes and modes, and the source lock matches
the installation lock. The dependency inventory remains unchanged after execution.

All 1,687 source-inventory entries and the Git status remain unchanged during the
complete matrix. Its observed container is the one created during the recorded
invocation; the command exits zero, ordinary `--rm` closure reports absence, and
a separate ID-specific inspection confirms absence. No forced removal is accepted
as that run's normal closure.

The checkout resides on a Windows-mounted filesystem. These results do not prove
all native Linux filesystem semantics, Linux x86_64, hosted CI, the retained Google
Cloud job, physical devices or browser/GPU rendering.

## Completed checks

| Check | Recorded result |
| --- | --- |
| Provider/server Python suite | 39 tests pass, zero skips |
| Complete tool Python suite | 784 tests pass, zero skips; both real CLI integrations execute |
| Governed Python coverage | The same 52 modules appear in JSON and XML; 12,430/13,675 combined statements and branches = 90.89580%, above the unchanged 90% floor |
| Rust workspace tests | 228 tests pass, zero failed or ignored |
| Rust formatting and Clippy | Both pass; Clippy retains `-D warnings` |
| Complete Node suite | 1,534 tests pass, zero failed or skipped |
| Node-only coverage | Lines 98.34%, branches 91.34%, functions 96.31%; each exceeds its unchanged 90% floor |
| Offline WebAssembly build | Both modules build; the two independent Linux builds have identical hashes |
| Repository validators | SDLC, documentation, UX, visual assets, physical assets and planetary phenomena pass |

The Python floor combines statements and branches. Separate branch coverage is
86.50138%; this result does not claim 90% branch coverage or a per-module floor.
No Rust coverage instrumenter or combined Node/browser coverage was run here.

The CLI is built before Python discovery and `SOL_REQUIRE_CLI=1` makes a missing
binary fail. Required summaries must contain exactly one 39/784-test `OK` result.
Missing, zero-count, short, skipped, failed, duplicate and partial summaries are
rejected by retained controls. Test populations and acceptance budgets are not
reduced to obtain a passing result.

## Corrections and retained failures

The first complete attempt retains 784 methods with three errors and two skips.
One test wrote its invalid JSON fixture into the checkout, then masked a write
failure by restoring an unassigned `old_argv`. The narrow correction in
`tests/python/test_contract_validators.py` uses a private temporary directory and
`patch.object` to restore arguments. Its original NaN and empty-object CLI checks
remain. The failing read-only replay and corrected eight-test Linux/Windows
replays are retained separately.

Two errors came from Git 2.39.5 rejecting `--no-lazy-fetch`; the other two methods
skipped because the native CLI was absent. The corrected environment supplies
compatible Git and builds the CLI first. Production Git safeguards remain intact.

Independent review also corrected the artifact-only runner's dependency binding,
terminal failure recording, bounds and population admission. Controlled stubs
then exposed an unsafe reuse path in its cleanup ownership check. The frozen
second run is accepted only on its separately observed successful invocation,
normal exit and absence. A separate future controller uses a fresh nonce,
exclusive invocation directory and exact newly created container ID. Seven
ownership/reservation controls and a bounded live owned-container cleanup pass.
No full-suite replay is inferred for that later cleanup-only correction.

Historical controllers and fixed-output parity experiments are one-shot records.
Do not rerun them into occupied output paths; a later experiment needs a new
cohort. The corrected controller reserves a fresh invocation before writing.

## Cross-build WebAssembly behavior

The Linux modules differ byte-for-byte from the retained Windows modules, despite
matching file lengths. Standard program sections differ, so stripping debug
metadata does not explain the difference. Its precise build-level cause is not
established here, and no Linux module replaces the browser-tested artifact.

A separate paired diagnostic executes both exact builds in native Linux Node:

- All 3,925 retained System epochs match exactly: 105,975 finite position
  components, with zero observed difference in AU. An independent CSV comparison
  also matches every value to the preceding Windows WASM execution.
- All 32 selected System JSON results match exactly and pass the original reader.
- Nine Sky results at three model epochs and three observers match exactly;
  all 117 bodies pass the original frontend reader and request binding.
- Eight Solar results match exactly, covering five valid requests and three
  invalid/capacity requests; the original snapshot/error boundaries pass.

The nine Sky cases are not the complete 70,650-decision Horizons replay. Exact
finite paired outputs do not establish cross-host binary reproducibility,
all-input equivalence, continuous orbit bounds or new physical accuracy.
The approved 1900–2200 target, approximate exploration outside it, numerical
budgets, application code, coefficients and Illustrative Earth are preserved.

## Retained evidence and remaining work

The ignored evidence root is `build/linux-container-20261106-01/`. Its closure
binds 82 retained artifact hashes, the complete second-run source maps, all 18
step logs, both coverage formats, dependency correspondence, the actual container
identity/absence, focused red/green replays and paired numerical outputs.
The first failed cohort and image-bootstrap failure remain distinct records.

This document and the status update were written after that closed test cohort;
the preceding status bytes are retained under its `frozen-inputs/` directory.
No numerical, rendering, model or runtime implementation changed in this pass.
The earlier approved component implementation has its separate frozen closure
and independent review; its artifacts do not acquire later documentation hashes.

Hosted clean-source CI, served-release verification, physical-device/manual
acceptance and retained cloud-result retrieval remain open. The supported browser
API still reports that local browser use is disabled in Work settings; the user's
VM/browser authorization is already recorded and is not being requested again.
No commit, push, publication, deployment or license-scope expansion occurred.
