# Coefficient Recovery Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. No commit or push is authorized.

**Goal:** Reconstruct all three shipped coefficient blobs from exact immutable upstream files without modifying production data or asserting distribution clearance.

**Architecture:** Pin original upstream file bytes and source identities in a manifest. Extract only numeric literal data with the installed TypeScript parser; initialize lunar coefficients using the existing, hash-bound helper and generated numeric-only input. Serialize explicit little-endian formats in Python, require exact shipped output identity, and reserve a new ignored build directory without replacement. Write the completion report last; I/O failures may retain an incomplete diagnostic directory.

**Tech Stack:** Python standard library; installed Node and TypeScript development tooling; existing lunar initializer. No dependency installation or network in the rebuild command.

## Files and validation

- `tools/ephemeris-data/coefficient-sources.json`: upstream source and shipped output identities, original notice and lunar-helper identity.
- `tools/ephemeris-data/extract_coefficient_literals.mjs`: bounded static AST extraction, never execution of upstream JavaScript.
- `tools/rebuild_coefficients.py`: validated serializers, offline orchestration, exact identity and output-path guards.
- `tests/python/test_coefficient_recovery.py`: malformed numeric/shape/boundary tests, static-code refusal and no-execution tests, source/path failure tests.
- Existing provenance/ephemeris-data/status docs and a recovery report: exact commands, two-run measurements, runtime scope and separate licensing/scientific holds.

## Tasks

- [x] Write focused failing tests for serializer correctness, malformed data, static extraction and unsafe paths; run and observe failures.
- [x] Implement the smallest complete offline extraction/rebuild path; run focused tests and compile checks.
- [x] Rebuild twice into separate build roots from the archived immutable input; compare every output byte with shipped data and each other. Prove original blobs/WASM stay unchanged.
- [x] Run Python regression/static/docs checks and obtain independent read-only review. Record the upstream LGPL notice discrepancy without changing project licensing or clearing distribution.
