# Native canonical moon generation — 2026-11-03

Canonical generation of the **current moon assets is qualified** for the exact
existing Linux/amd64 CPython 3.12.12 image and source/model/output hashes. Two
fresh containers reproduced both authoritative modules and passed all 11,985
held-out checks. An [independent read-only review](CANONICAL_MOON_REVIEW_20261103.md)
verified the complete passing chain before metadata promotion.

Requirements: `SOL-SCI-001`, `SOL-TEST-001`, `SOL-REL-001`.

## Environment and acquisition

The user authorized VM validation on Google Cloud. The execution host was a
native Linux x86_64 Google Cloud Shell VM with an amd64 Docker daemon. No paid
Compute Engine instance, new Cloud API credential grant or production setting
was required. The host's Python version was not used as the canonical runtime.

The selected image remains `python:3.12.12-slim-bookworm`, architecture-specific
manifest digest
`sha256:2986c55feb36e6cae00fa1fefb454283e4b33f35e75ff8bdd123b134130be301`.
Docker Hub and mirror pulls on the VM timed out on a large layer. Direct manifest
and range probes succeeded but exposed a slow transfer. The exact image was
therefore downloaded by the local ARM64 WSL Docker daemon **for transport only**,
saved as an OCI archive and uploaded to the native VM. It was never executed on
ARM as qualification evidence.

The 45,438,464-byte archive SHA-256 was
`a6b7a59930e3ebb097ea3306907265c2563ed74ff68ed42ccb8888e916492b62`.
The VM verified that hash, the embedded manifest digest and every configuration/
layer blob's size and SHA-256 before loading. Registering the exact digest then
completed without a large transfer. Docker inspection confirmed Linux/amd64,
the exact image ID and matching repository digest. This uses the existing image
bytes, without a tag replacement or locally rebuilt interpreter.

## Source correspondence and actual results

Only ten public input files were mounted. Nine originated from immutable base
revision `3a55a795767f3043112673ea561cdaf6dc7e2d0f`, with the validator's reviewed
two-line optional-argument plumbing applied; the current collector was embedded
in the launcher. All resulting hashes matched the actual local working tree.
This is correspondence to those ten hashes, not a claim that the dirty checkout
is identical to its base commit or a hosted candidate.

Each fresh container used a read-only root/input mount, no network, two CPUs,
1 GiB memory, 128 PIDs, dropped capabilities and no new privileges. The collector
generated outputs in memory, invoked the full validator and verified unchanged
input hashes. Both completed before `2026-11-04T00:56:26.524322+00:00` UTC
(November 3 local time).

| Measurement | Both native runs |
| --- | --- |
| Observed runtime | Linux x86_64 CPython 3.12.12 |
| Source hashes before/after | all ten equal |
| `moons.js` SHA-256 | `0fe13220d6214d62a6b472f5cc8e2ccb2f8fbfaeb7eb1d5e611b40c272a90f51` |
| `moonelements.js` SHA-256 | `e1dfc8d737bf92c96cc132756c7e13e0c6bb9a6c49b86654996bb472112be05f` |
| Compared moons / vectors | 21 / 11,985 |
| Worst angular error | 0.1384 degrees, Nereid |
| Worst radial error | 0.1893%, Enceladus |
| Required limits | unchanged: 0.15 degrees / 0.25%, at least 100 checks per moon |
| Numerical and comparison exits | 0 / passed |
| Container stderr | empty |

The retained [fixture manifest](../tests/fixtures/canonical-moon-20261103/manifest.json)
SHA-256 is `39fe209aa50d9c10cb12b628dd55609c2dbcfcefbdc4ada7a8ef4311d14f8e6a`.
It binds 12 byte-exact files: original pending manifest, raw reports, native
metadata, acquisition record, actual launchers and passing-chain logs. The
31,577 bytes exclude the large runtime image and unrelated home-directory data.
The original report hashes and review scope are in the linked review record.

## Qualification, enforcement and limits

The generation manifest now records `qualified`, two identical runs and this
reviewed evidence path. Its generator/model/source/serialization/output and
numerical-budget fields did not change. The original pending input manifest
and pending/granted-false reports remain preserved exactly as captured.
The collector itself never promotes qualification.

CI's two required pinned-image jobs run the complete source/output/numerical
comparison and require recorded qualified status. The duplicate uncontrolled
host regeneration was removed from the web job; both full native checks remain
mandatory release-gate dependencies and authoritative publication job identities.
This prevents host libm drift from acting as canonical evidence and prevents a
future pending reset from passing the strict CI gate. Hosted execution is still
unperformed for this uncommitted tree.

Two further fresh native containers passed strict post-promotion validation of
the final manifest, SHA-256
`1a4ed85e02723db602439078a46a7b0fc754926004809fe6b70be5153454329a`.
The collector invoked `validate_moons.py --require-canonical` in each run. Both
reports retain qualified status, comparison success, numerical exit 0, all ten
current input hashes and empty stderr, with the same 21 moons, 11,985 checks
and unchanged maxima. Neither log has a noncanonical warning. The CI status
admission condition also passed. Both completed by
`2026-11-04T01:12:29.875471+00:00` UTC.

The separate [strict fixture](../tests/fixtures/canonical-moon-20261103/strict/manifest.json)
binds eight byte-exact files (17,193 bytes), including the final manifest,
reports, actual strict launcher and log. Its inventory SHA-256 is
`7b1fcfe5bd760bef23735a66df8226ac9defe5822022564153aa12e5d187cd8a`.
Report SHA-256 values are
`1975268bd3161cb12ced68ccf1652b0e24660c41ae96a16b9be70760523bcaf7`
and `725f3a5d6637d0bbe63dd9507aa1e3bd0bbc39236c9bae9ad15660bc2f50b8b8`.
The original two pending runs remain the reviewed qualification evidence; these
two later runs verify strict behavior after the metadata change.

Regression tests bind both inventories to their raw bytes and corresponding
source/manifest hashes. Pending-state tests now supply an explicit pending
fixture, so their behavior does not depend on repository qualification or host.
The actual Python admission block extracted from CI is tested with a qualified
success, pending status, failed comparison, numeric `1` and missing status;
only the genuine qualified boolean success passes. No YAML parser dependency
was added to the tests.

The final independent review caught a Windows checkout portability issue in
hash-bound logs. The fixture tree now has `-text` in `.gitattributes`, preserving
raw bytes instead of applying automatic CRLF conversion. A read-only
`core.autocrlf=true` checkout-filter simulation preserved bytes for all 22
fixture paths; focused integrity tests passed again. Final review reported no
remaining actionable findings and also verified the Rust coverage receipt.

Final local validation passed **554 Python tool tests**, the **12 focused moon/
evidence/CI tests**, **eight generator tests** and **27 release-policy tests**.
The fresh configured Python coverage checkpoint passed at **91%** across 550
tool tests and 39 provider tests; the four later additions test evidence and CI
contracts and do not change production Python source. The selected include list
and 90% threshold were preserved. Local coverage.py is 7.13.5 versus CI's 7.15.2.
Syntax checks, YAML parsing (13 jobs), SDLC (27 requirements), documentation
(165 Markdown files) and `git diff --check` also passed.

A real final input snapshot from `collect_moon_evidence.py --snapshot` matched
all ten strict VM hashes. A read-only strict check on the actual Windows ARM64
host was correctly refused with exit 2 and preserved both authoritative hashes.
The source-bound [local Rust gate](RUST_COVERAGE_20261103.md) separately passed
at 95.32% with all 196 tests. Hosted execution and other platform qualification
remain unperformed for this tree.

```text
python -m unittest discover -s tests/python -p test_canonical_moon_evidence.py -v
python -m unittest discover -s tests/python -p test_moon_generation.py -v
python -m unittest discover -s tests/python -p test_release_policy.py -v
python -m unittest discover -s tests/python -p 'test_*.py' -v
python tools/validate_sdlc.py
python tools/validate_docs.py
git diff --check
```

This qualification covers the current generated moon assets and their existing
interpolation envelope. It does not qualify continuous planetary/lunar apparent
place, event timing, other platforms or the complete production release. Windows
ARM64 remains a noncanonical host and must continue to refuse authoritative
generation. Coefficient notice/distribution, manual/platform and release holds
remain in [status](STATUS.md).

Rollback changes the qualification metadata back to pending and reverses only
the reviewed CI/tool/test/doc changes as needed. Preserve authoritative tables,
source CSVs, original raw evidence and the earlier numerical/rendering fixes.
Any source/model/serializer change requires fresh reviewed qualification rather
than reuse of these results. No production deployment or publication ran.
