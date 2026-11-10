# solar-ephemeris

[![Published crate version](https://img.shields.io/crates/v/solar-ephemeris.svg)](https://docs.rs/solar-ephemeris/0.2.0/solar_ephemeris/)
[![docs.rs](https://docs.rs/solar-ephemeris/badge.svg)](https://docs.rs/solar-ephemeris/0.2.0/solar_ephemeris/)

A **zero-dependency** Rust ephemeris and topocentric sky engine:

- **VSOP2013** heliocentric positions for the Sun and eight planets (packed binary
  08-big coefficient tables, decoded once at startup)
- **ELP-MPP02** for the Moon; **TOP2013 08-big** for the System view's outer giants,
  with sampled accuracy limitations recorded below
- Full topocentric reduction: light-time, aberration, Meeus Ch. 21 ecliptic precession,
  nutation, refraction, polar motion, and a complete Espenak–Meeus ΔT era table
  (−500 … +2150, continuous to ≤0.26 s at every seam) spliced with measured IERS
  values near the present
- Rise / transit / set with body-specific thresholds and grazing-crossing refinement, a 108-star bright-star catalogue
  with proper motion applied, phase/illumination, and apparent magnitudes
- A provider-neutral, versioned JSON contract (`ephemeris-snapshot.v3`) shared with the
  Python tooling and the browser

Independent accuracy is limited to recorded body/quantity/observer/epoch evidence, not
the whole supported span. Scheduled checks can compare selected samples with Horizons;
the current v3 evidence records are explicitly source-theory parity, not independent JPL accuracy.
The current eight TOP08 references identify the exact upstream source and element
function. The offline validator requires existing locked Node/TypeScript tooling
in addition to Python and Rust; it performs no download or installation.

The owner-approved precision target is **1900–2200 inclusive**; the supported
calendar remains years 1–9999, with approximate exploration outside that target.
The [precision-window report](../../docs/PRECISION_WINDOW_20261104.md) records
109,900 passing geometric, apparent-pointing and range checks at 3,925 declared
model epochs after increasing only the VSOP coefficient tier. This sampled
result is separate from original-API/worker correspondence, observer/event
accuracy and final release qualification; snapshots still report unvalidated.

Model selection differs by quantity: System positions/orbit ellipses use TOP2013
for the four giants; Sky apparent places currently reduce VSOP2013 target
positions for all planets. The [matched-TT apparent-coordinate comparison](../../docs/APPARENT_EPOCHS_20261104.md)
retains the earlier normal-profile baseline of 27 failures among 144 directions.
Neither a geometric model's
passing sample nor a source-theory parity test qualifies the other path.

## Install

```toml
[dependencies]
solar-ephemeris = { path = "path/to/sol/crates/solar-ephemeris" }
```

The current v3 source and published crate releases are separate artifacts. Versioned
API documentation is available for published
[0.2.0](https://docs.rs/solar-ephemeris/0.2.0/solar_ephemeris/) and
[0.1.1](https://docs.rs/solar-ephemeris/0.1.1/solar_ephemeris/); consult the selected
version's contract before using it. The current repository workflow qualifies exact
source packages but holds further publication; see [build notes](../../BUILD_NOTES.md).
Zero dependencies — it pulls in nothing else.

The engine emits a versioned `ephemeris-snapshot.v3` JSON document for a given time and
observer. The runnable `snapshot` example shows end-to-end usage:

```bash
cargo run --example snapshot
```

The `sky` CLI accepts exactly four numeric arguments and writes one snapshot to
standard output on success:

```text
cargo run --locked -p solar-ephemeris --bin sky -- <unix_seconds> <lat_deg> <lon_deg_east> <elev_m>
```

Exit0 indicates a successful snapshot. Exit2 indicates invalid argument count,
malformed numeric input or an engine-rejected epoch/observer. Diagnostics go to
standard error; numeric parsing errors identify the argument without echoing its
value. The engine retains its existing nonfinite/range validation and error JSON.

## WebAssembly

The crate builds as a raw `cdylib` for `wasm32-unknown-unknown` with a tiny
`extern "C"` ABI (no wasm-bindgen, no bundler). The My Sky ABI rejects unsupported/nonfinite
epochs and observers with error JSON, never silently clamping them. It powers the
[Solar Maximum Engine](https://protonmatter.github.io/sol/) "My Sky" and
"Solar System" surfaces. The larger VSOP and TOP coefficient tiers increase the raw
ephemeris WASM size; the selected release manifest records its actual size and
digest. Device-specific execution cost needs validation.

## Honest limits

Snapshots explicitly report unvalidated evidence status. Historical sky positions are
Earth-rotation/time-scale limited; catalogue stars use an infinite-distance approximation
and omit annual parallax and aberration. See [EPHEMERIS_V3.md](../../docs/EPHEMERIS_V3.md)
for exact ranges, events, calendar bounds, and reproducible evidence limits. Research/learning only.
The [geometric-vector investigation](../../docs/GEOMETRIC_VECTORS_20261104.md)
records the earlier normal-profile baseline of 29 failures among 160 DE441
samples at the unchanged intended 10-arcsecond-
equivalent full-vector budget. Source parity does not qualify continuous accuracy.

## License

This ephemeris component is distributed under **LGPL-3.0-only**, separately from
the application's original MIT/Apache terms. Read [the component notice](NOTICE-EPHEMERIS.md),
[LGPL v3](COPYING.LESSER.LGPL-3.0) and its [GPL v3 companion](COPYING.GPL-3.0).
Existing MIT/Apache notices remain for the original material they cover; they do
not replace the ephemeris component declaration or third-party notices.

[COEFFICIENT-SOURCES.json](COEFFICIENT-SOURCES.json) records exact input/output
identities. The pinned upstream JavaScript inputs, upstream notice/README and
reconstruction utilities are included under `rebuild/`; see
[source and rebuild instructions](SOURCE-REBUILD.md). Source correspondence,
applicable rights and distribution obligations require their own review. This
declaration does not authorize publication or qualify astronomical accuracy.
