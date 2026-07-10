# ADR 0001: Native ES modules and raw WebAssembly

- Status: Accepted
- Date: 2026-07-10
- Supersedes: the Vite + TypeScript implementation choice in `WEB_REDESIGN_SPEC.md`

## Context

Sol must remain hostable as static files, work offline after assets are cached, and run the audited Rust engines in browsers without a Node runtime. The original redesign RFC selected Vite + TypeScript, but the implemented product evolved around native browser ES modules and two raw `wasm32-unknown-unknown` modules.

## Decision

1. The production frontend uses native ES modules with no runtime bundler.
2. Browser-facing modules remain dependency-free unless a later ADR changes that constraint.
3. Rust/WASM uses a small explicit C ABI and UTF-8 JSON snapshots as the trust boundary.
4. Node is a CI validation tool only. `apps/web/package.json` declares `type=module` so browser and CI parsing semantics match.
5. JSON Schema and runtime guards, rather than generated TypeScript alone, enforce data contracts across Rust, Python, WASM, and remote providers.

## Consequences

- Static deployment remains simple and reproducible.
- Cache-bust stamping is content-derived and validated in CI.
- Large modules must be kept maintainable through focused ES-module boundaries and JSDoc types.
- A future bundler or TypeScript migration requires a new ADR and must preserve the snapshot boundary and static deployment output.
