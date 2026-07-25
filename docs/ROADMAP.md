# Roadmap

## v0.2.0 Published ephemeris + real star catalogue — shipped 2026-07-20

- Publish `solar-ephemeris` to crates.io (0.1.1 first release, 0.2.0 current) via a
  scheduled, guarded `publish-crate.yml`
- Replace every procedural/hand-written star list with the naked-eye Hipparcos catalogue
  (8,867 stars) behind the Solar-System and Milky-Way views, generated deterministically
  from committed sources and gated in CI
- Extend the on-device engine catalogue 26 → 108 bright stars with real proper motion
- Add the light-year-scale Solar neighbourhood view (true parallax 3-D positions)
- Lazy-load the catalogue so first paint of the Sun / My Sky surfaces is unaffected
- Docs CI: offline Markdown link/badge/style gate on every PR, weekly external-link check

## v0.1 CPU reference

- Deterministic state model
- Differential rotation
- Bipolar active-region generator
- Reduced flux transport
- Assimilation primitive
- Rust tests
- Python image prototype

## v0.1.2 Research + learning app

- Import v0.1.1 baseline into the git repo
- Add versioned JSON snapshot and observation contracts
- Add `simulate`, `ingest swpc`, and `replay` CLI surfaces
- Add static progressive-disclosure web app
- Add deterministic web fixture, tutorial notebook, and experiment notebook
- Add explicit public-data cache helper with fixture fallback

## v0.2 GPU compute

- wgpu buffers
- rotate/diffuse/decay kernels
- CPU vs GPU parity tests
- responsive renderer

## v0.3 Assimilation engine

- ObservationFrame schema
- source freshness/confidence model
- active-region matcher
- HMI/continuum blend
- flare timeline correction

## v0.4 Real adapters

- SWPC cycle adapter
- SWPC SRS parser
- GOES XRS adapter
- Helioviewer HMI/AIA adapter
- JSOC/SunPy bridge

## v0.5 ML/NPU

- ONNX Runtime abstraction
- CoreML / DirectML / Windows ML / OpenVINO providers
- active-region detector
- flare/CME surrogate scorer


## v0.1.1 - SWPC schema-hardening patch

- Add `docs/SWPC_SCHEMA_CHANGE_2026_03_31.md`.
- Add canonical RTSW replacement endpoint constants.
- Add deprecated RTSW endpoint mapping rules.
- Add field-name mapping for RTSW wind/plasma and magnetometer products.
- Require adapter tests for quoted legacy numerics and new numeric JSON values.
- Require local retention for 3-day and 7-day solar-wind windows.
