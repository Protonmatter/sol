# Native Linux precision verification implementation plan

> **For agentic workers:** Use the existing executing-plans workflow task by task. Obtain independent read-only review of the resulting source/evidence chain.

**Goal:** Verify the current Sol precision/rendering candidate's native numerical and build behavior on Google Cloud Shell Linux x86-64.

**Architecture:** Transfer one allowlisted, hash-manifested snapshot into a fresh temporary Cloud Shell directory. Run the existing Rust/native-reference commands with an isolated Rust 1.96.0 toolchain, preserve complete reports, then retrieve and verify the resulting evidence locally.

**Tech Stack:** Existing Python standard library, Rust/Cargo 1.96.0 and Cloud Shell terminal/file transfer. Application dependencies remain unchanged.

**Spec:** [approved precision target and current baseline](../../PRECISION_WINDOW_20261104.md), [validation plan](../../VALIDATION_PLAN.md).

## Global constraints

- The production goal remains active; this is one additional evidence domain.
- Complete UTC years 1900–2200 are the precision target; years 1–9999 remain approximate outside it.
- Keep all existing 10″ full-vector, 10/12″ pointing and max(1 km, 10 ppm) range budgets.
- No commit, push, hosted dispatch, deployment, Cloud API grant or production setting changes.
- Use native Linux x86-64, Rust 1.96.0 and a fresh temporary directory; no ARM emulation as native evidence.
- Transfer only explicit project source/data/reference inputs and deterministic comparison fixtures; no credentials or unrelated home files.
- Verify source hashes before and after commands. Retain failures and never promote partial output.
- Compiler setup uses the official existing rustup distribution mechanism; Cargo model/test commands use locked offline inputs.
- Limit Cargo build/test parallelism to two; retain explicit command timeouts.
- Both platform sweeps must pass independent references. Cross-platform floating differences are reported separately, without inventing a bitwise ephemeris guarantee.

## Tasks

- [x] Inspect the existing Cloud Shell and install the pinned compiler/wasm target into isolated temporary tool storage; retain host/toolchain receipts.
- [x] Freeze an allowlisted source/archive manifest. Include current Rust workspace/native fixtures, strict precision tools/raw packet and the local deterministic solar-output reference. Verify that model/tool hashes match the recorded passing Windows baseline.
- [x] Upload through the existing Cloud Shell file interface, verify archive/member identities and safely extract only the declared files into the fresh test root.
- [x] Run the existing workspace tests, precision parser/CLI controls, full independent model sweep, repeated deterministic solar simulation, and both WASM builds. Retain complete stdout/stderr, numerical reports and before/after source identities.
- [x] Retrieve the bounded evidence bundle, verify every byte hash and compare platform outcomes/solar bytes/WASM identities. Diagnose any actual failure without changing the budgets.
- [x] Obtain independent read-only review and update the accuracy/readiness report with measured results and explicit remaining limitations.

Results are recorded in [native precision qualification](../../NATIVE_PRECISION_20261104.md).
The original two raw WASM byte-identity failures remain retained; exact whole-file
reconstruction explains the inspected index/path changes. The actual Linux-built
modules also pass worker, browser and native Adreno rendering checks, including
context restoration, in Windows Chrome. No cross-platform GPU claim is inferred.

## Validation and expected evidence

Use `cargo test --workspace --locked --offline`, the existing precision unittest pattern, and `python tools/validate_precision_window.py --out-dir build/NEW-native-validation`. The declared model matrix contains 3,925 epochs and 109,900 comparisons. Solar repeatability uses the current CI simulation parameters: 48 steps, one hour per step, seed 42 and activity 0.9. Both `wasm32-unknown-unknown` release libraries are rebuilt with the same pinned compiler. Complete receipts bind command arguments, exit status, runtime versions, source/reference hashes and retained output hashes.

Temporary setup/source/target files are isolated from existing VM home/project state. Failed attempts stay available for diagnosis. No cleanup operation may recursively delete an unverified or unrelated path. Source/data and the accepted local artifact are preserved throughout this verification.
