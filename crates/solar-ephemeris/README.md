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
- Rise / transit / set with body-specific thresholds, a 107-star bright-star catalogue
  with proper motion applied, phase/illumination, and apparent magnitudes
- A provider-neutral, versioned JSON contract (`ephemeris-snapshot.v2`) shared with the
  Python tooling and the browser

**Validated against JPL Horizons (DE441) to arcsecond class** — a scheduled CI workflow
re-checks RA/Dec, alt/az, and ΔT against live Horizons weekly. `Cargo.lock` contains no
third-party crates: everything, including the WASM path, is auditable in one sitting.

## Install

```toml
[dependencies]
solar-ephemeris = "0.1"
```

or `cargo add solar-ephemeris`. Published on
[crates.io](https://crates.io/crates/solar-ephemeris); rendered API docs on
[docs.rs](https://docs.rs/solar-ephemeris). Zero dependencies — it pulls in nothing else.

The engine emits a versioned `ephemeris-snapshot.v2` JSON document for a given time and
observer. The runnable `snapshot` example shows end-to-end usage:

```bash
cargo run --example snapshot
```

## WebAssembly

The crate builds as a raw `cdylib` for `wasm32-unknown-unknown` with a tiny
`extern "C"` ABI (no wasm-bindgen, no bundler). All raw ABI inputs are sanitized —
non-finite observers and times cannot produce invalid JSON. It powers the
[Solar Maximum Engine](https://protonmatter.github.io/sol/) "My Sky" and
"Solar System" surfaces in ~0.5 MB, coefficient tables included.

## Honest limits

Accuracy envelopes are embedded in every snapshot (and shrink outside the validated
era). Deep-time positions are ΔT-limited; catalogue stars omit annual aberration
(~20″, negligible at horizon-dome scale). This is a research/learning engine — see
the repository's operational-readiness gates for what it deliberately does not claim.

## License

MIT OR Apache-2.0, at your option.
