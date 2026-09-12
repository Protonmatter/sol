# Transactional research feed

Status: implemented locally; live acquisition, GitHub write permissions, protected
environment behavior, PR delivery, merge, deployment, and served verification are
not qualified by the offline tests. No production activation is implied.

## Data contract and publication boundary

`public-data-cache-manifest.v2` identifies one immutable acquisition. Each product
records exact bytes/SHA-256, original source, current-fetch/cached-fallback/fixture
origin, observation time, retrieval time, quality, failure, and license description.
Unknown times are JSON null. The acquisition clock is separate; it must never stand
in for observation or previous retrieval time. Optional missing products have failure
records, not invented payloads. A failed critical fetch can reuse only a previously
validated attributable product; it cannot borrow an arbitrary file with a matching name.
Reusing a fixture after a failed refresh keeps its `fixture` origin, original clocks,
and bytes; the new acquisition records the failure/degradation separately. Reuse cannot
promote fixture data to observed cached data.

Native source-pointer intake and Python daily derivation carry the validated product
source into row selection and normalized-frame provenance.
When an F10.7 row omits `source`, the manifest attribution is used without changing
the original row or raw payload. A valid row source takes precedence; an explicit
blank, unknown, null or non-string row source remains rejected. Legacy cache/payload
inputs without manifest attribution cannot invent a source or activity analysis.
Python bundle derivation excludes unattributable rows from numeric signals and activity
proxy counts, not only from snapshot evidence. Numeric context and its evidence frame
select the same newest eligible numeric row; signal freshness follows that selected
row rather than a newer nonnumeric record. Invalid-only inputs retain raw report/source
metadata but cannot supply a numeric signal or activity proxy.

`research-data-bundle.v1` binds its source manifest digest and all snapshot,
normalized-observation, feed-status, series-manifest, and available-series-frame
components. Explicit unavailable series slots retain their original index/time and
reason. Available frames select exact canonical roles (`series_frame:0`,
`series_frame:1`, and so on); extra aliases such as `series_frame:00` are orphan
components, not alternative spellings. Gap entries must not carry frame payloads.
Every declared component is read, sized, hashed, parsed, and validated before
the result is returned. A missing/corrupt declared frame rejects the candidate; it is
not silently removed from the timeline. Images and planetary catalogs remain separate
release assets, not physical observations of the solar simulation.

Before admission, all three derived-bundle readers (Python, browser and native CLI)
reconcile the snapshot with the separate normalized observation report. The snapshot
must embed exactly one complete report envelope with the same ordered attributable
frames, and its top-level `observed_context` must equal the report context (an absent
or null report context maps to an explicit empty object). Unattributable frames remain
unchanged in the full report but are excluded from the embedded frame projection.
The current daily producer already emits this envelope; standalone native simulation
and historical snapshot interfaces are not changed by this derived-bundle rule.

Attribution requires a string with nonempty trimmed content other than case-insensitive
`unknown`. Producer and readers use an explicit shared whitespace set:
U+0009--U+000D, U+001C--U+0020, U+0085, U+00A0, U+1680, U+2000--U+200A,
U+2028, U+2029, U+202F, U+205F and U+3000. U+FEFF is not whitespace in this rule.
Comparison ignores object member ordering, preserves array ordering and distinguishes
booleans from numbers. Compared numeric values outside +/-9007199254740991 are
rejected even when identical: native/browser binary64 parsing cannot reliably distinguish
oversized integer counters. This is bounded semantic admission, not arbitrary-precision
JSON support. Original bytes are retained; readers never rewrite, coerce or repair a
candidate to satisfy coherence. A hash-valid but inconsistent candidate fails before
pointer selection, browser publication or CLI output replacement.

Both roots select one immutable manifest through `bundle-pointer.v1` at `current.json`:

```text
source root/current.json -> bundles/SOURCE/manifest.json -> payloads/*
derived root/current.json -> bundles/RESEARCH/manifest.json -> snapshot + observations
                                                       + status + series + source manifest
```

Readers resolve the pointer once and retain captured bytes, even if another writer
selects a different bundle midway. Python derivation, native CLI intake, and the web
builder use that boundary. A built browser reads only its immutable release manifest's
`data_bundle` descriptor and critical asset inventory; it never consults a mutable
data alias. `data.loadState()` publishes snapshot, feed status, series, and frozen
`dataBundleIdentity {bundle_id, source_bundle_id, manifest_sha256}` together. Failed
loads retain the entire previous validated publication and show a retryable error.
Successful replacement returns to the new bundle's latest context, clears prior cycle,
gap, region and live-run intent, stops playback and invalidates pending worker results.
Failed loads do not cancel or reset the previous view's work.
An on-device simulation is independent of bundle loading: it retains an unresolved
bundle error and Retry control, including after Latest restores the retained feed.
Only successful bundle publication clears that error.

Closed schemas live in `docs/*bundle*.schema.json` and
`docs/daily-ingest-status-v2.schema.json`; embedded browser schema equality is tested.
The minimal evaluator supports type/nullable type, const, enum, properties, required,
additionalProperties, items, min/max items, min/max string length, and numerical
minimum/maximum. Unsupported assertions fail closed. Rust additionally supports the
solar schema's local references and exclusive numerical bounds. Metadata paths are
ASCII relative paths without empty/dot/traversal components, backslashes, escaping,
queries, or fragments. Each file is capped at 16 MiB and schema array counts are bounded.
UTC timestamps require a full calendar date/time with seconds and Z or +00:00;
invalid dates are rejected, not normalized. Hashes establish byte correspondence,
not source authenticity or empirical calibration.

## Local commands and migration

Preconditions: Python 3.11+, existing workspace dependencies only, writable task-local
source/output directories, and sufficient disk space for retained bundles. Reading or
rolling back a validated local bundle requires no network or elevated permissions.

```powershell
# Resolve existing immutable source once; never fetch or overwrite legacy aliases.
python tools/run_daily_ingest.py --skip-fetch --cache C:/task/source-cache --web-data C:/task/research-data

# Fresh-checkout offline example using the complete committed fixture source bundle.
python tools/run_daily_ingest.py --skip-fetch --cache tests/fixtures/feed-source --web-data C:/task/research-data

# Explicit v1 inventory, without modifying its original manifest/payload files.
# Source selection and derived output are new v2/v1 bundle artifacts.
python tools/run_daily_ingest.py --skip-fetch --migrate-v1 --cache C:/task/legacy-cache --web-data C:/task/research-data

# Read every derived component before writing native replay output.
cargo run -p solar-cli -- replay --bundle-pointer C:/task/research-data/current.json --out C:/task/replay
cargo run -p solar-cli -- simulate --bundle-pointer C:/task/research-data/current.json --steps 24 --out C:/task/snapshot.json

# Native source intake needs an explicit evaluation epoch (Unix UTC seconds).
cargo run -p solar-cli -- ingest swpc --source-pointer C:/task/source-cache/current.json --as-of-unix-seconds 1789128000 --out C:/task/observations.json

# Standalone fixture output is not a live publication transaction.
python tools/generate_fixture_snapshot.py --source-pointer C:/task/source-cache/current.json --evaluated-at-utc 2026-09-11T12:00:00Z --out C:/task/fixture.json --observations-out C:/task/observations.json

# Record a candidate-only lifecycle hold; output path must not already exist.
python tools/delivery_lifecycle.py --pointer C:/task/research-data/current.json --out C:/task/evidence/candidate.json
```

Live acquisition remains a separately authorized action using the existing endpoint
allowlist: `python tools/run_daily_ingest.py --cache C:/task/source-cache --web-data
C:/task/research-data --fail-on-degraded`. This command is documented, not executed
as part of local qualification. `--fail-on-degraded` withholds a new derived pointer
when any source is degraded. The source acquisition attempt may still be retained.

The source deliverable includes `apps/web/data/current.json`, the complete selected
`apps/web/data/bundles/research-fixture-20260911/`, and the complete offline source
selection at `tests/fixtures/feed-source/current.json` with its manifest and payloads.
The derived embedded source manifest matches that source bundle byte-for-byte. The
repository's initial bundle uses only the two committed SWPC fixture payloads. Its
source observation/retrieval times are null. The import and
generation time is separately recorded; neither makes these historical fixtures current.
Existing `latest-state.json`, `latest-observations.json`, `feed-status.json` and root
`series/` are explicitly historical/migration inputs, not the selected live authority.

Exit codes: daily ingest 0 validated/selected, 1 failed, withheld, or committed-uncertain; native CLI 0 success,
2 invalid input/read/validation/output failure; lifecycle tool 0 validated hold or
successful delivery observation, 1 blocked delivery, 2 invalid input/I/O failure.
The standalone generator uses argparse's exit 2 for invalid command-line combinations.

## Failure, recovery, and rollback

Writers exclusively create a staging directory, fsync component/manifest bytes,
rename to a new immutable ID, validate again, and replace only `current.json` under
an exclusive local lock and expected-pointer check. ID reuse is rejected. Before
selection, interruption leaves the previous pointer intact; after selection, the new
pointer names a fully written, validated bundle. Attempt records contain error types
and stage/selection status, not raw credential-bearing diagnostics. Staging remnants
and old bundles are deliberately retained. No automatic garbage collection runs.

The pointer replacement is the commit point. If a later directory sync or lock/temp
cleanup fails, attempt evidence records `status: committed-uncertain`, `selected: true`,
the `committed_bundle_id`, manifest digest, source/derived selection kind and failing
`phase`. `durability_uncertain` is true for directory-sync failures. `selected` records
that this attempt performed replacement; `current_selection: not-reobserved` deliberately
does not claim the pointer still names it. The CLI exits 1 without saying the old bundle
was retained. No automatic rollback occurs: resolve and validate the current pointer
before deciding whether to retry, since another writer may have selected a newer bundle.

Atomic rename/replacement relies on the local filesystem. POSIX directory fsync is
performed; Windows directory fsync is unavailable through this stdlib implementation.
Power-loss durability and network filesystems are not claimed. A locked Windows pointer
fails rather than replacing a different path. An abrupt process kill can leave
`.bundle-select.lock`: confirm no writer is running, retain the failed attempt evidence,
validate the selected bundle, and remove only that exact stale lock under operator
authority. Do not delete broad staging/cache directories to recover a failed run.

Rollback uses the same complete-target validator and atomic selection function:

```powershell
$env:PYTHONPATH='tools'
python -c "from pathlib import Path; from data_bundles import resolve_derived_manifest,select_bundle; root=Path('C:/task/research-data'); old=resolve_derived_manifest(root/'bundles/REVIEWED_ID/manifest.json','REVIEWED_ID','REVIEWED_64_HEX_SHA256'); select_bundle(root/'current.json',old)"
```

Use an operator-reviewed retained ID and actual recorded digest. Rollback changes the
local selection only and preserves observation ages. Rebuild a local preview only if
appropriate; production artifact rollback follows `RELEASE_DELIVERY.md` and requires
separate authority. Never mutate an immutable bundle to make a hash check pass.

## Rolling PR adapter: implementation and enablement hold

The default daily workflow has only `contents: read`, does not persist checkout
credentials, and uploads candidate/attempt artifacts. It does not invoke remote
delivery, push master, dispatch CI, open issues, or auto-merge. Candidate artifact
upload/retention does not imply a hosted run has been executed or qualified.

`delivery_lifecycle.py` includes an opt-in GitHub/`gh` transport. Tests inject a mock
runner; no live queries or writes were performed. Future enablement requires a
separately approved protected environment, exact repository and bot identity,
least-privilege credentials for that repository, verified branch rules, a human
approval procedure, and credential-safe logging. The branch is fixed to
`automation/daily-research-feed`. Multiple, closed, merged, unknown-owner, or conflicting
rolling PR/ref states are held for manual reconciliation rather than adopted.

The candidate must be generated again on the **currently observed master SHA**, in a
clean checkout, as exactly one commit directly on that base. Do not merge or rebase an
old generated result and call it fresh. Re-run acquisition/derivation and validators
there, retain the source identity, and list the exact changed paths in candidate JSON:

```json
{"bundle_id":"REVIEWED_ID","source_bundle_id":"REVIEWED_SOURCE_ID","manifest_sha256":"REVIEWED_64_HEX_DIGEST","commit_sha":"CANDIDATE_40_HEX","generation_base_sha":"CURRENT_BASE_40_HEX","expected_head_sha":"OWNED_BRANCH_40_HEX_OR_NULL","changed_paths":["apps/web/data/current.json","apps/web/data/bundles/REVIEWED_ID/manifest.json"],"validated":true}
```

The example paths are abbreviated: include the actual full changed-file list. For a
new absent branch use JSON null, not the placeholder string. Candidate evidence must
live outside the clean checkout. The adapter independently compares HEAD/parent/diff,
validates the selected bundle and all exact file identities, rejects unrelated or
undeclared files, and compares every selected pointer/manifest/component (including
unchanged files) against a regular committed Git blob using unfiltered local bytes.
Absent, symlink/tree/submodule or filter-divergent selected entries are rejected.
It re-observes the exact remote repository/PR/ref/base,
then pushes only that commit to the owned branch using an explicit expected-head lease.
An empty lease is create-only. It creates at most the one rolling PR when absent and
re-fetches afterward. Any changed head/base/owner/state is blocked. No merge action is
implemented. A base change requires regeneration; a lease failure requires re-observation.
Before remote discovery/write, an exclusive fsynced `OUT.started.json` evidence marker
is created and an existing final output is rejected. A crash or failure to write the
final result leaves that uncertain-attempt marker; retain it and re-observe before a
new uniquely named attempt. Do not delete evidence to retry an uncertain operation.

Only after separate activation approval:

```powershell
python tools/delivery_lifecycle.py --execute --repository OWNER/REPOSITORY --owner APPROVED_BOT_LOGIN --checkout C:/task/clean-current-base-candidate --candidate C:/task/evidence/verified-candidate.json --out C:/task/evidence/delivery-attempt-UNIQUE.json
```

Lifecycle states distinguish generated, validated, PR open, awaiting approval, checks
running, blocked, merged, master validated, deployed, served verified, and no-op.
Advancing beyond validation requires bound PR/head/check/approval/merge/deployment/served
evidence for that stage. The offline state helper validates supplied evidence structure;
it does not authenticate evidence or replace the protected release policy. Served
verification must match the merged SHA and bundle. Never label generation success as
published or make failed acquisition disappear behind a successful PR operation.
