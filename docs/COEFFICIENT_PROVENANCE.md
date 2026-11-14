# Immutable coefficient provenance and reconstruction

Audited locally on 2026-09-11. Scope: the three binary analytic theory tables consumed by
`solar-ephemeris`, their checked-in extraction tools and reachable local Git history.
That historical audit made no upstream request or reconstruction. The
[2026-11-03 recovery](COEFFICIENT_RECOVERY_20261103.md) now identifies immutable
upstream inputs and reproduces every shipped coefficient byte twice locally.
The [2026-11-04 precision follow-up](PRECISION_WINDOW_20261104.md) subsequently
increases only VSOP2013 to the same commit's 08-big tier. The current TOP2013
upgrade uses that commit's 08-big tier as well. The owner-approved
[component LGPL declaration](LGPL_COMPONENT_20261106.md) supplies the preferred
inputs and reconstruction tools; final scientific/release qualification remains separate.

## Exact committed inputs

The current local inputs use VSOP08 and TOP08 plus unchanged normal ELP, reconstructed
from the pinned upstream commit. Total binary-table size is 1,409,249 bytes. These SHA-256 values identify the actual local bytes,
not a claimed upstream release.

| Asset under `crates/solar-ephemeris/data/` | Bytes | SHA-256 |
| --- | ---: | --- |
| `vsop2013.bin` | 729349 | `92182f58432b04d453a6d5c95bc35c20d1521d8eb3a280e51506179d21eb0fd2` |
| `elpmpp02.bin` | 241540 | `9f670b604c7b5189c9d70a1c2ab050672e6e8706aa0ab9b0cae439cb88171347` |
| `top2013.bin` | 438360 | `d2118a80954b5443d9debf14aece0c9e185af1feb2b31c670ac8d9d0849236e8` |

The earlier three-input normal profile totaled 385,509 bytes and matched the
binary-packing commit `63b6cf3a726c2562ab476fb65696fc183624f4ed`. Its VSOP blob
was 84,449 bytes, SHA-256 `9f7a79ea13f97bdc6e6bc28f3078ee0c13abb943fd1838b3754633677ed8ee19`.
The archived [normal source manifest](../tests/fixtures/coefficient-sources-normal-20261103.json)
retains its exact recipe. Immutable Git blob objects at that historical commit are, respectively,
`2093c55abc3d6d3d8705762a567d46ed3838d5cb`,
`91c2c7c3b0fa43341a892222fa9f155c7cea5f83` and
`24f442eff829453761f396899b5abcf2a5c1bb3e`.

## Consumers and local source correspondence

| Family | Recorded historical attribution | Decoder / evaluator | Present structural boundary |
| --- | --- | --- | --- |
| VSOP2013 | ephem.js 08-big tier; historical 06-normal recipe retained | `vsop2013_data.rs` / `vsop2013.rs` | Eight planets including EMB; six orbital-element series |
| ELP-MPP02 | ephem.js normal tier, jpl/DE405 fit | `elpmpp02_data.rs` / `elpmpp02.rs` | Main and perturbation terms plus W0 |
| TOP2013 | ephem.js 08-big tier; historical 06-normal recipe retained | `top2013_data.rs` / `top2013.rs` | Four outer planets, mean motion and six element series |

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

## Recovered upstream correspondence and rebuild path

The earlier normal-profile assets were reconstructed from upstream commit
`2f679a1f698b4f20f9579d94da24af51559458ed`, with exact byte identity to the
then-current tree and `HEAD`. The current profile uses the same commit,
with `src/vsop2013/dist/08-big/src/vsop2013.js` replacing the original VSOP input.
Its 2,672,670 original bytes have SHA-256
`a279a77a29bf958cab3a0f6b9804fe472fbd6a6b9841a1b5a52f906c9561649e`
and Git blob `6bc7eff394ba1a148d03a3301ee0f69defd2942b`. The
[source manifest](../tools/ephemeris-data/coefficient-sources.json) also identifies
`src/top2013/dist/08-big/src/top2013.js`: 2,370,905 original bytes, SHA-256
`c75e7f713d7e5b1bea1278efeb62b06236098754c6db49717700ae61b6f5ab15`,
Git blob `e44c705f4f569db31211c6fead7bf3a56c050c6c`. It pins original
sizes, Git blob IDs and SHA-256 values, the root upstream license file, the
existing lunar initializer and all three output identities. The complete
[recovery report](COEFFICIENT_RECOVERY_20261103.md) records acquisition and runtime
scope. It does not prove which download was used by the original author.

The supported offline command is:

```text
python tools/rebuild_coefficients.py --profile current --source-dir crates/solar-ephemeris/rebuild/upstream --out-dir build/NEW-coefficient-rebuild
```

It requires the four exact upstream files already present locally, installed
Node/TypeScript development tooling and Python. It never downloads or installs
anything. Static AST extraction reads numeric literals without executing the
upstream JavaScript. The hash-bound existing lunar initializer runs against
generated numeric-only input. Explicit little-endian serializers must reproduce
the pinned and actually shipped bytes exactly. Output is confined to a new
directory under `build/`, with no replacement of existing data. `report.json`
is the final completion marker; a failed write may retain an incomplete new
directory. Ordinary builds continue to consume the shipped blobs unchanged.

The current preferred original inputs and notices are delivered under
`crates/solar-ephemeris/rebuild/upstream/`; the component includes exact copies of
the reconstruction tools. A clean source checkout with the existing locked
development tooling can reconstruct all three tables offline. Historical
acquisition and normal-profile outputs remain separate. Source correspondence
does not establish platform, physical accuracy or release acceptance.

## Historical extraction limitations

The older audit correctly recorded these limitations of the former toolchain:

- The original download-named `vsop2013_normal.js`, `elpmpp02_normal.js` and
  `top2013_normal.js` inputs were absent. Matching upstream normal-tier source
  bytes are now pinned and retained separately; original acquisition history
  remains unknown.
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

Do not run the legacy generators against current decoder paths. Use the bounded
rebuild command above. The local recovery supplies a tested serializer and exact
source/output correspondence; independent scientific and cross-platform
qualification remain separate. No parity threshold was relaxed.

## Notice and scientific evidence boundaries

The earlier generated TOP2013 comment called ephem.js MIT-licensed. The actual
[upstream root LICENSE at the matching commit](https://github.com/THRASTRO/ephem.js/blob/2f679a1f698b4f20f9579d94da24af51559458ed/LICENSE)
contains GNU Lesser General Public License version 3. The archived source files
also retain Marcel Greter's copyright headers. No supporting MIT notice was found
in these inspected files. The legacy generator's unsupported MIT label was removed;
historical Git objects were preserved.

The project `LICENSE-MIT` and `LICENSE-APACHE` files were not changed. Upstream
data/code notice applicability and distribution/package correspondence require
review; an exact numeric reconstruction does not settle them. The original
notice is acquired and hash-bound. The owner authorized the component-LGPL
proposal; the component declaration, preferred inputs and corresponding-source
packaging implement that scope. Publication is still held. These source and
engineering checks are not a legal determination.

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
  generator/source/output hashes. The [native moon report](CANONICAL_MOON_20261103.md)
  records the later reviewed qualification of that separate exact-image contract.
  Its scope is major moons only; it does not cover these binary theory tables.
- Solar fixtures are model-generated examples, not immutable independent observations.
  Reproducibility of those fixtures is distinct from physical calibration.

## Recheck without mutation or network

```powershell
Get-FileHash crates/solar-ephemeris/data/vsop2013.bin,crates/solar-ephemeris/data/elpmpp02.bin,crates/solar-ephemeris/data/top2013.bin -Algorithm SHA256
git diff 63b6cf3a726c2562ab476fb65696fc183624f4ed -- crates/solar-ephemeris/data/vsop2013.bin crates/solar-ephemeris/data/elpmpp02.bin crates/solar-ephemeris/data/top2013.bin
git ls-tree 63b6cf3a726c2562ab476fb65696fc183624f4ed crates/solar-ephemeris/data/
git ls-tree 0d125c53ce0cc08eefa6c053b7034d93110e2c9c crates/solar-ephemeris/src/
```

Review file identity and provenance changes together. No command above authorizes
coefficient replacement, external refresh, commit, registry publication or deployment.
