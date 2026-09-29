# Durable PR Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the real #116 Earth candidate when available and make subsequent PR publication resumable, conflict-safe and independently verifiable.

**Architecture:** Separate immutable candidate preparation, durable checkpoint storage, transport, and remote evidence reconciliation. Prefer native Git with an explicit lease. API publication uses a server-side `beforeOid` precondition; a connector lacking that primitive cannot silently substitute a weaker operation.

**Tech Stack:** Python 3.11+ standard library, Git, existing authorized GitHub CLI or injected connected-app actions, repository unittest infrastructure. No new service or production dependency.

**Spec:** [Durable PR publication design](../specs/2026-09-25-durable-pr-publication-design.md).

**Status:** Implementation plan, not implemented software. The conversation approved the design brief and preparation of this specification/plan. No statement below records a completed implementation test or recovered Earth asset.

## Global Constraints

- No non-fast-forward history rewrite, deletion/recreation of an existing remote branch, direct default-branch push, automatic merge, deployment, or protection change.
- Existing head updates require a server-side expected-value check and candidate ancestry validation.
- Persist exact recovery bytes outside an ephemeral workspace before remote mutation; local-only checkpoints do not qualify.
- Keep source publication, CI observation, CI success, merge and deployment distinct.
- Preserve #116's actual approved source; missing inputs must not be replaced by a newly invented Earth implementation.
- Keep the daily-feed adapter and its activation hold unchanged.
- Python 3.11+ standard library only; honor existing repository coverage and governance gates.

## Review Focus

1. A server accepts a write but the client loses its reply: reconcile before retry; test in tasks 3 and 4.
2. A changed head races between discovery and publication: only a server-enforced expected value closes the race; test in tasks 3 and 4.
3. The chat workspace disappears after object upload: exact candidate bytes and IDs must be recoverable from the stored packet; test in task 2.
4. Native and API commits have equal trees but different identities: verify tree and parents, retain both SHAs, never conflate test evidence; test in tasks 1 and 4.
5. CI runs a test merge or returns only an old/diagnostic run: bind source/base/run identities and do not mark current checks passed; test in task 5.

## File map and shared interfaces

| Planned path | Responsibility |
|---|---|
| `tools/pr_publication.py` | Validated intent/receipt types, state decisions, reconciliation; no network on import. |
| `tools/pr_publication_packet.py` | Byte inventory, bundle/payload creation, checksum validation, local journal, durable-store contract. |
| `tools/pr_publication_git.py` | Native preparation, explicit lease, sanitized subprocess execution and readback. |
| `tools/pr_publication_api.py` | Git object staging, expected-head GraphQL mutation, connector capability checks. |
| `tools/publish_pr_candidate.py` | Inspect/prepare/execute/resume CLI and credential-safe output. |
| `tests/python/test_pr_publication*.py` | Unit, failure-injection and real local-Git integration tests. |
| `docs/PR_PUBLICATION.md` | Operational publish/resume/recovery procedure. |
| `AGENTS.md` | New concise entry-point rule; no such root file was returned in the inspected baseline. |

Keep the existing `tools/delivery_lifecycle.py` unchanged in the first implementation. Reusing concepts does not mean expanding its generated-data allowlist or coupling generic publication to its feed schemas.

Interfaces to define in task 1 and consume unchanged:

```python
from dataclasses import dataclass
from typing import Literal, Protocol

@dataclass(frozen=True)
class Intent:
    operation_id: str
    repository: str
    repository_id: str
    base_ref: str
    head_ref: str
    observed_base_sha: str
    expected_head_sha: str | None
    source_commit_sha: str | None
    candidate_sha: str
    tree_sha: str
    packet_sha256: str

@dataclass(frozen=True)
class Observation:
    repository: str
    head_ref: str
    head_sha: str | None
    base_ref: str
    base_sha: str
    pr_number: int | None
    pr_head_sha: str | None
    pr_state: str | None
    observed_at: str

@dataclass(frozen=True)
class Decision:
    action: Literal['publish', 'reconcile-pr', 'verified', 'conflict', 'blocked']
    reason: str

class DurableStore(Protocol):
    def put(self, operation_id: str, sequence: int, payload: bytes) -> str: ...
    def get(self, reference: str) -> bytes: ...

class Transport(Protocol):
    def observe(self, intent: Intent) -> Observation: ...
    def publish(self, intent: Intent) -> None: ...
```

`Intent` is admitted only after schema, byte inventory and parent validation. A structural dataclass is not that validation. `candidate_sha` denotes the actual commit about to be published; a later API-created commit requires a new checkpoint binding its real SHA. All protocol method bodies above are interface declarations, not missing implementation.

## Task 0: Recover or explicitly hold the original Earth candidate

**Files:** task-local `recovery-observation.json` and retained candidate packet; no changes to #116 during discovery.

**Interfaces:** consumes fresh PR/ref reads and an actual artifact reference; produces either a verified recovered candidate or a typed `missing-original-candidate` disposition.

- [ ] Refresh #116. Record repository, source head, base and timestamp; do not use its temporary merge commit as source head.
- [ ] Inspect a recovered bundle/manifest only when its exact ID or filesystem path is actually available. Preserve it before import. The presently recorded original head is `0cf75a30b90c283860158f63091ecdbad9548322`; refresh rather than hardcode it into the publisher.
- [ ] Validate and import a supplied bundle in an isolated repository. For a bundle path passed as the script's first argument, the inspection commands are:

```bash
set -euo pipefail
bundle=$(realpath "$1")
git bundle verify "$bundle"
git bundle list-heads "$bundle"
```

- [ ] Compare recovered commit/tree, parents, changed paths, texture checksum and provenance with the retained manifest. Import only the selected advertised ref into a new recovery ref; do not fetch every ref or clean the original workspace.
- [ ] Run the recovered candidate's actual checks and retain current results. Do not carry forward the prior 1,326-test claim as fresh validation.
- [ ] If no packet/manifest/source exists, record `missing-original-candidate`, leave #116 unchanged, and proceed with tasks 1-6. Do not spend another session repeating the same unproductive search.

**Expected:** recovery is either backed by actual bytes and identities or explicitly held. No guessed SHA and no claim that an upload-task label proves a blob exists.

## Task 1: Immutable intent validation and reconciliation policy

**Files:** create `tools/pr_publication.py` and `tests/python/test_pr_publication.py`.

**Interfaces:** implements the types above; produces `reconcile(intent: Intent, observed: Observation) -> Decision` and strict JSON admission functions.

- [ ] Write the failing tests first. Construct fixture intents with the exact constructor above; `old`, `candidate` and `base` are local test commit IDs or valid synthetic 40-hex fixture IDs, never live-repository placeholders.

```python
def test_changed_head_is_not_adopted(self):
    from dataclasses import replace
    observed = replace(self.observed, head_sha='f' * 40)
    self.assertEqual('conflict', reconcile(self.intent, observed).action)

def test_remote_commit_without_pr_needs_reconciliation(self):
    from dataclasses import replace
    observed = replace(self.observed, head_sha=self.intent.candidate_sha,
                       pr_number=None, pr_head_sha=None, pr_state=None)
    self.assertEqual('reconcile-pr', reconcile(self.intent, observed).action)

def test_remote_and_pr_equality_is_verified(self):
    from dataclasses import replace
    observed = replace(self.observed, head_sha=self.intent.candidate_sha,
                       pr_number=116, pr_head_sha=self.intent.candidate_sha,
                       pr_state='open')
    self.assertEqual('verified', reconcile(self.intent, observed).action)
```

The test class uses this explicit synthetic setup (not live GitHub identities):

```python
def setUp(self):
    self.intent = Intent(
        operation_id='fixture-01', repository='fixture/sol',
        repository_id='fixture-node-id', base_ref='refs/heads/master',
        head_ref='refs/heads/feature', observed_base_sha='3' * 40,
        expected_head_sha='2' * 40, source_commit_sha='1' * 40,
        candidate_sha='1' * 40, tree_sha='4' * 40, packet_sha256='5' * 64)
    self.observed = Observation(
        repository='fixture/sol', head_ref='refs/heads/feature',
        head_sha='2' * 40, base_ref='refs/heads/master', base_sha='3' * 40,
        pr_number=116, pr_head_sha='2' * 40, pr_state='open',
        observed_at='2026-09-25T08:00:00Z')
```

- [ ] Run `PYTHONPATH=tools python -m unittest discover -s tests/python -p test_pr_publication.py -v`; confirm failure because the module/behavior is absent.
- [ ] Implement the ordered decision table: wrong repository/ref/base identity -> blocked; changed base SHA -> blocked with revalidation reason; remote candidate plus matching open PR -> verified; remote candidate without a matching open PR -> reconcile-pr; remote expected head -> publish; other head -> conflict. Closed/merged or mismatched PR identities must block, not trigger a replacement.
- [ ] Add admission tests for bool-as-int, duplicate keys, malformed or zero object IDs, full-length SHA values, null-versus-absent branch, unknown schema fields, normalized traversal paths, default/release/tag branch targets and unsupported object formats.
- [ ] Run the same test command to green, then commit `feat: define immutable PR publication intent and reconciliation`.

## Task 2: Portable packet and durable checkpoints

**Files:** create `tools/pr_publication_packet.py` and `tests/python/test_pr_publication_packet.py`.

**Interfaces:** consumes admitted intent and committed tree; produces verified packet bytes, append-only checkpoints, and `checkpoint(store, operation_id, sequence, payload) -> stored_reference`.

- [ ] Add a deterministic non-UTF-8 payload fixture and failure-injected stores. The packet round-trip test must compare bytes, Git OID, length and SHA-256, not just successful decoding.

```python
payload = bytes(range(256)) * 6554
self.assertIn(b'\x00', payload)
self.assertGreater(len(payload), 1_600_000)
with self.assertRaises(UnicodeDecodeError):
    payload.decode('utf-8')
```

- [ ] Run the new test file and observe red. Implement committed inventory with `git ls-tree -rz` and `git cat-file`, NUL-safe path handling, explicit modes, deletion records and no working-tree filters. Reject symlinks/submodules/LFS pointers in this first version.
- [ ] Create a candidate-specific bundle using a named recovery ref, not a bare SHA argument or `--all`. Record prerequisites. Verify it in an isolated repository with those prerequisites; also test full recovery after deleting the originating workspace.
- [ ] Implement immutable checkpoint names, exclusive local creation, lock ownership, fsync and storage readback. The persistence primitive is:

```python
def checkpoint(store, operation_id, sequence, payload):
    reference = store.put(operation_id, sequence, payload)
    if store.get(reference) != payload:
        raise ValueError('durable checkpoint readback mismatch')
    return reference
```

- [ ] Surround the primitive with strict operation/sequence validation and typed storage errors. Store a previous checkpoint hash; reject missing, duplicate, out-of-order or altered checkpoints. Avoid self-referential success receipts.
- [ ] Test permission failure, truncation, competing local writers, torn local writes, mismatched readback, and failure immediately after server mutation. No next mutation is permitted without a durable checkpoint.
- [ ] Run `PYTHONPATH=tools python -m unittest discover -s tests/python -p test_pr_publication_packet.py -v` to green; commit `feat: persist recoverable publication packets and checkpoints`.

## Task 3: Native Git transport with explicit lease

**Files:** create `tools/pr_publication_git.py` and `tests/python/test_pr_publication_git.py`.

**Interfaces:** implements `Transport`; consumes immutable candidate/packet and authorized existing Git credentials; produces fresh branch observations and sanitized outcomes.

- [ ] Build test repositories using `tempfile.TemporaryDirectory`, `git init --bare`, and two independent clones. Configure identity only in those local test repositories. Commit the binary fixture from task 2; use actual returned commit IDs in assertions.
- [ ] Prove red for stale expected head, non-ancestor candidate, create-only branch collision, successful write followed by simulated lost reply, and another writer advancing after success.
- [ ] Implement argument-vector subprocess execution, per-call timeout, bounded output and redacted error categories. Never use `shell=True`, print tokens, disable hooks, modify global credential configuration, or insert credentials into URLs.
- [ ] Before push, verify exact target repository/ref, clean frozen candidate, object closure, changed-path inventory, durable packet readback and ancestor relationship. Use the exact lease form, not the implicit remote-tracking form:

```python
args = ['git', 'push', '--porcelain',
        f'--force-with-lease={intent.head_ref}:{intent.expected_head_sha or ""}',
        remote_url, f'{intent.candidate_sha}:{intent.head_ref}']
```

- [ ] On any push error or timeout, observe remote before retry. Candidate equality means already-applied; expected-head equality permits another guarded attempt within budget; any other head is conflict. Unreadable state is uncertain. Never roll back.
- [ ] Assert the final bare-repository ref equals the intended candidate after success and equals the competing writer after a rejected lease. Run `PYTHONPATH=tools python -m unittest discover -s tests/python -p test_pr_publication_git.py -v` to green; commit `feat: publish frozen candidates with explicit Git leases`.

## Task 4: Capability-honest API transport

**Files:** create `tools/pr_publication_api.py` and `tests/python/test_pr_publication_api.py`.

**Interfaces:** injected object-store operations plus `updateRefs`; checkpoint every operation. Never depend on ChatGPT credentials being available to a standalone script.

- [ ] Add red tests for missing expected-head capability, blob response OID mismatch, missing texture, changed tree mode, omitted deletion, timeout after commit creation, server-generated commit identity differences and stale-head race.
- [ ] Compute binary Git blob OIDs from exact bytes using `git hash-object --no-filters`; encode for API transport programmatically. Validate returned IDs and content readback. Build on the actual base tree; do not replace the whole tree with just changed files.
- [ ] Record tree and ordered parents, verify the server-created commit, and checkpoint its actual SHA before attempting any ref change. Preserve the local source SHA separately.
- [ ] Construct the guarded mutation from validated fields:

```graphql
mutation PublishCandidate($input: UpdateRefsInput!) {
  updateRefs(input: $input) { clientMutationId }
}
```

```python
variables = {'input': {
    'repositoryId': intent.repository_id,
    'clientMutationId': intent.operation_id,
    'refUpdates': [{
        'name': intent.head_ref,
        'beforeOid': intent.expected_head_sha or '0' * 40,
        'afterOid': intent.candidate_sha,
        'force': False,
    }],
}}
```

- [ ] Resolve and validate the GraphQL repository node ID separately from its REST numeric ID; use the node ID in `repositoryId`. Retain both forms in the admitted identity record or transport metadata.
- [ ] If the authorized bridge exposes only REST `update_ref(sha, force)`, reject existing-ref publication with `expected-head-capability-unavailable`. Do not perform that weaker call. A new authorized branch may use create-only creation and subsequent readback.
- [ ] Reconcile uncertain object/commit/ref writes by saved identities. No progress message may upgrade staging to source publication. Run `PYTHONPATH=tools python -m unittest discover -s tests/python -p test_pr_publication_api.py -v` to green; commit `feat: add resumable API publication with enforced head preconditions`.

## Task 5: PR discovery, CI evidence and CLI

**Files:** create `tools/publish_pr_candidate.py`, extend `tools/pr_publication.py`, create `tests/python/test_pr_publication_cli.py`.

**Interfaces:** inspect/prepare/execute/resume commands using the same stored operation; structured output separates publication and CI.

- [ ] Add red tests for explicit wrong PR, closed/merged PR, duplicate exact matches, pagination, creation timeout after success, no CI, old green CI, diagnostic-only run, test-merge identity, timeout and superseded head.
- [ ] Implement full head/base/repository matching and post-write readback. Query all pages before deciding absence. On PR creation timeout, re-query; never retry creation blindly.
- [ ] Bind PR test-merge runs to the observed source/base pair. Keep `source_head_sha`, `test_merge_sha`, run ID, attempt and event separate; do not replace CI's existing checkout check.
- [ ] Implement argument parsing with `inspect`, `prepare`, `execute`, `resume` subcommands. Require packet plus storage reference for execution. Existing PR updates require explicit PR number; new PR creation requires explicit head/base/title. No command creates credentials or enables auto-merge.
- [ ] Return exit 0 only for the requested verified stage, exit 2 for invalid input, exit 3 for conflict, exit 4 for missing capability/credential/recovery input, and exit 5 for uncertain/deadline state. Preserve receipts on all exits. CI-pending may accompany verified source publication; it is not CI-passed.
- [ ] Set a total invocation deadline and bounded retries; no background work is implied. A subsequent invocation resumes from the saved packet/checkpoints. Run `PYTHONPATH=tools python -m unittest discover -s tests/python -p test_pr_publication_cli.py -v` to green; commit `feat: expose publish and resume with independent PR and CI evidence`.

## Task 6: Operational adoption and qualification

**Files:** create `docs/PR_PUBLICATION.md` and `AGENTS.md`; update `.github/PULL_REQUEST_TEMPLATE.md` with publication-evidence fields only; add qualification tests without weakening existing gates.

- [ ] Document one agent/operator workflow: preflight identity and transport capability, freeze candidate, persist packet, execute, verify remote PR, report CI separately. Explain that local helper files alone cannot make an unconfigured chat runtime invoke them.
- [ ] Add a concise agent rule requiring the entry point or capability-equivalent adapter and a final receipt. Do not require storing credentials or mutable receipts in the public source tree.
- [ ] Add template fields for source SHA, published SHA when different, verified tree SHA, PR head observation and CI run/attempt. Leave actual receipt references in approved durable storage.
- [ ] Run all new unittest files, then existing Python tests, documentation and SDLC validators. Preserve unavailable-tool failures honestly; do not report a full-repo green result from scoped tests.

```bash
PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_pr_publication*.py' -v
PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py' -v
python tools/validate_docs.py
python tools/validate_sdlc.py
git diff --check
```

- [ ] Run failure injection after each remote side effect and delete the local test workspace before resume from the durable packet. Confirm exact binary bytes and intended branch identity.
- [ ] Perform separate live qualification of each enabled transport on an explicitly authorized disposable branch with no deployment. Do not fabricate a successful `updateRefs` call when the connector cannot invoke it.
- [ ] Review the full diff independently when a reviewer is available; otherwise label self-review. Fix critical/important findings with a failing regression first, preserve deferred minor findings, and keep merge authority separate.
- [ ] Commit `docs: standardize PR publication and retained recovery evidence`. Report implemented versus qualified versus blocked components separately.

## Execution order and completion report

Start with task 0 once, then continue safeguards even if original Earth source is missing. Tasks 1-5 are implementation dependencies; task 6 is adoption and qualification. Use a single task ledger stored with the recovery packet, not conversation history alone.

The final implementation report must name actual commit/PR URLs, commands and results, packet storage ID/checksum, native/API capability status, and #116's separately observed recovery disposition. No claim of a repaired SHA, completed Earth upload or deployed site is allowed without the matching evidence.
