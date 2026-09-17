# Sol status

Updated: 2026-09-13. Scope: inspected local implementation, not production activation.

## Implementation versus qualification

RFC 0002 remains **Accepted**. Local completion of a bounded task does not mean every
acceptance case has passed, the change is merged, or an artifact is deployable.
The existing public website and previously published crate are separate, unverified
artifacts for this status update.

See [the earlier implementation ledger](LOCAL_IMPLEMENTATION.md) and the current
[scientific workspace ledger](plans/2026-09-12-scientific-workspace/README.md) for exact
candidate evidence and open gates. The earlier Node coverage failure was resolved by
the observation candidate; its recorded Node 90/90/90 and whole-web line gates passed.
Subsequent candidates require their own fresh source-bound checks. Review PRs and
production promotion are distinct: missing scientific/manual qualification holds promotion,
while a scoped, tested implementation can be submitted for code review.

## Current architecture

- Static native ES-module UI; deterministic Rust solar and ephemeris engines through raw WASM.
- Live solar v3, ephemeris v3 and System v1 contracts. Strict schema/semantic validation,
  sparse-array and duplicate-key rejection where applicable, immutable publication and
  explicit historical v2 inspection.
- Solar scalar activity uncertainty is illustrative; magnetic uncertainty unavailable.
  Region birth and current model anchor are separate. No current image-registration
  assessment permits compositing.
- Ephemeris separates geocentric/observer ranges, mean-solar-day event occurrence from
  calculation status, supported compute bounds from accuracy claims, and source parity
  from independent references.
- Bounded latest-intent workers for solar solving, Sky events/tracks and System metadata;
  stale replies cannot publish. The System position fast path is fixed at nine bodies.
- Transactional source and derived data bundles. Local readers resolve a pointer once;
  staged readers resolve their immutable release's bundle. Validation completes before
  one coherent store publication; failure retains the prior valid bundle.

## User-visible behavior implemented locally

Sun, My Sky and Solar System expose selected non-canvas facts, native object controls,
visible mode/source/epoch/limitations and bounded lists. The timeline distinguishes
idealized cycle frames from observed data and treats missing frames as gaps.
Observed imagery and synthetic model presentation are separate.
The default Sun is a preserved NASA observation. Sky and System have concise scene cards,
explicit task entry, native disclosures and source-qualified archive previews. Sky cards use
the retained snapshot observer and actual provider after a failed request. Planetary
global-map qualifications remain held; the evidence and next steps are recorded in
[asset qualification](plans/2026-09-12-scientific-workspace/ASSET_QUALIFICATION.md).

Sky uses geometric altitude greater than zero for above-horizon groups, not refracted
altitude. Invalid observer/time inputs retain valid state. Device civil timezone is
disclosed and is not inferred from location. Remote configuration requires fresh
recipient-specific consent; denial sends no health or snapshot request; redirects fail
before another destination is contacted. Provider failure has explicit recovery without
silent local fallback. Share/export requires a captured-data preview.

The retained star, constellation, geography and moon catalogues have their own provenance
and approximation limits. Display orbit/size inflation never changes the underlying
physical quantities. Historical interpolation measurements are not a new v3 accuracy
qualification.

## Validation observed, with bounded scope

Task reports retain exact commands and source/artifact hashes. Local targeted Rust,
Python and Node tests, strict contract corpora, staged Chromium worker/interaction tests
and synthetic release-policy/transaction fixtures have been exercised. Sky's redirect
correction additionally used two local origins: zero destination requests, retained valid
snapshot and no hidden fallback. These are bounded regression observations, not blanket
coverage or browser certification.

Required coverage floors remain 90% for the configured Rust/Python/whole-web denominators
and 90% Node lines/branches/functions. Every hand-written worker remains in the runtime
denominator. No claim is made here that a complete fresh shared coverage run passed.

## Held qualification and release work

- Independent astronomical reference acquisition for current v3 ranges/apparent place/events;
  the eight current TOP2013 records are source-parity samples only.
- Original coefficient input/serializer and upstream notice correspondence:
  [inventory and gaps](COEFFICIENT_PROVENANCE.md).
- Canonical Linux x86_64 moon-generation qualification; diagnostic ARM runs are not acceptance.
- Full acceptance/failure matrix, cross-platform performance and physical mobile/browser
  checks; manual screen-reader, focus, contrast and complete accessibility evidence.
- Real-image registration and empirical magnetic/forecast uncertainty calibration.
- Hosted job metadata/settings, protected profile/acceptance evidence, registry, served
  bytes, returning-client transitions and executed production rollback.

The local release path builds one immutable candidate, then verifies its exact artifact
rather than rebuilding during promotion. Missing protected settings or accepted evidence
holds promotion; see [delivery](RELEASE_DELIVERY.md). No local report grants deployment,
registry publication, scheduling or external data-acquisition authority.

## Operational boundary

`space_weather_operational` is false. Fields are normalized, transport is reduced,
meridional circulation is not implemented, and no operational warning, navigation or
mission-safety use is supported. Research/learning intent does not itself establish a
qualified release. See [SPEC](SPEC.md), [validation](VALIDATION_PLAN.md) and
[RFC alignment](RFC_ALIGNMENT.md).
