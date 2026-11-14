# Native minimum-compiler seasonal verification

Use the already authorized Google Cloud Shell Linux x86_64 VM for the current
seasonal regression under the configured Rust1.85 floor. The optional Cloud API
credential grant was rejected. The fresh VM has Rustup shims but no selected
compiler or retained /tmp toolchains. No paid VM or project setting is needed.

1. Freeze only current public project/test inputs, source sizes/hashes and a
   bounded driver. Retain the input archive, manifest and exact bootstrap.
   Maximum extraction:2,048 regular files and64MiB. Reject links, traversal,
   duplicate/unlisted files and size/digest mismatches before executing a driver.
2. Use a new /tmp runtime with isolated HOME/CARGO_HOME/RUSTUP_HOME/target/temp
   directories and minimal environment. Install exact official Rust1.85.0 with
   the WASM target; do not alter the global compiler, shell profile or credentials.
3. Record actual native architecture and compiler/Cargo identities. Run locked
   offline workspace check/tests, the new11 Python admission tests, the full
   109,900-comparison model replay, actual-target WASM staging and48 original sky
   CLI snapshots against the frozen seasonal references. Preserve raw logs and
   snapshots. Keep the fixed numerical budgets and source/epoch/site checks.
4. Bound each command, use2 build/test threads and kill only owned process groups
   on deadline. Source hashes must match before/after. Do not treat a PID file as
   live evidence: confirm the actual process/command or terminal completion.
5. Return only a hash-inventoried evidence archive through a bounded one-file
   loopback preview, verify download/extraction, acknowledge completion and close
   the listener/tab. Preserve failures and original reports separately.
6. Obtain read-only harness/evidence review and update current-source links. This
   is minimum-version compatibility evidence; Rust1.96.0 remains the qualification
   compiler. No hosted, continuous-accuracy, licensing or production promotion.

Risk is medium for isolated test/compiler execution and low for read-only data
comparison. There is no new application network call, project dependency,
background service, repository commit/push or deployment. Keep prior artifacts
and unrelated work. Runtime outputs are disposable only after verified receipt;
no recursive removal of an unchecked computed path is part of this plan.

## Recorded execution

Only the independently reviewed v3 bootstrap/driver ran. Actual Linux x86-64
Rust/Cargo 1.85.0 passed all ten commands, including 224 Rust tests, 11 admission
tests, 109,900 model checks and 48 original-CLI snapshots/2,160 seasonal checks.
Configured-target WASM staging matched actual output and differed from both
deliberately stale seeds. All 621 frozen/work inputs remained unchanged.

The actual saved archive, its 118 native records and current source mappings are
admitted locally. Current owning model comparison code repeats every fixed
control successfully; tiny platform arithmetic differences are retained
explicitly. Independent downloaded-evidence review recomputes all metrics and
passes without actionable P0–P2 findings. See the
[execution and evidence ledger](../../SEASONAL_MSRV_20261104.md).

After saved-byte/hash/source admission, the verified transfer acknowledgement
completed. Actual driver/server processes and all owned command groups are
absent, and port 8081 refuses connections. The preview is closed and the console
is available for handoff. Original reports and failed helper assumptions remain
preserved; no hosted, production, package or release eligibility is inferred.
