# WASM source-material binding - 2026-11-08

An existing ignored WASM cache had the same ABI exports as the tested release,
but different numerical output. Across three selected epochs, its largest
relative full-vector difference from the tested binary was2.40435arcseconds-
equivalent for Neptune. That is a binary comparison, not an independent Horizons
accuracy error. A fresh offline build of current source reproduces both tested
WASM binaries byte for byte. Before this correction, the web builder accepted
the older cache and its manifest validator passed.

## Build and packaging behavior

The existing build_wasm.py command now captures exact source-material hashes
before invoking Cargo. After both locked release builds succeed and the source
inventory is unchanged, it atomically writes wasm-build.v1.json alongside the
two outputs. After source capture succeeds, the prior receipt is invalidated before Cargo;
partial output cannot satisfy the current component-build admission rule.

The deterministic receipt binds both WASM hashes, the fixed target/release/locked
recipe, root Cargo/lock/toolchain files, the two build-guard tools and materials
under solar-core, solar-wasm and solar-ephemeris. Generated build/target files,
fuzz workspaces, private directories and Python caches are excluded. Source
inventory, receipt and binary sizes are bounded. Oversized serialized receipts
are rejected before temporary-file creation or publication. Symlink materials are refused.

Current web builds carrying the ephemeris source portal require a matching
receipt before creating a staging directory. The builder rechecks the copied
binaries and source bindings, retains the receipt as a critical asset, and
checks again before publishing the local artifact directory. The immutable
manifest validator checks receipt-to-binary identity and, when corresponding
source metadata is present, requires every declared source hash to match it.
Changing an outer asset hash alone cannot clear those semantic checks.

Historical shells without the component portal keep their existing build and
manifest contract. A receipt supplied to such a build is still validated. This
backward compatibility does not qualify an old artifact or grant a release.

## Workflow and failure recovery

Use the existing commands in [release delivery](RELEASE_DELIVERY.md). Build both
engines first, then pass that same directory to build_web.py. The output now
contains the receipt as well as the two WASM files; copying only the binaries is
insufficient for a current component-bearing build.

On a missing receipt, source mismatch or binary mismatch, rebuild into a new
output directory and retry staging with that directory. Preserve the rejected
inputs and failed logs for diagnosis. Do not fabricate a receipt for an unknown
binary or overwrite a tested stage. No new CLI option or dependency is required.

The receipt is unsigned metadata produced at the trusted local Cargo boundary.
It prevents accidental stale/cross-source packaging; it is not compiler
attestation, a hermetic environment record, malicious-artifact authentication,
independent scientific accuracy or continuous1900-2200 qualification. Compiler
versions/environment and accepted scientific/release evidence retain their own
requirements. Matching source hashes alone does not prove matching execution.

## Validation, scope and rollback

Unit and producer/builder/manifest integration tests cover deterministic output,
changed/missing source and binaries, malformed receipts, bounded inputs,
source drift during build/copy, failed builds, atomic-write failure, and semantic
rejection after manifest rehash. The new helper is enrolled in the existing
Python coverage denominator and retains the90percent floor.

Actual CLI reproduction, offline build commands, source/cache/stage hashes,
test/coverage logs, new artifact and independent review are retained under
build/wasm-source-binding-20261108-01. Earlier comparison and the successful
pre-guard staging reproduction remain under build/wasm-cache-provenance-20261108-01.
No existing source, cache or tested artifact is silently relabelled.

This corrects build admission and evidence. Application modules, Rust calculation
code, orbital coefficients, approved Illustrative Earth and rendering defaults
are unchanged. The200ms hardware/software target, scientific/manual acceptance
and hosted release holds remain binding.

Rollback requires restoring only this correction's backed-up tools, tests,
coverage workflow/policy and documentation, then removing the new provenance
helper, its test and this note. Newly generated receipt-bearing artifacts remain
historical evidence. No license change, dependency installation, application
fetch implementation, commit, push or deployment is part of this correction.
The existing service worker fetches one additional critical metadata asset from
the same release origin; no new external destination is introduced.
