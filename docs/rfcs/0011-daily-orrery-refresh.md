# RFC 0011: Daily Orrery reference refresh through a draft PR

- Status: Draft
- Authors: Sol maintainers
- Created: 2026-09-29
- Target: Separate daily Orrery updater implementation
- Requirements: `SOL-DATA-002`, `SOL-VIS-004`, `SOL-CI-001`, `SOL-TEST-001`

## Summary

Refresh the Source-qualified Earth daily composite from NASA GIBS once a day and
propose the validated change through one owned draft pull request. Publication is
disabled unless the repository owner enables it. This RFC records the implementation
requested after the review fixes; it is not evidence of hosted updater qualification.

## Context

Earth's dated Terra/Aqua MODIS reference is pinned in the visual inventory. Acquisition
already retains original image, mask, palette and capabilities evidence. It currently
requires a manual inventory/module update. The illustrative appearance is a separate
historical artistic reference. Daily retrieval must not relabel it as current imagery.

## Requirements

`SOL-DATA-002`: A daily candidate MUST bind its source bytes, masks, source date,
derivation and base commit. It MUST reject stale, invalid or regressing dates and
unintended file changes. Meaningfully identical data MUST NOT create another commit
or PR. Publication MUST maintain at most one owned draft PR, preserve review and
required checks, and fail closed on ownership or concurrent-state uncertainty.

## Design

The read-only job acquires the latest common prior UTC day using the existing fixed
Terra-priority/Aqua-gap-fill recipe at 2048 by 1024 pixels. Validation independently
checks source URLs, capabilities dates, sizes, hashes, grid, masks, coverage and
rederived pixels. The date must be before today, at most three days old, and no older
than the accepted asset. Zero valid pixels is rejected; partial coverage remains
explicit and is not a global completeness claim.

The semantic identity includes the recipe, date, output and five source input hashes.
Retrieval timestamps and capabilities chatter alone do not make a new proposal.
Same-date source corrections do. A fixed `earth-weather-daily.png` slot replaces only
the inventoried previous weather image. The inventory's Earth/weather record and
generated browser module change together; other records remain identical.

The narrowly admitted `automated_refresh` field records recipe, validation time,
source manifest digest and semantic identity. `reviewed_at` is null: machine
validation does not invent human review. Existing manually reviewed references
retain their original validation requirements.

An optional publication job downloads only this run's artifact, revalidates the
manifest digest and base, stages the exact changes, creates one local commit and
uses the fixed `automation/daily-orrery` branch. It proves the committed diff, GitHub
bot/PR ownership and current base/head before a lease-protected push, then reads
back the resulting draft PR. A merged previous cycle permits a new proposal; a
closed unmerged PR, unknown branch, changed ownership or non-draft PR holds.
Uncertain writes are inspected once, not blindly retried. There is no merge operation.

The existing EOP prediction-horizon check runs daily as a separate prerequisite.
New IERS numerical-table ingestion requires a separate source/edition validation
increment. Lunar coefficients and other static scientific products are unchanged.

## UX and accessibility

The Source-qualified disclosure continues to show the selected observation date,
attribution and limitations. The default Illustrative appearance is unchanged.
There are no new controls or accessibility interactions. The PR states that imagery
is dated, includes surface and clouds, and does not establish live weather authority.

## Security and privacy

Remote image/XML/JSON data is untrusted. It cannot choose code, paths, repository,
branch, shell commands or permissions. Acquisition has read-only repository access;
publication checks out the exact trusted workflow commit, does not persist checkout
credentials, and receives only contents/PR write permission. The GitHub token is
injected at runtime. No PAT, App key or new dependency is introduced. The opt-in
repository variable is necessary before the publisher can run.

## Alternatives

Direct writes to master remove review and are rejected. One branch per date creates
unbounded open PRs. Runtime browser retrieval changes privacy, CORS and reproducibility
boundaries. A GitHub App can improve unattended CI behavior but requires separately
configured credentials and ownership policy; the first version uses GITHUB_TOKEN.

## Risks

NASA may delay or revise composites; invalid acquisition holds the last accepted
data. GitHub cron timing is best-effort. Built-in-token PR checks may require manual
approval. An image change adds roughly 5 MB to Git history even though the working
tree has one active slot; a year of daily merges can add approximately 1.8 GB before
Git compression. This version does not rewrite history or externalize assets.
Original artifacts have finite retention, so preserve them externally when a
long-term replay record is required. Provenance hashes remain in the committed data.

## Acceptance criteria

- Corrupt source, invalid mask/date/grid, traversal, symlink and mismatched output
  candidates fail offline validation; unchanged candidates do not mutate files.
- A same-date source revision proposes a change, while retrieval-only churn does not.
- Actual committed changes are restricted to Earth/weather, its raster and generated
  module. Ownership, base/head races and uncertain writes hold without another write.
- The workflow keeps acquisition read-only and publication opt-in. Data PRs remain
  drafts until reviewed; this implementation cannot merge or deploy them.

## Validation

Run the Orrery Python suites, full Python/provider regression tests, existing web
tests, visual inventory validation, SDLC/document checks and Python coverage.
Replay the captured NASA candidate into a disposable copy and confirm the second
pass is a no-op. Hosted Actions, real bot ownership and PR creation require a later
controlled activation; local synthetic transports do not prove those results.

## Rollout and rollback

Review this separate implementation first. After merge, observe a read-only daily
or manual run and inspect retained evidence. Then the owner may enable
`ORRERY_REFRESH_PUBLISH_ENABLED=true` and approve the first draft PR's checks.
Unset or set the variable to false to stop publication. Disable the workflow to
stop acquisition. Revert a data PR to restore its raster, inventory and module
together; keep the publisher disabled until the intended accepted date is reconciled.

## Documentation

The operator commands and credential/CI limitations are in
[Daily Orrery refresh](../ORRERY_REFRESH.md). Requirements and operations link the
new behavior. This RFC remains Draft until the separate implementation is reviewed.
