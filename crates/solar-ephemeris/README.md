# solar-ephemeris

[![crates.io](https://img.shields.io/crates/v/solar-ephemeris.svg)](https://crates.io/crates/solar-ephemeris)
[![docs.rs](https://docs.rs/solar-ephemeris/badge.svg)](https://docs.rs/solar-ephemeris)

A **zero-dependency** Rust ephemeris and topocentric sky engine:

- **VSOP2013** heliocentric positions for the Sun and eight planets (packed binary
  coefficient tables, decoded once at startup)
- **ELP-MPP02** for the Moon; **TOP2013** for the outer giants across ±5000 years
- Full topocentric reduction: light-time, aberration, Meeus Ch. 21 ecliptic precession,
  nutation, refraction, polar motion, and a complete Espenak–Meeus ΔT era table
  (−500 … +2150, continuous to ≤0.26 s at every seam) spliced with measured IERS
  values near the present
- Rise / transit / set with body-specific thresholds, a 108-star bright-star catalogue
  with proper motion applied, phase/illumination, and apparent magnitudes
- A provider-neutral, versioned JSON contract (`ephemeris-snapshot.v3`) shared with the
  Python tooling and the browser

Independent accuracy is limited to recorded body/quantity/observer/epoch evidence, not
the whole supported span. Scheduled checks can compare selected samples with Horizons;
the current v3 evidence records are explicitly source-theory parity, not independent JPL accuracy.

## Install

```toml
[dependencies]
solar-ephemeris = { path = "path/to/sol/crates/solar-ephemeris" }
```

V3 is a local preview; published releases may retain a different contract. Releases are listed on
[crates.io](https://crates.io/crates/solar-ephemeris); rendered API docs on
[docs.rs](https://docs.rs/solar-ephemeris). Zero dependencies — it pulls in nothing else.

The engine emits a versioned `ephemeris-snapshot.v3` JSON document for a given time and
observer. The runnable `snapshot` example shows end-to-end usage:

```bash
cargo run --example snapshot
```

## WebAssembly

The crate builds as a raw `cdylib` for `wasm32-unknown-unknown` with a tiny
`extern "C"` ABI (no wasm-bindgen, no bundler). The My Sky ABI rejects unsupported/nonfinite
epochs and observers with error JSON, never silently clamping them. It powers the
[Solar Maximum Engine](https://protonmatter.github.io/sol/) "My Sky" and
"Solar System" surfaces in ~0.5 MB, coefficient tables included.

## Honest limits

Snapshots explicitly report unvalidated evidence status. Historical sky positions are
Earth-rotation/time-scale limited; catalogue stars use an infinite-distance approximation
and omit annual parallax and aberration. See [EPHEMERIS_V3.md](../../docs/EPHEMERIS_V3.md)
for exact ranges, events, calendar bounds, and reproducible evidence limits. Research/learning only.

## License

The [coefficient provenance inventory](../../docs/COEFFICIENT_PROVENANCE.md) records
the three binary input hashes, immutable local lineage and missing original upstream
input/serializer/notice correspondence. They are not currently regenerable from the
supplied checkout; project licensing does not establish third-party notice completeness.

MIT OR Apache-2.0, at your option.
