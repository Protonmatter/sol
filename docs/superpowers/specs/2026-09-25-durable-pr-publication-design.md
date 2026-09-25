# Durable PR publication and Earth recovery

Status: design brief approved in conversation on 2026-09-25; written specification for review. No publisher implementation, Earth recovery, merge, or deployment is claimed by this document.

## Intent and scope

Publish a reviewed SOL change once, verify which commit the PR actually contains, and resume an interrupted attempt without reconstructing source files or manually rediscovering object IDs. Keep source publication, CI validation, merge approval, and deployment separate. The first recovery target is `Protonmatter/sol` PR #116, `codex/enhanced-earth`.

The user-approved Earth target is July imagery, darker oceans, textured cloud depth, shadows and drift, and the 1.6x exposure appearance, retaining SOL's existing controls. This specification does not authorize recreating missing Earth source from that description or changing its scientific provenance. Recovery must preserve the actual candidate bytes.

The implementation is a small Python/Git publication utility, not a new service or a workflow that rewrites PR branches. Reuse the safety concepts in `tools/delivery_lifecycle.py`; do not loosen its separate daily-feed policy or activate that adapter. No new runtime dependencies, credentials in chat, Git LFS migration, branch-protection changes, auto-merge, or deployment actions.

## Evidence and limits

The GitHub read on 2026-09-25 returned PR #116 open/draft at `0cf75a30b90c283860158f63091ecdbad9548322`, with two commits. Its base was `88bfb852a9b19a101a59c5053c53bccf60c1aea1`. These are observations, not SHA values to paste into future attempts without refreshing them. See [PR #116](https://github.com/Protonmatter/sol/pull/116).

Prior shared-chat text reports accepted code/images, a verified Git bundle, and a texture task eventually labelled finished. The available transcript does not contain the corresponding object receipts, bundle bytes, or candidate commit. A task label is not proof of a successful GitHub upload. The confirmed defect is missing verified publication; the exact earlier failed API boundary remains unproven. A default-branch commit listing cannot establish that no other branch or unreachable commit exists.

The recovery search did not retrieve the newer source, bundle, or object IDs. Do not invent a candidate SHA, replace a hash to pass validation, or advance #116 to an unrelated commit. `merge_commit_sha` on an open PR is not its source head. Missing Rust/WASM is separate from transferring Git objects.

Existing source anchors, inspected at the base above:

- [Delivery adapter](https://github.com/Protonmatter/sol/blob/88bfb852a9b19a101a59c5053c53bccf60c1aea1/tools/delivery_lifecycle.py): expected-head lease and post-write observation, specific to the daily feed.
- [CI](https://github.com/Protonmatter/sol/blob/88bfb852a9b19a101a59c5053c53bccf60c1aea1/.github/workflows/ci.yml): PR validation; diagnostic dispatch is not equivalent to an approved PR check.
- [Pages workflow](https://github.com/Protonmatter/sol/blob/88bfb852a9b19a101a59c5053c53bccf60c1aea1/.github/workflows/deploy-pages.yml): verified master artifact publication, separate from this utility.

## Required invariants

| ID | Requirement |
|---|---|
| PUB-01 | Bind each attempt to repository identity, exact head/base branch names, expected prior head or explicit absence, candidate commit/tree, ordered parents, and an exact changed-path inventory. |
| PUB-02 | Verify committed bytes, modes, sizes, Git object IDs and SHA-256 checksums. Refuse dirty input, path traversal, escaping symlinks, unsupported submodules/LFS pointers, missing objects, undeclared changes, and filtered working bytes that differ from committed bytes. |
| PUB-03 | Persist a portable recovery packet outside the ephemeral workspace before the first remote mutation. A local path or a promised upload is insufficient. |
| PUB-04 | Journal write intent before each side effect; checkpoint returned object IDs and readback evidence before proceeding. Keep immutable, versioned checkpoints with storage IDs and hashes. |
| PUB-05 | Existing head updates require a server-side expected-value check. Never force-push, delete/recreate an existing branch, silently adopt a changed head, or bypass protection. Candidate must descend from expected head. |
| PUB-06 | Retry reads and verified content-addressed writes only within bounded limits. A timed-out mutable write is uncertain until reconciled by a fresh remote read. |
| PUB-07 | Source publication is verified only when the exact remote ref and the intended open PR both name the verified candidate commit, and the commit/tree inventory matches. Record the observation time. |
| PUB-08 | CI observation and CI success are separate evidence. Pending, absent, skipped, cancelled, diagnostic, or old-SHA runs cannot establish passing validation. |
| PUB-09 | Resume consumes a validated packet and fresh observations, not chat history. Repeating a completed attempt does not create another commit, PR, or notification. |
| PUB-10 | Keep credentials, token-bearing URLs, unrelated local files, environment dumps and raw provider diagnostics out of packets and receipts. |
| PUB-11 | Default operation is inspect/prepare; remote mutation needs an explicit execute invocation within the already-approved repository/branch scope. Refuse the default branch and release/tag namespaces. |
| PUB-12 | Missing #116 recovery inputs block that recovery only; implementation of publication safeguards can proceed independently. |

SHA-1 Git object IDs and SHA-256 file/packet checksums are different fields. Never substitute one for the other. This first implementation supports Git SHA-1 repositories and regular-file additions/modifications/deletions; reject unsupported object formats rather than reinterpret them.

## Transaction and state model

The mutable branch ref is the source-publication commit point. Git object creation, durable storage, PR creation and CI observation are not one distributed atomic transaction; they require reconciliation.

```text
prepared -> recovery-persisted -> objects-verified -> commit-verified
         -> ref-write-intent -> remote-ref-verified -> pr-verified
         -> ci-observed -> ci-passed

Any step may stop as blocked or uncertain.
A later conflicting head becomes superseded; never roll it back automatically.
```

Native Git may reach objects/commit verification in one local preparation phase. Connector publication records each object response individually. A state is a statement of evidence, not an instruction to assume that the next step happened.

Before a mutable write, record target, candidate, expected head, pre-write observation, and operation ID in durable storage. After the call, record the actual response and independently read the affected state. If the process dies after the server commits but before checkpointing, resume reads the remote first. Equality with the candidate means the write already happened; equality with expected head permits a guarded retry; a different head means conflict. An unreadable remote stays uncertain.

Base-branch observations are separate from the head lease. A base change triggers fresh reconciliation and integration validation; it is not prevented by leasing the head. Publication status never implies that base, head, checks and deployment were observed simultaneously or will stay unchanged.

## Transport design

### Preferred: native Git

Use the workspace's existing credential helper or authorized GitHub CLI identity. Check tools, repository access, endpoint identity and credential availability before expensive implementation or upload work. A successful read or dry-run is not proof that a subsequent protected write will be accepted.

Freeze a candidate commit and verify that expected head is its ancestor. Push only that exact commit to one branch, with the explicit lease form:

```text
git push --porcelain --force-with-lease=refs/heads/BRANCH:EXPECTED REMOTE CANDIDATE:refs/heads/BRANCH
```

`BRANCH`, `EXPECTED`, `REMOTE`, and `CANDIDATE` above denote validated fields assembled as an argument vector, not a shell command template. For a new branch the expected value is empty. The ancestry check is mandatory because a lease alone can authorize a non-fast-forward rewrite. See [Git push](https://git-scm.com/docs/git-push).

### API publication with a real precondition

Content upload may use GitHub's blob/tree/commit APIs. Preserve unchanged entries by building on the observed parent tree. Verify the resulting tree inventory before publication; include deletions and modes. Never upload every repository file just to update one asset.

Use GraphQL `updateRefs` with `RefUpdate.beforeOid` equal to the expected head, `afterOid` equal to the candidate, and `force: false`. GitHub documents atomic updates and a zero OID precondition for absent refs. Use exactly one head ref in this utility; prohibit deletion and unrelated ref updates. See [GraphQL Git reference](https://docs.github.com/en/graphql/reference/git#updaterefs).

The current connected GitHub app exposes `update_ref(sha, force)` but not an expected old SHA. REST `force: false` is a fast-forward guard, not compare-and-swap. A read immediately before that call does not close the race. See [REST references](https://docs.github.com/en/rest/git/refs#update-a-reference).

Therefore an API adapter must prove it can invoke `updateRefs` through its authorized runtime. When only the weaker connector action is available, it may stage verified objects and create a new, explicitly authorized, absent branch; it must stop before updating an existing branch. Do not quietly create a replacement PR for #116 or downgrade the contract. Do not extract connector credentials into another runtime. Capability detection occurs before uploading large files.

An API-created commit may have different identity metadata/signature and therefore a different SHA from a local commit. Track `source_commit_sha` and `published_commit_sha` separately and verify equal tree/parent intent. Prefer native Git for exact commit preservation. Never claim that locally tested bytes validate an unverified API-created tree.

## Durable recovery packet

A packet contains only the selected candidate's required Git objects or exact binary-safe patch/payload set, immutable `intent.json`, versioned receipt/checkpoint files, and `SHA256SUMS`. Record bundle prerequisites explicitly; do not use a blanket `--all` backup that includes unrelated refs. A binary patch does not preserve commit identity or history as a bundle does. Validate import into an isolated repository before treating the packet as recoverable. See [Git bundle](https://git-scm.com/docs/git-bundle).

`intent.json` fields: schema version; operation ID; repository full name and server repository ID; base/head ref; observed base SHA; expected head SHA or null; source commit SHA or null; candidate tree and ordered parents; changed paths with action/mode/blob OID/byte count/SHA-256; payload manifest digest; and authorized scope. Fields unavailable before object creation are null, not fabricated strings; later checkpoints bind their real values.

Checkpoint fields: sequence number; previous checkpoint SHA-256; stage; UTC timestamp; write-intent or result kind; object identities; observed branch/PR identities; provider operation correlation; durable packet location and version; and sanitized failure category. Never store a receipt claiming the storage write containing that very receipt was verified. The next checkpoint or final index records the prior storage acknowledgement.

Local journal writes use exclusive creation, fsync, atomic replacement and an exclusive per-attempt lock. A stable filesystem path is accepted only when its persistence is explicitly established. Ephemeral chat workspaces must export to the authorized Library or another approved durable store and retain the returned file ID/version. Read back or materialize that exact version and compare its checksum. Failed persistence blocks further mutations.

The artifact-store interface is `put(operation_id, sequence, bytes) -> stored_reference` and `get(stored_reference) -> bytes`; storage must provide create-only immutable versions. A small `latest` index may be updated only with its observed version as a precondition. If the provider lacks a conditional index update, publish immutable checkpoint names and discover sequences rather than overwrite blindly. No new storage provider is provisioned by this work.

Retain packets for at least 30 days after remote verification; retain unresolved attempts until explicit operator disposition. Do not auto-delete originals, logs, worktrees, orphan objects or failed checkpoints during recovery. Hashes detect changed bytes, not provenance or authorization.

## PR and CI evidence

Reuse an explicit PR number only after checking head repository/ref, base, open state and ownership scope. For a new PR, query all pages for the exact head/base pair; zero permits creation, one permits reuse, multiple or closed/merged matches require reconciliation. After a timeout, re-query before retrying creation. A duplicate-looking API response is not success without readback.

Record source head separately from the pull-request test-merge SHA. PR workflows can validate a merge result; bind that result to the head/base pair and actual run metadata rather than require every checkout SHA to equal the source head. Do not rewrite SOL's existing checkout-identity check to pretend those two SHAs are interchangeable.

Output separate booleans/statuses for `source_published`, `ci_observed`, `ci_passed`, `merged`, and `deployed`. The publisher can establish the first and observe the next two; it must never perform the last two. No waiting beyond the current invocation's deadline; return a resumable receipt with exact state.

## #116 recovery procedure

1. Refresh PR #116 and its exact head ref. Preserve that observation and inspect existing branches/checks only for evidence tied to this candidate.
2. Recover the actual prior bundle, patch/source payload, or complete Git object manifest from an accessible original workspace or a persisted artifact. Query by known IDs/paths; do not guess object hashes or repeatedly search unrelated files.
3. Validate the recovered packet, import into a new isolated worktree, compare candidate tree, changed paths, texture bytes and provenance, and preserve the original artifact. Record any missing prerequisite.
4. Re-run the candidate's appropriate checks; do not reuse an earlier test count as fresh evidence. Reconcile intervening head changes without force-pushing or regenerating the artwork.
5. Publish the verified candidate through a transport with the precondition above; verify #116's source head and then observe its CI.

Current disposition: blocked at step 2. No full candidate object ID is available. This does not block the generic utility's development. Exact source recovery, not a guessed SHA, is the required input.

## Adversarial acceptance tests

| Case | Required result |
|---|---|
| Two publishers read the same old head | One wins; the other records conflict without overwriting it. |
| Expected head is not candidate ancestor | Reject before remote mutation, even with a matching lease. |
| Binary texture contains NUL/non-UTF-8 bytes | Byte count, Git OID and SHA-256 survive packet, upload and readback exactly. |
| Upload accepted but reply lost | Reconcile by expected object identity; no mutable ref update until verification. |
| Commit exists but ref is unchanged | Resume publication from the recorded commit; do not rebuild source. |
| Ref updated but client timed out | Fresh equality check records already-applied; no second commit. |
| PR creation timed out after success | Reuse the exact matching PR; do not open another. |
| Another writer advances after publication | Report superseded with evidence; never roll back their work. |
| Durable checkpoint store fails | Stop before the next side effect, preserving uncertain state. |
| API offers only `update_ref(sha, force)` | Refuse an existing-ref update rather than claim CAS. |
| Old CI is green or diagnostic dispatch succeeds | Publication may be true, but current PR validation remains unproven. |
| Original Earth candidate is missing | Keep #116 unchanged; report recovery input missing, not fixed. |
| Corrupt packet, duplicate JSON keys, escaping path, symlink or extra file | Reject before any remote write. |
| Credentials unavailable or protected write refused | Preserve recovery packet; report failure without weakening security. |

## Rollout and completion

Implement and test in a separate development PR. Add contributor/agent instructions for one standard publish/resume entry point; local hooks are optional assistance, never the sole enforcement. CI can verify packet/schema contracts, but cannot prevent an agent from abandoning an unpushed workspace. The publishing harness must actually call the helper and durable-store adapter.

Completion requires tested native transport, a capability-honest API adapter, verified packet recovery after workspace deletion, post-write branch/PR equality, regression coverage, and retained live qualification evidence for each enabled transport. A design document, a green model test, or a single uploaded blob does not satisfy that definition.
