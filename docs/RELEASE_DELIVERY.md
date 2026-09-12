# Local candidate delivery and qualification

This implementation stages and validates a static candidate without changing the
web source tree. It does not grant publication authority. A local preview, a CI
candidate, an eligible promotion, and a verified served release are different states.

## Build and inspect a candidate

Run from the repository root with the locked Rust toolchain, installed WASM target,
and the existing pinned JavaScript dependencies. No administrator rights are needed.
Choose a new output directory for each artifact; an existing destination is rejected.

```powershell
$candidateSha = git rev-parse HEAD
python tools/build_wasm.py --locked --out-root build/wasm
python tools/build_web.py --wasm-dir build/wasm --out-root build/site-review --release-id local-review-1 --source-sha $candidateSha --repository OWNER/REPOSITORY --run-id 1 --run-attempt 1 --base-path /sol/
python tools/validate_release_manifest.py build/site-review/web-release-manifest.json --source-sha $candidateSha --repository OWNER/REPOSITORY --run-id 1 --run-attempt 1
node tools/browser_validation.mjs --web-root=build/site-review --output-dir=build/browser-review
```

Replace `OWNER/REPOSITORY` with the exact candidate repository. Local run ID 1 is a
preview label, not hosted evidence. A dirty checkout cannot claim correspondence to
its base commit even when every staged byte hashes correctly. In CI, identities come
from the checkout/run context and are independently resolved before promotion.

The builder discovers the live solar schema from the generated canonical schema
module and the live ephemeris version from its runtime guard. Both WASM outputs must
have the expected header. It stages final token-stamped bytes before computing hashes.
The final root manifest is then hashed by the outer release-evidence record.

`--previous-root PATH` accepts only a validated prior artifact. Its immutable namespace
and namespace manifest are retained without rewriting. Recognized solar v2 or v3 / ephemeris
v2 or v3 namespaces can coexist with ABI version 1; they are not adapted into one
another. Unsupported transitions fail. Retention does not make an old artifact a
qualified production rollback target.

## Manifest and browser interface

The version is `web-release-manifest.v1`. All asset paths are site-root-relative,
without a leading slash, and include `releases/RELEASE_ID/` for immutable files.
`base_path` is an absolute URL path such as `/sol/`. Coverage `source_path` values are
repository-relative, beginning with `apps/web/`; absolute filesystem paths are forbidden.

The root `index.html` redirects to the current immutable index while preserving the
incoming fragment. Sky shares target this stable root, not an expiring release
namespace, and retain the captured observer/time in the fragment rather than sending
it in the HTTP request path. The root's no-script fallback opens the current release
without a Sky fragment; the application itself requires JavaScript. There is exactly one
root `sw.js`; register it using the stamped base path and base scope. The builder
substitutes `__SOL_RELEASE_ID__`, `__SOL_RELEASE_NAMESPACE__`, `__SOL_BASE_PATH__`, and
existing version-query tokens before hashing. Root bootstrap and worker bytes are
critical inventory entries. Code, CSS, data, and both WASM binaries are critical;
textures are optional. A prior namespace is optional in the new manifest.

Identical current manifests appear at root and within the current namespace. Those
two copies are excluded from their own asset inventory to avoid a digest cycle.
Every other file must be listed exactly once, with its final size and SHA256. Duplicate
keys, unsafe paths, case collisions, missing/extra files, symlinks, unsupported manifest
versions, invalid WASM identities, and mismatched copies fail validation.

Browser validation executes the staged root. Coverage verifies the original checkout
source hashes, recreates the declared stamping, and maps measured offsets back to the
original files. All hand-written runtime modules remain in the denominator. Generated
solar and ephemeris schema objects are excluded only alongside canonical-equality tests;
their hand-written guards are included. Node coverage executes those hash-bound source
files and is merged with Chromium coverage at the existing 90 percent floor.

## Qualification and trusted promotion

CI's always-run `Release gate` requires every substantive same-run job, including
reusable Coverage and Docs. Missing, skipped, cancelled, or failed jobs are not success.
The protected `WASM build (wasm32-unknown-unknown)` identity depends on `Build immutable
web artifact`: it rejects an unsuccessful or unidentified producer, downloads the same-
run/attempt candidate, and validates both engine binaries against the exact manifest
digest, repository, source SHA, run ID and attempt. It does not rename the producer,
rebuild different bytes, or change branch protection. It is also a required release-gate
dependency and expanded promotion job identity.
A PR merge preview may be `candidate_verified` but is never a normal deployable artifact.
Dispatch is diagnostic and does not replace PR check association.

Normal Pages promotion downloads the same candidate and evidence. It checks the
repository, source SHA, workflow, event, run ID/attempt, artifact ID, final manifest,
and current master using independently resolved metadata. Static artifact code is
never executed on the privileged promotion runner. The verifier itself must be pinned
by the separately configured `SOL_TRUSTED_VERIFIER_SHA` repository variable.

The pinned verifier checkout must contain reviewed `docs/release-profiles.json` and
`docs/accepted-qualification.json`. They are deliberately not supplied as manufactured
approvals by this change. The latter is an array of qualification records. Their
schemas are [release profiles](release-profiles.schema.json) and
[qualification evidence](qualification-evidence-v1.schema.json). Evidence paths are
relative to that pinned checkout; the promotion path checks actual evidence-file hashes.
The protected index keys are canonical sorted compact JSON SHA256 digests of complete
records and must map to their exact `reviewed_by` and `acceptance_id` values.

Protected policy also requires `required_job_names`, the exact expanded map in the
pinned verifier's `MANDATORY_JOB_NAMES`. It includes all three determinism matrix
members, all three Coverage children, the Docs child, and the other mandatory jobs.
The additive WASM identity requires a coordinated reviewed pinned-verifier and protected
`required_job_names` update before production promotion. An older protected map is not
silently accepted by the new verifier. This source change does not modify protected
settings or authorize that later administrative operation.
Promotion fetches jobs from the exact run-attempt endpoint and rejects absent,
ambiguous, unexpected, non-completed, non-successful, or foreign run/attempt/source
results. Candidate summary must agree with the independently resolved complete map.
The protected map cannot weaken the verifier's mandatory inventory. A changed hosted
job naming convention holds promotion until reviewed; no hosted naming qualification
is implied by local synthetic API fixtures.

Only protected exact-SHA profile selections can authorize `corrective` or
`experience-milestone`. Missing settings evidence or acceptance holds promotion.
The milestone requires AC-01 through AC-35 and F01 through F22. Protected selections
can provide `qualification_scope[kind][case]` with required component keys and platform
scope. Its union must exactly cover the selected cases; a milestone cannot omit cases.
Scientific scopes also declare quantities and inclusive JD bounds, matched against
accepted records' `case_scope`. Manual and scientific kinds need not repeat unrelated
cases. Legacy selections without the map retain the conservative all-cases/all-kinds
rule; they do not silently become less restrictive. Records must match the applicable
component fingerprints and platform scope. Reuse is explicit, fingerprint-bound,
and preserves original source/artifact identity. Scientific reference acquisition must
be at most 30 days old, never future-dated, and retain at least a 90-day EOP margin
at promotion time. Document/data-only reuse cannot bypass these checks.

An accepted applicable fail/pending result vetoes the candidate even when another
accepted packet passed that case. Record order and later reference expiry cannot erase
the adverse result. Unaccepted or out-of-scope historical records do not veto unrelated
candidates. No automatic supersession is implemented: resolving contradictory accepted
evidence requires a separate reviewed policy change while retaining its audit history.
Passing evidence must contain the complete required case scope. An adverse retest only
needs to overlap its quantities, inclusive epoch interval and platforms, while still
matching the relevant fingerprints and accepted artifact/reuse identity. Narrow passing
records cannot replace full-case qualification; narrow overlapping failures cannot be
hidden by unrelated quantities or platforms in a broader passing record.

Deploy is serialized and rechecks full eligibility after environment approval, using
the same pinned verifier/policy/qualification and original artifact/manifest identities.
API job and master state are resolved again, static bytes are revalidated, and reference
age/EOP horizon are evaluated using the current UTC date; no artifact is rebuilt.
Source code
alone cannot prove branch rules, environment approvals, artifact retention limits, or
maintainer acceptance. Missing reviewed configuration remains a hold, not a green claim.

## Exit codes and retained evidence

The Python delivery tools exit 0 for their requested verified operation, and nonzero
for invalid inputs or failed predicates. The policy prints separate boolean states and
stable reason codes. Without `--promotion`, its exit status describes automated candidate
verification; with `--promotion`, eligibility is required. CLI argument errors may exit 2.
The candidate and outer evidence request 90-day hosted retention; plan-enforced limits
must be checked separately. Local `build/` products are disposable, uncommitted artifacts,
not accepted scientific or manual evidence.

## Actual source diff and richer evidence

Use the classifier on existing local Git objects; it makes no fetch or other network call:

```powershell
python tools/release_changes.py --source-root . --base-sha BASE_40_HEX --source-sha HEAD_40_HEX
```

The protected candidate selection stores `change_review.base_sha` and the returned
report digest in `change_review.diff_sha256`. The promotion CLI recomputes the real
Git diff in its trusted checkout; a candidate report cannot supply the classification.
Renames are delete/add, so moving science into docs cannot hide the old category.
Unknown paths need an exact sorted `unknown_review.paths` list, reviewer and acceptance
ID in protected policy. Classification never chooses or downgrades the profile.
Missing commits, unexpected status/path records, or absent protected review fail closed.
The report describes committed source, not uncommitted local preview correspondence.

Manual fingerprints cover final-source UI/HTML/CSS/worker changes. Scientific
fingerprints cover WASM, schema versions and the reviewed browser method/contract/
coefficient modules. Changes to that module inventory require delivery review; adding
new scientific code is not permission to omit it from the fingerprint. CSS-only changes
do not invalidate matching scientific fingerprints. Qualification records are excluded
from these fingerprints, and their own digests remain separately acceptance-bound.

CI captures actual build `rustc`, Cargo and Python versions plus Cargo/npm lock hashes
in `build-provenance.v1`, retained beside the immutable site. The release gate downloads
that same-run provenance and Rust LCOV, Python XML, and merged web JSON reports. Outer
evidence includes report hashes, explicit file denominators and line counts/floors,
with Python class names resolved through the report's configured `tools` and
`services/ephemeris-server` roots to unique existing repository files. Missing, escaping,
symlinked or ambiguous source identities fail closed; a bare basename is not a canonical
Python denominator. Coverage-generated XML comments are accepted, but DTD/entity
declarations are rejected. The actual installed reporter shape is exercised in the
mandatory coverage job, using its existing pinned dependency.
Outer evidence also includes
actual WASM/ABI/data identities, and source-to-stamped-asset mapping. It does not infer
Node branch/function coverage from line totals: the authoritative Node job separately
enforces its unchanged 90/90/90 thresholds. Both promotion checks require this rich
evidence and compare its inventory to the staged manifest. The printed policy decision
adds the protected profile/policy digest, scoped qualification input digests/verdicts,
and reference-age/EOP-margin calculations. CI itself asserts no qualification approval.

## Served verification and explicit rollback eligibility

The following read-only command makes bounded HTTPS requests. Run it only after the
endpoint is explicitly authorized; no live endpoint was called during local validation:

```powershell
python tools/verify_served_release.py build/site-review/web-release-manifest.json --origin https://AUTHORIZED_HOST/sol/
```

It validates local artifact bytes, then compares the exact served manifest and every
critical response size/SHA256. Credentials, redirects and a mismatched base path are
rejected. Optional assets are not core availability requirements. Pages runs this step
after its qualified artifact deployment and retains the result for 90 days. Upload or
deployment success alone is not `served_verified`; an incomplete/failed verification
record is not acceptance. `served-release-evidence.v1` is point-in-time evidence, not
browser/device qualification. A maintainer must review its digest into protected
`accepted_served_evidence` before it can establish rollback eligibility.

For a separately authorized rollback, obtain the retained original artifact/evidence
and fresh authoritative run/exact-attempt jobs/artifact metadata. Its protected candidate
selection needs `rollback_authorization`: exact source/artifact ID/manifest digest,
origin, `corrected: true`, expiry date, reviewer and acceptance ID. This explicitly
attests the predecessor is corrected rather than restoring known false claims. Evaluate:

```powershell
python tools/release_policy.py --candidate retained/release-evidence.json --trusted trusted/docs/release-profiles.json --qualification trusted/docs/accepted-qualification.json --run-metadata metadata/run.json --artifact-metadata metadata/artifact.json --jobs-metadata metadata/jobs.json --master-sha CURRENT_MASTER_40_HEX --source-root trusted --require-rich-evidence --manifest retained/site/web-release-manifest.json --served-evidence retained/served-release-evidence.json --rollback
```

`--rollback` requires the API-backed path, exact rich staged bytes and accepted complete
served proof; it bypasses only the normal current-master equality check. All jobs,
protected profile, evidence conflict/freshness and schema/ABI compatibility checks remain.
It exits 0 only for eligible rollback, but **does not deploy**. Obtain production rollback
authority before using the retained artifact as publication input; never rebuild a ref.
Re-run served verification after any authorized replacement and qualify pinned/offline
clients. Preserve older observation ages. There is no automated rollback or cache wipe.

Before promoting a replacement, separately retain a recoverable last-known-good artifact
outside automatic expiry under maintainer-controlled retention. This implementation does
not provision an archive or claim hosted plan retention/settings have been verified.

## Data-reader and registry boundaries

For live solar v3, the builder resolves `data/current.json` exactly once, validates the
immutable `research-data-bundle.v1` and every component, and stages only captured bytes.
The additive `data_bundle {bundle_id, manifest_path, manifest_sha256}` descriptor and
`data_bundle_id` agree; every component also belongs to the release's critical hash/size
inventory. The browser binds to this immutable release descriptor, not a mutable alias.
Explicit historical v2 build fixtures retain the materialized-data compatibility path.
The P15 local transaction and read-only default daily workflow are implemented; their
future opt-in owned-branch/PR adapter is tested with mocks only. See
[TRANSACTIONAL_FEED.md](TRANSACTIONAL_FEED.md) for migration, failure retention, atomic
local rollback, exact-head/current-base checks, and the protected-environment enablement
hold. Local validation is not PR approval, merge, deployment, or served verification.

Crate publication remains separate and held. The workflow tests the exact requested
source, retains `cargo package --list`, executes `cargo publish --dry-run --locked`, and
records the package digest, file inventory, license/notice inventory, source-byte/VCS
correspondence and dry-run log digest. Cargo-generated metadata is identified explicitly.
No registry credential is loaded; the final workflow step intentionally fails with a hold.
License inventory does not substitute for legal/notices review or release qualification.

`tools/release_crate.py --registry-status STATUS --registry-body captured-body.json
--version VERSION` classifies an already captured response without a network call.
Only HTTP 404 means absent. HTTP 200 must identify the expected package/version; auth,
redirect, throttling, malformed and server responses fail lookup rather than grant release
authority. The package workflow reports registry `not_checked`; it does not invent a
successful lookup. Standard Cargo publication repackages source; there is no invented
prebuilt-crate publish command. Any later irreversible publication needs separate authority
and resulting registry checksum/content correspondence verification.

## Unqualified operational surfaces

Local fixture tests do not qualify GitHub API expanded job-name/field correspondence,
branch/environment rules, approval-wait execution, plan retention, actual Pages URL/CDN
behavior, deployed bytes, registry responses/publication, or an executed rollback. Desktop
and mobile browser/device combinations, actual offline/returning-client recovery and
science reference endpoints retain their own required evidence; no skipped platform or
endpoint is considered passed. P15 local data-reader integration does not qualify the
live acquisition endpoints, remote rolling-PR permissions, or production activation.

If a release is faulty, stop pending normal promotion, preserve its artifact and logs,
and identify a corrected compatible qualified predecessor. Obtain production rollback
authority, use a reviewed artifact-only rollback procedure, verify served manifest and
critical hashes, and test pinned/offline clients. No such production execution is
authorized here. If no safe predecessor exists, retain an honest unavailable state and
prepare a forward correction. Never repair deployment by rebuilding an arbitrary ref,
silently clearing caches, rewriting source history, or making old data appear current.
