# Native Linux verification of the final EOP candidate

The production goal remains active. The preceding EOP/clock/angle implementation
is locally verified; this follow-up extends evidence to fresh native Linux.
Use the existing native-precision procedure with current hash-pinned inputs.

Scope and risk: medium-risk temporary build/test execution in the already
authorized Google Cloud Shell VM. No application change, dependency addition,
Cloud API grant, project change, paid VM creation, commit, publication or deployment.
Transfer only allowlisted project inputs, public reference fixtures and bounded
test harnesses. Preserve old failures and reject partial or unverified evidence.

The discovered VM is Linux x86-64 with Python3.12.3. Its earlier temporary Rust
installation is gone. Install official released Rust1.96.0 and the WASM target
only under the new `/tmp/sol-eop-linux-20261104-outbpojx` root. Keep the existing
home/default compiler unchanged. Limit Cargo/test parallelism to two and give
each command an explicit deadline. Hash inputs before and after execution.

- [x] Freeze the current source, EOP provenance, independent references and Windows baselines in a manifest and bounded archive.
- [x] Verify transfer hashes and safe extraction; retain isolated compiler identity and setup results.
- [x] Run all222 Rust tests, the20 precision controls,14 EOP generator controls,6 v3 clock controls, EOP correspondence/freshness and existing offline observer helper.
- [x] Replay all109,900 approved-window checks and repeat the existing deterministic solar scenario twice.
- [x] Build both WASM modules, recording raw host identity as a diagnostic. The earlier native report explains why raw cross-host bytes can differ; do not infer current equivalence from it.
- [x] Retrieve complete output inventories, verify source/results locally and investigate any failures without changing scientific or runtime budgets.
- [x] Qualify the actual Linux-built WASM through the existing worker/browser/native rendering paths as appropriate; retain the distinction from Linux GPU qualification.
- [x] Obtain independent read-only review and document measured outcomes and remaining limits.

The approved model target remains complete UTC years1900–2200, with approximate
exploration outside it through years1–9999. Keep10″ vector-equivalent,
10″ Sun/planet and12″ Moon pointing, max(1km,10ppm) range,3ms DUT1 and existing
wall deadlines unchanged. Discrete comparisons do not prove continuous physical
observer/event accuracy or unknown future Earth rotation/leap seconds.

No production rollback is needed for this evidence-only run. Temporary files
remain isolated; do not delete any unverified or unrelated directory. A failed
run remains failed and any rerun uses a fresh output directory. Documentation
must distinguish the earlier candidate, current Windows evidence and new Linux
results. Relevant reports: [native precision](../../NATIVE_PRECISION_20261104.md)
and [EOP follow-up](../../EOP_HISTORY_20261104.md).

The [native EOP verification report](../../NATIVE_EOP_20261104.md) records all
measured outcomes, exact source/archive/compiler/artifact identities, original
and corrected harness versions, three independently reproduced/closed P2
findings, current binary reconstruction and unchanged qualification limits.
