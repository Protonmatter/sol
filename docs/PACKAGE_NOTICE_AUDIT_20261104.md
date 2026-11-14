# Local package and notice inventory — 2026-11-04

An offline diagnostic Cargo package compiles successfully and contains the three
current coefficient outputs, but it remains unsuitable for publication evidence:
the checkout is explicitly dirty, and upstream notice correspondence still needs
review. Project licensing is unchanged. This report records file facts and a
reviewable draft outside the product package; it does not assign rights or clear
redistribution.

Using the qualification Rust 1.96.0 compiler and existing dependency cache:

```text
cargo package --list --locked --offline --allow-dirty -p solar-ephemeris
cargo package --locked --offline --allow-dirty -p solar-ephemeris --target-dir build/package-correspondence-20261104/target
```

Both commands exit0, including Cargo's actual extracted-package compile check.
No registry credential, publication, registry dry run or hosted workflow is used.
The retained archive is
`build/package-correspondence-20261104/target/package/solar-ephemeris-0.2.0.crate`:
1,285,190 bytes,37 files, SHA-256
`a07f27ea598bcba65cfb6b3e3a0e9cb8ee96c4f470d952617947532eddc3996b`.

The complete retained inventory is
`build/package-correspondence-20261104/inspection.json`, SHA-256
`65c25f8747927f0dfec07e2966d80c2fde6736e0430c38e28ddf1025fb3b189b`.
Every coefficient output matches the current pinned source manifest. The package
retains `MIT OR Apache-2.0` metadata and the existing `LICENSE-MIT` and
`LICENSE-APACHE` files. Its README mentions upstream LGPL provenance. The complete
retained upstream root license text is absent from the actual crate archive.

The original upstream file is 7,651 bytes, SHA-256
`da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768`.
The existing [coefficient provenance](COEFFICIENT_PROVENANCE.md) records its source
and reconstruction history. A draft under
`build/package-correspondence-20261104/proposed-notices/` contains:

- A verbatim `LICENSE-EPHEM-JS-LGPL-3.0` copy of that retained upstream file.
- A copy of the current `COEFFICIENT-SOURCES.json` manifest.
- A factual `NOTICE-COEFFICIENTS.md` describing source/output correspondence and
  the unresolved distribution decision.

These files are a proposal only. They have not been included in the crate or
application, and adding them alone would not establish legal sufficiency. The
owner must resolve the accepted distribution terms and package correspondence
before any licensing or package-content change is applied.

The archive's `.cargo_vcs_info.json` records base commit
`3a55a795767f3043112673ea561cdaf6dc7e2d0f` with `dirty:true`.
That marker does not identify the uncommitted candidate as an exact reviewed
release source. The existing package workflow and release tools retain their
publication hold; accepted exact-source CI, digest/content/notice review and
separate publication authority remain required.

This audit modifies documentation only. Rollback is evidence/document selection;
no deployed system or licensing declaration changed. Preserve the archive,
inventory and original upstream file when preparing the later reviewed candidate.

## Source-binding correction — 2026-11-05

A later P2 in `tools/release_crate.py` allowed matching archive/working-copy bytes
to stand in for correspondence with the claimed commit. A changed or uncommitted
source file could pass when the VCS metadata claimed a clean source; workspace
manifest and lock changes were also unbound. Separate intake defects accepted
duplicate metadata keys and raised uncontrolled errors for malformed registry/VCS
objects. The original eight test groups exposed seven failures and eight errors
before correction.

The checker now reads regular file identities from the requested local Git tree,
without optional index locks or lazy fetching, and compares all non-generated
packaged source plus the workspace manifest and lock. It still requires the same
raw working-copy bytes and preserves raw package/member SHA-256 receipts. This
anchors the source footprint rather than trusting the archive's clean marker.
The source tree must be locally available; missing/unsupported Git behavior fails
qualification rather than downloading inputs or changing the repository.

Independent review identified a clean-Windows compatibility issue in the initial
strict implementation: the working lock and two required license files use CRLF
while their Git blobs use LF. The reviewed correction first tries raw identity,
then permits only CRLF-to-LF for those three exact repository-relative paths.
It reports only applied conversions in `source_binding.normalized_paths` and
does not decode, trim, change BOMs/lone CRs, execute Git filters or normalize any
Rust, Cargo manifest, numerical or binary asset. Content changes still fail.
No attributes, lock, license, archive or application bytes are rewritten.

All **18 focused tests** pass, including real read-only Git/Windows file checks,
changed/uncommitted source, workspace input changes, malformed/duplicate JSON,
empty/unsafe source inventories, bounded payloads, and raw versus canonical-text
receipt behavior. The unchanged full Python coverage population also passes:

| Local check | Result |
| --- | --- |
| Server tests |39 passed |
| Python tests |759 passed |
| Covered production modules |51, unchanged |
| Line coverage |92.86191% |
| Aggregate statement-and-branch coverage |90.45524%, unchanged 90% floor passes |
| Package-checker aggregate coverage |93.01310% |

The combined coverage numerator is 11,922 over 13,180; JSON and XML both contain
the exact 51-module population. This does not claim a 90% branch-only or per-module
branch floor. Local Python 3.14.3 / coverage 7.13.5 differs from CI's pinned
Python 3.12 / coverage 7.15.2; no dependency was installed and hosted CI was not run.

The first coverage run's suites and gate passed, but its private result reader
rejected Windows path separators. That run, its exact reviewed source inputs and
the initial compatibility review remain retained. The final fresh run canonicalizes
report paths with duplicate/population rejection; it does not change the measured
population, numerator, floor or workflow.

Independent final review finds no remaining actionable P0–P3 issue. It verifies
the exact three-path policy, 27 additional adversarial assertions, unchanged raw
receipts/publication hold and all final coverage sources, logs, counts and hashes.
Its `final-review.json` SHA-256 is
`7314af703be50f3a6e3fa9efde0741cc5432c60fc2206cc8955facec608b0f2b`.
The parent readback summary SHA-256 is
`09f08cf7fc48214708d7e1ce28a96a794d669053358bddf4c9dabc0d06979a06`.
Evidence is under `build/crate-source-binding-20261105-01/`; the complete final
coverage run is separately under `build/crate-source-binding-20261105-02/`.

```text
python -m compileall -q tools/release_crate.py tests/python/test_release_crate.py
python -m unittest discover -s tests/python -p test_release_crate.py -v
```

The scope remains a normal trusted checkout and the non-generated source footprint.
Cargo-generated manifest/lock derivation, dry-run authority, hostile Git configuration,
registry publication, package notice sufficiency and legal clearance are separate
boundaries. The original diagnostic archive above remains dirty and unqualified;
this code correction does not promote it. Project licensing and the unconditional
publication hold are unchanged. A reverse-checked two-file patch preserves rollback
without resetting unrelated work; it has not been applied.
