# Observer validator report preservation — 2026-11-04

The main Horizons validator now rejects unsafe report destinations before binary
selection or reference loading and preserves existing files at publication.
This closes the overwrite class already corrected in the range/apparent/vector
CLIs. Severity: P1; requirements: `SOL-TEST-001`, `SOL-DATA-001`.

## Reproduction and correction

The original command returned 0 after replacing an owned test-only source-path
sentinel with a report. Native I/O was explicitly stubbed and retained references
echoed for that orchestration reproduction; it was not numerical qualification.
Original source, overwritten bytes and nine failing assertions remain under
`build/observer-report-20261104/`.

`tools/validate_ephemeris.py` now uses the existing `validation_output` guard
before work and at publication. `--report` requires a fresh file strictly below
this checkout's unredirected `build/` or `coverage/`. Existing reports, source or
external paths and reserved output roots are rejected. Late-created files are
preserved. Finite JSON is serialized before exclusive creation. Publication errors
return 1 with an actionable message and no final success message.

No-report behavior, numerical/transport helpers, constants, comparison loop and
report fields/schema v2 are preserved. Independent AST review checks those
boundaries. This intentionally restricts report destinations; use a unique output
filename for each run.

## Verification

All eight new CLI safety tests and 11 existing reference tests pass. Independent
review reruns them with ResourceWarning as an error and adds early-rejection,
no-report and real Windows root/parent-junction controls. Review receipt SHA-256:
`23a6ac2bc53464f48cb8770aa71e74c1855a4769bf2f68d19053af5e0735ced1`.

The real rebuilt native CLI passes the unchanged 36-observation matrix. After
the seasonal test addition, it is replayed again with the current binary; the
report remains byte-identical, SHA-256
`9fc178a528bc66348135102e53fa17cee2348b247e518bfbe491869e510b49fe`.
A second real command supplies that existing report and deliberately missing
binary/reference paths. It returns 1 at report preflight and preserves the bytes.

At this fix's checkpoint, 718 repository and 39 provider tests pass with
90.193165% aggregate coverage across 49 modules. The subsequent
[seasonal follow-up](SEASONAL_OBSERVER_20261104.md) separately expands scope to
50 modules and records its full current result. The 90% floor is unchanged.

Current validator SHA-256:
`663a5f0b3b634a7a924e44ef50fb881d5684dddbe20b29ea7c7afb080f3b89fc`.
Current native CLI SHA-256:
`d458e895ff624d4769c87362259f64f12ce82ac383144b1b98757e16bacaf771`.

```text
python -m unittest discover -s tests/python -p test_ephemeris_report_cli.py -v
python -m unittest discover -s tests/python -p test_horizons_reference.py -v
cargo build --release -p solar-ephemeris --bin sky --locked --offline
python tools/validate_ephemeris.py --reference-dir tests/fixtures/horizons-observer-20261103 --report build/NEW-observer-report.json
```

## Limits and rollback

The guard covers cooperative filesystem races, not arbitrary hostile filesystem
transactions. A later disk failure may leave a fresh partial artifact; preserve it
and select a new retry path. The original observations cover four sites on one day,
not continuous accuracy, visibility or historical Earth rotation.

Rollback removes this caller integration and matching tests/docs, reintroducing
the overwrite defect. Preserve prior fixes, raw references and failed receipts.
No dependency, application network path, credentials, licensing, production
setting, commit, push or deployment changed.
