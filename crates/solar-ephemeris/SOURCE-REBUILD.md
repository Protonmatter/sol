# Ephemeris source and rebuild materials

The crate contains the Rust library, binary tables, exact coefficient manifest,
upstream preferred JavaScript inputs and reconstruction tools. The upstream
inputs and notices are in `rebuild/upstream/`. The copies under `rebuild/tools/`
are distribution copies of Sol's canonical tools, not a second implementation
to edit independently. Their byte correspondence is a distribution check.

## Build a modified library

Use the package's Cargo manifest and an installed Rust toolchain with the
`wasm32-unknown-unknown` target. Sol currently selects released Rust 1.96.0.
There are no third-party Rust dependencies in this component. From an extracted
Cargo package, build with:

```text
cargo +1.96.0 build --offline --release --target wasm32-unknown-unknown
```

The library is `target/wasm32-unknown-unknown/release/solar_ephemeris.wasm`.
An intentional modification may change its byte identity and scientific results;
it does not inherit the original numerical qualification.

## Reconstruct the pinned tables

The included reconstruction tools require Python 3.11+ and installed Node with
the TypeScript version selected by `rebuild/package-lock.json`. Initial toolchain
installation is separate from offline reconstruction. From the extracted crate,
prepare a new scratch workspace with the included utility:

```text
python rebuild/tools/ephemeris_distribution.py --prepare-rebuild . --out-dir build/coefficient-work --node-modules-dir /path/to/existing/locked/node_modules
python build/coefficient-work/tools/rebuild_coefficients.py --source-dir build/coefficient-work/upstream --out-dir build/coefficient-work/build/rebuilt
```

Use your existing locked tooling path in the first command. It copies only the
already installed TypeScript package after checking its version against the
included lock; it performs no installation or download. Alternatively omit
`--node-modules-dir`, then arrange the included locked tooling in the prepared
workspace before reconstruction. The output directories must be new. The current profile checks
the original input hashes and requires exact equality with all three pinned tables.
Changing the coefficient sources requires reviewing the corresponding manifest
and validation in your modified source; the stock check intentionally rejects
altered inputs rather than describing them as the original qualified tables.

## Application replacement and delivery

Sol loads this library through a separate raw WebAssembly ABI. Its application
source is distributed as readable ES modules. A modified compatible library must
be restaged with its new asset digest and matching immutable release manifest;
replacing a file while retaining an old integrity digest is insufficient.

The source archive also retains `apps/web/data/series/` as explicit idealized
cycle migration inputs for offline regeneration and tests. The legacy
`latest-state.json`, `latest-observations.json` and `feed-status.json` fixture
inputs also accompany source under `apps/web/data/`. Those source inputs remain separate
from the selected bundle used by the served application.

The web distribution accompanies its license portal with matching source/build
materials and the release inventory. Use those materials to rebuild and restage
the application, then serve the new artifact locally. Keep original application
MIT/Apache notices and this component's LGPL/GPL notices. Source/delivery and
recombination verification must succeed before this candidate is described as a
qualified distribution; a repository's unmatched master URL is not that proof.
