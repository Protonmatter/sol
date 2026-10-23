# Daily Orrery reference refresh

This updater refreshes the dated **Source-qualified Earth** Terra/Aqua MODIS
composite. It does not refresh the default Illustrative appearance, model state,
lunar coefficients, or EOP numerical tables. The daily workflow separately checks
the existing EOP prediction horizon. The design is [RFC 0011](rfcs/0011-daily-orrery-refresh.md).

In Solar System, the daily MODIS option under **Earth layers → Cloud imagery**
reads its observation date from the same generated reference metadata as the
layer status. A refreshed release updates both labels without editing HTML;
changing model time does not change the observation date. Before initialization
the option is undated, and missing date metadata is shown as `date unavailable`.

## Preconditions and permissions

Use Python 3.12 or later and a dedicated clean Git checkout. Preview and staging
use local files. Acquisition uses the existing bounded NASA HTTPS downloader.
Only explicit publication uses GitHub CLI, Git and runtime `GH_TOKEN` credentials.
The initial workflow targets `github-actions[bot]` with `GITHUB_TOKEN`; it does
not provision a PAT or GitHub App. The repository must permit Actions to create
pull requests. Required CI and human merge review still apply.

The schedule is 06:20 UTC daily; GitHub may delay scheduled runs. Acquisition is
read-only. The publisher is skipped unless the repository variable
`ORRERY_REFRESH_PUBLISH_ENABLED` equals `true`. A workflow dispatch must target
master. No setting is enabled by installing or locally testing this implementation.

## Acquire and inspect

Use a new ignored output directory for each attempt:

```powershell
python tools/fetch_earth_reference.py --latest-prior-day --aqua-fill --out build/orrery-candidate
python tools/orrery_refresh.py --candidate-dir build/orrery-candidate --out build/orrery-plan.json
```

The second command is a read-only preview. It verifies the source bytes and repeats
the mask-based derivation. JSON output includes `state`, `generation_base_sha`,
`manifest_sha256`, source date, semantic identity, exact changed paths, and before/
after hashes. `validated` means a local candidate is admissible; it does not mean
reviewed, published, merged or deployed. `no-op` means the accepted data already
has the same semantic identity. Raw source evidence is never committed to the app.

To exercise local staging in a disposable clean checkout:

```powershell
python tools/orrery_refresh.py --candidate-dir PATH_TO_CANDIDATE --checkout PATH_TO_DISPOSABLE_CHECKOUT --stage
```

Staging applies the bounded raster/inventory/generated-module change without a
commit. The tool refuses a dirty checkout. Inspect `git diff --stat` and run the
visual validator in that checkout. Do not use the preview output file as permission
to publish arbitrary paths: the publisher derives its allowlist from the actual
base/candidate Git trees.

## Activate publication after review

1. Merge the reviewed updater implementation and run **Daily Orrery reference
   refresh** on master with the variable absent/false.
2. Inspect the `orrery-candidate-*` and `orrery-plan-*` artifacts. The candidate's
   date, source URLs, coverage and immutable identity must match the proposed data.
3. Confirm Actions can create PRs. Enable the repository variable only when ready
   for the next run to write `automation/daily-orrery` and create/update one draft PR.
4. Inspect the first draft's diff and required checks. Under GitHub's current behavior,
   PRs created or updated with GITHUB_TOKEN require a maintainer to approve workflow runs.
   Do not treat absent checks as
   success or enable automatic merging to bypass them.
5. Mark the reviewed draft ready, merge through normal policy, and separately verify
   the normal master CI/Pages release and served source date.

The workflow's `--publish` invocation binds `--expected-base`,
`--expected-manifest-sha256` and `--repository` to the current run's trusted values.
These arguments are mandatory for remote execution. This version supports only the
built-in bot identity. A GitHub App requires a separate reviewed configuration change.

GitHub documents token-triggered workflow behavior in
[GITHUB_TOKEN workflow behavior](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs).
Repository policy and GitHub behavior should be verified at activation time.

## Results and holds

Exit code `0` means preview/staging succeeded, no change was needed, or a draft PR
was read back successfully (`awaiting-approval`). Exit `1` means validation or
delivery failed/held; argparse uses `2` for invalid command arguments. Evidence
output files must be new and are never overwritten.

The tool holds on stale/regressing dates, bad source/mask/grid/hash evidence,
zero observed pixels, a changed master or automation head, unknown ownership,
mixed/unexpected file changes, a ready-for-review PR, or a closed unmerged PR.
After an acknowledged push to an existing owned draft, separately read PR and
branch responses may briefly disagree. Only a mismatch between the exact previous
head and candidate head, on the same owned draft and generation base, permits
another read. A complete observation identical to the verified pre-write state
also permits another read. Reconciliation makes at most four full observations,
two seconds apart, within a 20-second monotonic budget. Production Git/GitHub CLI
read timeouts are capped to the remaining budget; no command starts after expiry
and a late read cannot claim success. The attempt cap also bounds frozen-clock
behavior. Injected transports must bound their own I/O; the publisher still checks
the deadline before and after their observations.

Each successful observation repeats the original ownership, parent, tree, blob,
allowlist, inventory and semantic-identity proof. A changed master, unrelated head,
different PR number, changed owner or draft status, invalid data, malformed response,
or transport failure holds immediately. Pre-write mismatches never enter polling.
Neither a push nor PR creation is repeated. First-cycle PR discovery is still
observed once; the bounded transition handling applies to existing owned drafts.

For an uncertain push/create outcome, inspect GitHub and the local commit before
another run. A failed push receives one readback and always holds, without trying
PR creation, even if its readback also fails. An uncertain PR creation can be
confirmed by the normal exact readback, but creation is never repeated. The tool
never automatically repeats a write whose outcome is unknown.
A failure can leave a local staged change/commit; preserve it for diagnosis and
start a fresh disposable checkout when regenerating.

### Publication diagnostics

Delivery results add fields without changing the existing state/action/exit-code
contract. These diagnostics distinguish a pre-write hold from a branch update that
was acknowledged but not fully confirmed:

| Field | Meaning |
|---|---|
| `phase` | Input/candidate verification, initial/pre-write observation, planning, push, push reconciliation, PR creation, post-write observation, or complete. |
| `reason_code` | Controlled failure/decision code; arbitrary exception messages and command output are never included. |
| `write_attempted`, `write_outcome` | Branch push status: `not-attempted`, `unknown`, `acknowledged`, or `confirmed`. A command exception remains `unknown`. |
| `pr_creation_attempted`, `pr_creation_outcome` | Separate PR-creation status with the same outcome vocabulary. |
| `candidate_sha`, `expected_head_sha` | Verified candidate and lease identities, when candidate verification has succeeded. |
| `observed_ref_sha`, `observed_pr_head_sha`, `observed_base_sha` | Last available syntactically valid full SHAs; invalid values are omitted as null. |
| `observation_attempt` | Post-write read count; zero before the write and one for an uncertain push's single readback. |

Examples of safe codes are `pr-head-ref-mismatch`, `remote-blob-identity-mismatch`,
`commit-ownership-or-parent-invalid`, `remote-data-proof-invalid`,
`pre-write-state-changed`, `post-write-state-mismatch`, `push-outcome-uncertain`,
and `reconciliation-exhausted`. Unclassified failures use a phase-specific
`*-failed` code and an exception type without echoing its message. A failed
uncertain-push readback also records `observation_error_type` and, for a PR/ref
mismatch, `observation_reason_code`, while retaining the primary push diagnosis.

On `reconciliation-exhausted`, retain the delivery artifact and inspect the exact
candidate, branch, owned draft and required checks before another attempt. A
`confirmed` write plus `awaiting-approval` means source publication was read back;
it does not mean CI ran or passed, a human reviewed it, or a release was deployed.

Retrieval time and capabilities-only changes are ignored for meaningful identity.
Changed source bytes on the same date produce a revision even if the final visible
pixels are identical. Machine validation is recorded under `automated_refresh`;
`reviewed_at: null` avoids asserting human review. Partial swath coverage remains
explicit; this is dated surface-plus-cloud imagery, not simultaneous live weather.

## Retention and rollback

Candidate source artifacts are retained for 30 days; plan/delivery artifacts for
90 days. Download the original candidate if a longer replay record is required.
Source hashes and attribution remain in the data PR. One fixed raster path limits
working-tree growth, but frequent binary changes still grow Git history (about
5 MB per changed image, approximately 1.8 GB per year of daily merges before Git
compression). No automatic history cleanup is performed.

Set `ORRERY_REFRESH_PUBLISH_ENABLED=false` or remove it to stop writes. Disable the
workflow to stop acquisition. Revert the offending data PR as a unit to restore
the inventory, generated module and raster together. Keep publication disabled
while reconciling a rollback or intentionally closed proposal. Never delete or
force-update an unfamiliar automation branch merely to make the updater pass.

## Validation commands

```powershell
$env:PYTHONPATH='tools'
python -m unittest discover -s tests/python -p 'test_orrery_*.py' -v
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_visual_assets.py
python tools/check_eop_freshness.py
```

Local tests use fixture files and synthetic GitHub transports. They do not prove
hosted token permissions, real bot ownership, recurring scheduling or publication.
