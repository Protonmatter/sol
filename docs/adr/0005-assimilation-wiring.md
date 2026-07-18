# ADR 0005: Wiring the assimilation primitive into a real mode

- Status: Proposed (design complete; implementation requires a Rust toolchain session)
- Date: 2026-07-18

## Context

`solar-core` ships a correct, tested diagonal Kalman-style update
(`assimilate_scalar_field`) and the contract reserves `SolarMode::Assimilation` — but no
production path calls it: the CLI cannot attach observation frames to a run,
`br_variance` is initialized to 1.0 and never evolved, and the README (since the docs
truth pass) says plainly "mode not yet wired". For a project whose identity is
claims-match-code, this is the largest remaining gap between the two.

The blocking discovery from the wiring attempt: **the workspace has no JSON reader.**
Every Rust JSON surface is write-only (hand-built strings); the only reader is
`solar-ingest::extract_json_scalar`, a substring scan that is explicitly unfit
(first-occurrence semantics, breaks on escaped quotes, matches keys inside values).
Observation frames (`observation-frame.v1`, produced by `tools/` and `solar-cli ingest`)
are JSON — so wiring assimilation honestly requires a real reader first.

## Decision

1. **A minimal, correct JSON reader (`solar-core/src/json_read.rs`, ~200 lines).**
   Full JSON grammar (objects/arrays/strings with escapes/numbers/bool/null) into a
   small `JsonValue` enum; recursion-depth-capped; `Result<_, JsonError>` everywhere;
   zero dependencies preserved. Fuzz target alongside the blob decoders. This also
   retires `extract_json_scalar` (and its false "normalization supported" quality flag)
   in a follow-up.

2. **CLI surface:** `solar-cli simulate --observations <observations.json>` reads an
   `observation-frame.v1` report. Absent flag → today's behavior, byte-identical
   (the determinism matrix must not notice this change).

3. **Observation operator H (v1 scope: scalar context, not magnetograms).** The frames
   carry scalar space-weather context (cycle indices, wind, field magnitudes) — not
   resolved surface fields — so the honest v1 maps the *activity-relevant scalars* onto
   the model's scalar activity state, NOT onto the Br grid:
   - `y` = observed sunspot-number-derived activity in [0,1] (the same normalization
     `generate_fixture_snapshot.py` documents), from the newest time-ordered value.
   - `H(x)` = the model's activity index; the update corrects activity, birth-rate λ,
     and the confidence field. Painting pseudo-Br onto the grid from scalars would
     fabricate spatial structure — explicitly out of scope until a magnetogram adapter
     exists (ROADMAP v0.4).

4. **Variance evolution:** `br_variance` is renamed in-model to what it now is —
   `activity_variance` — initialized from the frame's freshness-derived R, inflated by
   a per-step model-error term `q_model` each forecast step, contracted by the update
   (`P_a = (1 − K)·P_f`, already implemented). The serializer keeps emitting the v2
   field name until the next schema rev documents the rename.

5. **Mode + readiness truthfully constructed:** with ≥1 usable frame,
   `SolarMode::Assimilation` is constructed and `operational_readiness` reflects the
   actual `source_mode`/`observation_mode` from the request (PR #7 laid this
   groundwork); with zero usable frames the run **stays** `Synthetic` and says so in
   `warnings` — degraded-input honesty over mode inflation.

6. **Freshness gating is data, not policy:** `freshness_gain` comes from the frame's
   recorded ages against the same limits `evaluate_freshness` uses in Python — one
   constant table, mirrored into Rust with a cross-language test (the Python validator
   already checks emitted snapshots, closing the loop in CI).

## Test plan (all in the same PR as the implementation)

- JSON reader: unit tests incl. escape/nesting/pathological inputs + fuzz target.
- Round-trip: `solar-cli ingest swpc --fallback-fixtures` → `simulate --observations` →
  `tools/validate_snapshot.py` in CI (extends the existing determinism-compare job).
- Physics: assimilation with a fresh frame moves activity toward `y` by exactly
  `freshness_gain·K·r`; a stale frame (beyond limits) is a no-op that stays Synthetic;
  variance never increases through an update; determinism — same frame twice →
  byte-identical snapshots on the 3-OS matrix.
- Contract: `SolarMode::Assimilation` snapshots pass schema + semantic validators;
  `observation_mode` mirrors the frames actually used.

## Consequences

- The README's "assimilation primitive (mode not yet wired)" section flips to a
  documented mode with the same equations, and the claims-match-code gap closes.
- The JSON reader unlocks retiring the fragile scanner in `solar-ingest` and future
  adapters (GOES XRS, magnetograms) without new dependencies.
- v1 deliberately corrects only scalar activity — the Br grid remains synthetic and
  labelled synthetic. Spatial assimilation waits for real magnetogram frames; saying
  otherwise would be the exact overstatement this project refuses to make.
