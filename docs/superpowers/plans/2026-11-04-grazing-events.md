# Grazing horizon crossings

The local goal is to recover genuine rise/set pairs hidden between the existing
ten-minute samples, preserving the half-open mean-solar-day window, earliest
event convention, true-altitude transit calculation and v3 public interface.
This is numerical correctness within the retained model, not independent event
accuracy or a date-range qualification.

Affected implementation: `crates/solar-ephemeris/src/lib.rs`. Risk: medium;
event output and CPU work change. No new dependencies, network calls or time
allowances are required.

- [x] Reproduce the failure with analytic curves and the actual Sun model in
  an isolated, ignored copy of the current crate.
- [x] Add failing regressions for short above/below-threshold excursions,
  crossing-margin/true-altitude separation, local-day boundaries and the
  reproduced Sun cases.
- [x] Refine otherwise missed crossing-margin extrema, bracket both roots,
  and retain the earliest eligible event of each direction.
- [x] Run targeted/full Rust tests, formatting, clippy and native performance
  comparisons. Check existing transit boundary regressions unchanged.
- [x] Rebuild and stage the WASM candidate; exercise the actual worker and
  contract-boundary behavior within the unchanged deadline.
- [x] Obtain an independent read-only code review, address findings, and
  document commands, evidence and limitations.

Expected commands include `cargo test -p solar-ephemeris --lib`,
`cargo test --workspace`, `cargo fmt --all -- --check`,
`cargo clippy --workspace --all-targets -- -D warnings`, and the existing
`tools/build_wasm.py`, `tools/build_web.py` and browser validation paths.
