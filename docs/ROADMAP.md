# Roadmap

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
