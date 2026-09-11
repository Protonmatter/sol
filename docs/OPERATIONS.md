# Operations

Updated: 2026-09-11. Scope: local research operation. No production, scheduled acquisition,
registry publication or deployed-service qualification is asserted.

## Preconditions and authority

Use the locked development environment described in [instructions](INSTRUCTIONS.md).
Read existing artifact/pointer identities before a change, choose an exact task-local
destination and retain prior valid state. No administrator access is needed for ordinary
local validation. Explicitly authorize network acquisition and endpoint/recipient scope;
the deterministic default uses committed fixtures.

## Source and derived data transactions

`tools/fetch_public_data.py` acquires immutable source bundles with original bytes, hashes,
source identity, observation/retrieval times, origin, quality and failure records.
`tools/run_daily_ingest.py` derives and validates a complete research bundle before
atomically selecting `current.json`. Source and derived pointers are separate: a newly
acquired source does not make a failed derivation current.

The derived bundle binds snapshot v3, observations, feed status v2, series manifest and
available frames to one source-manifest hash. The browser resolves a local pointer once
or its release-bound descriptor, verifies all required bytes/contracts and publishes one
coherent state. Corrupt, missing or mixed components leave the prior valid state visible
with an actionable error. Generation time never replaces observation/retrieval time.

For an **existing validated local source bundle**, an offline derivation into an exact
task-local output is:

```powershell
python tools/run_daily_ingest.py --skip-fetch --cache PATH_TO_EXISTING_SOURCE_BUNDLE_ROOT --web-data build/research-preview
```

The cache root must already contain its valid `current.json`; this command does not fetch.
It creates immutable local output and selects that output's pointer, not a deployed site.
`--migrate-v1 --skip-fetch` explicitly inventories an existing legacy cache without
rewriting its original raw files; review provenance gaps before use.
`--fail-on-degraded` withholds degraded derivations. Exit 0 means local validated
selection only; failure returns 1 and retains the last derived pointer. Argument errors
can return 2. Failure-attempt evidence remains distinct from healthy feed status.

Omitting `--skip-fetch` performs network acquisition and requires separate authorization.
Do not infer permission from scheduling examples or use a demonstration fixture as a
live observation. See the separately maintained [data update playbook](DATA_UPDATE_PLAYBOOK.md)
for governed refresh procedures; exact current code and accepted contracts prevail over
historical prose about fixed output aliases.

## Browser/provider operation

Default Sky calculations stay on device. Remote mode requires an explicitly configured
recipient and session-only consent for selected latitude, longitude, elevation and time.
Health and snapshot redirects are rejected before reaching another recipient. Endpoint
changes require fresh consent. Deny/revoke aborts remote intent; errors retain last-valid
data and offer explicit local recovery, not hidden fallback. Share/export previews show
the captured values before the second copy/download action.

The optional Python provider is a separate loopback service, not a production-hardened
public deployment. Admission is bounded to four workers/twelve distinct jobs, with
subscriber-aware cancellation, an overall twenty-second job budget, bounded response
bytes and retries. OS/DNS calls cannot be forcibly terminated by Python threads; a stuck
slot remains occupied without replacement-thread growth. See [ephemeris limits](EPHEMERIS_V3.md).
No public endpoint, authentication/TLS topology or production latency is qualified here.

## Candidate build, promotion and rollback

Build into a new staged directory using [instructions](INSTRUCTIONS.md). Candidate,
qualified, promotion-eligible and served-verified are distinct states.
[Release delivery](RELEASE_DELIVERY.md) specifies same-run evidence, protected profile
acceptance, immutable asset/WASM/schema identities and exact-artifact promotion. The
privileged promotion path does not rebuild source. Missing settings/manual/scientific
acceptance is a hold, not success. Registry publication is separately held.

Do not repair a failed release by overwriting data aliases, rebuilding an arbitrary ref
or clearing all caches. Preserve evidence and identify a compatible, corrected,
qualified predecessor artifact; production rollback needs separate authority and served
verification. A local retained artifact alone is not an eligible production rollback.

## Validation and incident evidence

Run source, contract, staged-browser and coverage checks in [VALIDATION_PLAN](VALIDATION_PLAN.md).
Keep command/toolchain versions, source and final asset hashes, errors and exact input
identities. Do not log credentials or needless location payloads. A fresh source fetch,
successful build or upload is not a verified served release.

For invalid data, retain the selected pointer and inspect the failed attempt, source
manifest and component hashes. For unavailable workers/providers, preserve valid facts,
cancel obsolete intent and use explicit recovery. Do not fabricate missing events or
change schema versions to bypass validation.

## Scientific and operational limits

Real imagery is not automatically registered; current assessments never permit model
compositing. Coefficient regeneration/notice gaps and canonical runtime holds are in
[COEFFICIENT_PROVENANCE](COEFFICIENT_PROVENANCE.md) and
[CANONICAL_GENERATION](CANONICAL_GENERATION.md).
Keep operational readiness false: no calibrated magnetic/forecast probability,
navigation, occultation, mission-safety or operational warning authority is established.
