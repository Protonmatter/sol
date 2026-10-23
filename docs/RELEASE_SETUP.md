# Release setup and qualification handoff

Status: pending qualification and maintainer acceptance. This document does not
authorize publication or assert that the public site matches the candidate.

## Candidate inspected on 2026-09-17

| Identity | Value |
|---|---|
| Repository | `Protonmatter/sol` |
| Candidate source | `9b262f1cf9b95b337de29f2a9208393780b6429f` |
| CI run / attempt | `35172957778` / `1` |
| Candidate artifact | `10476759922` |
| Manifest SHA256 | `88314b2d0174a26e3df3bbd7fab91e0378b87be7b6a1d0f3bfa8ade8c15e83b3` |
| Last successful deployment source recorded by GitHub | `d74f01deda75f9714f74d7297e7a73e4c71e6497` |
| Failed Pages run | `35173743203` |
| Additional live reference run (passed) | `35281505640` |

All 16 jobs in the candidate's CI attempt succeeded. The downloaded static artifact
passed `validate_release_manifest.py` with the exact source, repository, run, attempt
and expected digest above. This checks every inventoried file without rebuilding.
The source comparison with the last deployment contains 688 changed files across
data, delivery, documentation, science, UI and unknown classifications. The 188
unknown-classified paths still require explicit review; the classifier's label is
not itself a defect or proof of safety.

The live reference run passed the existing four-site RA/Dec, alt/az and DUT1
matrix. Moon syzygy stress recorded 1.4 arcseconds worst pointing error and 1.2
arcseconds worst altitude error against the existing 10-arcsecond limits. These
native-CLI results do not qualify every scientific case or browser WASM. That run
used the pre-existing hosted workflow; the evidence-upload changes in this repair
have only local validation until they are committed and run on GitHub.

The repository variable `SOL_TRUSTED_VERIFIER_SHA` was absent. Pages uses Actions,
and the `github-pages` environment allows master. The environment had no required
reviewer and allowed administrator bypass. These are observations, not settings
acceptance. No settings were changed.

## Files prepared for review

- [Release profiles](release-profiles.json) contains the exact mandatory job map,
  candidate manifest, fingerprints, schemas and source-diff digest. It proposes
  the full experience milestone, without inventing a narrow corrective scope.
- [Accepted qualification](accepted-qualification.json) is an empty array because
  no maintainer-accepted records were available. Do not copy test fixtures here.
- `policy_accepted` and `settings_verified` remain false. The name
  `approved_candidates` is prescribed by the schema; entries in an unaccepted
  policy are proposals, not approvals.

Do not set the verifier variable to this uncommitted checkout or merely toggle the
two booleans. A configured SHA must identify a reviewed commit containing the
verifier, policy, accepted records and their actual hash-bound evidence files.
Preparation and source changes do not create that commit or grant publication.

## Complete the evidence before enabling promotion

1. Re-observe master, the CI attempt, jobs and artifact expiry. Retain the downloaded
   candidate and release evidence. If master changes, use its new successful push
   candidate and update all identities; never reuse this manifest for new bytes.
2. Review the source diff and every unknown-classified path. Use
   `tools/release_changes.py --base-sha BASE_SHA --source-sha SOURCE_SHA` and retain
   its canonical digest. Record the actual reviewer and acceptance identifier in
   `change_review.unknown_review` with its complete sorted path list.
3. Complete the AC-01 through AC-35 and F01 through F22 matrix in the
   [test matrix](plans/2026-09-11-correctness-and-experience/test-matrix.md).
   The draft retains the conservative all-cases/all-kinds rule until a reviewed
   `qualification_scope` assigns each case its appropriate manual/scientific scope.
   Its union must still cover all 57 cases. Do not accept automated CI as manual
   or independent scientific evidence.
4. Run the documented native/reference checks and retain results, failure logs,
   reference/query identities, actual acquisition dates, quantities and epoch bounds.
   The scientific workflow now uploads source/run/attempt/binary-bound evidence
   even when a check fails; its results still require scope and acceptance review.
   A native CLI run does not qualify the browser WASM or all historical epochs.
   Scientific references must be no more than 30 days old and retain at least a
   90-day EOP margin at promotion time.
5. Complete the manual accessibility, keyboard, zoom, touch, reduced-motion and
   controlled performance tasks on the declared platforms. Complete the
   [formative study](plans/2026-09-11-correctness-and-experience/design-review.md)
   with three first-time and two research-oriented participants. Record actual
   failures and incomplete tasks. A browser smoke check is not this study.
6. Verify branch/environment rules, the intended approval procedure, retention and
   compatibility with the recorded platform scope. The retained candidate declares
   `chromium-linux-ci`; do not relabel Windows or mobile evidence to match it.
   Resolve the intended platform declaration before approving multi-platform scope.
7. Prepare a compatible corrected rollback candidate and execute the required
   bounded recovery drill in a suitable test environment. Final production served
   verification remains a separate post-deployment result.
8. Add only actual qualification records with evidence hashes and explicit review
   identity. Populate `accepted_evidence` using `release_policy.record_digest` of
   each complete accepted record; preserve adverse results and audit history.
   Set acceptance flags only after the corresponding review is complete.

## Verify and configure the reviewed revision

Use Python 3.11+, Git and authenticated GitHub CLI. No new credentials are created
by these steps. Use task-local directories for downloaded artifacts and metadata.

```powershell
gh run download 35172957778 -R Protonmatter/sol -n web-candidate-35172957778-1 -D retained/site
gh run download 35172957778 -R Protonmatter/sol -n release-evidence-35172957778-1 -D retained/evidence
python tools/validate_release_manifest.py retained/site/web-release-manifest.json --expected-sha256 88314b2d0174a26e3df3bbd7fab91e0378b87be7b6a1d0f3bfa8ade8c15e83b3 --source-sha 9b262f1cf9b95b337de29f2a9208393780b6429f --repository Protonmatter/sol --run-id 35172957778 --run-attempt 1
```

Resolve authoritative run, artifact, exact-attempt jobs and current master using
the same GET endpoints in `.github/workflows/deploy-pages.yml`. Evaluate the full
`release_policy.py --promotion` invocation there, including `--require-rich-evidence`
and the exact staged manifest. A nonzero result is a hold, not permission to remove
the failed predicate. Missing current-master observation reports
`master-identity-missing`; only an observed different SHA reports supersession.

After separately authorized commit/push and acceptance, set the **repository**
variable `SOL_TRUSTED_VERIFIER_SHA` to that reviewed 40-character commit SHA.
An environment-only variable cannot supply the preceding verification job.
Re-run the failed Pages workflow while its approved candidate is still current
master. Do not dispatch a diagnostic CI run to replace the original push identity.
Verify served manifest and critical bytes, then test returning-client recovery.

If setup is wrong, withhold promotion and correct the reviewed policy. Revert the
repository variable to its previously reviewed value, or remove it if previously
unset, only under administrator authorization. Never bypass qualification, rebuild
an arbitrary ref for deployment, or clear users' caches to hide identity failures.

## Daily feed publication remains a separate gate

Daily ingest's successful result means acquisition and validation, not publication.
Its Actions summary now says so explicitly. The existing owned rolling-PR adapter
is described in [Transactional feed](TRANSACTIONAL_FEED.md). Before activation:

- Select an exact approved bot identity and repository-scoped credential without
  printing or committing the credential. Confirm the protected publication
  environment and how its PR triggers required checks.
- Generate on current master, stage only the selected bundle's declared files and
  pointer, and create its single-parent candidate commit under explicit authority.
- Use the existing `delivery_lifecycle.py --execute` path only in that approved
  context. Preserve its attempt record; re-observe uncertain outcomes before retry.
- Review and merge the resulting PR, run current-master CI, then apply the same
  release qualification and served-bundle checks. No direct master push or
  automatic merge is introduced by this setup.

No bot credential or protected feed environment was supplied or configured in this
repair. Consequently recurring publication remains pending, not silently enabled.
