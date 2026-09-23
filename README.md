# Sol — solar and sky research explorer

Sol is a local-first research and learning application: a reduced solar-surface model,
an observer's sky, and a Solar System view. The static browser uses native ES modules
and audited Rust engines through raw WebAssembly. No runtime framework or bundler is required.

## Current state

The September 2026 correctness/experience changes are **implemented locally, not released
or fully qualified**. RFC 0002 remains Accepted. Existing public site/crate versions are
separate artifacts and have not been revalidated as matching this checkout. Passing local
tests do not establish hosted CI, accepted scientific/manual evidence or production approval.

Live contracts are [solar-state-snapshot.v3](docs/solar-state-snapshot-v3.schema.json),
[ephemeris-snapshot.v3](docs/ephemeris-snapshot-v3.schema.json), and
`system-snapshot.v1`. Historical v2 remains separately inspectable; live readers reject
unsupported versions rather than silently relabelling data.

## What the application does

- **Sun:** an original NASA SDO/AIA observation with archival capture time and credits opens
  the experience. Research mode provides reduced Carrington-frame transport and illustrative
  cycle examples. The observation and model retain separate source identities. Current model
  region anchors are distinct from immutable birth positions. Activity variance is an
  illustrative scalar proxy; magnetic uncertainty is unavailable and confidence is a
  heuristic score, not a calibrated probability.
- **My Sky:** on-device observer/time calculations, geometric above-horizon grouping,
  searchable keyboard-native object rows, selected facts, and separately disclosed event
  status. Device civil time and UTC are explicit choices; coordinates do not imply a timezone.
- **Solar System:** WebGL2 and map views, catalogue-backed stars, body selection and
  independently selectable display scales. Display inflation is not physical distance.
  Moon interpolation is withheld outside its documented window; it is not a navigation
  or mutual-event ephemeris.
- **Explore first:** concise Sky/System cards show accepted scene facts. Search, location,
  time and detailed tools open on intent. Camera shortcuts use the existing physical centers;
  body selection does not open the full control panel. Verified NASA/mission archive previews
  remain separate from the 3-D appearance; unsupported sphere textures stay disabled.
- **Optional planet looks (candidate):** Solar System → View → Planet appearance
  offers attributed Solar System Scope maps for Mercury, Venus, Mars, Jupiter, Saturn,
  Uranus and Neptune. These are artistic reconstructions; Source-qualified stays
  the default. See [RFC 0007](docs/rfcs/0007-illustrative-planet-looks.md) for review
  status and limits.
- **Sources and limits:** persistent presentation metadata identifies the displayed
  epoch, source/provider and degraded/unavailable state. An observed image is not a
  registered model overlay: current registration assessment never permits compositing.

Full solar solving, Sky events/tracks and System metadata run in bounded workers.
Latest-intent scheduling cancels obsolete work and validates engine/schema/ABI/release/
generation identities before publication. The System view retains a fixed nine-body,
27-f64 position fast path; a local microprofile is not a cross-device performance guarantee.

Remote Sky is optional and requires an explicitly configured recipient and session-only
consent before either health or location/time requests. Redirects are rejected before
transmission to another recipient. Failure retains the last valid snapshot with visible
status; local recovery is explicit. Share/export previews disclose the captured exact
location/time before copying or downloading.

## Run a local preview

Use an existing locked Rust toolchain with the WASM target, Python 3.11+, and Node 22
with this repository's pinned development tooling. Building is offline once dependencies
and toolchains are installed. New output directories prevent accidental replacement.

```powershell
$candidateSha = git rev-parse HEAD
python tools/build_wasm.py --locked --out-root build/wasm-review
python tools/build_web.py --wasm-dir build/wasm-review --out-root build/site-review --release-id local-review-1 --source-sha $candidateSha --repository OWNER/REPOSITORY --run-id 1
python -m http.server 8000 --bind 127.0.0.1 --directory build/site-review
```

Replace the repository placeholder with the actual candidate identity. Open the loopback
preview in a browser. A dirty checkout's HEAD is lineage only, not exact source attestation.
Do not serve the source tree as a production artifact or hand-edit cache tokens.

See [instructions](docs/INSTRUCTIONS.md), [operations](docs/OPERATIONS.md) and
[artifact delivery](docs/RELEASE_DELIVERY.md) for validation, immutable namespaces,
explicit update/rollback and held promotion policy.

## Data and evidence

Public source acquisition is separately authorized network work. Default validation uses
committed fixtures and references. Acquisition retains original bytes in immutable source
bundles; derivation validates a complete research bundle before atomically selecting its
pointer. Snapshot, observations, feed status and cycle frames cannot be mixed across
bundle identities. Freshly generated does not mean freshly observed or published.

- [Current specification](docs/SPEC.md) and [status/holds](docs/STATUS.md)
- [Solar v3 semantics](docs/SOLAR_V3_MIGRATION.md) and [ephemeris v3 semantics](docs/EPHEMERIS_V3.md)
- [Coefficient provenance and regeneration gaps](docs/COEFFICIENT_PROVENANCE.md)
- [Canonical generation](docs/CANONICAL_GENERATION.md) and [data sources](docs/DATA_SOURCES.md)
- [Validation plan](docs/VALIDATION_PLAN.md), [accuracy contract](docs/ACCURACY_CONTRACT.md)
  and [requirements](docs/REQUIREMENTS.md)

The three analytic coefficient blobs have immutable local hashes but missing original
upstream inputs/serialization correspondence. They are explicitly non-regenerable from
this checkout. The current eight TOP2013 records prove source-theory parity at recorded
samples only, not independent pointing/range/event accuracy. Canonical moon generation
qualification and new independent reference acquisition remain held.

## Development checks

```powershell
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
npm test
python tools/typecheck_web.py
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_ux_contract.py
```

Run the risk-specific Python, contract, staged-browser and coverage commands in the
validation plan as well. Existing 90% coverage floors are requirements, not a claim that
this local tree currently passes every coverage/platform gate. No full accessibility
conformance or operational forecast authority is claimed.

Sol is not for navigation, occultation prediction, mission safety or operational
space-weather warnings. `space_weather_operational` remains false. Project code is
MIT OR Apache-2.0; third-party data attribution and outstanding coefficient notice
correspondence are documented separately and are not resolved by that project license.
