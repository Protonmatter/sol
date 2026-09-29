# Daily Orrery reference refresh

This updater refreshes the dated **Source-qualified Earth** Terra/Aqua MODIS
composite. It does not refresh the default Illustrative appearance, model state,
lunar coefficients, or EOP numerical tables. The daily workflow separately checks
the existing EOP prediction horizon. The design is [RFC 0011](rfcs/0011-daily-orrery-refresh.md).

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
For an uncertain push/create outcome, inspect GitHub and the local commit before
another run. The tool never automatically repeats a write whose outcome is unknown.
A failure can leave a local staged change/commit; preserve it for diagnosis and
start a fresh disposable checkout when regenerating.

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
