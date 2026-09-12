# Immutable coefficient provenance and regeneration gaps

Audited locally on 2026-09-11. Scope: the three binary analytic theory tables consumed by
`solar-ephemeris`, their checked-in extraction tools and reachable local Git history.
No upstream request, regenerated coefficient, license acquisition or scientific
qualification was performed.

## Exact committed inputs

The present files match the binary-packing commit
`63b6cf3a726c2562ab476fb65696fc183624f4ed` with an empty scoped Git diff.
Total input size is 385,509 bytes. These SHA-256 values identify the actual local bytes,
not a claimed upstream release.

| Asset under `crates/solar-ephemeris/data/` | Bytes | SHA-256 |
| --- | ---: | --- |
| `vsop2013.bin` | 84449 | `9f7a79ea13f97bdc6e6bc28f3078ee0c13abb943fd1838b3754633677ed8ee19` |
| `elpmpp02.bin` | 241540 | `9f670b604c7b5189c9d70a1c2ab050672e6e8706aa0ab9b0cae439cb88171347` |
| `top2013.bin` | 59520 | `d399838a9cdefde56219e405a2c00c7ebde7aa2d817db91ceb7bb4b4c9d57ce8` |

Immutable Git blob objects at that commit are, respectively,
`2093c55abc3d6d3d8705762a567d46ed3838d5cb`,
`91c2c7c3b0fa43341a892222fa9f155c7cea5f83` and
`24f442eff829453761f396899b5abcf2a5c1bb3e`.

## Consumers and local source correspondence

| Family | Recorded historical attribution | Decoder / evaluator | Present structural boundary |
| --- | --- | --- | --- |
| VSOP2013 | ephem.js 06-normal tier | `vsop2013_data.rs` / `vsop2013.rs` | Eight planets including EMB; six orbital-element series |
| ELP-MPP02 | ephem.js normal tier, jpl/DE405 fit | `elpmpp02_data.rs` / `elpmpp02.rs` | Main and perturbation terms plus W0 |
| TOP2013 | ephem.js 06-normal tier | `top2013_data.rs` / `top2013.rs` | Four outer planets, mean motion and six element series |

Paths in that table are under `crates/solar-ephemeris/src/`. Each decoder includes
the corresponding binary bytes, structurally validates before allocation and decodes
once. Structural/finite/bounds checks do not prove upstream authenticity or accuracy.

The parent commit `0d125c53ce0cc08eefa6c053b7034d93110e2c9c` retains the older
generated Rust literals. Their immutable Git objects are:

| Historical source path | Git blob |
| --- | --- |
| `crates/solar-ephemeris/src/vsop2013_data.rs` | `0f0f938b0dbe7bb74657c403a1de4c4e56248864` |
| `crates/solar-ephemeris/src/elpmpp02_data.rs` | `c6acb41cfae9cde831ffc0802954caecc50d1515` |
| `crates/solar-ephemeris/src/top2013_data.rs` | `ec7d2eab35e4c0fbaf9b2087805008dfb15f24ea` |

This is recoverable local intermediate lineage, not an independently rerun literal-to-
binary conversion. The historical commit message claims unchanged values/snapshots;
that claim is not substituted for fresh serializer/output evidence in this audit.

## Explicitly non-regenerable from this checkout

All three binary assets are **non-regenerable from the checked-in toolchain as supplied**:

- The original `vsop2013_normal.js`, `elpmpp02_normal.js` and
  `top2013_normal.js` inputs are absent. No immutable upstream commit, original-input
  SHA-256 or archived input bytes binds the historical ephem.js attribution.
- `dump_vsop.js` and `pack_vsop.py` require missing upstream/intermediate JSON.
  `dump_elp.js` and `pack_elp.py` likewise require missing source/init tables.
- `gen_top.js` exists but reads missing `top2013_normal.js` and writes old-style Rust
  literals directly over `top2013_data.rs`. It is not a binary serializer and is not a
  safe current regeneration command. Its CommonJS-style execution also needs explicit
  environment handling under the current module package.
- The former README asserted `src/genbin.rs` was preserved in history. No such file
  exists in the current checkout, and `git log --all -- '**/genbin.rs'` returned no
  matching path in the reachable local history inspected here. The assertion is withdrawn.
  No upstream or unreachable-object history was searched.
- The scripts' old mutable `develop` URLs are not immutable source identities.
  Fetching a current branch and overwriting committed outputs would not reconstruct
  the historical input or establish numerical correspondence.

Do not run the legacy generators against current decoder paths. Ordinary builds consume
the pinned blobs; they do not regenerate them. A future separately reviewed recovery
must retain original bytes and upstream revision/notice, recover or implement a tested
binary serializer, pin runtime/serialization, run twice, compare every output byte and
then perform independent scientific validation. Missing correspondence remains a
qualification gap, not permission to relax a parity threshold.

## Notice and scientific evidence boundaries

Existing source comments attribute ephem.js and call it MIT-licensed. This audit found
the project `LICENSE-MIT` (Protonmatter 2026) and `LICENSE-APACHE` in the crate, but no
original upstream ephem.js license/copyright text or immutable upstream notice identity
alongside these tables. The project dual license does not establish third-party notice
completeness. Original notice acquisition and reviewed distribution/package correspondence
remain held; this document is not a legal determination or a fabricated notice.

The current eight immutable TOP2013 vectors in the ephemeris evidence registry are
source-theory parity, not independent Horizons pointing/range/event qualification.
Table hashes, safe decoding and local literal lineage cannot broaden that evidence.
See [ephemeris v3](EPHEMERIS_V3.md) and [accuracy contract](ACCURACY_CONTRACT.md).
No quoted live Moon example is used as a qualification fixture.

## Other generated assets are separate inventories

- [Stars/constellations](../tools/ephemeris-data/stars/README.md) retain source package
  versions and raw-source hashes; this audit does not claim their notices were legally reviewed.
- [Geography](../tools/ephemeris-data/geography/README.md) and
  [moons](../tools/ephemeris-data/moons/README.md) retain their own source inventories.
- [Moon generation manifest](../tools/ephemeris-data/generation-manifest.json) binds
  generator/source/output hashes and marks canonical Linux x86_64 qualification pending.
  Its scope is major moons only; it does not cover these binary theory tables.
- Solar fixtures are model-generated examples, not immutable independent observations.
  Reproducibility of those fixtures is distinct from physical calibration.

## Recheck without mutation or network

```powershell
Get-FileHash crates/solar-ephemeris/data/vsop2013.bin,crates/solar-ephemeris/data/elpmpp02.bin,crates/solar-ephemeris/data/top2013.bin -Algorithm SHA256
git diff 63b6cf3a726c2562ab476fb65696fc183624f4ed -- crates/solar-ephemeris/data
git ls-tree 63b6cf3a726c2562ab476fb65696fc183624f4ed crates/solar-ephemeris/data/
git ls-tree 0d125c53ce0cc08eefa6c053b7034d93110e2c9c crates/solar-ephemeris/src/
```

Review file identity and provenance changes together. No command above authorizes
coefficient replacement, external refresh, commit, registry publication or deployment.
