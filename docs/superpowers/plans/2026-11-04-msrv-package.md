# Declared compiler floor and package correspondence

Continue the full production-readiness goal. The preceding native EOP run is
verified; this follow-up checks the declared Rust 1.85 compatibility floor and
the actual local crate contents. Keep Rust 1.96.0 as the qualification compiler.

The package/notice audit is factual. Preserve project licensing and upstream
files; do not infer redistribution clearance from a package inventory. No
commit, publication, registry credential, Cloud API grant or deployment.

1. Capture an offline, explicitly dirty diagnostic `cargo package` and verify its
   complete file/content/notice inventory against current source and provenance.
   Dirty packaging is not accepted exact-source release evidence.
2. Reuse the authorized native Linux VM and verified 571-file source snapshot.
   Install official Rust 1.85.0 and WASM support in the existing isolated tool
   storage, keeping home/default and Rust 1.96 qualification state unchanged.
3. Run locked offline minimum-version check/test/build commands with two build
   threads, fresh target/output directories and command deadlines. Verify actual
   compiler identities and source hashes before/after; preserve failures.
4. Replay the unchanged109,900-sample model matrix under the minimum compiler
   if compilation succeeds. Treat minimum-version support separately from
   release-compiler/artifact qualification and broader physical accuracy.
5. Fix demonstrated compatibility/package defects using small changes, or record
   the exact supported outcome. Add an appropriate existing-CI guard only after
   its commands are concrete and verified; preserve protected job identities.
6. Obtain independent review of source/evidence and any material patch. Update
   the report, build/status documentation and remaining qualification holds.

Expected commands include `cargo check --workspace --all-targets --locked --offline`,
`cargo test --workspace --locked --offline`, the existing offline precision
validator and WASM builder, explicitly under Rust 1.85.0. Local package inspection
uses `cargo package --locked --offline --allow-dirty -p solar-ephemeris` in a new
ignored target directory. No network call is added to the application.

Risk is low for read-only packaging and medium for isolated compiler/test setup.
Rollback affects scoped documentation/CI changes and evidence selection; retain
all original archives and logs. Do not recursively delete an unverified path.

The isolated-target setup exposed a verified P1 builder defect: Cargo compiles
into `CARGO_TARGET_DIR`, while `tools/build_wasm.py` reads stale `ROOT/target`
files. A real two-crate Cargo/Node reproduction returns marker1 from both staged
modules even though both freshly compiled configured-target modules return2.
The frozen red receipt is retained under `build/wasm-target-directory-20261104/`.
Fix this before minimum-compiler artifact qualification: resolve Cargo's effective
target directory, preserve output/source guards, and verify fresh bytes with
focused regression and real red/green runs. Expected affected production files
are the builder, its existing release-artifact tests and relevant build docs;
numerical source and scientific budgets remain unchanged.

Completed follow-up: the final Cargo-artifact builder passes 31 focused tests and
real stale-target/diagnostic regressions. Independent review closes the P2 hidden
diagnostics and CI scalar-decoy findings. Native Rust 1.85.0 passes 222 tests and
109,900 model checks; actual configured-target files are separately retained and
match the returned staged files. Minimum-WASM worker/full-browser checks pass;
current full Python suites pass 636+39 tests and 90.500061% governed coverage.
The required existing test job checks the minimum separately from Rust 1.96.0.

Reports: `docs/WASM_STAGING_MSRV_20261104.md` and
`docs/PACKAGE_NOTICE_AUDIT_20261104.md`. The latter records the actual dirty
37-file package, unchanged licensing and a separate proposed notice bundle.
Hosted release, legal/distribution correspondence, continuous physical accuracy
and broader platform acceptance remain held. The overarching goal stays active.
