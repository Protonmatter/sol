# Delivery, developer experience, privacy and operational design

## Same-candidate CI/CD

Keep `CI` as the orchestrator. Coverage and Docs may retain human-readable entry workflows, but their substantive jobs must be called inside this candidate's dependency graph. Do not decide eligibility by looking for unrelated green runs with the same branch name.

| Proposed job ID / display name | Required inputs and result |
|---|---|
| `candidate` / Candidate identity | Exact checkout SHA, repository, event, PR head/base or actual master SHA, lockfile hashes, policy revision; reject expected-SHA mismatch |
| `governance` / Governance and specification contracts | SDLC, docs, UX structure, release-policy and workflow dependency tests |
| `rust` / Rust tests, lint and coverage | Workspace tests, rustfmt, Clippy, Rust >=90% lines; no warning or exclusion shortcuts |
| `python` / Python contracts and coverage | Contract/provider/ingest/build/publication suites, explicit runtime denominator >=90% lines |
| `node` / Web unit and Node coverage | Existing/new tests, >=90% lines/branches/functions; denominator-complete raw coverage |
| `artifact` / Build immutable web artifact | Locked WASM builds, generated-data validation, one staged site and complete asset manifest |
| `browser` / Staged browser and visual validation | Download this run's artifact, validate manifest, execute responsive/functional/privacy/cache/visual scenarios against it |
| `web-coverage` / Complete web coverage | Merge Node/browser execution using source identity mapping, include all hand-written runtime including workers/service worker, >=90% lines |
| `determinism` + `determinism-compare` / Engine determinism | Linux/macOS/Windows reference simulation byte comparison plus canonical generated-asset checks |
| `release-gate` / Release gate | `always()` evaluation; every mandatory dependency exactly `success`, consistent evidence and artifact identity |

The required check becomes **CI / Release gate** after it exists and owner-managed settings are verified. Add it before removing any older required check. Keep checks running for data-only and docs-only PRs; no path-filter omission that leaves status pending or falsely green. A skipped/cancelled/missing job is not success. Workflow permission changes and validator allowlists are reviewed together.

```text
PR head + base -> tested merge-preview candidate -> protected review/merge
                                                   |
                                       actual resulting master SHA
                                                   v
      governance + Rust + Python + Node + determinism + artifact build
                                                   |
                                    staged browser + complete coverage
                                                   |
                                         CI / Release gate
                                                   |
                     trusted run/artifact lookup -> eligibility -> Pages
                                                   |
                                    served manifest/hash verification
```

Test PR preview identity and actual master identity separately; a squash/merge SHA is not its PR head. The CI aggregate reports `candidate_verified=true` for a passing PR preview, but that does not make a PR artifact deployable. Normal deployment requires a successful trusted CI run at current master **and** the applicable qualification profile below. If master advances before promotion, mark the older normal candidate superseded. Serialize production promotion; do not cancel a deployment midway to start a newer one. Re-check eligibility at promotion start. A separately authorized rollback may intentionally select an older qualified release.

GitHub documents approval-required PR runs for token-created/updated PRs and suppressed ordinary triggers for token-authenticated pushes. Dispatch validation does not replace the required PR approval/check association. Initial policy is maintainer approval and human merge, followed by full CI at actual master. [GitHub workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

## Qualification profiles and promotion policy

`candidate_verified` is the automated CI verdict. `promotion_eligible` is a separate result from the same tested `release_policy.py`, evaluated by trusted promotion code after required qualification is available. A successful aggregate alone does not authorize production. Pending manual work does not hold a CI runner open; it leaves promotion in `awaiting-qualification`.

Define a protected, reviewed policy file `docs/release-profiles.json` (planned) with two profiles:

- `corrective`: all existing mandatory automated gates, every changed requirement/finding regression and affected consumer flow, targeted scientific/privacy/manual evidence appropriate to the changed surface, coherent upgrade and recovery evidence. Unchanged open findings remain disclosed. This permits an independently verified P1 correction before the full redesign.
- `experience-milestone`: the complete AC-01–AC-35 and F01–F22 acceptance set, full manual task/accessibility/performance qualification and scientific evidence policy. The incomplete corrective packet cannot qualify this profile.

Profile selection is a maintainer-reviewed release decision recorded before promotion. A change classifier compares actual source/configuration/asset diffs with the approved policy and conservatively invalidates affected qualification. Unknown change categories require review; a candidate cannot self-select a weaker profile to omit tests.

Add `qualification-evidence.v1` with record ID/digest, profile, requirement/task IDs, `pass|fail|pending` verdict per case, evidence paths/digests, reviewed-by identity and acceptance evidence, qualification date, applicable browser/device/configuration, relevant UI/scientific algorithm/schema/coefficient hashes, reference source/query/acquisition identity and freshness/reuse policy. Preserve the originally tested source/artifact identity for audit, but compute applicability from explicit component fingerprints that exclude the qualification record itself.

Promotion accepts only qualification records from the maintainer-reviewed protected evidence index and verifies their acceptance provenance; it does not trust a PR artifact's self-asserted approval. Reject missing, pending, failed, mismatched, expired or out-of-scope required evidence. UI behavior/CSS/input/worker changes invalidate affected manual tasks; scientific algorithm/coefficient/schema/method changes invalidate affected accuracy evidence. Pure documentation or validated source-data refresh can reuse unaffected qualification only when fingerprints, browser/device scope, quantity/epoch coverage and freshness rules still apply. Every data refresh still runs its own automated contract/deterministic/served checks.

The scientific 30-day policy for changed quantities and the EOP 90-day margin are executable predicates. Manual qualification stays applicable only while its accepted component/configuration fingerprints and test-platform scope match; a changed supported platform set requires new affected qualification. Keep no blanket claim that an old manual result qualifies a newly changed UI.

Required policy regressions: all jobs green but manual missing/failed; numerical reference expired/different algorithm; unrelated task evidence; wrong artifact/fingerprint; corrective packet accepted for its approved scope but rejected for final milestone; unchanged applicable qualification reused for a data-only candidate. After promotion, served verification is a distinct state. Only a served-verified, qualified, compatible artifact becomes a normal rollback candidate.

## Tested artifact and manifest contract

Add a pure `tools/release_policy.py` with immutable input records and explicit candidate-verification and promotion-eligibility results, including stable rejection/pending reason codes. Proposed record `release-evidence.v1` includes repository, source SHA, event, PR identities, run ID/attempt, approved profile/policy digest, toolchains/lock digests, job outcomes, artifact ID/SHA256, actual WASM hashes, schemas/ABI versions, data bundle ID, coverage denominator/results, qualification record IDs/digests and applicability verdicts, reference evidence scope/freshness, diagnostics and limitations. Unknown versions fail closed.

Build WASM before staging. `tools/build_web.py` becomes an output-directory build rather than mutating source files. Planned command interface after P09:

```text
python tools/build_wasm.py --out-dir build/wasm --locked
python tools/build_web.py --wasm-dir build/wasm --out-dir build/site --release-id ci-SHA-RUN-ATTEMPT
python tools/validate_release_manifest.py build/site/web-release-manifest.json
node tools/browser_validation.mjs --web-root=build/site --output-dir=coverage/browser
```

These flags do **not** exist at the baseline. P09 implements/tests them before workflows use them. In actual workflow inputs, `SHA`, `RUN`, and `ATTEMPT` are the resolved candidate fields, not user-supplied shell fragments. Release identity is fixed before token/URL stamping, so asset hashing is acyclic.

`web-release-manifest.v1` declares release ID, source SHA, schema/ABI support, data-bundle ID, base path, and each asset's relative path, size, SHA256 and critical/optional role. Build/stamp first, then hash final bytes. Exclude the manifest's own outer digest field; an outer release-evidence record hashes the manifest. Do not hash unstamped JS and claim it identifies the deployed output. Stage root bootstrap plus an immutable release namespace; the artifact retains the current and one preceding compatible namespace when needed for transition. Record previous artifact as an input, not a mutable internet download.

The browser validator consumes the staged bytes, not `apps/web`. Normalize stamped/namespace URLs back to original source paths for coverage and include all hand-written workers. Store a mapping in build evidence. Pages downloads the exact qualified artifact by run/artifact ID and digest; it performs no rebuild, regeneration, restamping or remote texture fetch.

Trust checks include repository, workflow identity, permitted event, run attempt, exact SHA, artifact identity and digest. A privileged deployment workflow never runs scripts taken from an untrusted PR artifact. The trusted deploy code verifies and uploads the static payload with least privilege. Local digest validation protects consistency, not a claim of cryptographic authenticity independent of the trusted workflow.

Manual recovery selects a previously qualified artifact/run and uses the same policy; remove the ref-to-build bypass. Retain release evidence and candidate artifacts for 90 days where the GitHub plan permits; keep a recoverable last-known-good artifact outside automatic expiry under maintainer-controlled release retention before promoting a replacement. A configured retention limit below this target must be disclosed and compensated with an authorized archival process, not assumed away.

## Cache upgrade transaction

Immediate F02 fix: process WASM/package requests before generic tokened cache-first routing and test engine-only A-to-B upgrade. Durable installation:

```text
active A -> discover B -> fetch B manifest -> stage/hash critical B assets
                               |                         |
                               +-- failure -> keep A ----+
                                                         v
                                              B complete and verified
                                                         |
                                 next navigation / explicit reload to B
```

Do not unconditionally claim old clients or delete their release caches while they execute. Each client stays bound to a release namespace and matching schemas/ABIs. Retain current plus one previous complete release; an older unsupported tab gets an explicit reload requirement and never substitutes new bytes into old imports. Optional image failure cannot invalidate core installation. Unknown manifest or incompatible schema/ABI fails closed. Legacy `sol-*` caches are retired only after a compatible complete replacement and safe client transition.

Normal network requests to versioned asset paths must not be treated as immutable solely because a query token exists. Validate critical response hashes before admission. Offline fallback retains its own release/data/source timestamps, even after a failed update check. A build check time is never observation time.

## Immutable public-data bundle and publication

Create `public-data-cache-manifest.v2` for one acquisition attempt. It records source/product ID, payload hash, observation time, retrieval time, current-fetch/cached-fallback/fixture origin, quality, failure and source licensing metadata. Use unique staging directories and one closed input manifest for derivation. Failed fetches may explicitly select an older attributable payload but must preserve its original timestamps and degraded state.

Validate normalized observations, snapshot, source manifest and feed status as one bundle. Select it by atomic replacement of a small pointer only after complete validation. A crash before replacement leaves the old pointer unchanged; after replacement every referenced file must already exist. Retain failed-attempt logs separately, without exposing raw personal data or credentials. Use fsync/atomic rename where supported and document filesystem guarantees; test replacement on Windows and POSIX, including locked-file failure.

The pointer is `bundle-pointer.v1` with `bundle_id`, immutable relative `manifest_path` and `manifest_sha256`. A source pointer selects a `public-data-cache-manifest.v2`; a derived-data pointer selects `research-data-bundle.v1`, which records its source-bundle ID and the snapshot, observations, feed status and series manifest component paths, sizes, SHA256 and schema versions. Relative paths must stay within the selected bundle root; absolute paths, traversal and symlink escapes are rejected. Manifest fields distinguish source acquisition from derived model generation.

**Reader transaction:** CLI derivation, build staging and browser loading each resolve a pointer/manifest once per operation or view revision, retain that immutable bundle ID, load only its declared components and validate all identities before publication. They never reread the mutable pointer between components. `build_web.py` records the chosen derived bundle in `web-release-manifest.v1`; browser `data.js` uses that release-bound entry for snapshot/status/observations/series. Fixed `latest-state.json`/`feed-status.json` names may exist as materialized files inside the immutable release namespace, but root-level mutable aliases are not current-reader authority. Explicit historical CLI file input remains supported and labeled historical.

Migrate existing loader/build readers together with the pointer writer; a successfully switched but unused pointer is not a completed migration. Add a barrier test that pauses a reader after the first component, switches A to B, then resumes: it must return complete A or complete B, never a mixture. Also test component hash/bundle mismatch, partial fetch, old fixed-path usage and rollback while an earlier reader remains pinned. Publish one complete store revision after all required components pass; optional unavailable entries retain explicit status within that same revision.

Migrate existing cache v1 by read-only inventory, hash/semantic verification and explicit unknown metadata. Preserve the original v1 manifest. Do not infer missing observation times from modification times. Select a v2 bundle only after validation; rollback selects the previous complete bundle. Do not garbage-collect during initial migration.

One rolling automation branch is proposed: `automation/daily-research-feed`. Before first use, resolve whether it already exists and who owns it; if unrelated, stop for a different explicit name. Reconcile the same PR, refresh base and regenerate against current code, stage only the documented data allowlist, and use optimistic expected-head checks. No protected-master direct push fallback. No existing PR closure/branch deletion as a side effect.

```text
generated -> validated -> pr-open -> awaiting-approval -> checks-running
                                        |                    |
                                        +-> blocked <--------+
                                                   -> merged
                                                   -> master-validated
                                                   -> deployed
                                                   -> served-verified
```

Each transition records source bundle, PR/head/master identities, relevant run/deployment IDs and observation timestamps. No-op is distinct from success with changed data. PR creation, CI dispatch and auto-merge enablement are not publication. If merge races a refresh, stop/re-read state; never overwrite the merged candidate with a stale automation update.

A read-only scheduled publication check reports blocked refresh age, source age and deployed bundle independently of fetch success. It stays quiet on unchanged healthy state and produces an actionable failure/approval item on meaningful change. Implementing such repository automation requires execution authorization; this plan does not create a Codex automation or background service.

## Provider, worker and input hardening

Preserve the configured, consent-bound optional endpoint. Validate calendar/range/body list before network work. Use bounded upstream response size, per-call timeout and one overall request deadline. Proposed initial server policy: at most four active upstream requests, at most eight queued requests, 20-second total deadline, bounded retry for idempotent transient reads only, and request coalescing keyed by validated observer/time/body/contract. Return explicit overload/deadline status; qualify these limits in tests without live load generation.

Do not cache consent or precise location in logs. Redact request details in diagnostics; use request IDs and categorized failures. After shared/coalesced work completes, each caller validates and receives its own immutable result. One caller cancellation must not cancel another active subscriber's result. Tests use in-process mocked upstream responses, not public-endpoint stress.

Worker limits and rejection rules are specified in AC-23. At least one dimension limit and the aggregate cell-step limit are tested exactly below/at/above the bound. Native wrappers return typed errors; do not silently clamp scientific input to fit capacity. Provide explicit capability metadata so the UI explains supported work before submission.

## Crate publication boundary

Pages eligibility does not authorize crates.io publication. A scheduled job may detect an unpublished version but must not automatically publish an arbitrary version change. Registry 404 means absent; authentication, throttling and server errors mean failed lookup, not absent.

An authorized crate release uses exact reviewed SHA, tests/coverage/contract evidence, `cargo package --list -p solar-ephemeris --locked` and `cargo publish --dry-run -p solar-ephemeris --locked`, retained package digest/contents/notices and source-to-package correspondence. Actual publish remains irreversible and separately authorized. Do not invent a Cargo command that publishes a prebuilt `.crate`; the standard publish command repackages from source, so verify its resulting registry checksum and package contents against the expected source package.

## Rollback and incident runbook requirements

1. Identify failing release/bundle and stop pending normal promotion without changing scientific data.
2. Select the preceding **corrected, compatible, qualified** artifact; verify retained evidence/digest and schema/data pairing.
3. Obtain authority for production rollback; promote through the same policy's explicit rollback path.
4. Re-fetch served release manifest and critical asset hashes, then test returning/offline clients and all three destination summaries.
5. Record visible older source age; rollback does not make data current.
6. Preserve failed artifacts/logs and create a local regression before another candidate. No automatic cache wipe or source-history rewrite.

If no compatible corrected rollback artifact exists, retain the honest unavailable state and prepare a forward correction. Never revert to the known false-confidence/projection/privacy behavior merely to restore a previous visual layout.

## Developer workflow

Each slice starts with a clean scoped checkout, records its source baseline, writes the lowest useful failing test, implements the minimum fix, runs targeted tests then full affected gates, updates requirements/docs, and requests review with evidence. Commit/push/PR/merge steps occur only within the subsequently authorized execution workflow. Build into task-local output paths; do not overwrite committed fixtures as an exploratory check.

The PR packet states requirement/AC/finding IDs, changed contracts, positive/negative assertions, scientific/privacy implications, local versus hosted results, coverage denominator, diagnostics, deployment eligibility and rollback. Unrelated cosmetic churn and mass dependency updates are excluded.
