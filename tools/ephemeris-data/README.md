# Ephemeris source data and legacy extraction tools

The analytic engines consume committed `vsop2013.bin`, `elpmpp02.bin` and
`top2013.bin` under `crates/solar-ephemeris/data/`. The authoritative local audit is
[Coefficient provenance](../../docs/COEFFICIENT_PROVENANCE.md): exact byte sizes,
SHA-256 hashes, immutable Git lineage, consumers, notice gaps and recovery requirements.

## Regeneration status: unavailable

The present checkout does not contain the original ephem.js normal-tier JavaScript inputs,
their immutable upstream revision/hashes, intermediate JSON or a verified binary serializer.
The checked-in dump/pack/gen scripts emit historical Rust literals, not the current binary
assets. In particular, `gen_top.js` would overwrite the current TOP decoder source if run
with its missing input supplied. Do not run these scripts against current source paths.

The previous claim that a `src/genbin.rs` serializer was preserved in history was not
supported by the reachable local history audit and is withdrawn. Mutable branch URLs are
not reproducible provenance. No new acquisition or coefficient reconstruction was performed.
The three blobs are explicitly non-regenerable from the supplied checkout until a separately
reviewed recovery establishes exact input/serializer/output and upstream notice correspondence.

## Separate source inventories

- [Stars and constellations](stars/README.md): committed catalogue source records.
- [Geography](geography/README.md): cartographic/surface-feature source records.
- [Major moons](moons/README.md): Horizons element/vector and physical-parameter records.
- [Generation manifest](generation-manifest.json): major moons only, with canonical runtime
  qualification pending; it does not govern the three binary analytic theory tables.

Historical source-parity tolerances are not independent astronomical accuracy or a broad
validated time envelope. [Ephemeris v3](../../docs/EPHEMERIS_V3.md) states current range,
time-scale, event-status and evidence limitations. Project licensing does not substitute
for the missing original ephem.js notice review.
