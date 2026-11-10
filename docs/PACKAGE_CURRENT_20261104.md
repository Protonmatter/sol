# Current standalone crate verification — 2026-11-04

The current dirty working-tree `solar-ephemeris` package builds, passes all 72
standalone all-target tests and generates its library/binary API documentation.
The new seasonal reference is present. This supersedes the historical 37-file
inventory for current package-content facts; it does not clear publication or
upstream notice correspondence.

## Actual package contents

The retained archive is
`build/package-seasonal-20261104/target/package/solar-ephemeris-0.2.0.crate`:
39 ordinary files, 1,312,669 compressed bytes and 2,083,389 uncompressed bytes.
SHA-256 is
`4aa19cdf30b0cf930ad545270d179f9ee3c3df9c1cbe93bf6a3908d241fd050f`.

All 35 direct source files match the current checkout. `Cargo.toml.orig` matches
the owning manifest exactly. Cargo's normalized manifest resolves inherited
version, edition, license, repository and Rust floor, preserves the library,
binary and four example targets, and keeps zero external dependencies. The
standalone lock contains only this package. All 15 literal `include_str!` and
`include_bytes!` paths resolve within the archive and match their owning bytes.

The archive retains the original MIT and Apache project license files. Its README
mentions the upstream LGPL provenance; the complete retained upstream notice text
is absent, as previously recorded. Those are file facts, not a legal conclusion.
The [notice proposal and unresolved distribution decision](PACKAGE_NOTICE_AUDIT_20261104.md)
remain unchanged outside the product package. No licensing declaration or
publication policy was changed.

VCS metadata records base commit
`3a55a795767f3043112673ea561cdaf6dc7e2d0f` with `dirty:true`. It does not identify
this uncommitted candidate as an exact clean release source.

## Executed checks

From the repository root, using the qualification Rust 1.96.0 compiler, existing
dependency cache, two build/test threads and new task-local output directories:

```text
cargo package --list --locked --offline --allow-dirty -p solar-ephemeris
cargo package --locked --offline --allow-dirty -p solar-ephemeris --target-dir build/package-seasonal-20261104/target
cargo test --manifest-path build/package-seasonal-20261104/target/package/solar-ephemeris-0.2.0/Cargo.toml --all-targets --locked --offline --target-dir build/package-seasonal-20261104/standalone-target -- --test-threads=2
cargo doc --manifest-path build/package-seasonal-20261104/target/package/solar-ephemeris-0.2.0/Cargo.toml --no-deps --locked --offline --target-dir build/package-seasonal-20261104/standalone-target
```

All commands return zero. Cargo's package command compiles its own extracted
archive. The subsequent tests run from that actual extracted package rather than
the workspace source. All 72 tests pass, with zero failures/ignored tests. API
documentation builds without warnings. This command set does not run doctests or
validate every relative prose link. Owning source hashes remain unchanged.

The full command, source and file inventory receipt is
`build/package-seasonal-20261104/receipt.json`, SHA-256
`a10815b829cf14de236d98211edeb807eea8795fd05bbcfad51bafbb0d6930d4`.

Independent read-only review streams the original archive, verifies safe paths,
all member hashes, normalized/original manifests, source and literal-include
correspondence, VCS/lock metadata and actual test/documentation records. It finds
no scoped P0–P2 inventory, code or build-record defect. Review receipt:
`c14654b7626a9a35125a12d58a8741d7a2844885330ceee15c9f431800c38e8f`.
The reviewer does not rerun Cargo or issue a legal/publication approval.

## Limits and rollback

The check qualifies this local diagnostic package, not the public registry's
existing crate, a clean committed candidate, a new MSRV/WASM/platform build,
hosted CI, licensing or publication. Independent scientific accuracy and release
requirements remain separate. No application, coefficient, runtime source,
dependency, credential, registry, commit, push or deployment changed.

Preserve the historical archive and this current archive separately. Rollback is
selection of evidence/documentation; no deployed state needs restoration. Repeat
with new output paths after a package-input change. Never overwrite an old
archive or use its dirty base SHA as proof of a new source identity.
