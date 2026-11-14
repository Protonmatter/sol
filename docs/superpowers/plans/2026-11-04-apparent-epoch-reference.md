# Apparent-coordinate epoch reference

Measure geocentric apparent direction at matching TT instants across the
supported calendar before changing coordinate algorithms. The original
production-readiness goal and full calendar remain in scope. This step adds
independent evidence; it does not qualify a continuous interval or physical
future observing times.

Affected files: new raw/derived fixtures, `tools/horizons_apparent.py`,
`tools/validate_apparent.py`, `tests/python/test_horizons_apparent.py`, native
`examples/apparent_places.rs`, Git raw-byte attributes and relevant docs.
Risk: low for product behavior (no runtime formulas change), medium for
scientific conclusions if reference/frame/time identity is mishandled.

- [x] Freeze the matrix and budgets before acquiring raw reference bytes.
- [x] Retain bounded raw responses and exact query/provenance identities.
- [x] Implement strict network-free admission and a native snapshot observer.
- [x] Add admission, numerical and report-path negative controls.
- [x] Measure all 144 cases and preserve every pass/failure at fixed budgets.
- [x] Independently review reference comparability and any diagnosed cause.
- [x] Verify Rust/Python/static/doc checks and byte identities as appropriate;
  document findings and the next production correction indicated by evidence.

Expected commands: targeted/full Python unittest discovery, `cargo test
--workspace --locked --offline`, formatting/clippy, the actual offline apparent
validator, `tools/validate_docs.py`, `tools/validate_sdlc.py`, `git diff --check`.
An independently failed scientific matrix must remain a failed CLI result.
