# Qualification compiler policy implementation plan

**Goal:** Make the documented Rust qualification compiler reproducible locally
and in CI, and reject mismatched actual compiler provenance.

**Scope:** Root `rust-toolchain.toml`; existing CI, ephemeris, package and fuzz
toolchain selections; release/SDLC validation; numerical receipt input hashes;
focused regression tests and build/delivery documentation. Risk is medium:
workflow/evidence admission changes can deliberately reject stale candidates.
No numerical formulas, runtime interfaces, dependencies or publication authority
change.

## Tasks and validation

- [x] Reproduce omitted compiler inputs selecting floating stable despite a pinned installer action.
- [x] Add red controls for local/workflow/runtime version drift.
- [x] Select released 1.96.0 for qualification, retain explicit nightly fuzzing, and enforce exact runtime provenance.
- [x] Include the root policy in precision/vector/apparent source inventories and the copied observation workspace.
- [x] Close the independently found named/id-first step bypass; require real action inputs and reject unsupported syntax.
- [x] Pass seven compiler-policy tests, existing SDLC/release tests and source-policy validation.
- [x] Rebuild both WASM engines and replay all 109,900 independent comparisons with the named compiler.
- [x] Refresh the full governed Python coverage run and documentation/whitespace gates.
- [x] Complete source-bound rendering of the separately built Linux artifacts and record final evidence.

Use existing `unittest` discovery, `python tools/validate_sdlc.py`,
`python tools/validate_docs.py`, `python tools/build_wasm.py`, the full precision
validator and existing staged rendering commands. Keep the CI-selected coverage
denominator and 90 percent floor unchanged. Independent read-only review is
required before claiming this bounded change verified. Roll back policy,
workflow selection and admission checks together; retain failed evidence.
