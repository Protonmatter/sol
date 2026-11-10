# Coefficient recovery — 2026-11-03

Status: exact source-to-blob reconstruction verified locally; distribution and
independent scientific qualification remain held. Requirements: `SOL-SCI-001`,
`SOL-TEST-001`. Base revision is `3a55a795767f3043112673ea561cdaf6dc7e2d0f`;
changes are uncommitted. No production coefficient or renderer was replaced.

## Recovered correspondence

The earlier [provenance audit](COEFFICIENT_PROVENANCE.md) could identify the
shipped binary tables and historical Rust literals, but lacked immutable upstream
inputs and a working binary serializer. The older local checkout retains the
historical literal commit `0d125c53ce0cc08eefa6c053b7034d93110e2c9c`; it was read
without modifying that checkout. The new reconstruction uses matching upstream
normal-tier inputs directly and does not depend on those historical literals.

The [upstream commit](https://github.com/THRASTRO/ephem.js/commit/2f679a1f698b4f20f9579d94da24af51559458ed)
contains the three original source files listed in the
[source manifest](../tools/ephemeris-data/coefficient-sources.json). Read-only
repository metadata identified their Git blob objects. The exact immutable raw
files were archived from 2026-11-03 22:52:49.053578 through 22:52:50.010161 UTC.
All four files passed byte-count, SHA-256 and Git blob SHA-1 verification before
use. The three source files total 918,137 bytes; the upstream root license is
7,651 bytes. These are a matching immutable source set, not proof of the original
author's download URL, acquisition date or selected minified/unminified file.

| Original input | Bytes | SHA-256 |
| --- | ---: | --- |
| VSOP2013 normal source | 339,368 | `59c1175fb832c4b30a7f7f4d52b6cf634f19a9b42569516c200ea3b41a7c3a3e` |
| ELP-MPP02 normal source | 249,010 | `50a7daaeeda8d4a0980b2bce98f639279a88e6ea2e9fa3d0162afd5acc604056` |
| TOP2013 normal source | 329,759 | `6b096996b7959c34c74a99e8c56cf05dc7fd0d6d3cb0ec97af247e2ed4069cf8` |
| Upstream root LICENSE | 7,651 | `da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768` |

## Supported offline path

`tools/rebuild_coefficients.py` requires installed Python and the existing
Node/TypeScript development tooling. It performs no network calls or dependency
installation. Its input directory must contain the four exact manifest-named
files. The command verifies the complete source matrix, byte budgets and hashes,
then freezes the original bytes before extraction.

The static TypeScript AST reader accepts only literal coefficient data; it never
executes upstream JavaScript. Missing/duplicate bodies, callable expressions,
nonfinite values, string coefficients and inconsistent mean-motion inputs fail.
The existing hash-bound `dump_elp.js` initializer runs against a generated
numeric-only registration. Its verified bytes and the extractor are frozen too,
so changing original source/helper files after admission cannot change execution.
The initializer's existing float64 arithmetic is preserved.

Explicit Python serializers reproduce the decoder's little-endian widths and
ordering. They reject nonfinite/boolean values, malformed term shapes, invalid
phase indices, fractional integer fields and encoding overflow. TOP's unused
source period is validated but omitted from the original packed representation.
The selected eight VSOP bodies and four TOP bodies retain their original order;
upstream Pluto data is not introduced into these shipped tables.

Every output must match both its pinned hash and actual shipped bytes. The
command refuses production paths, redirected build roots and existing output
directories. Exclusive creation reserves a fresh destination; `report.json` is
written last as the completion marker. A write failure can leave an incomplete
new candidate for diagnosis and never overwrites an existing one. Select a new
output name on retry. No production rollback is required.

## Two-run results and source identity

Two separate supported runs, `qualified-local-1` and `qualified-local-2` under
`build/coefficient-recovery-20261103`, produced byte-identical results. Every
output also matched the working tree and its `HEAD` blob:

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| `vsop2013.bin` | 84,449 | `9f7a79ea13f97bdc6e6bc28f3078ee0c13abb943fd1838b3754633677ed8ee19` |
| `elpmpp02.bin` | 241,540 | `9f670b604c7b5189c9d70a1c2ab050672e6e8706aa0ab9b0cae439cb88171347` |
| `top2013.bin` | 59,520 | `d399838a9cdefde56219e405a2c00c7ebde7aa2d817db91ceb7bb4b4c9d57ce8` |

Total reconstructed data is **385,509 bytes**, with zero changed bytes.
Observed runtime: Windows ARM64, Python 3.14.3, Node 24.18.0. This is local
reconstruction evidence; Linux/macOS execution and cross-platform libm identity
remain unqualified. The lunar initializer uses trigonometric functions, so
cross-platform byte identity must be measured rather than inferred.

The reports bind source manifest SHA-256
`9d53239833db6a5a5de918818f4d752b191907f67818314d19e6c2e8e1371bf2`,
serializer LF-normalized SHA-256
`4bbe07c0c972ffa54bb5abaf91b4f8101e61eecc2739ddb3ab4abc8976e2b629`,
and extractor LF-normalized SHA-256
`ad8c0172d8b21b3c8a8c21a4ffdc0055d2d17da1c4bc1dd5d41c4ce4205ba852`.
The existing lunar initializer LF-normalized SHA-256 remains
`f680ddf0995e9c02677bc1f6010eb21e12b893dccbb6c809714e45e28a3e963a`.

## Notice discrepancy and retained hold

The acquired [upstream root LICENSE](https://github.com/THRASTRO/ephem.js/blob/2f679a1f698b4f20f9579d94da24af51559458ed/LICENSE)
contains GNU LGPL version 3. The source files retain Marcel Greter's copyright
headers. The historical TOP generator's MIT label has no support in the
inspected originals and was removed. The original source/notice files remain
in ignored research/rebuild output; no upstream code was vendored into the app.

Project license files were preserved. Applicability to the coefficients,
initializer/evaluator adaptations and existing/future distribution requires
qualified review. This report establishes factual source and notice identity;
it makes no legal determination and does not clear publication. Reproducible
numbers alone cannot settle that question.

## Validation and reproduction

Eleven focused Python tests passed, including static non-execution, malformed
numerics, exact layouts, complete source metadata, source/helper mutation after
admission, destination races and a synthetic redirected-build-root case. The
redirect fixture tests path policy without claiming an actual Windows junction
or power-loss experiment. Two real supported rebuilds and full byte comparisons
passed. Independent read-only implementation review inspected the actual Rust
decoders and separately corroborated input identities and reconstructed bytes.
The full Python regression suite passed **533 tests**. The 11 focused tests also
passed under `python -O`; Node syntax, Python compile, documentation links/style,
SDLC and diff checks passed. Final independent review found no actionable defects
in the implementation, tests or updated provenance documentation. Existing WASM
artifact hashes were rechecked and retained their previously verified identities;
no fresh rendering claim is inferred from this tooling-only change.

```text
python -m compileall -q tools/rebuild_coefficients.py tests/python/test_coefficient_recovery.py
node --check tools/ephemeris-data/extract_coefficient_literals.mjs
python -m unittest discover -s tests/python -p test_coefficient_recovery.py -v
python -O -m unittest discover -s tests/python -p test_coefficient_recovery.py
python -m unittest discover -s tests/python -p test_*.py -v
python tools/rebuild_coefficients.py --source-dir build/coefficient-recovery-20261103/upstream --out-dir build/coefficient-recovery-20261103/NEW-run-1
python tools/rebuild_coefficients.py --source-dir build/coefficient-recovery-20261103/upstream --out-dir build/coefficient-recovery-20261103/NEW-run-2
python tools/validate_docs.py
python tools/validate_sdlc.py
git diff --check
```

Run from the repository root with previously acquired hash-matching inputs and
new output names. Each completed candidate retains upstream originals/notice,
the source manifest, reconstructed blobs and its report. Acquisition metadata
is retained separately in `build/coefficient-recovery-20261103/acquisition.json`.
The full-suite log is retained in the parent workspace as
`sol-coefficient-python-20261103.log`.
No committed binary, application source, dependency lock, project license, hosted
workflow, deployment or release was changed by this recovery.

Independent continuous orbit/range/event accuracy,
cross-platform/manual qualification and release holds remain in
[status](STATUS.md). This recovery closes the local source-to-blob reproduction
gap for the three analytic tables without broadening their scientific envelope.
The later [Rust coverage follow-up](RUST_COVERAGE_20261103.md) passes the existing
local line gate at 95.32%; it does not qualify hosted CI or distribution notices.
The later [native moon report](CANONICAL_MOON_20261103.md) qualifies the separate
moon-asset generation contract without changing the three analytic tables.
