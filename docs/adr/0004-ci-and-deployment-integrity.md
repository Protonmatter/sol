# ADR 0004: CI and deployment integrity

- Status: Accepted
- Date: 2026-07-10

## Context

A static deployment can succeed even when an independent test workflow fails unless the deployment explicitly consumes a tested commit. Mutable remote textures can also make two deployments of the same source SHA differ.

## Decision

1. GitHub Pages deploys only after the `CI` workflow succeeds on `master`.
2. Deployment checks out the exact successful workflow `head_sha`.
3. Rust tests, rustfmt, Clippy, WASM builds, snapshot schemas, semantic validators, deterministic fixture generation, provider compatibility, EOP freshness, and static-web validation are release gates.
4. WASM binaries are built from source during deployment.
5. The deterministic procedural texture path is the default. Mutable remote textures are opt-in through a reviewed repository variable and cannot be required for correctness.
6. Generated cycle-series data is regenerated deterministically and validated during CI and deployment.
7. No release commit may use a workflow skip marker to bypass required checks.

## Consequences

A source SHA cannot reach production through the normal path without its complete validation evidence. Optional mutable assets remain visibly outside the deterministic core artifact.
