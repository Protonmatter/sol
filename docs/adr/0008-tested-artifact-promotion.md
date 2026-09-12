# ADR 0008: Tested-artifact promotion and feed transactions

- Status: Accepted for local engineering under RFC 0002; remote operation remains held
- Date: 2026-09-11

## Context and supersession

Testing a source SHA does not identify bytes rebuilt later or independently selected data
aliases. This ADR supersedes ADR 0004 clauses 4 and 6 only where they require rebuilding
WASM or regenerating data during deployment. CI candidate construction still performs
those operations. Historical ADR 0004 is retained as written.

## Decision

1. CI stages one immutable release with source/run identity, schema/ABI/source-map inventory,
   data-bundle identity and critical asset hashes and sizes. All candidate checks consume
   those bytes. Promotion retrieves and validates them; it never rebuilds or refetches data.
2. The release gate checks the exact repository, current base SHA, run ID and attempt,
   required job inventory and actual conclusions. Same-run matrix/reusable failures veto
   promotion. Manual dispatch and crate publication do not bypass the gate.
3. Accepted qualification must cover the changed component fingerprints, quantity,
   epoch, platform and profile. Candidate-generated evidence cannot approve itself.
   A narrower overlapping failed/pending case vetoes a broader accepted case. Recheck
   current head and dated acceptance after approval; absent protected authority means hold.
4. Service-worker installation stages and verifies a complete release before marking it
   usable. Activation is explicit; retain the prior and active-client releases. A failed
   new stage cannot delete a valid old cache. Unknown identity is an error, not a mixed
   alias fallback. Rollback requires a compatible accepted artifact and served-byte proof.
5. Feed producers write immutable source and derived bundles, validate the complete set,
   then atomically replace one pointer. Readers resolve it once, capture and validate all
   selected bytes and publish one snapshot/status/series/identity transaction. Unknown
   historical acquisition clocks stay unknown; filesystem mtime is not provenance.
6. The daily workflow is read-only by default and retains a candidate plus an approval
   hold. The rolling-PR adapter is separately enabled only with approved remote authority;
   it binds one owned branch/PR and expected head, enforces a data-only allowlist, rechecks
   current base and re-fetches the result. It never auto-merges or pushes the default branch.

## Consequences and evidence boundary

Local policy tests, candidate manifests and bounded browser two-release/corruption checks
are evidence about source and local artifacts. They do not establish protected GitHub
settings, hosted checks, public serving, a real historical v2-to-v3 transition, accepted
manual/scientific qualification or a production rollback. Those are explicit release
holds. See [release delivery](../RELEASE_DELIVERY.md),
[transactional feed](../TRANSACTIONAL_FEED.md) and [operations](../OPERATIONS.md).
