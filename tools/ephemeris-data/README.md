# Ephemeris source data and legacy extraction tools

The analytic engines consume committed `vsop2013.bin`, `elpmpp02.bin` and
`top2013.bin` under `crates/solar-ephemeris/data/`. The authoritative local audit is
[Coefficient provenance](../../docs/COEFFICIENT_PROVENANCE.md): exact byte sizes,
SHA-256 hashes, immutable Git lineage, consumers, notice gaps and recovery requirements.

## Offline reconstruction from pinned inputs

The [source manifest](coefficient-sources.json) pins VSOP2013/TOP2013 `08-big` and
ELP-MPP02 `06-normal` files
at upstream commit `2f679a1f698b4f20f9579d94da24af51559458ed`, original file hashes,
the existing lunar initializer, the upstream root license and shipped outputs.
The [recovery report](../../docs/COEFFICIENT_RECOVERY_20261103.md) records the earlier
two exact normal-profile reconstructions. The [precision follow-up](../../docs/PRECISION_WINDOW_20261104.md)
records the later VSOP-only increase and two exact reconstructions. This establishes source correspondence;
independent scientific, cross-platform and distribution qualification remain held.

```text
python tools/rebuild_coefficients.py --profile current --source-dir crates/solar-ephemeris/rebuild/upstream --out-dir build/NEW-coefficient-rebuild
python -m unittest discover -s tests/python -p test_coefficient_recovery.py
```

The command requires Python 3.11+, existing locked Node/TypeScript development
tooling, and all four original files already present in `--source-dir` under their
manifest names. It performs no network or dependency installation. Its static AST
reader never executes upstream JavaScript; the existing initializer receives only
generated numeric literals. All source and output hashes must match exactly.
The default `current` profile also requires exact correspondence with the shipped
blobs. `legacy-normal` reconstructs the archived normal profile, while `vsop08`
retains the fixed mixed-profile recipe used during the experiment. Both explicit
profiles report actual `matches_shipped` values; a legacy output is not silently
promoted. Only the exact hash/size-pinned larger VSOP08 and TOP08 sources are
admitted above the normal 1 MiB parser input cap; ELP and the syntax-node cap
are unchanged.
Output must be a new directory under `build/`; existing candidates and production
paths are refused. A successful directory contains the three blobs, frozen original
inputs/notice, source manifest and final `report.json` completion marker. An I/O
failure can retain an incomplete new directory without that marker. Preserve it
for diagnosis and select another output name; never copy its partial files into
production paths. No production rollback is needed because the command cannot
replace the shipped blobs.

Required permissions are read access to the supplied originals and repository,
plus write access to the chosen build directory. No elevation, credentials or
network permission is required. Exit codes are `0` for exact reconstruction,
`1` for failed admission/calculation/identity/I/O and `2` for invalid CLI usage.
The command reports success and output hashes on stdout; failures go to stderr.

The preferred sources and original notices are delivered in the ephemeris
component under `rebuild/upstream/`, with matching reconstruction tools. A clean
checkout with existing locked development tooling can rebuild them offline.
No runtime dependency or network call is introduced.

The previous claim that a `src/genbin.rs` serializer was preserved in history was not
supported by the reachable local history audit and remains withdrawn. The legacy
dump/pack/gen scripts emit historical Rust literals, not current binary assets.
In particular, `gen_top.js` would overwrite the current TOP decoder if run with
its old input supplied. Do not run those legacy scripts against current sources;
use the supported bounded rebuild command.

## Separate source inventories

- [Earth orientation](eop-sources.json): pinned Bulletin A fixed-width source,
  format, acquisition and published-checksum inputs under
  `tests/fixtures/iers-eop-20261104/`. Run `python tools/generate_eop.py --check`
  for read-only source/runtime correspondence or
  `python tools/generate_eop.py --out-dir build/NEW-eop-rebuild` for a fresh,
  deterministic offline candidate. Python3.11+, read access to the repository
  and write access to the chosen build directory suffice; no elevation,
  credentials, dependency installation or network is required. Exit0 means
  exact admitted correspondence,1 means admission/output failure, and2 means
  invalid usage. Existing destinations and runtime writes are refused. Do not
  promote an incomplete candidate; rollback requires restoring the matching
  runtime/data/metadata and rebuilding/requalifying an artifact. See
  [EOP coverage, interpolation and verification limits](../../docs/EOP_HISTORY_20261104.md).
- [Stars and constellations](stars/README.md): committed catalogue source records.
- [Geography](geography/README.md): cartographic/surface-feature source records.
- [Major moons](moons/README.md): Horizons element/vector and physical-parameter records.
- [Generation manifest](generation-manifest.json): major moons only, with canonical runtime
  qualification for the current exact-image/source/output contract recorded in the
  [native moon report](../../docs/CANONICAL_MOON_20261103.md); it does not govern
  the three binary analytic theory tables.

Historical source-parity tolerances are not independent astronomical accuracy or a broad
validated time envelope. [Ephemeris v3](../../docs/EPHEMERIS_V3.md) states current range,
time-scale, event-status and evidence limitations. Project licensing does not substitute
for upstream notice review. The acquired root upstream license is LGPL-3.0;
historical MIT attribution is unsupported by the inspected originals. Project
MIT/Apache terms remain unchanged; the ephemeris component now has the
owner-approved LGPL-3.0-only declaration and corresponding-source materials.
Publication and release qualification remain held.
