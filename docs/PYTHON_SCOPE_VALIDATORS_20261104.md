# Python scope and scientific validator hardening — 2026-11-04

The production-readiness goal remains active. This follow-up repairs scientific
validation and report-publication defects, reconciles the Python coverage scope,
and refreshes the canonical moon evidence for the corrected sources. It changes
no orbital or rendering algorithm, reference values, numerical budgets, runtime
dependency, licensing or production infrastructure. The working tree remains
uncommitted at base `3a55a795767f3043112673ea561cdaf6dc7e2d0f`.

## Verified defects and corrections

| Severity | File / symbol | Reproduction and impact | Correction and validation |
| --- | --- | --- | --- |
| P1 | `tools/validate_moons.py`, `main` | A single Phobos reference x value changed to NaN still returned success and counted all 11,985 samples. A corrupt reference could therefore receive a passing accuracy result. | Reject malformed/nonfinite epochs and vectors, incorrect body codes, duplicate body/epoch pairs, invalid model norms and nonfinite comparisons before counting a sample. Dedicated tests exercise actual retained vectors and numerical failure cases. Four fresh native canonical runs each pass the unchanged 11,985-check corpus. |
| P1 | `.github/workflows/coverage.yml`, Python include list | The previous 26-module denominator omitted 16 affected production modules. A passing percentage did not cover the full affected Python surface. | Declare the 42-module union, add its six local import dependencies and the new shared output guard: 49 governed modules. Preserve the 90% aggregate statement/branch floor. Pin all 37 unchanged legacy exclusions by hash and require complete inventory/import closure. |
| P1 | `tools/validate_ranges.py`, `main` | An existing report sentinel was overwritten by a successful validation. Source or authoritative evidence paths were not protected. | Share fresh-output admission with the apparent/vector CLIs, serialize finite JSON before opening, recheck after calculation and directory creation, and use exclusive file creation. Adversarial tests and independent Windows junction/hardlink controls preserve existing files. |
| P2 | `tools/generate_moons.py`, `build_moons_module` | The physical-parameter CSV remained open until garbage collection. The actual generator emitted a ResourceWarning. | Eagerly create the same dictionary within a context manager. Before/after Windows bytes are identical; actual native pinned-image generation remains identical to both authoritative outputs. |
| P2 | `tools/validate_ephemeris.py`, `fetch_with_retry` | The consumed HTTP response remained open after a successful read or a Unicode decoding failure. Both new ownership tests failed before the correction. | Consume the response in a context manager. Seven focused tests pass, including unchanged bounded transient retries, immediate permanent failure, exhausted attempts, native schema checking and binary selection. |

The moon-vector limits remain 0.15 degrees angular error, 0.25% radial error,
at least 100 distinct held-out samples per moon and 11,985 total comparisons
across 21 moons. Source CSVs, interpolation and generated asset bytes are unchanged.
Numerical unit tests isolate generator I/O explicitly; their mocked process
boundary does not establish canonical execution. The separate native packet does.

## Governed Python scope

`tools/python_coverage_scope.json` inventories all 86 non-test Python sources
under the two governed production roots. It declares 49 covered modules and 37
unchanged legacy exclusions with an explicit reason and exact SHA-256 per file.
A new file, changed exclusion, overlap, missing module or missing static local
import dependency fails the SDLC contract. The import audit handles bare,
qualified, relative, package and `from` alias forms; dynamic/path-loaded imports
still require engineering review.

`validate_sdlc.py` binds the actual unconditional Python job's test, report and
XML commands to the manifest and 90% floor. Literal decoys, duplicate workflow
keys and advisory/conditional coverage steps cannot satisfy the contract. Both
workflow include lists contain the exact same 49 sorted modules.

The scope audit preserved its failing observations. The original 42-module
re-report was 87.548463%; adding the six import dependencies gave 85.922795% on
that retained historical data. A fresh 49-module run passed 692 repository and
39 provider tests but measured 89.081944%, below the required floor. These are
failed coverage measurements and are not relabeled after later tests are added.

The final current-source run passes 710 repository and 39 provider tests.
Aggregate coverage is 90.115824%: 8,040 of 8,684 statements and 3,475 of 4,094
branches. Its 49 governed production modules and captured test sources remain
byte-identical before/after execution. The result is recorded separately under
`coverage/governed49-final-python-20261104*`; the receipt SHA-256 is
`e245e5e12a75d70d08745dc921291614b48f1ddaa442fe1f54bfb8eb046dee6f`.
Local execution uses Windows ARM64 CPython 3.14.3 and coverage.py 7.13.5.
CI's pinned coverage.py 7.15.2 and hosted environment remain separate.

Additional adversarial tests cover actual snapshot cross-field/provenance
checks, raw-reference UTC chronology, both pre-read and post-read byte budgets,
source attribution, numerical orchestration, unsafe report publication and CLI
failure statuses. Tests do not substitute echoed reference values for independent
scientific accuracy evidence.

Independent read-only reviews close the moon-intake, coverage import/workflow,
shared publication and canonical migration paths. The final transport/test review
finds no actionable P0–P2 issue; it independently passes 26 focused tests with
ResourceWarning promoted to an error and three additional read/retry lifecycle
controls. Its receipt is `build/validator-final-review-20261104/receipt.json`,
SHA-256 `8ed37369e513a4a19ef908eab9216a0bb21f4c8e7482e3c4b53b2d4fdc9daabc`.
The native mock proves argument forwarding/schema version only; it does not
correlate the fixture's returned observer/epoch to a native calculation.

## Scientific report publication

The `--report` argument of `validate_ranges.py`, `validate_apparent.py` and
`validate_vectors.py` now requires a new ordinary file strictly below this
checkout's unredirected `build/` or `coverage/` directory. Existing destinations,
source paths, reserved output roots and redirects outside the permitted roots
are rejected. The shared `validation_output.py` rechecks the destination after
calculation and directory creation, rejects nonfinite JSON and creates the file
exclusively. Numerical results and comparison budgets are unchanged.

This is an intentional CLI safety restriction. Use a unique output name for
each run. It is not a general filesystem transaction against an arbitrary hostile
process; a disk failure during a write may leave a fresh partial file. Preserve
that failure artifact and select a new path for a retry. No existing evidence
file is a valid retry destination.

The apparent, vector and precision-window validation fingerprints include the
shared output guard. A fresh offline precision replay at
`build/coverage-scope-20261104/model-current-final/summary.json` passes all
109,900 comparisons at 3,925 declared model epochs with no failures. It binds
the current model, validator and raw-reference hashes. This remains sampled
model characterization rather than a continuous physical/observer guarantee.
The summary SHA-256 is
`f4376cfebcf9673e58ef705e70b82c967fc929907a1e704444efa47f364dbd99`.
Its complete comparison CSV remains byte-identical to the preceding numerical
replay, SHA-256 `2e3838d2eb05f623554404522674211f0bc359c6e7f5c2795036b811a4aa83a5`.

## Canonical evidence renewal

The [canonical source refresh](CANONICAL_MOON_REFRESH_20261104.md) preserves
two pending and two strict native Linux x86_64 runs in the exact pinned
CPython 3.12.12 image. Each run reproduces both authoritative files and passes
all 11,985 held-out checks. Independent reviews verify image identity, launch
restrictions, current source correspondence, outputs and owned-container cleanup.

The new fixture ledger is
`tests/fixtures/canonical-moon-20261104/manifest.json`, SHA-256
`928ac603fe151395c63a9c5edead4506a73c0cdb2b29d24c1c70f1cd91400229`.
The current qualified generation manifest is SHA-256
`e994a31d8043bc33ff640b01825bdf2ceed75970073ff6df46bcb257785e4dcb`.
The historical packet remains immutable and retains unconditional integrity tests.
Current source binding selects only a known exact packet; unknown evidence IDs,
source drift and altered old raw evidence fail closed.

## Reproduction and operational scope

These checks require no credentials or production access. Use the existing
repository Python, Node and offline Rust tools. Generated reports go to fresh
ignored output paths. In a shell with the same environment as CI, the governed
Python sequence is:

```sh
export PYTHONPATH=tools
scope=$(python -c "import json; print(','.join(json.load(open('tools/python_coverage_scope.json'))['modules']))")
python -m coverage run --branch --source=services/ephemeris-server,tools -m unittest discover -s services/ephemeris-server -p 'test_*.py' -v
python -m coverage run --branch --append --source=services/ephemeris-server,tools -m unittest discover -s tests/python -p 'test_*.py' -v
python -m coverage report --include="$scope" --fail-under=90 --show-missing
python -m coverage xml --include="$scope"
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_precision_window.py --out-dir build/NEW-precision-model
```

Coverage run/report commands return nonzero on failure; a report below the floor
returns 2. Validator CLIs return 0 only for admitted passing comparisons and
nonzero for invalid input, numerical failure or publication errors. Argument
parser failures retain their standard exit 2. On noncanonical Windows, the real
moon CLI continues to reject the known generated-byte difference; do not replace
the authoritative assets to obtain a Windows pass. Execute its strict canonical
check only in the pinned native Linux image as described in the generation runbook.

Rollback must keep each source/manifest/evidence set consistent. Preserve all
raw packets and failed receipts. Reverting a validator without its source-bound
canonical metadata invalidates correspondence. The fresh-output restriction can
be reverted with its callers/helper/tests, but doing so reintroduces the verified
overwrite defect. Do not discard unrelated uncommitted engineering work.

## Remaining holds

This follow-up does not establish a production accuracy guarantee for every
instant in 1900–2200. Full-span Earth rotation, continuous/held-out observer and
event behavior, visibility assumptions and years 1–9999 approximation limits
remain explicit. It adds no new staged browser/GPU or manual accessibility
result. Full platform acceptance, exact-source hosted CI, package notice and
distribution correspondence, release approval and deployment remain open.
