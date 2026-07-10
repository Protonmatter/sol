# ADR 0002: Provider-neutral ephemeris snapshot v2

- Status: Accepted
- Date: 2026-07-10
- Replaces: `ephemeris-snapshot.v1`

## Context

The local Rust/WASM engine and optional JPL Horizons provider must be interchangeable without view-layer guessing. Precision hardening introduced explicit time scales, Earth-orientation quality, and separate geocentric and topocentric apparent coordinates. Allowing one provider to remain on v1 would make exports and UI behavior provider-dependent.

## Decision

1. Both providers emit `ephemeris-snapshot.v2`.
2. `ra_deg` and `dec_deg` are compatibility aliases for apparent topocentric coordinates; explicit geocentric and topocentric fields are mandatory.
3. Time metadata carries UTC, optional TAI, TT, UT1, DUT1, delta-T, local sidereal time, obliquity, and Earth-orientation provenance/quality.
4. Provider-specific metadata is optional and isolated under `provider`; rendering fields remain provider-neutral.
5. Missing events are represented as `null`, never fabricated.
6. The browser validates all snapshots before rendering or export and rejects v1 or semantically inconsistent v2 data.
7. The optional server may provide definitive DE441 body coordinates while explicitly declaring degraded standalone EOP metadata when it does not ingest IERS data itself.

## Compatibility policy

- Contract changes require a new schema version.
- Producers, browser guards, validators, fixtures, and optional providers migrate in the same pull request.
- Mixed versions are rejected unless a separately tested compatibility adapter is deliberately introduced.
