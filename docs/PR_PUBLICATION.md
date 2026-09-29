# Verified PR publication

This utility publishes a frozen, reviewed commit and preserves enough information
to resume an interrupted publication. It does not generate the change, commit a
dirty worktree, merge a PR, modify protection, or deploy a release.

## Entry points and prerequisites

Use `python tools/publish_pr_candidate.py inspect`, `prepare`, `execute`, and
`resume`. Python 3.11+, Git, and an existing authorized `gh` login are required.
No production dependency is added. The implementation uses the credentials already
available to Git and GitHub CLI; it does not create or copy tokens, configure global
credential helpers, or turn off hooks. A readable public repository does not prove
that an authenticated push will succeed.

Run publication from a clean, committed feature branch. Choose an operator-managed
persistent directory outside the checkout, with access restricted to the people
allowed to read the source. Confirm its persistence explicitly. A temporary chat
workspace, including `/mnt/data`, is not persistent merely because it has a path.

`--allow-path` is repeatable and must enumerate the exact diff from the observed
remote feature head, or from the observed base for a new branch. Deletions and mode
changes count. Renames are represented as delete/add. Every tracked working file is
compared against committed bytes, including files hidden by Git index flags.

## A normal publication

This PowerShell example publishes a new PR from the current feature branch. Review
the path list before execution. The title is a human-readable description, not an
object identifier. No SHA needs to be copied manually.

```powershell
git fetch origin master
$branch = (git branch --show-current).Trim()
$operation = 'publish-' + [guid]::NewGuid().ToString('N')
$store = Join-Path $HOME 'sol-publication-recovery'
$paths = @(git diff --name-only --no-renames origin/master HEAD)
$paths
$prepareArgs = @(
  'tools/publish_pr_candidate.py', 'prepare',
  '--repository', 'Protonmatter/sol', '--head', $branch, '--base', 'master',
  '--title', 'Publish reviewed feature', '--operation', $operation,
  '--store', $store, '--confirm-persistent-store'
)
foreach ($path in $paths) { $prepareArgs += @('--allow-path', $path) }
python @prepareArgs
if ($LASTEXITCODE -ne 0) { throw 'Preparation failed; no publication attempted.' }
python tools/publish_pr_candidate.py execute --operation $operation --store $store --confirm-persistent-store
```

For an existing PR, supply its explicit `--pr` number in place of `--title` and
review the diff against that branch's current remote head. Preparation verifies the
PR repository, head/base refs and author. It never retargets a PR or creates a
replacement for a missing, closed, merged, mismatched or ambiguous one. Reusing an
operation ID with `prepare` is rejected; use `resume` for that operation.

Use `inspect --repository Protonmatter/sol --head FEATURE --base master` before
expensive implementation to check the actual endpoint and transport availability.
`FEATURE` denotes the intended feature branch in this inspection-only example.
Inspection performs no source upload or branch write.

## Resume after interruption

Run the same operation against the same trusted store:

```powershell
python tools/publish_pr_candidate.py resume --operation $operation --store $store --confirm-persistent-store --checkout (Get-Location).Path
```

The checkpoint chain supplies the frozen candidate, intended PR, previous head,
transport, and object IDs. A fresh remote read distinguishes already-applied writes
from safe retries and conflicting updates. A timed-out PR creation is re-read, not
blindly repeated. A commit ID returned by the API is saved before its readback, so
an interruption does not erase the only record of a server-normalized commit.

The candidate packet contains a Git bundle, its prerequisite anchor, exact changed
blobs, raw commit, tree/parent metadata and checksums. It is incremental, not a copy
of every repository ref. After losing the checkout, clone the approved repository
again so the recorded prerequisite is available, then use `resume --checkout` on
that clone. The utility imports and validates the candidate objects without
checking out or executing files from the packet. Missing prerequisites stop the
operation; the tool never downloads from an unrecorded source or invents content.

Do not delete a recovery store to clear an error. Checkpoints and packets are
create-only and read back after writing. A per-operation OS lock prevents two local
writers; it releases on process exit. Interrupted temporary files are not evidence
of successful publication. Hashes detect changed bytes, not authorization or
provenance. Retain unresolved operations until explicit disposition, and retain
verified publication evidence for at least 30 days. No automatic cleanup runs.

## Native and API transports

Native Git is the default. It preserves exact commit identity, verifies candidate
ancestry and endpoint expansion, pushes one exact ref with an explicit expected-head
lease, and independently reads the remote and PR afterward. It refuses Git URL
rewrites instead of sending source to a different repository. It does not enable
follow-tags, recurse into submodules, or weaken hooks/protection.

API mode is selected during preparation with `--transport api`. The concrete client
uses `gh api` for binary-safe blob upload, tree construction on the admitted base,
frozen commit metadata and GraphQL `updateRefs` with `beforeOid` and `force: false`.
It preserves source and published commit SHAs separately when the server normalizes
identity metadata. Unsupported signed/encoding headers stop API preparation for
publication; native Git remains the exact-identity path. API parent commits must
already exist remotely; native Git transfers otherwise-unpublished history.

A connected-app bridge can implement the same object/readback interface. If it only
exposes REST `update_ref(sha, force)`, it must declare expected-head capability
unavailable. It may create an explicitly authorized absent branch using a
create-only operation, but cannot update an existing branch. It must never extract
connector credentials into another runtime or downgrade CAS after an error.

The concrete CLI storage implementation is an explicitly confirmed persistent
filesystem. A chat/Library bridge must persist the same packet/checkpoints through
its authorized file actions, retain returned storage IDs/versions, and verify
readback. The script does not secretly have access to ChatGPT's Library connector.

## Status and evidence

Success means the intended remote branch and open PR both contain the verified
candidate, and the published tree and ordered parents match the packet. CI is
reported separately. The default CI scope is `.github/workflows/ci.yml`; repeat
`--workflow` during preparation to require more specific workflow paths. This is
not a substitute for repository branch-protection or human-review requirements.

CI evidence must match the source/base pair and PR. PR test-merge SHAs are recorded
separately from source SHAs. Old, diagnostic, unrelated, skipped, pending or
cancelled runs do not establish passing validation. A workflow only counts as passed
when its observed jobs all completed successfully. An absent CI run does not cause
a false `ci-observed` checkpoint. No background polling is started.

| Exit | Meaning |
|---|---|
| 0 | Requested preparation or source-publication stage verified; inspect the independent CI fields. |
| 2 | Invalid input, packet, schema, path or local operation. |
| 3 | Concurrent head change, PR conflict or operation-ID collision. |
| 4 | Missing capability, credential, prerequisite or recovery input. |
| 5 | Timed-out or otherwise uncertain operation; reconcile by resuming. |

On failure, `source_published: null` means unverified, not proof that no remote write
occurred. Earlier immutable checkpoints record completed observations. Never
interpret a missing final receipt as proof that the previous head was retained.
The publisher reports `merged: false` and `deployed: false` for its own actions;
it implements neither operation.

## Tests and qualification

```bash
PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_pr_publication*.py' -v
```

The tests use real local Git repositories, a 1,677,824-byte non-UTF-8 payload,
workspace deletion/restoration, stale leases, redirected remotes, crash boundaries,
API response loss, duplicate PR prevention, strict input admission, and CI identity
fixtures. API service boundaries are simulated; they are not a claim of live
GraphQL qualification. Windows directory-fsync durability and physical network
filesystem behavior are not established by Linux tests. POSIX file and directory
fsync are used; unsupported filesystem operations fail rather than silently bypass
persistence.

The helper and agent instructions must actually be adopted by the authoring runtime.
A CI job cannot rescue bytes that were never uploaded or stop a session from ending
with an unpushed worktree. No CI job is added that rewrites source branches.

Original Earth PR #116 is separate. Its missing newer candidate has not been
recreated or replaced by this publisher. The approved publication design and plan
are retained under `docs/superpowers/`; this implementation follows their boundary
between recovery, source publication, validation and release.

References: [Git push](https://git-scm.com/docs/git-push),
[Git bundle](https://git-scm.com/docs/git-bundle),
[GitHub reference mutations](https://docs.github.com/en/graphql/reference/git#updaterefs),
and [GitHub REST references](https://docs.github.com/en/rest/git/refs).
